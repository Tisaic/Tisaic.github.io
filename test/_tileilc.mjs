// SOFTWARE-ILC AGAINST THE TWIN: every per-harmonic scheme is a null because the
// nonlinear du-response transfers energy BETWEEN harmonics; a time-domain ILC update
// handles that naturally, and run against the SIM it costs zero machine laps -- the
// section-42 contract holds, and mode 10 compiles per program anyway. DC 2x2 mixing
// inverse, lead from H's own rise, zero-phase boxcar, small gain, 60 sim laps.
import { compileTwin, applyCompiled, fft } from '/home/user/Tisaic.github.io/lib/pilot/twin.js';
import { twinResponse, armSimulators } from '/home/user/Tisaic.github.io/lib/flexisim/twin.js';
const rig = await import('/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs');
const { makeArm, mkPath, homeArm } = rig;
const SS = 9, PRE = 1500, BINS = 1024, ITERS = 20;
const path = mkPath('sharp', 0.004);
const destroy = async (m) => { await m.arm.l1.destroy(); await m.arm.l2.destroy(); };
const home = async (m, p) => homeArm(m.arm, m.servo, p);
const sims = armSimulators({ buildArm: () => makeArm(), destroyArm: destroy, home, sample: SS });

console.log('probe + compile (shipped)…');
const H = await twinResponse({ buildArm: () => makeArm(), destroyArm: destroy, path, sample: SS });
const res = await compileTwin({ simulate: sims.compileSim(path, { laps: 5, preRoll: PRE }),
  H, iters: 11 });
console.log(`compiled ${res.report.rms.toExponential(2)}`);

// ---- the secant refine loop (mirrors refineCompiled's structure)
const du = res.du, sample = SS, lapSteps = path.lap, preRoll = PRE;
const nCh = 2;
const lapSamples = lapSteps / sample;
const base = applyCompiled({ du, sample, lapSteps, preRoll });
const handoff = preRoll + lapSamples;
let T = Array.from({ length: BINS }, (_, p) => base((handoff + (p / BINS) * lapSamples) * sample));
const mkF = (tile) => (k) => {
  const s = k / sample;
  if (s <= handoff) return base(k);
  const x = (((s - handoff) % lapSamples) / lapSamples) * BINS;
  const p0 = Math.floor(x) % BINS, p1 = (p0 + 1) % BINS, fr = x - Math.floor(x);
  const out = new Array(nCh);
  for (let c = 0; c < nCh; c++) out[c] = tile[p0][c] + fr * (tile[p1][c] - tile[p0][c]);
  return out;
};

const evalTile2 = async (tile) => {
  const e = await sims.compileSim(path, { laps: 4, preRoll: PRE })(mkF(tile));
  const start = Math.ceil(handoff + lapSamples);
  const R = Array.from({ length: BINS }, () => new Array(nCh).fill(0));
  const W = new Array(BINS).fill(0);
  let s2 = 0, n2 = 0;
  for (let s = start; s < e.length; s++) {
    const p = Math.floor((((s - handoff) % lapSamples) / lapSamples) * BINS) % BINS;
    for (let c = 0; c < nCh; c++) { R[p][c] += e[s][c]; s2 += e[s][c] ** 2; }
    W[p]++; n2++;
  }
  for (let p = 0; p < BINS; p++) {
    if (W[p]) { for (let c = 0; c < nCh; c++) R[p][c] /= W[p]; continue; }
    const q = (p + BINS - 1) % BINS;
    for (let c = 0; c < nCh; c++) R[p][c] = R[q][c];
  }
  return { rms: Math.sqrt(s2 / (n2 * nCh)), R };
};

// DC mixing inverse and the lead, both from H
const G0 = [[H[0].at(-1)[0], H[1].at(-1)[0]], [H[0].at(-1)[1], H[1].at(-1)[1]]];
const detG = G0[0][0] * G0[1][1] - G0[0][1] * G0[1][0];
const G0inv = [[G0[1][1] / detG, -G0[0][1] / detG], [-G0[1][0] / detG, G0[0][0] / detG]];
let leadSamp = 0;
{
  const fin = Math.abs(H[0].at(-1)[0]);
  for (let k = 0; k < H[0].length; k++) if (Math.abs(H[0][k][0]) > 0.5 * fin) { leadSamp = k; break; }
}
const leadBins = Math.round((leadSamp / lapSamples) * BINS);
console.log(`ILC against the twin: lead ${leadSamp} samples (${leadBins} bins)`);
const smooth = (rows, w = 3) => rows.map((_, p) => {
  const out = [0, 0];
  for (let d = -w; d <= w; d++) {
    const q = (p + d + BINS) % BINS;
    out[0] += rows[q][0]; out[1] += rows[q][1];
  }
  return [out[0] / (2 * w + 1), out[1] / (2 * w + 1)];
});
let bestT = T.map((r) => r.slice()), best = Infinity;
let gamma = 0.5, badRun = 0;
for (let it = 0; it <= 60; it++) {
  const { rms, R } = await evalTile2(T);
  if (rms < best) {
    best = rms; bestT = T.map((r) => r.slice()); badRun = 0;
    if (it % 5 === 0 || it < 4) console.log(`  iter ${it}: rms ${rms.toExponential(3)} *`);
  } else {
    T = bestT.map((r) => r.slice());
    gamma *= 0.6; badRun++;
    console.log(`  iter ${it}: rms ${rms.toExponential(3)} (rejected, gamma -> ${gamma.toFixed(3)})`);
    if (badRun >= 5 || gamma < 0.02) break;
  }
  if (it === 60) break;
  const Rs = smooth(R);
  T = T.map((row, p) => {
    const q = (p + leadBins) % BINS;
    const r0 = Rs[q][0], r1 = Rs[q][1];
    return [row[0] - gamma * (G0inv[0][0] * r0 + G0inv[0][1] * r1),
      row[1] - gamma * (G0inv[1][0] * r0 + G0inv[1][1] * r1)];
  });
}
console.log(`ILC tile: ${best.toExponential(3)}   (shipped 3.12e-3, floor ~4.3e-4)`);

const score = async (duF, laps) => {
  const m = await makeArm();
  homeArm(m.arm, m.servo, path);
  if (duF) {
    const c0 = path.at(0);
    const [q1h, q2h] = m.arm.ik(c0.x, c0.y, true);
    for (let k = 0; k < PRE * SS; k++) {
      const d = duF(k);
      const tau = m.servo.torques([{ theta: q1h + d[0], omega: 0, alpha: 0 },
        { theta: q2h + d[1], omega: 0, alpha: 0 }]);
      m.arm.step(tau[0], tau[1], 1);
    }
  }
  const total = Math.ceil(path.lap * laps);
  const rows = []; let cAcc = 0, cn = 0, lapNo = 0;
  for (let k = 0; k < total; k++) {
    const now = Math.floor(k / path.lap);
    if (now !== lapNo) { rows.push(Math.sqrt(cAcc / cn)); cAcc = 0; cn = 0; lapNo = now; }
    const c = path.at(k);
    const [q1, q2] = m.arm.ik(c.x, c.y, true);
    const rt = m.arm.ikRates(q1, q2, c.vx, c.vy, c.ax, c.ay);
    const d = duF ? duF(PRE * SS + k) : [0, 0];
    const tau = m.servo.torques([{ theta: q1 + d[0], omega: rt.dq[0], alpha: rt.ddq[0] },
      { theta: q2 + d[1], omega: rt.dq[1], alpha: rt.ddq[1] }]);
    m.arm.step(tau[0], tau[1], 1);
    if (k % SS === 0) {
      const tool = m.arm.toolXY();
      const sp = Math.hypot(c.vx, c.vy) || 1;
      const cerr = (c.vx / sp) * (tool[1] - c.y) - (c.vy / sp) * (tool[0] - c.x);
      cAcc += cerr * cerr; cn++;
    }
  }
  if (cn > 10) rows.push(Math.sqrt(cAcc / cn));
  await destroy(m);
  return rows;
};
const open = await score(null, 2);
const got = await score(mkF(bestT), 8);
console.log('open:', open.map((v) => v.toExponential(2)).join('  '));
console.log('ilc :', got.map((v) => v.toExponential(2)).join('  '));
console.log(`gain over open: ${(open.at(-1) / got.at(-1)).toFixed(1)}x   (shipped 44.0x)`);
console.log('EXIT 0');
