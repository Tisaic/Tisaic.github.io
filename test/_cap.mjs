// THE SHARP SQUARE IS AT ITS CAP, AND THAT INVALIDATES THE READING OF EVERY DEPTH-1 KNOB.
//
// WHAT WENT WRONG IN THE READING. The whole arc above treated this machine as forecast-bound and
// swept the model: the probe hold, the horizon, the kernel's registration, a magnitude penalty,
// the cross model, the lag spacing. The last of those is the one that settles it — log-spaced
// lags lift the SHARP SQUARE's elbow at LEAD 0 from held-out R^2 0.4664 to 0.5545, the single
// binding forecast number in the system, and deliver 3.49x -> 3.51x. Nothing. Every previous null
// of that shape was about MID and FAR leads; this one is at the lead a receding horizon actually
// applies, on the channel that fails, on the program that fails.
//
// AND THE ANSWER WAS IN THE COLUMN BESIDE EVERY SCORE. `uPk` reads 0.600 against a `uCap` of
// 0.600 on the sharp square and the rounded rectangle, in every row of every table today. Those
// two programs are AUTHORITY-bound, not model-bound — which is why every knob that makes the QP
// ask for LESS (`mu`, a longer probe, a longer horizon) helps the CIRCLE, the one program not at
// its cap, and hurts the square. This project already recorded the same thing from the other
// side: "the SOFT corner is AUTHORITY-bound where the stiff was model-bound — at cap 0.5 the
// sharp square reads 4.75x", and `report.binding` exists to say so in one line.
//
// THE MEASUREMENT. Sweep `uCap` at the shipped configuration and read `report.binding` beside the
// score, so the diagnosis and the delivery are in the same table. A cap that is raised until the
// correction comes off it is the honest baseline against which any model change should have been
// judged today.
//
// WHAT WOULD KILL IT: the score flat in `uCap` with `uPk` still pinned. Then the cap is not what
// binds and the peak is being set by something else — the guards, the drive, or the plan's own
// shape — and the diagnosis is wrong again.
import { commissionArm, deployOn, PG } from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const FEED = +(process.env.CA_FEED || 0.004);
const CAPS = (process.env.CA_CAPS || '0.6,1.0,1.5,2.0').split(',').map(Number);
const SHAPES = (process.env.CA_SHAPES || 'sharp,circle,rounded').split(',');
const gm = (v) => Math.exp(v.reduce((a, x) => a + Math.log(x), 0) / v.length);

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}`);
let open = null;
for (const cap of CAPS) {
  const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED }, uCap: cap });
  if (!pilot) { console.log(`  uCap ${cap}: commissioning never terminated`); continue; }
  if (!open) {
    open = {};
    for (const s of SHAPES) open[s] = (await deployOn(pilot, s, false, FEED)).r.totalRms;
    console.log(`open loop: ${SHAPES.map((s) => `${s} ${open[s].toExponential(3)}`).join('  ')}`);
    console.log('\n  uCap' + SHAPES.map((s) => s.padStart(17)).join('') + '     geo mean   binding');
  }
  const xs = [], cols = [];
  for (const s of SHAPES) {
    const d = await deployOn(pilot, s, true, FEED);
    const x = open[s] / d.r.totalRms;
    xs.push(x);
    // AT THE CAP is the diagnostic that matters, so it is printed rather than inferred from uPk.
    const at = d.uPk >= 0.98 * cap ? ' AT CAP' : '       ';
    cols.push(`${x.toFixed(2)}x u${d.uPk.toFixed(3)}${at}`.padStart(24));
  }
  const b = pilot.report && pilot.report.binding ? JSON.stringify(pilot.report.binding) : 'n/a';
  console.log(`  ${cap.toFixed(2)}${cols.join('')}   ${gm(xs).toFixed(2).padStart(9)}   ${b}`);
}
console.log('EXIT 0');
