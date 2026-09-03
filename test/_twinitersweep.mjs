
// DOES ⑩ TRANSFER TO A LONG, OPEN, CNC-SHAPED PROGRAM? (the owner's question)
//
// Every ⑩ measurement in this repository is a CLOSED lap — a square, a circle, a
// rounded rectangle — repeated. A real job is thousands of lines of gcode: one shot,
// not closed, and far longer than a lap. Reading the code says the compile should not
// care: `compileTwin` pads its FFT to N >= span + len(H) + 64, so it is a zero-padded
// LINEAR deconvolution, never a circular one, and ToolPath's `closed` already defaults
// to false. What is genuinely lap-periodic is only the machinery ON TOP of the compile
// — `refineCompiled` (fits at lap harmonics), `applyCompiled` (tiles the penultimate
// lap) and `refineOperator` (bins by lap phase) — and a one-shot program needs none of
// it, because the compiled span IS the program.
//
// That is a code reading, so it is worth nothing until the machine answers (rule 16).
// This drives a SERPENTINE RASTER — a pocket-clearing toolpath, the commonest long
// gcode shape — compiles it through the twin at truth parameters (identification is
// program-independent and already measured; one variable at a time), and scores the
// delivery on the true machine against its own open loop.
import { compileTwin } from '/home/user/Tisaic.github.io/lib/pilot/twin.js';
import { drivePath, twinResponse, armSimulators } from '/home/user/Tisaic.github.io/lib/flexisim/twin.js';
import { ToolPath, SEG } from '/home/user/Tisaic.github.io/lib/flexisim/toolpath.js';
const rig = await import('/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs');
const { makeArm, mkPath, homeArm } = rig;
const SS = 9, PRE = 1500;
const FEED = 0.004, ACC = 4e-5;

// the raster: PASSES sweeps across a 8 x 8 pocket about (12, 0), stepping over between
// them — open, and about an order of magnitude longer than the closed square everything
// else here is measured on
const PASSES = +(process.env.OPEN_PASSES || 10);
const x0 = 8, x1 = 16, y0 = -4, y1 = 4;
const dy = (y1 - y0) / (PASSES - 1);
const pts = [];
for (let i = 0; i < PASSES; i++) {
  const y = y0 + i * dy;
  const [a, b] = i % 2 === 0 ? [x0, x1] : [x1, x0];
  pts.push([a, y], [b, y]);
}
const raster = new ToolPath({ start: pts[0], feed: FEED, accel: ACC, closed: false,
  cornerDt: 40, segments: pts.slice(1).map((p) => [SEG.LINE, p]) });
const sq = mkPath('sharp', FEED);
// THE MATCHED CONTROL (rule 20): the same compile, the same one-shot configuration and
// the SAME metric on the CLOSED sharp square everything else here is measured on. The
// 44x in the record is contour rms over a tiled steady lap — a different metric and a
// different configuration — so it cannot be compared to this bench's joint rms directly.
// Run both through one instrument and the open-vs-closed difference is the only variable.
const openPath = process.env.OPEN_SHAPE === 'square' ? sq : raster;
console.log(`${process.env.OPEN_SHAPE === 'square' ? 'CLOSED sharp square (control)' : `open raster: ${PASSES} passes, ${pts.length} points`}`
  + `, span ${Math.round(openPath.lap)} steps (${(openPath.lap / sq.lap).toFixed(1)}x the sharp square's lap)`);

const destroy = async (m) => { await m.arm.l1.destroy(); await m.arm.l2.destroy(); };
const home = async (m, p) => homeArm(m.arm, m.servo, p);
const sims = armSimulators({ buildArm: () => makeArm(), destroyArm: destroy, home, sample: SS });

console.log('measuring the twin response…');
const H = await twinResponse({ buildArm: () => makeArm(), destroyArm: destroy, path: openPath, sample: SS });

// THE ITERATION SWEEP. `iters: 11` has never been measured — it is a constant of the
// same class as refineOperator's cycles:2, which this session found the page running at
// half the refinement its documentation quoted. Compile cost is LINEAR in
// (program length x iterations), so on a thousand-line program this constant is the
// affordability lever: at 11 iterations a 10-minute job is ~10 h of sliced background
// compute, and if most of the value lands by iteration 3 that becomes ~3 h.
const BUDGETS = (process.env.SWEEP_ITERS || '1,2,3,5,8,11').split(',').map(Number);
const results = [];
for (const it of BUDGETS) {
  const t = Date.now();
  const r = await compileTwin({
    simulate: sims.compileSim(openPath, { laps: 1, preRoll: PRE }), H, iters: it,
  });
  results.push({ it, sim: r.report.rms, du: r.du, min: (Date.now() - t) / 60000 });
  console.log(`  iters ${it}: sim rms ${r.report.rms.toExponential(3)} (${((Date.now() - t) / 60000).toFixed(1)} min)`);
}

// deliver on the TRUE machine: the raw du array through drivePath's interpolating branch
const score = async (du) => {
  const m = await makeArm();
  homeArm(m.arm, m.servo, openPath);
  const out = await drivePath({ arm: m.arm, servo: m.servo, path: openPath, sample: SS,
    steps: Math.ceil(openPath.lap), du, preRoll: du ? PRE : 0 });
  // contour rms over the whole program, in the tool frame
  await destroy(m);
  // SCORE THE PROGRAM, NOT THE PRE-ROLL. drivePath pushes a sample for EVERY step
  // including the pre-roll, so the corrected run carries 1500 samples of holding still
  // at near-zero error while the open-loop run (preRoll 0) carries none — 37% of the
  // corrected record, diluting its rms by sqrt(2558/4058) = 0.79 and inflating the gain
  // by 26%. The two arms of a comparison must share a window (rules 13, 17); the first
  // version of this bench did not and read 10.6x where the truth is below that.
  const e = out.e, skip = du ? PRE : 0;
  let cAcc = 0, cn = 0;
  for (let i = skip; i < e.length; i++) { cAcc += e[i][0] ** 2 + e[i][1] ** 2; cn += 2; }
  return { joint: Math.sqrt(cAcc / cn), n: e.length - skip };
};
const open = await score(null);
console.log(`open loop  : joint rms ${open.joint.toExponential(3)} over ${open.n} samples`);
console.log('\niters   sim rms    delivered   gain    compile');
for (const r of results) {
  const got = await score(r.du);
  console.log(`${String(r.it).padStart(5)}  ${r.sim.toExponential(3)}  ${got.joint.toExponential(3)}  `
    + `${(open.joint / got.joint).toFixed(1).padStart(5)}x  ${r.min.toFixed(1)} min`);
}
console.log('EXIT 0');
