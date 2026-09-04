// WHAT DOES A GOOD CORRECTION LOOK LIKE? — the owner's question, and the instrument this arc
// never built.
//
// THE GAP IT FILLS. The oracle ladder handed the QP a perfect FORECAST and measured it worth
// 20%. Nobody ever asked what the right CORRECTION looks like. Mode ⑩ hands that over for
// free: its compiled `du` is a known-good correction on the same machine, in the same frame —
// a joint offset added to the command, exactly what the pilot applies — reaching 44x contour
// where the pilot reaches 3.5x. Comparing the two traces reads the answer off a working
// solution instead of proposing a fifth mechanism, which is what the last four rounds did.
//
// AND IT TESTS THE ONE FINDING THAT HAS NO EXPLANATION. The machine wants LESS SHOULDER and
// slightly more elbow, and the only way to say that today is to lie about `h` (worth up to
// +139%) or to add the magnitude penalty the objective was missing (`mu`, worth +108%). If ⑩'s
// `du` independently shows a lower shoulder:elbow ratio than the pilot's, two unrelated routes
// agree on the balance and the RIGHT ratio becomes a measured number rather than a swept one.
//
// THE SCHEDULING QUESTION IS THE RIGHT SHAPE. Both the `mu` and `h` optima are
// PROGRAM-DEPENDENT — sharp near 0.03-0.1, circle near 0.3 — so if ⑩'s correction shifts its
// per-joint balance or its spectrum with corner aggressiveness in the same direction, that is
// the scheduling variable. Commanded aggressiveness is a STATE the machine has at deploy,
// unlike lap phase, so a law written on it is legal under the retirement.
//
// THE CONFOUND, STATED BEFORE THE NUMBERS. ⑩'s `du` is compiled FOR ONE PROGRAM, so it is
// program-specific by construction and any difference could be "a better correction" or merely
// "a correction that knows the program". That does not sink the diagnostic — it means the SHAPE
// is what may be read (per-joint balance, spectrum, phase against the error), and ⑩'s
// advantage is not something the pilot could copy directly.
import { compileTwin, refineCompiled } from '/home/user/Tisaic.github.io/lib/pilot/twin.js';
import { twinResponse, armSimulators } from '/home/user/Tisaic.github.io/lib/flexisim/twin.js';
import { commissionArm, deployOn, makeArm, mkPath, homeArm, PG }
  from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const SHAPES = (process.env.DC_SHAPES || 'sharp,circle').split(',');
const FEED = +(process.env.DC_FEED || 0.004);
const UCAP = +(process.env.DC_UCAP || 0.6);
const SS = 9, PRE = 1500;

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}, uCap ${UCAP}`);
const destroy = async (m) => { await m.arm.l1.destroy(); await m.arm.l2.destroy(); };
const home = async (m, p) => homeArm(m.arm, m.servo, p);
const sims = armSimulators({ buildArm: () => makeArm(), destroyArm: destroy, home, sample: SS });
const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED }, uCap: UCAP });
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }

// SPECTRAL CONTENT AT THE LAP'S OWN HARMONICS, which is the basis a periodic correction lives
// in — reported as the share of variance below and above the fourth harmonic, because a corner
// is a high-harmonic event and a droop is a low one.
const spectrum = (x, nh) => {
  const N = x.length;
  const mag = [];
  for (let h = 1; h <= nh; h++) {
    let re = 0, im = 0;
    for (let i = 0; i < N; i++) {
      const t = (2 * Math.PI * h * i) / N;
      re += x[i] * Math.cos(t); im -= x[i] * Math.sin(t);
    }
    mag.push(Math.hypot(re, im) * 2 / N);
  }
  return mag;
};
const stat = (x) => {
  let s = 0, pk = 0;
  for (const v of x) { s += v * v; pk = Math.max(pk, Math.abs(v)); }
  return { rms: Math.sqrt(s / Math.max(1, x.length)), pk };
};

for (const shape of SHAPES) {
  console.log(`\n=== ${shape} ===`);
  const path = mkPath(shape, FEED);
  const LAPK = Math.round(path.lap);
  // ---- MODE 10's correction: compile a lap-1 feedforward from the fitted twin ----------
  const H = await twinResponse({ buildArm: () => makeArm(), destroyArm: destroy, path, sample: SS });
  const res = await compileTwin({ simulate: sims.compileSim(path, { laps: 5, preRoll: PRE }), H, iters: 11 });
  const ref = await refineCompiled({ simulate: sims.compileSim(path, { laps: 4, preRoll: PRE }),
    H, du: res.du, sample: SS, lapSteps: path.lap, preRoll: PRE });
  console.log(`  mode 10 compiled+refined, tile rms ${ref.report.rms.toExponential(3)}`);
  const du = [[], []];
  for (let k = 0; k < LAPK; k++) {
    const d = ref.f(PRE * SS + k);
    du[0].push(d[0]); du[1].push(d[1]);
  }
  // ---- the pilot's correction on the same program, same frame -------------------------
  const tr = [];
  const r = await deployOn(pilot, shape, true, FEED, { trace: tr });
  const lapS = Math.round(LAPK / pilot.sample);
  const from = Math.max(0, tr.length - lapS);
  const pu = [[], []];
  for (let i = from; i < tr.length; i++) { pu[0].push(tr[i].u[0]); pu[1].push(tr[i].u[1]); }
  console.log(`  pilot delivered ${(await deployOn(pilot, shape, false, FEED)).r.totalRms / r.r.totalRms >= 0 ? '' : ''}`
    + `totalRms ${r.r.totalRms.toExponential(3)}`);

  const NH = 16;
  console.log('   source     ch    rms        peak      sh:el rms   h1-h4 share   h5-h16 share');
  for (const [name, sig] of [['mode 10', du], ['pilot', pu]]) {
    const st = [stat(sig[0]), stat(sig[1])];
    for (let c = 0; c < 2; c++) {
      const m = spectrum(sig[c], NH);
      let lo = 0, hi = 0;
      for (let h = 0; h < NH; h++) { const e = m[h] * m[h]; if (h < 4) lo += e; else hi += e; }
      const tot = lo + hi || 1;
      console.log(`  ${name.padEnd(9)} ${c}   ${st[c].rms.toExponential(3)}  ${st[c].pk.toExponential(3)}`
        + `   ${c === 0 ? (st[0].rms / Math.max(1e-12, st[1].rms)).toFixed(3).padStart(9) : '        -'}`
        + `      ${(lo / tot).toFixed(3)}         ${(hi / tot).toFixed(3)}`);
    }
  }
}
console.log('EXIT 0');
