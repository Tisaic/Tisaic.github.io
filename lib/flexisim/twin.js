/**
 * @file The bench arm's TWIN PARAMETERS: fills `TWIN_2R`'s parameter vector (`lib/autoff/twin2r.js`)
 * from what a machine builder knows — the links' masses and lengths (CAD), the drives' ratio, motor
 * inertia and envelope, the conventional controller's gains and compliance calibration — and from
 * what commissioning identifies: the gearbox stiffness, a payload, the gearbox's stiffening and the
 * links' modes.
 *
 * `ident` is `{ K, payload, stiff, fit }`:
 *   K        gearbox stiffness (both joints; the joint damping follows it as `buildArm` sets it)
 *   payload  a point mass at the tool, as a fraction of the two links' mass
 *   stiff    the gearbox's stiffening, as the fractional rise of K at joint 1's gravity-hold wind-up
 *   fit      the links' modes: [w1, s1, w2], each { ms: [[w, z], ...], x: gains [mode * nu + input], nu }
 *            (w1 and s1 share link 1's modes; inputs are link 1 [gy, alpha], link 2 [gy, alpha, elbow])
 */
import { TW, twinNewParams, AFF_TW_MAX_MODES } from '../autoff/twin2r.js';

export function twinParams(m, rc, ident) {
  const a = m.arm, P = twinNewParams(), { K, payload = 0, stiff = 0, fit } = ident;
  P[TW.L1] = a.L1; P[TW.L2] = a.L2; P[TW.M1] = a.m1; P[TW.M2] = a.m2; P[TW.C1] = a.c1; P[TW.C2] = a.c2;
  P[TW.J1] = a.J1; P[TW.J2] = a.J2; P[TW.GX] = a.gWorld[0]; P[TW.GY] = a.gWorld[1];
  P[TW.PAYLOAD] = payload * (a.m1 + a.m2);
  const hold = Math.abs(a.gravityTorque([0, 0])[0]);
  const comp = rc.compliance;
  [a.j1, a.j2].forEach((j, i) => {
    const o = TW.J0 + 8 * i, Jl = i === 0 ? a.J1 : a.J2;
    P[o + TW.N] = j.N; P[o + TW.JM] = j.Jm; P[o + TW.K0] = K;
    P[o + TW.BETA] = stiff > 0 ? stiff * K / hold : 0;
    P[o + TW.C] = 2 * Math.sqrt(K * Jl / 2); P[o + TW.B] = j.b;
    P[o + TW.KP] = m.servo.gains[i].kp; P[o + TW.KD] = m.servo.gains[i].kd;
  });
  P[TW.TAU_MAX] = m.servo.tauMax; P[TW.SPEED_MAX] = m.servo.speedMax;
  P[TW.COMP1] = comp[0]; P[TW.COMP2] = comp[1];
  const [f1, s1, f2] = fit;
  if (f1.ms.length > AFF_TW_MAX_MODES || f2.ms.length > AFF_TW_MAX_MODES) throw new Error(`twinParams: at most ${AFF_TW_MAX_MODES} modes per link`);
  P[TW.NM1] = f1.ms.length; P[TW.NM2] = f2.ms.length;
  f1.ms.forEach(([w, z], k) => { const o = TW.M1_0 + 6 * k; P[o] = w; P[o + 1] = z;
    P[o + 2] = f1.x[2 * k]; P[o + 3] = f1.x[2 * k + 1]; P[o + 4] = s1.x[2 * k]; P[o + 5] = s1.x[2 * k + 1]; });
  f2.ms.forEach(([w, z], k) => { const o = TW.M2_0 + 5 * k; P[o] = w; P[o + 1] = z;
    P[o + 2] = f2.x[3 * k]; P[o + 3] = f2.x[3 * k + 1]; P[o + 4] = f2.x[3 * k + 2]; });
  return P;
}

/**
 * THE BENCH CELL'S TWIN, identified from the tool alone on the nominal bench arm (K 0.25 / E 0.03) by
 * `test/plants/ilc-tables/experiments/twin/rident3.mjs`: 40,000 scans of excitation, the physics
 * searched against a bank of modes, then two modes per link. It misses the machine's held-out tool
 * error by 6.1%. It belongs to that plant: on another K or E it is not this machine's twin.
 */
export const BENCH_TWIN = Object.freeze({
  K: 0.25, E: 0.03,
  ident: { K: 0.27286056611073795, payload: 0, stiff: 0, fit: [
    { ms: [[0.0028188041817804274, 0.6], [0.0033825650181365124, 0.3]], x: [1.0596139306951513, -10.163625338723682, 0.04844653227809898, -2.9886491342946657], nu: 2 },
    { ms: [[0.0028188041817804274, 0.6], [0.0033825650181365124, 0.3]], x: [0.10971251054758382, -0.958090379166964, -0.01127401517086048, -0.3119658348462364], nu: 2 },
    { ms: [[0.005845072351339893, 0.3], [0.004870893626116577, 0.3]], x: [-1.9453710140088838, -11.625868409265047, -1.5351763029587278, 2.0518658678421025, 1.7509281945351327, 0.2396056570576568], nu: 3 }] },
});
