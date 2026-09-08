/**
 * Not a test — CAN THE LOOP BE TUNED BEFORE ANY COMMISSIONING, AND FOR FREE? (plan §52.29).
 *
 * §52.28 found the servo bandwidth is a carried constant worth up to 4x on programs the controller
 * never saw, and swept it the expensive way: a full ladder per bandwidth, ~10 machine-minutes each.
 * Reading those runs back, the BARE machine's own tracking error — measured before anything is
 * commissioned, in a handful of laps — ranked the five bench bandwidths and the three stiff ones in
 * exactly the order the commissioned ladder did. If that holds, loop tuning costs laps rather than
 * commissionings and belongs in the one press.
 *
 * This measures the cheap half properly: the conventional machine's contour error on a program, at
 * a ladder of bandwidths, on both cells, with the drive's saturation beside it — because a loop
 * that wins by clipping is not a loop that won. It asserts nothing. What it cannot do alone is
 * establish the RANK AGREEMENT, which needs the commissioned column from §52.28's runs; the table
 * prints both where they exist so the two can be read side by side.
 */
import { machine, settle, commissionComp } from '../flexisim/_rig.mjs';
import { sharpRect, roundedRect, circle } from '../../lib/flexisim/toolpath.js';

const F = 4e-3;
const CELLS = (process.env.CELLS || '0.25/0.03,64/0.20').split(',').map((s) => {
  const [K, E] = s.split('/').map(Number); return { K, E };
});
const BWS = (process.env.BWS || '7.7e-4,1.2e-3,2e-3,3e-3,4e-3,6e-3,8e-3').split(',').map(Number);
// DRIVES: the torque limit as a multiple of the gravity hold torque (plan §52.30). The shipped 32
// clips 2.0% of the bench square's samples on the CONVENTIONAL machine, so how much of that cell's
// error is the actuator rather than the controller is a plain sweep nobody has run.
const DRIVES = (process.env.DRIVES || '').split(',').filter(Boolean).map(Number);
const LAPS = +(process.env.LAPS || 2);
// The commissioned column from §52.28, so the two can be read side by side rather than from memory.
const KNOWN = {
  '0.25/0.03': { '0.00077': 2.19, '0.0012': 2.88, '0.002': 6.04, '0.003': 4.79, '0.004': 4.08 },
  '64/0.2': { '0.002': 1.15, '0.004': 1.27, '0.008': 1.33 },
};

const progs = () => [
  ['square (bench)', sharpRect({ w: 8, h: 8, centre: [12, 0], feed: F, accel: 4e-5, cornerDt: 40 })],
  ['rounded', roundedRect({ w: 8, h: 8, r: 1.5, centre: [12, 0], feed: F, accel: 4e-5, closed: true })],
  ['circle', circle({ r: 4, centre: [12, 0], feed: F, accel: 4e-5 })],
];

if (DRIVES.length) {
  console.log('=== 0. THE DRIVE SWEEP — how much of this cell\'s error is the ACTUATOR (plan §52.30)');
  console.log('  cell K/E     drive   square      rounded     circle      geo mean    sat ch0/ch1   peak/tauMax');
  for (const { K, E } of CELLS) {
    for (const drive of DRIVES) {
      const m = await machine({ K, E, drive });
      const { arm, servo } = m; const rc = commissionComp(arm, servo);
      const out = []; let s0 = 0, s1 = 0, p0 = 0, p1 = 0;
      for (const [name, path] of progs()) {
        const L = Math.round(path.lap);
        const [q1, q2] = arm.ik(path.at(0).x, path.at(0).y, true);
        settle(arm, servo, q1, q2, 6000); servo.resetLimitStats();
        let s2 = 0, n = 0;
        for (let k = 0; k < L * (LAPS + 1); k++) {
          const c = path.at(k); const q = arm.ik(c.x, c.y, true);
          const rt = arm.ikRates(q[0], q[1], c.vx, c.vy, c.ax, c.ay);
          const base = [{ theta: q[0], omega: rt.dq[0], alpha: rt.ddq[0] },
            { theta: q[1], omega: rt.dq[1], alpha: rt.ddq[1] }];
          const ff = rc.feedforward([[1, 0], [0, 1]], servo.jointTorques(base), { enableToolff: false });
          const t = servo.torques([{ ...base[0], theta: q[0] + ff.dq[0] }, { ...base[1], theta: q[1] + ff.dq[1] }]);
          arm.step(t[0], t[1], 1);
          if (k >= L) { const tool = arm.toolXY(); const ex = tool[0] - c.x, ey = tool[1] - c.y; s2 += ex * ex + ey * ey; n++; }
        }
        out.push(Math.sqrt(s2 / Math.max(1, n)));
        const st = servo.limitStats();
        s0 = Math.max(s0, st[0].fraction); s1 = Math.max(s1, st[1].fraction);
        p0 = Math.max(p0, st[0].peakDemand / st[0].tauMax); p1 = Math.max(p1, st[1].peakDemand / st[1].tauMax);
      }
      const geo = Math.exp(out.reduce((a, v) => a + Math.log(v), 0) / out.length);
      console.log(`  ${String(K).padStart(5)}/${String(E).padEnd(5)} ${String(drive).padStart(6)}  ${out.map((v) => v.toExponential(3).padStart(10)).join('  ')}  ${geo.toExponential(3).padStart(10)}   ${(100 * s0).toFixed(1)}%/${(100 * s1).toFixed(1)}%      ${p0.toFixed(2)}/${p1.toFixed(2)}`);
      await m.l1.destroy(); await m.l2.destroy();
    }
  }
  console.log('');
}
for (const { K, E } of CELLS) {
  const key = `${K}/${E}`;
  console.log(`\n=== cell K ${K} / E ${E} — the CONVENTIONAL machine's contour rms, before any commissioning`);
  console.log('  bw        square      rounded     circle      geo mean    sat ch0/ch1   peak/tauMax   commissioned (§52.28)');
  for (const bw of BWS) {
    const m = await machine({ K, E, bw });
    const { arm, servo } = m;
    // The same conventional baseline the ladder commissions on top of — one routine, not a second
    // one (the page, the ghost and the ladder all share it).
    const rc = commissionComp(arm, servo);
    const out = []; let sat0 = 0, sat1 = 0, pk0 = 0, pk1 = 0;
    for (const [name, path] of progs()) {
      const L = Math.round(path.lap);
      const [q1, q2] = arm.ik(path.at(0).x, path.at(0).y, true);
      settle(arm, servo, q1, q2, 6000);
      servo.resetLimitStats();
      let s2 = 0, n = 0;
      for (let k = 0; k < L * (LAPS + 1); k++) {
        const c = path.at(k); const q = arm.ik(c.x, c.y, true);
        const rt = arm.ikRates(q[0], q[1], c.vx, c.vy, c.ax, c.ay);
        // The baseline's own deflection feedforward, applied exactly as the host applies it.
        const base = [{ theta: q[0], omega: rt.dq[0], alpha: rt.ddq[0] },
          { theta: q[1], omega: rt.dq[1], alpha: rt.ddq[1] }];
        const ff = rc.feedforward([[1, 0], [0, 1]], servo.jointTorques(base), { enableToolff: false });
        const t = servo.torques([{ ...base[0], theta: q[0] + ff.dq[0] },
          { ...base[1], theta: q[1] + ff.dq[1] }]);
        arm.step(t[0], t[1], 1);
        if (k >= L) {   // rule 13: the first lap carries the start-up transient
          const tool = arm.toolXY();
          const ex = tool[0] - c.x, ey = tool[1] - c.y;
          s2 += ex * ex + ey * ey; n++;
        }
      }
      out.push({ name, rms: Math.sqrt(s2 / Math.max(1, n)) });
      const st = servo.limitStats();
      sat0 = Math.max(sat0, st[0].fraction); sat1 = Math.max(sat1, st[1].fraction);
      pk0 = Math.max(pk0, st[0].peakDemand / st[0].tauMax); pk1 = Math.max(pk1, st[1].peakDemand / st[1].tauMax);
    }
    const geo = Math.exp(out.reduce((a, o) => a + Math.log(o.rms), 0) / out.length);
    const kn = KNOWN[key] && KNOWN[key][String(bw)];
    console.log(`  ${bw.toExponential(1)}  ${out.map((o) => o.rms.toExponential(3).padStart(10)).join('  ')}  ${geo.toExponential(3).padStart(10)}   ${(100 * sat0).toFixed(1)}%/${(100 * sat1).toFixed(1)}%      ${pk0.toFixed(2)}/${pk1.toFixed(2)}        ${kn ? `${kn.toFixed(2)}x` : '—'}`);
    await m.l1.destroy(); await m.l2.destroy();
  }
}
console.log('\n  If the bare column ranks the bandwidths as the commissioned one does, the loop can be tuned');
console.log('  from a handful of laps rather than a ladder of commissionings — a plant constant the one');
console.log('  press could re-derive for free. A row that wins while clipping is not a row that won.');
