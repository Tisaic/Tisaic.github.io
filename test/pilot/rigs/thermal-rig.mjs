/**
 * @file THE THREE-ZONE EXTRUDER BARREL — the plant, shared by every test that drives it.
 *
 * Extracted from `thermal.test.mjs` when a second test needed the same plant. Duplicating a
 * plant is exactly how two copies drift apart, which this project has paid for before; the
 * narrative for every number, and the rig's own validation, stays in `thermal.test.mjs`.
 */
// --------------------------------------------------------------------------- plant
const NZ = 3;
const CAP = 6000;        // J/K per zone
const KH = 12;           // W per % of full power
const HL = 4;            // W/K loss to ambient
const KC = 6;            // W/K conduction between adjacent zones
const RAD = 4e-10;       // eps*sigma*A, W/K^4
const TA0 = 25;          // nominal ambient, degC
const DEAD = 60;         // steps of pure transport delay
const NOISE = 0.35;      // K rms on every thermocouple
const DT = 1;            // s per step

function lcg(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
function gauss(rnd) {
  const u = Math.max(1e-12, rnd()), v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const rad = (T, Ta) => RAD * ((T + 273) ** 4 - (Ta + 273) ** 4);

function makeBarrel(seed) {
  const T = [180, 200, 210];
  const rnd = lcg(seed);
  const buf = [];                       // the delay line, one entry per step
  let k = 0;
  return {
    T,
    ambient(kk) {                       // UNMEASURED and drifting
      // SIZED BELOW THE PROBE'S OWN RESPONSE, and that bound is a measured finding
      // rather than a convenience — see the note at the foot of this file. A drift
      // comparable to the probe corrupts `dc`, and every statistic derived from the
      // probe is normalised by `dc`.
      return TA0 + 0.6 * Math.sin(2 * Math.PI * kk / 9300) + 0.4 * Math.sin(2 * Math.PI * kk / 4100);
    },
    step(P) {
      const Ta = this.ambient(k);
      const d = [];
      for (let i = 0; i < NZ; i++) {
        let q = KH * Math.max(0, P[i]) - HL * (T[i] - Ta) - rad(T[i], Ta);
        if (i > 0) q -= KC * (T[i] - T[i - 1]);
        if (i < NZ - 1) q -= KC * (T[i] - T[i + 1]);
        d.push(q / CAP);
      }
      for (let i = 0; i < NZ; i++) T[i] += DT * d[i];
      buf.push(T.slice());
      if (buf.length > DEAD + 2) buf.shift();
      k++;
    },
    /** What the operator's screen shows: delayed, and noisy. */
    read() {
      const src = buf.length > DEAD ? buf[buf.length - 1 - DEAD] : buf[0] || T;
      return src.map((v) => v + NOISE * gauss(rnd));
    },
  };
}
/** Power that holds a profile — closed form, and the engineer's own model. */
function powerFor(Tset) {
  return Tset.map((t, i) => {
    let q = HL * (t - TA0) + rad(t, TA0);
    if (i > 0) q += KC * (t - Tset[i - 1]);
    if (i < NZ - 1) q += KC * (t - Tset[i + 1]);
    return q / KH;
  });
}
/** Steady temperatures for a held power vector — Gauss-Seidel, the same model inverted. */
function tempsAt(P) {
  const T = [180, 200, 210];
  for (let it = 0; it < 200; it++) {
    for (let i = 0; i < NZ; i++) {
      let num = KH * Math.max(0, P[i]) + HL * TA0 - rad(T[i], TA0);
      let den = HL;
      if (i > 0) { num += KC * T[i - 1]; den += KC; }
      if (i < NZ - 1) { num += KC * T[i + 1]; den += KC; }
      T[i] = num / den;
    }
  }
  return T;
}

// ------------------------------------------------------------------- the program
// A PRODUCT CHANGEOVER: hold a profile, ramp all three zones to a new one, hold again.
const SEG = 5000, HOLD = 1500;
const RECIPE = [[180, 200, 210], [196, 214, 222], [172, 192, 204], [190, 208, 218]];
const quintic = (t) => t * t * t * (10 + t * (-15 + 6 * t));
function setpointAt(k) {
  const i = Math.min(RECIPE.length - 2, Math.floor(k / SEG));
  const t = (k - i * SEG - HOLD) / (SEG - HOLD);
  const s = t <= 0 ? 0 : t >= 1 ? 1 : quintic(t);
  return RECIPE[i].map((a, j) => a + (RECIPE[i + 1][j] - a) * s);
}
const PROG = SEG * (RECIPE.length - 1);
const PBOX = { lo: 18, hi: 62 };
// THE ENGINEER'S CAP, in percent of full power. Sized against the job: the changeover
// moves the profile by up to 16 K and a zone answers a percent of power with ~0.75 K, so
// a correction worth having is tens of percent. At 12% it pins at the cap and the
// changeover gets WORSE (5.79 → 6.71 K) — the third plant in a row where an
// under-sized cap is indistinguishable from a broken controller.
const UCAP = Number(process.env.UC || 12);


export { CAP, DEAD, DT, HL, KC, KH, NOISE, NZ, PBOX, PROG, RAD, RECIPE, SEG, TA0, UCAP, gauss, lcg, makeBarrel, powerFor, quintic, rad, setpointAt, tempsAt };
