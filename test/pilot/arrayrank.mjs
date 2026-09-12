/**
 * @file NOT A TEST — HOW MANY INDEPENDENT CHANNELS DOES A BINARY ACTUATOR ARRAY ACTUALLY
 * HAVE? The cheap screen that runs BEFORE a distributed-actuator plant is built.
 *
 * THE QUESTION. A crate of 24 V digital outputs looks like N independent actuators. On a
 * DIFFUSIVE plant it is not: conduction attenuates high spatial frequency, so the steady map
 * from element powers to sensor readings has singular values that decay, and the ones below
 * what the sensors can resolve are channels the array does not have. If 200 elements buy 12
 * channels the hardware is theatre and the right answer is 12 bigger heaters.
 *
 * WHY IT IS A SCREEN AND NOT A RESULT. This is plan §55.12's own lesson transplanted: the
 * KUKA record was vendored, identified and measured over four sections before anyone
 * decomposed its torque and found the inertial term below the fit's residual — a property of
 * the EXCITATION that a one-line calculation would have shown first. The screen there was
 * "decompose the torque"; the screen here is "decompose the map". Rule 1: verify by the
 * cheapest route that can actually falsify the claim, and run it before spending a plant.
 *
 * TWO ROUTES TO ONE NUMBER, because a model checked against itself is not checked (rule 15).
 * The steady operator of a thin lossy plate is A = loss*I + kc*L with L the 5-point Neumann
 * graph Laplacian, so on a rectangular grid its eigenvalues have a CLOSED FORM
 *
 *     lambda(m,n) = loss + 4*kc*( sin^2(pi*m/(2*Nx)) + sin^2(pi*n/(2*Ny)) )
 *
 * and the singular values of the co-located full-array map A^-1 are exactly 1/lambda. The
 * file also ASSEMBLES A, solves A X = I by Cholesky to get A^-1 outright, selects the sensor
 * rows and takes the singular values of what is left through a Jacobi eigensolver on M M'.
 * The closed form and the assembly share no arithmetic; where they are both applicable they
 * must agree, and the agreement is printed as a ratio rather than asserted, because this file
 * asserts nothing.
 *
 * WHAT IT REPORTS, UNFLATTERING FIRST (rule 27): the LIVE channel count — how many modes
 * deliver more than the sensors' own noise at the authority one element actually has — then
 * the condition number, then the decay length that explains both. A count below the element
 * count is the finding, not a failure.
 *
 * UNITS ARE STATED BECAUSE THIS INSTRUMENT CLASS HAS SHIPPED THEM WRONG (rule 17). `kc` is
 * W/K between adjacent cell centres and for SQUARE cells equals k*thickness with no pitch in
 * it (the cross-section grows with pitch exactly as the gradient's baseline does, so they
 * cancel); `loss` is W/K per cell and DOES carry pitch^2. Getting that backwards makes the
 * decay length scale with pitch instead of being independent of it, which is the wrong
 * qualitative answer.
 *
 * KNOBS: NX, NY, PITCH, NOISE (K rms per sensor), AUTH (W of correction authority per
 * element, NOT its full rating — an array delivering a profile spends most of its power on
 * the mean), SENSX and SENSY (sensors per axis, each <= the grid, so a coarser sensor grid can
 * be priced), CUT (the cross-talk fraction the last block reads a verdict at — the one
 * arbitrary constant here and stated as such), SUBSTRATE (one name, or `all`). Nothing here
 * imports from lib/ and nothing is a default anywhere.
 *
 * AND THE CONVECTION COEFFICIENT IS AN ESTIMATE, NOT A MEASUREMENT. `h` is a combined
 * convective-plus-radiative figure over BOTH faces, taken as 12-15 W/(m^2 K); it sets the
 * decay length through sqrt(kc/loss) and so moves every count in the table. The ORDERING of
 * the substrates is what this file claims, and the invariance control is what supports that
 * rather than the absolute counts.
 */
const env = (k, d) => (process.env[k] === undefined ? d : Number(process.env[k]));
const NX = env('NX', 20), NY = env('NY', 10);
const PITCH = env('PITCH', 0.06);           // m between element centres
const NOISE = env('NOISE', 0.35);           // K rms per sensor — the barrel rig's own figure
const AUTH = env('AUTH', 4);                // W of swing per element about its operating point
const SENSX = env('SENSX', NX), SENSY = env('SENSY', NY);
const WANT = process.env.SUBSTRATE || '';

// --------------------------------------------------------------- substrates
// k  W/(m K) | rhoc J/(m^3 K) | thickness m | h W/(m^2 K) effective, both faces
const SUBSTRATES = [
  ['steel sheet 6 mm',      45,  3.85e6, 0.006, 15],
  ['steel plate 20 mm',     45,  3.85e6, 0.020, 15],
  ['aluminium 20 mm',      200,  2.42e6, 0.020, 15],
  ['aluminium 40 mm',      200,  2.42e6, 0.040, 15],
  ['glass 6 mm',           1.0,  2.00e6, 0.006, 15],
  ['composite tool 10 mm', 0.8,  1.60e6, 0.010, 12],
];

// --------------------------------------------------------------- linear algebra
/** Cholesky solve for a symmetric positive definite A against many right-hand sides. */
function cholSolve(A, B, n, m) {
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i * n + j];
      for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
      if (i === j) {
        if (s <= 0) throw new Error(`not positive definite at ${i} (pivot ${s})`);
        L[i * n + i] = Math.sqrt(s);
      } else L[i * n + j] = s / L[j * n + j];
    }
  }
  const X = new Float64Array(n * m);
  for (let c = 0; c < m; c++) {
    for (let i = 0; i < n; i++) {
      let s = B[i * m + c];
      for (let k = 0; k < i; k++) s -= L[i * n + k] * X[k * m + c];
      X[i * m + c] = s / L[i * n + i];
    }
    for (let i = n - 1; i >= 0; i--) {
      let s = X[i * m + c];
      for (let k = i + 1; k < n; k++) s -= L[k * n + i] * X[k * m + c];
      X[i * m + c] = s / L[i * n + i];
    }
  }
  return X;
}
/** Eigenvalues of a symmetric matrix by cyclic Jacobi, descending. */
function symEig(Ain, n) {
  const A = Float64Array.from(Ain);
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i * n + j] ** 2;
    if (off <= 1e-30) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      const apq = A[p * n + q];
      if (Math.abs(apq) < 1e-300) continue;
      const theta = (A[q * n + q] - A[p * n + p]) / (2 * apq);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) {
        const akp = A[k * n + p], akq = A[k * n + q];
        A[k * n + p] = c * akp - s * akq; A[k * n + q] = s * akp + c * akq;
      }
      for (let k = 0; k < n; k++) {
        const apk = A[p * n + k], aqk = A[q * n + k];
        A[p * n + k] = c * apk - s * aqk; A[q * n + k] = s * apk + c * aqk;
      }
    }
  }
  const e = [];
  for (let i = 0; i < n; i++) e.push(A[i * n + i]);
  return e.sort((a, b) => b - a);
}

// --------------------------------------------------------------- the plate
/** kc W/K between adjacent square cells; loss W/K per cell; cap J/K per cell. */
function constants(k, rhoc, thick, h) {
  return { kc: k * thick, loss: h * PITCH * PITCH, cap: rhoc * thick * PITCH * PITCH };
}
/** CLOSED FORM: the co-located full-array steady gains, K per W, descending. */
function gainsClosed(c) {
  const g = [];
  for (let m = 0; m < NX; m++) for (let n = 0; n < NY; n++) {
    const lam = c.loss + 4 * c.kc * (Math.sin(Math.PI * m / (2 * NX)) ** 2
                                   + Math.sin(Math.PI * n / (2 * NY)) ** 2);
    g.push(1 / lam);
  }
  return g.sort((a, b) => b - a);
}
/** ASSEMBLED: build A, solve against the sensor/heater selection, take singular values. */
function gainsAssembled(c, sensIdx) {
  const N = NX * NY;
  const A = new Float64Array(N * N);
  const at = (x, y) => x + NX * y;
  for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
    const i = at(x, y);
    A[i * N + i] += c.loss;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const u = x + dx, v = y + dy;
      if (u < 0 || v < 0 || u >= NX || v >= NY) continue;   // Neumann: no flux out
      A[i * N + i] += c.kc; A[i * N + at(u, v)] -= c.kc;
    }
  }
  const I = new Float64Array(N * N);
  for (let i = 0; i < N; i++) I[i * N + i] = 1;
  const X = cholSolve(A, I, N, N);                          // X = A^-1, one heater per cell
  const ns = sensIdx.length;
  const MMt = new Float64Array(ns * ns);                    // M = S A^-1, so M M' is ns x ns
  for (let a = 0; a < ns; a++) for (let b = a; b < ns; b++) {
    let s = 0;
    for (let j = 0; j < N; j++) s += X[sensIdx[a] * N + j] * X[sensIdx[b] * N + j];
    MMt[a * ns + b] = s; MMt[b * ns + a] = s;
  }
  return symEig(MMt, ns).map((v) => Math.sqrt(Math.max(0, v)));
}
/**
 * CROSS-TALK: what fraction of an element's steady effect lands on cells OTHER than its own.
 * This is the number the business case rests on and nothing above reports it. A per-zone PID
 * sees only its own sensor, so it is blind to exactly this fraction; where it is near zero the
 * zones are independent, the incumbent is already near-optimal, and a whole-field controller has
 * nothing to win however many channels the array has. Measured on the interior column of the
 * grid so no Neumann edge inflates it.
 */
function crossTalk(c) {
  const N = NX * NY;
  const A = new Float64Array(N * N);
  const at = (x, y) => x + NX * y;
  for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
    const i = at(x, y);
    A[i * N + i] += c.loss;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const u = x + dx, v = y + dy;
      if (u < 0 || v < 0 || u >= NX || v >= NY) continue;
      A[i * N + i] += c.kc; A[i * N + at(u, v)] -= c.kc;
    }
  }
  const j = at(NX >> 1, NY >> 1);                 // one interior element
  const e = new Float64Array(N); e[j] = 1;
  const col = cholSolve(A, e, N, 1);              // the steady field one element produces
  let tot = 0;
  for (let i = 0; i < N; i++) tot += col[i];
  // AND THE DENOMINATOR CARRIES A FREE CONSERVATION CHECK ON THE SOLVE (rule 15, and the
  // cheapest possible form of it). In steady state every watt injected leaves through the loss
  // term and conduction is internal, so sum(loss * T_i) = P for ANY element: sum(T_i) = 1/loss
  // exactly, wherever the element sits. That is a property of the physics and not of the
  // arithmetic, so it validates the Cholesky independently of the eigensolver above. Reported,
  // not asserted — this file asserts nothing — but a drift here invalidates every number.
  const conserve = tot * c.loss;                  // must be 1
  return { off: 1 - col[j] / tot, self: col[j], conserve };
}

/** Sensor cells, a coarser grid than the heaters where SENSX/SENSY are smaller. */
function sensors() {
  const idx = [];
  for (let b = 0; b < SENSY; b++) for (let a = 0; a < SENSX; a++) {
    const x = Math.round((a + 0.5) * NX / SENSX - 0.5), y = Math.round((b + 0.5) * NY / SENSY - 0.5);
    idx.push(x + NX * y);
  }
  return [...new Set(idx)];
}

// --------------------------------------------------------------- report
const live = (g) => g.filter((v) => v * AUTH > NOISE).length;
const fmt = (v, w, d = 2) => v.toFixed(d).padStart(w);

const sensIdx = sensors();
console.log(`\nARRAY RANK SCREEN — is a ${NX}x${NY} = ${NX * NY} element array actually `
  + `${NX * NY} channels?\n`);
console.log(`  pitch ${PITCH * 1000} mm · ${sensIdx.length} sensors at ${NOISE} K rms · `
  + `${AUTH} W of authority per element`);
console.log(`  LIVE = modes whose weakest singular value still delivers more than the sensor `
  + `noise.\n`);
console.log('  substrate                LIVE  of    cond   weakest  decay     tau_slow  tau_fast');
console.log('  ' + '-'.repeat(84));

const rows = [];
for (const [name, k, rhoc, thick, h] of SUBSTRATES) {
  if (WANT && WANT !== 'all' && !name.startsWith(WANT)) continue;
  const c = constants(k, rhoc, thick, h);
  const gC = gainsClosed(c);
  const gA = gainsAssembled(c, sensIdx);
  const g = gA;                                   // the assembled map is what a rig would have
  const nLive = live(g), wk = g[g.length - 1];
  const decay = Math.sqrt(c.kc / c.loss);         // steady attenuation length, in CELL PITCHES
  // Dynamic: mode k relaxes at cap/lambda, and lambda = 1/gain, so tau = cap * gain.
  const tauSlow = c.cap * gC[0], tauFast = c.cap * gC[gC.length - 1];
  rows.push({ name, gC, gA, nLive, wk, decay, tauSlow, tauFast, c });
  console.log(`  ${name.padEnd(22)} ${String(nLive).padStart(4)} ${String(g.length).padStart(4)}`
    + ` ${fmt(g[0] / wk, 7, 0)} ${fmt(wk * AUTH, 9, 3)} K ${fmt(decay, 6)} cells`
    + ` ${fmt(tauSlow, 9, 1)} s ${fmt(tauFast, 8, 2)} s`);
}

// -------------------------------------------- rule 15: the two routes must agree
if (sensIdx.length === NX * NY) {
  console.log('\n  CLOSED FORM vs ASSEMBLED (co-located full array — they must agree):');
  let worst = 0, worstName = '';
  for (const r of rows) {
    let w = 0;
    for (let i = 0; i < r.gC.length; i++) w = Math.max(w, Math.abs(r.gA[i] / r.gC[i] - 1));
    if (w > worst) { worst = w; worstName = r.name; }
    console.log(`    ${r.name.padEnd(22)} max |ratio-1| = ${w.toExponential(2)}`);
  }
  console.log(`  worst ${worst.toExponential(2)} on ${worstName} — `
    + (worst < 1e-8 ? 'AGREE, so neither route is the answer alone (rule 15).'
                    : 'DISAGREE: one of the two is wrong, and the numbers above are not usable.'));
} else {
  console.log(`\n  CLOSED FORM check SKIPPED — it only applies to a co-located full array and`
    + ` SENSX/SENSY select ${sensIdx.length} of ${NX * NY} cells (rule 25: skipped, not passed).`);
}

// -------------------------------------------- WHICH CONSTRAINT BINDS: sensors or diffusion?
// The purchasing question, and the two answers are bought from different suppliers. Where LIVE
// tracks the sensor count the array is sensor-limited and more thermocouples buy channels;
// where it saturates below it the DIFFUSION binds and more thermocouples buy nothing.
console.log('\n  WHO BINDS — LIVE channels against the number of sensors fitted:');
const ladders = [[5, 2], [10, 5], [14, 7], [20, 10]];
let hdr = '    substrate             ';
for (const [a, b] of ladders) hdr += String(a * b).padStart(8);
console.log(hdr + '   marginal yield at the top of the ladder');
for (const [name, k, rhoc, thick, h] of SUBSTRATES) {
  if (WANT && WANT !== 'all' && !name.startsWith(WANT)) continue;
  const c = constants(k, rhoc, thick, h);
  let line = `    ${name.padEnd(22)}`;
  const counts = [];
  for (const [a, b] of ladders) {
    const idx = [];
    for (let q = 0; q < b; q++) for (let p = 0; p < a; p++)
      idx.push(Math.round((p + 0.5) * NX / a - 0.5) + NX * Math.round((q + 0.5) * NY / b - 0.5));
    const n = live(gainsAssembled(c, [...new Set(idx)]));
    counts.push(n); line += String(n).padStart(8);
  }
  // THE VERDICT IS THE MARGINAL YIELD, not saturation. A first draft called aluminium
  // "saturated" while its count was still rising 48 -> 69, which is sub-linear and not
  // saturated — an overstatement in the direction that made the screen look decisive. What a
  // purchaser needs is channels gained per sensor ADDED at the top of the ladder (rule 19:
  // match the metric's support to the claim's).
  const nS = ladders.map(([a, b]) => a * b);
  const n = counts.length - 1;
  const yld = (counts[n] - counts[n - 1]) / (nS[n] - nS[n - 1]);
  console.log(line + `   ${fmt(yld, 5)} channel/sensor — `
    + (yld > 0.8 ? 'SENSOR-LIMITED, buy thermocouples'
     : yld > 0.3 ? 'mixed: diffusion is starting to bite'
                 : 'DIFFUSION-LIMITED, thermocouples are nearly wasted'));
}

// -------------------------------------------- is the screen measuring the PLATE or my constants?
// NOISE and AUTH are ONE knob, not two: live requires sigma*AUTH > NOISE, i.e. sigma > NOISE/AUTH,
// so only the RATIO enters and a sweep over both would be a sweep over one pretending to be two
// (rule 17). What has to be shown is that the ORDERING of the substrates does not depend on where
// that ratio is set — if it did, the table above would be reporting my choice of instrument rather
// than the plate's physics. Swept over four decades:
console.log('\n  INVARIANCE CONTROL — does the ORDERING survive the one knob? (NOISE/AUTH, K per W)');
let hdr2 = '    NOISE/AUTH  ';
for (const r of rows) hdr2 += r.name.slice(0, 9).padStart(11);
console.log(hdr2);
// THE FIRST VERSION OF THIS CONTROL FAILED ON ITS OWN METRIC AND THE METRIC WAS THE FAULT.
// It compared the full RANKING as a permutation string and read "3 distinct orderings, the
// ranking moves with the knob" — but at the two lowest ratios every substrate reads 200 and
// ties, so their permutation is whatever the sort happened to produce. A permutation cannot
// express a tie. The claim is "no substrate and no other ever swap places", and its metric is
// therefore pairwise INVERSIONS with ties compatible with anything (rule 19).
const counts2 = [];
const RATIOS = [8.75e-4, 8.75e-3, 8.75e-2, 8.75e-1];
for (const ratio of RATIOS) {
  const cnt = rows.map((r) => r.gA.filter((v) => v > ratio).length);
  counts2.push(cnt);
  let line = `    ${ratio.toExponential(2).padStart(10)}  `;
  for (const n of cnt) line += String(n).padStart(11);
  console.log(line + (new Set(cnt).size === 1 ? '   (all tied — no information)' : ''));
}
let inv = 0, pairs = 0;
for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
  const signs = new Set(counts2.map((c) => Math.sign(c[i] - c[j])).filter((v) => v !== 0));
  if (signs.size) pairs++;
  if (signs.size > 1) inv++;
}
console.log(`  ${inv} inversions over ${pairs} discriminating pairs across four decades — `
  + (inv === 0 ? 'the ranking is the PLATE, not the instrument.'
               : 'a pair SWAPS, so the table above is partly about my constants.'));
console.log('  (0.0875 K/W is the shipped 0.35 K / 4 W. Only the bottom two rows discriminate:'
  + '\n   below some ratio every mode is live on every plate, and the tie carries nothing.)');

// -------------------------------------------- WHERE THE VALUE IS, WHICH IS NOT WHERE THE CHANNELS ARE
// AND THIS IS THE SCREEN REFUTING ITS OWN BEST ROWS. Glass and composite carry all 200 channels
// and a condition number of 2, which reads as the ideal substrate — and their decay length is a
// THIRD of a cell, so each element heats essentially only its own zone. Independent zones are
// what a per-zone PID is already optimal for, so the substrate where the array is most capable is
// the substrate where the incumbent has no deficit to attack. The two refusals in the LIVE table
// and the two here are for OPPOSITE reasons, and only the middle survives both.
// THE 0.35 CUT IS A STATED CHOICE WITH NO MEASUREMENT BEHIND IT and is the one arbitrary
// constant in this file — how much cross-talk a per-zone loop must be blind to before a
// whole-field controller can beat it is a machine question, not an arithmetic one. The PERCENTAGE
// is the finding; the verdict word is a reading of it, and the summary below is COUNTED from the
// rows rather than written beside them, because a first draft said "two rows have no coupling"
// where only one does (rules 17, 30).
const CUT = env('CUT', 0.35);
console.log('\n  WHERE THE VALUE IS — cross-talk is the deficit a per-zone PID is blind to:');
console.log(`    substrate              off-zone  LIVE   verdict   (cut ${CUT}, stated not measured)`);
let nFlat = 0, nThin = 0, nGood = 0;
let worstCons = 0;
for (const r of rows) {
  const ct = crossTalk(r.c);
  worstCons = Math.max(worstCons, Math.abs(ct.conserve - 1));
  const coupled = ct.off > CUT, ranked = r.nLive > 0.5 * NX * NY;
  if (!coupled) nFlat++; else if (!ranked) nThin++; else nGood++;
  console.log(`    ${r.name.padEnd(22)} ${fmt(100 * ct.off, 7, 1)}%  ${String(r.nLive).padStart(4)}   `
    + (!coupled ? 'zones are INDEPENDENT — per-zone PID is already near-optimal'
     : !ranked  ? 'coupled, but the array collapses to a few channels'
                : 'COUPLED and full rank — this is the cell worth building'));
}
console.log(`  energy balance sum(loss*T) / P, worst over the six: |1 - ${(1 + worstCons).toFixed(12)}|`
  + ` = ${worstCons.toExponential(2)}`);
console.log('  — a conservation law the solve cannot satisfy by accident, so the Cholesky is sound'
  + ' independently of the eigensolver.');
console.log(`  ${nFlat} refused for too LITTLE coupling, ${nThin} for too much, ${nGood} survive`
  + ' both — the screen can say');
console.log('  no in either direction and does, which is rule 9 arriving from the data rather than');
console.log('  from a second assertion. The surviving rows are what a rig should be built on.');

// -------------------------------------------- what the count implies for the deployed map
// AND THE FIRST DRAFT OF THIS BLOCK WAS WRONG IN THE DIRECTION THAT FLATTERED THE SCREEN.
// It printed "the budget FORBIDS a map per element" against 200 x 40 = 8,000 MAC, which is
// 80% of budget and therefore FITS. What the budget actually forbids is a per-element map at
// a REAL feature count: the arm's shipped policy is 93 features, and 200 x 93 is 186%. So the
// screen's value is not that a modal map is forced — at 40 taps it is not — but that it is
// forced once the window is wide enough to reach the plant's own memory (rule 37), and that
// it leaves room for everything else on the scan. Rule 17 aimed at this file's own summary.
console.log('\n  WHAT IT COSTS ON THE PLC (10,000 MAC per 1 ms scan, target 6):');
console.log('    channels  taps   MAC/decision   % budget   fits?');
const TAPS = [40, 93];
const chans = [...new Set(rows.map((r) => r.nLive))].sort((a, b) => a - b);
for (const nm of chans) for (const taps of TAPS) {
  const mac = nm * taps, pc = 100 * mac / 10000;
  console.log(`    ${String(nm).padStart(8)}  ${String(taps).padStart(4)}   `
    + `${String(mac).padStart(12)}   ${fmt(pc, 7, 1)}%   ${pc <= 100 ? 'yes' : 'NO'}`);
}
console.log(`\n  93 taps is the arm's own shipped feature count, so it is the honest column: a`);
console.log(`  per-element map at that width is ${NX * NY} x 93 = ${NX * NY * 93} MAC, `
  + `${(100 * NX * NY * 93 / 10000).toFixed(0)}% of budget and out.`);
console.log(`  NOTHING HERE IS MEASURED ON A MACHINE. It is arithmetic on a plate's constants,`);
console.log(`  and its only job is to say which substrate is worth building a rig for.\n`);
