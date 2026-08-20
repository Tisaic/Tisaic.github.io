// WHAT DOES THE STANDARDISATION FLOOR DO TO A MIXED-QUANTITY SENSOR VECTOR?
//
// `SoftSensorBank` freezes a per-input standard deviation and refuses to divide
// by anything smaller than a THOUSANDTH OF THE LARGEST one, leaving such an input
// unscaled instead. That floor was measured into existence for a real failure: a
// no-slip wall cell barely moves, so a calibration window taken while the flow is
// still developing gives a microscopic spread, and dividing by it sent the nRMSE
// to 1.58e7.
//
// But it was measured on inputs that were all the SAME QUANTITY. A wall tap here
// reports velocity AND density, and there is no reason those two live at the same
// scale in lattice units. The floor is relative to the largest input across the
// WHOLE vector, so a quantity that is uniformly small compared to another
// quantity would be indistinguishable, to this rule, from a dead channel -- and
// every channel of it would be fed to the readout at a thousandth of unit
// variance. That would mean the mixed velocity+pressure results in
// `sensor-kind.mjs` were measured with the pressure half nearly switched off.
//
// RESULT: it does not fire here, and the reason is the opposite of the guess.
// Wall-adjacent density varies MORE than wall-adjacent velocity, so the largest
// channel is a pressure channel and nothing is near the floor. The hypothesis is
// dead; the check is kept because the rule is scale-relative and a different
// scene, resolution or quantity set could still trip it.
import { dyeStream } from './dye-stream.mjs';

const S = await dyeStream({ samples: 1600, perWall: 6 });
const P = S.P;
const isRho = (i) => S.rhoSlots.includes(i);
const vel = [], rho = [];
for (let i = 0; i < P; i++) (isRho(i) ? rho : vel).push(S.std[i]);

const sdMax = Math.max(...S.std);
const floor = 1e-3 * sdMax;
const below = [];
for (let i = 0; i < P; i++) if (S.std[i] <= floor) below.push(i);

console.log(JSON.stringify({
  channels: P,
  velocityStd: { min: +Math.min(...vel).toExponential(2), max: +Math.max(...vel).toExponential(2) },
  pressureStd: { min: +Math.min(...rho).toExponential(2), max: +Math.max(...rho).toExponential(2) },
  log10VelocityOverPressure: +Math.log10(Math.max(...vel) / Math.max(...rho)).toFixed(2),
  sdMax: +sdMax.toExponential(2),
  relativeFloor: +floor.toExponential(2),
  channelsAtOrBelowFloor: below.length,
  ofWhichPressure: below.filter(isRho).length,
  pressureChannelsTotal: rho.length,
}, null, 1));

const fstd = [];
for (let i = 0; i < P; i++) fstd.push(S.std[i] > floor && S.std[i] > 1e-30 ? S.std[i] : sdMax);
let worst = 0;
for (let i = 0; i < P; i++) worst = Math.max(worst, fstd[i] / S.std[i]);
console.log(JSON.stringify({
  pressureChannelsLeftUnscaled: S.rhoSlots.filter((i) => fstd[i] !== S.std[i]).length,
  worstAttenuation: `${worst.toExponential(2)}x below unit variance`,
}, null, 1));

console.log(below.filter(isRho).length === rho.length
  ? '\nEVERY pressure channel is below the floor: the readout sees them at a'
    + '\nthousandth of unit variance, i.e. effectively switched off.'
  : below.filter(isRho).length > 0
    ? `\n${below.filter(isRho).length}/${rho.length} pressure channels are below the floor.`
      + ' A quantity is being partly disabled by a rule meant for dead channels.'
    : '\nNo channel is below the floor: the two quantities are close enough in scale'
      + '\nthat the rule does not fire. The mixed-quantity results stand.');
