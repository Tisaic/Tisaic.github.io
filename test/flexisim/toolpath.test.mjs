/**
 * @file THE TOOLPATH AND ITS FEEDRATE, against closed forms.
 *
 * This is the reference a CONTOURING machine runs, and it is a different object from the
 * point-to-point profile every other tab uses — so it needs its own verification rather
 * than inheriting one. What is pinned here is geometry and kinematics only: arc length,
 * curvature, the contour/lag decomposition, and that the feedrate the profile hands out
 * really does respect the limits it was given. Whether a compliant arm can FOLLOW it is a
 * different claim and lives with the arm.
 */
import { ToolPath, roundedRect, SEG } from '../../lib/flexisim/toolpath.js';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\nflexisim: the toolpath and its feedrate');

// ------------------------------------------------------------------ geometry
{
  const L = new ToolPath({ segments: [[SEG.LINE, [3, 4]]], start: [0, 0],
    feed: 0.02, accel: 1e-5 });
  check('a line\'s arc length is its length', Math.abs(L.length - 5) < 1e-12, `${L.length}`);
  // THE CONTOUR ERROR OF A POINT OFFSET PERPENDICULARLY IS THAT OFFSET, exactly — which
  // is the definition, and the one thing a projection can get subtly wrong.
  const t = [3 / 5, 4 / 5], n = [-t[1], t[0]];
  const mid = [1.5, 2];
  let worst = 0;
  for (const d of [-0.7, -0.1, 0, 0.1, 0.7]) {
    const c = L.contour([mid[0] + d * n[0], mid[1] + d * n[1]]);
    worst = Math.max(worst, Math.abs(c.d - d));
  }
  check('…and the contour error of a point offset from it IS that offset, signed',
    worst < 1e-12, `worst ${worst.toExponential(2)}`);

  const R = 2.5;
  const A = new ToolPath({ segments: [[SEG.ARC, [R, R], R, true]], start: [0, 0],
    feed: 0.02, accel: 1e-5 });
  check('a quarter arc\'s length is R times its sweep',
    Math.abs(A.length - R * Math.PI / 2) < 1e-9, `${A.length} vs ${R * Math.PI / 2}`);
  check('…and its curvature is 1/R', Math.abs(A.segs[0].curvature - 1 / R) < 1e-12,
    `${A.segs[0].curvature}`);
  // A point at radius R+d from the centre is d off the path, whichever way round.
  // FROM THE ARC'S OWN CENTRE, not from where the test assumed it was. An arc given by
  // two points and a radius has TWO possible centres and the constructor picks one; a
  // check that guesses is testing its own guess.
  const g = A.segs[0];
  let aw = 0;
  for (const d of [-0.4, 0, 0.4]) {
    for (const frac of [0.1, 0.5, 0.9]) {
      const ang = g.angleAt(frac * g.len);
      const p = [g.c[0] + (R + d) * Math.cos(ang), g.c[1] + (R + d) * Math.sin(ang)];
      aw = Math.max(aw, Math.abs(Math.abs(A.contour(p).d) - Math.abs(d)));
    }
  }
  check('…and a point at radius R+d is |d| off it', aw < 1e-9, `worst ${aw.toExponential(2)}`);
}

// ---------------------------------------------------------------- the feedrate
{
  const p = roundedRect({ w: 8, h: 5, r: 1.2, feed: 0.02, accel: 2e-5, cornerDt: 40 });
  const closed = 2 * (8 - 2.4) + 2 * (5 - 2.4) + 2 * Math.PI * 1.2;
  check('the rounded rectangle is as long as its geometry says',
    Math.abs(p.length - closed) < 1e-9, `${p.length} vs ${closed}`);

  // WALK IT AND CHECK WHAT THE PROFILE ACTUALLY HANDS OUT, rather than what it intended:
  // the distance covered, the peak speed, and the peak acceleration.
  let dist = 0, vmax = 0, amax = 0, prev = p.at(0);
  for (let k = 1; k <= p.period; k++) {
    const q = p.at(k);
    dist += Math.hypot(q.x - prev.x, q.y - prev.y);
    vmax = Math.max(vmax, Math.hypot(q.vx, q.vy));
    amax = Math.max(amax, Math.hypot(q.ax, q.ay));
    prev = q;
  }
  console.log(`    [feed] ${p.period} steps, covered ${dist.toFixed(4)} of ${p.length.toFixed(4)}, `
    + `peak v ${vmax.toExponential(3)} (limit 2.000e-2), peak a ${amax.toExponential(3)} `
    + `(limit 2.000e-5)`);
  // THE INTEGRAL OF THE FEEDRATE IS THE PATH LENGTH, which is the same unit-sum property a
  // shaper has and for the same reason: a profile that does not cover the path has not
  // traversed it, however well it respected its limits on the way.
  check('the profile covers the whole path and no more',
    Math.abs(dist / p.length - 1) < 2e-3, `${dist} vs ${p.length}`);
  check('…without exceeding the commanded feedrate', vmax <= 0.02 * 1.001,
    `${vmax} vs 0.02`);
  check('…or the acceleration limit', amax <= 2e-5 * 1.05, `${amax} vs 2e-5`);

  // AND IT SLOWS AT THE CORNERS, which is the whole reason a contouring reference is not
  // just a trapezoid. On this path the corners are arcs, so the binding limit is the
  // curvature one: v <= sqrt(a*r).
  const vArc = Math.sqrt(2e-5 * 1.2);
  let vOnArc = 0, vOnLine = 0;
  for (let k = 0; k <= p.period; k++) {
    const q = p.at(k);
    const g = p.segAt(q.s);
    if (g.kind === SEG.ARC) vOnArc = Math.max(vOnArc, q.v);
    else vOnLine = Math.max(vOnLine, q.v);
  }
  console.log(`    [feed] fastest on a straight ${vOnLine.toExponential(3)}, `
    + `on an arc ${vOnArc.toExponential(3)} against sqrt(a*r) = ${vArc.toExponential(3)}`);
  check('the feedrate comes down on the curves, to the centripetal limit',
    vOnArc <= vArc * 1.02 && vOnArc > vArc * 0.5, `${vOnArc} vs ${vArc}`);
  // …AND THE CHECK HAS TEETH ONLY IF THE STRAIGHTS ARE FASTER. A profile that crawled
  // everywhere would satisfy every limit above and be useless.
  check('…and it is faster on the straights, so the limit is a limit and not a crawl',
    vOnLine > vOnArc * 1.5, `${vOnLine} vs ${vOnArc}`);
}

// ------------------------------------------------- a SHARP corner brings it to a stop
{
  // Two lines meeting at a right angle. The curvature limit cannot see this at all — the
  // curvature is zero on both sides — so it is the junction rule or nothing.
  const p = new ToolPath({ segments: [[SEG.LINE, [10, 0]], [SEG.LINE, [10, 10]]],
    start: [0, 0], feed: 0.02, accel: 2e-5, cornerDt: 40 });
  let vAtCorner = Infinity, vAway = 0;
  for (let k = 0; k <= p.period; k++) {
    const q = p.at(k);
    if (Math.abs(q.s - 10) < 0.05) vAtCorner = Math.min(vAtCorner, q.v);
    if (Math.abs(q.s - 5) < 0.05) vAway = Math.max(vAway, q.v);
  }
  const want = 2e-5 * 40 / (2 * Math.sin(Math.PI / 4));
  console.log(`    [corner] 90°: v at the corner ${vAtCorner.toExponential(3)} against the `
    + `junction rule's ${want.toExponential(3)}, and ${vAway.toExponential(3)} away from it`);
  check('a corner the curvature limit cannot see still slows the feedrate',
    vAtCorner < vAway * 0.2, `${vAtCorner} vs ${vAway}`);
  check('…to the junction velocity the acceleration limit allows',
    Math.abs(vAtCorner / want - 1) < 0.3, `${vAtCorner} vs ${want}`);
}

// -------------------------------------- CONTOUR AND LAG ARE DIFFERENT, AND THIS PROVES IT
//
// The single most important check in this file. A tool that is exactly ON the path but
// BEHIND where it was commanded has a large tracking error and ZERO contour error — the
// part is the right shape, made late. If the decomposition cannot separate those two,
// every number built on it is measuring the wrong thing.
{
  const p = roundedRect({ w: 8, h: 5, r: 1.2, feed: 0.02, accel: 2e-5 });
  let tMax = 0, cMax = 0;
  const lagSteps = 120;
  for (let k = lagSteps; k < p.period; k += 7) {
    const want = p.at(k);
    const late = p.at(k - lagSteps);              // on the path, just behind
    tMax = Math.max(tMax, Math.hypot(late.x - want.x, late.y - want.y));
    cMax = Math.max(cMax, Math.abs(p.contour([late.x, late.y]).d));
  }
  console.log(`    [decompose] a pure ${lagSteps}-step lag: tracking error up to `
    + `${tMax.toExponential(3)}, contour error up to ${cMax.toExponential(3)} `
    + `— a ratio of ${(tMax / Math.max(cMax, 1e-300)).toExponential(1)}`);
  check('a pure lag ALONG the path is a large tracking error', tMax > 0.5,
    `${tMax}`);
  check('…and essentially ZERO contour error, which is why the part comes out right',
    cMax < 1e-9, `${cMax}`);

  // …AND THE OTHER HALF: a deviation NORMAL to the path is a contour error of exactly
  // that size. Both directions, or the metric could simply be returning zero.
  // …taken from the PATH's tangent rather than from the commanded velocity, because an
  // open path starts and ends at rest and a zero velocity has no direction. That is not
  // a tolerance to widen: it is a place where the question has no answer.
  let worst = 0, worstAt = null;
  for (let k = 0; k < p.period; k += 13) {
    const q = p.at(k);
    const t = p.tangent(q.s);
    const n = [-t[1], t[0]];
    for (const d of [-0.05, 0.05]) {
      const c = p.contour([q.x + d * n[0], q.y + d * n[1]]);
      if (Math.abs(c.d - d) > worst) { worst = Math.abs(c.d - d); worstAt = { k, s: q.s, d, got: c.d }; }
    }
  }
  if (worst > 1e-6) console.log(`    [decompose] worst at ${JSON.stringify(worstAt)}`);
  check('…while a deviation NORMAL to it is a contour error of exactly that size',
    worst < 1e-6, `worst ${worst.toExponential(2)}`);
}

console.log(failed ? `\ntoolpath: ${failed} check(s) FAILED\n` : '\ntoolpath: all checks passed\n');
process.exit(failed ? 1 : 0);
