// THE ORACLE LADDER — where does the pilot actually bind?
//
// The owner's directive is to bring the pilot to mode 10's level (44-51x on a compiled
// program against the pilot's single digits), and every route tried so far has assumed the
// difference is FORECAST QUALITY. `test/_pilotceiling.mjs` tried to settle that with an
// IN-SAMPLE refit and came back worse than shipped on all three programs — but an in-sample
// fit on a closed program is collinear, so it conflated forecast quality with the
// conditioning of the inverse the QP depends on. It proves you cannot get there by fitting
// on the program. It does NOT prove a better forecast would not help.
//
// AN ORACLE HAS NO CONDITIONING. Hand the QP the TRUE free error at every lead — recorded
// open loop on this very program — with no fitted model anywhere in the loop. Nothing is
// left to improve about the prediction, and nothing is regularised, so whatever gap remains
// is not the forecast's.
//
// THEN RELAX ONE VARIABLE PER RUNG: authority, then solver iterations. The rung where the
// delivery moves is the one that binds. That is one run; an improvement campaign against a
// component that is not the constraint is a day (the method lesson of plan section 47).
//
// THE INSTRUMENT IS CHECKED BEFORE IT IS READ (rule 17). Two controls run first: an oracle
// that returns the FITTED value must reproduce the shipped run to the last digit, and the
// correlation between the oracle and the fitted forecast at lead 0 says whether the oracle
// is indexed where the model thinks it is. A mis-indexed oracle would read as an
// uninformative one, and those are opposite conclusions.
import { commissionArm, deployOn, recordOpenLoop, PG }
  from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const SHAPES = (process.env.OR_SHAPES || 'sharp,rounded,circle').split(',');
const FEED = +(process.env.OR_FEED || 0.004);

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED} — the canonical bench cell`);
const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED } });
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }
const uMax0 = pilot.uMax, it0 = pilot.qpIters, lam0 = pilot.lambda;
console.log(`commissioned: ${pilot.verdict.deploy ? 'deploy' : 'REFUSED'}; sample ${pilot.sample}, `
  + `N ${pilot.N}, grid ${pilot.grid}, uMax ${uMax0}, lambda ${lam0}, qpIters ${it0}, `
  + `reach ${pilot.N * pilot.grid * pilot.sample} steps`);

// EVERY RUNG REPORTS ITS CORRECTION PEAK, because a rung that raises the authority and does
// not use it is measuring the EFFORT WEIGHT, not the authority (rule 32: an effort weight of
// 0.1 against a plant energy of 7.28 did nothing at all). Without `uPk` in the table, an
// inert lambda and a saturated plant are the same number.
const score = async (shape, opts) => {
  const r = await deployOn(pilot, shape, true, FEED, opts);
  return { v: r.r.totalRms, u: r.uPk };
};

for (const shape of SHAPES) {
  console.log(`\n=== ${shape} ===`);
  const off = (await deployOn(pilot, shape, false, FEED)).r.totalRms;
  const shipped = await score(shape, {});

  // ---- control 1: the port itself must be inert -------------------------------------
  // `(s2 - conv) + conv` is `s2` only up to a last bit, and this plant AMPLIFIES a last bit:
  // whatever this control reports is the NOISE FLOOR of every A/B in the table below, and any
  // difference smaller than it is not a finding.
  const inert = await score(shape, { oracle: (c, l, fitted) => fitted });
  const rel = Math.abs(inert.v / shipped.v - 1);
  console.log(`  port control: shipped ${shipped.v.toExponential(4)} vs pass-through `
    + `${inert.v.toExponential(4)} — relative ${rel.toExponential(1)}`
    + ` (the noise floor of this table)`);

  // ---- the oracle record: this program, open loop, one steady lap ---------------------
  const rec = await recordOpenLoop(pilot, shape, FEED);
  // ---- control 2: is it indexed where the model thinks it is? -------------------------
  const st = [0, 1].map(() => ({ n: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0 }));
  const probe = (c, v, fitted) => {
    const s = st[c]; s.n++; s.sx += v; s.sy += fitted;
    s.sxx += v * v; s.syy += fitted * fitted; s.sxy += v * fitted;
  };
  const or = { e: rec.e, lap: rec.lap, off: rec.lap, probe };
  const oracle = await score(shape, { oracle: or });

  const corr = st.map((s) => {
    const cv = s.sxy / s.n - (s.sx / s.n) * (s.sy / s.n);
    const sd = Math.sqrt((s.sxx / s.n - (s.sx / s.n) ** 2) * (s.syy / s.n - (s.sy / s.n) ** 2));
    return sd > 0 ? cv / sd : 0;
  });
  console.log(`  alignment: corr(oracle, fitted) at lead 0 = `
    + `${corr.map((v) => v.toFixed(3)).join(' / ')} over ${st[0].n} decisions`);

  // ---- the ladder --------------------------------------------------------------------
  or.probe = null;
  const rungs = [['open loop', { v: off, u: 0 }], ['shipped', shipped],
    ['+ oracle forecast', oracle]];
  const at = async (name, { u = uMax0, l = lam0, it = it0 }, useOracle = true) => {
    pilot.uMax = u; pilot.lambda = l; pilot.qpIters = it;
    rungs.push([name, await score(shape, useOracle ? { oracle: or } : {})]);
    pilot.uMax = uMax0; pilot.lambda = lam0; pilot.qpIters = it0;
  };
  await at('+ oracle, uMax x2', { u: 2 * uMax0 });
  await at('+ oracle, uMax x8', { u: 8 * uMax0 });
  await at('+ oracle, lambda /10', { l: lam0 / 10 });
  await at('+ oracle, lambda /100', { l: lam0 / 100 });
  await at('+ oracle, uMax x8 + lambda /100', { u: 8 * uMax0, l: lam0 / 100 });
  await at('+ oracle, qpIters 60', { it: 60 });
  await at('+ oracle, uMax x8 + lam/100 + it 60', { u: 8 * uMax0, l: lam0 / 100, it: 60 });
  // AND THE SAME KNOB WITHOUT THE ORACLE, so authority and forecast are separable: a rung
  // that only pays when the forecast is perfect is a different finding from one that pays
  // either way.
  await at('fitted forecast, uMax x8 + lam/100', { u: 8 * uMax0, l: lam0 / 100 }, false);

  console.log('  rung                                    totalRms   x over open      uPk');
  for (const [name, r] of rungs) {
    console.log(`  ${name.padEnd(36)} ${r.v.toExponential(4).padStart(11)} `
      + `${(off / r.v).toFixed(2).padStart(8)}x ${r.u.toFixed(4).padStart(9)}`);
  }
}
console.log('EXIT 0');
