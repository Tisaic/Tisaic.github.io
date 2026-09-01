// CAN GATED ADAPTATION OVERTURN A REFUSAL? The mill was chosen as the pilot's wheelhouse and
// refuses (verify 0.61x, a standing PREDICTION FAILED in its own test). Its problem is model
// error through a 200 ms gauge delay — the territory adaptation addresses. Force-deploy
// (the refusal is measured, not enforced — the flexisim page's convention) and adapt on the
// gauge with the same delayed-reference routing commissioning uses.
import { Pilot } from '../../lib/pilot/pilot.js';
import { A_ECC, DLY, DT, F_ECC, H0, HREF, MM, QM, S0, T_RUN, makeMill, score, openLoop,
  bisra, mon } from './rigs/rollmill-rig.mjs';

async function commission(seed = 1) {
  const m = makeMill(3);
  m.quiet = true;
  for (let i = 0; i < 4000; i++) m.step(S0);
  const pilot = new Pilot({
    autoRefuse: true, nMeasured: 3,
    channels: [{ lo: S0 - 0.12, hi: S0 + 0.12, vMax: 3e-3, aMax: 3e-4, jMax: 3e-5 }],
    uMax: 0.06, start: [S0], guards: [{ index: 0, max: 400 }],
    workspace: () => true, verifyRef: () => [S0], seed,
  });
  const wantHist = [];
  while (pilot.phase !== 'done') {
    if (pilot.phase === 'fit') { pilot.work(); continue; }
    const cmd = pilot.command();
    m.step(cmd[0].pos + cmd[0].u);
    wantHist.push((MM * cmd[0].pos + QM * H0) / (MM + QM));
    if (wantHist.length > DLY + 2) wantHist.shift();
    const want = wantHist.length > DLY ? wantHist[wantHist.length - 1 - DLY] : HREF;
    const g = m.gauge();
    pilot.observe([m.F, m.S, g], [g - want]);
  }
  return pilot;
}
const pilot = await commission();
console.log(`commissioned: ${pilot.verdict.deploy ? 'deploy' : `REFUSED (${pilot.status().report.verify?.ratio.toFixed(2)}x)`}`);
const refused = !pilot.verdict.deploy;
if (refused) pilot.verdict = { deploy: true, why: 'FORCED for this experiment — the refusal stands on the record' };

function run(mode) {
  pilot._initRun();
  pilot.online = mode === 'static' ? null : {};
  const wantHist = [];
  let uPk = 0;
  const cutStep = mode === 'takeaway' ? Math.floor(T_RUN * 0.4) : Infinity;
  let i2 = 0;
  const r = score((m, i, warm) => {
    if (warm) { m.step(S0); return; }
    const u = pilot.act(() => [S0]);
    uPk = Math.max(uPk, Math.abs(u[0]));
    m.step(S0 + u[0]);
    wantHist.push((MM * S0 + QM * H0) / (MM + QM));
    if (wantHist.length > DLY + 2) wantHist.shift();
    const want = wantHist.length > DLY ? wantHist[wantHist.length - 1 - DLY] : HREF;
    const g = m.gauge();
    if (i2 === cutStep) pilot.online = null;
    i2++;
    pilot.observe([m.F, m.S, g], pilot.online ? [g - want] : null);
  });
  const ro = pilot.readouts[0];
  const stats = mode === 'static' ? '' :
    `  updates ${ro._onlineN || 0} gated ${ro._infoSkipped || 0}/${ro._infoSeen || 0}`;
  return { ...r, uPk, stats };
}
console.log(`  no AGC          ${openLoop.rms.toFixed(2)} µm rms`);
console.log(`  BISRA gaugemeter ${bisra.rms.toFixed(2)}`);
console.log(`  monitor AGC     ${mon.rms.toFixed(2)}`);
for (const mode of ['static', 'online', 'takeaway']) {
  const snap = pilot.readouts.map((ro) => ro.w.map((a) => Float64Array.from(a)));
  const r = run(mode);
  console.log(`  forced ${mode.padEnd(9)} ${r.rms.toFixed(2)} µm rms / ${r.worst.toFixed(2)} worst`
    + `  u ${(1000 * r.uPk).toFixed(1)} µm${r.stats}`);
  for (const ro of pilot.readouts) {
    for (let i = 0; i < ro.w.length; i++) ro.w[i].set(snap[pilot.readouts.indexOf(ro)][i]);
    delete ro._rls; ro._row0 = []; ro._infoRef = undefined;
    ro._onlineN = 0; ro._infoSkipped = 0; ro._infoSeen = 0;
  }
  pilot.online = null;
}
