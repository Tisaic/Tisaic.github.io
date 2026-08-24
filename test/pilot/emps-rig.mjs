/**
 * @file THE EMPS RIG — the machine, shared by every test that drives it.
 *
 * Extracted from `emps.test.mjs` when a second test needed the same plant (brick 56).
 * The constants below are measured out of DATA_EMPS.mat and duplicating them is exactly
 * how two copies drift apart, which this project has paid for before. The narrative for
 * every number — where it came from, what it was validated against — stays in
 * `emps.test.mjs`, which is also where the rig is checked against the recorded machine.
 */
// ------------------------------------------------- the machine, from the data file
const GTAU = 35.15065188248547;   // N/V, drive gain            } read out of
const KP = 160.18;                // 1/s, position loop         } DATA_EMPS.mat
const KV = 243.45;                // V/(m/s), velocity loop     }
const DT = 1e-3, VSAT = 10, LSB = 5e-8;   // 1 kHz, ±10 V drive, 0.05 µm encoder
const M1 = 95.0856, FV1 = 205.1170, FC1 = 20.2276, OF1 = -3.1810;   // our IDIM-LS
const PUB = { M: 95.1089, Fv: 203.5034, Fc: 20.3935, OF: -3.1648 }; // published

// THE FRICTION CURVE, binned from the raw record: gtau·vir − M·q̈ against velocity, 61
// bins over ±0.129 m/s (the record's own range), at least 34 samples in every bin.
const VM = 0.129;
const FRICTION = [-47.223, -50.535, -46.504, -48.993, -49.714, -47.69, -46.827, -45.364,
  -45.74, -45.297, -40.27, -40.241, -38.596, -38.308, -38.364, -39.029, -37.695, -35.484,
  -33.997, -32.867, -31.425, -28.341, -27.709, -26.87, -26.2, -25.085, -23.496, -22.582,
  -21.235, -18.707, -0.862, 17.31, 18.966, 20.409, 21.779, 22.694, 23.779, 24.855, 25.264,
  25.571, 27.756, 29.967, 30.85, 30.955, 30.624, 31.025, 32.144, 33.029, 32.981, 34.273,
  33.188, 35.546, 37.757, 38.579, 39.09, 39.609, 38.23, 38.249, 38.361, 40.669, 36.959];
const NB = FRICTION.length;
function fric(v) {
  const x = (v + VM) / (2 * VM) * (NB - 1);
  if (x <= 0) return FRICTION[0] + (v + VM) * FV1;
  if (x >= NB - 1) return FRICTION[NB - 1] + (v - VM) * FV1;
  const i = Math.floor(x), f = x - i;
  return FRICTION[i] * (1 - f) + FRICTION[i + 1] * f;
}

// THE PROGRAM. The recorded reference is a piecewise-constant-acceleration trapezoid
// program; the run lengths come from its second difference and the fifteen accelerations
// from a least-squares fit of the integrated program to the recorded qg. It reproduces
// the recorded reference to 1.18e-5 m peak over the lap — 2% of the tracking error it is
// used to measure, and identical for every controller here, so it cannot favour one.
const P = 6240;
const RUNS = [35, 351, 50, 1, 98, 687, 98, 1, 148, 1035, 148, 1, 50, 351, 101, 351, 50, 1,
  98, 687, 98, 1, 148, 1035, 148, 1, 50, 351, 66];
const ACC = [0.819696, -0.826876, 0.834499, -0.834589, 0.837223, -0.83719, 0.827038,
  -0.834201, 0.827215, -0.834609, 0.834591, -0.837223, 0.837141, -0.826781, 0.827378];
const Q0 = 1.078221e-4, V0 = 1.343255e-2;
function program() {
  const a = new Float64Array(P), q = new Float64Array(P), v = new Float64Array(P);
  let i = 0, ai = 0, on = true;
  for (const len of RUNS) { const val = on ? ACC[ai++] : 0; for (let j = 0; j < len; j++) a[i++] = val; on = !on; }
  let x = Q0, vv = V0;
  for (let k = 0; k < P; k++) { q[k] = x; v[k] = vv; vv += a[k] * DT; x += vv * DT; }
  return { q, v, a };
}
const PR = program();

/**
 * The axis. `ff` is what the DRIVE does with the reference it is handed — 0 none,
 * 1 velocity feedforward, 2 also inverse-dynamics feedforward at the identified
 * parameters. The derivatives come from the reference itself, as a real interpolator's
 * do, so a correction injected into the reference is fed forward the same way the
 * program is and the pilot commissions on exactly the machine it deploys on.
 */
function makeMachine(q0, ff = 0) {
  const e0 = Math.round(q0 / LSB) * LSB;
  return {
    q: q0, v: 0, qp: e0, qb1: e0, r1: q0, vd1: 0, ff,
    step(ref) {
      const qe = Math.round(this.q / LSB) * LSB;
      const qb = 0.5 * (qe + this.qp), dq = (qb - this.qb1) / DT;
      this.qb1 = qb; this.qp = qe;
      const vd = (ref - this.r1) / DT, ad = (vd - this.vd1) / DT;
      let volts = 0;
      if (this.ff >= 1) volts += KV * vd;
      if (this.ff >= 2) volts += (M1 * ad + FV1 * vd + FC1 * Math.sign(vd) + OF1) / GTAU;
      this.r1 = ref; this.vd1 = vd;
      let u = KV * (KP * (ref - qe) - dq) + volts;
      u = Math.max(-VSAT, Math.min(VSAT, u));
      this.v += DT * (GTAU * u - fric(this.v)) / M1;
      this.q += DT * this.v;
      return u;
    },
  };
}


export { NB, GTAU, KP, KV, DT, VSAT, LSB, M1, FV1, FC1, OF1, PUB, VM, FRICTION, fric,
  P, RUNS, ACC, Q0, V0, program, PR, makeMachine };
