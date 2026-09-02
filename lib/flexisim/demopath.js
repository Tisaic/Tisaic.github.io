/**
 * @file THE DESIGNED DEMO — the program the block asks the machine to run when the
 * engineer does not bring one (plan §37).
 *
 * Every element of the design is a measurement, not a preference:
 *  - RANDOM SHARP POLYGONS through the corner rule, because corner shapes with no part
 *    knowledge were the first agnostic bank source above baseline in both cells (§16);
 *  - STARS BESIDE CONVEX SHAPES, because a convex-ish polygon turns at 100–130° and a
 *    star's points at 40–80°, so the two styles BRACKET a square's 90° corner — and under
 *    the record label scale that diversity PAYS (+23%, 2.39x → 2.93x, §36) where the
 *    anchored scale read it as harm;
 *  - A FEED LADDER (1x, 2x, 1.375x the base), because corner acceleration scales with
 *    feed² and the severity knots need rows on both sides of the program's own;
 *  - ONE WORKSPACE LOCATION, deliberately: banks measured as a move-profile model with
 *    mild pose sensitivity (3.81x at home fading to 2.75x at d=4.2, never below the base
 *    model — the displacement sweep), so scattering locations is a second-order gain not
 *    yet worth its commissioning laps. Stated so it stays falsifiable (rule 59).
 *
 * The seeds and feeds default to the exact diet the §36/§37 numbers were measured on, so
 * "the designed demo" and "the measured recipe" are one artifact, not two that agree today.
 */
import { ToolPath, SEG } from './toolpath.js';

/**
 * One random sharp polygon traced through the corner rule.
 * @param {() => number} rnd  a [0,1) generator; the caller owns the seed
 * @param {number} feed       commanded feedrate
 * @param {object} o          { centre, star, accel, cornerDt }
 */
export function randomPolygon(rnd, feed, { centre = [12, 0], star = false,
  accel = 4e-5, cornerDt = 40 } = {}) {
  const [cx, cy] = centre;
  const n = star ? 8 + 2 * Math.floor(2 * rnd()) : 4 + Math.floor(3 * rnd());
  const r0 = 2.2 + 1.6 * rnd();
  const pts = [];
  for (let i = 0; i < n; i++) {
    const th = (2 * Math.PI * i) / n + 0.5 * (rnd() - 0.5) / (star ? 3 : 1);
    // A STAR ALTERNATES RADII, WHICH SHARPENS EVERY VERTEX. A random convex-ish polygon
    // turns at 100-130 degrees — shallower than a square's 90 — and a bank fitted on
    // shallow turns was measured weaker on the square (2.02x against the joint-space
    // tour's 2.28x). The star's points turn at 40-80 degrees, so the two styles bracket
    // the square's corner.
    const r = r0 * (star ? (i % 2 ? 0.45 : 1) : 0.7 + 0.6 * rnd());
    pts.push([cx + r * Math.cos(th), cy + r * Math.sin(th)]);
  }
  return new ToolPath({ start: pts[0], feed, accel, closed: true, cornerDt,
    segments: pts.slice(1).map((p) => [SEG.LINE, p]).concat([[SEG.LINE, pts[0]]]) });
}

/**
 * The designed demo set: three convex polygons and three stars across the feed ladder.
 * Defaults reproduce the measured diet byte for byte (seeds 81-83 convex, 85-87 star,
 * feeds 4e-3 / 8e-3 / 5.5e-3).
 * @param {object} o { centre, feeds, seed, accel, cornerDt }
 * @returns {ToolPath[]}
 */
export function designDemoPaths({ centre = [12, 0], feeds = [4e-3, 8e-3, 5.5e-3],
  seed = 81, accel = 4e-5, cornerDt = 40 } = {}) {
  const mk = (s) => { let z = s >>> 0;
    return () => (z = (z * 1664525 + 1013904223) >>> 0) / 4294967296; };
  const out = [];
  feeds.forEach((f, i) => out.push(randomPolygon(mk(seed + i), f, { centre, accel, cornerDt })));
  feeds.forEach((f, i) => out.push(randomPolygon(mk(seed + 4 + i), f,
    { centre, star: true, accel, cornerDt })));
  return out;
}
