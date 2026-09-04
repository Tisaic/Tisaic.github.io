// IMPROVING THE MAP THAT PREDICTS THE IDEAL CORRECTION — `_ideal.mjs`'s finding says the concept
// works and the MAP is what limits it, so this file changes only the map.
//
// WHAT `_ideal.mjs` ESTABLISHED AND THIS FILE INHERITS. theta*(t) - ik(path), found by iterating an
// ILC on the machine, is PARTLY a function of the commanded trajectory's local shape: fitted on two
// programs it delivers 1.35-1.62x on a third it has never run. That is the north star's central
// question answered favourably — the memory is not irreducible. But the in-sample R^2 is 0.40-0.67,
// so the linear map on tool-space taps captures about half of theta* even where it was FITTED. A
// map that cannot fit its own training programs is not being limited by transfer.
//
// SO THE QUESTION HERE IS NARROW: what does the map need in order to represent theta*?
//
// THE PHYSICS SAYS WHAT IS MISSING, AND IT IS NOT MORE TAPS. To first order a gearbox joint must be
// pre-wound by tau/K for the tool to sit on the path, and the gearbox torque of a 2R arm is
// tau = M(q2) qddot + C(q, qdot) - G(q). Two things in that are OUTSIDE the span of any linear
// function of (x, y, vx, vy, ax, ay):
//   - the inertia matrix MULTIPLIES the acceleration, and it depends on the elbow angle;
//   - the Coriolis term is quadratic in velocity.
// `_ideal.mjs` offers the map accelerations and positions but never their PRODUCT, so the one term
// the physics says dominates is unrepresentable. The rigid inverse dynamics is computable from the
// COMMAND alone -- it needs no measurement and no tracker, so it is program-agnostic by
// construction and legal under the retirement (addressed by state, never by position in a lap).
//
// FOUR CHANGES ARE MEASURED, EACH ON TOP OF THE ONE BEFORE, AND EACH CAN BE READ ALONE:
//   1. COLUMN STANDARDISATION. `solveRidge` scales its penalty by the LARGEST diagonal of X'X, so
//      with raw taps (x ~ 12, ay ~ 1e-8) the small columns are penalised into nothing -- rule 32,
//      a prior must be scaled to the quantity it acts on. The ridge is then chosen by leaving one
//      TRAINING program out, never by consulting the test program.
//   2. THE LEAD-CENTRED WINDOW. The ILC update sets u[i] from e[i+140] because the plant's response
//      to a joint offset RISES over ~1120 solver steps; so the command shape u[i] is about lives at
//      i+140, and `_ideal.mjs`'s window stops at +48. Log-spaced offsets buy the reach for the same
//      column count (`_loglag.mjs`: five octaves for the same columns).
//   3. THE RIGID GEARBOX TORQUE at every offset -- the M(q)qddot + C - G above, two columns per
//      offset, computed from the command through the rig's own `jointTorques` rather than a second
//      copy of the model.
//   4. JOINT-SPACE KINEMATICS (q, qdot, qddot) rather than tool-space, since the correction IS a
//      joint offset and the compliance is a joint-space property.
//
// WHAT WOULD KILL EACH: the DELIVERED column not moving. R^2 is not the result (rule 16 -- a number
// computed from the model cannot check the model, and this project has already fitted deflection at
// held-out R^2 0.84 and made the machine WORSE applied). Every row here is applied to the machine.
//
// THE PROTOCOL IS LEAVE-ONE-PROGRAM-OUT and the held-out program is never consulted -- not by the
// ridge, not by the feature set, not by the stopping rule. `diamond` is held back further still: it
// appears in no fit and no selection anywhere in this file, and the last table applies the winner
// to it once.
//
// WHAT IT MEASURED (docs/plan.md, "THE MAP WAS THE LIMIT AND IT MOVES"). Delivered geometric mean
// 1.512x -> 4.781x, and on `diamond` -- which no row above has touched -- 1.47x -> 2.28x against an
// ideal of 2.6x. The whole of it is ONE change: the rigid gearbox torque, worth 1.74x -> 3.04x, and
// 35 columns of it alone deliver 2.81x. Every GENERIC route to the same nonlinearity is a null or
// worse -- the validated dictionary twice, pose scheduling negative, jerk a factor of 1.8 of
// damage. The nonlinearity had to be the RIGHT one and naming it found it where searching did not
// (rule 40). The control this is against is in the same log: another program's converged ILC table,
// indexed by phase, geometric mean 0.92x with four of six making the machine WORSE.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { solveRidge } from '../lib/pilot/pilot.js';
import { makeArm, mkPath, homeArm, routeSignals, PG } from './pilot/rigs/arm-rig.mjs';
import { commissionArm } from './pilot/rigs/arm-rig.mjs';
import { Stack } from '../lib/pilot/stack.js';

const FEED = +(process.env.IM_FEED || 0.004);
const SHAPES = (process.env.IM_SHAPES || 'rounded,circle,sharp').split(',');
const CONFIRM = process.env.IM_CONFIRM || 'diamond';
// TWENTY LAPS, NOT `_ideal.mjs`'s DEFAULT OF 24, so the `base` row of the table below reproduces
// the published one exactly. A control is only a control if the machine underneath it is the same
// machine (rule 21): a variant table whose baseline had drifted would attribute the drift to the
// feature change. The ideals are still descending at 20, so every "ideal Nx" here is a lower bound.
const LAPS = +(process.env.IM_LAPS || 20);
const GAIN = +(process.env.IM_GAIN || 0.4);
const SMOOTH = +(process.env.IM_SMOOTH || 9);
const LEAD = +(process.env.IM_LEAD || 140);      // measured by convergence in `_ideal.mjs`
const S = 8;                                     // sample cadence in solver steps
const ONLY = process.env.IM_ONLY ? process.env.IM_ONLY.split(',') : null;

// THE IDEAL TABLES ARE CACHED, AND THAT IS THE WHOLE REASON THIS FILE CAN ITERATE. Twenty-four ILC
// passes over four programs is ~14 minutes of lattice; a map variant is ~20 seconds. The cache key
// carries every constant the tables depend on, so a changed gain or lead invalidates it rather than
// silently reusing someone else's machine -- a stale cache is the instrument fault this project has
// paid for six times.
const KEY = `K${PG.K}_E${PG.E}_BL${PG.BL}_f${FEED}_L${LAPS}_g${GAIN}_s${SMOOTH}_d${LEAD}_S${S}`;
const CACHE = process.env.IM_CACHE || `${tmpdir()}/idealmap-${KEY}.json`;
// THE CASCADE UNDERNEATH — `IM_STACK=<depth>` commissions an ordinary pilot cascade ONCE and
// leaves it deployed and FROZEN for every run in this file. `ideal()` then iterates to the
// correction that is ideal for (machine + cascade) rather than for the bare machine, and the map
// is fitted to THAT. Nothing about the map changes; what changes is the plant it is a map of, and
// that is the cascade's own construction applied one level up — layer k models what the layers
// below it left.
//
// WHY THIS ORDER AND NOT THE REVERSE. The cascade is commissioned from a SCRIBBLE and knows no
// program; the map is a function of the commanded trajectory and is fitted over a program set.
// Commissioning the cascade on top of the map would hand a program-agnostic layer a plant that
// has already been corrected program by program, which is the inversion this project measured at
// 0.71x when it put the pilot on top of a lap-indexed feedforward. The agnostic layer goes first.
//
// AND EVERY FACTOR IN STACK MODE IS ON TOP OF THE CASCADE, so the BARE open loop is measured and
// carried through the cache as well: a residual map that doubles a 6x cascade and one that
// doubles a bare machine are not the same result, and one number cannot tell them apart.
const STACK = process.env.IM_STACK ? +process.env.IM_STACK : 0;
const SMU = process.env.IM_MU !== undefined ? +process.env.IM_MU : 0.03;
const SRISES = +(process.env.IM_RISES || 10);
const SHTS = +(process.env.IM_HTS || 1.5);
// A CACHED IDEAL BELONGS TO THE PLANT IT WAS ITERATED ON. The mode is written into the cache and
// checked on read, so an explicit `IM_CACHE` cannot quietly hand stack-mode tables to a bare run
// (a stale cache is the instrument fault this project has paid for six times).
const MODE = STACK ? `stack${STACK}_mu${SMU}_r${SRISES}_h${SHTS}` : 'bare';
// THE PILOT GETS A LAP OF WARM-UP IT DOES NOT NEED WHEN IT IS ABSENT (rule 13). Bare mode keeps
// its two laps exactly, so every number this file has published is reproduced unchanged.
const RUNLAPS = STACK ? 3 : 2;
let BASE = null;                      // the frozen cascade, or null in bare mode


console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}; ILC ${LAPS} laps, gain ${GAIN}, `
  + `smooth ${SMOOTH}, lead ${LEAD}`);
console.log(`cache ${CACHE}`);

/** One run of `laps` laps applying a per-sample periodic correction; returns per-sample error. */
async function run(path, tab, laps, { bare = false } = {}) {
  const { arm, servo } = await makeArm();
  homeArm(arm, servo, path);
  const lapSteps = Math.round(path.lap), n = Math.round(lapSteps / S);
  const e = [];
  // THE FROZEN CASCADE UNDERNEATH, driven exactly as `deployOn` drives it — one definition of the
  // routing, the reference closure and the sample clock, because three copies of a rig's inner
  // loop have each shipped a defect here. `bare` switches it off for the one measurement that
  // needs the machine without it.
  const P = (BASE && !bare) ? BASE : null;
  const PS = P ? P.sample : 0;
  const rcache = P ? new Map() : null;
  const refAt = (i) => {
    let r = rcache.get(i);
    if (!r) { const c = path.at(i * PS); r = arm.ik(c.x, c.y, true); rcache.set(i, r); }
    return r;
  };
  let kSamp = 0;
  if (P) P._initRun();
  for (let k = 0; k < lapSteps * laps; k++) {
    const c = path.at(k);
    const [q1, q2] = arm.ik(c.x, c.y, true);
    const rt = arm.ikRates(q1, q2, c.vx, c.vy, c.ax, c.ay);
    const b = Math.floor(k / S) % n;
    const u = tab ? [tab[0][b], tab[1][b]] : [0, 0];
    if (P) {
      const up = P.act((off) => refAt(kSamp + off));
      u[0] += up[0]; u[1] += up[1];
    }
    const tau = servo.torques([{ theta: q1 + u[0], omega: rt.dq[0], alpha: rt.ddq[0] },
      { theta: q2 + u[1], omega: rt.dq[1], alpha: rt.ddq[1] }]);
    arm.step(tau[0], tau[1], 1);
    if (P && k % PS === 0) kSamp++;
    const rs = (P || (k % S === 0 && k >= lapSteps * (laps - 1)))
      ? routeSignals(arm, [{ pos: q1 }, { pos: q2 }], tau) : null;
    // THE TRUTH IS WITHHELD. This file's cascade is FROZEN by construction: its weights must be
    // the same on the first ILC pass and the last, or the plant the map is fitted to is not the
    // plant the map is delivered on. `observe` is still called, because the pilot's own history
    // is what its forecast reads.
    if (P) P.observe(rs.measured, null);
    if (k % S === 0 && k >= lapSteps * (laps - 1)) e.push(rs.truth.slice());
  }
  await arm.l1.destroy(); await arm.l2.destroy();
  return e;
}
const rms = (e) => Math.sqrt(e.reduce((a, v) => a + v[0] * v[0] + v[1] * v[1], 0) / (2 * e.length));
const zero = (a, half) => {                 // zero-phase box, periodic
  const n = a.length, out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let d = -half; d <= half; d++) s += a[(i + d + n * 2) % n];
    out[i] = s / (2 * half + 1);
  }
  return out;
};

/** THE IDEAL CORRECTION, found by iteration on the machine — this is theta*(t) - ik(path). */
async function ideal(path) {
  const n = Math.round(Math.round(path.lap) / S);
  const tab = [new Float64Array(n), new Float64Array(n)];
  let best = null, bestRms = Infinity;
  const open = rms(await run(path, null, RUNLAPS));
  // THE BARE MACHINE, measured once per program so a stack-mode factor can be stated against
  // BOTH denominators. In bare mode it is the same run and is not repeated.
  const bare = STACK ? rms(await run(path, null, RUNLAPS, { bare: true })) : open;
  for (let it = 0; it < LAPS; it++) {
    const e = await run(path, tab, RUNLAPS);
    const r = rms(e);
    if (r < bestRms) { bestRms = r; best = tab.map((t) => Float64Array.from(t)); }
    for (let c = 0; c < 2; c++) {
      const upd = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const j = ((i + LEAD) % n + n) % n;
        upd[i] = tab[c][i] - GAIN * e[Math.min(j, e.length - 1)][c];
      }
      tab[c] = zero(upd, SMOOTH);
    }
  }
  return { tab: best.map((t) => Array.from(t)), open, bare, conv: bestRms };
}

// ---------------------------------------------------------------------------------------------
// THE PER-SAMPLE COMMAND DESCRIPTION, computed once per program.
//
// Everything here is a function of the COMMANDED trajectory and the rig's own rigid model. Nothing
// measured enters: a map fitted on a measured signal changes when the correction is applied and is
// self-referential, and nothing is indexed by position in the lap.
// ---------------------------------------------------------------------------------------------
async function describe(path) {
  const n = Math.round(Math.round(path.lap) / S);
  const { arm, servo } = await makeArm();
  const q = [], dq = [], ddq = [], tool = [], tau = [];
  for (let i = 0; i < n; i++) {
    const c = path.at(i * S);
    const [q1, q2] = arm.ik(c.x, c.y, true);
    const rt = arm.ikRates(q1, q2, c.vx, c.vy, c.ax, c.ay);
    q.push([q1, q2]); dq.push([rt.dq[0], rt.dq[1]]); ddq.push([rt.ddq[0], rt.ddq[1]]);
    tool.push([c.x, c.y, c.vx, c.vy, c.ax, c.ay]);
    // THE RIGID GEARBOX TORQUE, THROUGH THE RIG'S OWN MODEL rather than a second copy of it:
    // `jointTorques` is M(q2)*alpha + C(q, omega) - G(q), the torque the gearbox must transmit
    // for the commanded motion, and the servo the machine actually runs computes its feedforward
    // from the identical call. Two copies of one model is how a feedforward and a correction end
    // up disagreeing about the plant (rule 61).
    tau.push(servo.jointTorques([{ theta: q1, omega: rt.dq[0], alpha: rt.ddq[0] },
      { theta: q2, omega: rt.dq[1], alpha: rt.ddq[1] }]));
  }
  await arm.l1.destroy(); await arm.l2.destroy();
  // JERK, by a periodic central difference of the acceleration. The path is closed, so the wrap is
  // the physical continuation rather than an edge artefact.
  const jerk = [], jjerk = [];
  const rate = 1 / S;                    // per solver step, the units the accelerations are in
  for (let i = 0; i < n; i++) {
    const a = tool[(i + 1) % n], b = tool[(i - 1 + n) % n];
    jerk.push([(a[4] - b[4]) * rate / 2, (a[5] - b[5]) * rate / 2]);
    const A = ddq[(i + 1) % n], B = ddq[(i - 1 + n) % n];
    jjerk.push([(A[0] - B[0]) * rate / 2, (A[1] - B[1]) * rate / 2]);
  }
  return { n, q, dq, ddq, tool, tau, jerk, jjerk };
}

// ---------------------------------------------------------------------------------------------
// THE FEATURE SETS. Each is a named recipe so a row of the table changes exactly one thing.
// ---------------------------------------------------------------------------------------------
const LEADSETS = {
  // `_ideal.mjs`'s window verbatim, the control.
  base: [-24, -12, -6, -2, 0, 2, 6, 12, 24, 48],
  // LOG-SPACED AND CENTRED ON THE LEAD. The correction applied at sample i lands 140 samples later,
  // so the command shape it is about lives around i+140; the base window stops at +48 and cannot
  // see it. Log spacing keeps fine resolution near the present -- the corner is a 40-step event --
  // while reaching 256 samples out for the same column count.
  lead: [-64, -24, -12, -6, -2, 0, 2, 6, 12, 24, 48, 80, 112, 140, 168, 200, 256],
  // the same reach with NO fine taps, to separate reach from resolution
  coarse: [-64, -32, 0, 32, 64, 96, 128, 160, 192, 224, 256],
  // OUT TO 400 SAMPLES = 3200 SOLVER STEPS, because plan §41 measured the ELBOW's memory at
  // 6363-8649 steps — longer than a program lap — and if that is what makes it the weak channel
  // then reach is the cure and it should show on channel 1 and not on channel 0.
  long: [-192, -96, -48, -24, -12, -6, -2, 0, 2, 6, 12, 24, 48, 96, 140, 192, 256, 320, 400],
  // THE SAME SPAN AT TWICE THE TAPS, to ask whether what the log window bought was reach or
  // whether the fine structure between the taps carries anything as well.
  dense: [-96, -64, -48, -32, -24, -16, -12, -8, -6, -4, -2, 0, 2, 4, 6, 8, 12, 16, 24, 32, 48,
    64, 80, 96, 112, 128, 140, 152, 168, 184, 200, 224, 256],
};

function buildFeats(d, i, spec) {
  const n = d.n, row = [1];
  const at = (arr, j) => arr[(((i + j) % n) + n) % n];
  for (const L of spec.leads) {
    if (spec.tool) for (const v of at(d.tool, L)) row.push(v);
    if (spec.joint) {
      const a = at(d.q, L), b = at(d.dq, L), c = at(d.ddq, L);
      row.push(a[0], a[1], b[0], b[1], c[0], c[1]);
    }
    if (spec.torque) { const t = at(d.tau, L); row.push(t[0], t[1]); }
    if (spec.jerk) {
      const j1 = at(d.jerk, L), j2 = at(d.jjerk, L);
      row.push(j1[0], j1[1], j2[0], j2[1]);
    }
  }
  if (spec.curv) {
    // the local turn, which is what a corner IS
    const p0 = at(d.tool, -2), p1 = at(d.tool, 0), p2 = at(d.tool, 2);
    row.push(p2[0] - 2 * p1[0] + p0[0], p2[1] - 2 * p1[1] + p0[1]);
  }
  if (spec.pose) {
    // POSE SCHEDULING, and only on the torque taps. The arm's compliance is pose-dependent and the
    // dependence is through the elbow angle, so the product of a torque tap with cos/sin q2 is the
    // one nonlinearity the physics names. Multiplying EVERYTHING by pose would be the "add wide,
    // keep wide" design this project has measured losing four times.
    const p = at(d.q, 0);
    const s = [Math.cos(p[1]), Math.sin(p[1]), Math.cos(p[0]), Math.sin(p[0])];
    for (const L of spec.poseLeads || [0, LEAD]) {
      const t = at(d.tau, L);
      for (const g of s) { row.push(t[0] * g, t[1] * g); }
    }
    for (const g of s) row.push(g);
  }
  return row;
}

// THE LADDER IS CUMULATIVE AND THE INDENTED ROWS ARE ITS CONTROLS. Every `+` row adds exactly one
// thing to the row above it; every indented row takes something away from the `+` row above it, so
// that a gain can be attributed rather than admired. Nothing is stacked on a row that measured a
// LOSS — an earlier ordering hung the pose block and the dictionary on `+jerk`, and since jerk
// costs a factor of 1.8 both inherited the collapse and read as nulls they are not.
const KIN = { leads: LEADSETS.lead, tool: 1, joint: 1, torque: 1, curv: 1 };
const JT = { leads: LEADSETS.lead, joint: 1, torque: 1 };
const VARIANTS = [
  { name: 'base (_ideal.mjs)', spec: { leads: LEADSETS.base, tool: 1, curv: 1 }, std: 0, ridge: 1e-6 },
  { name: '+standardised', spec: { leads: LEADSETS.base, tool: 1, curv: 1 }, std: 1 },
  { name: '+lead-centred log', spec: { leads: LEADSETS.lead, tool: 1, curv: 1 }, std: 1 },
  { name: '  coarse reach only', spec: { leads: LEADSETS.coarse, tool: 1, curv: 1 }, std: 1 },
  { name: '+rigid torque', spec: { leads: LEADSETS.lead, tool: 1, torque: 1, curv: 1 }, std: 1 },
  { name: '  torque alone', spec: { leads: LEADSETS.lead, torque: 1 }, std: 1 },
  { name: '+joint kinematics', spec: KIN, std: 1 },
  { name: '  joint+torque, no tool', spec: JT, std: 1 },
  { name: '    JT, reach 400', spec: { leads: LEADSETS.long, joint: 1, torque: 1 }, std: 1 },
  { name: '    JT, dense leads', spec: { leads: LEADSETS.dense, joint: 1, torque: 1 }, std: 1 },
  { name: '    JT + dictionary', spec: JT, std: 1, dict: { kmax: 12, topk: 8 } },
  { name: '  reach 400 samples', spec: { leads: LEADSETS.long, tool: 1, joint: 1, torque: 1, curv: 1 }, std: 1 },
  { name: '  elbow reaches further', spec: [KIN, { leads: LEADSETS.long, tool: 1, joint: 1, torque: 1, curv: 1 }], std: 1 },
  { name: '+jerk', spec: { ...KIN, jerk: 1 }, std: 1 },
  { name: '+pose-scheduled tau', spec: { ...KIN, pose: 1 }, std: 1 },
  { name: '+validated dictionary', spec: KIN, std: 1, dict: { kmax: 12, topk: 8 } },
];

// ---------------------------------------------------------------------------------------------
// FITTING. Columns standardised on the TRAINING rows only, and the ridge chosen by leaving one
// TRAINING program out — the test program is consulted by nothing.
// ---------------------------------------------------------------------------------------------
// THE LADDER REACHES 10, not 0.1. A 300-column map on 1800 rows fits its training programs to
// R^2 1.0000 at 1e-6 — the ridge is the only thing standing between "rich basis" and "memorised
// two programs", and a ladder that stops before the useful value is a constant chosen too small
// (rule 32). The chosen value is printed on every row so a rail can be seen rather than assumed.
const RIDGES = [1e-8, 1e-7, 1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 1e-1, 1, 10];

function standardise(rows, on = true) {
  const nc = rows[0].length, mu = new Float64Array(nc), sd = new Float64Array(nc);
  // THE OFF CASE IS THE CONTROL, NOT AN OPTIMISATION. `_ideal.mjs` fits the RAW taps, and
  // `solveRidge` scales its penalty by the largest diagonal of X'X, so a column whose spread is
  // 1e-8 against a position column's 12 is penalised by the position column's scale and never
  // gets to say anything (rule 32). Reproducing that exactly is what makes the next row readable.
  if (!on) { sd.fill(1); return { mu, sd }; }
  for (const r of rows) for (let j = 0; j < nc; j++) mu[j] += r[j];
  for (let j = 0; j < nc; j++) mu[j] /= rows.length;
  for (const r of rows) for (let j = 0; j < nc; j++) sd[j] += (r[j] - mu[j]) ** 2;
  for (let j = 0; j < nc; j++) sd[j] = Math.sqrt(sd[j] / rows.length);
  // the bias column has zero spread; leave it alone rather than dividing by a floor
  for (let j = 0; j < nc; j++) if (!(sd[j] > 1e-12)) { mu[j] = 0; sd[j] = 1; }
  return { mu, sd };
}
const applyStd = (rows, st) => rows.map((r) => r.map((v, j) => (v - st.mu[j]) / st.sd[j]));
const predict = (r, w) => { let p = 0; for (let j = 0; j < w.length; j++) p += w[j] * r[j]; return p; };
const r2 = (X, y, w) => {
  let sse = 0, sy = 0, sy2 = 0;
  for (let i = 0; i < X.length; i++) {
    const d = y[i] - predict(X[i], w); sse += d * d; sy += y[i]; sy2 += y[i] * y[i];
  }
  return 1 - sse / Math.max(sy2 - (sy * sy) / X.length, 1e-300);
};

// THE RIDGE SWEEP REUSES ONE GRAM, because `solveRidge` rebuilds X'X for every lambda and eight
// lambdas x two inner folds x two channels x three folds is the same 10^8-multiply accumulation
// done ninety-six times. Only the DIAGONAL changes with lambda. A bench too slow to run is a
// verification problem (rule 2), and the shortcut is checked rather than assumed: `gramCheck`
// asserts this solver reproduces `solveRidge` to floating point on the first fit it does, so the
// library remains the reference and this is only a faster route to the same answer.
function gram(Z, y) {
  const n = Z[0].length, A = Array.from({ length: n }, () => new Float64Array(n));
  const b = new Float64Array(n);
  for (let k = 0; k < Z.length; k++) {
    const r = Z[k], yk = y[k];
    for (let i = 0; i < n; i++) {
      const xi = r[i];
      b[i] += xi * yk;
      for (let j = i; j < n; j++) A[i][j] += xi * r[j];
    }
  }
  let dmax = 0;
  for (let i = 0; i < n; i++) dmax = Math.max(dmax, A[i][i]);
  return { A, b, n, dmax: dmax || 1 };
}
function gramSolve(G, lam, colScale = null) {
  const { A, b, n } = G, L = Array.from({ length: n }, () => new Float64Array(n));
  const d = lam * G.dmax;
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = (j === i ? A[i][i] + d * (colScale ? colScale[i] : 1) : A[j][i]);
    for (let t = 0; t < j; t++) s -= L[i][t] * L[j][t];
    if (i === j) L[i][i] = Math.sqrt(Math.max(s, 1e-300)); else L[i][j] = s / L[j][j];
  }
  const z = new Float64Array(n), w = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = b[i]; for (let t = 0; t < i; t++) s -= L[i][t] * z[t]; z[i] = s / L[i][i]; }
  for (let i = n - 1; i >= 0; i--) { let s = z[i]; for (let t = i + 1; t < n; t++) s -= L[t][i] * w[t]; w[i] = s / L[i][i]; }
  return w;
}
let gramCheck = null;

/**
 * Fit one channel on a set of training programs.
 * @param {object[]} train per-program {X, y} already built for this feature spec
 * @param {number} fixedRidge when set, no selection is run (the `_ideal.mjs` control)
 * @param {boolean} useStd standardise the columns first
 */
function fitChannel(train, fixedRidge, useStd) {
  const rows = [].concat(...train.map((t) => t.X));
  const ys = [].concat(...train.map((t) => t.y));
  const st = standardise(rows, useStd);
  const Z = applyStd(rows, st);
  const G = gram(Z, ys);
  let ridge = fixedRidge, note = 'fixed';
  // ONE TRAINING PROGRAM CANNOT CHOOSE A RIDGE FOR TRANSFER, and saying so is better than a
  // silent within-program split that would answer a different question.
  if (!fixedRidge && train.length < 2) { ridge = 1e-6; note = '1e-6 (one program, no selection)'; }
  else if (!fixedRidge) {
    // LEAVE ONE TRAINING PROGRAM OUT. The question is transfer between programs, so the validation
    // split has to be between programs too -- a random split of a correlated time series leaks a
    // neighbouring sample and would choose a ridge for interpolation rather than for transfer.
    const inner = train.map((_, h) => {
      const fitRows = [], fitY = [];
      train.forEach((t, k) => { if (k !== h) { fitRows.push(...t.X); fitY.push(...t.y); } });
      const s2 = standardise(fitRows, useStd);
      return { G: gram(applyStd(fitRows, s2), fitY), Zh: applyStd(train[h].X, s2), yh: train[h].y };
    });
    let bestV = -Infinity;
    for (const lam of RIDGES) {
      let acc = 0;
      for (const f of inner) acc += r2(f.Zh, f.yh, gramSolve(f.G, lam));
      if (acc / inner.length > bestV) { bestV = acc / inner.length; ridge = lam; }
    }
    note = `${ridge.toExponential(0)} (val R^2 ${bestV.toFixed(3)})`;
  }
  const w = gramSolve(G, ridge);
  if (gramCheck === null) {                    // the control, run once
    const wl = solveRidge(Z, ys, ridge, rows[0].map(() => 1));
    let num = 0, den = 0;
    for (let i = 0; i < w.length; i++) { num += (w[i] - wl[i]) ** 2; den += wl[i] * wl[i]; }
    gramCheck = Math.sqrt(num / Math.max(den, 1e-300));
    console.log(`  control: the reused Gram reproduces solveRidge to `
      + `${gramCheck.toExponential(1)} relative`);
  }
  return { w, st, ridge, note, inR2: r2(Z, ys, w) };
}

// ---------------------------------------------------------------------------------------------
// THE VALIDATED DICTIONARY, reusing `_dict.mjs`'s pattern rather than its target.
//
// `_dict.mjs` searched a rich dictionary for terms that predict the pilot's forecast target on the
// COMMISSIONING RECORD, and its verdict was that the terms it found are real physics that the
// programs do not exercise -- the record and the programs are different distributions. Here the
// rows ARE programs, so that particular failure cannot occur: a term is proposed on two programs
// and judged on how it transfers BETWEEN them.
//
// GREEDY-ON-TRAINING OVERFITS CATASTROPHICALLY and `_dict.mjs` measured it doing so (in-sample
// climbing while held-out collapsed from the first term). So the split is kept: terms are PROPOSED
// by correlation with the current residual, and DECIDED on a program the fit did not see, with the
// search stopping the moment nothing improves. The held-out program of the outer fold is consulted
// by neither step.
// ---------------------------------------------------------------------------------------------
const CAND_OFFS = [0, LEAD];

/** The reduced base a rich term is built from: the taps the physics names, at two offsets. */
function candBase(d, i) {
  const n = d.n, v = [], nm = [];
  const at = (arr, j) => arr[(((i + j) % n) + n) % n];
  for (const L of CAND_OFFS) {
    const t = at(d.tool, L), q = at(d.q, L), dq = at(d.dq, L), ddq = at(d.ddq, L), tq = at(d.tau, L);
    const tag = L === 0 ? '' : `+${L}`;
    v.push(t[2], t[3], t[4], t[5]); nm.push(`vx${tag}`, `vy${tag}`, `ax${tag}`, `ay${tag}`);
    v.push(q[0], q[1], dq[0], dq[1], ddq[0], ddq[1]);
    nm.push(`q1${tag}`, `q2${tag}`, `dq1${tag}`, `dq2${tag}`, `ddq1${tag}`, `ddq2${tag}`);
    v.push(tq[0], tq[1]); nm.push(`t1${tag}`, `t2${tag}`);
  }
  return { v, nm };
}
/** The dictionary itself, on STANDARDISED base signals (rule 32). */
function richTerms(z, nm, out, outName) {
  const n = z.length;
  for (let i = 0; i < n; i++) for (let j = i; j < n; j++) {
    out.push(z[i] * z[j]); if (outName) outName.push(`${nm[i]}*${nm[j]}`);
  }
  for (let i = 0; i < n; i++) {
    out.push(Math.abs(z[i])); if (outName) outName.push(`|${nm[i]}|`);
    out.push(z[i] * Math.abs(z[i])); if (outName) outName.push(`${nm[i]}|${nm[i]}|`);
    out.push(Math.tanh(z[i])); if (outName) outName.push(`tanh ${nm[i]}`);
  }
}

/**
 * Propose by residual correlation, decide on a program the fit never saw.
 * @returns {{sel:number[], names:string[], trace:string[]}}
 */
function dictSelect(trB, trR, trY, ridge, names, kmax, topk) {
  const nProg = trB.length;
  const sel = [], trace = [];
  // the rich columns are ridged a hundred times harder than the linear ones, so a nonlinear term
  // has to EARN its weight against a basis that is already there — the shipped scheduled block's
  // own prior, reused rather than reinvented
  const pen = (k, nb) => new Array(nb).fill(1).concat(new Array(k).fill(100));
  const joinP = (p, s) => trB[p].map((b, i) => b.concat(s.map((j) => trR[p][i][j])));
  const valAt = (s) => {                       // mean leave-one-training-program-out R^2
    let acc = 0;
    for (let h = 0; h < nProg; h++) {
      const X = [], y = [];
      for (let p = 0; p < nProg; p++) if (p !== h) { X.push(...joinP(p, s)); y.push(...trY[p]); }
      const w = gramSolve(gram(X, y), ridge, pen(s.length, trB[0][0].length));
      acc += r2(joinP(h, s), trY[h], w);
    }
    return acc / nProg;
  };
  let cur = valAt(sel);
  const base = cur;
  const nb = trB[0][0].length;
  for (let k = 1; k <= kmax; k++) {
    // the residual of the CURRENT model on all training rows
    const X = [], y = [];
    for (let p = 0; p < nProg; p++) { X.push(...joinP(p, sel)); y.push(...trY[p]); }
    const w = gramSolve(gram(X, y), ridge, pen(sel.length, nb));
    const res = X.map((r, i) => y[i] - predict(r, w));
    const R = [].concat(...trR);
    const nc = R[0].length, score = [];
    for (let j = 0; j < nc; j++) {
      if (sel.includes(j)) continue;
      let sxy = 0, sx = 0, sxx = 0;
      for (let i = 0; i < R.length; i++) { const v = R[i][j]; sxy += v * res[i]; sx += v; sxx += v * v; }
      score.push({ j, v: Math.abs(sxy) / Math.sqrt(Math.max(1e-30, sxx - (sx * sx) / R.length)) });
    }
    score.sort((a, b) => b.v - a.v);
    let best = null, bestV = cur;
    for (const cand of score.slice(0, topk)) {
      const v = valAt(sel.concat([cand.j]));
      if (v > bestV) { bestV = v; best = cand.j; }
    }
    if (best === null) { trace.push(`stopped at ${sel.length} term(s)`); break; }
    sel.push(best); cur = bestV;
    trace.push(`${names[best]} -> val ${cur.toFixed(4)}`);
  }
  return { sel, base, cur, trace };
}

// ---------------------------------------------------------------------------------------------
const ALL = SHAPES.concat(CONFIRM ? [CONFIRM] : []);

// ONE COMMISSIONING FOR THE WHOLE FILE, and it happens BEFORE any ideal is iterated, because the
// ideal correction is a property of the plant the cascade makes and not of the bare machine.
if (STACK) {
  const t0 = Date.now();
  BASE = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED }, uCap: 0.6,
    Cls: Stack, extra: { depth: STACK },
    before: (p) => {
      const set = (q) => { q.probeRises = SRISES; q.horizonTs = SHTS; };
      set(p);
      if (p.opts) { p.opts.probeRises = SRISES; p.opts.horizonTs = SHTS; }
      (p.layers || [p]).forEach(set);
    } });
  if (!BASE) { console.log('  cascade never commissioned — nothing to fit a residual map to'); process.exit(1); }
  // THE TIKHONOV WEIGHT IS A DEPLOY-TIME SHAPE, NOT A COMMISSIONING ONE — set exactly where
  // `_best.mjs` set it when it measured 6.04, on the layers after the fit, so this file inherits
  // that configuration rather than restating it approximately.
  for (const q of (BASE.layers || [BASE])) q.uWeight = SMU > 0 ? new Array(q.nc).fill(SMU) : null;
  const lay = BASE.layers ? BASE.layers.length : 1;
  console.log(`  cascade: depth ${STACK} requested, ${lay} layer(s) deployed, mu ${SMU}, `
    + `probeRises ${SRISES}, horizonTs ${SHTS}  (${((Date.now() - t0) / 1e3).toFixed(0)} s)`);
}

const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
// A CACHED IDEAL BELONGS TO THE PLANT IT WAS ITERATED ON (rule 17: the instrument fails first).
if (cache._mode && cache._mode !== MODE) {
  console.log(`  REFUSING a cache written for mode "${cache._mode}" in mode "${MODE}"`);
  process.exit(1);
}
cache._mode = MODE;
const data = {};
for (const sh of ALL) {
  const path = mkPath(sh, FEED);
  if (!cache[sh]) {
    const t0 = Date.now();
    cache[sh] = await ideal(path);
    mkdirSync(dirname(CACHE), { recursive: true });
    writeFileSync(CACHE, JSON.stringify(cache));
    console.log(`  ${sh.padEnd(8)} ideal computed in ${((Date.now() - t0) / 1e3).toFixed(0)} s`);
  }
  const r = cache[sh];
  // An older cache predates the bare column; in bare mode the two are the same measurement.
  data[sh] = { path, ...r, bare: r.bare ?? r.open, d: await describe(path), n: r.tab[0].length };
  console.log(`  ${sh.padEnd(8)} ${STACK ? 'cascade' : 'open'} ${r.open.toExponential(3)}`
    + ` -> ideal ${r.conv.toExponential(3)}  = ${(r.open / r.conv).toFixed(1)}x`
    + (STACK ? `   (bare ${data[sh].bare.toExponential(3)}, cascade alone `
      + `${(data[sh].bare / r.open).toFixed(2)}x, both ${(data[sh].bare / r.conv).toFixed(1)}x)` : '')
    + `   |u*| peak ${Math.max(...r.tab[0].map(Math.abs), ...r.tab[1].map(Math.abs)).toFixed(4)}`);
}

/** Build one program's design matrix for a feature spec. */
function rowsFor(sh, spec) {
  const d = data[sh].d, X = [], y = [[], []];
  for (let i = 0; i < d.n; i++) {
    X.push(buildFeats(d, i, spec));
    for (let c = 0; c < 2; c++) y[c].push(data[sh].tab[c][i]);
  }
  return { X, y };
}

/** One leave-one-out fold: fit on `tr`, predict and DELIVER on `te`. */
async function fold(tr, te, v) {
  // A VARIANT MAY GIVE THE TWO CHANNELS DIFFERENT FEATURES. The elbow is consistently half as
  // predictable as the shoulder in every reading this project has taken, so "one map for both" is
  // an assumption rather than a finding, and `specs` lets it be tested rather than inherited.
  const specs = Array.isArray(v.spec) ? v.spec : [v.spec, v.spec];
  const built = specs.map(() => ({}));
  for (const sh of tr.concat([te])) {
    for (let c = 0; c < 2; c++) {
      built[c][sh] = (c === 1 && specs[1] === specs[0]) ? built[0][sh] : rowsFor(sh, specs[c]);
    }
  }
  const pred = [new Float64Array(data[te].n), new Float64Array(data[te].n)];
  const out = [];
  // the rich candidate pool, standardised on the TRAINING programs only, built once per fold
  let cand = null;
  // THE DICTIONARY'S DECISION RULE IS A PROGRAM IT DID NOT FIT, so with one training program there
  // is nothing to decide on and the search is not run rather than run on the fit rows — greedy on
  // training is exactly the failure `_dict.mjs` measured and this guard refuses to reproduce it.
  if (v.dict && tr.length < 2) console.log('   (dictionary needs two training programs — skipped)');
  else if (v.dict) {
    const raw = {}, names = [];
    for (const sh of tr.concat([te])) {
      const d = data[sh].d, rows = [];
      for (let i = 0; i < d.n; i++) rows.push(candBase(d, i).v);
      raw[sh] = rows;
    }
    const st = standardise([].concat(...tr.map((sh) => raw[sh])));
    const nm = candBase(data[tr[0]].d, 0).nm;
    const R = {};
    for (const sh of tr.concat([te])) {
      R[sh] = raw[sh].map((r, i) => {
        const z = r.map((val, j) => (val - st.mu[j]) / st.sd[j]);
        const o = [];
        richTerms(z, nm, o, i === 0 && sh === tr[0] ? names : null);
        return o;
      });
    }
    const cs = standardise([].concat(...tr.map((sh) => R[sh])));
    for (const sh of tr.concat([te])) R[sh] = applyStd(R[sh], cs);
    cand = { R, names };
  }
  for (let c = 0; c < 2; c++) {
    const B = built[c];
    const f = fitChannel(tr.map((sh) => ({ X: B[sh].X, y: B[sh].y[c] })), v.ridge, !!v.std);
    let w = f.w, Zte = applyStd(B[te].X, f.st), inR2 = f.inR2, note = f.note;
    if (cand) {
      const trZ = tr.map((sh) => applyStd(B[sh].X, f.st));
      const trR = tr.map((sh) => cand.R[sh]);
      const trY = tr.map((sh) => B[sh].y[c]);
      const s = dictSelect(trZ, trR, trY, f.ridge, cand.names,
        v.dict.kmax || 12, v.dict.topk || 8);
      const nb = trZ[0][0].length;
      const pen = new Array(nb).fill(1).concat(new Array(s.sel.length).fill(100));
      const X = [], y = [];
      trZ.forEach((Z, p) => Z.forEach((row, i) => {
        X.push(row.concat(s.sel.map((j) => trR[p][i][j]))); y.push(trY[p][i]);
      }));
      w = gramSolve(gram(X, y), f.ridge, pen);
      Zte = Zte.map((row, i) => row.concat(s.sel.map((j) => cand.R[te][i][j])));
      inR2 = r2(X, y, w);
      note = `${s.sel.length} term(s), val ${s.base.toFixed(3)}->${s.cur.toFixed(3)}`;
      if (process.env.IM_DICT_TRACE) console.log(`      ch${c}: ${s.trace.join(' | ')}`);
    }
    for (let i = 0; i < data[te].n; i++) pred[c][i] = predict(Zte[i], w);
    out.push({ inR2, outR2: r2(Zte, B[te].y[c], w), note });
  }
  const built0 = built[0];
  // A SECOND, INDEPENDENT ROUTE TO THE SAME NUMBER (rule 15), and it is worth more than an R^2.
  // If applying u* nulls the error then the error left by applying u-hat is the plant's response
  // to (u* - u-hat), so to the extent the plant is linear the delivered factor should be
  // |u*| / |u* - u-hat| -- a prediction computed WITHOUT the machine. Where it disagrees with the
  // delivered column the disagreement is the finding: either the plant is not acting linearly on
  // the residual, or the residual sits where the plant cannot hear it.
  let su = 0, se = 0;
  for (let c = 0; c < 2; c++) for (let i = 0; i < data[te].n; i++) {
    su += data[te].tab[c][i] ** 2; se += (data[te].tab[c][i] - pred[c][i]) ** 2;
  }
  // THE FIT IS CHECKED ON THE MACHINE, NOT ON ITSELF (rule 16).
  const del = rms(await run(data[te].path, pred, RUNLAPS));
  return { out, del, cols: built0[te].X[0].length, pred, xPred: Math.sqrt(su / Math.max(se, 1e-300)) };
}

// THE MEMORY, TRANSFERRED NAIVELY — the control the whole exercise is against, and it costs three
// runs. Take another program's converged ILC table and index it by PHASE on the program under test,
// which is what a lap-indexed correction does when the program changes. This project has the number
// from two independent routes already (a phase-indexed table worth 125x reads 0.55x on a sine it
// never learned; a classic rung worth 169.8x live reads 0.53x replayed as a table), and having it
// on THIS bench, in THIS metric, is what makes the map's number mean something rather than sound
// large. Anything below 1.00x is a correction that makes the machine worse than doing nothing.
if (!process.env.IM_NO_MEMCTL) {
  console.log('\n  THE MEMORY TRANSFERRED — another program\'s ILC table, indexed by phase');
  console.log('   program     from        delivered');
  for (const te of SHAPES) {
    for (const src of SHAPES.filter((s) => s !== te)) {
      const ns = data[src].n, nt = data[te].n;
      const tab = [0, 1].map((c) => Float64Array.from({ length: nt },
        (_, i) => data[src].tab[c][Math.round((i * ns) / nt) % ns]));
      const del = rms(await run(data[te].path, tab, RUNLAPS));
      console.log(`   ${te.padEnd(10)}  ${src.padEnd(10)}  ${(data[te].open / del).toFixed(2)}x`);
    }
  }
}

console.log('\n  THE MAP, LEAVE-ONE-PROGRAM-OUT. The DELIVERED column is the result; R^2 is context.');
const summary = [];
for (const v of VARIANTS) {
  if (ONLY && !ONLY.some((k) => v.name.includes(k))) continue;
  console.log(`\n  ${v.name}`);
  console.log('   held out    cols   ch   R^2 in    R^2 out    ridge                  DELIVERED'
    + '   (|u*|/|u*-u| predicts)');
  const gains = [], tots = [];
  for (const te of SHAPES) {
    const tr = SHAPES.filter((s) => s !== te);
    const f = await fold(tr, te, v);
    const g = data[te].open / f.del;
    gains.push(g);
    tots.push(data[te].bare / f.del);
    for (let c = 0; c < 2; c++) {
      console.log(`   ${(c === 0 ? te : '').padEnd(9)} ${(c === 0 ? String(f.cols) : '').padStart(5)}`
        + `   ${c}   ${f.out[c].inR2.toFixed(4).padStart(7)}   ${f.out[c].outR2.toFixed(4).padStart(8)}`
        + `   ${f.out[c].note.padEnd(22)}`
        + (c === 0 ? ` ${g.toFixed(2)}x  (ideal ${(data[te].open / data[te].conv).toFixed(1)}x)`
          + `   ${f.xPred.toFixed(2)}x`
          + (STACK ? `   TOTAL ${(data[te].bare / f.del).toFixed(2)}x` : '') : ''));
    }
  }
  const gm = Math.exp(gains.reduce((a, b) => a + Math.log(b), 0) / gains.length);
  const gmT = Math.exp(tots.reduce((a, b) => a + Math.log(b), 0) / tots.length);
  console.log(`   geometric mean delivered  ${gm.toFixed(3)}x`
    + (STACK ? `   over the cascade;  ${gmT.toFixed(3)}x over the bare machine` : ''));
  summary.push({ name: v.name, gains, gm, tots, gmT });
}

console.log('\n  SUMMARY — delivered, leave-one-program-out');
console.log('   variant                     ' + SHAPES.map((s) => s.padStart(9)).join('') + '     geo mean');
for (const s of summary) {
  console.log(`   ${s.name.padEnd(26)}` + s.gains.map((g) => `${g.toFixed(2)}x`.padStart(9)).join('')
    + `${s.gm.toFixed(3)}x`.padStart(13)
    + (STACK ? `   over cascade  |  ${s.gmT.toFixed(3)}x total` : ''));
}

// IS THE LIMIT THE MAP OR THE DATA? A THIRD TRAINING PROGRAM ANSWERS IT, AND IT COSTS THE PROTOCOL
// NOTHING. `diamond` enters the TRAINING set only — it is never a test program and never selected
// on, so the held-out program is as clean as it was above and the only thing that changed is how
// many programs the map was shown. If two-to-three moves the delivered number, the map is
// data-limited and more programs are the lever; if it does not, the map is the limit and features
// are. Those are different pieces of work and nothing so far separates them.
if (CONFIRM && data[CONFIRM] && summary.length) {
  const best = summary.reduce((a, b) => (b.gm > a.gm ? b : a));
  const v = VARIANTS.find((x) => x.name === best.name);
  console.log(`\n  A THIRD TRAINING PROGRAM — "${v.name}", each held-out program fitted on the`
    + ` other two PLUS ${CONFIRM}`);
  console.log('   held out   ch   R^2 in    R^2 out                           DELIVERED');
  const gains = [];
  for (const te of SHAPES) {
    const tr = SHAPES.filter((s) => s !== te).concat([CONFIRM]);
    const f = await fold(tr, te, v);
    const g = data[te].open / f.del;
    gains.push(g);
    for (let c = 0; c < 2; c++) {
      console.log(`   ${(c === 0 ? te : '').padEnd(9)}  ${c}   ${f.out[c].inR2.toFixed(4).padStart(7)}`
        + `   ${f.out[c].outR2.toFixed(4).padStart(8)}   ${f.out[c].note.padEnd(24)}`
        + (c === 0 ? `  ${g.toFixed(2)}x  (two programs ${best.gains[SHAPES.indexOf(te)].toFixed(2)}x,`
          + ` ideal ${(data[te].open / data[te].conv).toFixed(1)}x)` : ''));
    }
  }
  const gm = Math.exp(gains.reduce((a, b) => a + Math.log(b), 0) / gains.length);
  console.log(`   geometric mean delivered  ${gm.toFixed(3)}x   against two programs' `
    + `${best.gm.toFixed(3)}x`);

  // AND THE ONE PROGRAM NO SELECTION HAS TOUCHED. The table above chose a feature set by looking
  // at three held-out programs, which is a selection on held-out data however honest each row is;
  // the guard against it is a program that took part in neither the fits nor the choice. `diamond`
  // is scored ONCE, here, with the winner as it stands.
  console.log(`\n  ${CONFIRM.toUpperCase()} HELD OUT — a geometry in no fit and no selection above`);
  const fc = await fold(SHAPES, CONFIRM, v);
  console.log(`   R^2 out ${fc.out.map((o) => o.outR2.toFixed(4)).join(' / ')}`
    + `   ${data[CONFIRM].open.toExponential(3)} -> ${fc.del.toExponential(3)}`
    + ` = ${(data[CONFIRM].open / fc.del).toFixed(2)}x   (ideal `
    + `${(data[CONFIRM].open / data[CONFIRM].conv).toFixed(1)}x, `
    + `|u*|/|u*-u| predicts ${fc.xPred.toFixed(2)}x)`);
  const fb = await fold(SHAPES, CONFIRM, VARIANTS[0]);
  console.log(`   the same program under the base map: ${(data[CONFIRM].open / fb.del).toFixed(2)}x`);
}
console.log('EXIT 0');
