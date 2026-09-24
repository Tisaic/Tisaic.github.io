// FB_AutoFF's TWIN RUNG, through the one host (test/autoff/host.mjs). The machine here is itself a
// controller-shaped twin, but NOT the block's: it carries a tool payload the block's twin does not
// know about, so the block works on a model that is wrong in the way a real one is (and fast enough
// to run many laps). The lattice arm is the full tier's business (test/flexisim/twin.test.mjs).
import { FB_AutoFF, E_AFF_TWIN, E_AFF_REASON, affTwinName, affReasonName } from '../../lib/autoff/autoff.js';
import { hostOn, nAheadFor, factorOf } from './host.mjs';
import { buildArm, calibrateComp, ikOf, jointProgram, BENCH } from '../../lib/flexisim/bench.js';
import { circle, sharpRect } from '../../lib/flexisim/toolpath.js';
import { twinParams, BENCH_TWIN } from '../../lib/flexisim/twin.js';
import { twinNewState, twinReset, twinStep, twinMeas, TW } from '../../lib/autoff/twin2r.js';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail !== undefined ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\nautoff: the twin rung');

const IDENT = BENCH_TWIN.ident;                // identified from the tool on the bench cell
const m0 = await buildArm(), rc = await calibrateComp(m0), ik = ikOf(m0.arm.L1, m0.arm.L2);
const P_BLOCK = twinParams(m0, rc, IDENT);
const P_MACHINE = twinParams(m0, rc, { ...IDENT, payload: 0.1 });       // what the block's twin does not know
await m0.l1.destroy(); await m0.l2.destroy();

const T = { accel: BENCH.ACCEL, cornerStop: true, dwell: BENCH.JERK };
const J = (path) => jointProgram(path, ik, { smooth: BENCH.JERK });
const A = J(circle({ ...T, r: 3, centre: [13, -1], feed: 3e-3 }));
const B = J(sharpRect({ ...T, w: 5, h: 5, centre: [13, 1], feed: 3e-3 }));
const nAhead = Math.max(nAheadFor(A), nAheadFor(B));
// the machine: a twin with its own physics, settled one lap on the program it starts on
function machine(P, prog) {
  const S = twinNewState(), sp = prog.at(0); twinReset(P, S, sp[0], sp[1]);
  for (let k = 0; k < prog.lap; k++) { const r = prog.at(k); twinStep(P, S, r[0], r[1]); }
  return { meas: (o) => twinMeas(P, S, o), step: (x) => twinStep(P, S, x[0], x[1]) };
}
const plant = { nc: 2 };
const bareOf = (prog) => hostOn(plant, prog, machine(P_MACHINE, prog), { nAhead }).run(null, 2);

// ---------------------------------------------------------------- 1. a program, then another
{
  const fb = new FB_AutoFF({ nChannels: 2, nAhead, aTwinP: P_BLOCK });
  const mA = machine(P_MACHINE, A), hA = hostOn(plant, A, mA, { nAhead });
  fb.in.xEnable = true;
  const seen = new Set(); let twinScansA = 0;
  let lapsToApply = -1, learnLap = -1;
  for (let lap = 0; lap < 12 && lapsToApply < 0; lap++) {
    for (let k = 0; k < A.lap; k++) {
      hA.scan(fb); seen.add(fb.out.eTwinState); if (fb.out.rTwinGain > 0) twinScansA++;
      if (learnLap < 0 && fb.out.eTwinState === E_AFF_TWIN.LEARNING) learnLap = lap;
    }
    if (fb.out.eTwinState === E_AFF_TWIN.APPLIED) lapsToApply = lap + 1;
  }
  check(`with no commissioning, it records a lap, learns on the twin and applies the table (applied from lap ${lapsToApply}; went ${[...seen].map(affTwinName).join(' -> ')})`,
    lapsToApply > 0 && seen.has(E_AFF_TWIN.LEARNING));
  hA.run(fb, 3);
  hA.scan(fb);                                  // the edge: the block judges the lap just completed
  const bareA = bareOf(A), gotA = hA.laps[hA.laps.length - 1], xA = factorOf(gotA, bareA);
  check(`on a machine its twin does not match (a payload it does not know): ${xA.toFixed(2)}x on the program, never having learned on the machine`, xA > 2);
  // two routes to one number (rule 15): the block's running sums against the host's own lap scoring,
  // the lap under the table against the lap the block recorded before learning (lap ${learnLap - 1})
  const hostX = factorOf(gotA, hA.laps[learnLap - 1]);
  check(`the block's own measure agrees with the host's: ${fb.out.rTwinFactor.toFixed(6)}x against ${hostX.toFixed(6)}x`,
    learnLap >= 1 && Math.abs(fb.out.rTwinFactor / hostX - 1) < 1e-9);
  check(`no scan exceeded the budget (peak ${fb.out.udiMacPeak} MAC)`, fb.out.udiMacPeak <= 10000 && fb.out.udiMacPeak > 8000);
  // program B, from an edge: A's table must not act on B for a single scan
  const hB = hostOn(plant, B, mA, { nAhead });
  let leak = 0, gotApplied = -1;
  for (let lap = 0; lap < 12 && gotApplied < 0; lap++) {
    for (let k = 0; k < B.lap; k++) { hB.scan(fb); if (fb.out.rTwinGain > 0 && fb.out.nTwinLap === A.lap) leak++; }
    if (fb.out.eTwinState === E_AFF_TWIN.APPLIED && fb.out.nTwinLap === B.lap) gotApplied = lap + 1;
  }
  check(`another program: the first table never acts on it (${leak} scans), and it gets its own (applied from lap ${gotApplied})`, leak === 0 && gotApplied > 0);
  hB.run(fb, 3);
  const xB = factorOf(hB.laps[hB.laps.length - 1], bareOf(B));
  check(`${xB.toFixed(2)}x on the second program`, xB > 2);
  check(`two tables learned (${fb.out.udiTwinTables}), none refused by the health guard (${affReasonName(fb.out.eTwinReason)})`,
    fb.out.udiTwinTables === 2 && fb.out.eTwinReason === E_AFF_REASON.NONE);
  // a lap run DISARMED (the page records its ghost so) is neither judged nor recorded: the table
  // stays, is off for that lap and the next, and is back after one clean lap
  hB.scan(fb); const judged = fb.out.rTwinFactor;
  fb.in.xArm = false; for (let k = 1; k < B.lap; k++) hB.scan(fb);
  fb.in.xArm = true; hB.scan(fb);
  const offAfter = fb.out.rTwinGain === 0, factorKept = fb.out.rTwinFactor === judged;
  for (let k = 1; k < B.lap; k++) hB.scan(fb);
  hB.scan(fb);
  check(`a disarmed lap is not judged (factor kept at ${judged.toFixed(3)}x), the table is off after it and back after one clean lap (${affTwinName(fb.out.eTwinState)}, ${fb.out.udiTwinTables} tables)`,
    offAfter && factorKept && fb.out.eTwinState === E_AFF_TWIN.APPLIED && fb.out.udiTwinTables === 2);
}

// ---------------------------------------------------------------- 2. the health guard, both halves
async function wrongTwin(noHealth) {
  const P = P_BLOCK.slice();                  // a twin whose links bend the wrong way
  for (let i = TW.M1_0; i < TW.SIZE; i++) if ((i - TW.M1_0) % 6 >= 2 || i >= TW.M2_0) P[i] = i >= TW.M2_0 && (i - TW.M2_0) % 5 < 2 ? P[i] : -3 * P[i];
  for (let mm = 0; mm < 4; mm++) { P[TW.M1_0 + 6 * mm] = P_BLOCK[TW.M1_0 + 6 * mm]; P[TW.M1_0 + 6 * mm + 1] = P_BLOCK[TW.M1_0 + 6 * mm + 1]; }
  const fb = new FB_AutoFF({ nChannels: 2, nAhead, aTwinP: P, xTwinNoHealth: noHealth });
  const h = hostOn(plant, A, machine(P_MACHINE, A), { nAhead });
  fb.in.xEnable = true;
  h.run(fb, 10);
  return { fb, h, x: factorOf(h.laps[h.laps.length - 1], bareOf(A)) };
}
{
  const off = await wrongTwin(true), on = await wrongTwin(false);
  check(`a wrong twin's table makes the machine WORSE when nothing guards it (${off.x.toFixed(2)}x, still ${affTwinName(off.fb.out.eTwinState)})`, off.x < 1 && off.fb.out.eTwinState === E_AFF_TWIN.APPLIED);
  check(`the health guard withdraws it (${affTwinName(on.fb.out.eTwinState)}, ${affReasonName(on.fb.out.eTwinReason)}): the machine is back to ${on.x.toFixed(3)}x`,
    on.fb.out.eTwinState === E_AFF_TWIN.REFUSED && on.fb.out.eTwinReason === E_AFF_REASON.TWIN_WORSE && on.x > 0.999 && on.fb.out.rTwinGain === 0);
}

if (failed) { console.log(`\nautoff twin: ${failed} check(s) FAILED`); process.exit(1); }
console.log('\nautoff twin: all checks passed');
