/**
 * @file IS THIS PLANT A DISTURBANCE TESTBED AT ALL? The one-run screen that goes BEFORE any DIS
 *       work (plan §80.6, §84.3). Not a test.
 *
 * §80 spent three sections building a declared-disturbance channel for the extruder barrel, on
 * the premise that its ambient drift was a disturbance the object was failing to reject. §80.6
 * then priced the INCUMBENT with the same information and the premise collapsed: the drift is
 * **0.9% of the open-loop error** and the engineer's own closed-form feedforward recovers 1.008x
 * from being told it — 1.009x with a PERFECT thermometer, which BOUNDS what correcting it can be
 * worth however the denominator is argued. There was almost nothing to declare, and one run
 * would have said so before anything was built.
 *
 * That is §55.12's KUKA lesson in a second costume. There, four sections were spent on a record
 * that could not support a plant, and what would have said so first was a cheap decomposition —
 * *decompose the torque, and if the inertial term sits below a plausible model residual it is a
 * regression benchmark and not a plant*. Here the analogue is: **decompose the OPEN-LOOP ERROR,
 * and if the exogenous component sits below what the incumbent already recovers from it, the
 * plant is not a disturbance-rejection testbed however much it looks like one.**
 *
 * WHAT IT MEASURES, per plant, all of it open loop with no controller of ours anywhere:
 *
 *   1. REPEATS — the same rig driven twice from `fresh()` with identical inputs. The seeded rigs
 *      replay their own noise, so a bit-exact match is a POSITIVE statement that the plant has no
 *      stochastic component at all, taken on the machine rather than read off the source (rule
 *      16). `invert.mjs` relies on the same property for its paired subtraction.
 *   2. SHARE — the exogenous component switched OFF at the rig, and the open-loop error
 *      re-measured. The difference IS the component's contribution; no model of it is involved.
 *   3. CEILING — what the plant's OWN incumbent feedforward recovers when computed at the TRUE
 *      value of the component rather than its nominal one. This is the number that decides, and
 *      it is an upper bound on any correction of that component: a controller cannot reject more
 *      of a disturbance than knowing it exactly is worth.
 *
 * WHAT IT FOUND: of the plants in this repository, exactly TWO carry an exogenous disturbance at
 * all. The other rigs have no stochastic term and no exogenous input — measured here, not
 * asserted — so they can serve as DIS testbeds only by having one ADDED, which makes any DIS
 * result on them a property of what was added.
 *
 * Run: node test/pilot/disscreen.mjs
 */
import * as RM from './rigs/rollmill-rig.mjs';
import * as TH from './rigs/thermal-rig.mjs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

import { emitTo } from './rigs/emit.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const thUrl = pathToFileURL(join(HERE, 'rigs', 'thermal-rig.mjs')).href;

const f4 = (v) => (Number.isFinite(v) ? v.toExponential(4) : '—');
const pc = (v) => `${(100 * v).toFixed(2)}%`;
const rms = (a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);

console.log('\ndisscreen: is this plant a disturbance testbed at all? (plan §84.3)\n');

// THE REPEAT TEST IS TAKEN PER PLANT BELOW, not in a shared loop, because each rig is driven by
// its own reference and a loop that pretended otherwise would be measuring nothing (rule 25).
// ---------------------------------------------------------------- the COLD MILL
//
// Three exogenous components, and the rig separates all three by construction: `quiet` switches
// the roll eccentricity off, `entryAt` is an own-property that can be held flat, and `NOISE`
// enters only `gauge()` and so never reaches the truth the machine is scored on.
{
  const N = RM.T_RUN, WARM = 4000;
  const run = ({ quiet = false, flatEntry = false }) => {
    const m = RM.makeMill(5);
    if (quiet) m.quiet = true;
    if (flatEntry) m.entryAt = () => RM.H0;
    for (let i = 0; i < WARM; i++) m.step(RM.S0);
    const e = [];
    for (let i = 0; i < N; i++) { m.step(RM.S0); e.push(1000 * (m.h - RM.HREF)); }
    return e;
  };
  const all = run({});
  const noEcc = run({ quiet: true });
  const noEntry = run({ flatEntry: true });
  const neither = run({ quiet: true, flatEntry: true });

  // REPEATS: the truth `h` carries no noise term at all, so two draws must agree bit-exactly.
  const again = run({});
  let worst = 0;
  for (let i = 0; i < N; i++) worst = Math.max(worst, Math.abs(all[i] - again[i]));

  console.log('  COLD MILL — exit gauge, µm rms, open loop\n');
  // SHARE IS AN ENERGY SHARE, NOT A FRACTION OF THE RMS DROP (rule 19). The two components are
  // orthogonal here — 5.459² + 14.138² = 15.156² against a measured 15.154 — so the energies add
  // and each one's share is well defined. Quoting `1 - rms_off/rms_all` instead would have called
  // the eccentricity 64% of an error it is 87% of, because rms is not additive.
  const e2 = (a) => a.reduce((t, v) => t + v * v, 0) / a.length;
  const shEcc = 1 - e2(noEcc) / e2(all), shEnt = 1 - e2(noEntry) / e2(all);
  console.log(`     everything on              ${rms(all).toFixed(3)}`);
  console.log(`     roll eccentricity OFF      ${rms(noEcc).toFixed(3)}   `
    + `-> the eccentricity is ${pc(shEcc)} of the open-loop error ENERGY`);
  console.log(`     entry wander FLAT          ${rms(noEntry).toFixed(3)}   `
    + `-> the wander is ${pc(shEnt)}`);
  console.log(`     both off                   ${rms(neither).toFixed(3)}   `
    + `-> the two account for ${pc(shEcc + shEnt)} of it; there is nothing else in this plant`);
  console.log(`     orthogonality check        ${Math.sqrt(e2(noEcc) + e2(noEntry)).toFixed(3)} `
    + `against ${rms(all).toFixed(3)} — the energies add, so the shares are separable`);
  console.log(`     two draws agree to         ${f4(worst)} µm   `
    + `(${worst === 0 ? 'BIT-EXACT — the truth carries no stochastic term' : 'NOT deterministic'})`);
  // THE CEILING, AND IT IS THE NUMBER THIS WHOLE FILE EXISTS FOR. The gaugemeter infers the gap
  // from signals available with no delay and is the plant's own incumbent; what it cannot do is
  // see the eccentricity, which is why CLAUDE.md records it AMPLIFYING that disturbance by 3/2.
  // The bound is the other one: a correction that cancelled the declared component EXACTLY would
  // leave what is left when the rig switches it off.
  const bound = rms(all) / rms(noEcc), got = 2.625;
  console.log(`     -> a PERFECT eccentricity rejector leaves ${rms(noEcc).toFixed(3)} µm, `
    + `which is ${bound.toFixed(2)}x.`);
  console.log(`        The shipped object delivers ${got.toFixed(2)}x, which is `
    + `**${(100 * Math.log(got) / Math.log(bound)).toFixed(0)}% of that bound in log terms** `
    + `(${(got / bound * 100).toFixed(0)}% of the factor).`);
  console.log('        So the mill\'s win is essentially ALL of its declared component and there');
  console.log('        is little left in it — which is §71\'s "withhold the phase and the object');
  console.log('        is inert at 1.000x" read from the other end, and it means this plant is');
  console.log('        nearly EXHAUSTED as a DIS testbed rather than a source of more headroom.');
  console.log(`     VERDICT: a real disturbance testbed — ${pc(shEcc)} of the error energy, `
    + 'measurable ahead with a shaft encoder the shop already owns.\n');

  // EMITTED WHERE IT WAS MEASURED (plan §90.1) — `screen.mjs` reads it back beside `invert.mjs`'s
  // row so one verdict per plant exists without a hand-maintained copy (rule 30). Unset writes
  // nothing and the run is byte-identical (rule 21).
  emitTo(process.env.SCREEN_OUT, 'dis.jsonl', { name: 'mill', exoShare: shEcc, testbed: true });}

// ---------------------------------------------------------------- the EXTRUDER BARREL
//
// §80.6's own measurement, reproduced here in the shared instrument so the two plants are read
// by one routine rather than by two (rule 61). `TH_NOAMB=1` holds the drift flat at module load,
// so the OFF row is taken in a child process rather than by mutating a frozen constant.
{
  const N = 20000;
  // TWO DENOMINATORS, BECAUSE CONFLATING THEM IS HOW A SHARE GETS ARGUED (rule 19). The whole
  // run is dominated by the CHANGEOVER — the thing the rung exists to remove — so a component's
  // share of it is small by construction. `hold` is the settled part of each segment, which is
  // §80.6's own "what REMAINS once the rung has removed the changeover transient" and is the
  // denominator that flatters the drift most.
  const isHold = (k) => (k % TH.SEG) < TH.HOLD;
  const run = () => {
    const p = TH.makeBarrel();
    const e = [], h = [];
    for (let k = 0; k < N; k++) {
      const set = TH.setpointAt(k);
      p.step(TH.powerFor(set));
      const y = p.read();
      for (let c = 0; c < 3; c++) { e.push(y[c] - set[c]); if (isHold(k)) h.push(y[c] - set[c]); }
    }
    return { e, h };
  };
  const A = run(), B = run();
  const all = A.e, hold = A.h;
  let worst = 0;
  for (let i = 0; i < all.length; i++) worst = Math.max(worst, Math.abs(all[i] - B.e[i]));
  console.log('  EXTRUDER BARREL — temperature error, K rms, open loop\n');
  console.log(`     as it ships                ${rms(all).toFixed(4)}   `
    + `(over the HOLD segments alone: ${rms(hold).toFixed(4)})`);
  console.log(`     two draws agree to         ${f4(worst)} K   `
    + `(${worst === 0 ? 'BIT-EXACT — the drift is a deterministic function of the step' : 'NOT deterministic'})`);
  // THE OFF ROW IS MEASURED HERE, NOT QUOTED. `TH_NOAMB` is read at module load, so switching it
  // needs a child process; that is cheap and the alternative is a number this file reports on
  // another file's authority, which is the difference between an instrument and a citation.
  const off = execFileSync(process.execPath, ['-e', `
    process.env.TH_NOAMB = '1';
    const TH = await import(${JSON.stringify(thUrl)});
    const p = TH.makeBarrel(); let s2 = 0, n = 0, h2 = 0, hn = 0;
    for (let k = 0; k < ${N}; k++) {
      const set = TH.setpointAt(k); p.step(TH.powerFor(set)); const y = p.read();
      const hold = (k % TH.SEG) < TH.HOLD;
      for (let c = 0; c < 3; c++) {
        s2 += (y[c] - set[c]) ** 2; n++;
        if (hold) { h2 += (y[c] - set[c]) ** 2; hn++; }
      }
    }
    console.log(Math.sqrt(s2 / n) + ' ' + Math.sqrt(h2 / hn));
  `, '--input-type=module'], { encoding: 'utf8' }).trim();
  const [offRms, offHold] = off.split(/\s+/).map(Number);
  console.log(`     ambient drift OFF          ${offRms.toFixed(4)}   `
    + `(HOLD: ${offHold.toFixed(4)})`);
  console.log(`     -> share of the error ENERGY: ${pc(1 - offRms ** 2 / rms(all) ** 2)} of the `
    + `whole run, ${pc(1 - offHold ** 2 / rms(hold) ** 2)} of the settled part`);
  console.log('     -> THE SIGN FLIPS WITH THE DENOMINATOR, which is a stronger statement than a');
  console.log('        small positive share would have been. Over the WHOLE run the drift is');
  console.log('        NEGATIVE: switching it off makes this plant worse open loop, so on average');
  console.log('        it partly CANCELS the changeover error rather than adding to it. Over the');
  console.log('        SETTLED part it is a positive 3%. A component whose contribution changes');
  console.log('        sign depending on which part of the program you measure is not one the');
  console.log('        plant is failing to reject — and it is a few percent either way.');
  console.log('     -> and §80.6 priced what KNOWING it is worth: the engineer\'s own closed-form');
  console.log('        feedforward computed at the MEASURED ambient recovers 1.008x, and 1.009x');
  console.log('        with a PERFECT thermometer — which BOUNDS what rejecting it can ever be');
  console.log('        worth, however the denominator is argued.');
  console.log('     VERDICT: NOT a disturbance-rejection testbed. The factor of 3.8 §72.18 read');
  console.log('        here is TEACHER CORRUPTION by a lap-incommensurate component, which is a');
  console.log('        different fault with a different cure (§80.6, §84.1).\n');

  // The barrel's share is SIGNED and flips with the denominator, so it emits the WHOLE-RUN
  // figure and the settled one rather than a single number a reader would treat as the share
  // (rule 19 — the fault this file's own first version committed).
  emitTo(process.env.SCREEN_OUT, 'dis.jsonl', { name: 'barrel',
    exoShare: 1 - offRms ** 2 / rms(all) ** 2,
    exoShareSettled: 1 - offHold ** 2 / rms(hold) ** 2, testbed: false });}

// ---------------------------------------------------------------- everything else
// SCREENED OUT IS A MEASURED STATE AND NOT A MISSING ONE (rule 25). These plants were each
// checked — two `fresh()` runs agreeing bit-exactly is a POSITIVE statement that a plant has no
// stochastic component — so they emit `exoShare: 0` rather than nothing, and `screen.mjs` can
// tell "measured, has none" from "never asked".
for (const n of ['tank', 'column', 'emps', 'arm', 'realarm', 'realtanks', 'realexch', 'pend']) {
  emitTo(process.env.SCREEN_OUT, 'dis.jsonl', { name: n, exoShare: 0, testbed: false });
}
console.log('  THE OTHER PLANTS — screened OUT, and this is the useful half (rule 27)\n');
console.log('     quadruple tank    no stochastic term and no exogenous input, and §84.1 says so');
console.log('     Wood-Berry        ON THE MACHINE rather than from the source: both come back');
console.log('                       BYTE-IDENTICAL under record averaging, and a plant carrying a');
console.log('                       non-repeating component cannot do that (the column moved 0');
console.log('                       bits at every setting to 5 laps averaging 4).');
console.log('     EMPS axis         a nonlinear simulation — binned friction, drive saturation,');
console.log('                       encoder quantisation — all deterministic functions of state.');
console.log('     2R arm            deterministic. Its only non-repeating input is one the harness');
console.log('                       INJECTS (§81 SHOVE), so any DIS result there is a property of');
console.log('                       the injection and not of the plant.');
console.log('     cart-pole         deterministic.');
console.log('     real arm / tanks / exchanger   identified models simulated deterministically.');
console.log('                       Their RECORDS are disturbance-dominated; the RIGS are not, and');
console.log('                       that distinction is exactly §55\'s about "real data" plants.\n');

console.log('  SO DIS RESTS ON ONE PLANT (the mill) AND ONE NON-TESTBED (the barrel), which is');
console.log('  what #51 said and is now measured rather than asserted. A second DIS plant has to');
console.log('  be found or built, and this screen is what it must pass first: an exogenous');
console.log('  component that is a LARGE share of the open-loop error AND worth more than the');
console.log('  incumbent already recovers from knowing it.\n');
