// DOES REDUNDANCY REJECT COMMON-MODE NOISE? A sensor-count ladder.
//
// `noise-structure.mjs` measured something it did not expect: with twelve wall
// taps a coherent shift across every pressure channel is roughly HALF as damaging
// as independent noise of the same per-channel size, and the trained readout's
// exact gain along the common direction is 0.38x its gain along a random one.
//
// A FIRST VERSION OF THIS LADDER WAS CONFOUNDED AND IS THE REASON THE SPAN IS
// NOW FIXED. It built each count by taking the first n of twelve taps, so the
// low-count arms were all clustered UPSTREAM -- and this project's own layout
// study measured upstream as the worst of six placements, worth 2.4x. The clean
// score came out non-monotone in the sensor count, which is the tell: adding
// sensors cannot make a reconstruction worse, so something other than the count
// was moving. The record now carries twelve taps per wall over a fixed span and
// every count subsamples it EVENLY, so the layout is held and only the density
// changes.
//
// AND IT CORRECTS A SECOND ERROR. Two different perturbations were both being
// called "common mode":
//
//   ABSOLUTE  the same physical offset on every transducer. This is what a shared
//             temperature coefficient does, and it is NOT uniform in the
//             estimator's coordinates: standardisation divides by each channel's
//             own spread, so a quiet tap receives the larger kick.
//   RELATIVE  an offset proportional to each channel's own spread, i.e. uniform
//             AFTER standardisation. Physically arbitrary, but it holds the
//             per-channel signal-to-noise ratio equal, which is the cleaner
//             control against independent noise.
//
// The analytic section used the first and the replay used the second. Both are
// run here, both energy-matched in standardised coordinates against independent
// noise, so a "worse" row cannot simply be a bigger one.
import { dyeStream, fieldNrmse, rng } from './dye-stream.mjs';
import { FieldReconstructor } from '../lib/probesense/sensor.js';

const SAMPLES = 1600, WARMUP = 200, TRAIN_END = 1200, PER_WALL = 12;
const ETA = +(process.env.ETA || 0.1);
const f = (v, d = 4) => (Number.isFinite(v) ? +v.toFixed(d) : null);

const S = await dyeStream({ samples: SAMPLES, perWall: PER_WALL });
const K = S.target.length;
const rhoStd = S.rhoSlots.map((i) => S.std[i]);
console.log(JSON.stringify({ size: S.size, taps: S.sensors.length, locations: K,
  pressureStdMin: +Math.min(...rhoStd).toExponential(2),
  pressureStdMax: +Math.max(...rhoStd).toExponential(2),
  pressureStdRatio: f(Math.max(...rhoStd) / Math.min(...rhoStd), 2) }));

/**
 * Channels for `n` taps, EVENLY SPACED over the recorded span on both walls.
 * The span is what the first version failed to hold fixed.
 */
function tapChannels(n) {
  const perWall = n >> 1, taps = [];
  for (let w = 0; w < 2; w++) {
    for (let j = 0; j < perWall; j++) {
      const idx = perWall === 1 ? 0 : Math.round(j * (PER_WALL - 1) / (perWall - 1));
      taps.push(w * PER_WALL + idx);
    }
  }
  const ch = [];
  for (const t of [...new Set(taps)].sort((a, b) => a - b)) ch.push(3 * t, 3 * t + 1, 3 * t + 2);
  return ch;
}

function trainClean(chans) {
  const m = new FieldReconstructor({ nSignals: chans.length, nLocations: K,
    lag: 1, stride: 1, warmup: WARMUP, expand: false, ridge: 100, lam: 1.0 });
  for (let t = 0; t < TRAIN_END; t++) {
    m.push(chans.map((c) => S.sig[t][c]));
    m.observe(S.truth[t]);
  }
  return m;
}

/** Spatial spread of the truth over the score window: nRMSE's denominator. */
let SD = 0;
{
  let n = 0;
  for (let t = TRAIN_END; t < SAMPLES; t++) {
    const y = S.truth[t];
    let m = 0; for (const v of y) m += v; m /= K;
    for (const v of y) SD += (v - m) ** 2;
    n++;
  }
  SD = Math.sqrt(SD / n);
}

/** Added field nRMSE per unit standardised sensor perturbation along `dir`. */
function gainOf(model, p) {
  return (dir) => {
    let norm = 0; for (const v of dir) norm += v * v;
    norm = Math.sqrt(norm);
    let acc = 0;
    for (let k = 0; k < K; k++) {
      const th = model.theta[k].m;
      let r = 0;
      for (let i = 0; i < p; i++) r += dir[i] * th[i + 1];
      acc += (model._tStd[k] * r) ** 2;
    }
    return Math.sqrt(acc) / (norm * SD);
  };
}

console.log(`\nLADDER, linear basis, eta ${ETA}. Gains analytic; nRMSE replayed.`);
const rows = [];
for (const nTaps of [4, 6, 8, 12, 16, 24]) {
  const chans = tapChannels(nTaps);
  const p = chans.length;
  const model = trainClean(chans);
  const gain = gainOf(model, p);
  const rl = [];
  chans.forEach((c, i) => { if (S.rhoSlots.includes(c)) rl.push(i); });

  const dRel = new Float64Array(p);
  for (const i of rl) dRel[i] = 1;
  const dAbs = new Float64Array(p);
  for (const i of rl) dAbs[i] = 1 / S.std[chans[i]];
  // RMS gain over the coordinate basis of the pressure subspace: independent
  // noise is isotropic there, so this is exactly the gain it sees in expectation.
  let rms = 0;
  for (const i of rl) {
    const e = new Float64Array(p); e[i] = 1;
    rms += gain(e) ** 2;
  }
  rms = Math.sqrt(rms / rl.length);

  const nRho = rl.length;
  const scale = (d) => {
    let s = 0; for (const v of d) s += v * v;
    return Math.sqrt(nRho / s);
  };
  const sAbs = scale(dAbs), sRel = scale(dRel);
  const run = (mode, sign = 1) => {
    const g = rng(7);
    const held = Math.abs(g());
    const out = [];
    for (let t = TRAIN_END; t < SAMPLES; t++) {
      const row = chans.map((c) => S.sig[t][c]);
      if (mode !== 'clean') {
        const shared = mode.startsWith('drift') ? sign * held : g();
        for (let j = 0; j < nRho; j++) {
          const i = rl[j], sd = S.std[chans[i]];
          let v;                                   // standardised perturbation
          if (mode === 'indep') v = ETA * g();
          else if (mode === 'common-rel') v = ETA * shared * dRel[i] * sRel;
          else v = ETA * shared * dAbs[i] * sAbs;  // common-abs, drift+, drift-
          row[i] += v * sd;                        // back to physical units
        }
      }
      model.push(row);
      const est = model.estimate();
      if (est) out.push(fieldNrmse(est, S.truth[t]));
    }
    return out.reduce((a, b) => a + b, 0) / Math.max(1, out.length);
  };

  const r = { taps: nTaps, clean: f(run('clean')),
    gainAbs: f(gain(dAbs), 3), gainRel: f(gain(dRel), 3), gainRms: f(rms, 3),
    ratioAbs: f(gain(dAbs) / rms, 2), ratioRel: f(gain(dRel) / rms, 2),
    indep: f(run('indep')), commonRel: f(run('common-rel')), commonAbs: f(run('common-abs')),
    driftPlus: f(run('drift+', +1)), driftMinus: f(run('drift-', -1)) };
  rows.push(r);
  console.log(`  taps ${String(nTaps).padStart(2)}  clean ${r.clean.toFixed(4)}` +
    `  | gain abs ${String(r.gainAbs).padStart(6)} rel ${String(r.gainRel).padStart(6)}` +
    ` rms ${String(r.gainRms).padStart(6)}  ratio abs ${String(r.ratioAbs).padStart(5)}` +
    ` rel ${String(r.ratioRel).padStart(5)}`);
  console.log(`           indep ${r.indep.toFixed(4)}  common-rel ${r.commonRel.toFixed(4)}` +
    `  common-abs ${r.commonAbs.toFixed(4)}  drift+ ${r.driftPlus.toFixed(4)}` +
    `  drift- ${r.driftMinus.toFixed(4)}`);
}

console.log('\nVERDICTS');
console.log('  clean score must fall with the tap count; if it does not, the ladder is');
console.log('  measuring something other than the count:');
console.log('    ' + rows.map((r) => `${r.taps}:${r.clean.toFixed(4)}`).join('  '));
console.log('\n  correlated-vs-independent DAMAGE ratio (>1 = correlated noise is worse,');
console.log('  which is the claim under test). Predicted from the analytic gain, then');
console.log('  measured by replay -- agreement means the cheap instrument is valid:');
for (const r of rows) {
  console.log(`    taps ${String(r.taps).padStart(2)}  predicted ${String(r.ratioAbs).padStart(5)} (abs) / ` +
    `${String(r.ratioRel).padStart(5)} (rel)   measured ` +
    `${f((r.commonAbs - r.clean) / (r.indep - r.clean), 2)} (abs) / ` +
    `${f((r.commonRel - r.clean) / (r.indep - r.clean), 2)} (rel)`);
}
console.log('\n  DRIFT IS SIGNED. A sign-dependent result means the offset is being');
console.log('  reconstructed as a coherent field mode rather than averaged away --');
console.log('  which is the aliasing mechanism, whatever the size of it:');
for (const r of rows) {
  console.log(`    taps ${String(r.taps).padStart(2)}  clean ${r.clean.toFixed(4)}  ` +
    `drift+ ${r.driftPlus.toFixed(4)} (${((r.driftPlus / r.clean - 1) * 100).toFixed(1)}%)  ` +
    `drift- ${r.driftMinus.toFixed(4)} (${((r.driftMinus / r.clean - 1) * 100).toFixed(1)}%)`);
}
