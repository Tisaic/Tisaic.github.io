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
// THE PAGE'S STATE LIVES IN MODULE SCOPE, invisible to evaluate() — the DOM is the only
// honest window. Completion is the badge saying "shipped".
const t0 = Date.now();
for (;;) {
  await pg.waitForTimeout(15000);
  const badge = await pg.evaluate(() => document.getElementById('stateP-badge')?.textContent || '');
  console.log(`  [${((Date.now() - t0) / 60000).toFixed(1)}m] ${badge.slice(0, 120)}`);
  if (/shipped/.test(badge)) break;
  if (/failed|stopped/.test(badge)) { console.log('COMMISSION DID NOT FINISH'); process.exit(1); }
  if (Date.now() - t0 > 40 * 60000) { console.log('TIMEOUT'); process.exit(1); }
}
console.log('\nladder done — pressing Run and logging per-lap…');
await pg.evaluate(() => document.getElementById('runP').click());
// Per-lap detection from the DOM alone: the auto-mode badge carries "lap 1, correction
// still ramping" during lap 1, and the contour number is the CURRENT lap's running rms —
// log it every 10 s with the mode, so ramp, convergence, and any per-lap reset are all
// visible in one column.
const t1 = Date.now();
for (;;) {
  await pg.waitForTimeout(10000);
  const st = await pg.evaluate(() => ({
    mode: document.getElementById('ctlP')?.value,
    badge: document.getElementById('errP-badge')?.textContent || '',
    state: document.getElementById('stateP-badge')?.textContent || '' }));
  console.log(`  [${((Date.now() - t1) / 60000).toFixed(1)}m] mode=${st.mode} :: ${st.badge} :: ${st.state.slice(0, 60)}`);
  if (Date.now() - t1 > 20 * 60000) break;
}
await browser.close();
