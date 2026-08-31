/**
 * @file AVERAGE THE COMMISSIONING DRAWS. One vector out, whatever k goes in.
 *
 * WHY THIS EXISTS. A commissioning is a seeded random draw and the model it produces is therefore
 * a draw too. Measured across seeds, that matters more than anything else the pilot chooses: the
 * quadruple tank's delivered benefit ranges 0.368x to 1.834x, Wood-Berry's IAE 43.90 to 95.73, and
 * on the arm six draws deliver 5.19x to 10.02x on a held-out program. One commissioning ships one
 * point from that distribution and nobody was choosing which.
 *
 * THE SPREAD IS ESTIMATION VARIANCE, NOT A DISCRETE PICK, which is what makes an average the right
 * object. All six arm draws chose the IDENTICAL configuration — stride 13, ridge 1e-5, N 58 — and
 * still spread nearly two to one on delivery. Each fit is well-determined in the directions its
 * own excitation covered and shrunk-but-wrong elsewhere; across draws those directions are
 * independent, so the errors partly cancel in the mean while the signal does not.
 *
 * AND IT IS FREE WHERE IT MATTERS. k weight vectors average to ONE vector of the same length, so
 * the DEPLOYED arithmetic and memory are exactly what a single commissioning costs — against a
 * per-lead bank's 68 covariances, or selection's identical deploy cost after discarding k-1 draws.
 * What it costs is commissioning TIME, k times, which makes k a dial rather than an overhead.
 *
 * MEASURED, on the tank at eight seeds with the basis pinned: every one of the eight draws
 * REFUSED, the best single draw delivered 1.000x, and the average of the five that shared a layout
 * **vouched for itself on the machine and delivered 1.344x**. The average was not between the
 * draws, it was better than all of them.
 *
 * WHAT IT REFUSES TO DO. It will not average models that were not fitted on the same row. A draw
 * that chose a different basis, window or lead count has a different feature layout, and averaging
 * across one would evaluate the model on a vector it was never fitted on — silently, since the
 * lengths can still match. Mismatched draws are EXCLUDED and REPORTED, never quietly dropped: on
 * the tank with the basis pinned only 5 of 8 shared a layout, and a caller that could not see that
 * would read a k=8 average that was really a k=5 one.
 */

/** The layout an average requires to be well-posed: same features, leads, cadence and basis. */
function shapeOf(pilot) {
  return JSON.stringify(pilot.readouts.map((r) => [
    r.w ? r.w.length : -1, (r.w && r.w[0]) ? r.w[0].length : -1,
    r.stride, !!r.poly, !!r.sched]));
}

/**
 * Average k commissioned pilots into the FIRST one that shares the majority layout.
 *
 * The average is written into that pilot's own arrays, so everything downstream — `act()`, the
 * guards, the correction cap, `_startVerify()` — is the ordinary deployed path with no
 * ensemble-specific branch anywhere. An ensemble that needed its own code path at deploy time
 * would be a second implementation of the controller, and this project has paid for two copies of
 * one thing before.
 *
 * @param {object[]} pilots commissioned pilots, same plant, same routing, different seeds
 * @returns {{pilot: object|null, used: number, of: number, shapes: number, why: string|null}}
 */
export function ensemble(pilots) {
  if (!Array.isArray(pilots) || pilots.length < 2) {
    return { pilot: null, used: 0, of: pilots ? pilots.length : 0, shapes: 0,
      why: 'an average needs at least two draws' };
  }
  // THE MAJORITY LAYOUT, not the first draw's. Taking the first would let one unusual
  // commissioning decide which of the others are admissible, and on a plant where the layout
  // flips it would silently pick the minority — averaging two models and calling it k.
  const counts = new Map();
  for (const p of pilots) {
    const k = shapeOf(p);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  let want = null, best = 0;
  for (const [k, n] of counts) if (n > best) { best = n; want = k; }
  const usable = pilots.filter((p) => shapeOf(p) === want);
  if (usable.length < 2) {
    return { pilot: null, used: usable.length, of: pilots.length, shapes: counts.size,
      why: `no two of ${pilots.length} draws share a feature layout — ${counts.size} distinct` };
  }
  const base = usable[0];
  base.readouts.forEach((ro, c) => {
    for (let L = 0; L < ro.w.length; L++) {
      const acc = new Float64Array(ro.w[L].length);
      for (const p of usable) {
        const wl = p.readouts[c].w[L];
        for (let i = 0; i < acc.length; i++) acc[i] += wl[i];
      }
      for (let i = 0; i < acc.length; i++) acc[i] /= usable.length;
      ro.w[L].set(acc);
    }
  });
  base.report = base.report || {};
  base.report.ensemble = { used: usable.length, of: pilots.length, shapes: counts.size };
  return { pilot: base, used: usable.length, of: pilots.length, shapes: counts.size,
    why: usable.length < pilots.length
      ? `${pilots.length - usable.length} draw(s) excluded: a different feature layout` : null };
}
