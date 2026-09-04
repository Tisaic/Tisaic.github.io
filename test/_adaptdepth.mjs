// THE ONE LEGAL ROUTE LEFT: DEPTH x AUTHORITY x ONLINE ADAPTATION.
//
// WHY THIS IS WHAT IS LEFT. The residual a third cascade layer would have to model is not
// state-predictable — `test/_resid.mjs` scores it at 0.87 held out on its own program and
// 0.0023 on the SAME SHAPE at a different feedrate, while a phase table carries it across
// that feedrate at 0.55. It is a geometry-indexed quantity, which is exactly the object the
// retirement forbids, so no deeper cascade takes it and no better frozen model of it exists.
//
// ONLINE ADAPTATION IS THE ONLY MECHANISM THAT CAN. It captures program-specific structure
// while staying addressed by STATE and storing no table: it learns on the program in front of
// it rather than remembering one it was shown. This project has already measured it
// multiplying a model the static verify vouched for — arm +29%, tank +18%, EMPS 14.8x -> 55.5x
// with the truth REMOVED at lap 4 and the bank frozen — and passing the memory test where a
// phase-indexed ILC failed it.
//
// AND IT IS THE CONFIGURATION THE AUTHORITY RESULT ALREADY PREDICTED. Depth 2 at uCap 0.6 is
// worth 1.85x over the shipped configuration, and this file's existing law says the extra cap
// is misused by static control and reclaimed by adaptation. That is a prediction this bench
// can falsify: if adaptation pays MORE at the larger cap than at the shipped one, the law
// holds one level up; if it pays the same, the law is about something else.
//
// THE TRUTH AT DEPLOY IS AN INSTALLATION PROPERTY, NOT AN ASSUMPTION. On this arm it means a
// permanent tool tracker, which production may not have, so every adapted number here is
// labelled as such — and `truthUntilLap` cuts it mid-run so "commission with it, take it away"
// is a measurement rather than a story.
import { Stack } from '/home/user/Tisaic.github.io/lib/pilot/stack.js';
import { commissionArm, deployOn, PG } from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const SHAPES = (process.env.AD_SHAPES || 'sharp,circle,rounded').split(',');
const FEED = +(process.env.AD_FEED || 0.004);
const CAPS = (process.env.AD_CAPS || '0.15,0.6').split(',').map(Number);
const DEPTHS = (process.env.AD_DEPTHS || '2').split(',').map(Number);

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}; scored on ${SHAPES.join(', ')}`);
const open = {};
for (const uCap of CAPS) {
  for (const depth of DEPTHS) {
    // ONE COMMISSIONING PER CELL, DEPLOYED THREE WAYS — the adaptation is a deploy-time switch,
    // so the model is held fixed and only what happens at deploy changes (rule 20: one
    // variable, matched capacity, matched age).
    const st = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED },
      uCap, Cls: Stack, extra: { depth, online: { lambda: 0.9995, minInfo: 0.25 } } });
    if (!st) { console.log(`  uCap ${uCap} depth ${depth}: never terminated`); continue; }
    const live = st.report.layers.filter((l) => l.deployed).length;
    console.log(`\n  uCap ${uCap} depth ${depth}: ${live} of ${st.layers.length} deployed`
      + `; verify clamped ${st.report.verifyClamped}`);
    // ONE SNAPSHOT, TAKEN BEFORE ANY RUN, AND VERIFIED AFTER EVERY RESTORE. Taking it per
    // shape inherits whatever the previous shape left behind, and the symptom is subtle: the
    // sharp square matched the depth sweep exactly while the circle read 4.45x against 3.99x
    // on the same commissioning — one program agreeing is not a control, it is a coincidence
    // until the other does too. `verify` re-reads the weights and reports the largest
    // deviation, so a leak is a printed number rather than a quiet 12%.
    const PRISTINE = st.layers.map((p2) => (p2.readouts || []).map((r) => ({
      r, w: r.w ? r.w.map((v) => Float64Array.from(v)) : null, rls: r._rls })));
    const restore = (sn) => sn.forEach((L) => L.forEach((e) => {
      if (e.w) for (let i = 0; i < e.w.length; i++) e.r.w[i] = Float64Array.from(e.w[i]);
      e.r._rls = e.rls; e.r._infoRef = undefined;
      e.r._onlineN = 0; e.r._infoSkipped = 0;
    }));
    const drift = () => {
      let m = 0;
      PRISTINE.forEach((L) => L.forEach((e) => {
        if (!e.w) return;
        for (let i = 0; i < e.w.length; i++) {
          for (let j = 0; j < e.w[i].length; j++) m = Math.max(m, Math.abs(e.r.w[i][j] - e.w[i][j]));
        }
      }));
      return m;
    };
    for (const shape of SHAPES) {
      const key = `${shape}`;
      if (!open[key]) open[key] = (await deployOn(st, shape, false, FEED)).r.totalRms;
      // ADAPTATION IS DESTRUCTIVE AND `_initRun` DOES NOT UNDO IT. `_onlineStep` writes the
      // updated weights IN PLACE into `ro.w[0]` — that is the whole point, the recursion
      // continues the commissioning problem — so every run after an adapting one starts from
      // the adapted bank unless something puts it back. The first version of this bench did
      // not, and it cost both halves of the table: the circle's "static" was really the
      // SHARP-adapted model (5.39x against a pristine 6.81x), and the sharp's "take-away"
      // started from an already-adapted bank, making it MORE adaptation rather than less.
      // Snapshot and restore around every run, so each mode starts from the commissioned model.
      const S0 = PRISTINE;
      // STATIC: the truth is withheld at deploy, so the bank cannot move — the control.
      const stat = await deployOn(st, shape, true, FEED, { truthUntilLap: 0 });
      restore(S0);
      // ADAPTING: the truth is present throughout — a permanent tracker installation. The
      // counters are cleared first so what they report belongs to THIS run and not to the
      // commissioning that preceded it.
      for (const p2 of st.layers) for (const r of (p2.readouts || [])) { r._onlineN = 0; r._infoSkipped = 0; }
      const live2 = await deployOn(st, shape, true, FEED);
      const counts0 = st.layers.map((p2) => (p2.readouts || []).map((r) =>
        `${r._onlineN || 0}/${(r._onlineN || 0) + (r._infoSkipped || 0)}`).join(',')).join(' | ');
      restore(S0);
      // TAKE-AWAY: the truth is present for the first lap and removed, the bank frozen —
      // the installation this arm could actually have, and the one the memory test used.
      const taken = await deployOn(st, shape, true, FEED, { truthUntilLap: 1 });
      restore(S0);
      // HOW MANY ROWS THE ADAPTATION ACTUALLY ADMITTED. "Inert" and "never ran" are different
      // states and one RMS column cannot tell them apart (rule 25) — an innovation gate that
      // rejected every row is a wiring result wearing a controller's clothes. Counted per
      // layer per channel, and reset before the adapting run so the number belongs to it.
      const counts = counts0;
      const x = (v) => (open[key] / v).toFixed(2).padStart(6);
      console.log(`    ${shape.padEnd(8)} open ${open[key].toExponential(3)}   `
        + `static ${stat.r.totalRms.toExponential(4)} ${x(stat.r.totalRms)}x   `
        + `adapting ${live2.r.totalRms.toExponential(4)} ${x(live2.r.totalRms)}x   `
        + `take-away ${taken.r.totalRms.toExponential(4)} ${x(taken.r.totalRms)}x   `
        + `(adapt/static ${(stat.r.totalRms / live2.r.totalRms).toFixed(3)}x)`
        + `  admitted ${counts}  restore drift ${drift().toExponential(1)}`);
    }
  }
}
console.log('EXIT 0');
