// A POSE-SCHEDULED CROSS KERNEL — the owner's pose grid applied to the quantity that actually
// varies with pose, and the last open question in the MIMO arc.
//
// WHAT IS ESTABLISHED. The cross channels carry a large LINEAR reverse response — amplitude-
// invariant across a tenfold range of du, peaking 2800-2960 solver steps out — and the pilot had
// no term for it at all. Giving it ONE cross kernel is worth +6.6% at the shipped probe hold and
// -2% at the re-derived one, and a kernel averaged over four lap phases is WORSE than the held
// one on every program.
//
// AND THE REASON THE AVERAGE FAILS IS THE REASON THIS SHOULD WORK. The cross response reverses to
// 18% of its own DC at one pose and 432% at another; `1->0` reads a moving peak of 5.6e-2 against
// the held probe's 1.9e-1, a factor of 3.4. One LTI kernel cannot carry a term that changes by
// twenty times over the workspace, and averaging incompatible operating points models none of
// them. What that needs is SCHEDULING.
//
// WHICH IS THE OWNER'S PROPOSAL, ON THE RIGHT QUANTITY. Gridding the pose failed as a way to fit
// the FORECAST — the regressor geometry can only use one octave of excitation and the scribble
// already sits in it — and pose is exactly the axis the CROSS TERM varies on. The grid was the
// right idea about the wrong term.
//
// AND IT STAYS INSIDE THE NORTH STAR. The schedule is on POSE, which is where the machine IS, not
// on position in a lap, which is where it is in a program it has run before. A kernel selected by
// state transfers to a program it has never seen; one selected by lap phase is the memory the
// retirement removes.
//
// THE MEASUREMENT. Hold the machine at each pose of a grid over the programs' own joint range,
// step the correction +du and -du, keep the SYMMETRIC half (the linear one), and build a cross
// grid per pose. At deploy, interpolate by the COMMANDED pose. Three rows: no cross model, one
// cross model, a pose-scheduled bank.
//
// WHAT WOULD KILL IT: the scheduled bank no better than the single held kernel. Then the cross
// term's pose dependence is real and irrelevant to a receding horizon, which would be the sixth
// time this machine has said that about a quantity that varies along the horizon.
import { makeArm, mkPath, homeArm, routeSignals, commissionArm, deployOn, PG }
  from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const FEED = +(process.env.CP_FEED || 0.004);
const UCAP = +(process.env.CP_UCAP || 0.6);
const DU = +(process.env.CP_DU || 0.1);
const NP = +(process.env.CP_NP || 3);            // grid is NP x NP poses
const SHAPES = (process.env.CP_SHAPES || 'sharp,circle,rounded').split(',');

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}, uCap ${UCAP}, pose grid ${NP}x${NP}, du ${DU}`);
const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED },
  uCap: UCAP, before: (p) => { p.mimo = true; } });
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }
const LEN = pilot.hs[0].resp.length;

// the pose grid, over what the PROGRAMS visit rather than over the declared box
const { arm: pa } = await makeArm();
const lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
for (const sh of SHAPES) {
  const p = mkPath(sh, FEED);
  for (let k = 0; k < Math.round(p.lap); k += 37) {
    const c = p.at(k), q = pa.ik(c.x, c.y, true);
    for (let i = 0; i < 2; i++) { lo[i] = Math.min(lo[i], q[i]); hi[i] = Math.max(hi[i], q[i]); }
  }
}
await pa.l1.destroy(); await pa.l2.destroy();
const poses = [];
for (let i = 0; i < NP; i++) for (let j = 0; j < NP; j++) {
  const f = (n) => (NP === 1 ? 0.5 : n / (NP - 1));
  poses.push([lo[0] + (hi[0] - lo[0]) * f(i), lo[1] + (hi[1] - lo[1]) * f(j)]);
}
console.log(`  ${poses.length} poses over q1 ${lo[0].toFixed(2)}..${hi[0].toFixed(2)}, `
  + `q2 ${lo[1].toFixed(2)}..${hi[1].toFixed(2)}`);

/** The held response of both outputs to a step on `ch` at `pose`, symmetric half only. */
async function respAt(pose, ch) {
  const out = [];
  for (const du of [DU, -DU]) {
    const { arm, servo } = await makeArm();
    homeArm(arm, servo, mkPath('rounded', FEED));
    const from = [arm.encoders()[0].angle, arm.encoders()[1].angle];
    const EASE = 4000, HOLD = Math.max(2000, Math.round(1.5 * pilot.Ts));
    for (let k = 0; k < EASE + HOLD; k++) {
      const t = Math.min(1, k / EASE);
      const q = [0, 1].map((i) => from[i] + (pose[i] - from[i]) * 0.5 * (1 - Math.cos(Math.PI * t)));
      const tau = servo.torques([{ theta: q[0], omega: 0, alpha: 0 }, { theta: q[1], omega: 0, alpha: 0 }]);
      arm.step(tau[0], tau[1], 1);
    }
    // the pre-hold baseline, so a standing offset is not read as a response (rule 25)
    const pre = [0, 0];
    const NPRE = 400;
    for (let k = 0; k < NPRE; k++) {
      const tau = servo.torques([{ theta: pose[0], omega: 0, alpha: 0 }, { theta: pose[1], omega: 0, alpha: 0 }]);
      arm.step(tau[0], tau[1], 1);
      const r = routeSignals(arm, [{ pos: pose[0] }, { pos: pose[1] }], tau).truth;
      pre[0] += r[0] / NPRE; pre[1] += r[1] / NPRE;
    }
    const trace = [];
    for (let k = 0; k < LEN; k++) {
      const q = [pose[0] + (ch === 0 ? du : 0), pose[1] + (ch === 1 ? du : 0)];
      const tau = servo.torques([{ theta: q[0], omega: 0, alpha: 0 }, { theta: q[1], omega: 0, alpha: 0 }]);
      arm.step(tau[0], tau[1], 1);
      const r = routeSignals(arm, [{ pos: pose[0] }, { pos: pose[1] }], tau).truth;
      trace.push([(r[0] - pre[0]) / du, (r[1] - pre[1]) / du]);
    }
    await arm.l1.destroy(); await arm.l2.destroy();
    out.push(trace);
  }
  const sym = [];
  for (let i = 0; i < LEN; i++) sym.push([(out[0][i][0] + out[1][i][0]) / 2, (out[0][i][1] + out[1][i][1]) / 2]);
  return sym;
}

// one bank per pose: H[j][c], built through the pilot's OWN _gridOf so the registration is shipped
const bank = [];
for (const pose of poses) {
  const H = [[null, null], [null, null]];
  let note = '';
  for (let ch = 0; ch < 2; ch++) {
    const sym = await respAt(pose, ch);
    for (let oc = 0; oc < 2; oc++) {
      const r = sym.map((v) => v[oc]);
      const tail = r.slice(Math.floor(r.length * 0.9));
      const dc = tail.reduce((a, v) => a + v, 0) / Math.max(1, tail.length);
      H[oc][ch] = pilot._gridOf(r, dc).hGrid;
      if (oc !== ch) {
        let pk = 0; for (const v of r) pk = Math.max(pk, Math.abs(v));
        note += ` ${ch}->${oc} dc ${dc.toFixed(4)} peak ${pk.toFixed(4)};`;
      }
    }
  }
  bank.push({ pose, H });
  console.log(`  pose ${pose.map((v) => v.toFixed(2)).join(',')}:${note}`);
}

const open = {};
for (const s of SHAPES) open[s] = (await deployOn(pilot, s, false, FEED)).r.totalRms;
console.log('\n  cross model' + SHAPES.map((s) => s.padStart(17)).join('') + '     geo mean');
const gm = (v) => Math.exp(v.reduce((a, x) => a + Math.log(x), 0) / v.length);
const savedH = pilot._mimoH;

// nearest-pose selection on the COMMANDED pose, which is where the machine is being sent — an
// ACTUAL would put the schedule inside the loop (rule 35, measured on the corner router).
const pick = (q) => {
  let best = bank[0], bd = Infinity;
  for (const b of bank) {
    const d = (b.pose[0] - q[0]) ** 2 + (b.pose[1] - q[1]) ** 2;
    if (d < bd) { bd = d; best = b; }
  }
  return best.H;
};

for (const mode of ['none', 'one held kernel', 'pose-scheduled']) {
  pilot._mimoH = mode === 'none' ? null : savedH;
  pilot.mimoAt = mode === 'pose-scheduled'
    ? (lookAhead, deployed) => pick([pilot._cmdFuture(lookAhead, 0, 0, deployed),
      pilot._cmdFuture(lookAhead, 0, 1, deployed)])
    : null;
  const xs = [], cols = [];
  for (const s of SHAPES) {
    const d = await deployOn(pilot, s, true, FEED);
    const x = open[s] / d.r.totalRms;
    xs.push(x); cols.push(`${x.toFixed(2)}x u${d.uPk.toFixed(3)}`.padStart(17));
  }
  console.log(`  ${mode.padEnd(16)}${cols.join('')}   ${gm(xs).toFixed(2).padStart(10)}`);
}
pilot._mimoH = savedH; pilot.mimoAt = null;
console.log('EXIT 0');
