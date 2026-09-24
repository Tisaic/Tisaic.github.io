/**
 * @file TWIN_2R — a reduced-order twin of a two-axis arm UNDER ITS OWN CONTROL, written as the ST
 * port will be written: flat LREAL arrays, no allocation, no closures, imports nothing.
 *
 * WHY A TWIN. A correction learned on the machine belongs to the one program it was learned on,
 * and every model fitted from data to transfer to other programs capped at 2-3x on the arm, because
 * the arm's modes move with its pose. A correction learned on a TWIN of the arm transfers, since the
 * twin carries the pose dependence in its physics. Measured on the lattice arm, on eight programs
 * none of which it had seen, it gives 6-20x on first use
 * (`test/plants/ilc-tables/experiments/twin/FINDINGS.md`).
 *
 * WHAT IS IN IT, and what each term stands for on a machine:
 *   - the rigid chain: M(q) qdd = tau + g(q) - C(q, qd) qd, semi-implicit Euler, with an optional
 *     point payload at the tool (in the physics only; the drive keeps its configured model);
 *   - two geared joints: motor inertia, ratio, backlash dead zone, a progressive stiffness
 *     K0 (1 + beta |d|) and damping across the gearbox. No friction (measured harmless to the twin);
 *   - the machine's own conventional control, exactly: the setpoint's differences as rate terms, a
 *     compliance pre-distortion dq = c . tau(ref), the drive's inverse dynamics at the pre-distorted
 *     reference, PD on the motor encoders, the torque and speed envelope;
 *   - each link as up to AFF_TW_MAX_MODES resonant modes, driven by what the link feels in its own
 *     frame (transverse gravity, angular acceleration, and for link 2 the elbow's acceleration), each
 *     mode's state advanced as v += u - 2 z w v - w^2 y, y += v. Link 1 gives its tip deflection and
 *     slope, link 2 its tip deflection; the links never push back on the joints (one-way coupling);
 *   - the tool: link 2 attached at link 1's deflected tip, turned by its tip slope, and mapped back to
 *     joint coordinates by the analytic inverse kinematics — what a tracker's reading becomes.
 *
 * COST. `twinStep` returns its multiply-add count; a trigonometric or square-root call is charged
 * AFF_TW_MAC_FN, a division 1. With two modes per link it is ~370 MAC a step, so a 10,000 MAC scan
 * advances the twin ~25 steps.
 */

/** Modes per link, compile-time maximum. */
export const AFF_TW_MAX_MODES = 4;
/** What one call of sin, cos, atan2, acos or sqrt is charged, in MAC (a polynomial evaluation). */
export const AFF_TW_MAC_FN = 16;

// ---- the parameter vector P: named offsets into one flat LREAL array
export const TW = Object.freeze({
  L1: 0, L2: 1, M1: 2, M2: 3, C1: 4, C2: 5, J1: 6, J2: 7, GX: 8, GY: 9, PAYLOAD: 10,
  // per joint j at J0 + 8 j: ratio, motor inertia, K0, beta, damping, backlash half-width, kp, kd
  J0: 11, N: 0, JM: 1, K0: 2, BETA: 3, C: 4, B: 5, KP: 6, KD: 7,
  TAU_MAX: 27, SPEED_MAX: 28, COMP1: 29, COMP2: 30,
  NM1: 31, NM2: 32,
  // link 1 modes at M1_0 + 6 m: w, z, gain(w1 <- gy), gain(w1 <- alpha), gain(s1 <- gy), gain(s1 <- alpha)
  M1_0: 33,
  // link 2 modes at M2_0 + 5 m: w, z, gain(w2 <- gy), gain(w2 <- alpha), gain(w2 <- elbow accel)
  M2_0: 33 + 6 * AFF_TW_MAX_MODES,
  SIZE: 33 + 11 * AFF_TW_MAX_MODES,
});

// ---- the state vector S
export const TS = Object.freeze({
  THM1: 0, THM2: 1, WM1: 2, WM2: 3, Q1: 4, Q2: 5, W1: 6, W2: 7, A1: 8, A2: 9,
  P1: 10, P2: 11, V1: 12, V2: 13,               // the controller's last setpoint and its difference
  DEF_W1: 14, DEF_S1: 15, DEF_W2: 16,           // the links' tip outputs
  // link 1 modal states at Y1_0 + 4 m: (y, v) for gy, (y, v) for alpha
  Y1_0: 17,
  // link 2 modal states at Y2_0 + 6 m: (y, v) for gy, alpha, elbow accel
  Y2_0: 17 + 4 * AFF_TW_MAX_MODES,
  SIZE: 17 + 10 * AFF_TW_MAX_MODES,
});

export function twinNewParams() { return new Float64Array(TW.SIZE); }
export function twinNewState() { return new Float64Array(TS.SIZE); }

/** At rest at joint setpoint (sp1, sp2), gearboxes unwound, links straight. Returns the MAC count. */
export function twinReset(P, S, sp1, sp2) {
  for (let i = 0; i < TS.SIZE; i++) S[i] = 0;
  S[TS.Q1] = sp1; S[TS.Q2] = sp2;
  S[TS.THM1] = sp1 * P[TW.J0 + TW.N]; S[TS.THM2] = sp2 * P[TW.J0 + 8 + TW.N];
  S[TS.P1] = sp1; S[TS.P2] = sp2;
  return TS.SIZE + 2;
}

// The drive's model of the arm at pose (q1, q2) with rates (w1, w2) and accelerations (a1, a2):
// the joint torques M a + C w - g, written into T[0..1]. The drive's model carries NO payload.
function invDyn(P, q1, q2, w1, w2, a1, a2, T) {
  const L1 = P[TW.L1], m2 = P[TW.M2], c2 = P[TW.C2];
  const cs = Math.cos(q2), sn = Math.sin(q2);
  const m12 = P[TW.J2] + m2 * L1 * c2 * cs;
  const m11 = P[TW.J1] + P[TW.J2] + m2 * L1 * (L1 + 2 * c2 * cs);
  const h = -m2 * L1 * c2 * sn;
  const s1 = Math.sin(q1), k1 = Math.cos(q1), s12 = Math.sin(q1 + q2), k12 = Math.cos(q1 + q2);
  const gx = P[TW.GX], gy = P[TW.GY], m1 = P[TW.M1], cc1 = P[TW.C1];
  // gravity as the cross product arm.gravityTorque uses
  const c1x = cc1 * k1, c1y = cc1 * s1, ex = L1 * k1, ey = L1 * s1, d2x = c2 * k12, d2y = c2 * s12;
  const g1 = (c1x * m1 * gy - c1y * m1 * gx) + ((ex + d2x) * m2 * gy - (ey + d2y) * m2 * gx);
  const g2 = d2x * m2 * gy - d2y * m2 * gx;
  T[0] = m11 * a1 + m12 * a2 + (h * w2 * w2 + 2 * h * w1 * w2) - g1;
  T[1] = m12 * a1 + P[TW.J2] * a2 + (-h * w1 * w1) - g2;
  return 7 * AFF_TW_MAC_FN + 40;
}

// the torque a gearbox transmits (load side): dead zone, progressive stiffness, damping
function transmitted(P, j, thM, wM, thL, wL) {
  const o = TW.J0 + 8 * j, N = P[o + TW.N], b = P[o + TW.B];
  let d = thM / N - thL;
  if (b > 0) { if (d > b) d -= b; else if (d < -b) d += b; else return 0; }
  const K = P[o + TW.K0] * (1 + P[o + TW.BETA] * (d < 0 ? -d : d));
  return K * d + P[o + TW.C] * (wM / N - wL);
}

const _T = new Float64Array(2), _T2 = new Float64Array(2);

/**
 * ONE SCAN of the machine under its conventional control, commanded to joint setpoint (sp1, sp2).
 * Returns the MAC count.
 */
export function twinStep(P, S, sp1, sp2) {
  let mac = 0;
  // ---- the conventional controller: the setpoint's own differences as rate terms
  const v1 = sp1 - S[TS.P1], v2 = sp2 - S[TS.P2], al1 = v1 - S[TS.V1], al2 = v2 - S[TS.V2];
  mac += invDyn(P, sp1, sp2, v1, v2, al1, al2, _T) + 4;
  const th1 = sp1 + P[TW.COMP1] * _T[0], th2 = sp2 + P[TW.COMP2] * _T[1];
  mac += invDyn(P, th1, th2, v1, v2, al1, al2, _T2) + 2;
  const tauMax = P[TW.TAU_MAX], speedMax = P[TW.SPEED_MAX];
  let tc1 = 0, tc2 = 0;
  for (let j = 0; j < 2; j++) {
    const o = TW.J0 + 8 * j, N = P[o + TW.N], Jm = P[o + TW.JM];
    const thM = S[TS.THM1 + j], wM = S[TS.WM1 + j];
    const want = _T2[j] / N + N * Jm * (j === 0 ? al1 : al2)
      + P[o + TW.KP] * ((j === 0 ? th1 : th2) - thM / N) + P[o + TW.KD] * ((j === 0 ? v1 : v2) - wM / N);
    let tau = want;
    if (tauMax > 0) {
      let cap = tauMax;
      if (speedMax > 0) { const along = (want > 0 ? 1 : want < 0 ? -1 : 0) * wM; cap = tauMax * (1 - (along > 0 ? along : 0) / speedMax); if (cap < 0) cap = 0; }
      tau = want > cap ? cap : want < -cap ? -cap : want;
    }
    if (j === 0) tc1 = tau; else tc2 = tau;
    mac += 16;
  }
  S[TS.P1] = sp1; S[TS.P2] = sp2; S[TS.V1] = v1; S[TS.V2] = v2;
  // ---- the motors (each sees only the gearbox reaction), from the torques BEFORE anything moves
  const q1 = S[TS.Q1], q2 = S[TS.Q2], w1 = S[TS.W1], w2 = S[TS.W2];
  const t1 = transmitted(P, 0, S[TS.THM1], S[TS.WM1], q1, w1), t2 = transmitted(P, 1, S[TS.THM2], S[TS.WM2], q2, w2);
  mac += 2 * 12;
  for (let j = 0; j < 2; j++) {
    const o = TW.J0 + 8 * j, N = P[o + TW.N];
    S[TS.WM1 + j] += (1 / P[o + TW.JM]) * ((j === 0 ? tc1 : tc2) - (j === 0 ? t1 : t2) / N);
    S[TS.THM1 + j] += S[TS.WM1 + j];
    mac += 6;
  }
  // ---- the rigid chain, with the payload the drive does not know about
  const L1 = P[TW.L1], L2 = P[TW.L2], m1 = P[TW.M1], m2 = P[TW.M2], c1 = P[TW.C1], c2 = P[TW.C2];
  const cs = Math.cos(q2), sn = Math.sin(q2);
  let M11 = P[TW.J1] + P[TW.J2] + m2 * L1 * (L1 + 2 * c2 * cs), M12 = P[TW.J2] + m2 * L1 * c2 * cs, M22 = P[TW.J2];
  const h = -m2 * L1 * c2 * sn;
  let vt1 = h * w2 * w2 + 2 * h * w1 * w2, vt2 = -h * w1 * w1;
  const s1 = Math.sin(q1), k1 = Math.cos(q1), s12 = Math.sin(q1 + q2), k12 = Math.cos(q1 + q2);
  const gx = P[TW.GX], gy = P[TW.GY];
  const c1x = c1 * k1, c1y = c1 * s1, ex = L1 * k1, ey = L1 * s1, d2x = c2 * k12, d2y = c2 * s12;
  let g1 = (c1x * m1 * gy - c1y * m1 * gx) + ((ex + d2x) * m2 * gy - (ey + d2y) * m2 * gx);
  let g2 = d2x * m2 * gy - d2y * m2 * gx;
  mac += 6 * AFF_TW_MAC_FN + 45;
  const mp = P[TW.PAYLOAD];
  if (mp > 0) {
    const jx1 = -L1 * s1 - L2 * s12, jx2 = -L2 * s12, jy1 = L1 * k1 + L2 * k12, jy2 = L2 * k12;
    const w12 = (w1 + w2) * (w1 + w2);
    const dx = -(L1 * k1 * w1 * w1 + L2 * k12 * w12), dy = -(L1 * s1 * w1 * w1 + L2 * s12 * w12);
    M11 += mp * (jx1 * jx1 + jy1 * jy1); M12 += mp * (jx1 * jx2 + jy1 * jy2); M22 += mp * (jx2 * jx2 + jy2 * jy2);
    vt1 += mp * (jx1 * dx + jy1 * dy); vt2 += mp * (jx2 * dx + jy2 * dy);
    g1 += mp * (jx1 * gx + jy1 * gy); g2 += mp * (jx2 * gx + jy2 * gy);
    mac += 40;
  }
  const b1 = t1 + g1 - vt1, b2 = t2 + g2 - vt2, det = M11 * M22 - M12 * M12;
  const a1 = (M22 * b1 - M12 * b2) / det, a2 = (M11 * b2 - M12 * b1) / det;
  const nw1 = w1 + a1, nw2 = w2 + a2, nq1 = q1 + nw1, nq2 = q2 + nw2;
  S[TS.A1] = a1; S[TS.A2] = a2; S[TS.W1] = nw1; S[TS.W2] = nw2; S[TS.Q1] = nq1; S[TS.Q2] = nq2;
  mac += 16;
  // ---- what each link feels in its own frame, at the NEW state
  const phi = nq1 + nq2, sq = Math.sin(nq1), kq = Math.cos(nq1), sp = Math.sin(phi), kp = Math.cos(phi);
  const u1g = -gx * sq + gy * kq, u1a = a1;
  const ax = -L1 * a1 * sq - L1 * nw1 * nw1 * kq, ay = L1 * a1 * kq - L1 * nw1 * nw1 * sq;
  const u2g = -gx * sp + gy * kp, u2a = a1 + a2, u2e = -ax * sp + ay * kp;
  mac += 4 * AFF_TW_MAC_FN + 16;
  // ---- the links' modes
  let dw1 = 0, ds1 = 0, dw2 = 0;
  const n1 = P[TW.NM1], n2 = P[TW.NM2];
  for (let m = 0; m < n1; m++) {
    const o = TW.M1_0 + 6 * m, w = P[o], z2w = 2 * P[o + 1] * w, ww = w * w, y = TS.Y1_0 + 4 * m;
    S[y + 1] += u1g - z2w * S[y + 1] - ww * S[y]; S[y] += S[y + 1];
    S[y + 3] += u1a - z2w * S[y + 3] - ww * S[y + 2]; S[y + 2] += S[y + 3];
    dw1 += P[o + 2] * S[y] + P[o + 3] * S[y + 2];
    ds1 += P[o + 4] * S[y] + P[o + 5] * S[y + 2];
    mac += 16;
  }
  for (let m = 0; m < n2; m++) {
    const o = TW.M2_0 + 5 * m, w = P[o], z2w = 2 * P[o + 1] * w, ww = w * w, y = TS.Y2_0 + 6 * m;
    S[y + 1] += u2g - z2w * S[y + 1] - ww * S[y]; S[y] += S[y + 1];
    S[y + 3] += u2a - z2w * S[y + 3] - ww * S[y + 2]; S[y + 2] += S[y + 3];
    S[y + 5] += u2e - z2w * S[y + 5] - ww * S[y + 4]; S[y + 4] += S[y + 5];
    dw2 += P[o + 2] * S[y] + P[o + 3] * S[y + 2] + P[o + 4] * S[y + 4];
    mac += 18;
  }
  S[TS.DEF_W1] = dw1; S[TS.DEF_S1] = ds1; S[TS.DEF_W2] = dw2;
  return mac;
}

/**
 * THE MEASUREMENT: the tool's position, mapped back to joint coordinates by the inverse kinematics —
 * what the block's `aMeas` is on a tracked arm. Writes out[0..1]; returns the MAC count.
 */
export function twinMeas(P, S, out) {
  const L1 = P[TW.L1], L2 = P[TW.L2], q1 = S[TS.Q1], q2 = S[TS.Q2];
  const w1 = S[TS.DEF_W1], s1 = S[TS.DEF_S1], w2 = S[TS.DEF_W2];
  const k1 = Math.cos(q1), n1 = Math.sin(q1), a2 = q1 + s1 + q2, k2 = Math.cos(a2), n2 = Math.sin(a2);
  const x = k1 * L1 - n1 * w1 + k2 * L2 - n2 * w2, y = n1 * L1 + k1 * w1 + n2 * L2 + k2 * w2;
  let c = (x * x + y * y - L1 * L1 - L2 * L2) / (2 * L1 * L2);
  if (c > 1) c = 1; else if (c < -1) c = -1;
  const qq2 = Math.acos(c);
  out[0] = Math.atan2(y, x) - Math.atan2(L2 * Math.sin(qq2), L1 + L2 * Math.cos(qq2));
  out[1] = qq2;
  return 9 * AFF_TW_MAC_FN + 24;
}
