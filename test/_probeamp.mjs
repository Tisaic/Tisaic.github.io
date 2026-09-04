// IDENTIFY `h` AT THE AMPLITUDE IT WILL BE INVERTED AT — rule 34 aimed at the one model this
// project has never applied it to, and a cleaner test than rescaling the kernel afterwards.
//
// THE MEASUREMENT BEHIND IT. `probeAmp` defaults to 0.15·uMax, so `h` is identified at 15% of
// the correction authority and then inverted at up to 100% of it. The response per unit `u` is
// not the same at those two amplitudes (`test/_hamp.mjs`): the shoulder COMPRESSES to 0.793 by
// 0.6 rad and the elbow EXPANDS to 1.151, both monotone, both shape-preserving.
//
// WHY RESCALING THE KERNEL AFTERWARDS DID NOT WORK, AND WHY THAT IS NOT A REFUTATION.
// `test/_hgain.mjs` scaled `h` toward the measured large-signal gain and every program got
// worse, monotonically. The arithmetic says why: cancelling the same `f0` through a gain scaled
// to 0.79 needs `u` 1.27x larger, and `uPk` was already pinned at 0.6000 — AT THE CAP. The
// correction the QP wanted did not fit, so what the machine received was a harder-clipped and
// differently-shaped version of it. A fix that requires headroom cannot be tested at
// saturation.
//
// SO CHANGE THE IDENTIFICATION INSTEAD OF THE MODEL. A probe at the operating amplitude gives
// the QP a kernel that is already right there, with no rescaling, no extra demand for `u`, and
// nothing to clip. It also costs nothing at deploy — it is the same kernel, measured
// differently — and it is exactly what rule 34 says: commission a model in the configuration
// it will RUN in.
//
// BOTH HALVES (rule 9). A larger probe should help if the compression is what limits the
// solve; it should HURT if the small-signal kernel was right and the probe merely becomes less
// linear. The ladder spans both sides of the default so the answer cannot be assumed.
import { commissionArm, deployOn, PG } from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const SHAPES = (process.env.PA_SHAPES || 'sharp,circle,rounded').split(',');
const FEED = +(process.env.PA_FEED || 0.004);
const UCAP = +(process.env.PA_UCAP || 0.6);
const AMPS = (process.env.PA_AMPS || '0.045,0.09,0.20,0.40').split(',').map(Number);

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}, uCap ${UCAP}; `
  + `probe amplitudes ${AMPS.join(', ')} (the default is 0.15*uMax = ${0.15 * UCAP})`);
const open = {};
console.log('\n  probeAmp  ' + SHAPES.map((s) => s.padStart(20)).join('') + '      uPk   verify');
for (const amp of AMPS) {
  const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED },
    uCap: UCAP, before: (p) => { p.probeAmp = amp; } });
  if (!pilot) { console.log(`  ${amp}: commissioning never terminated`); continue; }
  const cols = [];
  let pk = 0;
  for (const shape of SHAPES) {
    if (!open[shape]) open[shape] = (await deployOn(pilot, shape, false, FEED)).r.totalRms;
    const r = await deployOn(pilot, shape, true, FEED);
    pk = Math.max(pk, r.uPk);
    cols.push(`${r.r.totalRms.toExponential(3)} ${(open[shape] / r.r.totalRms).toFixed(2).padStart(6)}x`);
  }
  const v = pilot.report.verify ? pilot.report.verify.ratio.toFixed(2) + 'x' : 'n/a';
  console.log(`  ${amp.toFixed(3).padStart(8)}  ${cols.join('  ')}   ${pk.toFixed(4)}   ${v}`);
}
console.log('EXIT 0');
