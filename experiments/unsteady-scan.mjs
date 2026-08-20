// FIND AN OPERATING POINT WHERE THE RECONSTRUCTION IS ASKED A QUESTION.
//
// `target-activity.mjs` established that on the shipped dye stream the field's
// temporal variation is 0.1% of its spatial structure, and that a STATIC MAP --
// each location's own time average, no sensor read at all -- reconstructs it at
// nRMSE 1.7e-3. The online reconstructor scores 0.086 on the same stream, i.e.
// FIFTY TIMES WORSE THAN DOING NOTHING. Every noise sensitivity measured on that
// stream describes how noise perturbs a model that had nothing to fit.
//
// This is the control that `recon-gate.mjs` was missing. It asked "is the blind
// error small" and got 0.079 and passed, when the question it needed to ask was
// "is it better than the trivial baseline" -- and the answer was no by a factor
// of fifty. A small number is not a result without the do-nothing comparison.
//
// The cause is physics, not code: at resolution 16 and inlet 0.06 the cylinder
// sits at Re ~72, which this project has already measured as BELOW the confined
// shedding threshold (between 72 and 120) -- the wake oscillates while decaying,
// so the dye plume settles and stops moving. Reynolds number is u*D/nu, so the
// cheap lever is the inlet velocity rather than the resolution: it raises Re
// proportionally AND shortens the transit time, so a faster case costs less to
// settle rather than more.
//
// Reported for each candidate: the activity ratio, the static-map baseline, and
// the ratio between them -- which is the only number that says whether an
// experiment run here would mean anything.
import { dyeStream } from './dye-stream.mjs';

const SAMPLES = +(process.env.SAMPLES || 500);
// res:u:mode:amplitude. The disturbance is the point -- see `dye-stream.mjs`
// for why a steady flow makes this task vanish rather than merely get easy.
const CASES = (process.env.CASES
  || '16:0.06:steady:0,16:0.06:multitone:0.3,16:0.06:chaotic:0.3,16:0.06:chaotic:0.6').split(',')
  .map((s) => {
    const [res, u, inletMode = 'steady', amp = '0'] = s.split(':');
    return { res: +res, u: +u, inletMode, inletAmplitude: +amp };
  });

console.log(`scan, ${SAMPLES} samples each\n`);
console.log('res     u  inlet             cells  transit  spatial   temporal  temp/spat  staticMap  drift/temp');
for (const { res, u, inletMode, inletAmplitude } of CASES) {
  const S = await dyeStream({ res, u, samples: SAMPLES, perWall: 6, inletMode, inletAmplitude });
  const K = S.target.length, T = S.sig.length;
  const mu = new Float64Array(K), m2 = new Float64Array(K);
  for (let t = 0; t < T; t++) {
    const n = t + 1;
    for (let k = 0; k < K; k++) {
      const d = S.truth[t][k] - mu[k];
      mu[k] += d / n; m2[k] += d * (S.truth[t][k] - mu[k]);
    }
  }
  const tempStd = Array.from({ length: K }, (_, k) => Math.sqrt(m2[k] / T));
  const meanTemp = tempStd.reduce((a, b) => a + b, 0) / K;
  let spatial = 0, staticScore = 0;
  for (let t = 0; t < T; t++) {
    const y = S.truth[t];
    let m = 0; for (const v of y) m += v; m /= K;
    let s = 0, se = 0;
    for (let k = 0; k < K; k++) { s += (y[k] - m) ** 2; se += (mu[k] - y[k]) ** 2; }
    spatial += Math.sqrt(s / K) / T;
    staticScore += Math.sqrt(se / Math.max(s, 1e-30)) / T;
  }
  const half = T >> 1;
  const meanOf = (a, b, k) => { let s = 0; for (let t = a; t < b; t++) s += S.truth[t][k]; return s / (b - a); };
  let drift = 0;
  for (let k = 0; k < K; k++) drift += (meanOf(half, T, k) - meanOf(0, half, k)) ** 2;
  drift = Math.sqrt(drift / K);
  console.log(`${String(res).padStart(3)}  ${String(u).padStart(5)}  ` +
    `${(inletMode + (inletAmplitude ? ' ' + inletAmplitude : '')).padEnd(16)}` +
    `${String(S.cells).padStart(6)}${String(S.transit).padStart(9)}` +
    `${spatial.toExponential(2).padStart(10)}${meanTemp.toExponential(2).padStart(11)}` +
    `${(meanTemp / spatial).toExponential(2).padStart(11)}` +
    `${staticScore.toExponential(2).padStart(11)}${(drift / meanTemp).toFixed(2).padStart(12)}`);
}
console.log('\nWANTED: a large temp/spat, a staticMap baseline NOT far below whatever a');
console.log('reconstruction scores, and drift/temp well under 1 -- a big drift ratio means');
console.log('the case is still settling, which is a transient rather than a question.');
