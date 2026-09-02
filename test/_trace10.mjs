/**
 * @file MODES ⑨ AND ⑩ TRACED END TO END ON THE REAL PAGE, at K=1 / E=0.06 — the
 * machine the owner's "performance is still e-1" report was taken on. Serves the repo,
 * presses the buttons in the owner's order, and logs every stage's number so a
 * divergence from the Node bench (identify J, compile sim rms, per-lap delivered
 * contour) is pinned to the stage that loses it. Companion to _pagepress.mjs (⑨ only);
 * not part of the suite — it costs two full commissionings.
 *
 * Run: node test/_trace10.mjs   (serves :8141 itself)
 */
import { chromium } from 'playwright-core';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const PORT = 8141;
const BASE = `http://127.0.0.1:${PORT}/`;
function findChrome() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    for (const d of readdirSync(root).filter((x) => x.startsWith('chromium-')).sort().reverse()) {
      const p = join(root, d, 'chrome-linux', 'chrome');
      if (existsSync(p)) return p;
    }
  } catch { /* fall through */ }
  for (const c of ['/opt/pw-browsers/chromium', '/usr/bin/chromium']) if (existsSync(c)) return c;
  throw new Error('no chromium');
}

const srv = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));

const browser = await chromium.launch({ executablePath: findChrome(),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const pg = await (await browser.newContext({ viewport: { width: 412, height: 915 } })).newPage();
pg.on('pageerror', (e) => console.log('PAGEERROR', e.message));
pg.on('console', (m) => {
  const t = m.text();
  if (/⑩|⑨|flexisim]/.test(t) || m.type() === 'error') console.log('  page:', t.slice(0, 200));
});

const dbg = () => pg.evaluate(() => {
  const d = window.__flxPathDbg && window.__flxPathDbg();
  if (!d) return null;
  return { k: d.k, lap: d.lap, running: d.running, busy: d.busy, mode: d.mode,
    K: d.K, E: d.E, shape: d.shape, feed: d.feed,
    score: d.score, lapScore: d.lapScore, twin: d.twin,
    auto: { comm: d.auto.comm, have: d.auto.have, deployed: d.auto.deployed },
    probe: window.__flxStackProbe ? window.__flxStackProbe() : null,
    badge: document.getElementById('stateP-badge')?.textContent || '',
    stat: document.getElementById('twinStat')?.textContent || '' };
});
const t00 = Date.now();
const mins = () => ((Date.now() - t00) / 60000).toFixed(1);

async function waitIdle(label, timeoutMin, doneFn) {
  const t0 = Date.now();
  let lastStat = '';
  for (;;) {
    await pg.waitForTimeout(4000);
    const d = await dbg();
    if (d && doneFn(d)) return d;
    const s = d ? `${d.badge.slice(0, 60)} | ${d.stat.slice(0, 90)}` : 'no dbg';
    if (s !== lastStat) { console.log(`  [${mins()}m] ${label}: ${s}`); lastStat = s; }
    if (Date.now() - t0 > timeoutMin * 60000) throw new Error(`${label}: timeout`);
  }
}

/** Run the page for `laps` full laps, recording each lap's final lapScore and the
 * peak |applied correction| seen by the live probe. */
async function runLaps(laps, tag) {
  await pg.evaluate(() => { if (!window.__flxPathDbg().running) document.getElementById('runP').click(); });
  const rows = [];
  let last = null, probePk = 0, startLap = (await dbg()).lap;
  for (;;) {
    await pg.waitForTimeout(100);
    const d = await dbg();
    if (!d) continue;
    if (d.probe) probePk = Math.max(probePk, Math.abs(d.probe[0]), Math.abs(d.probe[1]));
    if (last && d.lap > last.lap) {
      rows.push({ lap: last.lap, contour: last.lapScore.contourRms, bias: last.lapScore.contourBias,
        osc: last.lapScore.contourOsc, steps: last.lapScore.steps, probePk });
      console.log(`  [${mins()}m] ${tag} lap ${last.lap}: contour ${last.lapScore.contourRms?.toExponential(3)} `
        + `(bias ${last.lapScore.contourBias?.toExponential(2)}, osc ${last.lapScore.contourOsc?.toExponential(2)}, `
        + `${last.lapScore.steps} steps)  probePk ${probePk.toFixed(3)}`);
      probePk = 0;
      if (rows.length >= laps) break;
    }
    last = d;
    if (d.lap - startLap > laps + 3) break;
  }
  await pg.evaluate(() => { if (window.__flxPathDbg().running) document.getElementById('runP').click(); });
  return rows;
}

await pg.goto(BASE + 'flexisim.html', { waitUntil: 'load' });
await pg.waitForTimeout(3000);
await pg.evaluate(() => document.querySelector('[data-tab="path"]')?.click());
await waitIdle('page load', 5, (d) => !d.busy && d.k >= 0);

// ---- stage 0: the machine — K=1 (index 2), E=0.06 (index 1), page-default program
console.log(`\n[${mins()}m] STAGE 0 — set K=1 / E=0.06`);
await pg.evaluate(() => {
  const set = (id, v) => { const el = document.getElementById(id); el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true })); };
  set('s-kP', '2'); set('s-eP', '1');
});
const d0 = await waitIdle('rebuild', 10, (d) => !d.busy && Math.abs(d.K - 1) < 1e-9 && Math.abs(d.E - 0.06) < 1e-9);
console.log(`  machine K=${d0.K} E=${d0.E} shape=${d0.shape} feed=${d0.feed.toExponential(2)}`);

// ---- stage 1: open-loop baseline, 2 laps — the denominator the owner sees
console.log(`\n[${mins()}m] STAGE 1 — open-loop baseline`);
const open = await runLaps(2, 'open');

// ---- stage 2: commission the twin (identify over the full ladders)
console.log(`\n[${mins()}m] STAGE 2 — Commission twin`);
await pg.evaluate(() => document.getElementById('b-twinComm').click());
const d2 = await waitIdle('identify', 60, (d) => !d.busy && d.twin && d.twin.fit);
console.log(`  identified K̂=${d2.twin.fit.K} Ê=${d2.twin.fit.E}  (truth 1 / 0.06 — ${
  Math.abs(d2.twin.fit.K - 1) < 1e-9 && Math.abs(d2.twin.fit.E - 0.06) < 1e-9 ? 'EXACT' : 'MISS'})`);

// ---- stage 3: compile this program
console.log(`\n[${mins()}m] STAGE 3 — Compile this program`);
await pg.evaluate(() => document.getElementById('b-twinCompile').click());
const d3 = await waitIdle('compile', 60, (d) => !d.busy && d.twin && d.twin.have && d.twin.compiledFor);
console.log(`  compiled for ${JSON.stringify(d3.twin.compiledFor)}`);

// ---- stage 4: engage ⑩ (pre-roll) and deliver 8 laps
console.log(`\n[${mins()}m] STAGE 4 — engage ⑩ and run 8 laps`);
await pg.evaluate(() => { const el = document.getElementById('ctlP'); el.value = 'twin';
  el.dispatchEvent(new Event('change', { bubbles: true })); });
const d4 = await waitIdle('pre-roll', 15, (d) => !d.busy && d.mode === 'twin' && d.k === 0);
console.log(`  engaged: mode=${d4.mode} k=${d4.k} lap=${d4.lap}`);
const twin = await runLaps(8, '⑩');

// ---- stage 5: ⑨ on the same machine, then its deployed laps
console.log(`\n[${mins()}m] STAGE 5 — press ⑨ on the same machine`);
await pg.evaluate(() => document.getElementById('autoP-btn').click());
await waitIdle('⑨ ladder', 45, (d) => !d.auto.comm && d.auto.have && d.auto.deployed);
const d5 = await dbg();
console.log(`  ⑨ deployed: ${JSON.stringify(d5.auto.deployed)}`);
await pg.evaluate(() => { const el = document.getElementById('ctlP'); el.value = 'auto';
  el.dispatchEvent(new Event('change', { bubbles: true })); });
await pg.waitForTimeout(1000);
const auto = await runLaps(4, '⑨');

// ---- the table
console.log('\n================ TRACE SUMMARY (page contour rms, tool units) ================');
console.log(`machine K=1 E=0.06, ${d0.shape} @ feed ${d0.feed.toExponential(2)}`);
console.log('open  :', open.map((r) => r.contour?.toExponential(2)).join('  '));
console.log('⑩ twin:', twin.map((r) => r.contour?.toExponential(2)).join('  '));
console.log('⑩ probe peak per lap:', twin.map((r) => r.probePk.toFixed(3)).join('  '), ' (clamp 0.4)');
console.log('⑨ auto:', auto.map((r) => r.contour?.toExponential(2)).join('  '));
const g = (rows) => rows.length ? open[open.length - 1].contour / rows[rows.length - 1].contour : NaN;
console.log(`gain over open — ⑩: ${g(twin).toFixed(1)}×   ⑨: ${g(auto).toFixed(1)}×`);
console.log('EXIT 0');
await browser.close();
srv.kill();
