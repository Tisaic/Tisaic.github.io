// THE ONE-PASS VARIANCE FORMULA LOSES MOST OF ITS DIGITS ON A PRESSURE CHANNEL.
//
// Found by a parity check, not by a symptom. `ridge-sign.mjs` reproduces the
// shipped standardisation so it can form a design matrix in one go, and asserts
// its columns match `SoftSensorBank`'s to 1e-12. They matched to 3e-4 -- small,
// but four hundred million times worse than float64 should manage on the same
// arithmetic, so one of the two is doing it wrong.
//
// The library accumulates sum and sum-of-squares and takes
//
//     var = E[x^2] - mean^2
//
// which subtracts two nearly equal numbers whenever a signal is a small
// fluctuation riding a large mean. That is not a corner case here: it is
// DENSITY, the quantity this project already documents as "a ~1% fluctuation on
// a level of 1.0" and already had to fix once on the target side. Lattice density
// at a wall tap is worse still -- a ~3e-6 fluctuation on 1.0 -- so E[x^2] and
// mean^2 agree to eleven digits and the variance is what is left in the last
// four or five.
//
// The relative error grows with the window length (the accumulated sums get
// bigger while the difference does not) and with the mean-to-fluctuation ratio.
// A real transducer reading absolute pressure -- 101 kPa with a 10 Pa signal --
// sits in the same regime, so this is a defect that gets WORSE on the hardware
// the instrumentation review describes, not better.
import { dyeStream } from './dye-stream.mjs';

const S = await dyeStream({ samples: 1600, perWall: 6 });
const WARMUP = 200;

/** What the library does. */
function onePass(xs) {
  let s = 0, sq = 0;
  for (const x of xs) { s += x; sq += x * x; }
  const mu = s / xs.length;
  return { mean: mu, std: Math.sqrt(Math.max(0, sq / xs.length - mu * mu)) };
}
/** Two passes: exact to rounding, and the reference here. */
function twoPass(xs) {
  let s = 0;
  for (const x of xs) s += x;
  const mu = s / xs.length;
  let v = 0;
  for (const x of xs) v += (x - mu) ** 2;
  return { mean: mu, std: Math.sqrt(v / xs.length) };
}
/** Welford: one pass, numerically stable, and what the fix would use. */
function welford(xs) {
  let n = 0, mu = 0, m2 = 0;
  for (const x of xs) { n++; const d = x - mu; mu += d / n; m2 += d * (x - mu); }
  return { mean: mu, std: Math.sqrt(m2 / n) };
}

const isRho = (i) => S.rhoSlots.includes(i);
console.log(`window ${WARMUP} samples, ${S.P} channels\n`);
console.log('ch  kind      mean         two-pass std   one-pass std   rel err    welford rel err');
let worstRho = 0, worstVel = 0;
for (let i = 0; i < S.P; i++) {
  const xs = [];
  for (let t = 0; t < WARMUP; t++) xs.push(S.sig[t][i]);
  const a = twoPass(xs), b = onePass(xs), c = welford(xs);
  const eb = Math.abs(b.std - a.std) / a.std, ec = Math.abs(c.std - a.std) / a.std;
  if (isRho(i)) worstRho = Math.max(worstRho, eb); else worstVel = Math.max(worstVel, eb);
  if (i < 6 || isRho(i)) {
    console.log(`${String(i).padStart(2)}  ${(isRho(i) ? 'pressure' : 'velocity').padEnd(9)}` +
      `${a.mean.toExponential(3).padStart(12)}${a.std.toExponential(3).padStart(15)}` +
      `${b.std.toExponential(3).padStart(15)}${eb.toExponential(2).padStart(11)}` +
      `${ec.toExponential(2).padStart(17)}`);
  }
}
console.log(`\nworst relative error in the frozen scale: pressure ${worstRho.toExponential(2)},` +
  ` velocity ${worstVel.toExponential(2)}`);

// How it grows with the calibration window -- the part that makes it a defect
// rather than a curiosity, since `warmup` is a user-facing setting.
console.log('\nthe error grows with the window, because the sums grow and the difference does not:');
const ch = S.rhoSlots[0];
for (const w of [100, 200, 400, 800, 1600]) {
  const xs = [];
  for (let t = 0; t < w; t++) xs.push(S.sig[t][ch]);
  const a = twoPass(xs), b = onePass(xs), c = welford(xs);
  console.log(`  window ${String(w).padStart(4)}  one-pass rel err ${(Math.abs(b.std - a.std) / a.std).toExponential(2)}` +
    `   welford ${(Math.abs(c.std - a.std) / a.std).toExponential(2)}`);
}

// And what it does downstream: a standardised input is off by the same relative
// amount, and a quadratic feature doubles it.
console.log(`\ndownstream: a standardised pressure input carries ${(100 * worstRho).toFixed(3)}% error,`);
console.log(`its square carries ~${(200 * worstRho).toFixed(3)}%, and the frozen scale is used`);
console.log('for the entire life of the model.');
