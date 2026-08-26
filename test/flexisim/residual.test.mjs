/**
 * @file The residual trim and the feedrate governor -- the two blocks that bolt onto a
 * conventional controller. No arm, no lattice: these are the CONTRACTS, and a contract
 * that needs a plant to observe is a contract nobody will check.
 */
import { ResidualTrim } from '../../lib/flexisim/residual.js';
import { FeedGovernor } from '../../lib/flexisim/feedgov.js';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
const close = (a, b, tol = 1e-12) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

console.log('\nflexisim: the residual trim and the feedrate governor\n');

// ---- THE LIVE A/B IS THE WHOLE POINT, so off must be EXACTLY off.
{
  const t = new ResidualTrim({ domain: 'torque', joints: 2 });
  const on = t.apply([0.4, -0.2]);
  t.setEnabled(false);
  const off = t.apply([0.4, -0.2]);
  check('a trim passes its estimate through when enabled',
    close(on[0], 0.4) && close(on[1], -0.2), JSON.stringify(on));
  check('…and injects EXACTLY zero when switched off, not merely a small number',
    off[0] === 0 && off[1] === 0, JSON.stringify(off));
  t.setEnabled(true);
  check('…and comes back on to the same value, so an A/B is reversible',
    close(t.apply([0.4, -0.2])[0], 0.4));
}

// ---- THE SCALE IS THE CALLER'S, and it is what makes one block serve both domains.
{
  const t = new ResidualTrim({ joints: 2 });
  const out = t.apply([2, 3], [0.5, -2]);
  check('the per-joint scale converts the estimate into the domain\'s own units',
    close(out[0], 1) && close(out[1], -6), JSON.stringify(out));
}

// ---- LIMITS DEGRADE, THEY DO NOT BREAK, and a trim on its limit is REPORTED.
{
  const t = new ResidualTrim({ joints: 1, magMax: 0.1 });
  const out = t.apply([5]);
  check('the magnitude limit clamps rather than refusing', close(out[0], 0.1), `${out[0]}`);
  check('…and the peak is reported, because a trim held at its limit is being rescued '
    + 'rather than solving and the score cannot tell those apart',
    close(t.status().peak, 0.1), JSON.stringify(t.status()));
}
{
  const t = new ResidualTrim({ joints: 1, rateMax: 0.01 });
  t.apply([1]);
  check('the slew limit bounds the FIRST step too, from a standing start',
    close(t.last[0], 0.01), `${t.last[0]}`);
}

// ---- A NON-FINITE ESTIMATE MUST NOT REACH THE MACHINE. A soft sensor that has not
// warmed up returns null/NaN, and a NaN injected into a servo command is unrecoverable --
// it propagates and nothing downstream can tell where it came from.
{
  const t = new ResidualTrim({ joints: 2 });
  const out = t.apply([NaN, Infinity]);
  check('a non-finite estimate injects zero rather than propagating into the command',
    out[0] === 0 && out[1] === 0, JSON.stringify(out));
}

// ---- THE GOVERNOR: a deadband that does nothing is the default, not a courtesy.
{
  const g = new FeedGovernor({ tolerance: 1, deadband: 0.5, floor: 0.25, rateMax: 1 });
  check('below the deadband the feed is untouched', close(g.step(0.2), 1), `${g.override}`);
  g.reset();
  check('at the tolerance the feed is cut to the floor', close(g.step(1.0), 0.25), `${g.override}`);
  g.reset();
  check('…and past it, no further -- the floor is a floor', close(g.step(50), 0.25), `${g.override}`);
  g.reset();
  check('halfway between deadband and tolerance is halfway to the floor',
    close(g.step(0.75), 1 - 0.5 * 0.75), `${g.override}`);
}

// ---- A FEEDRATE STEP IS AN ACCELERATION TRANSIENT, i.e. exactly the excitation the
// governor exists to avoid. Getting there gradually is not a nicety.
{
  const g = new FeedGovernor({ tolerance: 1, floor: 0.2, rateMax: 0.01 });
  g.step(10);
  check('the override slews rather than stepping, so the governor cannot excite the mode '
    + 'it was added to avoid', close(g.override, 0.99), `${g.override}`);
}

// ---- THE COST IS THE MEAN OF THE RECIPROCAL, and this check exists because the other
// convention flatters the layer exactly where it is least defensible.
{
  const g = new FeedGovernor({ tolerance: 1, floor: 0.5, rateMax: 1 });
  g.step(0); g.step(10);          // one sample at 1.0, one at 0.5
  check('time cost is mean(1/override), not 1/mean(override)',
    close(g.timeCost(), 1.5), `${g.timeCost().toFixed(4)} (the wrong convention gives `
    + `${(1 / 0.75).toFixed(4)})`);
}

// ---- AND A GOVERNOR THAT NEVER ACTS COSTS NOTHING, which is the null case a cycle-time
// argument stands or falls on.
{
  const g = new FeedGovernor({ tolerance: 1, deadband: 0.5 });
  for (let i = 0; i < 50; i++) g.step(0.1);
  check('a machine inside tolerance pays no cycle time at all',
    close(g.timeCost(), 1) && g.status().min === 1, JSON.stringify(g.status()));
}

console.log(failed ? `\nresidual: ${failed} check(s) FAILED\n` : '\nresidual: all checks passed\n');
process.exit(failed ? 1 : 0);
