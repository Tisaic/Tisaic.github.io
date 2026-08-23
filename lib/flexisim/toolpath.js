/**
 * @file A PLANAR TOOLPATH AND THE FEEDRATE THAT TRAVERSES IT — the reference a contouring
 * machine actually runs, as opposed to the point-to-point move every other tab here uses.
 *
 * WHY THIS IS A DIFFERENT OBJECT AND NOT A LONGER MOVE. A point-to-point profile is judged
 * on where it ENDS and how long it rings afterwards, so its metrics are bias, oscillation
 * and settling time, and its controls are dwells and input shapers. A contouring machine
 * never settles: it is always mid-path, and what is judged is the SHAPE it leaves behind.
 * Those are different questions and they have different answers — a shaper delays the
 * command, which costs nothing at the end of a move and is a contour error everywhere
 * along one.
 *
 * SO THE ERROR DECOMPOSES DIFFERENTLY, and this is the whole reason the file exists. The
 * deviation of the tool from where it was commanded splits into
 *
 *   CONTOUR error — the component NORMAL to the path. It is a dimensional error: the part
 *                   comes out the wrong shape and no amount of time fixes it.
 *   LAG           — the component ALONG the path. The tool is at the right place on the
 *                   right curve, just later. The part is correct; the cycle is slower.
 *
 * A machine with a large lag and no contour error cuts a perfect part. That is why a
 * tracking-error number, which sums the two, is the wrong thing to minimise — and why
 * this file gives the geometry the means to separate them.
 *
 * WHAT PRODUCES CONTOUR ERROR IS MISMATCH BETWEEN AXES, not lag in either. Two axes that
 * both lag by the same fraction of their own motion trace the right curve; two that lag
 * differently do not. On a compliant serial arm the two joints have different inertias,
 * different gearbox loads and different lever arms, so they lag differently by
 * construction — which is exactly why this plant is worth pointing at a path.
 */

/** Segment kinds. A CNC part program is made of these two and nothing else. */
export const SEG = { LINE: 'line', ARC: 'arc' };

const TAU = Math.PI * 2;
const wrap = (a) => { let x = a % TAU; if (x > Math.PI) x -= TAU; if (x < -Math.PI) x += TAU; return x; };

/**
 * One path segment, arc-length parameterised.
 *
 * ARC LENGTH RATHER THAN A PARAMETER, because the feedrate is a speed ALONG THE PATH and
 * a parameter that is not arc length makes it a speed in nothing in particular. It also
 * makes the corner rule below expressible: a junction velocity is a limit on how fast the
 * tool may be going when the tangent turns, which needs a common unit on both sides.
 */
class Segment {
  /** @param {number} s0 arc length at which this segment starts */
  constructor(s0) { this.s0 = s0; }
}

class Line extends Segment {
  constructor(s0, a, b) {
    super(s0);
    this.kind = SEG.LINE;
    this.a = a; this.b = b;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    this.len = Math.hypot(dx, dy);
    this.t = this.len > 0 ? [dx / this.len, dy / this.len] : [1, 0];
    this.curvature = 0;
  }

  at(u) { return [this.a[0] + this.t[0] * u, this.a[1] + this.t[1] * u]; }
  tangentAt() { return this.t; }

  /** Nearest point, as (arc length along this segment, signed normal offset). */
  project(p) {
    const dx = p[0] - this.a[0], dy = p[1] - this.a[1];
    let u = dx * this.t[0] + dy * this.t[1];
    if (u < 0) u = 0; else if (u > this.len) u = this.len;
    const q = this.at(u);
    // Signed by the LEFT normal, so the sign says which side of the path the tool is on
    // — which is the difference between an oversize and an undersize cut. The true
    // DISTANCE is returned as well and is not the same number: where the projection is
    // clamped to an end, the normal component is only part of the separation.
    const n = [-this.t[1], this.t[0]];
    return { u, d: (p[0] - q[0]) * n[0] + (p[1] - q[1]) * n[1],
      dist: Math.hypot(p[0] - q[0], p[1] - q[1]) };
  }
}

class Arc extends Segment {
  /**
   * @param {number[]} c centre
   * @param {number} r radius
   * @param {number} a0 start angle
   * @param {number} sweep signed, radians. Its sign is the direction of travel.
   */
  constructor(s0, c, r, a0, sweep) {
    super(s0);
    this.kind = SEG.ARC;
    this.c = c; this.r = r; this.a0 = a0; this.sweep = sweep;
    this.dir = Math.sign(sweep) || 1;
    this.len = Math.abs(sweep) * r;
    this.curvature = this.dir / r;
  }

  angleAt(u) { return this.a0 + this.dir * (u / this.r); }
  at(u) {
    const a = this.angleAt(u);
    return [this.c[0] + this.r * Math.cos(a), this.c[1] + this.r * Math.sin(a)];
  }
  tangentAt(u) {
    const a = this.angleAt(u);
    return [-this.dir * Math.sin(a), this.dir * Math.cos(a)];
  }

  project(p) {
    const dx = p[0] - this.c[0], dy = p[1] - this.c[1];
    const rad = Math.hypot(dx, dy);
    let da = wrap(Math.atan2(dy, dx) - this.a0) * this.dir;
    if (da < 0) da += TAU;                       // measured forward along travel
    const span = Math.abs(this.sweep);
    let u = da * this.r;
    if (u > this.len) {
      // Off the end: clamp to whichever end is nearer in ANGLE, not in distance, so a
      // point inside the circle does not snap to the far end.
      u = (da - span) < (TAU - da) ? this.len : 0;
    }
    const q = this.at(u);
    const t = this.tangentAt(u);
    const n = [-t[1], t[0]];
    void rad;
    return { u, d: (p[0] - q[0]) * n[0] + (p[1] - q[1]) * n[1],
      dist: Math.hypot(p[0] - q[0], p[1] - q[1]) };
  }
}

/**
 * THE FEEDRATE PROFILE, and the corner rule is the part that matters.
 *
 * A trapezoid in arc length is the easy half. The interesting half is that at a junction
 * between two segments the TANGENT TURNS, and turning the tangent at speed v through an
 * angle phi in one sample demands an acceleration of order v*phi/dt, which no drive has.
 * So the feedrate has to come DOWN at every corner, to the junction velocity
 *
 *     v_j = a_max * dt / (2 * sin(phi/2))        (the standard "deviation" rule)
 *
 * capped at v_max, and a sharp enough corner brings it to a stop. That single rule is why
 * a CNC part program's cycle time is dominated by its corners rather than by its length,
 * and it is why a contouring controller cannot be judged on a straight line.
 *
 * A CURVE HAS THE SAME LIMIT CONTINUOUSLY: holding radius r at speed v needs a centripetal
 * v^2/r, so v <= sqrt(a_max * r) everywhere on an arc. A tight arc is a corner spread out.
 */
export class ToolPath {
  /**
   * @param {object} o
   * @param {Array} o.segments  [['line', [x,y]], ['arc', [x,y], r, ccw]] — each entry is
   *   the END point, with the start taken from the previous segment.
   * @param {number[]} o.start
   * @param {number} o.feed      commanded feedrate, length per step
   * @param {number} o.accel     acceleration limit, length per step^2
   * @param {boolean} [o.closed] join the last point back to the first
   * @param {number} [o.cornerDt] the corner rule's time constant, in steps. Larger is a
   *   gentler, slower corner; this is the machine's "cornering tolerance" parameter and
   *   it is the single knob that trades cycle time against corner contour error.
   */
  constructor({ segments, start = [0, 0], feed, accel, closed = false, cornerDt = 40 }) {
    this.feed = feed; this.accel = accel; this.cornerDt = cornerDt;
    this.segs = [];
    let s = 0, p = start;
    const push = (seg) => { this.segs.push(seg); s += seg.len; };
    for (const spec of segments) {
      if (spec[0] === SEG.LINE) {
        const b = spec[1];
        push(new Line(s, p, b));
        p = b;
      } else {
        // An arc is given by its END POINT and RADIUS, which is how G-code gives it.
        const [, b, r, ccw] = spec;
        push(arcThrough(s, p, b, r, ccw));
        p = b;
      }
    }
    // A CLOSED PATH THAT ALREADY ENDS WHERE IT STARTED NEEDS NO CLOSING SEGMENT, and
    // pushing one anyway is not harmless: a zero-length Line has no tangent, so the
    // corner rule reads it as a right-angle turn and stops the machine at the seam of a
    // shape that is perfectly smooth there.
    if (closed) {
      if (Math.hypot(p[0] - start[0], p[1] - start[1]) > 1e-9) push(new Line(s, p, start));
      p = start;
    }
    this.length = s;
    this.closed = closed;
    this._profile();
  }

  /** Total length, and the segment containing a given arc length. */
  segAt(u) {
    let lo = 0, hi = this.segs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.segs[mid].s0 <= u) lo = mid; else hi = mid - 1;
    }
    return this.segs[lo];
  }

  point(u) { const g = this.segAt(u); return g.at(Math.min(u - g.s0, g.len)); }
  tangent(u) { const g = this.segAt(u); return g.tangentAt(Math.min(u - g.s0, g.len)); }

  /**
   * THE CONTOUR ERROR: how far the tool is from the PATH, and on which side.
   *
   * Every segment is projected onto and the nearest wins. That is O(segments) and a real
   * controller would track the arc length it is near instead — but a controller has to be
   * right in real time and this only has to be right, and searching all of them cannot
   * pick the wrong branch near a corner, which a tracked estimate can.
   *
   * @returns {{d:number, u:number}} signed normal distance (left positive) and the arc
   *   length of the nearest point.
   */
  contour(p) {
    // ON THE DISTANCE, NOT ON THE SIGNED NORMAL OFFSET, and the difference is a defect
    // this got wrong first time. Where a projection is CLAMPED to a segment's end the
    // normal component is only part of the separation — measured, a point 0.050 off a
    // corner arc reported 0.044 against a neighbouring line it was 0.479 away from, so
    // the wrong segment won and the answer was wrong in sign as well as size. Two
    // quantities that agree wherever the projection lands in a segment's interior, which
    // is every case a straight-line test exercises.
    let best = null;
    for (const g of this.segs) {
      const r = g.project(p);
      if (!best || r.dist < best.dist) best = { d: r.d, dist: r.dist, u: g.s0 + r.u };
    }
    return best;
  }

  /**
   * The feedrate limit at every arc length, then the forward/backward passes that make it
   * reachable. This is the standard look-ahead a CNC control does, and it is done ONCE
   * here because the path is fixed.
   */
  _profile() {
    // THE RESOLUTION COMES FROM THE FEEDRATE, NOT FROM THE PATH LENGTH. It used to be one
    // sample per unit of arc, which on this geometry put TWO samples on each corner arc —
    // so the curvature ceiling was evaluated almost nowhere, the arcs ran at 1.6x the
    // centripetal limit and the profile handed out accelerations 2.9x the one it was
    // given. A speed limit sampled coarser than the features it is limiting is not a
    // limit. Four samples per step of travel is fine enough that the arcs and the corners
    // are both resolved, and the table is built once.
    const N = Math.max(2, Math.ceil(this.length / Math.max(this.feed / 4, 1e-9)));
    this.ds = this.length / N;
    const v = new Float64Array(N + 1);
    // (1) the local ceiling: the commanded feed, capped by the curvature limit.
    for (let i = 0; i <= N; i++) {
      const u = Math.min(i * this.ds, this.length);
      const g = this.segAt(u);
      const k = Math.abs(g.curvature);
      v[i] = k > 0 ? Math.min(this.feed, Math.sqrt(this.accel / k)) : this.feed;
    }
    // (2) the corners, which are the discontinuities the curvature limit cannot see.
    for (let j = 1; j < this.segs.length; j++) {
      const a = this.segs[j - 1], b = this.segs[j];
      const t0 = a.tangentAt(a.len), t1 = b.tangentAt(0);
      const dot = Math.max(-1, Math.min(1, t0[0] * t1[0] + t0[1] * t1[1]));
      const phi = Math.acos(dot);
      if (phi < 1e-9) continue;
      const vj = this.accel * this.cornerDt / (2 * Math.sin(phi / 2));
      const i = Math.round(b.s0 / this.ds);
      if (i >= 0 && i <= N) v[i] = Math.min(v[i], vj);
    }
    // …and a CLOSED path corners at the seam too; an open one starts and ends at rest.
    if (this.closed) {
      const a = this.segs[this.segs.length - 1], b = this.segs[0];
      const t0 = a.tangentAt(a.len), t1 = b.tangentAt(0);
      const phi = Math.acos(Math.max(-1, Math.min(1, t0[0] * t1[0] + t0[1] * t1[1])));
      if (phi > 1e-9) {
        const vj = this.accel * this.cornerDt / (2 * Math.sin(phi / 2));
        v[0] = Math.min(v[0], vj); v[N] = Math.min(v[N], vj);
      }
    } else { v[0] = 0; v[N] = 0; }
    // (3) forward and backward passes: v^2 may only change by 2*aT*ds between samples —
    // and aT IS NOT THE WHOLE BUDGET. Turning already costs a centripetal v^2*k, and what
    // the drive has to deliver is the VECTOR sum, so the tangential acceleration still
    // available is sqrt(a^2 - aN^2). Ignoring that put the profile at 1.97x its own
    // acceleration limit on the corner arcs while every scalar check passed: the speed
    // was exactly at sqrt(a*r) and the tangential ramp was exactly at a, and the two
    // together are sqrt(2) times either. This is the standard acceleration-ellipse
    // treatment and it is the difference between a limit and a pair of half-limits.
    //
    // THE BINDING CURVATURE IS THE LARGER OF THE TWO SAMPLES, not the one being stepped
    // FROM. At a line→arc junction the curvature jumps from 0 to 1/r in one sample, so
    // reading it from the source lets the step INTO the arc spend the whole budget on
    // tangential acceleration and then arrive needing the whole budget again for
    // centripetal — measured, exactly sqrt(2) times the limit, which is what the first
    // version of this coupling produced while every scalar check passed.
    const kAt = (i) => Math.abs(this.segAt(Math.min(i * this.ds, this.length)).curvature);
    // …AND THE CONSTRAINT HAS A CLOSED FORM, so it is solved rather than iterated.
    //
    // What has to hold is v_i^2 <= v_j^2 + 2 ds sqrt(a^2 - (v_i^2 k)^2): the tangential
    // acceleration available is whatever the acceleration ellipse has left after the
    // centripetal term, and the centripetal term depends on the very speed being solved
    // for. Writing X = v_i^2 and P = v_j^2 and squaring gives one quadratic in X,
    //
    //     X (1 + 4 ds^2 k^2) - 2 P X + (P^2 - 4 ds^2 a^2) = 0
    //
    // whose larger root is the answer. At k = 0 it collapses to X = P + 2 a ds, which is
    // the ordinary pass — so this is a generalisation rather than a different rule.
    //
    // TWO WRONG VERSIONS CAME FIRST AND BOTH LOOKED REASONABLE. Estimating the available
    // tangential acceleration from the SOURCE speed lets the step into an arc spend the
    // whole budget tangentially and then arrive needing it all centripetally — measured,
    // exactly sqrt(2) times the limit. Estimating it from the LARGER of the two speeds
    // fixes that and collapses instead: where the ceiling already sits at sqrt(a r) the
    // centripetal term is the entire budget, the available tangential acceleration is
    // zero, and the backward pass propagates the end-of-path zero all the way along the
    // arc — measured, the profile stopped 1.9 units short of the end of its own path.
    const reach = (P, k) => {
      const c = 1 + 4 * this.ds * this.ds * k * k;
      const disc = P * P - c * (P * P - 4 * this.ds * this.ds * this.accel * this.accel);
      return (P + Math.sqrt(Math.max(0, disc))) / c;
    };
    // A CLOSED PATH'S PASSES HAVE TO WRAP. On an open path the ends are at rest and one
    // pass each way is exact; on a closed one the speed at the seam is whatever the rest
    // of the lap allows, so the constraint runs THROUGH the seam and a single pass leaves
    // v[0] and v[N] disagreeing — a step in the commanded feedrate once per lap, at the
    // one place a contouring machine has no reason to have one. Two wrapped rounds
    // converge because every pass only ever lowers a value.
    const rounds = this.closed ? 2 : 1;
    for (let r = 0; r < rounds; r++) {
      for (let i = 1; i <= N; i++) {
        const k = Math.max(kAt(i - 1), kAt(i));
        v[i] = Math.min(v[i], Math.sqrt(reach(v[i - 1] * v[i - 1], k)));
      }
      if (this.closed) v[0] = Math.min(v[0], v[N]);
      for (let i = N - 1; i >= 0; i--) {
        const k = Math.max(kAt(i), kAt(i + 1));
        v[i] = Math.min(v[i], Math.sqrt(reach(v[i + 1] * v[i + 1], k)));
      }
      if (this.closed) v[N] = Math.min(v[N], v[0]);
    }
    this.v = v; this.N = N;
    // (4) integrate ds/v to get the time at each arc length, then invert it by walking
    // once — so `at(k)` is a lookup rather than a search.
    const t = new Float64Array(N + 1);
    for (let i = 1; i <= N; i++) {
      const vm = 0.5 * (v[i - 1] + v[i]);
      t[i] = t[i - 1] + (vm > 1e-12 ? this.ds / vm : 0);
    }
    this.t = t;
    // The lap time is a REAL number and the wrap uses it as one — see at(). `period` is
    // the integer a caller needs for a chart window or a modulo, and is not what the
    // command is wrapped by.
    this.lap = t[N];
    this.period = Math.max(1, Math.ceil(t[N]));
  }

  /**
   * THE STEP AT WHICH THE COMMAND IS AT A GIVEN ARC LENGTH — the inverse of `at()`, and
   * what makes a FEEDRATE CHANGE a change of speed rather than a jump.
   *
   * Installing a new profile and restarting its clock at zero teleports the command back
   * to the start of the part while the tool is somewhere else entirely: a position step
   * into the servo's gain, which is the same defect this project has already recorded as
   * "rebuilding a reference mid-move". Starting the new profile at the arc length the old
   * one had reached is what a feedrate override actually does.
   */
  timeAt(s) {
    const u = Math.max(0, Math.min(this.length, s));
    const i = Math.min(this.N, Math.max(1, Math.ceil(u / this.ds)));
    const f = (u - (i - 1) * this.ds) / this.ds;
    return this.t[i - 1] + f * (this.t[i] - this.t[i - 1]);
  }

  /**
   * The commanded tool state at step k.
   *
   * @returns {{x:number, y:number, vx:number, vy:number, ax:number, ay:number,
   *   s:number, v:number}}
   */
  at(k) {
    const T = this.t[this.N];
    // WRAPPED BY THE REAL LAP TIME, NOT BY ITS CEILING. Rounding the period up to a whole
    // step inserts a fraction of a step of dwell at the seam once per lap — a commanded
    // velocity discontinuity on a shape that is smooth there, which is exactly the kind
    // of self-inflicted excitation this tab exists to measure.
    let time = this.closed ? ((k % T) + T) % T : k;
    if (time < 0) time = 0; else if (time > T) time = T;
    // Binary search the time table for the arc length.
    let lo = 0, hi = this.N;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.t[mid] < time) lo = mid + 1; else hi = mid;
    }
    const i = Math.max(1, lo);
    const span = this.t[i] - this.t[i - 1];
    const f = span > 0 ? (time - this.t[i - 1]) / span : 0;
    const u = Math.min(this.length, (i - 1 + f) * this.ds);
    const speed = this.v[i - 1] + f * (this.v[i] - this.v[i - 1]);
    const p = this.point(u), tg = this.tangent(u);
    const g = this.segAt(u);
    // Acceleration is tangential (dv/dt) plus centripetal (v^2 * curvature), which is the
    // exact decomposition rather than a difference of two lookups.
    // THE TANGENTIAL ACCELERATION COMES FROM THE PROFILE'S OWN RELATION, not from a
    // finite difference times the local speed. The passes enforce v_i^2 = v_{i-1}^2 +
    // 2 a ds, so a = (v_i^2 - v_{i-1}^2)/(2 ds) exactly, and it is constant across the
    // interval. Multiplying dv/ds by the speed at the END of the interval instead gives
    // exactly 2a wherever the speed doubles across one sample — which is the first
    // interval of every path that starts from rest, and it read as the profile violating
    // its own acceleration limit by a factor of two while the profile was correct.
    const aT = span > 0
      ? (this.v[i] * this.v[i] - this.v[i - 1] * this.v[i - 1]) / (2 * this.ds) : 0;
    const aN = speed * speed * g.curvature;
    const n = [-tg[1], tg[0]];
    return { x: p[0], y: p[1], s: u, v: speed,
      vx: speed * tg[0], vy: speed * tg[1],
      ax: aT * tg[0] + aN * n[0], ay: aT * tg[1] + aN * n[1] };
  }
}

/** An arc from `a` to `b` of radius `r`, the short way, in the given direction. */
function arcThrough(s0, a, b, r, ccw) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const d = Math.hypot(dx, dy);
  if (!(d > 0)) throw new Error('an arc needs two distinct points');
  if (r < d / 2) throw new Error(`radius ${r} cannot span ${d.toFixed(4)}`);
  const h = Math.sqrt(Math.max(0, r * r - d * d / 4));
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const sgn = ccw ? 1 : -1;
  const c = [mx - sgn * h * dy / d, my + sgn * h * dx / d];
  const a0 = Math.atan2(a[1] - c[1], a[0] - c[0]);
  const a1 = Math.atan2(b[1] - c[1], b[0] - c[0]);
  let sweep = wrap(a1 - a0);
  if (ccw && sweep < 0) sweep += TAU;
  if (!ccw && sweep > 0) sweep -= TAU;
  return new Arc(s0, c, r, a0, sweep);
}

/**
 * A rounded rectangle — the shape that makes the point of this file in one picture. It
 * has straight runs where a contouring machine should be exact, and four corners where
 * the feedrate must come down and where the contour error will spike.
 */
export function roundedRect({ w, h, r, centre = [0, 0], feed, accel, cornerDt = 40,
  closed = false }) {
  const [cx, cy] = centre;
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
  const start = [x0 + r, y0];
  const segs = [
    [SEG.LINE, [x1 - r, y0]],
    [SEG.ARC, [x1, y0 + r], r, true],
    [SEG.LINE, [x1, y1 - r]],
    [SEG.ARC, [x1 - r, y1], r, true],
    [SEG.LINE, [x0 + r, y1]],
    [SEG.ARC, [x0, y1 - r], r, true],
    [SEG.LINE, [x0, y0 + r]],
    [SEG.ARC, [x0 + r, y0], r, true],
  ];
  return new ToolPath({ segments: segs, start, feed, accel, closed, cornerDt });
}

/**
 * A CIRCLE — the ball-bar test, which is what a machine tool builder actually runs.
 *
 * It is the most revealing shape in contouring precisely because it is the least
 * eventful: constant curvature, constant feedrate, nothing for the look-ahead to do. Any
 * departure from a circle is the MACHINE. On a Cartesian mill the classic signature is
 * the quadrant glitch — a step where an axis reverses and drags back through its own
 * backlash and stiction. On a serial arm both joints reverse somewhere on every lap and
 * neither reversal is at a quadrant, so the glitch moves to wherever the kinematics put
 * it, which is a nicer demonstration of the same physics.
 *
 * Built as two semicircles because an arc here is specified by its END POINT, the way
 * G-code specifies one, and a full turn has no end point distinct from its start.
 */
export function circle({ r, centre = [0, 0], feed, accel, ccw = true, cornerDt = 40 }) {
  const [cx, cy] = centre;
  const start = [cx + r, cy];
  const far = [cx - r, cy];
  return new ToolPath({ start, feed, accel, closed: true, cornerDt,
    segments: [[SEG.ARC, far, r, ccw], [SEG.ARC, start, r, ccw]] });
}

/**
 * A RECTANGLE WITH SQUARE CORNERS — the other extreme, and the one that makes the corner
 * rule visible. Four right-angle junctions, each of which the feedrate profile must come
 * almost to a stop for, because turning the tangent through 90 degrees at speed needs an
 * acceleration no drive has.
 */
export function sharpRect({ w, h, centre = [0, 0], feed, accel, cornerDt = 40 }) {
  const [cx, cy] = centre;
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
  return new ToolPath({ start: [x0, y0], feed, accel, closed: true, cornerDt,
    segments: [[SEG.LINE, [x1, y0]], [SEG.LINE, [x1, y1]], [SEG.LINE, [x0, y1]]] });
}
