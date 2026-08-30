/**
 * @file THE TRANSFER BENCH — one commission, a matrix of programs and feedrates.
 *
 * The largest instrumentation gap in this project: every headline it has is ONE program at
 * ONE feedrate. A controller that wins there and dies at another feed or on another shape is
 * a calibration, and the record already contains the evidence that this is happening — the
 * composite measures 4.9x to 20.3x across five programs and makes one WORSE; a table worth
 * 125x on the program it learned is worth 0.55x on a sine. None of that is visible from the
 * bar, because the bar scores the program the ladder was commissioned on.
 *
 * So: commission ONCE, then score a matrix, and let the HEADLINE BE THE WORST CELL.
 *
 * WHY THIS CAN BE CHEAP, which was not obvious until the rungs were read. Two of the three
 * deploy through state rather than through lap position — `classic` via `live(v, a)`, which
 * is instantaneous and refuses a lagged basis it cannot evaluate, and `stack` via a
 * look-ahead closure that simply needs the new path's references. Only `hff` is `at(k)`, a
 * table indexed by lap sample. So transfer needs no new controller, only a host that rebinds
 * the path per cell — which is what this file is.
 */
import { snapshotArm, restoreArm } from '../../lib/flexisim/arm2r.js';
import { roundedRect, circle, sharpRect } from '../../lib/flexisim/toolpath.js';
import { ContourScore, decompose } from '../../lib/flexisim/contour.js';

export const CENTRE = [12, 0];
const ACCEL = 4e-5, CORNER = 40;

/** The five programs, chosen to differ in the ways a controller can be brittle to. */
export const PROGRAMS = [
  { name: 'rounded 8x8', home: true,
    make: (feed) => roundedRect({ w: 8, h: 8, r: 1.5, centre: CENTRE, feed, accel: ACCEL, cornerDt: CORNER }) },
  { name: 'rounded 10x6',
    make: (feed) => roundedRect({ w: 10, h: 6, r: 1.5, centre: CENTRE, feed, accel: ACCEL, cornerDt: CORNER }) },
  { name: 'circle r3',
    make: (feed) => circle({ r: 3, centre: CENTRE, feed, accel: ACCEL, cornerDt: CORNER }) },
  { name: 'circle r5',
    make: (feed) => circle({ r: 5, centre: CENTRE, feed, accel: ACCEL, cornerDt: CORNER }) },
  { name: 'sharp 9x7',
    make: (feed) => sharpRect({ w: 9, h: 7, centre: CENTRE, feed, accel: ACCEL, cornerDt: CORNER }) },
];

/** A 5x span, with the commissioning feed inside it rather than at an end. */
export const FEEDS = [1e-3, 2e-3, 4e-3, 1e-2];
export const HOME_FEED = 4e-3;

/**
 * Score ONE cell: a program at a feedrate, on a machine restored to a known state.
 *
 * @param {object} o
 * @param {object} o.m        `{arm, servo}` — the machine, restored before every cell
 * @param {object} o.snap     a `snapshotArm` of it, so cells cannot contaminate each other
 * @param {object} o.rc       the compliance baseline every scored run is driven with
 * @param {object} o.auto     the commissioned `AutoStack`, or null for the bare machine
 * @param {object} o.path     this cell's program
 * @param {number} [o.avg=2]  laps averaged into the score
 * @param {number} [o.warm=2] laps run before scoring begins
 */
export function scoreCell(o) {
  const { m, snap, rc, auto, path } = o;
  const AVG = o.avg ?? 2, WARM = o.warm ?? 2;
  const LAP = Math.ceil(path.lap);
  restoreArm(snap, m);
  // EVERY CELL IS A FRESH RUN. `beginRun` resets the range and starvation diagnostics and
  // re-initialises each deployed cascade layer; without it a cell inherits the previous
  // cell's internal state and the matrix measures the ORDER the cells were run in.
  if (auto) auto.beginRun();

  // THIS CELL'S OWN REFERENCES. The whole point of the bench: the controller is the one
  // commissioned on the home cell, and everything it is indexed by is rebuilt here.
  const R = new Array(LAP);
  for (let k = 0; k < LAP; k++) { const c = path.at(k); R[k] = m.arm.ik(c.x, c.y, true); }
  const S = auto && auto.stack ? auto.stack.sample : 1;

  const sc = new ContourScore({ joints: 2 });
  for (let l = 0; l < WARM + AVG; l++) {
    for (let k = 0; k < LAP; k++) {
      const cmd = path.at(k);
      const [c1, c2] = R[k];
      const r = m.arm.ikRates(c1, c2, cmd.vx, cmd.vy, cmd.ax, cmd.ay);
      const refs = [{ theta: c1, omega: r.dq[0], alpha: r.ddq[0] },
        { theta: c2, omega: r.dq[1], alpha: r.ddq[1] }];
      const ff = rc.feedforward([[1, 0], [0, 1]], m.servo.jointTorques(refs), { enableToolff: false });
      let u = [0, 0];
      if (auto) {
        const kSamp = Math.floor(k / S);
        const look = (off) => R[(((kSamp + off) * S) % LAP + LAP) % LAP];
        u = auto.act({ v: [cmd.vx, cmd.vy], a: [cmd.ax, cmd.ay], k, look, q: [c1, c2] });
      }
      const tau = m.servo.torques([{ ...refs[0], theta: c1 + ff.dq[0] + u[0] },
        { ...refs[1], theta: c2 + ff.dq[1] + u[1] }]);
      m.arm.step(tau[0], tau[1], 1);
      const en = m.arm.encoders();
      if (auto) {
        auto.observe([en[0].angle, en[1].angle, en[0].speed * 1e3, en[1].speed * 1e3,
          tau[0] * 1e3, tau[1] * 1e3]);
      }
      if (l >= WARM) {
        const d = decompose(path, m.arm.toolXY(), cmd);
        sc.step(d.contour, d.lag, tau, [m.arm.j1.wM, m.arm.j2.wM]);
      }
    }
  }
  const rep = sc.report();
  return { contour: rep.contourRms, lag: rep.lagRms, bias: rep.contourBias, osc: rep.contourOsc };
}

/**
 * The whole matrix for one deployed configuration, against the SAME machine with the
 * correction off — so every cell reports a gain measured on its own program, not a gain
 * borrowed from the home cell.
 */
export function runMatrix({ m, rc, auto, label, onCell }) {
  const snap = snapshotArm(m);
  const rows = [];
  for (const prog of PROGRAMS) {
    for (const feed of FEEDS) {
      const path = prog.make(feed);
      const off = scoreCell({ m, snap, rc, auto: null, path });
      const on = scoreCell({ m, snap, rc, auto, path });
      const cell = { program: prog.name, feed, home: !!prog.home && feed === HOME_FEED,
        off: off.contour, on: on.contour, gain: off.contour / on.contour };
      rows.push(cell);
      if (onCell) onCell(cell);
    }
  }
  const worst = rows.reduce((a, b) => (b.gain < a.gain ? b : a));
  const home = rows.find((r) => r.home);
  const hurt = rows.filter((r) => r.gain < 1);
  return { label, rows, worst, home, hurt };
}

/** The matrix as a table, worst cell called out, because that is the headline. */
export function printMatrix(res) {
  console.log(`\n  ${res.label} — gain over the same machine with the correction OFF`);
  const head = FEEDS.map((f) => f.toExponential(0).padStart(9)).join('');
  console.log(`    ${'program'.padEnd(15)}${head}`);
  for (const prog of PROGRAMS) {
    const cells = FEEDS.map((f) => {
      const r = res.rows.find((x) => x.program === prog.name && x.feed === f);
      const g = r.gain >= 100 ? r.gain.toFixed(0) : r.gain.toFixed(2);
      return `${g}x${r.home ? '*' : ' '}`.padStart(9);
    }).join('');
    console.log(`    ${prog.name.padEnd(15)}${cells}`);
  }
  console.log(`    (* the cell it was commissioned on)`);
  console.log(`    HOME  ${res.home.gain.toFixed(2)}x`
    + `   WORST  ${res.worst.gain.toFixed(2)}x  on ${res.worst.program} at `
    + `${res.worst.feed.toExponential(0)}`
    + `   spread ${(res.home.gain / res.worst.gain).toFixed(1)}x`);
  if (res.hurt.length) {
    console.log(`    MADE WORSE on ${res.hurt.length} of ${res.rows.length} cells: `
      + res.hurt.map((r) => `${r.program}@${r.feed.toExponential(0)} ${r.gain.toFixed(2)}x`).join(', '));
  } else {
    console.log(`    no cell made worse than the conventional machine`);
  }
}
