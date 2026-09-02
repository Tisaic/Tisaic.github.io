/**
 * @file THE REAL PAGE, PRESSED HEADLESS — the tested-to-app instrument. Serves the repo,
 * opens flexisim.html in the smoke's own Chromium, clicks ⑨, waits out the ladder, clicks
 * Run, and logs the badge at every lap boundary. Exists because two page defects in one
 * day were invisible to every Node check and to the smoke's wiring assertions: only the
 * artifact itself can show what an operator sees. Not part of the suite (it costs a full
 * commissioning); run it when scored-vs-deployed disagreement is suspected ON SCREEN.
 *
 * Run: (npx http-server . -p 8139 &) && node test/_pagepress.mjs
 */
import { chromium } from 'playwright-core';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8139/';
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
const browser = await chromium.launch({ executablePath: findChrome(),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const pg = await (await browser.newContext({ viewport: { width: 412, height: 915 } })).newPage();
pg.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await pg.goto(BASE + 'flexisim.html', { waitUntil: 'load' });
await pg.waitForTimeout(3000);
await pg.evaluate(() => document.querySelector('[data-tab="path"]')?.click());
await pg.waitForTimeout(2000);
await pg.evaluate(() => document.getElementById('autoP-btn').click());
console.log('pressed ⑨ — waiting for the ladder…');
const t0 = Date.now();
for (;;) {
  await pg.waitForTimeout(15000);
  const st = await pg.evaluate(() => ({ comm: typeof autoComm !== 'undefined' && autoComm,
    rep: typeof autoRep !== 'undefined' && !!autoRep,
    badge: document.getElementById('path-badge')?.textContent || '' }));
  console.log(`  [${((Date.now() - t0) / 60000).toFixed(1)}m] comm=${st.comm} rep=${st.rep} :: ${st.badge.slice(0, 110)}`);
  if (!st.comm && st.rep) break;
  if (Date.now() - t0 > 40 * 60000) { console.log('TIMEOUT'); process.exit(1); }
}
console.log('\nladder done — pressing Run and logging per-lap…');
await pg.evaluate(() => document.getElementById('runP').click());
let lastLap = -1;
const t1 = Date.now();
for (;;) {
  await pg.waitForTimeout(2000);
  const st = await pg.evaluate(() => ({ lap: lapP, k: kP,
    mode: document.getElementById('ctlP').value,
    lapRms: lapScoreP ? lapScoreP.report().contourRms : null,
    badge: document.getElementById('errP-badge')?.textContent || '' }));
  if (st.lap !== lastLap) {
    console.log(`  lap ${st.lap} begins (k=${st.k}, mode=${st.mode}); previous lap's badge: ${st.badge}`);
    lastLap = st.lap;
  }
  if (st.lap >= 4) { console.log(`\n  final badge: ${st.badge}`); break; }
  if (Date.now() - t1 > 25 * 60000) { console.log('RUN TIMEOUT', JSON.stringify(st)); break; }
}
await browser.close();
