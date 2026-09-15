/**
 * @file THE COLD MILL AGC — the plant, shared by every test that drives it.
 *
 * Extracted from `rollmill.test.mjs` when a second test needed the same plant. Duplicating a
 * plant is exactly how two copies drift apart, which this project has paid for before; the
 * narrative for every number, and the rig's own validation, stays in `rollmill.test.mjs`.
 */

import { tick } from './meter.mjs';
// --------------------------------------------------------------------------- plant
const MM = 500;            // mill modulus, kN/mm
const QM = 250;            // material modulus, kN/mm
const H0 = 2.0;            // entry gauge, mm
const HREF = 1.5;          // target exit gauge, mm
const DT = 0.002;          // s per step  (500 Hz)
const TAU_A = 0.02;        // hydraulic capsule small-signal lag, s
const V_LINE = 5.0;        // m/s line speed
const L_GAUGE = 1.0;       // m from roll gap to the X-ray gauge
const DLY = Math.round(L_GAUGE / V_LINE / DT);          // transport delay, steps
const D_BUR = 1.3;         // backup roll diameter, m
const F_ECC = V_LINE / (Math.PI * D_BUR);               // Hz, roll rotation
const A_ECC = 0.030;       // eccentricity amplitude, mm  (30 microns)
const NOISE = 0.002;       // X-ray gauge noise, mm rms (2 microns)
const S0 = (HREF * (MM + QM) - QM * H0) / MM;
const NOWAND = process.env.NOWANDER === '1';           // gap holding the target

function lcg(s0) { let s = s0 >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
function gauss(r) { const u = Math.max(1e-12, r()); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }

/**
 * A SECOND OPERATING POINT, WHICH IS TARGET 1's QUESTION IN THE FORM A REGULATOR CAN BE ASKED IT
 * (plan §89.2, task #67).
 *
 * This mill's setpoint never moves, so it has no second TRAJECTORY — and CLAUDE.md wrote
 * "not applicable" over that, which is rule 25 exactly. A regulator plainly has a second
 * OPERATING POINT: a different target gauge, a different line speed. `opts` states one, and the
 * quantities that follow from it are DERIVED here rather than carried, because the transport
 * delay and the roll frequency are both functions of the line speed and a mill run at another
 * speed has different ones (rule 31).
 *
 * Unset is byte-identical: every default is the module constant the rig has always used.
 */
function makeMill(seed, opts = {}) {
  const href = opts.href === undefined ? HREF : opts.href;
  const h0 = opts.h0 === undefined ? H0 : opts.h0;
  const vLine = opts.vLine === undefined ? V_LINE : opts.vLine;
  const dly = Math.round(L_GAUGE / vLine / DT);
  const fEcc = vLine / (Math.PI * D_BUR);
  const s0 = (href * (MM + QM) - QM * h0) / MM;
  const rnd = lcg(seed);
  let S = s0, k = 0;
  const buf = [];
  return {
    href, h0, vLine, dly, fEcc, s0,
    h: href, F: QM * (h0 - href), S,
    /** entry gauge wanders slowly — the previous pass's own error, and unmeasured.
     *
     * `NOWANDER=1` HOLDS IT FLAT, which sizes the one component the shipped object cannot
     * express (plan §85). §84.1 measured that `hff` inverts this wander lap by lap and scores
     * itself for it while the DEPLOYED map discards every bit of it — a map of the COMMANDED
     * REFERENCE cannot represent an unmeasured entry-gauge excursion. §84.3 measured its share
     * of the OPEN-LOOP error at 12.96% of the energy. Neither says what share of what the
     * shipped object LEAVES is wander, and that is the number that prices any feedback
     * structure aimed at it. Unset is byte-identical. */
    entryAt(kk) { return NOWAND ? h0
      : h0 + 0.020 * Math.sin(2 * Math.PI * kk * DT / 4.3)
        + 0.012 * Math.sin(2 * Math.PI * kk * DT / 1.9); },
    quiet: false,
    ecc(kk) { return this.quiet ? 0 : A_ECC * Math.sin(2 * Math.PI * fEcc * kk * DT); },
    step(Scmd) {
      tick();
      S += (DT / TAU_A) * (Scmd - S);                    // hydraulic capsule
      const H = this.entryAt(k), e = this.ecc(k);
      this.h = (MM * (S + e) + QM * H) / (MM + QM);
      this.F = QM * (H - this.h);
      this.S = S;
      buf.push(this.h);
      if (buf.length > dly + 2) buf.shift();
      k++;
    },
    /** what the X-ray gauge reports: the truth, late and noisy. */
    gauge() { return (buf.length > dly ? buf[buf.length - 1 - dly] : href) + NOISE * gauss(rnd); },
    /** the gaugemeter's inference, from signals available with no delay at all. */
    hHat() { return this.S + this.F / MM; },
  };
}

const T_RUN = 20000;                                     // 40 s of rolling
function score(runner) {
  const m = makeMill(5);
  for (let i = 0; i < 4000; i++) runner(m, i, true);     // settle, unscored
  let s2 = 0, n = 0, worst = 0;
  for (let i = 0; i < T_RUN; i++) {
    runner(m, i + 4000, false);
    const e = m.h - HREF;
    s2 += e * e; n++;
    worst = Math.max(worst, Math.abs(e));
  }
  return { rms: 1000 * Math.sqrt(s2 / n), worst: 1000 * worst };   // microns
}

// --------------------------------------------------------------------- baselines
const openLoop = score((m) => m.step(S0));

// GAUGEMETER / BISRA: PI on the inferred gauge. Gain from the standard practice of
// closing most but not all of the inferred error each pass through the loop.
function gaugemeter() {
  let I = 0;
  return (m) => {
    const e = HREF - m.hHat();
    I += e * DT;
    m.step(S0 + 1.6 * (e + I / 0.30));
  };
}
const bisra = score(gaugemeter());

// MONITOR AGC: PI on the real gauge, honest but late.
function monitor() {
  let I = 0;
  return (m) => {
    const e = HREF - m.gauge();
    I += e * DT;
    m.step(S0 + 1.2 * (e + I / 0.50));
  };
}
const mon = score(monitor());


export { A_ECC, DLY, DT, D_BUR, F_ECC, H0, HREF, L_GAUGE, MM, NOISE, QM, S0, TAU_A, T_RUN, V_LINE, bisra, gaugemeter, gauss, lcg, makeMill, mon, monitor, openLoop, score };
