/**
 * @file FB_AutoFF — THE RUNTIME HALF: what runs on every scan, for ever, after commissioning.
 *
 * This file is the deployed object of `FB_AutoFF` and nothing else. It is written as the ST port
 * will be written, so that the port is a transliteration and not a redesign:
 *
 *   - every quantity is an LREAL (IEEE-754 binary64 = JS `number`), every array a fixed-size
 *     `Float64Array` sized by the constants below, allocated ONCE with the record, never in a scan;
 *   - arrays are ROW-MAJOR and flat (`W[c * STRIDE + j]`), the TC_NGRC header-first convention;
 *   - no closures, no objects created per call, no recursion, no exceptions on the scan path —
 *     a bad input degrades to NO CORRECTION, never to a thrown error or a NaN on the machine;
 *   - it imports nothing, so the deploy boundary is checkable by construction (rule 30);
 *     `test/inventory.test.mjs` and `test/autoff/contract.test.mjs` both assert it.
 *
 * WHAT IT COMPUTES. Per channel c, on the COMMANDED reference and the position in the lap (no
 * measured signal, no clock):
 *
 *     trim_c = clamp( g_conv * W_conv[c] . b(v, a)  +  g_learn * cov(speed) * W_learn[c] . f(taps)
 *                     + g_prog * U[k, c],  ±uMax_c )
 *
 *   b  the conventional rung's basis: per channel [a, v, sign v], then a bias, each divided by the
 *      unit-peak scale the commissioning measured on the production lap (`motionBasis`'s convention);
 *   f  the learned map's features: the reference now, the reference at each window offset minus the
 *      reference now, and a bias, each divided by a scale derived from the production envelope;
 *   cov  1 inside the reference-speed span the fit saw, a smoothstep to 0 outside it (it FADES rather
 *      than extrapolating — plan §52.40);
 *   U  the program table: a correction for each scan k of the ONE program it was learned on. It is
 *      correct only on that program, so `g_prog` is the caller's guard: 1 while the reference has
 *      matched the stored program — now and as far ahead as the table reaches — at every scan of
 *      this lap and the whole of the lap before (`affProgMatch`), else 0. On any other program the
 *      first two terms are what runs.
 *
 * A non-finite result on any channel is replaced by 0 (plan §77.4: every comparison with NaN is
 * false, so a naive clamp passes it through).
 */

/** Record format version. Bump on ANY change to the flattened layout below. */
export const AFF_VERSION = 2;
/** Compile-time maxima, as an ST port declares them. */
export const AFF_MAX_CH = 4;                                  // channels
export const AFF_MAX_NB = 3 * AFF_MAX_CH + 1;                 // conventional basis rows (13)
export const AFF_MAX_OFFS = 21;                               // window taps (the SHAPE gives <= 21)
export const AFF_MAX_FEAT = AFF_MAX_OFFS * AFF_MAX_CH + 1;    // learned features (85)
export const AFF_MAX_LAP = 65536;                             // scans per production lap (the program table's length)

/**
 * THE WINDOW'S SHAPE, as fractions of the reach — the same geometric ladder `distilkit.deriveWindow`
 * uses on every plant in this project, so the block's window is the one the record measured.
 */
export const AFF_SHAPE = [0, 0.008, 0.016, 0.031, 0.063, 0.125, 0.219, 0.344, 0.5, 0.719, 1];

/**
 * ST_AFF_Record — THE CONTROLLER. Everything a machine needs to run the deployed trim, and nothing
 * it does not. Allocated at the compile-time maxima so the layout matches the ST struct.
 */
export function affNewRecord() {
  return {
    nVersion: AFF_VERSION,
    nChannels: 0,
    udiKey: 0,                         // the engineer's plant key (loop tuning, machine id)
    nLap: 0,                           // production lap length, scans (sets the bumpless ramp)
    aUMax: new Float64Array(AFF_MAX_CH),
    aBaseRms: new Float64Array(AFF_MAX_CH),   // the machine as it arrived, per channel
    rBestScore: 0,                     // commissioned score, normalised to the baseline (1 = bare)
    // ---- the conventional rung
    xConvArmed: 0,
    nConvBasis: 0,
    aConvScale: new Float64Array(AFF_MAX_NB),
    aConvW: new Float64Array(AFF_MAX_CH * AFF_MAX_NB),
    rConvGain: 1,
    // ---- the learned map
    xLearnArmed: 0,
    nOffsets: 0,
    aOffsets: new Float64Array(AFF_MAX_OFFS),  // integers, stored as LREAL so the record is one type
    nFeat: 0,
    aXScale: new Float64Array(AFF_MAX_FEAT),
    aLearnW: new Float64Array(AFF_MAX_CH * AFF_MAX_FEAT),
    rLearnGain: 1,
    rSpeedLo: 1, rSpeedHi: 0,          // lo > hi means "no span recorded": the guard reads 1
    rFade: 0.25,
    // ---- the program table: a correction per scan of ONE program, applied only while that program runs
    xProgArmed: 0,
    nProgLap: 0,                       // the commissioned lap's length, scans
    rProgTol: 0,                       // largest reference difference that still counts as the same program
    nProgAhead: 0,                     // how far ahead the table's correction reaches, scans
    aProgRef: new Float64Array(AFF_MAX_LAP * AFF_MAX_CH),   // the commissioned program, row-major [k * CH + c]
    aProgU: new Float64Array(AFF_MAX_LAP * AFF_MAX_CH),     // the learned correction, same layout
    udiChecksum: 0,
  };
}

/**
 * Copy every field of `src` into `dst` (both from `affNewRecord`). No allocation. Of the program
 * table only the USED part is copied (`affProgUsed`): what lies past it is never read.
 */
export function affCopyRecord(dst, src) {
  for (const k of Object.keys(src)) {
    const v = src[k];
    if (k === 'aProgRef' || k === 'aProgU') { const d = dst[k], n = affProgUsed(src); for (let i = 0; i < n; i++) d[i] = v[i]; }
    else if (v instanceof Float64Array) dst[k].set(v); else dst[k] = v;
  }
  return dst;
}

/** How many entries of each program-table array the record uses: none unless it is armed. */
export function affProgUsed(rec) {
  const n = rec.xProgArmed ? rec.nProgLap : 0;
  return n > 0 && n <= AFF_MAX_LAP ? n * AFF_MAX_CH : 0;
}

/**
 * THE FLATTENED RECORD, in a fixed order — what the checksum covers and what a PLC writes to
 * retentive memory. Returns the count written into `out` (sized `affFlatSize()`, the largest it can
 * be): the program table contributes only its used part, so the count follows `nProgLap`, which the
 * checksum itself covers.
 */
export function affFlatten(rec, out) {
  let i = 0;
  const put = (v) => { out[i++] = v; };
  put(rec.nVersion); put(rec.nChannels); put(rec.udiKey); put(rec.nLap);
  for (let c = 0; c < AFF_MAX_CH; c++) put(rec.aUMax[c]);
  for (let c = 0; c < AFF_MAX_CH; c++) put(rec.aBaseRms[c]);
  put(rec.rBestScore);
  put(rec.xConvArmed); put(rec.nConvBasis);
  for (let j = 0; j < AFF_MAX_NB; j++) put(rec.aConvScale[j]);
  for (let j = 0; j < AFF_MAX_CH * AFF_MAX_NB; j++) put(rec.aConvW[j]);
  put(rec.rConvGain);
  put(rec.xLearnArmed); put(rec.nOffsets);
  for (let j = 0; j < AFF_MAX_OFFS; j++) put(rec.aOffsets[j]);
  put(rec.nFeat);
  for (let j = 0; j < AFF_MAX_FEAT; j++) put(rec.aXScale[j]);
  for (let j = 0; j < AFF_MAX_CH * AFF_MAX_FEAT; j++) put(rec.aLearnW[j]);
  put(rec.rLearnGain); put(rec.rSpeedLo); put(rec.rSpeedHi); put(rec.rFade);
  put(rec.xProgArmed); put(rec.nProgLap); put(rec.rProgTol); put(rec.nProgAhead);
  const nt = affProgUsed(rec);
  for (let j = 0; j < nt; j++) put(rec.aProgRef[j]);
  for (let j = 0; j < nt; j++) put(rec.aProgU[j]);
  return i;
}

/** The largest flattened length, a compile-time constant of the layout. */
export function affFlatSize() {
  return 4 + 2 * AFF_MAX_CH + 1 + 2 + AFF_MAX_NB + AFF_MAX_CH * AFF_MAX_NB + 1
    + 2 + AFF_MAX_OFFS + 1 + AFF_MAX_FEAT + AFF_MAX_CH * AFF_MAX_FEAT + 4
    + 4 + 2 * AFF_MAX_LAP * AFF_MAX_CH;
}

const _ckBuf = new DataView(new ArrayBuffer(8));
/**
 * FNV-1a (32-bit) over the IEEE-754 BYTES of every flattened LREAL, little-endian — EXACT, not a
 * quantised value, so a single flipped bit in any weight changes it. In ST: MEMCPY each LREAL into
 * an ARRAY[0..7] OF BYTE and run the same loop; the multiply is modulo 2^32 (`Math.imul`).
 */
export function affChecksum(flat, n) {
  let h = 0x811c9dc5;
  for (let i = 0; i < n; i++) {
    _ckBuf.setFloat64(0, flat[i], true);
    for (let b = 0; b < 8; b++) {
      h ^= _ckBuf.getUint8(b);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h >>> 0;
}

/**
 * THE REFERENCE SPEED the coverage guard reads: the Euclidean norm of each channel's velocity
 * divided by that channel's production peak (`aConvScale[3c + 1]`, stored in the record) — so
 * channels in different units are commensurate, and the fit and the deployment compute it the
 * same way because both call this. Returns the speed (dimensionless; 1 = production peak).
 */
export function affSpeed(rec, aV) {
  let s2 = 0;
  for (let c = 0; c < rec.nChannels; c++) {
    const sc = rec.aConvScale[3 * c + 1];
    const v = sc > 0 ? aV[c] / sc : 0;
    s2 += v * v;
  }
  return Math.sqrt(s2);
}

/** Smoothstep — the one nonlinearity, so the coverage guard cannot switch discontinuously. */
function smooth(t) { return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); }

/** The coverage gain: 1 inside [rSpeedLo, rSpeedHi], fading to 0 over rFade of the span beyond. */
export function affCoverage(rec, rSpeed) {
  const lo = rec.rSpeedLo, hi = rec.rSpeedHi;
  if (!(hi >= lo) || !Number.isFinite(rSpeed)) return 1;
  if (rSpeed >= lo && rSpeed <= hi) return 1;
  const m = Math.max(1e-12, (hi - lo) * rec.rFade);
  return rSpeed < lo ? smooth((rSpeed - (lo - m)) / m) : smooth(((hi + m) - rSpeed) / m);
}

/**
 * THE CONVENTIONAL RUNG'S BASIS at one sample, into `aB` (length >= nConvBasis). Rows per channel
 * d: [a_d, v_d, sign v_d], then a bias — `motionBasis`'s order — each divided by its stored scale.
 * Returns the MAC count.
 */
export function affBasis(nc, aScale, aV, aA, aB) {
  let j = 0;
  for (let d = 0; d < nc; d++) {
    aB[j] = aA[d] / aScale[j]; j++;
    aB[j] = aV[d] / aScale[j]; j++;
    aB[j] = (aV[d] > 0 ? 1 : aV[d] < 0 ? -1 : 0) / aScale[j]; j++;
  }
  aB[j] = 1 / aScale[j]; j++;
  return j;
}

/**
 * THE LEARNED MAP'S FEATURES from a tap vector, into `aF` (length >= nFeat). `aTap` holds the
 * reference at each stored offset, row-major `aTap[i * AFF_MAX_CH + d]`, i over the offsets in
 * ascending order; `iZero` is the index of offset 0. Every term is a DIFFERENCE against the
 * reference now except that reference itself and the bias, so the row is invariant to where the
 * program sits (which is why it transfers). Returns the feature count.
 */
export function affFeatures(nc, nOffsets, iZero, aXScale, aTap, aF) {
  let j = 0;
  const z = iZero * AFF_MAX_CH;
  for (let d = 0; d < nc; d++) { aF[j] = aTap[z + d] / aXScale[j]; j++; }
  for (let i = 0; i < nOffsets; i++) {
    if (i === iZero) continue;
    const b = i * AFF_MAX_CH;
    for (let d = 0; d < nc; d++) { aF[j] = (aTap[b + d] - aTap[z + d]) / aXScale[j]; j++; }
  }
  aF[j] = 1 / aXScale[j]; j++;
  return j;
}

/** Index of offset 0 in the record's ascending offset list (-1 if absent, which the fit refuses). */
export function affZeroIndex(rec) {
  for (let i = 0; i < rec.nOffsets; i++) if (rec.aOffsets[i] === 0) return i;
  return -1;
}

/**
 * IS THE PROGRAM RUNNING THE ONE THE TABLE WAS LEARNED ON? True when the phase lies inside the
 * commissioned lap and every channel's reference equals the stored one within `rProgTol`, both NOW
 * and at the preview offset the table's correction reaches (`nProgAhead`, capped by the preview the
 * host supplies, `nAhead`; past the lap's end the program is read as starting again). Checked on
 * every scan, the second comparison sees a divergence coming before the table acts on it. The table
 * is a correction indexed by position in ONE program, so on any other program it would be applied
 * at the wrong place; the caller turns it off the moment this reads false. `aRefAhead` is the
 * block's preview, row-major `[i * AFF_MAX_CH + c]`, i = 0 now.
 */
export function affProgMatch(rec, iPhase, aRefAhead, nAhead) {
  const n = rec.nProgLap;
  if (!rec.xProgArmed || iPhase < 0 || iPhase >= n) return false;
  const ahead = rec.nProgAhead < nAhead ? rec.nProgAhead : nAhead;
  for (let pass = 0; pass < 2; pass++) {
    const i = pass === 0 ? 0 : ahead, o = ((iPhase + i) % n) * AFF_MAX_CH;
    for (let c = 0; c < rec.nChannels; c++) {
      if (!(Math.abs(aRefAhead[i * AFF_MAX_CH + c] - rec.aProgRef[o + c]) <= rec.rProgTol)) return false;
    }
  }
  return true;
}

/**
 * THE DEPLOYED DECISION. Writes the per-channel trim into `aOut` and returns the MAC count.
 *
 * @param rec     the record
 * @param aTap    reference taps at the record's offsets (ignored if the learned map is not armed)
 * @param aV,aA   reference velocity and acceleration per channel, central differences per scan
 * @param rSpeed  reference speed (Euclidean norm of aV) for the coverage guard
 * @param iPhase  scan index within the commissioned program's lap (-1: not known)
 * @param rProgGain  the program table's gain in [0, 1] — the caller's guard (see `affProgMatch`)
 * @param aB,aF   scratch, sized AFF_MAX_NB and AFF_MAX_FEAT (owned by the caller: no allocation)
 * @param aOut    the trim, per channel
 */
export function affDecide(rec, aTap, aV, aA, rSpeed, iPhase, rProgGain, aB, aF, aOut) {
  const nc = rec.nChannels;
  let mac = 0;
  for (let c = 0; c < AFF_MAX_CH; c++) aOut[c] = 0;
  if (rec.xConvArmed) {
    const nb = affBasis(nc, rec.aConvScale, aV, aA, aB);
    mac += nb;
    for (let c = 0; c < nc; c++) {
      let s = 0;
      const w = c * AFF_MAX_NB;
      for (let j = 0; j < nb; j++) s += rec.aConvW[w + j] * aB[j];
      aOut[c] += rec.rConvGain * s;
      mac += nb;
    }
  }
  if (rec.xLearnArmed) {
    const iz = affZeroIndex(rec);
    const g = rec.rLearnGain * affCoverage(rec, rSpeed);
    if (iz >= 0 && g > 0) {
      const nf = affFeatures(nc, rec.nOffsets, iz, rec.aXScale, aTap, aF);
      mac += nf;
      for (let c = 0; c < nc; c++) {
        let s = 0;
        const w = c * AFF_MAX_FEAT;
        for (let j = 0; j < nf; j++) s += rec.aLearnW[w + j] * aF[j];
        aOut[c] += g * s;
        mac += nf;
      }
    }
  }
  if (rec.xProgArmed && rProgGain > 0 && iPhase >= 0 && iPhase < rec.nProgLap) {
    const o = iPhase * AFF_MAX_CH;
    for (let c = 0; c < nc; c++) aOut[c] += rProgGain * rec.aProgU[o + c];
    mac += nc;
  }
  for (let c = 0; c < nc; c++) {
    const u = aOut[c], cap = rec.aUMax[c];
    aOut[c] = Number.isFinite(u) ? (u > cap ? cap : u < -cap ? -cap : u) : 0;
  }
  return mac;
}
