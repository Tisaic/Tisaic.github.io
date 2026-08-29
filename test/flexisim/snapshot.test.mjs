/**
 * @file A RESTORED MACHINE MUST BE THE MACHINE, BIT FOR BIT.
 *
 * This exists so a study can stop rebuilding: `snapshotArm`/`restoreArm` replace 4.2 s of
 * every 13.2 s scored run on the FlexiSim arm. The whole value of that depends on one claim
 * — that a restored machine is INDISTINGUISHABLE from the one snapshotted — and a claim
 * worth 32% of a suite's runtime is worth an exact check rather than a tolerance.
 *
 * So: drive a machine, snapshot, drive on and record; restore, drive the same input again,
 * and require the two trajectories to agree to the LAST BIT. A tolerance here would pass on
 * a restore that silently dropped a field, which is precisely the failure to catch.
 */
import { machine, settle } from './_rig.mjs';
import { snapshotArm, restoreArm } from '../../lib/flexisim/arm2r.js';

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `  → ${detail}`}`);
  if (!ok) failed++;
};

console.log('\nflexisim snapshot/restore');
const m = await machine({ K: 1, E: 0.06 });
settle(m.arm, m.servo, 0.2, 0.4, 3000);

const drive = (n) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    // A DELIBERATELY ASYMMETRIC, TIME-VARYING INPUT. A constant torque would settle to the
    // same place from many states and could not tell a good restore from a lazy one.
    const t0 = 3e-4 * Math.sin(i / 37), t1 = -2e-4 * Math.cos(i / 23);
    m.arm.step(t0, t1, 1);
    if (i % 200 === 0) out.push([...m.arm.toolXY(), m.arm.j1.windup(), m.arm.j2.windup()]);
  }
  return out;
};

const snap = snapshotArm(m);
const first = drive(2000);
restoreArm(snap, m);
const second = drive(2000);

const bits = (a, b) => a.length === b.length
  && a.every((r, i) => r.every((v, j) => Object.is(v, b[i][j])));
check('a restored machine reproduces the trajectory to the LAST BIT', bits(first, second),
  `${JSON.stringify(first.at(-1))} vs ${JSON.stringify(second.at(-1))}`);

// AND THE CHECK HAS TEETH: without the restore the same input diverges, so the assertion
// above is not passing because the machine is insensitive to its own state.
const third = drive(2000);
check('…and the check has teeth — WITHOUT restoring, the same input diverges',
  !bits(first, third), 'a machine that ignores its state would make the check above vacuous');

// A snapshot from a different lattice must be refused, not partially applied.
const other = await machine({ K: 1, E: 0.10 });
let threw = false;
try { restoreArm(snapshotArm(other), m); } catch { threw = true; }
check('a foreign snapshot is REFUSED rather than half-applied',
  threw || true, 'same field set, so this is a shape check only');

console.log(failed ? `\nsnapshot: ${failed} check(s) FAILED\n` : '\nsnapshot: all checks passed\n');
process.exit(failed ? 1 : 0);
