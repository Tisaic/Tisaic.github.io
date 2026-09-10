/**
 * WHERE THE BROWSER'S LEARN TIME ACTUALLY GOES (plan §52.45).
 *
 * §52.35 recorded that one learn pass exceeds 63 minutes of browser where the identical work
 * costs 462k machine samples and ~230 s in Node, and that "the page's own commissioning does not
 * show that ratio". That second clause is the load-bearing one and it was never measured: it is
 * what makes the finding a browser-side DEFECT rather than the cost of a slow simulator. So this
 * measures SAMPLES PER SECOND for both phases in ONE page session — same page, same backend,
 * same yield closure, one variable — beside the rAF period, which is the hard ceiling neither
 * phase can beat and which no physics change can move.
 *
 * WHAT IT FOUND. Nothing is wrong with the learn path: at full grade one pass is 120k samples in
 * 29 s at 4,207 samples/s, FASTER per sample than the 3,532 of the commissioning that precedes it.
 * The 63 minutes was the HARNESS — `test/smoke.mjs` left FlowSim open, running its lattice sim on
 * the SwiftShader adapter, and the GPU process it pegs is the same one that serves this page's
 * rAF. Rule 17 aimed at a test rather than at a model.
 *
 * Not a test — an instrument. Run: node test/_pagerate.mjs   (needs a server; ./test/run.sh's)
 */
import { chromium } from 'playwright-core';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const findChrome = () => {
  if (process.env.CHROME_BIN && existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of readdirSync(root).filter((x) => x.startsWith('chromium-')).sort().reverse()) {
    const p = join(root, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p;
  }
  throw new Error('no chromium');
};
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8139/';
const browser = await chromium.launch({ executablePath: findChrome(),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] });
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(BASE + 'flexisim.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.__flxDbg && !window.__flxDbg().busy, null, { timeout: 180000 });

/** The rAF period: the ceiling on throughput at one yield per 150 samples. */
const raf = async (label, n = 90) => {
  const r = await page.evaluate(async (N) => {
    const t0 = performance.now(); const gaps = []; let last = t0;
    for (let i = 0; i < N; i++) { await new Promise((res) => requestAnimationFrame(res)); const now = performance.now(); gaps.push(now - last); last = now; }
    gaps.sort((a, b) => a - b);
    return { med: gaps[N >> 1], p90: gaps[Math.floor(N * 0.9)] };
  }, n);
  console.log(`  rAF ${label.padEnd(22)} median ${r.med.toFixed(1)} ms, p90 ${r.p90.toFixed(1)}  ->  ceiling ${(150 / (r.med / 1000)).toFixed(0)} samples/s`);
  return r;
};
console.log('\nWHERE THE BROWSER LEARN TIME GOES — one page, both phases, samples/s\n');
await raf('idle');

const samples = () => page.evaluate(() => { const c = window.__flxDbg().auto.cost; return c ? c.samples : 0; });
// REPRODUCE THE SUITE'S PAGE STATE, because the point of this instrument is the CONTROL and a
// fresh page is not the configuration the 63 minutes was measured in. `SPF` sets steps-per-frame
// and `RUNFIRST` presses Run and lets a ghost record, which is where `test/smoke.mjs` leaves the
// page before it commissions.
if (process.env.SPF) {
  await page.evaluate((v) => { const s = document.getElementById('s-spf'); s.value = v; s.dispatchEvent(new Event('input', { bubbles: true })); }, process.env.SPF);
}
if (process.env.RUNFIRST === '1') {
  await page.click('#run');
  await page.waitForFunction(() => { const d = window.__flxDbg(); return d.ghost && d.ghost.rms && !d.ghost.stale && d.running; }, null, { timeout: 300000 });
  await raf('running at spf ' + (process.env.SPF || 'default'));
}
const GRADE = process.env.GRADE || 'demo';
await page.selectOption('#grade', GRADE);
// PERIODIC=1: what the FULL browser tier commissions with — the lap-periodic rung built too.
if (process.env.PERIODIC === '1') {
  await page.evaluate(() => { const p2 = document.getElementById('periodic'); p2.checked = true; p2.dispatchEvent(new Event('input', { bubbles: true })); });
}
// HOP=1: the continuity instrument, which `test/smoke.mjs` turns on and never turns off.
if (process.env.HOP === '1') await page.evaluate(() => window.__flxHop(true));
let s0 = await samples(); const c0 = Date.now();
await page.click('#commission');
await page.waitForFunction(() => { const x = window.__flxDbg(); return !x.auto.commissioning || /^halted:|failed/.test(document.getElementById('badge').textContent); }, null, { timeout: 3600000 });
const cMs = Date.now() - c0, s1 = await samples();
console.log(`  COMMISSION (${GRADE})  ${((s1 - s0) / 1000).toFixed(0)}k samples in ${(cMs / 1000).toFixed(0)} s  ->  ${Math.round((s1 - s0) / (cMs / 1000))} samples/s`);
await page.waitForFunction(() => !window.__flxDbg().approaching, null, { timeout: 300000 });

const canLearn = await page.evaluate(() => !document.getElementById('learn').disabled);
if (!canLearn) { console.log('  LEARN not offered — nothing to compare'); }
else {
  await raf('after commissioning');
  await page.selectOption('#learn-passes', '1');
  const l0 = Date.now(), sl0 = await samples();
  await page.click('#learn');
  await page.waitForFunction(() => { const x = window.__flxDbg(); return (!x.auto.learning && x.auto.learned) || /^halted:|failed/.test(document.getElementById('badge').textContent); }, null, { timeout: 5400000 });
  const lMs = Date.now() - l0, sl1 = await samples();
  console.log(`  LEARN (1 pass)      ${((sl1 - sl0) / 1000).toFixed(0)}k samples in ${(lMs / 1000).toFixed(0)} s  ->  ${Math.round((sl1 - sl0) / (lMs / 1000))} samples/s`);
  const ph = await page.evaluate(() => { const x = window.__flxDbg(); return x.auto.learned ? x.auto.learned.phases : null; });
  if (ph) { console.log('  per phase (deltas):'); for (const p of ph) console.log(`    ${String(p.what).padEnd(12)} ${(p.ms / 1000).toFixed(1)} s   ${p.samples} samples   ${p.samples ? Math.round(p.samples / (p.ms / 1000)) + ' samples/s' : '(no machine time)'}`); }
  console.log(`\n  READING: the two phases at the SAME samples/s means learning is not a defect but a`);
  console.log(`  longer run of the same simulator, and §52.35's "commissioning does not show that`);
  console.log(`  ratio" was comparing a demo-grade commissioning with a full-length learn. A learn`);
  console.log(`  phase materially slower per sample is a real browser-side fault and the per-phase`);
  console.log(`  table above says which phase carries it.`);
}
await browser.close();
