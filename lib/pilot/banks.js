/**
 * @file THE CORNER-BANK FIT — the demo-path half of the one-press contract, library-grade.
 *
 * Moved from the arm rig (which itself took it from matrix.mjs when a third harness needed
 * it) the day the button needed it too: `autostack` cannot import test code, and a fourth
 * copy is how this project's founding defects were made. The rig re-exports this function,
 * so every existing bench is byte-identical by construction.
 *
 * What it does: λ-weighted WLS per severity knot on truth-bearing open-loop records — the
 * unclamped-axis hats (§15), the record or declared-limit regime anchor (§36), the measured
 * coverage ceiling (§16), and the optional (severity × folded turn angle) grid (§19). It
 * arms `pilot.router`, so fit labels and deploy addressing are one quantity by construction.
 *
 * Imports only from within lib/pilot — no plant, no rig, no test code.
 */
import { Pilot, solveRidge } from './pilot.js';

/**
 * FIT THE CORNER BANKS AND ARM THE ROUTER — moved here from matrix.mjs when a third harness
 * needed it, because a third copy is how this rig's founding defects were made. The λ-weighted
 * WLS per severity knot (§15), the unclamped-axis hats, the declared-limit regime anchor, the
 * measured coverage ceiling (§16) and the optional (severity × folded turn angle) grid (§19)
 * — one definition, every caller.
 *
 * @param {object} pilot  a commissioned, deployed pilot
 * @param {Array} recs    truth-bearing records in the `recordOpenLoop` shape
 * @param {object} o      { knots, aFullK, reachK, grid, sizedVTop, vTopK, fitScale }
 * @returns {{aFull:number, vTop:number, fitted:number, kept:number, grid:boolean,
 *   gridFitted:number, gridPooled:number}}
 */
export function fitCornerBanks(pilot, recs, { knots = [0.5, 1.0], aFullK = 6, reachK = 1.7,
  grid = false, sizedVTop = null, vTopK = 1, fitScale = 'anchor' } = {}) {
  const aMax0 = Math.min(...pilot.channels.map((ch) => ch.aMax));
  let aFull = aFullK * aMax0 * pilot.sample * pilot.sample;
  // `fitScale: 'record'` restores the pre-anchor lambda scale: 0.5x the records' own peak
  // |Δ²cmd|. The 6x-declared anchor was introduced because record-peak scaling made two
  // EVENT-SHAPE configurations incomparable (changing the probe moved the peak and rescaled
  // every program's engagement in one move) — but on a self-fit diet the anchor SATURATES
  // the label: the square's corners run 31x declared, shapeLambda clamps at 2x, so every
  // corner row lands at lambda 1, the knot strata collapse into one heterogeneous pool, and
  // the fit's own fallback rejects the corner weights at every lead (116 kept-scribble
  // against the record scale's 0). Measured: the self-fit ceiling is 3.27x under the record
  // scale and 1.99x under the anchor — reproduced at both commits, same machine, same seed.
  // The scale is stored in `pilot.router` either way, so fit labels and deploy addressing
  // stay one quantity; what the anchor bought — cross-configuration comparability — is a
  // property of EXPERIMENTS, not of a deployed fit, and rule 32 argues the label should be
  // scaled to the quantity it acts on: the record's own accelerations.
  if (fitScale === 'record') {
    let pk = 0;
    for (const r of recs) {
      for (let k = 1; k < r.cmd.length - 1; k++) {
        for (let c = 0; c < r.cmd[0].length; c++) {
          const a = Math.abs(r.cmd[k + 1][c] - 2 * r.cmd[k][c] + r.cmd[k - 1][c]);
          if (a > pk) pk = a;
        }
      }
    }
    if (pk > 0) aFull = 0.5 * pk;
  }
  let vTop = sizedVTop;
  if (!vTop) {
    // The records' own coverage ceiling, measured rather than assumed (§16).
    let pk = 0;
    for (const r of recs) {
      for (let k = 1; k < r.cmd.length; k++) {
        for (let c = 0; c < r.cmd[0].length; c++) {
          const d = Math.abs(r.cmd[k][c] - r.cmd[k - 1][c]);
          if (d > pk) pk = d;
        }
      }
    }
    // `vTopK` slackens the coverage guard's ceiling above the records' own peak. It exists
    // for the CEILING measurement: a self-fit diet's records ARE the scored program, so the
    // measured peak sits exactly on the program's corners and the guard fades the banks at
    // the very events they were fitted for. An agnostic diet never needs it (the polygons'
    // fast-feed peaks clear the square's), which is why the default is 1.
    vTop = pk * vTopK;
  }
  const hat = (ax, at) => Math.max(0, 1 - Math.abs(ax - at) / 0.5);
  let fitted = 0, kept = 0, gridFitted = 0, gridPooled = 0;
  for (let c = 0; c < pilot.readouts.length; c++) {
    const ro = pilot.readouts[c];
    const reach = Math.ceil(reachK * (ro.mLag - 1) * ro.stride);
    const lams = recs.map((r) => Pilot.regimeLambdas(r.cmd, aFull, reach, true));
    const banks = knots.map((at) => ({ at, bank: [] }));
    for (let li = 0; li < pilot.N; li++) {
      const L = ro.leads[Math.min(li, ro.leads.length - 1)];
      const back = Math.max((ro.mLag - 1) * ro.stride, (ro.fLag - 1) * ro.stride - L);
      for (const kn of banks) {
        const X = [], y = [];
        for (let ri = 0; ri < recs.length; ri++) {
          const rec = recs[ri], lam = lams[ri];
          const saved = pilot._rec;
          pilot._rec = { x: rec.x, cmd: rec.cmd, u: [], e: rec.e };
          try {
            for (let k = Math.max(back, rec.lap); k < rec.e.length - L - 1; k++) {
              const h = hat(lam[Math.min(k + L, lam.length - 1)], kn.at);
              if (h < 0.02) continue;
              const sw = Math.sqrt(h);
              const row = pilot._row(c, k, L, ro.stride, ro.poly, ro.mLag, ro.fLag, ro.sched);
              for (let q2 = 0; q2 < row.length; q2++) row[q2] *= sw;
              X.push(row); y.push(rec.e[k + L][c] * sw);
            }
          } finally { pilot._rec = saved; }
        }
        if (X.length > 4 * ro.w[0].length) { kn.bank.push(solveRidge(X, y, ro.ridge)); fitted++; }
        else { kn.bank.push(ro.w[Math.min(li, ro.w.length - 1)]); kept++; }
      }
    }
    ro.wBanks = banks;
    if (grid) {
      const PERIOD = Math.PI;
      const DIRS = [0, Math.PI / 2];
      const hatD = (th, at) => {
        let d = Math.abs((th % PERIOD + PERIOD) % PERIOD - at);
        if (d > PERIOD / 2) d = PERIOD - d;
        return Math.max(0, 1 - d / (PERIOD / 2));
      };
      const infos = recs.map((r) => {
        const n = r.cmd.length, nc2 = r.cmd[0].length;
        const ax = new Float64Array(n), th = new Float64Array(n);
        let m = 0, g0 = 0, g1 = 0;
        for (let k = 0; k < n; k++) {
          let a = 0, s0 = 0, s1 = 0;
          for (let c2 = 0; c2 < nc2; c2++) {
            const p0 = r.cmd[k][c2], pm = r.cmd[Math.max(0, k - 1)][c2],
              pp = r.cmd[Math.min(n - 1, k + 1)][c2];
            const d2 = pp - 2 * p0 + pm;
            if (Math.abs(d2) > a) a = Math.abs(d2);
            if (c2 === 0) s0 = d2; else s1 = d2;
          }
          const mag = a / aFull, dec = m - 1 / reach;
          if (mag >= dec) { m = mag; g0 = s0; g1 = s1; } else m = dec;
          ax[k] = Math.max(0, (m - 0.15) / 1.85);
          th[k] = Math.atan2(g1, g0);
        }
        return { ax, th };
      });
      const gBanks = knots.map(() => DIRS.map(() => []));
      for (let li = 0; li < pilot.N; li++) {
        const L = ro.leads[Math.min(li, ro.leads.length - 1)];
        const back = Math.max((ro.mLag - 1) * ro.stride, (ro.fLag - 1) * ro.stride - L);
        for (let ki = 0; ki < knots.length; ki++) {
          for (let di = 0; di < DIRS.length; di++) {
            const X = [], y = [];
            for (let ri = 0; ri < recs.length; ri++) {
              const rec = recs[ri], inf = infos[ri];
              const saved = pilot._rec;
              pilot._rec = { x: rec.x, cmd: rec.cmd, u: [], e: rec.e };
              try {
                for (let k = Math.max(back, rec.lap); k < rec.e.length - L - 1; k++) {
                  const t = Math.min(k + L, inf.ax.length - 1);
                  const h = hat(inf.ax[t], knots[ki]) * hatD(inf.th[t], DIRS[di]);
                  if (h < 0.02) continue;
                  const sw = Math.sqrt(h);
                  const row = pilot._row(c, k, L, ro.stride, ro.poly, ro.mLag, ro.fLag, ro.sched);
                  for (let q2 = 0; q2 < row.length; q2++) row[q2] *= sw;
                  X.push(row); y.push(rec.e[k + L][c] * sw);
                }
              } finally { pilot._rec = saved; }
            }
            if (X.length > 4 * ro.w[0].length) { gBanks[ki][di].push(solveRidge(X, y, ro.ridge)); gridFitted++; }
            else { gBanks[ki][di].push(banks[ki].bank[li]); gridPooled++; }
          }
        }
      }
      ro.wGrid = { sev: knots, dir: DIRS, period: PERIOD, banks: gBanks };
    }
  }
  pilot.router = { aFull, reachK, ...(vTop ? { vTop } : {}) };
  return { aFull, vTop, fitted, kept, grid, gridFitted, gridPooled };
}
