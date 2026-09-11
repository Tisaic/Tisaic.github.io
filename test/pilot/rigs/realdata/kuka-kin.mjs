/**
 * @file THE KUKA KR300 R2500 ultra's KINEMATICS, AND THE INVERSE-DYNAMICS REGRESSOR IT
 * UNLOCKS (plan §55.11) — the "model it instead of fitting it" route.
 *
 * TWO INDEPENDENT SOURCES, CROSS-CHECKED, BECAUSE THE KINEMATICS WAS THE WHOLE GATE (rule 15):
 *   A  the ROS-Industrial URDF `rccn-dev/kuka_kr300_support/urdf/kr300r2500ultra.urdf`,
 *      whose link geometry comes from CAD;
 *   B  Table 1 of J. Intell. Robot. Syst. (2023) 109:58, "DH model of the KR300 robot
 *      (nominal geometric parameters)".
 * Neither is derived from the other. At q = 0 every frame origin agrees to 0.0000 m, and the
 * single exception is frame 6 at exactly 0.240 m — the flange offset the URDF carries inside
 * `link_6`/`tool0` while the DH table carries it as d6, which is a bookkeeping difference and
 * not a disagreement. `test/pilot/realkuka.test.mjs` pins that agreement.
 *
 * THE CONVENTION IS MODIFIED (CRAIG) DH, NOT STANDARD DH. The paper's eq. (1) reads
 * T = Rot(x,α)·Trans(x,a)·Rot(z,θ)·Trans(z,r), and getting that ordering wrong shifts every
 * frame silently — it would still produce a plausible arm. It is written out below and
 * checked against the URDF rather than assumed.
 *
 * WHAT THE URDF DOES NOT GIVE IS THE DYNAMICS, and that is the right split rather than a gap:
 * every link there carries `mass=2` and `inertia=0.01`, ROS-Industrial's placeholders, because
 * the real values are proprietary. IDIM-LS does not need them — it needs the KINEMATICS to
 * build the regressor and IDENTIFIES the inertial parameters from data. The half that is faked
 * is exactly the half the measurement determines.
 */

/** a (m), alpha (rad), d (m), theta offset (rad), and the sign the paper puts on each joint. */
const DH = [
  { a: 0.000, al: 0, d: 0.675, th: 0, s: -1 },
  { a: 0.350, al: -Math.PI / 2, d: 0.000, th: 0, s: +1 },
  { a: 1.150, al: 0, d: 0.000, th: -Math.PI / 2, s: +1 },
  { a: -0.041, al: -Math.PI / 2, d: 1.000, th: 0, s: -1 },
  { a: 0.000, al: Math.PI / 2, d: 0.000, th: 0, s: +1 },
  { a: 0.000, al: -Math.PI / 2, d: 0.240, th: Math.PI, s: -1 },
];
const NL = 6;
/** The URDF's own frame origins at q = 0, accumulated down its chain — the cross-check. */
const URDF_ORIGINS = [[0, 0, 0.675], [0.35, 0, 0.675], [1.5, 0, 0.675], [2.5, 0, 0.634],
  [2.5, 0, 0.634], [2.5, 0, 0.634]];

/** Frame i expressed in frame i-1: returns {R (3x3, i->i-1), p (origin of i in i-1)}. */
function link(i, q) {
  const p = DH[i], th = p.s * q + p.th;
  const ca = Math.cos(p.al), sa = Math.sin(p.al), ct = Math.cos(th), st = Math.sin(th);
  return {
    R: [[ct, -st, 0], [st * ca, ct * ca, -sa], [st * sa, ct * sa, ca]],
    p: [p.a, -sa * p.d, ca * p.d],
    s: p.s,
  };
}
/** Forward kinematics: every frame's origin in the base frame. */
function fk(q) {
  let R = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], t = [0, 0, 0];
  const org = [];
  for (let i = 0; i < NL; i++) {
    const L = link(i, q[i]);
    const nt = [0, 1, 2].map((r) => t[r] + R[r][0] * L.p[0] + R[r][1] * L.p[1] + R[r][2] * L.p[2]);
    const nR = [0, 1, 2].map((r) => [0, 1, 2].map((c) => R[r][0] * L.R[0][c] + R[r][1] * L.R[1][c] + R[r][2] * L.R[2][c]));
    R = nR; t = nt; org.push([...t]);
  }
  return { R, t, org };
}

// ------------------------------------------------------------------ small vector helpers
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const rt = (R, v) => [0, 1, 2].map((i) => R[0][i] * v[0] + R[1][i] * v[1] + R[2][i] * v[2]);  // R^T v
const rv = (R, v) => [0, 1, 2].map((i) => R[i][0] * v[0] + R[i][1] * v[1] + R[i][2] * v[2]);  // R v
/** The 3x6 map from [Ixx,Ixy,Ixz,Iyy,Iyz,Izz] to I·v. */
const Lmap = (v) => [[v[0], v[1], v[2], 0, 0, 0], [0, v[0], 0, v[1], v[2], 0], [0, 0, v[0], 0, v[1], v[2]]];
const skew = (a) => [[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]];
const mm = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));

/** Number of identified parameters: 10 inertial per link, plus Fv, Fc and motor inertia. */
const NP = NL * 10 + NL * 3;

/**
 * ONE ROW-BLOCK OF THE IDIM-LS REGRESSOR: `tau = Y(q, qd, qdd) · beta`, exact and linear in
 * the inertial parameters — which is the whole reason this route exists. Returns a 6 x NP
 * matrix.
 *
 * The regressor is propagated as a MATRIX through the standard Newton-Euler recursion rather
 * than by calling RNEA once per parameter with a unit vector. Same answer, 60x less work.
 *
 * beta per link is [m, m·cx, m·cy, m·cz, Ixx, Ixy, Ixz, Iyy, Iyz, Izz] with the inertia taken
 * about the LINK FRAME ORIGIN, which is what keeps the body force linear in the parameters.
 */
function regressor(q, qd, qdd, g = 9.81) {
  const Ls = [], w = [], wd = [], acc = [];
  let w0 = [0, 0, 0], wd0 = [0, 0, 0], a0 = [0, 0, g];   // base accelerating UP carries gravity
  for (let i = 0; i < NL; i++) {
    const L = link(i, q[i]); Ls.push(L);
    const sgn = L.s, qdi = sgn * qd[i], qddi = sgn * qdd[i];
    const wp = rt(L.R, w0), wdp = rt(L.R, wd0);
    const wi = [wp[0], wp[1], wp[2] + qdi];
    const wdi = [wdp[0] + (wp[1] * qdi - 0), wdp[1] + (0 - wp[0] * qdi), wdp[2] + qddi];
    // a of frame i's origin, in frame i
    const pv = L.p;
    const ap = [0, 1, 2].map((k) => a0[k] + cross(wd0, pv)[k] + cross(w0, cross(w0, pv))[k]);
    const ai = rt(L.R, ap);
    w.push(wi); wd.push(wdi); acc.push(ai);
    w0 = wi; wd0 = wdi; a0 = ai;
  }
  // Backward: carry 3 x NP force and moment regressors.
  const Z = () => Array.from({ length: 3 }, () => new Float64Array(NP));
  let Rf = Z(), Rn = Z();
  const Y = Array.from({ length: NL }, () => new Float64Array(NP));
  for (let i = NL - 1; i >= 0; i--) {
    if (i < NL - 1) {                                   // transmit from link i+1
      const L1 = Ls[i + 1];
      const nf = Z(), nn = Z();
      for (let c = 0; c < NP; c++) {
        const f = rv(L1.R, [Rf[0][c], Rf[1][c], Rf[2][c]]);
        const n = rv(L1.R, [Rn[0][c], Rn[1][c], Rn[2][c]]);
        const m = cross(L1.p, f);
        for (let r = 0; r < 3; r++) { nf[r][c] = f[r]; nn[r][c] = n[r] + m[r]; }
      }
      Rf = nf; Rn = nn;
    }
    // This link's OWN contribution, in its 10-parameter slot.
    const o = i * 10, wi = w[i], wdi = wd[i], ai = acc[i];
    const Mc = mm(skew(wdi), [[1, 0, 0], [0, 1, 0], [0, 0, 1]]).map((r, x) =>
      r.map((v, y) => v + cross(wi, cross(wi, [y === 0 ? 1 : 0, y === 1 ? 1 : 0, y === 2 ? 1 : 0]))[x]));
    const Lw = Lmap(wdi), Lo = mm(skew(wi), Lmap(wi));
    const nA = skew(ai);                                 // (mc) x a  =  -[a]x (mc)
    for (let r = 0; r < 3; r++) {
      Rf[r][o] += ai[r];                                 // f: m column
      for (let k = 0; k < 3; k++) Rf[r][o + 1 + k] += Mc[r][k];   // f: mc columns
      for (let k = 0; k < 3; k++) Rn[r][o + 1 + k] += -nA[r][k];  // n: mc columns
      for (let k = 0; k < 6; k++) Rn[r][o + 4 + k] += Lw[r][k] + Lo[r][k];  // n: I columns
    }
    // tau_i is the moment about this joint's own axis, in this joint's own sign convention.
    const s = Ls[i].s;
    for (let c = 0; c < NP; c++) Y[i][c] = s * Rn[2][c];
    const fo = NL * 10 + i * 3;
    Y[i][fo] = qd[i];                                    // viscous friction
    Y[i][fo + 1] = Math.sign(qd[i]);                     // Coulomb friction
    Y[i][fo + 2] = qdd[i];                               // motor inertia
  }
  return Y;
}

/**
 * IDIM-LS: `beta = argmin |Y·beta - tau|^2 + lam|beta|^2`, column-scaled normal equations and
 * a Cholesky. It lives HERE rather than in each harness because three separate copies of a
 * plant's routing have each shipped a defect in this project (rule 61) — `test/pilot/kuka-idim.mjs`
 * and `test/pilot/realkuka.test.mjs` both read this one.
 * @param {{q:number[][], qd:number[][], qdd:number[][]}} S radians
 * @param {number[][]} T measured joint torques, N.m
 * @param {{lam?:number, stride?:number}} [o]
 */
function identify(S, T, o = {}) {
  const lam = o.lam == null ? 1e-6 : o.lam, stride = o.stride || 1;
  const A = Array.from({ length: NP }, () => new Float64Array(NP)), b = new Float64Array(NP);
  const sc = new Float64Array(NP);
  let n = 0;
  for (let k = 0; k < T.length; k += stride) {
    const Y = regressor(S.q[k], S.qd[k], S.qdd[k]);
    for (let i = 0; i < NL; i++) for (let c = 0; c < NP; c++) sc[c] += Y[i][c] * Y[i][c];
    n++;
  }
  // The columns span many decades — a link mass against a product of inertia — so the solve is
  // done in scaled coordinates and the scaling undone at the end (rule 32).
  for (let c = 0; c < NP; c++) sc[c] = Math.sqrt(sc[c] / (n * NL)) || 1;
  for (let k = 0; k < T.length; k += stride) {
    const Y = regressor(S.q[k], S.qd[k], S.qdd[k]);
    for (let i = 0; i < NL; i++) {
      const r = new Float64Array(NP);
      for (let c = 0; c < NP; c++) r[c] = Y[i][c] / sc[c];
      for (let x = 0; x < NP; x++) {
        if (!r[x]) continue;
        for (let y = x; y < NP; y++) A[x][y] += r[x] * r[y];
        b[x] += r[x] * T[k][i];
      }
    }
  }
  for (let x = 0; x < NP; x++) { A[x][x] += lam * n * NL; for (let y = 0; y < x; y++) A[x][y] = A[y][x]; }
  const L = Array.from({ length: NP }, () => new Float64Array(NP));
  for (let j = 0; j < NP; j++) {
    let dg = A[j][j];
    for (let k = 0; k < j; k++) dg -= L[j][k] * L[j][k];
    if (!(dg > 0)) return null;
    L[j][j] = Math.sqrt(dg);
    for (let i = j + 1; i < NP; i++) {
      let s = A[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      L[i][j] = s / L[j][j];
    }
  }
  const y0 = new Float64Array(NP), x = new Float64Array(NP);
  for (let i = 0; i < NP; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i][k] * y0[k]; y0[i] = s / L[i][i]; }
  for (let i = NP - 1; i >= 0; i--) { let s = y0[i]; for (let k = i + 1; k < NP; k++) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; }
  for (let c = 0; c < NP; c++) x[c] /= sc[c];
  return { beta: x, rows: n };
}

/** Gaussian elimination with partial pivoting on a 6x6 — used for `M^-1 (tau - h)`. */
function solve6(M, b) {
  const A = M.map((r, i) => [...r, b[i]]);
  for (let k = 0; k < 6; k++) {
    let p = k;
    for (let i = k + 1; i < 6; i++) if (Math.abs(A[i][k]) > Math.abs(A[p][k])) p = i;
    [A[p], A[k]] = [A[k], A[p]];
    const dg = A[k][k];
    for (let j = k; j <= 6; j++) A[k][j] /= dg;
    for (let i = 0; i < 6; i++) {
      if (i === k) continue;
      const f = A[i][k];
      if (!f) continue;
      for (let j = k; j <= 6; j++) A[i][j] -= f * A[k][j];
    }
  }
  return A.map((r) => r[6]);
}

// FROZEN: it is handed out to every caller, and one `e[j] = 1` on the shared array instead of
// on a copy would silently change every subsequent call (rule 61).
const ZERO6 = Object.freeze([0, 0, 0, 0, 0, 0]);

/**
 * The identified model as the three things a caller actually wants.
 *
 * `M` is obtained by PROBING the same regressor with unit accelerations, gravity and velocity
 * off, rather than by a second derivation — so there is no second model to drift from the
 * first (rule 30). `test/pilot/realkuka.test.mjs` asserts it comes back SYMMETRIC, which is a
 * property of the recursion that no identification can fake.
 */
function dynamics(beta) {
  const dot = (Y, i) => { let s = 0; for (let c = 0; c < NP; c++) s += Y[i][c] * beta[c]; return s; };
  const tau = (q, qd, qdd, g = 9.81) => {
    const Y = regressor(q, qd, qdd, g);
    return Array.from({ length: 6 }, (_, i) => dot(Y, i));
  };
  const M = (q) => {
    const out = Array.from({ length: 6 }, () => new Float64Array(6));
    for (let j = 0; j < 6; j++) {
      const e = ZERO6.slice(); e[j] = 1;
      const Y = regressor(q, ZERO6, e, 0);
      for (let i = 0; i < 6; i++) out[i][j] = dot(Y, i);
    }
    return out;
  };
  const h = (q, qd) => tau(q, qd, ZERO6, 9.81);
  /** The FORWARD direction: qdd = M^-1 (tau - h). */
  const forward = (q, qd, t) => solve6(M(q), h(q, qd).map((hh, i) => t[i] - hh));
  return { tau, M, h, forward, dot };
}

export { DH, NL, NP, URDF_ORIGINS, ZERO6, link, fk, regressor, identify, dynamics, solve6 };
