// Smoke test: drives the real page in a mobile-emulated Chromium, exercises
// the console + docs viewer, asserts behavior, and writes screenshots for
// visual review. Exits non-zero if any check fails.
//
// Run via ./test/run.sh (starts a local server, ensures deps, tears down).
import { chromium } from 'playwright-core';
import { existsSync, readdirSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, 'screenshots');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8137/';

function findChrome() {
  if (process.env.CHROME_BIN && existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    for (const d of readdirSync(root).filter(x => x.startsWith('chromium-')).sort().reverse()) {
      const p = join(root, d, 'chrome-linux', 'chrome');
      if (existsSync(p)) return p;
    }
  } catch { /* ignore */ }
  for (const c of ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']) {
    if (existsSync(c)) return c;
  }
  throw new Error('No Chromium found. Set CHROME_BIN to a Chrome/Chromium binary.');
}

// Two tiers, set by test/run.sh. QUICK covers every cheap assertion plus the
// analytic physics; FULL adds the long-horizon scenarios -- the two-mode
// anti-slosh convergence and the FlowSim scene sweep, resolution ladder and
// stir/settle checks -- which between them drive several thousand solver steps
// through a software GPU and a few minutes of control simulation.
const FULL = process.env.SUITE === 'full';

// WHICH PAGES ARE WORTH TESTING IS DECIDED BY WHAT CHANGED, and test/run.sh works
// that out from git and passes it down here. A FlowSim edit should not be judged
// by the NGRC tab's warm-up timers, and an NGRC edit should not spend four
// minutes driving a software GPU -- both of those are checks that cannot fail for
// a reason the edit is responsible for, so running them is cost without
// information.
//
// The mapping is deliberately GENEROUS in one direction: anything shared
// (console-boot.js, the smoke test itself, run.sh, vendor) selects EVERY area,
// because a change there can break any page. Under-testing a shared file is the
// expensive mistake; over-testing one is a few minutes.
//
// AREAS UNSET means everything, so running `node test/smoke.mjs` by hand behaves
// as it always did. AREAS set-but-EMPTY means nothing changed and neither page
// needs driving -- which is a different statement, and `||` would have collapsed
// the two into "run everything" exactly when there was least reason to.
const AREAS = (process.env.AREAS === undefined ? 'ngrc,flowsim,flexisim' : process.env.AREAS)
  .split(',').map((s) => s.trim()).filter(Boolean);
const AREA = { ngrc: AREAS.includes('ngrc'), flowsim: AREAS.includes('flowsim'),
  flexisim: AREAS.includes('flexisim') };

let failed = 0;
// Section timing, so "the suite is slow" can be answered with a number instead
// of a guess. Printed at the end.
const timings = [];
let _t0 = Date.now(), _section = 'startup';
function section(name) {
  timings.push([_section, Date.now() - _t0]);
  _section = name; _t0 = Date.now();
}
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}

/**
 * THE CONSOLE MUST BE CLOSEABLE ON EVERY PAGE THAT EMBEDS IT, and this has to be
 * asserted per page rather than once, because the failure came from the HOST
 * page's stylesheet rather than from the console.
 *
 * ngrc.html and flowsim.html both style their own touch controls with a global
 * `button { flex:1; min-width:110px }`. console-boot's rules are more specific
 * and won every property they named -- but they did not name min-width, so the
 * four header buttons were forced to 110px each, 440px of them on a 412px phone,
 * and `Close ✕` was pushed off the right edge. Opening the console on those
 * pages left no way to shut it without reloading. index.html has no such rule,
 * so the one page the suite did check was the one page that worked.
 *
 * Asserting geometry, not presence: the button existed and was "visible" the
 * whole time. It was simply not on the screen.
 */
async function checkConsoleUsable(pg, label) {
  if (!(await pg.isVisible('#dbg-list'))) {
    await pg.click('#dbg-launch');
    await pg.waitForTimeout(250);
  }
  const geom = await pg.evaluate(() => {
    const c = document.getElementById('dbg-close').getBoundingClientRect();
    const l = document.getElementById('dbg-launch').getBoundingClientRect();
    return {
      left: Math.round(c.left), right: Math.round(c.right), width: Math.round(c.width),
      vw: window.innerWidth, launch: [Math.round(l.width), Math.round(l.height)],
    };
  });
  check(`${label}: the console Close button is on screen`,
    geom.left >= 0 && geom.right <= geom.vw + 1 && geom.width > 0, JSON.stringify(geom));
  check(`${label}: the console launcher keeps its own 46px size`,
    Math.abs(geom.launch[0] - 46) <= 2 && Math.abs(geom.launch[1] - 46) <= 2, JSON.stringify(geom));
  await pg.click('#dbg-close');
  await pg.waitForTimeout(200);
  check(`${label}: clicking Close actually closes the console`, !(await pg.isVisible('#dbg-list')));
}

mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({
  executablePath: findChrome(),
  // SwiftShader so the WebGL (three.js) NGRC demo renders headless.
  // --enable-unsafe-webgpu additionally exposes a SwiftShader WebGPU adapter,
  // which is what lets the FlowSim tab exercise its PRODUCTION WGSL backend here
  // rather than only its CPU reference. Without it navigator.gpu exists on a
  // secure origin but requestAdapter() returns null. It is software and slow --
  // fine for correctness, useless for throughput.
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'],
});
const ctx = await browser.newContext({
  viewport: { width: 412, height: 915 },
  deviceScaleFactor: 2.625,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
});
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e)));

console.log(`\nSmoke test → ${BASE}\n`);

section('index page');
// ---- load ----
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.screenshot({ path: join(SHOTS, '01-home.png') });
check('page loads with no uncaught errors', pageErrors.length === 0, pageErrors.join(' | '));

const build = await page.evaluate(() => window.__BUILD);
check('build version is stamped (> 0)', build && build.version > 0, JSON.stringify(build));

// ---- console capture ----
check('debug launcher present', await page.$('#dbg-launch') !== null);
await page.evaluate(() => { console.log('smoke log'); console.warn('smoke warn'); console.error('smoke error'); });
const buf = await page.evaluate(() => window.__dbg.buffer().map(e => e.type));
check('console captured log/warn/error', buf.includes('log') && buf.includes('warn') && buf.includes('error'), buf.join(','));

await page.click('#dbg-launch');
await page.waitForTimeout(300);
check('console panel opens', await page.isVisible('#dbg-list'));
const buildText = (await page.textContent('#dbg-build')) || '';
check('version status reads "latest" vs local server', /latest/.test(buildText), buildText);
await page.screenshot({ path: join(SHOTS, '02-console.png') });

// ---- eval box ----
await page.fill('#dbg-input', '1 + 2');
await page.click('#dbg-run');
await page.waitForTimeout(200);
const evalOk = await page.evaluate(() => window.__dbg.buffer().some(e => e.text.trim() === '3'));
check('eval box evaluates JS (1 + 2 → 3)', evalOk);

// ---- STALE MODULE DETECTION. This reached the owner's phone: the stale banner
// busts the HTML's own URL with ?v=, but `import './lib/.../x.js'` carries no
// query, so a brand-new page pairs with a CACHED module from an earlier build.
// The version line then reads "✓ latest" -- truthfully, about the document --
// while the page is dead, and the only symptom is a SyntaxError naming an export
// that is right there in the repo.
//
// THE MANIFEST IS CHECKED AGAINST THE PAGE'S OWN IMPORTS, not merely for
// existence: a list that has gone stale relative to what ships would refresh the
// wrong files and fail in exactly the same way, silently.
const mods = await page.evaluate(async () => {
  const r = await fetch('modules.json', { cache: 'no-store' });
  return r.ok ? r.json() : null;
});
check('modules.json ships and lists the module graph',
  mods && Array.isArray(mods.modules) && mods.modules.length > 20, JSON.stringify(mods).slice(0, 120));
const missing = await page.evaluate(async (listed) => {
  const set = new Set(listed);
  const out = [];
  for (const pg of ['flexisim.html', 'flowsim.html', 'ngrc.html']) {
    const txt = await (await fetch(pg, { cache: 'no-store' })).text();
    for (const m of txt.matchAll(/from\s+'(\.\/(?:lib)\/[^']+\.js)'/g)) {
      const rel = m[1].replace(/^\.\//, '');
      if (!set.has(rel)) out.push(`${pg} -> ${rel}`);
    }
  }
  return out;
}, mods ? mods.modules : []);
check('and every module the pages import is in it', missing.length === 0, missing.join(', '));

// The DETECTOR itself, driven through the real handler rather than described: the
// browser's own wording for this mismatch, dispatched as an uncaught error.
await page.evaluate(() => {
  window.dispatchEvent(new ErrorEvent('error', {
    message: "The requested module './lib/flexisim/compensator.js' does not provide an export named 'SineProfile'",
    filename: 'https://example.invalid/flexisim.html', lineno: 474, colno: 17,
  }));
});
await page.waitForTimeout(200);
const staleUi = await page.evaluate(() => ({
  banner: (document.getElementById('dbg-stale') || {}).style
    ? document.getElementById('dbg-stale').style.display : 'none',
  text: (document.getElementById('dbg-stale') || {}).textContent || '',
  build: (document.getElementById('dbg-build') || {}).textContent || '',
}));
check('a stale MODULE raises the banner, where "latest" alone would have hidden it',
  staleUi.banner === 'block' && /cached script/i.test(staleUi.text)
  && /STALE MODULE/.test(staleUi.build), JSON.stringify(staleUi));

// ---- docs viewer ----
await checkConsoleUsable(page, 'index');
check('docs launcher present', await page.$('#doc-all') !== null);
await page.click('#doc-all');
await page.waitForTimeout(700);
check('marked library loaded', await page.evaluate(() => !!(window.marked && window.marked.parse)));
const tag = await page.textContent('#doc-head .doc-tag').catch(() => '');
check('opens CLAUDE.md with CLAUDE tag', tag === 'CLAUDE', tag);
const h1 = await page.textContent('#doc-body h1').catch(() => '');
check('CLAUDE.md renders markdown (h1 element)', /CLAUDE/.test(h1 || ''), h1);
const groups = await page.$$eval('#doc-bar optgroup', gs => gs.map(g => g.label));
check('file list groups CLAUDE context + Docs',
  groups.some(g => /CLAUDE/.test(g)) && groups.some(g => /Docs/.test(g)), groups.join(' | '));
await page.screenshot({ path: join(SHOTS, '03-docs.png') });

// ---- NGRC playground (ngrc.html): three.js + Plotly + the ported library ----
// THE WHOLE NGRC PAGE IS FULL-TIER.
//
// The quick tier exists to be run on every edit, and what is being edited is
// FlowSim. Loading ngrc.html costs most of quick's wall clock, and its
// soft-sensor and finger-trace checks wait on warm-up timers that get flaky
// under load -- so a FlowSim edit was being reported on by checks that have
// nothing to do with it and can fail for reasons that are not the edit's fault.
// They still run on --full, where they belong.
const demoBase = BASE.replace(/index\.html$/, '') + 'ngrc.html';
if (FULL && AREA.ngrc) {
section('ngrc load');
const demo = await ctx.newPage();
const demoErrors = [];
demo.on('pageerror', e => demoErrors.push(String(e)));
demo.on('console', m => { if (m.type() === 'error') demoErrors.push('console.error: ' + m.text()); });
await demo.goto(demoBase, { waitUntil: 'networkidle' });
await demo.waitForTimeout(2500);
check('ngrc.html loads with no errors', demoErrors.length === 0, demoErrors.join(' | '));
const three = await demo.evaluate(() => !!(window.THREE || document.querySelector('#lz-stage canvas')));
check('ngrc: WebGL/three canvas present', three);
await checkConsoleUsable(demo, 'ngrc');
const nSamp = parseInt(await demo.textContent('#lz-n')) || 0;
check('ngrc: Lorenz model runs (samples > 0)', nSamp > 0, String(nSamp));
check('ngrc: model warms up', (await demo.textContent('#lz-warm')) === 'yes');
// training is manual now: idle until Start training, then wait out the window
check('ngrc: training idle until started', (await demo.evaluate(() => window.__lzDbg().trained)) === 0);
await demo.click('#lz-train');
await demo.waitForFunction(() => window.__lzDbg().trained >= 1500, null, { timeout: 30000 });
await demo.waitForSelector('#lz-dream:not([disabled])', { timeout: 30000 });
check('ngrc: ESN 1-step row populated', Number.isFinite(parseFloat(await demo.textContent('#lz-esn'))), await demo.textContent('#lz-esn'));
check('ngrc: MLP 1-step row populated', Number.isFinite(parseFloat(await demo.textContent('#lz-mlp'))), await demo.textContent('#lz-mlp'));
await demo.click('#lz-dream');
await demo.waitForTimeout(500);
check('ngrc: dream (free-run) toggles', /dreaming/.test(await demo.textContent('#lz-mode')));
await demo.waitForTimeout(1500);
check('ngrc: dream check row lists all four models', /NGRC.*ESN.*MLP.*linear/.test(await demo.textContent('#lz-dstat')), await demo.textContent('#lz-dstat'));
await demo.screenshot({ path: join(SHOTS, '04-ngrc.png') });
{
  // PER-SYSTEM RIDGE. The double pendulum CONSERVES ENERGY, so nothing contracts
  // a roll-out's error back onto an attractor the way Lorenz's dissipation does,
  // and the ridge that is harmless there (flat over 5 decades, measured) let the
  // pendulum's roll-out pump energy and saturate its clamps within ~10 steps.
  // Measured in this app, 12-run batches: NGRC 0.24 -> 0.64 Λ. Pinning the values
  // because the failure mode is silent — the 1-step fit stays excellent either
  // way (nRMSE ~6e-4), so nothing else in the suite would notice a revert.
  const ivLor = await demo.evaluate(() => window.__lzDbg().iv);
  await demo.selectOption('#lz-sys', 'dpend');
  await demo.waitForTimeout(400);
  const dp = await demo.evaluate(() => window.__lzDbg());
  check('ngrc: the double pendulum carries its own tighter ridge',
    dp.sys === 'double pendulum' && dp.iv < 1 && ivLor === 100,
    JSON.stringify({ lorenz: ivLor, dpend: dp.iv, sys: dp.sys }));
  await demo.selectOption('#lz-sys', 'lorenz');
  await demo.waitForTimeout(400);
  check('ngrc: switching back restores the default ridge',
    (await demo.evaluate(() => window.__lzDbg().iv)) === 100);
}

// soft-sensor tab: warms up + produces a hidden-state estimate
await demo.click('.tab[data-tab="pendulum"]');
await demo.waitForTimeout(3800);
check('ngrc: soft-sensor warms up', (await demo.textContent('#ss-warm')) === 'yes');
check('ngrc: soft-sensor estimate error is finite', Number.isFinite(parseFloat(await demo.textContent('#ss-rmse'))));
if (FULL) {
// the baselines must be real, and the plant must stay nonlinear
{
  const kd = await demo.evaluate(() => window.__ssDbg2());
  // The plant must stay NONLINEAR. If a future edit neutralises the friction,
  // backlash or hardening spring it reverts to a linear plant, where a Kalman
  // filter is provably optimal and this whole comparison is void.
  check('ngrc: plant exercises backlash + stiction', kd.nl && kd.nl.lash > 0.01 && kd.nl.stick > 0.01, JSON.stringify(kd.nl));
  check('ngrc: sensor uses the nonlinear universal map', kd.sensorFeats > 100, String(kd.sensorFeats));
  // No filter is an oracle here — that is the point of the nonlinear plant. The threshold was 0.01
  // and sat right on the natural run-to-run variation of this EWMA meter: a clean run measured
  // 0.00993 and failed, which asserts nothing real. On the LINEAR plant this filter measured
  // 0.0000 (exact to numerical precision), so anything above ~0.002 is already two orders of
  // magnitude away from oracle behaviour and discriminates the claim with margin.
  check('ngrc: exact-linear Kalman is no longer exact', kd.eK > 0.002, String(kd.eK));
  // the nonlinear basis needs data: measured, it ties the filters for ~1200
  // adapt samples and leads from then on. Assert the converged claim on the
  // SAMPLE COUNT, not at an arbitrary wall-clock moment.
  await demo.waitForFunction(() => window.__ssDbg2().adaptN >= 2500, null, { timeout: 60000 });
  const kd2 = await demo.evaluate(() => window.__ssDbg2());
  check('ngrc: learner beats every model-based baseline once trained',
    kd2.eN < kd2.eK && kd2.eN < kd2.eKm && kd2.eN < kd2.eA,
    `n=${kd2.adaptN}: ${kd2.eN} vs ${kd2.eK}/${kd2.eKm}/${kd2.eA}`);
  check('ngrc: Kalman + algebra rows rendered', /^0\./.test(await demo.textContent('#ss-kf')) && /^0\./.test(await demo.textContent('#ss-kfm')) && /^0\./.test(await demo.textContent('#ss-alg')));
  // PLS IS THE REAL INCUMBENT for soft sensing. A Kalman filter needs a physical model, which
  // a composition or wear sensor does not have; PLS regression on the measured signals is what
  // process plants actually deploy, so it is the baseline that decides whether this is a
  // product. It gets the SAME lagged window as the learner and its component count was chosen
  // by sweep (full rank; 3 and 6 both measured worse), so it is not a strawman. FROZEN is the
  // incumbent as deployed; ADAPTIVE is the stronger recursive variant that removes drift.
  // the frozen model is fitted at 3000 adapt samples and the block above only waits for
  // 2500, so wait for the fit rather than assume it — a first version asserted at 2500 and
  // read null for a model that simply had not been built yet.
  await demo.waitForFunction(() => window.__ssDbg2().ePlsF != null, null, { timeout: 90000 });
  const kd3 = await demo.evaluate(() => window.__ssDbg2());
  check('ngrc: both PLS baselines are fitted and finite',
    Number.isFinite(kd3.ePlsA) && Number.isFinite(kd3.ePlsF) && kd3.ePlsA > 0 && kd3.ePlsF > 0,
    JSON.stringify({ frozen: kd3.ePlsF, adaptive: kd3.ePlsA }));
  // measured 1.7-3.6x across training ages; pinned loosely because the ratio moves with what
  // the operator is doing at the moment of reading, and the claim is the direction
  check('ngrc: the learner beats a fully-tuned linear (PLS) soft sensor',
    kd3.eN < kd3.ePlsA * 0.8 && kd3.eN < kd3.ePlsF * 0.8,
    JSON.stringify({ ngrc: kd3.eN, plsAdaptive: kd3.ePlsA, plsFrozen: kd3.ePlsF }));
}
// the forecast is gated on the readout being warm, and says so until then
check('ngrc: 1 s preview reports its warm-up', /^(warming \d+\/\d+|—)$/.test((await demo.textContent('#ss-prev')).trim()) || Number.isFinite(parseFloat(await demo.textContent('#ss-prev'))), await demo.textContent('#ss-prev'));
// the forecast shares the sensor's 169-term basis, so its warm gate is 2500
// trained pairs — the row reads "warming N/2500" until then
await demo.waitForFunction(() => /^[0-9]/.test(document.getElementById('ss-prev').textContent), null, { timeout: 180000 });
check('ngrc: 1 s preview row populated once warm', Number.isFinite(parseFloat(await demo.textContent('#ss-prev'))), await demo.textContent('#ss-prev'));
check('ngrc: soft-sensor has no errors', demoErrors.length === 0, demoErrors.join(' | '));
await demo.screenshot({ path: join(SHOTS, '05-softsensor.png') });

// finger-trace tab: a simulated circular drag makes the model learn
await demo.click('.tab[data-tab="finger"]');
await demo.waitForTimeout(200);
await demo.locator('#fg-stage').scrollIntoViewIfNeeded();
await demo.waitForTimeout(200);
const fbox = await demo.locator('#fg-stage').boundingBox();
const fcx = fbox.x + fbox.width / 2, fcy = fbox.y + fbox.height / 2, fr = Math.min(fbox.width, fbox.height) * 0.3;
await demo.mouse.move(fcx + fr, fcy); await demo.mouse.down();
for (let i = 0; i < 350; i++) { const a = i * 0.1; await demo.mouse.move(fcx + fr * Math.cos(a), fcy + fr * Math.sin(a)); await demo.waitForTimeout(8); }
await demo.mouse.up();
// (still inside the FULL block: this check needs the drag performed above)
check('ngrc: finger-trace learns from a drag (samples > 0)', (parseInt(await demo.textContent('#fg-n')) || 0) > 0);
// the experiment summary must render, keep the experimental model a black box,
// and fully specify the three baselines
{
  await demo.waitForTimeout(1200);
  const ft = await demo.textContent('#fg-sum');
  check('ngrc: finger summary renders all six sections', ft.length > 1500
    && ['SYSTEM.', 'TASK AND SIGNALS.', 'MODELS.', 'PROTOCOL.', 'GRADING.', 'LATEST RESULT'].every(k => ft.includes(k)), String(ft.length));
  check('ngrc: finger summary keeps the experimental model a black box',
    !/NVAR|NG-?RC|next-generation reservoir|polynomial|feature expansion|lag window|stride|delta target/i.test(ft.split('Three fully specified baselines')[0]));
  check('ngrc: finger summary specifies the baselines',
    /method of analogues/.test(ft) && /spectral radius 0\.9/.test(ft) && /32-unit tanh/.test(ft));
}
// the default rung is 10 s — a 10 s horizon can't be scored by a short drag,
// so read the miss at a short rung (the slider's whole point)
await demo.evaluate(() => { const s = document.getElementById('fg-hz'); s.value = 9; s.dispatchEvent(new Event('input', { bubbles: true })); });
await demo.waitForTimeout(300);
check('ngrc: finger-trace error is finite (short rung)', Number.isFinite(parseFloat(await demo.textContent('#fg-rmse'))));
check('ngrc: CPU readout populated (AFM/kNN/app)', /AFM .*%.*kNN .*%.*app .*%/.test(await demo.textContent('#fg-cpu')), await demo.textContent('#fg-cpu'));
await demo.click('#fg-auto');
// commissioning fits the AFM brain (a few seconds) then flips the button
await demo.waitForFunction(() => document.getElementById('fg-auto').textContent.includes('Stop'), null, { timeout: 60000 });
await demo.waitForTimeout(800);
check('ngrc: autopilot commissions + free-runs without errors', demoErrors.length === 0, demoErrors.join(' | '));
check('ngrc: autopilot brain row is populated', /shape|path-locked|AFM|training/.test(await demo.textContent('#fg-ap')));
await demo.screenshot({ path: join(SHOTS, '06-finger.png') });
await demo.click('#fg-auto');

// multi-stroke (disjointed) doodle: two vertical lines drawn with pen lifts —
// the lap must lock WITH gaps, the ghost goes path-family, and the autopilot
// deploys as a path-locked replay (an AFM free-run cannot teleport)
await demo.click('#fg-reset');
await demo.waitForTimeout(300);
await demo.locator('#fg-stage').scrollIntoViewIfNeeded();
await demo.waitForTimeout(200);
const f2 = await demo.locator('#fg-stage').boundingBox();
const mx = f2.x + f2.width / 2, myT = f2.y + f2.height / 2 - 120, myB = f2.y + f2.height / 2 + 120;
for (let rep = 0; rep < 7; rep++) {
  for (const lx of [mx - 65, mx + 65]) {
    await demo.mouse.move(lx, myT); await demo.mouse.down();
    for (let i = 1; i <= 16; i++) { await demo.mouse.move(lx, myT + (myB - myT) * (i / 16)); await demo.waitForTimeout(42); }
    await demo.mouse.up();
    await demo.waitForTimeout(230);
  }
}
const dj = await demo.evaluate(() => window.__fgDbg());
check('ngrc: multi-stroke lap locks with pen-lift gaps', dj.lap > 0 && dj.gaps >= 2, JSON.stringify(dj));
await demo.click('#fg-auto');
await demo.waitForFunction(() => document.getElementById('fg-auto').textContent.includes('Stop'), null, { timeout: 30000 });
check('ngrc: multi-stroke autopilot is path-locked replay', /path-locked replay/.test(await demo.textContent('#fg-ap')), await demo.textContent('#fg-ap'));
await demo.waitForTimeout(2500);
await demo.screenshot({ path: join(SHOTS, '07-multistroke.png') });
await demo.click('#fg-auto');
}   // end FULL-only soft-sensor + finger-trace scenarios

section('ngrc tab3 finger');
// ---- tab 4: anti-slosh axis ----
if (FULL) {
await demo.click('.tab[data-tab="slosh"]');
await demo.waitForTimeout(400);
await demo.evaluate(() => { const s = document.getElementById('sl-speed'); s.value = 3; s.dispatchEvent(new Event('input', { bubbles: true })); });
// off the fixed shaper's design fill is where a frozen tuning is wrong; the experimental machine
// has to retune toward the true resonance and leave less wave for it
await demo.evaluate(() => { window.__slSet({ fill: 0.05 }); document.getElementById('sl-reset').click(); window.__slSet({ fill: 0.05 }); });
await demo.evaluate(() => { const s = document.getElementById('sl-speed'); s.value = 3; s.dispatchEvent(new Event('input', { bubbles: true })); });
await demo.waitForFunction(() => window.__slDbg().moves >= 10, null, { timeout: 120000 });
let sl = await demo.evaluate(() => window.__slDbg());
check('ngrc: anti-slosh axis runs and the plant sloshes', sl.moves >= 10 && sl.convCum > 0.05, JSON.stringify(sl));
check('ngrc: experimental retunes toward the true resonance',
  Math.abs(sl.wHat - sl.wTrue) < Math.abs(sl.wFixed - sl.wTrue), `${sl.wHat} true ${sl.wTrue} fixed ${sl.wFixed}`);
check('ngrc: experimental leaves less wave off the design fill',
  sl.recentConv / Math.max(sl.recentExp, 1e-9) > 2, JSON.stringify({ c: sl.recentConv, e: sl.recentExp }));
// the control must be the worst by a wide margin — if it is not, the "no anti-slosh" machine is
// being shaped by accident and the three-way ladder means nothing
check('ngrc: the no-anti-slosh control is far worse than both shaped machines',
  sl.recentCtrl > sl.recentConv * 1.5 && sl.recentCtrl > sl.recentExp * 5,
  JSON.stringify({ ctrl: sl.recentCtrl, conv: sl.recentConv, exp: sl.recentExp }));
// THE HYBRID'S TWO-SIDED RESULT, and the negative half is the load-bearing one. This is running at
// fill 0.05 where the fixed shaper is mistuned by a third, so the residual wave is a TIMING failure
// and an additive force trim cannot re-time an impulse: the trim must leave the wave essentially
// where it found it (measured 3.038 -> 2.958 mm) while still improving the tracking it CAN fix
// (1.721 -> 1.540 mm). At the design fill, where the shaper is right, it cuts the wave by a third.
check('ngrc: the hybrid trim improves tracking on the machine it is bolted onto',
  sl.hybErr < sl.convErr, JSON.stringify({ conv: sl.convErr, hyb: sl.hybErr }));
check('ngrc: a bolt-on trim cannot fix a MISTUNED shaper (timing, not force)',
  sl.recentHyb > sl.recentConv * 0.75 && sl.recentHyb > sl.recentExp * 3,
  JSON.stringify({ conv: sl.recentConv, hyb: sl.recentHyb, exp: sl.recentExp }));
check('ngrc: the hybrid stays bounded and finite', sl.recentHyb === sl.recentHyb && sl.recentHyb < sl.recentCtrl,
  JSON.stringify({ hyb: sl.recentHyb, ctrl: sl.recentCtrl }));
// THE PARAMETRIC MACHINE: conventional structure, constants identified online. Unlike the trim, a
// parameter learner CAN fix a mistuned shaper, because the resonance it identifies feeds the shaper
// rather than the force — so here (fill 0.05, shaper mistuned) it must beat the conventional machine
// by a wide margin where the trim could not.
check('ngrc: the parametric machine identifies usable constants',
  sl.parP.n > 3 && sl.parP.M > 3 && sl.parP.M < 80 && Math.abs(sl.parP.w - sl.wTrue) < 1.0,
  JSON.stringify(sl.parP));
check('ngrc: learned constants inside the conventional structure beat frozen ones',
  sl.recentPar < sl.recentConv * 0.5 && sl.recentPar < sl.recentHyb * 0.5,
  JSON.stringify({ conv: sl.recentConv, hyb: sl.recentHyb, par: sl.recentPar }));
// THE SUPER HYBRID: both mechanisms stacked on that same structure. The question it answers is
// whether they are redundant — a trim on top of already-correct constants could just as easily be
// fitting noise and adding roughness near the resonance. It is not: the constants cannot produce a
// term the structure does not contain (cogging, the Stribeck shape, the residual the one-time
// calibration leaves), so there is systematic residue left for the trim. It must also not lose the
// parametric machine's tracking, which is the cheap way this could have gone wrong.
check('ngrc: the super hybrid does not lose the parametric machine\'s tracking',
  sl.supErr <= sl.parErr, JSON.stringify({ par: sl.parErr, sup: sl.supErr }));
// stacking has to have CONVERGED to be judged: at 10 moves the identified constants are still
// moving and the two are within 10% of each other (measured 0.373 vs 0.338). A few moves later the
// gap opens to ~3.5x and holds. Reading the ratio at move 10 would be reading a meter before it
// settles — a mistake this project has made before.
await demo.waitForFunction(() => window.__slDbg().moves >= 15, null, { timeout: 120000 });
sl = await demo.evaluate(() => window.__slDbg());
check('ngrc: the two learning mechanisms are complementary, not redundant',
  sl.recentSup === sl.recentSup && sl.recentSup < sl.recentPar * 0.6 && sl.recentSup < sl.recentConv * 0.2,
  JSON.stringify({ conv: sl.recentConv, par: sl.recentPar, sup: sl.recentSup }));
// the physical scale must stay the mirror's (~1.5 mm following error, sub-10 mm waves) — a jump to
// tens of mm means the slosh state has been kicked into divergence somewhere
check('ngrc: following error is at the physical scale', sl.convErr > 0.4 && sl.convErr < 5, String(sl.convErr));
// health check: an UNSHAPED probe, then a named fault. A shaped move leaves no wave to measure.
await demo.click('#sl-check');
await demo.waitForFunction((n) => window.__slDbg().base && window.__slDbg().moves > n, sl.moves, { timeout: 120000 });
check('ngrc: health check captures a healthy baseline', (await demo.evaluate(() => window.__slDbg())).base === true);
// all five faults, not a spot check: the friction route needed a statistic that is IDENTIFIABLE
// over a single move (v and tanh(v/eps) are collinear at cruise, so the viscous/Coulomb split is
// arbitrary and the raw Fc fitted to -0.12 N against a true 5.5), and mount/leak needed a longer
// probe window to leave enough free wave to fit a period to.
for (const [f, re] of [['lubrication', /lubric/i], ['gauge_drift', /gauge/i], ['mount', /mount/i],
  ['leak', /leak/i], ['density', /density/i]]) {
  await demo.evaluate((ff) => window.__slSet({ faults: [ff] }), f);
  sl = await demo.evaluate(() => window.__slDbg());
  await demo.click('#sl-check');
  await demo.waitForFunction((n) => window.__slDbg().moves > n + 1 && !window.__slDbg().probePending
    && window.__slDbg().dwell === 0, sl.moves, { timeout: 180000 });
  sl = await demo.evaluate(() => window.__slDbg());
  check(`ngrc: the fault panel names the ${f} fault`, re.test(sl.diag), sl.diag);
  if (f === 'lubrication') {
    check('ngrc: the conventional following-error alarm stays silent', sl.prodErr < 1.4 * sl.baseErr,
      JSON.stringify({ prod: sl.prodErr, healthy: sl.baseErr }));
  }
  // a mount fault contaminates the friction fit; it must not be reported as a friction fault
  if (f === 'mount') check('ngrc: a mount fault is not misreported as lubrication', !/lubric/i.test(sl.diag), sl.diag);
  // the parametric machine is the ONLY one that adapts friction, so a lubrication fault is where it
  // separates: it must track the raised Coulomb term instead of carrying the textbook 5.5 N.
  if (f === 'lubrication') {
    check('ngrc: the parametric machine tracks the raised friction', sl.parP.Fc > 9,
      JSON.stringify({ Fc: sl.parP.Fc }));
    // NOTE what is and is not claimed here. The fault is injected MID-SESSION and checked ~2 moves
    // later, so the friction estimate is still converging and the 8-move scoring window is mostly
    // pre-fault: measured 0.472 parametric against 0.472 experimental, a tie. The converged
    // advantage (6.5-12x, fault present from the first move) is measured separately and recorded in
    // CLAUDE.md - asserting it here would be reading a meter before it has settled, which is a
    // mistake this project has made before. What IS true at this point, and worth pinning: adapting
    // friction is never WORSE than not adapting it, and both beat the frozen-constant machine.
    check('ngrc: adapting friction is no worse than not adapting it, and both beat frozen constants',
      sl.recentPar <= sl.recentExp * 1.1 && sl.recentPar < sl.recentConv * 0.6,
      JSON.stringify({ conv: sl.recentConv, exp: sl.recentExp, par: sl.recentPar }));
  }
}
await demo.evaluate(() => window.__slSet({ faults: [] }));
// the gauge can die and the axis keeps running off its own force and motion
await demo.click('#sl-gauge');
sl = await demo.evaluate(() => window.__slDbg());
await demo.waitForFunction((n) => window.__slDbg().moves >= n + 4, sl.moves, { timeout: 120000 });
sl = await demo.evaluate(() => window.__slDbg());
check('ngrc: survives losing the level gauge', sl.gaugeDead && sl.expWave === sl.expWave && sl.expWave < 5, JSON.stringify(sl));
await demo.click('#sl-gauge');
const slSum = await demo.textContent('#sl-sum');
check('ngrc: anti-slosh summary reports the control', /no anti-slosh/.test(slSum) && /CONTROL \(no anti-slosh\)/.test(slSum));
check('ngrc: anti-slosh summary reports the parametric machine',
  /PARAMETRIC: the conventional STRUCTURE exactly/.test(slSum) && /adapts FRICTION/.test(slSum));
check('ngrc: anti-slosh summary reports the super hybrid',
  /SUPER HYBRID: both learning mechanisms at once/.test(slSum) && /redundant or\s+complementary/.test(slSum)
  && /The SUPER HYBRID runs both mechanisms/.test(slSum));
check('ngrc: anti-slosh summary reports the hybrid retrofit',
  /HYBRID \(the retrofit\)/.test(slSum) && /NOT MODIFIED IN ANY WAY/.test(slSum) && /failure of TIMING/.test(slSum));
check('ngrc: anti-slosh summary renders all six sections',
  ['SYSTEM.', 'TASK AND SIGNALS.', 'MODELS.', 'PROTOCOL.', 'GRADING.', 'LATEST RESULT'].every((k) => slSum.includes(k)));
{
  // black-box contract. It is audited over the WHOLE models section, not just the experimental
  // paragraph: four of the six machines now carry a piece of the withheld method (the trim, the
  // identified constants, both stacked, and the experimental estimator itself), so a leak in any
  // of their descriptions is the same leak. The conventional baseline sits in the same section and
  // is fully specified — it just does not use any of these terms.
  const own = slSum.split('PROTOCOL.')[0].split('MODELS.')[1] || '';
  check('ngrc: anti-slosh experimental method stays a black box',
    !/NVAR|NG-?RC|next-generation reservoir|polynomial|feature expansion|lag window|stride|recursive least squares|ridge|covariance/i.test(own),
    own.slice(0, 160));
  check('ngrc: anti-slosh withholding is stated explicitly', /intentionally NOT disclosed/.test(slSum));
  check('ngrc: anti-slosh baseline is fully specified',
    /ZVD input shaper/.test(slSum) && /Kp 4200/.test(slSum) && /M\*a_ref \+ B\*v_ref/.test(slSum));
}
// MOVE SPEED, PROFILE and the SECOND SLOSH MODE (v108). Placed at the END of the
// tab-4 section on purpose: toggling the second mode changes the PLANT and therefore
// calls slReset, and an earlier placement reset the machines underneath the fault
// tests that follow — the parametric machine's friction estimate had not reconverged
// and its check failed. Same mistake, same fix, as the tab-1 ridge check.
// MOVE SPEED, PROFILE and the SECOND SLOSH MODE (v108). The move-speed slider is the
// cycle-time knob the tab exists to justify, and it must scale the commanded motion
// without touching the sim rate; the S-curve must preserve the stroke while taking
// longer; and the second mode must be OFF by default, because with it on the
// resonance estimator is fooled (14.3 rad/s reported against a plant with 9.3 and
// 17.5) and the adaptive machines lose to the fixed shaper for a reason that is an
// instrument defect rather than a property of the method.
{
  const base = await demo.evaluate(() => window.__slDbg());
  check('ngrc: the second slosh mode is off by default',
    base.mode3 === false && base.modes.length === 1 && base.moveSpd === 1 && base.profile === 'trap',
    JSON.stringify({ mode3: base.mode3, modes: base.modes.length, spd: base.moveSpd, prof: base.profile }));
  const trapLen = base.moveLen;
  await demo.evaluate(() => window.__slSet({ profile: 'scurve' }));
  await demo.waitForFunction((n) => window.__slDbg().moves > n + 1, base.moves, { timeout: 60000 });
  const sc = await demo.evaluate(() => window.__slDbg());
  check('ngrc: the S-curve lengthens the move (jerk limit) without changing the stroke',
    sc.moveLen > trapLen, JSON.stringify({ trap: trapLen, scurve: sc.moveLen }));
  await demo.evaluate(() => window.__slSet({ profile: 'trap', moveSpd: 2.0 }));
  await demo.waitForFunction((n) => window.__slDbg().moves > n + 1, sc.moves, { timeout: 60000 });
  const fast = await demo.evaluate(() => window.__slDbg());
  check('ngrc: a faster move speed shortens the commanded move',
    fast.moveLen < trapLen && fast.moveSpd === 2, JSON.stringify({ x1: trapLen, x2: fast.moveLen }));
  // the second mode's parameters are DERIVED, not fitted - if a later edit invents them
  // this catches it (w3/w1 = 1.88 and the wall weight 0.111 at the nominal fill)
  await demo.evaluate(() => window.__slSet({ moveSpd: 1.0, mode3: true }));
  await demo.waitForTimeout(600);
  const m3 = await demo.evaluate(() => window.__slDbg());
  // assert the CLOSED FORM, not a number: w3/w1 = sqrt(3*tanh(3*pi*h/L)/tanh(pi*h/L)),
  // which is fill-dependent (1.878 at 0.12 m, 2.393 at the 0.05 m this suite runs at) —
  // an earlier version of this check hardcoded the 0.12 m value and failed here for that
  // reason alone. The wall weight tends to exactly 1/n^2 = 0.111 in deep water.
  const hFill = m3.hTrue, LT = 0.30;
  const wRatio = Math.sqrt(3 * Math.tanh(3 * Math.PI * hFill / LT) / Math.tanh(Math.PI * hFill / LT));
  check('ngrc: the second slosh mode matches the derived modal physics',
    m3.modes.length === 2 && Math.abs(m3.modes[1].w / m3.modes[0].w - wRatio) < 0.02
    && Math.abs(m3.modes[1].wt - 0.111) < 0.01,
    JSON.stringify({ modes: m3.modes, fill: hFill, expectedRatio: +wRatio.toFixed(3) }));
  // THE TWO-MODE PLANT MUST NOW BE WINNABLE. Before the probe-only retune the estimate
  // oscillated 9.3 <-> 14.2 every move and the experimental machine lost to the fixed
  // shaper; with it, the estimate holds and the adaptive machines beat conventional by ~7x
  // off the design fill. Pinned because the failure was silent - nothing else in the suite
  // exercises the second mode at all.
  await demo.evaluate(() => window.__slSet({ mode3: true, fill: 0.05 }));
  const m3n = (await demo.evaluate(() => window.__slDbg())).moves;
  await demo.waitForFunction((n) => window.__slHist().sup.length >= n + 18, m3n, { timeout: 240000 });
  const two = await demo.evaluate(() => ({ h: window.__slHist(), s: window.__slDbg() }));
  const tail = (a) => a.slice(-8).reduce((x, y) => x + y, 0) / 8;
  const cv = tail(two.h.conv), ex = tail(two.h.exp), sp = tail(two.h.sup);
  check('ngrc: with two slosh modes the adaptive machines still beat the fixed shaper',
    ex < cv * 0.35 && sp < cv * 0.35,
    JSON.stringify({ conv: +cv.toFixed(3), exp: +ex.toFixed(3), sup: +sp.toFixed(3) }));
  // and the resonance estimate must STAY PUT rather than walking onto mode 3
  check('ngrc: the two-mode resonance estimate does not run away',
    Math.abs(two.s.wHat - two.s.wTrue) / two.s.wTrue < 0.15,
    JSON.stringify({ wHat: +two.s.wHat.toFixed(2), wTrue: +two.s.wTrue.toFixed(2) }));
  await demo.evaluate(() => window.__slSet({ mode3: false, fill: 0.05 }));
  await demo.waitForTimeout(400);
}
await demo.evaluate(() => window.scrollTo(0, 0));
await demo.waitForTimeout(300);
await demo.screenshot({ path: join(SHOTS, '08-antislosh.png') });

check('ngrc: playground has no errors overall', demoErrors.length === 0, demoErrors.join(' | '));

// ============================================================================
// FLOWSIM — the lattice physics engine. Its numerics are verified in Node
// (test/lattsim/*.test.mjs) against analytic answers; what is checked HERE is
// that the page builds a real simulation, degrades honestly when WebGPU is
// absent (which it is in this Chromium), and draws actual field data.
// ============================================================================
// Close the NGRC page first. Chromium's software WebGPU drops the device
// instance for backgrounded pages, which surfaces as "a valid external Instance
// reference no longer exists" the moment FlowSim tries to read anything back.
await demo.close();
}   // end FULL-only ngrc page

}   // end FULL-only anti-slosh scenarios
section('ngrc tab4 antislosh');
// EVERY FLOWSIM CHECK, GATED AS ONE BLOCK. Nothing after section('end') refers
// to `flow`, so the whole page can be skipped without leaving a dangling
// reference -- which is what makes this a gate rather than a rewrite.
if (AREA.flowsim) {
section('flowsim page');
const flow = await ctx.newPage();
const flowErrors = [];
flow.on('pageerror', e => flowErrors.push(String(e)));
// Also capture console.error. The page catches its own async failures and logs
// them rather than letting them reach pageerror, so without this a broken render
// path would show up only as a red badge in a screenshot nobody read.
const flowConsole = [];
flow.on('console', m => { if (m.type() === 'error') flowConsole.push(m.text()); });
await flow.goto(BASE + 'flowsim.html', { waitUntil: 'networkidle' });
await flow.waitForFunction(() => window.__fsDbg && window.__fsDbg().backend !== null, null, { timeout: 60000 });

check('flowsim.html loads with no errors', flowErrors.length === 0, flowErrors.join(' | '));

const fs0 = await flow.evaluate(() => window.__fsDbg());
check('flowsim: a simulation is built', fs0.cells > 0, JSON.stringify(fs0.cells));
check('flowsim: geometry is classified (fluid + solid + inlet + outlet)',
  fs0.census && fs0.census.FLUID > 0 && fs0.census.SOLID > 0 && fs0.census.INLET > 0 && fs0.census.OUTLET > 0,
  JSON.stringify(fs0.census));
// This Chromium has no navigator.gpu at all, so the honest outcome is the CPU
// reference plus a stated reason -- not a blank canvas and not a pretence.
const hasGPU = await flow.evaluate(() => !!navigator.gpu);
check('flowsim: backend selection matches what the browser actually offers',
  hasGPU ? fs0.backend === 'webgpu' : fs0.backend === 'cpu', `${fs0.backend} (navigator.gpu=${hasGPU})`);
if (!hasGPU) {
  check('flowsim: the WebGPU fallback states its reason', !!fs0.fallback, String(fs0.fallback));
  check('flowsim: the badge says so', /CPU reference/.test(await flow.textContent('#backend-badge')),
    await flow.textContent('#backend-badge'));
}

// Physics must actually advance and stay finite.
await flow.evaluate(() => window.__fsStep(200));
const diag = await flow.evaluate(() => window.__fsDiag());
check('flowsim: stepping advances the solver', diag.step >= 200, String(diag.step));
check('flowsim: the field is finite and stable', diag.finite && diag.stable.state !== 'diverged',
  JSON.stringify(diag.stable));
// The density range is the diagnostic that caught the first outlet
// implementation: it copied its neighbour's populations, imposed nothing on the
// pressure, and drained the channel to rho = 0.32 while the velocity field still
// looked like flow and the run was not diverging.
//
// The band is +/-20% rather than +/-2% because the outlet is FIRST ORDER and
// mildly reflective, so an impulsive start rings an acoustic wave between the
// two open faces which decays slowly: measured +/-17% at step 200, +/-13% at
// 600, +/-5% by 2200. That is a documented property of this boundary, not
// instability -- and 0.8 still catches the 0.32 drain by a factor of three.
check('flowsim: density stays physical (the outlet anchors the pressure)',
  diag.rhoMin > 0.8 && diag.rhoMax < 1.25, `${diag.rhoMin} … ${diag.rhoMax}`);
check('flowsim: the inlet drives a flow', diag.uMax > 1e-3, String(diag.uMax));

// The slice renderer must draw real field data, not an empty canvas.
await flow.evaluate(() => window.__fsDraw());
await flow.waitForTimeout(200);
const px = await flow.evaluate(() => {
  const c = document.getElementById('cv');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const seen = new Set();
  for (let i = 0; i < d.length; i += 4) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
  return { w: c.width, h: c.height, colors: seen.size };
});
check('flowsim: the slice canvas is the lattice cross-section', px.w > 8 && px.h > 8, JSON.stringify(px));
check('flowsim: the slice shows a field, not one flat colour', px.colors > 8, String(px.colors));

// ---- THE PARITY CHECK, the reason both backends exist.
// The Node tests verify the CPU reference against analytic answers. This
// verifies that the production WGSL kernel computes the SAME THING. Two
// implementations of one set of equations drift the moment nobody compares
// them, and the drift looks like a plausible flow rather than an error.
if (hasGPU && fs0.backend === 'webgpu') {
  const parity = await flow.evaluate(async () => {
    const [{ channelFlow }] = await Promise.all([import('./lib/lattsim/scenes.js')]);
    const mk = () => channelFlow({ resolution: 16, tau: 0.6, inletVelocity: 0.05 });
    const g = mk(); await g.build({ backend: 'webgpu' });
    const c = mk(); await c.build({ backend: 'cpu' });
    g.advance(60); c.advance(60);
    const [mg, mc] = [await g.backend.snapshot('macro'), await c.backend.snapshot('macro')];
    const N = g.lattice.cellCount;
    let worstU = 0, worstR = 0, peak = 0;
    for (let i = 0; i < N; i++) {
      if (g.flags[i] === 1) continue;
      worstR = Math.max(worstR, Math.abs(mg[i] - mc[i]));
      for (let k = 1; k < 4; k++) {
        worstU = Math.max(worstU, Math.abs(mg[k * N + i] - mc[k * N + i]));
        peak = Math.max(peak, Math.abs(mc[k * N + i]));
      }
    }
    const out = { worstU, worstR, peak, cells: N,
      gpu: (await g.diagnostics()).mass, cpu: (await c.diagnostics()).mass };
    g.destroy(); c.destroy();
    return out;
  });
  // Both run f32 and both are chaotic-free at this size, so agreement should be
  // at the level of float accumulation order, not of physics.
  check('flowsim: the WGSL kernel and the CPU reference agree on velocity',
    parity.worstU < 1e-4 * Math.max(parity.peak, 1e-6) + 1e-6,
    `worst |du| ${parity.worstU.toExponential(2)} against peak ${parity.peak.toExponential(2)}`);
  check('flowsim: the two backends agree on density',
    parity.worstR < 1e-5, parity.worstR.toExponential(2));
  check('flowsim: the two backends agree on total mass',
    Math.abs(parity.gpu - parity.cpu) / parity.cpu < 1e-5,
    `${parity.gpu} vs ${parity.cpu}`);
}

// ---- THE SCALAR PARITY CHECK. Same argument as the fluid parity above, for the
// passive scalar: the Node tests verify the CPU reference against the analytic
// diffusivity and advection speed; this verifies the WGSL scalar kernel computes
// the SAME concentration field, cell by cell, on a channel with a dye injector.
if (hasGPU && fs0.backend === 'webgpu') {
  const sparity = await flow.evaluate(async () => {
    const [{ Simulation }, { LBMFluidOperator }, { ScalarTransportOperator }, { region, CELL }] =
      await Promise.all([
        import('./lib/lattsim/simulation.js'),
        import('./lib/lattsim/operators/lbm.js'),
        import('./lib/lattsim/operators/scalar.js'),
        import('./lib/lattsim/materials.js'),
      ]);
    const mk = () => {
      const sim = new Simulation({ lattice: { size: [24, 12, 12], spacing: 1e-3 } });
      sim.addRegion(region.wall(CELL.SOLID, 1, -1)).addRegion(region.wall(CELL.SOLID, 1, +1));
      sim.addRegion(region.wall(CELL.SOLID, 2, -1)).addRegion(region.wall(CELL.SOLID, 2, +1));
      sim.addRegion(region.wall(CELL.INLET, 0, -1));
      sim.addRegion(region.wall(CELL.OUTLET, 0, +1));
      sim.addPhysics(new LBMFluidOperator({ tau: 0.6, inletVelocity: [0.05, 0, 0], initialVelocity: [0.05, 0, 0] }));
      // a dye needle a few cells in, injecting continuously
      sim.addPhysics(new ScalarTransportOperator({ tau: 0.6, source: { centre: [6, 6, 6], radius: 2, value: 1 } }));
      return sim;
    };
    const g = mk(); await g.build({ backend: 'webgpu' });
    const c = mk(); await c.build({ backend: 'cpu' });
    g.advance(60); c.advance(60);
    const [cg, cc] = [await g.backend.snapshot('conc'), await c.backend.snapshot('conc')];
    const N = g.lattice.cellCount;
    let worst = 0, peak = 0, sg = 0, sc = 0;
    for (let i = 0; i < N; i++) {
      if (g.flags[i] === 1) continue;                 // skip solid (CELL.SOLID)
      worst = Math.max(worst, Math.abs(cg[i] - cc[i]));
      peak = Math.max(peak, Math.abs(cc[i]));
      sg += cg[i]; sc += cc[i];
    }
    // probeMany must return exactly what a full snapshot holds at those cells, on
    // both backends -- the batched readback the field-reconstruction demo depends
    // on. Test the 1-component (conc) and 4-component (macro) paths.
    const cells = [];
    for (let i = 0; i < N; i += Math.max(1, Math.floor(N / 40))) if (g.flags[i] !== 1) cells.push(i);
    const [pmG, pmC] = [await g.backend.probeMany('conc', cells), await c.backend.probeMany('conc', cells)];
    const mg = await g.backend.snapshot('macro');
    const pmMac = await g.backend.probeMany('macro', cells);
    let pmWorst = 0, pmMacWorst = 0;
    for (let j = 0; j < cells.length; j++) {
      pmWorst = Math.max(pmWorst, Math.abs(pmG[j][0] - cg[cells[j]]), Math.abs(pmC[j][0] - cc[cells[j]]));
      for (let kk = 0; kk < 4; kk++) pmMacWorst = Math.max(pmMacWorst, Math.abs(pmMac[j][kk] - mg[kk * N + cells[j]]));
    }
    await g.destroy(); await c.destroy();
    return { worst, peak, sg, sc, pmWorst, pmMacWorst, nCells: cells.length };
  });
  check('flowsim: the WGSL scalar kernel and the CPU reference agree on concentration',
    sparity.worst < 1e-4 * Math.max(sparity.peak, 1e-6) + 1e-6,
    `worst |dC| ${sparity.worst.toExponential(2)} against peak ${sparity.peak.toExponential(2)}`);
  check('flowsim: the two backends agree on total scalar',
    Math.abs(sparity.sg - sparity.sc) / Math.max(sparity.sc, 1e-9) < 1e-4,
    `${sparity.sg.toFixed(4)} vs ${sparity.sc.toFixed(4)}`);
  check('flowsim: the injected scalar spread through the channel',
    sparity.peak > 0.5 && sparity.sg > 1, `peak ${sparity.peak.toFixed(3)}, total ${sparity.sg.toFixed(2)}`);
  check('flowsim: probeMany matches the full snapshot on both backends (scalar + macro)',
    sparity.pmWorst < 1e-6 && sparity.pmMacWorst < 1e-6,
    `conc ${sparity.pmWorst.toExponential(2)}, macro ${sparity.pmMacWorst.toExponential(2)} over ${sparity.nCells} cells`);
}

// THE FLOW PARAMETERS ARE LIVE, and that is a contract rather than a nicety: a
// rebuild restarts the flow AND the soft-sensor model, so a trained reconstruction
// could never be shown a regime change if moving a slider rebuilt. Geometry
// (resolution, scene, obstacle) still rebuilds; viscosity and speed must not.
{
  const live = await flow.evaluate(async () => {
    const s0 = window.__fsSim().step;
    window.__fsStep(40);
    const before = window.__fsSim().step;
    const tau0 = window.__fsSim().operators[0].params.tau;
    const el = document.getElementById('tau');
    const slider0 = el.value;
    const set = (v) => {
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set(Math.min(2.5, tau0 + 0.4));
    await new Promise((r) => setTimeout(r, 250));
    window.__fsStep(40);
    const out = { s0, before, after: window.__fsSim().step, building: window.__fsDbg().building,
      tau0, tauNow: window.__fsSim().operators[0].params.tau,
      dirtyCleared: window.__fsSim().operators[0].paramsDirty !== true };
    // PUT IT BACK. Now that a slider changes the RUNNING simulation, a test that
    // moves one and walks away has changed the flow for every check after it --
    // which is exactly what happened: leaving tau raised made a later scene so
    // viscous that the soft sensor's target barely moved, and its nRMSE became
    // noise divided by noise. A live control makes test hygiene load-bearing.
    set(slider0);
    await new Promise((r) => setTimeout(r, 250));
    out.restored = window.__fsSim().operators[0].params.tau;
    return out;
  });
  check('flowsim: changing viscosity does not rebuild (the flow keeps running)',
    live.after > live.before && live.before >= live.s0 && !live.building, JSON.stringify(live));
  check('flowsim: the live change reached the operator',
    Math.abs(live.tauNow - live.tau0) > 0.3, `${live.tau0} -> ${live.tauNow}`);
  // On the GPU the uniform is only rewritten when something marks it dirty; if the
  // flag were never cleared the page would be re-uploading every step forever, and
  // if it were never set the shader would keep solving the old viscosity.
  check('flowsim: the dirty flag was consumed by the kernel', live.dirtyCleared,
    String(live.dirtyCleared));
  check('flowsim: the live check restored the viscosity it borrowed',
    Math.abs(live.restored - live.tau0) < 1e-9, `${live.tau0} vs ${live.restored}`);
}

check('flowsim: the GPU driver reported no uncaptured errors', (fs0.gpuErrors || []).length === 0,
  JSON.stringify(fs0.gpuErrors));

// THE CONSOLE BUFFER IS PERSISTED TO localStorage AND IS PER ORIGIN, not per
// page -- deliberately, so a white-screen crash survives a reload. The side
// effect is that this page inherits the `console.error('smoke error')` this very
// suite injects on index.html to test console capture, which is what put a red
// error badge on the FlowSim screenshot and sent me looking for a bug that was
// not there. Clear it here so the end-of-section check is about THIS page.
await flow.evaluate(() => window.__dbg.clear());
await checkConsoleUsable(flow, 'flowsim');

// ---- THE SHIPPED DEFAULTS MUST SURVIVE. This shipped broken once: the default
// collision model was one that had ALREADY BEEN MEASURED dying at the default
// cell Reynolds number, and the page's own risk row called it "within the
// measured stable range" because the ceiling table had copied BGK's number for
// it. Load the page, run it, and require it to still be alive.
{
  const info = await flow.evaluate(() => window.__fsInfo());
  check('flowsim: the build logs its parameters to the page console',
    info && typeof info.ReCell === 'number' && info.collision && info.trtPolicy
    && typeof info.Cs === 'number' && typeof info.omegaMinus === 'number', JSON.stringify(info));
  // ONE configuration ships. The alternatives stay in the library for the
  // analytic comparisons; offering them here is what put a diverging default
  // in front of the user.
  check('flowsim: the page ships the measured-stable configuration only',
    info.collision === 'trt' && info.trtPolicy === 'stability' && info.Cs > 0,
    JSON.stringify({ collision: info.collision, policy: info.trtPolicy, Cs: info.Cs }));
  check('flowsim: there is no collision-model selector to get wrong',
    await flow.evaluate(() => document.getElementById('physics') === null));
  check('flowsim: the default Re_cell is inside the default model\'s measured ceiling',
    info.ReCell < info.ceiling, `Re_cell ${info.ReCell.toFixed(1)} vs ceiling ${info.ceiling}`);
  const live = await flow.evaluate(async () => {
    const sim = window.__fsSim();
    for (let k = 0; k < 4; k++) {
      sim.advance(200);
      const d = await sim.diagnostics();
      if (d.stable.state === 'diverged') return { ok: false, step: d.step, why: d.stable.why };
    }
    const d = await sim.diagnostics();
    return { ok: true, step: d.step, uMax: d.uMax };
  });
  // 800 steps: the default that shipped broken diverged by step 300, so this is
  // well past the point that catches it, and TRT+LES on a software GPU is
  // expensive enough that the step count is most of the quick tier's clock.
  check('flowsim: the shipped defaults run 800 steps without diverging', live.ok,
    JSON.stringify(live));
}

section('flowsim core');
if (FULL) {
// ---- every scene must show something. Reported from a real device: two of the
// three "did nothing visible". They were all correct; the DEFAULT SLICE PLANE was
// wrong for them -- Poiseuille varies only across z, so the plane normal to z has
// exactly zero spread and renders as one flat colour. Each scene now declares the
// plane that shows its physics; this checks the page applies it and that pixels
// actually vary.
// DROP TO A SMALL LATTICE FIRST. This loop is about the SLICE PLANE and nothing
// else, but it steps max(1500, nx*40) -- and the rebuild checks above leave the
// resolution wherever they last set it. At the top rung the channel is 3x long, so
// that is ~11.5k steps on a ~1.3M-cell lattice through a software adapter: measured
// at OVER TWENTY MINUTES for one scene, and it never finished. The plane a scene
// declares does not depend on how many cells it has, so the check is identical on a
// small lattice and the whole loop then costs seconds.
//
// RUNG 1 AND NOT RUNG 0, and the difference is the check's own discriminator. It
// counts DISTINCT COLOURS, so it is bounded by how many cells the slice has: at the
// bottom rung Poiseuille renders exactly 12 against a threshold of >12 and fails,
// while the failure it exists to catch -- the wrong plane -- renders ONE. Lowering
// the threshold to fit rung 0 would be weakening the check to make a speed fix
// pass; one rung up keeps the original threshold and is still seconds.
await flow.evaluate(() => {
  const r = document.getElementById('res'); r.value = '1';
  r.dispatchEvent(new Event('change'));
});
await flow.waitForFunction(() => !window.__fsDbg().building && !window.__fsDbg().queued,
  null, { timeout: 120000 });
for (const [key, label] of [['poiseuille', 'Poiseuille'], ['cavity', 'cavity'], ['channel', 'channel']]) {
  await flow.selectOption('#scene', key);
  await flow.waitForFunction(() => window.__fsDbg().backend !== null && !window.__fsDbg().building,
    null, { timeout: 60000 });
  // STEPS SCALED TO THE DOMAIN. The channel is now 3x long, so at a fixed 1500
  // steps the inlet flow had not crossed it and the slice was still mostly at
  // rest -- 3 distinct colours, which reads as "renders nothing" when the scene
  // is fine and simply young. Give every scene time for the flow to traverse it.
  await flow.evaluate(() => {
    const L = window.__fsSim().lattice;
    window.__fsStep(Math.max(1500, L.nx * 40));
  });
  await flow.evaluate(() => window.__fsDraw());
  await flow.waitForTimeout(250);
  const shot = await flow.evaluate(() => {
    const c = document.getElementById('cv');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    return { colors: seen.size, axis: document.getElementById('axis').value };
  });
  check(`flowsim: the ${label} scene renders a varying field on its default slice`,
    shot.colors > 12, `${shot.colors} distinct colours on slice axis ${shot.axis}`);
  await flow.locator('#stage').screenshot({ path: join(SHOTS, `11-flowsim-${key}.png`) });
}
await flow.selectOption('#scene', 'channel');
await flow.waitForFunction(() => !window.__fsDbg().building, null, { timeout: 60000 });

// ---- the resolution ladder must be clamped to what the device can allocate
// rather than attempted and left broken. The channel at 96 wants a 128.3 MiB
// storage binding against a 128 MiB default limit; before this it failed, fell
// through to a CPU backend far over its own cap, and left the page with no
// simulation at all.
//
// THE ASSERTION IS THE INVARIANT, NOT A NUMBER. This check used to require
// `max <= 4`, which encoded the memory situation of one scene at one moment: the
// channel was [3n, n, n] and its top rung wanted 192 MiB. v121 halved the span
// (a cylinder is nominally 2D, so cells spent along it resolve nothing about the
// wake), the top rung came down to 96 MiB, it legitimately fits, and the check
// began failing while the page was doing exactly the right thing. A hard-coded
// ceiling is also wrong in the other direction -- on a device with a SMALLER
// limit than this software adapter, `max <= 4` would pass while the clamp was
// broken. So the property is asserted against the device's own reported limit:
// every offered rung must fit, and the first rung above the offer must not.
const resInfo = await flow.evaluate(async () => {
  const { SCENES } = await import('./lib/lattsim/scenes.js');
  const d = window.__fsDbg();
  const max = +document.getElementById('res').max;
  // The same criterion largestResolutionThatFits() applies, stated directly:
  // the LARGEST single field's binding against the device's limit. Calling the
  // helper with a one-element ladder cannot answer this -- it seeds `best` with
  // ladder[0] and returns it whether or not it fits, so it would report every
  // rung as fitting and the check would have no teeth at all.
  const bytesAt = (n) => {
    const sim = SCENES[d.scene].make({ resolution: n });
    return Math.max(...sim.fields.list().map((f) => f.byteLength(sim.lattice.cellCount)));
  };
  const fitsAt = (n) => bytesAt(n) <= d.maxBinding;
  return {
    max, built: d.cells > 0, ladder: d.ladder, scene: d.scene,
    maxBinding: Number.isFinite(d.maxBinding) ? d.maxBinding : 'unlimited',
    topOffered: d.ladder[max],
    topFits: fitsAt(d.ladder[max]),
    topBytes: bytesAt(d.ladder[max]),
    // undefined past the end of the ladder, which is the "nothing was clamped
    // away because nothing needed to be" case and is not a failure.
    nextRung: d.ladder[max + 1],
    nextFits: d.ladder[max + 1] === undefined ? false : fitsAt(d.ladder[max + 1]),
  };
});
check('flowsim: the resolution slider is clamped to what the device can allocate',
  resInfo.built && resInfo.max >= 0 && resInfo.max < resInfo.ladder.length
  && resInfo.topFits && !resInfo.nextFits,
  JSON.stringify(resInfo));
await flow.evaluate((m) => {
  const r = document.getElementById('res'); r.value = String(m);
  r.dispatchEvent(new Event('change'));
}, resInfo.max);
await flow.waitForFunction(() => !window.__fsDbg().building, null, { timeout: 180000 });
const atMax = await flow.evaluate(() => window.__fsDbg());
check('flowsim: the largest offered resolution actually builds',
  atMax.cells > 0 && atMax.backend !== null, JSON.stringify({ cells: atMax.cells, backend: atMax.backend }));

// ---- the raymarched volume view.
//
// IT CANNOT BE RENDERED HERE, and the reason is worth recording. In this
// headless Chromium with a software adapter there is no real surface, and
// getCurrentTexture() does not merely fail -- it destroys the WebGPU instance,
// after which every COMPUTE call fails too. Isolated to fifteen lines of plain
// WebGPU with none of this engine involved. So the suite does NOT switch to that
// view: doing so takes the simulation down with it and proves nothing.
//
// What IS checkable without a surface is that the volume shader compiles, which
// is where a WGSL mistake would live -- and this project has already shipped one
// of those (`macro`, a reserved word) that produced silence rather than an error.
// The picture itself is verified on a real device.
if (hasGPU && fs0.backend === 'webgpu') {
  const volShader = await flow.evaluate(async () => {
    const [{ VolumeRenderer }, { Lattice }, { acquireDevice }] = await Promise.all([
      import('./lib/lattsim/render/volume3d.js'),
      import('./lib/lattsim/lattice.js'),
      import('./lib/lattsim/backends/webgpu.js'),
    ]);
    const { device } = await acquireDevice();
    const code = VolumeRenderer.shaderSource(new Lattice({ size: [16, 8, 8], spacing: 1e-3 }));
    device.pushErrorScope('validation');
    const mod = device.createShaderModule({ code });
    const info = await mod.getCompilationInfo();
    const scoped = await device.popErrorScope();
    return {
      errors: info.messages.filter((m) => m.type === 'error').map((m) => `${m.lineNum}:${m.linePos} ${m.message}`),
      scoped: scoped ? scoped.message : null,
    };
  });
  check('flowsim: the volume shader compiles',
    volShader.errors.length === 0 && !volShader.scoped, JSON.stringify(volShader));
}

// ---- Reset must reset the SIMULATION, not the controls. Reported from a real
// device: pressing it put the view back to 2D and moved the slice.
{
  // Drop back to the smallest lattice first: the resolution check above left the
  // sim at the largest one the device allows, and the stir check below steps
  // several thousand times on a software GPU.
  await flow.evaluate(() => {
    const r = document.getElementById('res'); r.value = '0';
    r.dispatchEvent(new Event('change'));
  });
  await flow.waitForFunction(() => !window.__fsDbg().building, null, { timeout: 120000 });
  await flow.selectOption('#scene', 'channel');
  await flow.waitForFunction(() => !window.__fsDbg().building, null, { timeout: 60000 });
  // FORCE A LAMINAR REGIME FOR THE SETTLE TEST. The shipped defaults now sit at
  // Re ~120, ABOVE this geometry's shedding threshold -- so the channel is
  // supposed to oscillate forever and "the residual falls to steady" is the
  // wrong expectation for it. Asking a shedding flow to converge would be
  // testing that the physics is absent. tau 0.6 / u 0.04 puts Re near 7.
  await flow.evaluate(() => {
    const t = document.getElementById('tau'); t.value = '0.6'; t.dispatchEvent(new Event('input'));
    const u = document.getElementById('uin'); u.value = '0.04'; u.dispatchEvent(new Event('input'));
    u.dispatchEvent(new Event('change'));
  });
  await flow.waitForFunction(() => !window.__fsDbg().building && !window.__fsDbg().queued,
    null, { timeout: 120000 });
  await flow.selectOption('#axis', '1');
  await flow.evaluate(() => {
    const s = document.getElementById('slicep'); s.value = '0.25';
    s.dispatchEvent(new Event('input'));
  });
  const before = await flow.evaluate(() => ({
    axis: document.getElementById('axis').value,
    pos: document.getElementById('slicep').value,
    view: document.getElementById('view').value,
  }));
  await flow.click('#reset');
  await flow.waitForFunction(() => !window.__fsDbg().building, null, { timeout: 60000 });
  const after = await flow.evaluate(() => ({
    axis: document.getElementById('axis').value,
    pos: document.getElementById('slicep').value,
    view: document.getElementById('view').value,
    step: window.__fsDbg().step,
  }));
  check('flowsim: Reset keeps the view settings', after.axis === before.axis
    && after.pos === before.pos && after.view === before.view,
    JSON.stringify({ before, after }));
  check('flowsim: Reset does restart the simulation', after.step === 0, String(after.step));

  // A REBUILD ASKED FOR MID-REBUILD MUST NOT BE SWALLOWED. build() used to
  // return early while one was in flight, so on a phone -- where a rebuild takes
  // seconds -- a Reset tap simply vanished. That is what "Reset doesn't work
  // consistently" looks like from the outside.
  const queued = await flow.evaluate(async () => {
    const before = window.__fsDbg().step;
    window.__fsStep(50);
    document.getElementById('reset').click();
    document.getElementById('reset').click();   // second tap lands mid-rebuild
    const sawQueue = window.__fsDbg().queued || window.__fsDbg().building;
    return { before, sawQueue };
  });
  await flow.waitForFunction(() => !window.__fsDbg().building && !window.__fsDbg().queued,
    null, { timeout: 120000 });
  const afterQueue = await flow.evaluate(() => window.__fsDbg());
  check('flowsim: a Reset pressed during a rebuild is queued, not dropped',
    queued.sawQueue && afterQueue.step === 0 && afterQueue.cells > 0,
    JSON.stringify({ queued, step: afterQueue.step, cells: afterQueue.cells }));


  // A DIVERGED RUN MUST SAY SO WHERE THE USER IS LOOKING, AND MUST NOT PRETEND
  // IT CAN CONTINUE.
  //
  // Reported from a device: tau at the slider floor with everything else default
  // ran a few seconds, then "broke" -- a frozen picture with a front sweeping
  // across it, and Run doing one step and freezing again. That is genuine
  // numerical divergence (velocity overflows, rho crosses zero, u = m/rho goes
  // non-finite, and STREAMING then carries the NaN one cell per step to every
  // neighbour), and halting is right. What was wrong is that it halted with the
  // reason in a stats row below the fold, so from the outside it just broke.
  {
    await flow.evaluate(() => {
      const t = document.getElementById('tau'); t.value = t.min; t.dispatchEvent(new Event('input'));
      const u = document.getElementById('uin'); u.value = u.max; u.dispatchEvent(new Event('input'));
      u.dispatchEvent(new Event('change'));
    });
    await flow.waitForFunction(() => !window.__fsDbg().building && !window.__fsDbg().queued,
      null, { timeout: 120000 });
    // Assert the STATE, not the phrasing -- a check that greps the sentence
    // breaks every time the sentence improves.
    check('flowsim: an unstable slider pairing is flagged BEFORE it is run',
      await flow.evaluate(() => document.getElementById('tau-v').className.includes('bad')),
      await flow.textContent('#s-risk'));

    // THE SLIDERS CAN NO LONGER REACH A DIVERGED RUN, AND THAT IS THE POINT OF
    // v122. This block used to drive 6000 steps at the floor waiting for the
    // death above, and it stopped being able to find one: the collide kernel now
    // clamps density and velocity and replaces any population that still comes
    // out non-finite with the equilibrium at the sanitised moments, so a NaN is
    // caught in the cell where it appears and never streams to a neighbour. The
    // corner this drives -- tau 0.5001 with u 0.35 -- is EXACTLY the one v140
    // measured as finite (Re_cell 10500, 9.77% of cells held, rho 1.140-2.000).
    // So the check was asserting the opposite of two deliberate shipped
    // behaviours, and the six thousand software-adapter steps it spent doing it
    // were the most expensive checks on the page.
    //
    // What survives the change is the UI, which is what could actually rot, so
    // the diverged VERDICT is injected instead of chased. The page's own
    // refreshStats() -> diverged() path then runs for real against it.
    const held = await flow.evaluate(async () => {
      const sim = window.__fsSim();
      sim.advance(400);
      const d = await sim.diagnostics();
      return { state: d.stable.state, finite: d.finite, limited: d.limited, uMax: d.uMax };
    });
    check('flowsim: the slider floor is held up rather than allowed to diverge',
      held.finite && held.state !== 'diverged', JSON.stringify(held));

    // The diverged UI, driven by a diverged diagnostic rather than by a diverged
    // solver. assess() is untouched -- the stub only supplies the non-finite
    // field it is asked to judge -- so what is exercised below is the real
    // verdict path and the real handler.
    await flow.evaluate(() => {
      const sim = window.__fsSim();
      window.__fsRealDiag = sim.diagnostics.bind(sim);
      sim.diagnostics = async () => {
        const d = await window.__fsRealDiag();
        return { ...d, finite: false, stable: sim.assess({ ...d, finite: false }) };
      };
    });
    await flow.evaluate(() => window.__fsRefresh());
    const ui = await flow.evaluate(() => ({
      badge: document.getElementById('backend-badge').textContent,
      badgeBad: /bad/.test(document.getElementById('backend-badge').className),
      runDisabled: document.getElementById('run').disabled,
      runText: document.getElementById('run').textContent,
    }));
    check('flowsim: divergence is announced on the stage, not only in a stats row',
      ui.badgeBad && /DIVERGED/.test(ui.badge), JSON.stringify(ui));
    check('flowsim: Run refuses to resume a diverged run', ui.runDisabled && /Reset/.test(ui.runText),
      JSON.stringify(ui));
    // ...and Reset must clear the latch, or the page is stuck for good. The
    // rebuild discards the stubbed simulation with it, so nothing is restored.
    await flow.click('#reset');
    await flow.waitForFunction(() => !window.__fsDbg().building && !window.__fsDbg().queued,
      null, { timeout: 120000 });
    const after = await flow.evaluate(() => ({
      runDisabled: document.getElementById('run').disabled,
      step: window.__fsDbg().step,
      // The precise question is "is this the prototype's method again?" -- not
      // "is it the saved one?", which a surviving stub would also answer no to.
      stubbed: window.__fsSim().diagnostics
        !== Object.getPrototypeOf(window.__fsSim()).diagnostics,
    }));
    check('flowsim: Reset clears the divergence and re-enables Run',
      !after.runDisabled && after.step === 0, JSON.stringify(after));
    // A stub that outlived the rebuild would poison every check after this one,
    // and it would do it silently -- the page would report a diverged run for
    // the rest of the suite.
    check('flowsim: the injected verdict did not survive the rebuild', !after.stubbed,
      JSON.stringify(after));
    // Back to something sane for whatever follows.
    await flow.evaluate(() => {
      const t = document.getElementById('tau'); t.value = '0.6'; t.dispatchEvent(new Event('input'));
      const u = document.getElementById('uin'); u.value = '0.04'; u.dispatchEvent(new Event('input'));
      u.dispatchEvent(new Event('change'));
    });
    await flow.waitForFunction(() => !window.__fsDbg().building && !window.__fsDbg().queued,
      null, { timeout: 120000 });
  }

  // RESET WHILE RUNNING, which is what a person actually does. A readback is
  // asynchronous, so tearing the backend down mid-run used to destroy a staging
  // buffer with a mapAsync in flight and reject it with nobody listening.
  //
  // That is an UNHANDLED REJECTION, and it is why this check reads the page's
  // OWN error buffer rather than trusting the two listeners above: neither
  // Playwright's `pageerror` nor the console listener reports unhandled
  // rejections, so every existing error assertion passed while the live page
  // showed a red error badge on every Reset. It was found in a screenshot.
  await flow.evaluate(() => { window.__dbg.clear && window.__dbg.clear(); });
  await flow.click('#run');
  await flow.waitForTimeout(1200);
  await flow.click('#reset');
  await flow.waitForFunction(() => !window.__fsDbg().building, null, { timeout: 60000 });
  await flow.waitForTimeout(1200);
  const pageErrs = await flow.evaluate(() =>
    window.__dbg.buffer().filter((e) => e.type === 'error').map((e) => String(e.text).slice(0, 200)));
  check('flowsim: resetting while running raises no error, unhandled rejections included',
    pageErrs.length === 0, pageErrs.join(' | '));
  if (await flow.evaluate(() => window.__fsDbg().running)) await flow.click('#run');   // leave it paused
}

// ---- stirring is a physics input, and the residual shows the flow settle again
{
  // EVERY RESIDUAL HERE IS READ OVER THE SAME NUMBER OF STEPS. The residual is
  // per step, so the gaps no longer have to match for the number to mean the
  // same thing -- but a 20-step window straddling a 24-step impulse averages
  // very differently from an 800-step one, so matching them keeps the three
  // readings comparable as measurements rather than just as units. The first
  // version of this check compared a 600-step gap against a 10-step gap and
  // "failed" because of the observation window, not the physics.
  const GAP = 20;
  const readAfter = async (steps) => {
    await flow.evaluate((n) => window.__fsStep(n), steps);
    await flow.evaluate(() => window.__fsDiag());          // anchor the reading
    await flow.evaluate((n) => window.__fsStep(n), GAP);
    return flow.evaluate(() => window.__fsDiag());
  };

  const calm = await readAfter(2400);
  check('flowsim: the driven channel settles on its own', calm.stable.why === 'steady',
    `residual/step ${calm.residual.toExponential(2)} — ${calm.stable.state} ${calm.stable.why}`);

  // THE LOCAL CHECK IS THE ONE THAT MATTERS HERE. The node suite already proves
  // the operator injects momentum, conserves mass and expires. What only the
  // browser can prove is the chain this page adds: a screen coordinate on a
  // letterboxed canvas -> a slice plane -> a lattice cell. So compare the
  // velocity change INSIDE the impulse sphere against everywhere else.
  //
  // A global metric cannot do this job. The first version asserted the residual
  // rose, and a correctly-armed impulse moved it by less than the flow's own
  // fluctuation -- 33 cells out of 27648 is 0.02% of the momentum. That read as
  // "the stir does nothing" when the stir was fine and the instrument was wrong.
  const probe = await flow.evaluate(async () => {
    const s = document.getElementById('stir'); s.value = s.max; s.dispatchEvent(new Event('input'));
    const sim = window.__fsSim(), L = sim.lattice, N = L.cellCount;
    const before = await sim.backend.snapshot('macro');
    const r = document.getElementById('stage').getBoundingClientRect();
    window.__fsStir(r.left + r.width * 0.4, r.top + r.height * 0.5, 40, 0);
    const im = JSON.parse(JSON.stringify(sim.operators[0].params.impulse));
    window.__fsStep(20);
    const after = await sim.backend.snapshot('macro');
    const sp = (m, i) => Math.hypot(m[N + i], m[2 * N + i], m[3 * N + i]);
    let din = 0, nin = 0, dout = 0, nout = 0;
    for (let z = 0; z < L.nz; z++) for (let y = 0; y < L.ny; y++) for (let x = 0; x < L.nx; x++) {
      const i = L.index(x, y, z);
      const d = Math.hypot(x - im.centre[0], y - im.centre[1], z - im.centre[2]);
      const dv = Math.abs(sp(after, i) - sp(before, i));
      if (d <= im.radius) { din += dv; nin++; } else { dout += dv; nout++; }
    }
    return { im, size: [L.nx, L.ny, L.nz], inside: din / Math.max(1, nin), outside: dout / Math.max(1, nout), nin };
  });
  check('flowsim: a drag arms an impulse at an interior cell, in the drag direction',
    probe.im.force[0] > 0 && probe.im.radius >= 4 && probe.im.steps > 0
    && probe.im.centre.every((v, k) => v > 0 && v < probe.size[k] - 1),
    JSON.stringify({ impulse: probe.im, lattice: probe.size }));
  // Measured 36x at the default strength and 50x at the maximum; 10x is a floor
  // well clear of both, and far above the ~1x a mis-mapped coordinate would give.
  check('flowsim: the momentum lands under the finger, not spread over the domain',
    probe.inside > probe.outside * 10,
    `mean d|u| inside ${probe.inside.toExponential(2)} vs outside ${probe.outside.toExponential(2)} `
    + `(${(probe.inside / probe.outside).toFixed(0)}x over ${probe.nin} cells)`);

  const poked = await flow.evaluate(() => window.__fsDiag());
  check('flowsim: stirring shows up in the global residual too', poked.residual > calm.residual * 5,
    `residual/step ${calm.residual.toExponential(2)} -> ${poked.residual.toExponential(2)}`);

  const settled = await readAfter(2400);
  check('flowsim: the flow settles again after being stirred',
    settled.residual < poked.residual / 10 && settled.stable.state !== 'diverged',
    `${poked.residual.toExponential(2)} -> ${settled.residual.toExponential(2)} (${settled.stable.state})`);
}

}   // end FULL-only FlowSim scenarios

section('flowsim scenarios');
const stats = await flow.textContent('#s-lattice');
check('flowsim: the lattice is described in the UI', /cells/.test(stats || ''), stats);
check('flowsim: field memory is reported', /(KiB|MiB)/.test(await flow.textContent('#s-mem')),
  await flow.textContent('#s-mem'));

await flow.evaluate(() => window.scrollTo(0, 0));
await flow.waitForTimeout(200);
await flow.screenshot({ path: join(SHOTS, '09-flowsim.png') });

// ---- THE PROBE MUST READ THE CELL IT POINTS AT.
//
// This is the same class of check as the stir: a screen coordinate on a
// letterboxed canvas -> a slice plane -> a lattice cell, and a mistake anywhere
// in that chain gives a plausible-looking trace of the WRONG cell. So the probe
// is placed by screen coordinate and its reading is compared against a direct
// read of the field at the cell it claims to be at.
{
  const probe = await flow.evaluate(async () => {
    const r = document.getElementById('stage').getBoundingClientRect();
    const hit = window.__fsProbe.at(r.left + r.width * 0.55, r.top + r.height * 0.5);
    if (!hit) return { error: 'the mapping returned nothing inside the stage' };
    window.__fsProbe.place(hit.coords);
    const st = window.__fsProbe.state();
    // What the field actually holds at that cell, read independently.
    const sim = window.__fsSim(), N = sim.lattice.cellCount;
    const mac = await sim.backend.snapshot('macro');
    const i = sim.lattice.index(...hit.coords);
    return { coords: hit.coords, cell: st.cell, expectCell: i,
      direct: { rho: mac[i], speed: Math.hypot(mac[N + i], mac[2 * N + i], mac[3 * N + i]) } };
  });
  check('flowsim: a screen point maps to the cell the probe reports',
    !probe.error && probe.cell === probe.expectCell, JSON.stringify(probe));

  // Now let it sample, and require the trace to match the field.
  // The probe records from the render loop, which is paused here, so drive it
  // explicitly rather than waiting for frames that are not coming.
  await flow.evaluate(async () => {
    for (let k = 0; k < 5; k++) { window.__fsStep(40); await window.__fsProbe.sample(); }
  });
  const agree = await flow.evaluate(async () => {
    const st = window.__fsProbe.state();
    const sim = window.__fsSim(), N = sim.lattice.cellCount;
    const mac = await sim.backend.snapshot('macro');
    const i = st.cell;
    return { probe: st.last, direct: { rho: mac[i],
      speed: Math.hypot(mac[N + i], mac[2 * N + i], mac[3 * N + i]) }, samples: st.samples };
  });
  const dRho = Math.abs(agree.probe.rho - agree.direct.rho);
  check('flowsim: the probe trace matches a direct read of that cell', dRho < 1e-3,
    JSON.stringify(agree));
  // Assert the TRACES, not just that a plot exists. Plotly puts js-plotly-plot
  // on the container itself rather than a child, and an empty plot has an svg
  // too -- so "there is a chart" would pass while the chart showed nothing.
  const chart = await flow.evaluate(() => ({
    isPlot: document.getElementById('probe-chart').classList.contains('js-plotly-plot'),
    traces: document.querySelectorAll('#probe-chart .scatterlayer .trace').length,
  }));
  check('flowsim: the probe chart is drawn with its traces',
    chart.isPlot && chart.traces >= 4, JSON.stringify(chart));

  // ---------------------------------------------------------- soft sensor
  // TWO POINTS, ONE MODEL: the probe is the sensor, and a second cell is the
  // target the model never measures. What is checked here is what only the
  // browser can check -- the wiring, the cadence and the chart's alignment.
  // The model itself is verified against a synthetic field in
  // test/probesense/sensor.test.mjs, where the right answer is known.
  // CONFIGURED FOR THE CLOCK, DELIBERATELY AND VISIBLY. Training 250 pairs at the
  // page's default resolution is ~9600 solver steps, which is eighteen minutes on
  // this software adapter -- and a check that slow does not get run, which is a
  // verification problem rather than an inconvenience. The smallest lattice, the
  // shortest lag window and the tightest sample interval reach the same 250 pairs
  // in ~2000 steps. None of it weakens what is being checked: the wiring, the
  // cadence and the alignment do not depend on how big the lattice is, and the
  // MODEL's accuracy is verified against a synthetic field in Node instead.
  await flow.selectOption('#scene', 'channel');
  await flow.evaluate(() => {
    const set = (id, v) => {
      const el = document.getElementById(id);
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('res', 0); set('spf', 20);
    set('ss-lag', 2); set('ss-stride', 2); set('ss-every', 5); set('ss-lead', 6);
  });
  await flow.waitForFunction(() => window.__fsSim() && window.__fsSim().lattice.nx <= 80,
    null, { timeout: 180000 });
  const placed = await flow.evaluate(() => {
    const L = window.__fsSim().lattice;
    window.__fsProbe.place([Math.round(L.nx * 0.55), 1, L.nz >> 1]);
    window.__fsSS.place([Math.round(L.nx * 0.75), L.ny >> 1, L.nz >> 1]);
    return window.__fsSS.state();
  });
  check('flowsim: placing a target builds a soft sensor over both cells',
    placed && placed.cell >= 0 && placed.features > 0 && placed.depth > 1,
    JSON.stringify(placed && { cell: placed.cell, features: placed.features,
      depth: placed.depth, mode: placed.mode }));
  check('flowsim: the soft-sensor panel and chart become visible',
    await flow.evaluate(() => document.getElementById('ss-panel').classList.contains('on')
      && document.getElementById('ss-chart').classList.contains('on')));
  // THE LOCK IS GATED. Freezing an untrained readout deploys noise, and a user
  // who did that would read it as the method failing rather than as their own
  // mistake -- so the button refuses until there is something to lock.
  check('flowsim: estimation mode is refused until the model has trained',
    await flow.evaluate(() => document.getElementById('ss-lock').disabled));

  // Drive the real frame loop: the cadence logic lives there, so stepping the
  // solver by hand would test everything except the thing that could be wrong.
  await flow.evaluate(() => { window.__fsSS.train(); });
  // #run IS A TOGGLE, NOT "START". A blind click starts the loop only if it
  // happened to be stopped, and stops it if it was not -- after which nothing
  // trains and the wait below sits there for its full four minutes before taking
  // the whole run down with it. The quick tier reaches this with the loop
  // stopped and the full tier does not, which is exactly the shape of bug that
  // passes in one tier and hangs in the other. Ask the page what state it is in.
  const setRunning = async (want) => {
    await flow.evaluate((w) => {
      if (!!window.__fsDbg().running !== w) document.getElementById('run').click();
    }, want);
  };
  await setRunning(true);
  // AND A TIMEOUT HERE MUST BE A FAILED CHECK, NOT AN UNCAUGHT EXCEPTION. As
  // written it threw, which killed the process and discarded every check after
  // it -- including the page's own error buffer, the last thing in the suite.
  // A reported failure that carries the state is strictly more useful than a
  // stack trace that says only "240000ms exceeded".
  let trainedOk = true;
  try {
    await flow.waitForFunction(() => {
      const st = window.__fsSS.state();
      return st && st.trained > 250;
    }, null, { timeout: 240000 });
  } catch {
    trainedOk = false;
    const why = await flow.evaluate(() => ({
      ss: window.__fsSS.state(), running: window.__fsDbg().running,
      step: window.__fsDbg().step, cells: window.__fsDbg().cells,
    })).catch((e) => ({ evalFailed: String(e).slice(0, 120) }));
    check('flowsim: the soft sensor trains from the live frame loop', false,
      JSON.stringify(why).slice(0, 400));
  }
  if (trainedOk) check('flowsim: the soft sensor trains from the live frame loop', true);
  await setRunning(false);
  const ran = await flow.evaluate(() => window.__fsSS.state());

  // THE CADENCE IS EXACT, and this is the check that earns the split-step loop.
  // A model's lag window is counted in samples, so if the sample interval drifted
  // with the steps-per-frame slider the window would span a different amount of
  // time at every slider position -- a viewing control changing what the model
  // learns. The loop stops the solver exactly on each boundary; misses count any
  // time it could not.
  check('flowsim: the soft sensor samples on exact solver-step boundaries',
    ran.misses === 0, `${ran.misses} missed boundaries over ${ran.samples} samples`);
  check('flowsim: training accumulated pairs from the live loop',
    ran.trained > 250 && ran.estimate.n > 250,
    JSON.stringify({ trained: ran.trained, graded: ran.estimate.n }));
  // The prediction can only be graded once its target has ARRIVED, so a non-zero
  // count here is evidence the horizon pairing actually matured rather than being
  // scored against the present.
  check('flowsim: the prediction was graded against arrived targets',
    ran.predict.n > 100, JSON.stringify({ n: ran.predict.n, nrmse: ran.predict.nrmse }));
  // The forecast is stamped exactly one lead ahead of the last sample. This is the
  // property the chart's alignment rests on: drawn at the step it is ABOUT, a
  // correct forecast lies on the truth, and drawn where it was ISSUED it would
  // appear shifted by the whole lead and a perfect forecast would look wrong.
  const lead = await flow.evaluate(() => {
    // FORCE A REDRAW FIRST. The chart is drawn once per frame, so reading a chart
    // value and a model value together races the renderer: measured a 15-step gap,
    // exactly three samples at this cadence, which looks like a broken forecast
    // stamp and is really just a chart three samples behind. Comparing a rendered
    // value against a live one always needs the render to be current.
    window.__fsSS.draw();
    const st = window.__fsSS.state();
    const el = document.getElementById('ss-chart');
    const truth = el.data.find((t) => t.name === 'truth');
    const early = el.data.find((t) => t.name === 'predicted earlier');
    return { live: st.live, every: st.every, leadSamples: +document.getElementById('ss-lead').value,
      lastTruth: truth.x[truth.x.length - 1],
      earlyLast: early.x[early.x.length - 1], earlyN: early.x.length,
      traces: el.data.length, isPlot: el.classList.contains('js-plotly-plot') };
  });
  check('flowsim: the live forecast is stamped one lead ahead of the last sample',
    lead.live && lead.live.step === lead.lastTruth + lead.leadSamples * lead.every,
    JSON.stringify(lead));
  check('flowsim: the matured prediction is drawn at the step it is about, not when issued',
    lead.earlyN > 100 && lead.earlyLast <= lead.lastTruth
    && lead.earlyLast > lead.lastTruth - 3 * lead.every, JSON.stringify(lead));
  check('flowsim: the soft-sensor chart carries every series',
    lead.isPlot && lead.traces >= 4, JSON.stringify(lead));

  // A trained model beating a scaled reading of its own sensor is the whole claim.
  // Asserted loosely -- the flow depends on the scene and the settings -- but a
  // ratio below 1 would mean the model is worse than a calibration constant.
  check('flowsim: the soft sensor beats a scaled sensor reading',
    ran.estimate.ratio > 1.2,
    `${ran.estimate.nrmse} vs ${ran.estimate.baseline} (x${ran.estimate.ratio})`);

  // ------------------------------------------------------- the slider stops
  // THE RANGES REACH PAST WHAT THE SOLVER CAN SOLVE, ON PURPOSE, so the guarantee
  // that matters is that it stays FINITE and says what it is doing. Re_cell 10500
  // is 52x past the range the sub-grid model was measured over; the limiter catches
  // a NaN in the cell where it appears and replaces it with the equilibrium at
  // sanitised moments, so it can never stream to a neighbour. Asserted rather than
  // assumed, because "clamps" and "goes non-finite and freezes" are the two
  // outcomes this whole mechanism exists to separate.
  await flow.evaluate(() => {
    const set = (id, v) => {
      const el = document.getElementById(id);
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('tau', 0.5001); set('uin', 0.35);
    // AND REBUILD, because the sliders no longer do. This check is about the
    // limiter at the extreme corner, and it needs the flow to START there: the
    // rebuild re-initialises the whole domain at the extreme inlet speed, which is
    // what drives cells onto the clamp within the step budget below. Once the
    // parameters became live the same slider moves left the flow evolving from a
    // mild settled state instead, and 1200 steps reported ZERO limited cells -- the
    // check failing not because the limiter broke but because the corner was never
    // actually entered.
    document.getElementById('reset').click();
  });
  // A SIMULATION OBJECT EXISTS BEFORE IT IS BUILT, so "not null" is not the
  // condition to wait on -- `advance()` throws "call build() first" until the
  // solver is attached, and a rebuild leaves a window where neither holds. Wait for
  // the SOLVER, and wrap the whole probe:
  // a check that THROWS takes every later check in the run with it, which is
  // strictly worse than one that fails. The first two versions of this crashed
  // the suite and hid everything downstream both times.
  const stops = await flow.evaluate(async () => {
    try {
      const ready = () => { const sim = window.__fsSim(); return !!(sim && sim.solver); };
      for (let i = 0; i < 240 && !ready(); i++) await new Promise((r) => setTimeout(r, 250));
      if (!ready()) return { error: 'no built simulation after 60s' };
      window.__fsStep(1200);
      const d = await window.__fsDiag();
      if (!d) return { error: 'no diagnostics' };
      return { uMax: d.uMax, rho: [d.rhoMin, d.rhoMax], limited: d.limited,
        cells: window.__fsSim().lattice.cellCount, state: d.stable.state,
        risk: document.getElementById('s-risk').textContent,
        mach: document.getElementById('s-mach').textContent };
    } catch (e) { return { error: String((e && e.message) || e) }; }
  });
  // ----------------------------------------------------- equation of state
  // THE EOS PRESSURE FORCE ON THE WGSL BACKEND, verified the way the CPU
  // reference is: a stiffer fluid propagates sound FASTER. Seed a standing
  // acoustic wave, measure its period at an antinode, and check the sound speed
  // shifts from the lattice cs (0.577) to the EOS value (0.80). This is the ONLY
  // check that exercises the force on the GPU -- a uniform-density flow has zero
  // pressure gradient, so it would pass trivially whether the force worked or not.
  const eosSound = await flow.evaluate(async () => {
    const { Simulation } = await import(new URL('./lib/lattsim/simulation.js', location.href).href);
    const { LBMFluidOperator } = await import(new URL('./lib/lattsim/operators/lbm.js', location.href).href);
    const { TOPOLOGY } = await import(new URL('./lib/lattsim/lattice.js', location.href).href);
    const { feq } = await import(new URL('./lib/lattsim/d3q19.js', location.href).href);
    async function c(eos, soundSpeed) {
      const Nx = 64, Ny = 4, Nz = 4, eps = 1e-3, N = Nx * Ny * Nz;
      const sim = new Simulation({ lattice: { size: [Nx, Ny, Nz], spacing: 1e-3,
        topology: [TOPOLOGY.PERIODIC, TOPOLOGY.PERIODIC, TOPOLOGY.PERIODIC] } });
      sim.addPhysics(new LBMFluidOperator({ tau: 0.6, collision: 'bgk', eos, soundSpeed }));
      await sim.build({ backend: 'webgpu' });
      if (sim.backend.kind !== 'webgpu') return null;   // no GPU here -> skip, not fail
      const buf = new Float32Array(19 * N);
      for (let x = 0; x < Nx; x++) for (let y = 0; y < Ny; y++) for (let z = 0; z < Nz; z++) {
        const i = x + Nx * (y + Ny * z), rho = 1 + eps * Math.cos(2 * Math.PI * x / Nx);
        for (let q = 0; q < 19; q++) buf[q * N + i] = feq(q, rho, 0, 0, 0);
      }
      sim.backend.device.queue.writeBuffer(sim.backend.read('f'), 0, buf);
      const probe = 0 + Nx * (2 + Ny * 2), series = [];
      for (let t = 0; t < 400; t++) { const v = await sim.backend.probe('macro', probe); series.push(v[0] - 1); sim.advance(1); }
      await sim.backend.destroy();
      const cr = [];
      for (let t = 1; t < series.length; t++) if ((series[t - 1] >= 0) !== (series[t] >= 0)) cr.push(t - 1 + series[t - 1] / (series[t - 1] - series[t]));
      return cr.length >= 2 ? Nx / (2 * (cr[1] - cr[0])) : NaN;
    }
    return { ideal: await c('ideal', null), stiff: await c('linear', 0.80) };
  });
  if (eosSound && eosSound.ideal != null) {
    check('flowsim: the ideal EOS propagates sound at the lattice cs on the GPU',
      Math.abs(eosSound.ideal - Math.sqrt(1 / 3)) / Math.sqrt(1 / 3) < 0.03, eosSound.ideal);
    check('flowsim: a stiffer EOS raises the GPU sound speed to its set value',
      Math.abs(eosSound.stiff - 0.80) / 0.80 < 0.03, eosSound.stiff);
  } else {
    check('flowsim: EOS sound-speed check skipped (no GPU here)', true);
  }

  check('flowsim: the extreme corner of the sliders stays finite',
    stops && !stops.error && Number.isFinite(stops.uMax) && Number.isFinite(stops.rho[0])
    && Number.isFinite(stops.rho[1]), JSON.stringify(stops));
  // It MUST be limited there -- if nothing clamped, either the corner is no longer
  // extreme or the limiter stopped working, and both need to be noticed.
  check('flowsim: and reports that it is being held up rather than solved',
    stops && stops.limited > 0 && stops.state === 'limited',
    stops ? `${stops.limited} of ${stops.cells} cells, verdict ${stops.state}` : 'no diagnostics');
  // Mach and Re_cell are INDEPENDENT failures, and the readout has to name both.
  // Measured: at tau 2.5 the flow is viscous (Re_cell 0.5, safe by the Reynolds
  // criterion) and still clamps, purely from compressibility.
  check('flowsim: the risk rows name both the Reynolds and the Mach failure',
    stops && /far past the measured range/.test(stops.risk)
    && /compressibility error/.test(stops.mach),
    stops ? stops.risk + ' | ' + stops.mach : 'no diagnostics');

  const lockedMode = await flow.evaluate(() => {
    const before = window.__fsSS.state().trained;
    window.__fsSS.lock();
    return { mode: window.__fsSS.state().mode, before };
  });
  check('flowsim: locking switches to estimation mode', lockedMode.mode === 'estimating',
    JSON.stringify(lockedMode));
  await flow.screenshot({ path: join(SHOTS, '11-flowsim-softsensor.png') });
}

// The Architecture tab is where the engine states what it is and is not.
await flow.click('.tab[data-tab="about"]');
await flow.waitForTimeout(200);
check('flowsim: architecture tab explains the two backends',
  /CPU reference/.test(await flow.textContent('#p-about')));
await flow.screenshot({ path: join(SHOTS, '10-flowsim-arch.png') });

// THE PAGE'S OWN ERROR BUFFER, in both tiers. Neither Playwright's `pageerror`
// nor the console listener reports unhandled rejections, so the two checks below
// can pass while the live page shows a red error badge -- which is exactly what
// happened once already, and was only noticed in a screenshot. This reads the
// same instrument the phone shows the owner.
const ownErrors = await flow.evaluate(() =>
  window.__dbg.buffer().filter((e) => e.type === 'error').map((e) => String(e.text).slice(0, 300)));
check('flowsim: the page reports no errors of its own (badge clear)',
  ownErrors.length === 0, ownErrors.join(' | '));
check('flowsim: no errors overall', flowErrors.length === 0, flowErrors.join(' | '));
check('flowsim: nothing logged to console.error', flowConsole.length === 0, flowConsole.join(' | '));

// ---- THE 3D VIEW MUST SURVIVE A REBUILD.
//
// The volume renderer is bound to a simulation, so a rebuild destroys it -- and
// it was only ever recreated by the view selector's change handler. Pressing
// Reset in 3D therefore left it null and drawOnce() returned early: a dead view,
// no error, no way back except toggling the selector. Invisible before v114
// only because every build used to reset the view to the 2D slice.
//
// RUN LAST AND ON ITS OWN PAGE, DELIBERATELY. Entering this view here calls
// getCurrentTexture() on a software adapter, which does not merely fail -- it
// destroys the WebGPU instance, and every compute call after it fails too. That
// is why the rest of the suite never switches to it. Isolating it to a
// throwaway page at the very end keeps the blast radius to itself.
//
// The PICTURE is still unverifiable here and is checked on a real device. What
// IS checked is the LIFECYCLE, which is where the bug actually was: after a
// rebuild the page must either hold a live renderer or have fallen back to the
// slice -- never sit in 3D with nothing to draw with.
if (FULL) {
  const v3d = await ctx.newPage();
  try {
    await v3d.goto(BASE.replace(/index\.html$/, '') + 'flowsim.html', { waitUntil: 'networkidle' });
    await v3d.waitForFunction(() => window.__fsDbg && !window.__fsDbg().building && window.__fsDbg().cells > 0,
      null, { timeout: 120000 });
    const has3D = await v3d.evaluate(() =>
      [...document.getElementById('view').options].some((o) => o.value === 'volume'));
    if (has3D) {
      await v3d.selectOption('#view', 'volume');
      await v3d.waitForTimeout(800);
      await v3d.click('#reset');
      await v3d.waitForFunction(() => !window.__fsDbg().building, null, { timeout: 120000 });
      await v3d.waitForTimeout(600);
      const st = await v3d.evaluate(() => window.__fsDbg());
      check('flowsim: after a rebuild the 3D view has a renderer or has fallen back to the slice',
        st.view !== 'volume' || st.rendererReady,
        JSON.stringify({ view: st.view, rendererReady: st.rendererReady }));

      // A SCALAR FIELD HAS NO 3D VIEW, and picking one while in 3D used to leave
      // the volume rendering the FLOW: the dye scene built correctly and the
      // reconstruction ran correctly, and the screen showed neither -- which from
      // outside is "the control does nothing". Reported exactly that way. The page
      // must now move itself to the slice and SAY WHY rather than switch silently.
      await v3d.selectOption('#view', 'volume').catch(() => {});
      await v3d.waitForTimeout(400);
      const wasVolume = await v3d.evaluate(() => window.__fsDbg().view === 'volume');
      if (wasVolume) {
        await v3d.selectOption('#scene', 'dye');
        await v3d.waitForFunction(() => !window.__fsDbg().building, null, { timeout: 180000 });
        await v3d.waitForTimeout(400);
        const sc = await v3d.evaluate(() => ({
          view: window.__fsDbg().view,
          mode: document.getElementById('mode').value,
          badge: document.getElementById('backend-badge').textContent,
          hasScalar: window.__fsSim() && window.__fsSim().meta.hasScalar,
        }));
        check('flowsim: a scalar scene picked in 3D moves to the slice, and says why',
          sc.hasScalar && sc.view === 'slice' && sc.mode === 'concentration' && /3D/.test(sc.badge),
          JSON.stringify(sc));
      } else {
        console.log('  (could not re-enter the 3D view — scalar-view check skipped)');
      }
    } else {
      console.log('  (3D view not offered here — nothing to check)');
    }
  } catch (e) {
    check('flowsim: the 3D lifecycle check ran', false, String(e).slice(0, 200));
  }
  await v3d.close().catch(() => {});
}

}   // end AREA-gated flowsim page

// ---- FlexiSim (flexisim.html): the hybrid arm, commissioned in the browser ----
//
// EVERY PHYSICS CLAIM ON THIS PAGE IS ALREADY PINNED IN PLAIN NODE, in
// test/flexisim/, where f64 is available and a run costs seconds. What only a
// browser can check is the WIRING: that the modules load as modules over HTTP,
// that the commissioning lifecycle actually reaches `ready`, that the canvas is
// painted, and that the controls change what they claim to. So this section drives
// the lifecycle and reads the page's own debug hook -- it does not re-measure the
// physics.
if (AREA.flexisim) {
section('flexisim page');
const fx = await ctx.newPage();
const fxErrors = [];
fx.on('pageerror', (e) => fxErrors.push(String(e)));
await fx.goto(BASE.replace(/index\.html$/, '') + 'flexisim.html', { waitUntil: 'load' });
// THE CONSOLE BUFFER IS PER ORIGIN, NOT PER PAGE -- it is persisted to
// localStorage so a white-screen crash survives a reload, which means this page
// inherits errors from every other page in this run. Cleared on entry so the
// buffer check at the end is about THIS page.
await fx.evaluate(() => window.__dbg && window.__dbg.clear && window.__dbg.clear());
await fx.waitForFunction(() => window.__flxDbg && window.__flxDbg().cells > 0, null, { timeout: 60000 });
check('flexisim.html loads and builds the hybrid arm', fxErrors.length === 0, fxErrors.join(' | '));
const fx0 = await fx.evaluate(() => window.__flxDbg());
check('flexisim: the lattice link is built', fx0.cells > 0 && fx0.phase === 'idle',
  JSON.stringify(fx0));
await checkConsoleUsable(fx, 'flexisim');

// COMMISSIONING IS THE LIFECYCLE, and it is the thing a browser can break that
// Node cannot: it runs inside the frame loop across many frames rather than in one
// blocking call, so a stalled or mis-sequenced phase shows up here and nowhere
// else. 27600 solver steps at the slider's maximum.
await fx.evaluate(() => { document.getElementById('s-spf').value = '200'; });
await fx.click('#commission');
await fx.waitForFunction(() => window.__flxDbg().phase === 'ready', null, { timeout: 120000 });
const fxc = await fx.evaluate(() => window.__flxDbg());
check('flexisim: commissioning identifies a compliance and a bending mode',
  fxc.compliance > 0 && fxc.mode && fxc.mode.omega > 0, JSON.stringify(fxc).slice(0, 200));
// The identified constant has a MEANING, so it can be checked rather than merely
// reported: a tracker at the tip sees wind-up AND bending, so the effective
// compliance must exceed the gearbox's own 1/K.
check('flexisim: the identified compliance exceeds the gearbox alone, as a tip measurement must',
  fxc.compliance > 1 / fxc.K, `${fxc.compliance} vs ${1 / fxc.K}`);

// ---- THE SOFTEST LINK, WHICH IS WHERE COMMISSIONING CRASHED ON A REAL DEVICE.
//
// ringFit needs four zero crossings and the bending period goes as 1/sqrt(E), so a
// FIXED decay record held only 1.3 periods at the softest rung, the fit returned
// null, and finishCommission() read .omega off it and threw:
//     TypeError: Cannot read properties of null (reading 'omega')
// The record is now sized from the mode it is measuring. This drives that exact rung
// end to end and requires a MEASURED mode, not the analytic fallback -- an assertion
// that only checked "no crash" would pass on the fallback and never notice the
// record had gone back to being too short.
{
  const setE = async (v) => {
    await fx.evaluate((val) => {
      const e = document.getElementById('s-e'); e.value = val;
      e.dispatchEvent(new Event('change'));
    }, v);
    await fx.waitForFunction(() => window.__flxDbg() && window.__flxDbg().phase === 'idle'
      && window.__flxDbg().cells > 0, null, { timeout: 60000 });
  };
  const commission = async () => {
    await fx.click('#commission');
    await fx.waitForFunction(() => window.__flxDbg().phase === 'ready', null, { timeout: 300000 });
    return fx.evaluate(() => window.__flxDbg());
  };

  await setE('0');
  const soft0 = await fx.evaluate(() => window.__flxDbg());
  const soft = await commission();
  console.log(`  flexisim: softest link E ${soft0.E}, decay record ${soft0.decayWant} steps `
    + `-> mode ${soft.mode.omega.toExponential(3)} (period ${soft.mode.period.toFixed(0)}), `
    + `analytic ${!!soft.mode.analytic}`);
  check('flexisim: the softest link commissions without crashing',
    soft.phase === 'ready' && soft.compliance > 0, JSON.stringify(soft).slice(0, 160));
  // NOT "MEASURED" -- THE SOFTEST LINK GENUINELY DOES NOT RING, and demanding a
  // measurement the physics does not provide would be the wrong assertion. The
  // structural damping is a fixed rate per step, so zeta = damping/(2w) rises as the
  // link softens: 0.24 at E 0.20 up to 0.76 at E 0.02, where the decay is over before
  // two cycles. What is required is that the page says so and disables a shaper that
  // would be pure delay -- and that the fallback zeta is the one the damping implies
  // rather than a number someone picked.
  const zetaWant = 3e-3 / (2 * soft.mode.omega);
  check('flexisim: the softest link is reported OVER-DAMPED rather than mis-measured',
    soft.mode.analytic === true && soft.mode.overdamped === true
    && Math.abs(soft.mode.zeta / zetaWant - 1) < 1e-9,
    JSON.stringify(soft.mode));
  const shapeDisabled = await fx.evaluate(() => document.getElementById('shape-on').disabled);
  check('flexisim: and input shaping is disabled, because there is no mode to cancel',
    shapeDisabled === true, String(shapeDisabled));

  // A REBUILD MUST LEAVE THE PAGE USABLE. Changing a plant slider used to leave the
  // Commission button disabled with nothing able to re-enable it -- a dead end that
  // needed a page reload -- and, mid-commissioning, `comm` pointing at an arm that
  // no longer existed.
  await setE('5');
  const rebuilt = await fx.evaluate(() => ({
    dbg: window.__flxDbg(),
    disabled: document.getElementById('commission').disabled,
    label: document.getElementById('commission').textContent.trim(),
  }));
  check('flexisim: a plant rebuild leaves commissioning available again',
    !rebuilt.disabled && /Commission/.test(rebuilt.label) && rebuilt.dbg.mode === null,
    JSON.stringify(rebuilt).slice(0, 160));

  // AND THE FALLBACK ITSELF IS EXERCISED, because a guard nothing ever runs is a
  // guard nobody knows works. The FIT is stubbed out and the real handler judges
  // it -- the same seam FlowSim uses for its diverged-run path.
  await fx.evaluate(() => { window.__flxFailFit = true; });
  const fb = await commission();
  await fx.evaluate(() => { delete window.__flxFailFit; });
  const fbBadge = await fx.textContent('#state-badge');
  check('flexisim: a failed decay fit falls back and SAYS so, rather than throwing',
    fb.phase === 'ready' && fb.mode && fb.mode.analytic === true && fb.mode.omega > 0,
    JSON.stringify(fb.mode));
  check('flexisim: and the badge names it as estimated rather than measured',
    /ESTIMATED/.test(fbBadge), fbBadge);

  // Leave a properly measured commissioning behind for everything below.
  await setE('5');
  const back = await commission();
  check('flexisim: and re-commissioning a link that DOES ring recovers a measured mode',
    !back.mode.analytic && !back.mode.overdamped, JSON.stringify(back.mode));
}

// Run a move in each CORRECTION MODE and require the BIAS to collapse. This is the
// page's headline and it is the one thing the wiring could silently get wrong --
// the physics is pinned in Node, but nothing there proves the selector reaches the
// compensator, or that the closed loop's gate is real.
const runFor = async (steps) => {
  const k0 = (await fx.evaluate(() => window.__flxDbg())).k;
  await fx.evaluate(() => { if (!window.__flxDbg().running) document.getElementById('run').click(); });
  await fx.waitForFunction((t) => window.__flxDbg().k > t, k0 + steps, { timeout: 120000 });
  await fx.evaluate(() => { if (window.__flxDbg().running) document.getElementById('run').click(); });
};
await runFor(8000);
const plain = (await fx.evaluate(() => window.__flxDbg())).win;
await fx.selectOption('#ctl-mode', 'ff');
await runFor(8000);
const compd = (await fx.evaluate(() => window.__flxDbg())).win;
console.log(`  flexisim: bias ${plain.bias.toExponential(3)} -> ${compd.bias.toExponential(3)}, `
  + `oscillation ${plain.sd.toExponential(3)} -> ${compd.sd.toExponential(3)}`);
check('flexisim: mode ② (open loop + prediction) actually collapses the bias',
  Math.abs(compd.bias) < 0.1 * Math.abs(plain.bias),
  `${plain.bias} -> ${compd.bias}`);
check('flexisim: and it leaves the oscillation alone, which is the other mechanism',
  Math.abs(compd.sd / plain.sd - 1) < 0.35, `${plain.sd} -> ${compd.sd}`);

// THE FEEDFORWARD LOOKS AHEAD, and this is asserted as an IDENTITY rather than as a
// number: the correction actually applied must be the model evaluated at the FUTURE
// reference, not at the present one. A lead that is merely configured and not used
// would report a horizon in the stats and change nothing, which is precisely the
// defect this replaced -- it fed prof.at(k) for the whole life of the tab.
const lead = (await fx.evaluate(() => window.__flxDbg())).ctl;
check('flexisim: the feedforward is evaluated AHEAD of the move, not on it',
  lead.ffLead > 100 && Number.isFinite(lead.ffAtLead)
  && Math.abs(lead.ffAtLead - lead.ffAtNow) > 1e-9,
  JSON.stringify(lead).slice(0, 160));

// THE PAGE MUST NAME WHAT LIMITS THE RMS. "The correction is worth 1.00x on the
// rms" is the reading that got reported as underwhelming, and it is CORRECT -- the
// ringing is 94% of the error and no quasi-static model can cancel a resonance. A
// page that shows the ratio without saying why invites the same conclusion again.
//
// READ IT HERE, where a full window exists. The first version of this check sat
// after the mode-3 gate probe, and every selector change clears the window -- so
// winStats() was legitimately null, the whole block was skipped, and the check
// reported the page broken when it was reading a meter with nothing in it. That is
// the same mistake as averaging across the mode change, two checks earlier.
const limitRow = await fx.evaluate(() => {
  const dl = document.getElementById('stats');
  const dts = [...dl.querySelectorAll('dt')].map((d) => d.textContent);
  const i = dts.findIndex((t) => /limited by/.test(t));
  return i < 0 ? null : dl.querySelectorAll('dd')[i].textContent;
});
console.log(`  flexisim: rms limited by — ${String(limitRow).slice(0, 60)}…`);
check('flexisim: the stats name which mechanism limits the rms, not just its value',
  limitRow !== null && /ringing|bias/.test(limitRow), String(limitRow).slice(0, 120));

// THE CLOSED LOOP IS REFUSED WHILE THE SENSOR IS STILL BEING TOLD THE ANSWER, and
// that gate is asserted BEFORE the lock rather than assumed. A selector that
// silently ran the loop on a model the tracker is still correcting would be
// closing the loop on a commissioning instrument the machine will not have -- and
// nothing in the picture would show it.
await fx.selectOption('#ctl-mode', 'closed');
const gated = (await fx.evaluate(() => window.__flxDbg())).ctl;
check('flexisim: mode ③ is REFUSED until the soft sensor is locked, and says which mode is live',
  gated.want === 'closed' && gated.active === 'open', JSON.stringify(gated));
await fx.selectOption('#ctl-mode', 'open');

// THE CHART MUST TRACK THE RUN. Plotly.react compares data by REFERENCE, so a
// chart handed the same arrays mutated in place silently freezes on its first
// points -- no error, nothing blank, just the wrong picture. Asserting that the
// last plotted step is near the simulation's own step counter is the only thing
// that catches it.
const chartEnd = await fx.evaluate(() => {
  const d = document.getElementById('err-chart').data;
  return d && d[0] && d[0].x.length ? d[0].x[d[0].x.length - 1] : -1;
});
const kNow = (await fx.evaluate(() => window.__flxDbg())).k;
// THE TOLERANCE HAS TO EXCEED SIX FRAMES OF STEPPING, because the chart refreshes
// on every sixth frame by design: at the slider's maximum that is 1200 solver
// steps of legitimate lag. The first version used 600 and passed by luck -- it is
// checking for a chart FROZEN at its first points, which is a gap of tens of
// thousands, not for it being a frame behind.
check('flexisim: the error chart tracks the run rather than freezing on its first points',
  chartEnd > kNow - 2000, `chart ends at ${chartEnd}, run is at ${kNow}`);

// FIVE SERIES, AND THE ONE THAT PROVES THE CLAIM IS THE PAIR: with the model
// correction on, the MOTOR is deliberately off target and the TOOL is on it. The
// chart is asserted on its DATA rather than on its existence -- a chart with the
// right legend and the wrong arrays looks perfect.
// READ THE TAIL, NOT THE WHOLE TRACE. The chart deliberately spans the mode change
// -- seeing the switch is the point of it -- so a mean over everything drawn is a
// blend of open loop and corrected, which is this project's oldest measurement
// mistake. The first version of this check averaged the lot and reported the tool
// at -3.8e-2, almost exactly half the uncorrected -7.4e-2, i.e. it was measuring
// the window rather than the correction. 200 points is 5000 solver steps, past one
// move period of 4304.
const ch = await fx.evaluate(() => {
  const d = document.getElementById('err-chart').data;
  const by = {}; for (const t of d) by[t.name] = t.y;
  const tail = (a) => (a || []).slice(-200);
  const mean = (a) => { const v = tail(a).filter((x) => Number.isFinite(x)); return v.length
    ? v.reduce((s2, x) => s2 + x, 0) / v.length : NaN; };
  return { names: d.map((t) => t.name), n: (by['true arm'] || []).length,
    cmd: mean(by['commanded motor']), enc: mean(by['actual motor']),
    tru: mean(by['true arm']), est: mean(by['estimated arm']) };
});
console.log(`  flexisim: chart means — commanded motor ${ch.cmd.toExponential(2)}, actual motor `
  + `${ch.enc.toExponential(2)}, true arm ${ch.tru.toExponential(2)}`);
check('flexisim: the chart carries all five positions',
  ['desired', 'commanded motor', 'actual motor', 'estimated arm', 'true arm']
    .every((n) => ch.names.includes(n)) && ch.n > 50, ch.names.join(','));
// Mode (2) is live here, so this is the proof the tab exists to make.
check('flexisim: with the correction on, the MOTOR is off target and the TOOL is on it',
  Math.abs(ch.cmd) > 1e-3 && Math.abs(ch.enc) > 3 * Math.abs(ch.tru),
  `commanded ${ch.cmd}, motor ${ch.enc}, tool ${ch.tru}`);

// AND THE PICTURE MUST NOT CONTRADICT THE NUMBERS. The defect this replaced drew
// the wind-up at 1x and the bending at the slider's magnification, which put the
// true tool on the wrong side of the encoder for 3.2% of every move. Sampling the
// drawn geometry against tipError() is the only thing that catches it -- every
// physics assertion passed while the picture was wrong.
const geom = await fx.evaluate(async () => {
  const rs = [];
  for (let i = 0; i < 90; i++) {
    const g = window.__flxGeom();
    if (g && Number.isFinite(g.ratio) && Math.abs(g.trueToolVsMotor) > 1e-3) {
      rs.push(g.ratio / g.mag);   // 1.0 iff the WHOLE error carries one magnification
    }
    await new Promise((r) => requestAnimationFrame(r));
  }
  rs.sort((a, b) => a - b);
  return { n: rs.length, lo: rs[0], hi: rs[rs.length - 1] };
});
console.log(`  flexisim: drawn/true tool error over ${geom.n} frames — `
  + `${geom.lo.toFixed(4)} to ${geom.hi.toFixed(4)} of the magnification (want 1.0)`);
check('flexisim: the picture magnifies the WHOLE tool error, wind-up and bending alike',
  geom.n > 20 && geom.lo > 0.95 && geom.hi < 1.05,
  `${geom.n} frames, ${geom.lo} to ${geom.hi}`);

// THE SOFT SENSOR, END TO END: calibrate, train against the tracker, LOCK, and
// score what the machine would produce afterwards. The physics is pinned in Node;
// what this checks is that the page's own sampling meets the model's cadence
// contract -- the lag window is counted in SAMPLES, and a frame loop free to step
// a partial interval would pair a reading with a plant state between boundaries.
await fx.click('#ss-train');
// THE COMMISSIONING DITHER IS LOAD-BEARING, not a guard: without it mode ③ is
// positive feedback and runs to its clamp (measured, the estimate reaches 26x the
// truth at a held pre-distortion of 0.05 rad). Asserting it is actually applied is
// therefore asserting the thing that makes the closed loop converge at all.
const dith = (await fx.evaluate(() => window.__flxDbg())).ctl;
check('flexisim: training dithers the correction, so the model sees the loop it will be inside',
  dith.dithering && dith.dither > 1e-4, JSON.stringify(dith));
await runFor(14000);
await fx.click('#ss-lock');
await runFor(4000);
const sd = (await fx.evaluate(() => window.__flxDbg())).ss;
console.log(`  flexisim: soft sensor ${sd.mode} after ${sd.trained} pairs — estimate `
  + `${sd.scores.estimate.toFixed(4)} vs naive ${sd.scores.naive.toFixed(4)}, forecast `
  + `${(sd.scores.forecast || NaN).toFixed(4)} vs persistence ${(sd.scores.persist || NaN).toFixed(4)}`);
check('flexisim: the soft sensor reaches a locked, frozen readout',
  sd.mode === 'estimating' && sd.frozen && sd.trained > 800, JSON.stringify(sd).slice(0, 160));
check('flexisim: and the LOCKED estimate beats the controller\'s own view of the tip',
  sd.scores.estimate < 0.7 * sd.scores.naive,
  `${sd.scores.estimate} vs ${sd.scores.naive}`);
check('flexisim: the forecast beats persistence on the readout\'s own estimate',
  sd.scores.forecast < sd.scores.persist,
  `${sd.scores.forecast} vs ${sd.scores.persist}`);

// ---- MODE ③: NOW THAT THE SENSOR IS LOCKED, THE LOOP MAY CLOSE. The gate is the
// same one asserted above, from the other side -- and what is checked here is that
// the loop, which is given no model at all, removes the bias anyway. It is a lag at
// two bending periods, so it is given several moves to converge before being read;
// reading it earlier would be reading a meter before it settles.
await fx.selectOption('#ctl-mode', 'closed');
await runFor(12000); await runFor(12000);
const cl = await fx.evaluate(() => window.__flxDbg());
console.log(`  flexisim: closed loop active=${cl.ctl.active} offset `
  + `${(cl.ctl.closedOff * 1e3).toFixed(3)} mrad — bias ${plain.bias.toExponential(3)} -> `
  + `${cl.win.bias.toExponential(3)}, oscillation ${plain.sd.toExponential(3)} -> `
  + `${cl.win.sd.toExponential(3)}`);
check('flexisim: once LOCKED, mode ③ really engages',
  cl.ctl.active === 'closed' && Math.abs(cl.ctl.closedOff) > 1e-5, JSON.stringify(cl.ctl));
check('flexisim: and the closed loop cuts the bias with no model at all',
  Math.abs(cl.win.bias) < 0.35 * Math.abs(plain.bias),
  `${plain.bias} -> ${cl.win.bias}`);
check('flexisim: it leaves the oscillation alone too — it cannot chase what it sits on',
  Math.abs(cl.win.sd / plain.sd - 1) < 0.35, `${plain.sd} -> ${cl.win.sd}`);

// ---- COMPARE fills the table by itself, which is the control the whole feature is
// for. It is asserted on the TABLE rather than on a badge: a sequencer that ran and
// recorded nothing would leave every message looking right.
await fx.selectOption('#ctl-mode', 'open');
await fx.click('#compare');
await fx.evaluate(() => { if (!window.__flxDbg().running) document.getElementById('run').click(); });
await fx.waitForFunction(() => {
  const b = window.__flxDbg().board;
  return Object.keys(b).length >= 3 || !window.__flxDbg().ctl.comparing;
}, null, { timeout: 600000 });
await fx.evaluate(() => { if (window.__flxDbg().running) document.getElementById('run').click(); });
const cmpB = await fx.evaluate(() => window.__flxDbg().board);
const cmpRows = await fx.evaluate(() =>
  document.getElementById('board').querySelectorAll('tr').length);
console.log(`  flexisim: compare filled ${Object.keys(cmpB).join(', ')} — bias `
  + Object.entries(cmpB).map(([m, v]) => `${m} ${v.bias.toExponential(2)}`).join(' / '));
check('flexisim: Compare runs every mode by itself and fills the table',
  Object.keys(cmpB).length === 3 && cmpRows === 4, `${JSON.stringify(Object.keys(cmpB))} `
  + `${cmpRows} rows`);
check('flexisim: and the table it produced ranks the corrections below the open loop',
  Math.abs(cmpB.ff.bias) < Math.abs(cmpB.open.bias)
  && Math.abs(cmpB.closed.bias) < Math.abs(cmpB.open.bias),
  JSON.stringify(cmpB));

// ---- AUTO-TUNE, and the STATE LOCKING it is supposed to enforce. A one-button
// sequence that leaves the manual controls live is worse than no button: two things
// then drive the same lifecycle and the loser is whichever the user taps. The
// controls being disabled WHILE it runs is therefore half the feature, and it is
// asserted here rather than assumed -- this is the part that was reported broken.
await fx.evaluate(() => { document.getElementById('auto').click(); });
await fx.waitForTimeout(200);
const inAuto = await fx.evaluate(() => window.__flxDbg());
check('flexisim: Auto-tune starts a sequence and reports which step it is on',
  inAuto.auto && typeof inAuto.auto.what === 'string', JSON.stringify(inAuto.auto));
check('flexisim: …and LOCKS the manual controls while it owns the machine',
  ['commission', 'run', 'ctl-mode', 'compare', 'ss-train'].every((id) => inAuto.ui[id]),
  JSON.stringify(inAuto.ui));
await fx.waitForFunction(() => !window.__flxDbg().auto, null, { timeout: 300000 });
const afterAuto = await fx.evaluate(() => window.__flxDbg());
console.log(`  flexisim: auto-tune selected ${afterAuto.ctl.want}, board `
  + Object.entries(afterAuto.board).map(([m, v]) => `${m} ${v.rms.toExponential(2)}`).join(' / '));
check('flexisim: Auto-tune finishes and leaves a correction selected',
  ['open', 'ff', 'closed', 'learned'].includes(afterAuto.ctl.want)
  && Object.keys(afterAuto.board).length >= 2, JSON.stringify(afterAuto.ctl.want));
// ---- MODE 4 IS THE ONE THAT CAN TOUCH THE OSCILLATION, so it is asserted on that
// rather than on merely existing: a filter over the commanded trajectory that did
// not beat the quasi-static model would be an expensive way to reproduce it.
const lf = afterAuto.learned;
check('flexisim: the learned filter gets fitted and reports its size',
  lf && lf.ready && lf.features > 30 && lf.rows > 500, JSON.stringify(lf));
const bd = afterAuto.board;
if (bd.learned && bd.ff) {
  console.log(`  flexisim: learned ${bd.learned.rms.toExponential(2)} vs model `
    + `${bd.ff.rms.toExponential(2)} vs open ${bd.open.rms.toExponential(2)}`);
  check('flexisim: …and beats the quasi-static model it sits on top of',
    bd.learned.rms < bd.ff.rms, `learned ${bd.learned.rms} vs ff ${bd.ff.rms}`);
  check('flexisim: …by reducing the OSCILLATION, which nothing else here can',
    bd.learned.sd < 0.8 * bd.ff.sd, `learned sd ${bd.learned.sd} vs ff sd ${bd.ff.sd}`);
}
// IT PICKS BY MEASURING. The selected mode must be the lowest rms ON ITS OWN TABLE
// -- a sequence that scored everything and then chose a favourite would look
// identical from outside.
const rows = afterAuto.board;
check('flexisim: …the one its own table scored best, not a favourite',
  Object.keys(rows).every((m) => rows[m].rms >= rows[afterAuto.ctl.want].rms),
  Object.entries(rows).map(([m, v]) => `${m} ${v.rms.toExponential(2)}`).join(', '));
// THE CHECK THAT WAS MISSING, AND ITS ABSENCE IS WHAT LET THIS SHIP. Every sensor
// assertion above runs BEFORE auto-tune, under whatever correction happened to be
// live then -- so the suite measured 0.050 while a user who pressed the one button
// and looked at the same panel saw 1.22, worse than predicting the mean. The
// correction pre-distorts the setpoint, the ENCODER follows it, and the encoder is a
// model INPUT, so a sensor commissioned under one correction is being asked about a
// different machine under another. Measured on ONE locked model across the four:
// 0.032 (its own) / 0.378 / 0.315 / 1.225. The sequence now chooses the correction
// FIRST and commissions the sensor in it, and this is what pins that.
const kPost = (await fx.evaluate(() => window.__flxDbg())).k;
await fx.waitForFunction((t) => window.__flxDbg().k > t, kPost + 20000, { timeout: 300000 });
const post = await fx.evaluate(() => window.__flxDbg());
console.log(`  flexisim: after auto-tune — running ${post.ctl.active}, sensor commissioned `
  + `under ${post.ss.under}, estimate ${post.ss.scores.estimate.toFixed(4)} vs naive `
  + `${post.ss.scores.naive.toFixed(4)}, forecast ${post.ss.scores.forecast.toFixed(4)} vs `
  + `persistence ${post.ss.scores.persist.toFixed(4)}`);
check('flexisim: the sensor is commissioned in the configuration auto-tune chose',
  post.ss.under === post.ctl.active, `${post.ss.under} vs ${post.ctl.active}`);
// AND THE LOCK IS THE LAST THING THE SEQUENCE DOES. Reported from the device: the sensor
// was locked in the middle and then sat idle through the closed-loop scoring and the
// selection, which is time it could have been learning — and worse, when the selection
// landed on the closed loop the sensor had been locked under a DIFFERENT correction,
// which is the one case brick 23's reordering was supposed to fix and did not. The closed
// loop is now scored against a sensor that is HELD rather than locked, the sensor then
// trains again under whatever won, and only then does it lock.
console.log(`  flexisim: sensor locked at step "${post.ss.lockedAt.step}" after `
  + `${post.ss.lockedAt.trained} pairs, under ${post.ss.lockedAt.under}`);
check('flexisim: …and the LOCK is the last step of the sequence, not one in the middle',
  post.ss.lockedAt && post.ss.lockedAt.step === 'lock it', JSON.stringify(post.ss.lockedAt));
check('flexisim: …so the sensor keeps learning past the training target and tops up',
  post.ss.lockedAt.already || post.ss.lockedAt.trained > 5000,
  `${post.ss.lockedAt.trained} pairs`);
check('flexisim: …and it is locked, so the tracker really has gone away',
  post.ss.mode === 'estimating' && post.ss.frozen, post.ss.mode);
check('flexisim: …so the readout the user is left looking at is actually good',
  post.ss.scores.estimate < 0.25 * post.ss.scores.naive,
  `${post.ss.scores.estimate} vs naive ${post.ss.scores.naive}`);
check('flexisim: …and so is its forecast',
  post.ss.scores.forecast < 0.5 * post.ss.scores.persist,
  `${post.ss.scores.forecast} vs persistence ${post.ss.scores.persist}`);
// AND THE TABLE MUST NOT CARRY THE DITHERED MACHINE. The commissioning dither makes
// the machine deliberately worse while it runs, and the passive recorder was writing
// that in as the correction's score -- the learned row went 2.49e-2 -> 1.24e-1 and
// auto-tune then read its own table and picked the runner-up.
check('flexisim: …and the winner it kept is the one the settled machine measures',
  post.board[post.ctl.active]
  && Math.abs(post.board[post.ctl.active].rms - post.win.rms) < 0.5 * post.win.rms,
  `${JSON.stringify(post.board[post.ctl.active])} vs live ${post.win.rms}`);
// ---- THE CONTROL SIGNAL IS A DELIVERABLE, and its smoothness is now an objective.
// Reported from the device as "high frequency jitter in the controls" and measured:
// the quasi-static model is proportional to commanded ACCELERATION, a trapezoid's
// acceleration is piecewise CONSTANT, so the pre-distortion STEPPED at every corner of
// the profile and the input shaper tripled the number of corners. Content 500x faster
// than the servo's own time constant, so nothing could follow it -- a torque spike into
// the PD loop and nothing else. A jerk limit is a boxcar convolved into the same
// impulse list the shaper uses, and it costs delay and nothing else.
// PAUSED FIRST, because a motion slider is STAGED and applied at a move boundary --
// changing a reference mid-move is a position-demand step into the servo's gain. With
// the loop stopped there is no move to interrupt and it applies at once.
await fx.evaluate(() => { if (window.__flxDbg().running) document.getElementById('run').click(); });
const offAt = (jerk) => fx.evaluate(async (j) => {
  const sl = document.getElementById('s-jerk');
  sl.value = String(j);
  sl.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 400));
  const s = window.__flxOffSeries(100000);
  const m = s.off.reduce((a, c) => a + c, 0) / s.off.length;
  const sd = Math.sqrt(s.off.reduce((a, c) => a + (c - m) ** 2, 0) / s.off.length);
  return { period: s.period, rough: s.rough, sd, ratio: s.rough / sd };
}, jerk);
await fx.selectOption('#ctl-mode', 'ff');
const jOff = await offAt(0), jOn = await offAt(3);
console.log(`  flexisim: control roughness — jerk off ${jOff.ratio.toExponential(2)}, `
  + `jerk 120 ${jOn.ratio.toExponential(2)} (${(jOff.ratio / jOn.ratio).toFixed(0)}x smoother), `
  + `period ${jOff.period} -> ${jOn.period}`);
check('flexisim: the jerk limit makes the control signal dramatically smoother',
  jOn.ratio < jOff.ratio / 20, `${jOn.ratio} vs ${jOff.ratio}`);
check('flexisim: …and it does NOT shrink the correction, which would be cheating',
  jOn.sd > 0.75 * jOff.sd, `${jOn.sd} vs ${jOff.sd}`);
check('flexisim: …the dwell grows to cover its delay, so the move still finishes',
  jOn.period >= jOff.period + 120, `${jOff.period} -> ${jOn.period}`);
await fx.evaluate(() => { if (!window.__flxDbg().running) document.getElementById('run').click(); });

// ---- A REAL DRIVE HAS A RATING, and until now this one did not. Reported from the
// device: "the actual motor position has to be speed, accel and torque limited to match
// a real world scenario. Real motors can't react like it can now." All three limits come
// from ONE torque-speed envelope -- see driveEnvelope() -- so what is checked here is
// that the rating reaches the plant and BITES when the move asks for more than it.
const driveAt = async (v, steps) => {
  await fx.evaluate((val) => {
    const sl = document.getElementById('s-drive');
    sl.value = String(val); sl.dispatchEvent(new Event('input', { bubbles: true }));
  }, v);
  const k0 = (await fx.evaluate(() => window.__flxDbg())).k;
  await fx.waitForFunction((t) => window.__flxDbg().k > t, k0 + steps, { timeout: 300000 });
  return fx.evaluate(() => window.__flxDbg());
};
const dHi = await driveAt(6, 14000);     // 32x the hold torque: what the machine ships with
const dLo = await driveAt(0, 14000);     // 2x: a drive far too small for this move
console.log(`  flexisim: drive — rated 32x hold, saturated `
  + `${(100 * dHi.drive.fraction).toFixed(1)}%, rms ${dHi.win.rms.toExponential(3)}; `
  + `rated 2x, saturated ${(100 * dLo.drive.fraction).toFixed(1)}%, `
  + `rms ${dLo.win.rms.toExponential(3)}`);
check('flexisim: the drive has a torque rating and reports what it was asked for',
  dHi.drive && dHi.drive.tauMax > 0 && dHi.drive.peakDemand > 0,
  JSON.stringify(dHi.drive));
check('flexisim: …the shipped rating carries the shipped move without saturating',
  dHi.drive.fraction < 0.02, `${dHi.drive.fraction}`);
check('flexisim: …and a drive too small for the move SATURATES and lags, as a real one does',
  dLo.drive.fraction > 0.1 && dLo.win.rms > 3 * dHi.win.rms,
  `${dLo.drive.fraction} saturated, rms ${dLo.win.rms} vs ${dHi.win.rms}`);
await driveAt(6, 6000);

// ---- AND THE PICTURE BOUNDS THE MAGNIFIED SHAKE instead of just amplifying it. At x30
// a real 2.5e-2 tool error is drawn as 5% of the arm and it genuinely swings every few
// frames, which reads as noise; the stage now draws the sweep over the same window the
// stats use, with a tick where the tool settles. What is checked is that the band is
// telling the truth -- the arm on screen must be inside the band drawn around it.
const bandG = await fx.evaluate(() => window.__flxGeom());
check('flexisim: the stage draws the excursion the tool actually sweeps',
  bandG.band && bandG.band.hi > bandG.band.lo, JSON.stringify(bandG.band));
check('flexisim: …and the arm drawn NOW is inside the band drawn around it',
  bandG.toolDev >= bandG.band.lo - 1e-9 && bandG.toolDev <= bandG.band.hi + 1e-9,
  `${bandG.toolDev} vs ${JSON.stringify(bandG.band)}`);
check('flexisim: …with the settled value between the two, which is what the tick marks',
  bandG.band.mean > bandG.band.lo && bandG.band.mean < bandG.band.hi,
  JSON.stringify(bandG.band));

check('flexisim: and the manual controls come back afterwards',
  !afterAuto.ui.commission && !afterAuto.ui['ctl-mode'], JSON.stringify(afterAuto.ui));

// ---- THE SINUSOID. A second profile is a second reference generator, and the one
// thing it can silently get wrong is the move BOUNDARY the whole page is timed on
// -- the window, the scoreboard and the staged motion all key off prof.period.
await fx.selectOption('#s-profile', 'sine');
await fx.evaluate(() => { document.getElementById('s-freq').value = '4';
  document.getElementById('s-freq').dispatchEvent(new Event('input')); });
await runFor(6000);
const sine = await fx.evaluate(() => window.__flxDbg());
check('flexisim: the sinusoid profile takes, with the period the frequency slider asked for',
  sine.motion.profile === 'sine' && sine.motion.period === 2000, JSON.stringify(sine.motion));
// AND THE OTHER PROFILE'S CONTROLS ARE ACTUALLY GONE. `hidden` is only a UA
// display:none and .controls sets display:flex, which beats it -- so the first
// version showed the trapezoid's sliders and the sinusoid's at the same time with
// no error and nothing blank. Asserting VISIBILITY rather than the attribute is the
// only thing that catches it, the same lesson as the console button that reported
// "visible" while sitting off the right edge of the screen.
const groups = await fx.evaluate(() => ({
  trap: document.getElementById('trap-ctl').getBoundingClientRect().height,
  sine: document.getElementById('sine-ctl').getBoundingClientRect().height,
}));
check('flexisim: and only ONE profile\'s sliders are on screen at a time',
  groups.trap === 0 && groups.sine > 0, JSON.stringify(groups));
check('flexisim: and the arm actually follows it rather than sitting at the home pose',
  sine.win && sine.win.sd > 0, JSON.stringify(sine.win));
await fx.selectOption('#s-profile', 'trap');

// The canvas must actually be painted. An unpainted canvas is not an error and
// not blank -- it is WHITE, which against this page reads as broken.
const painted = await fx.evaluate(() => {
  const c = document.getElementById('cv');
  if (!c.width || !c.height) return { ok: false, why: 'zero-sized' };
  const g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let lit = 0;
  for (let i = 0; i < d.length; i += 4 * 37) if (d[i] > 60 || d[i + 1] > 60) lit++;
  return { ok: lit > 20, lit };
});
check('flexisim: the stage is painted', painted.ok, JSON.stringify(painted));
await fx.screenshot({ path: join(SHOTS, '05-flexisim.png') });

// ---- THE CHAIN TAB: a second, independent plant, and the coupling made visible.
//
// The physics is pinned in test/flexisim/arm2r.test.mjs against closed forms and
// conservation laws. What this checks is that the tab wires it up -- that the
// second lattice pair builds, that the chain steps, that the canvas is painted,
// and that the claim the tab is ABOUT survives being driven through the page: with
// the elbow commanded to hold, its inertial load is mostly the SHOULDER'S doing.
await fx.click('.tab[data-tab="chain"]');
await fx.waitForFunction(() => window.__flxChainDbg() && window.__flxChainDbg().cells > 0,
  null, { timeout: 60000 });
await fx.evaluate(() => { document.getElementById('s-spf2').value = '160'; });
const ck0 = (await fx.evaluate(() => window.__flxChainDbg())).k;
await fx.click('#run2');
await fx.waitForFunction((t) => window.__flxChainDbg().k > t, ck0 + 9000, { timeout: 120000 });
await fx.click('#run2');
const cd = await fx.evaluate(() => window.__flxChainDbg());
console.log(`  flexisim/chain: M11 straight ${cd.Mstraight.toPrecision(4)} folded `
  + `${cd.Mfolded.toPrecision(4)} (${(cd.Mstraight / cd.Mfolded).toFixed(2)}x); elbow load rms `
  + `M21a1 ${cd.rms.c21.toExponential(2)} vs M22a2 ${cd.rms.c22.toExponential(2)}; `
  + `tool error ${cd.tip.total.toExponential(2)} over reach ${cd.reach.toFixed(1)}`);
check('flexisim/chain: the shoulder inertia changes by more than 2x across the elbow range',
  cd.Mstraight / cd.Mfolded > 2, `${(cd.Mstraight / cd.Mfolded).toFixed(3)}x`);
check('flexisim/chain: with the elbow commanded to HOLD, its inertial load is mostly the shoulder\'s',
  cd.rms.c21 > 3 * cd.rms.c22, `${cd.rms.c21.toExponential(3)} vs ${cd.rms.c22.toExponential(3)}`);
check('flexisim/chain: and the elbow gearbox really carries a torque it was never commanded',
  Math.abs(cd.windup[1]) > 1e-5 && cd.rms.t2 > 0, JSON.stringify(cd.windup));
// THE CHAIN'S TOOL SENSOR, TWO MODELS ON ONE STREAM. The physics and the offline
// numbers are pinned in test/flexisim/chainsensor.test.mjs; what the browser can
// uniquely break is the wiring -- that both models are fed at the same sample
// boundaries from the same plant, and that the comparison the tab displays is the
// one the library measured.
// THE COMPARISON IS RUN WITH BOTH JOINTS MOVING, which is the regime the claim is
// about and the one the library measures. With the elbow commanded to hold the
// result REVERSES (whole arm 0.562 against elbow-only 0.494) and both models are
// five to eight times worse; that is recorded in test/flexisim/chainsensor.test.mjs
// and stated on the page rather than hidden, but it is not what this asserts.
//
// CHANGING THE REGIME RESTARTS THE SENSORS, because a frozen standardisation
// belongs to the stream it was calibrated on -- so the run has to go again before
// the training button is live. Clicking it while still disabled is what the first
// version did, and it waited thirty seconds for a button that could not enable
// with the loop paused.
await fx.selectOption('#mode2', 'both');
await fx.click('#run2');
await fx.waitForFunction(() => !document.getElementById('cs-train').disabled,
  null, { timeout: 120000 });
await fx.click('#cs-train');
const ck1 = (await fx.evaluate(() => window.__flxChainDbg())).k;
await fx.waitForFunction((t) => window.__flxChainDbg().k > t, ck1 + 9000, { timeout: 240000 });
await fx.click('#cs-lock');
const ck2 = (await fx.evaluate(() => window.__flxChainDbg())).k;
await fx.waitForFunction((t) => window.__flxChainDbg().k > t, ck2 + 4000, { timeout: 240000 });
await fx.click('#run2');
const cs = (await fx.evaluate(() => window.__flxChainDbg())).sensor;
console.log(`  flexisim/chain: tool sensor ${cs.mode} after ${cs.trained} pairs — whole arm `
  + `${cs.scores.whole.toFixed(4)}, elbow only ${cs.scores.elbow.toFixed(4)} `
  + `(${(cs.scores.elbow / cs.scores.whole).toFixed(2)}x), naive ${cs.scores.naive.toFixed(4)}`);
// THE PICTURE AND THE NUMBER ARE TWO VIEWS OF ONE QUANTITY AND MUST AGREE, which is the
// check that had no teeth here: `lastGeom2` used to report `mag * tipError().total`
// against `tipError().total`, so its ratio was identically `mag` whatever the drawing
// did. That is why a 1.44x disagreement between them survived — `tipError()` was missing
// link 1's tip-slope term entirely and projecting two others onto the wrong direction,
// while the drawing composed the chain correctly. It is measured off the canvas now.
{
  const gm = await fx.evaluate(() => window.__flxChainDbg().geom);
  console.log(`  flexisim/chain: drawn tool vs the model — ${gm && gm.ratio !== null
    ? gm.ratio.toFixed(4) : '—'} of the magnification (want 1.0), axial `
    + `${gm ? gm.axial.toExponential(2) : '—'}`);
  check('flexisim/chain: the picture draws the same tool error the model reports',
    gm && gm.ratio !== null && Math.abs(gm.ratio - 1) < 0.06,
    JSON.stringify(gm && { ratio: gm.ratio, drawn: gm.drawnToolVsMotor,
      true: gm.trueToolVsMotor }));
  // …AND THE SWEEP BAND CONTAINS THE TOOL IT IS DRAWN AROUND. The band was rendered 9.5x
  // too short — win2 holds a LENGTH and it was being divided by L2 before use — so the
  // marker sat well outside the bound the picture claimed for it.
  const inBand = await fx.evaluate(() => {
    const d = window.__flxChainDbg();
    if (!d.geom || !d.geom.band || !d.win) return null;
    const b = d.geom.band, e = d.win.rms;
    return { lo: b.lo, hi: b.hi, span: b.hi - b.lo, rms: e };
  });
  check('flexisim/chain: …and the sweep band spans the error it bounds',
    inBand && inBand.span > 0.5 * inBand.rms,
    JSON.stringify(inBand));
}

check('flexisim/chain: both tool sensors reach a locked, frozen readout',
  cs.mode === 'estimating' && cs.frozen && cs.trained > 500, JSON.stringify(cs).slice(0, 160));
check('flexisim/chain: the whole-arm sensor beats the controller\'s own view of the tool',
  cs.scores.whole < 0.5 * cs.scores.naive,
  `${cs.scores.whole} vs ${cs.scores.naive}`);
// AND WHICH ARCHITECTURE WINS DEPENDS ON THE COMMAND'S SPECTRUM, which is a second
// regime dependence and it arrived as a broken assertion. Measured in Node, one script,
// one variable, both models on the same stream at matched capacity, nRMSE and the
// ABSOLUTE error behind it:
//   jerk off   whole 0.0814 / elbow 0.1911  (2.35x)   absolute 4.09e-2 / 9.60e-2
//   jerk 120   whole 0.1798 / elbow 0.1821  (1.01x)   absolute 8.54e-2 / 8.63e-2
// The truth's own spread barely moves (5.03e-1 -> 4.75e-1), so this is not a
// normalisation artefact: the WHOLE-ARM model's absolute error doubles while the
// elbow-only one slightly improves. Its advantage lived in the shoulder's sharp
// acceleration steps -- the coupling term M21*alpha1 is the one thing the elbow cannot
// see directly, and an unlimited trapezoid makes it a distinctive high-frequency
// signal. Smooth the command and that channel carries much less.
// SO AT THE SHIPPED JERK LIMIT THERE IS NO ROBUST WINNER, and the browser says so more
// loudly than Node does -- 1.67x the other way on this run against Node's 1.01x tie,
// i.e. the effect and the run-to-run spread are the same size. What is asserted is
// therefore what survives that spread: BOTH architectures carry real information about
// a tool neither can see. Asserting a direction here would be asserting noise, and the
// direction is measured in Node, at a setting where it is not noise.
check('flexisim/chain: and the elbow-only model at matched capacity also beats naive',
  cs.scores.elbow < 0.5 * cs.scores.naive,
  `${cs.scores.elbow} vs ${cs.scores.naive}`);

// ---- THE SAME THREE CORRECTIONS ON THE CHAIN, applied at the shoulder. The rigid
// model here is a genuine rival rather than a formality -- it is given M(q), both
// stiffnesses and both lever arms -- so what is asserted is only that the wiring
// reaches the servo and that each correction moves the tool toward the PROGRAM's
// setpoint rather than the encoders'.
const runChain = async (steps) => {
  const k0 = (await fx.evaluate(() => window.__flxChainDbg())).k;
  await fx.evaluate(() => { if (!window.__flxChainDbg().running) document.getElementById('run2').click(); });
  await fx.waitForFunction((t) => window.__flxChainDbg().k > t, k0 + steps, { timeout: 240000 });
  await fx.evaluate(() => { if (window.__flxChainDbg().running) document.getElementById('run2').click(); });
};
// THE WINDOW IS THREE MOVE PERIODS (~11400 steps) because the chain's reference is
// deliberately non-repeating, so each mode needs that much AFTER the switch clears
// the window -- and the closed loop, a lag at two move periods, needs several more.
await runChain(14000);
const c2open = (await fx.evaluate(() => window.__flxChainDbg())).win;
await fx.selectOption('#ctl2-mode', 'ff');
await runChain(14000);
const c2ff = (await fx.evaluate(() => window.__flxChainDbg())).win;
await fx.selectOption('#ctl2-mode', 'closed');
await runChain(20000); await runChain(20000);
const c2cl = await fx.evaluate(() => window.__flxChainDbg());
console.log(`  flexisim/chain: tool bias vs the program — open ${c2open.bias.toExponential(3)} / `
  + `model ${c2ff.bias.toExponential(3)} / closed ${c2cl.win.bias.toExponential(3)} `
  + `(pre-distortion ${(c2cl.ctl.closedOff * 1e3).toFixed(2)} mrad)`);
// WHAT IS ASSERTED HERE IS THE WIRING AND THE STABILITY, NOT THE SIZE OF THE WIN,
// and the reason is measured rather than conceded. In this regime -- both joints
// moving, the amplitude modulated at the golden ratio so the sensor cannot score by
// cycle position -- the tool's bias against the program is about 5e-2, while the
// whole-arm sensor's own nRMSE of ~0.10 against a tool error whose spread is ~0.46
// leaves a residual of the SAME 4e-2. A loop can only null what its instrument can
// resolve, so it removes about a tenth of it and the three modes land within the
// 3-period measurement spread (0.042, measured in Node) of each other.
// THAT IS NOT TRUE ON THE MOVE TAB and the difference is instructive: there the
// reference repeats exactly, the model learns the periodic pattern, its residual is
// zero-MEAN even though its rms is comparable, and the same loop takes the bias
// -7.4e-2 -> 2.8e-3. A non-repeating reference is what a real machine has, and this
// is what it costs. The Node harness measures the ceiling by feeding the loop the
// TRUTH: -8.9e-2 open -> -6.3e-2 with the rigid model -> -2.1e-3 closed.
check('flexisim/chain: every correction mode reaches the shoulder as a real pre-distortion',
  c2cl.ctl.active === 'closed' && Math.abs(c2cl.ctl.closedOff) > 1e-6,
  JSON.stringify(c2cl.ctl));
check('flexisim/chain: and the loop SETTLES rather than running to its clamp',
  Math.abs(c2cl.ctl.closedOff) < 0.02, `${c2cl.ctl.closedOff}`);
check('flexisim/chain: no correction makes the tool dramatically worse',
  Math.abs(c2ff.bias) < 2 * Math.abs(c2open.bias)
  && Math.abs(c2cl.win.bias) < 2 * Math.abs(c2open.bias),
  `${c2open.bias} -> ff ${c2ff.bias} / closed ${c2cl.win.bias}`);
await fx.selectOption('#ctl2-mode', 'open');

// ---- THE TABLE HAS TO ACTUALLY FILL, which for a long time it did not. The chain's
// settling loop was copied from the Move tab, where the scoring window is ONE move
// period, so clearing the window at every boundary it waits out is harmless. Here it
// is THREE periods, one period after the last clear left it a third full,
// `win2Stats().full` was false, and every row was silently dropped -- while every
// mode still ran and the badge still said "compare done". The passive path above has
// driven ~48000 steps by now, so a full window must have produced at least one row.
const c2board = (await fx.evaluate(() => window.__flxChainDbg())).board;
check('flexisim/chain: a full scoring window really produces a table row',
  Object.keys(c2board).length > 0, JSON.stringify(c2board).slice(0, 200));

// ---- MODE 4 ON THE CHAIN. The cheap half runs every time: the option is there and
// it REFUSES to engage without a fitted filter, which is the same discipline mode 3
// applies to an unlocked sensor. The expensive half -- commissioning, refining three
// moves, and scoring the lot -- is the full tier, because it is ~175 s of solver.
const c2modes = await fx.$$eval('#ctl2-mode option', (o) => o.map((x) => x.value));
check('flexisim/chain: the learned filter is offered as a fourth correction',
  c2modes.join(',') === 'open,ff,closed,learned', c2modes.join(','));
await fx.selectOption('#ctl2-mode', 'learned');
const c2gate = await fx.evaluate(() => window.__flxChainDbg());
check('flexisim/chain: …and is REFUSED until one has been fitted',
  c2gate.ctl.want === 'learned' && c2gate.ctl.active === 'open' && !c2gate.ff,
  JSON.stringify(c2gate.ctl));
check('flexisim/chain: input shaping is refused until the bending mode is measured',
  await fx.$eval('#shape2-on', (e) => e.disabled) && !c2gate.bend, 'shape2-on');
await fx.selectOption('#ctl2-mode', 'open');

// A SEQUENCE THAT CANNOT FAIL CAN ONLY LOOP, and until now nothing tested that. The
// chain deliberately has NO analytic fallback for its bending mode -- there is nothing
// honest to fall back to on a two-link tool mode -- so `finishComm2()` clears both the
// result and its own handle when `ringFit` fails. Every step here has the shape "if the
// result exists move on, else start the sub-task", so the next tick started it again:
// the arm settled, kicked and re-fitted for ever, the badge cycled through the phases,
// Run stayed disabled, and Stop was the only way out. The seam to force it
// (`__flxFailFit2`) has existed the whole time and was never used by a check.
{
  await fx.evaluate(() => { window.__flxFailFit2 = true; });
  await fx.click('#auto2');
  const ended = await fx.waitForFunction(() => !window.__flxChainDbg().auto,
    null, { timeout: 240000 }).then(() => true).catch(() => false);
  await fx.evaluate(() => { delete window.__flxFailFit2; });
  const badge = await fx.textContent('#state2-badge');
  console.log(`  flexisim/chain: with the ring fit forced to fail — ${ended ? 'stopped' : 'STILL RUNNING'}, badge "${badge}"`);
  check('flexisim/chain: a sub-task that cannot succeed STOPS the sequence rather than '
    + 'restarting it for ever', ended, `badge "${badge}"`);
  check('flexisim/chain: …and says which step could not be done',
    /bending mode/i.test(badge || ''), `badge "${badge}"`);
  // …AND IT LEAVES THE MACHINE WHERE IT FOUND IT: a stop during training used to leave
  // the commissioning dither running for ever, with the board frozen because no row may
  // be written while the sensor adapts.
  const after = await fx.evaluate(() => window.__flxChainDbg());
  check('flexisim/chain: …and unwinds the training it had turned on',
    !after.csTraining, `csTraining ${after.csTraining}`);
  await fx.click('#reset2');
  await fx.waitForFunction(() => window.__flxChainDbg() && !window.__flxChainDbg().auto
    && window.__flxChainDbg().k === 0, null, { timeout: 240000 });
}

if (FULL) {
  // THE WHOLE SEQUENCE, driven by the one button, and what is asserted is that each
  // stage produced the thing it exists to produce and that the winner was READ OFF
  // THE TABLE rather than assumed.
  await fx.click('#auto2');
  await fx.waitForFunction(() => !window.__flxChainDbg().auto, null, { timeout: 900000 });
  const a2 = await fx.evaluate(() => window.__flxChainDbg());
  const b2 = a2.board;
  console.log(`  flexisim/chain: auto-tune selected ${a2.ctl.want}, mode period `
    + `${a2.bend ? a2.bend.period.toFixed(0) : '—'}, board `
    + ['open', 'ff', 'learned', 'closed'].filter((m) => b2[m])
      .map((m) => `${m} ${b2[m].rms.toExponential(2)}`).join(' / '));
  check('flexisim/chain: auto-tune measures the bending mode from an unshaped kick',
    a2.bend && a2.bend.period > 200 && a2.bend.period < 4000 && a2.bend.peaks >= 4,
    JSON.stringify(a2.bend));
  check('flexisim/chain: …and turns the shaper on once it has one',
    a2.shaped === true, `shaped ${a2.shaped}`);
  check('flexisim/chain: …fits the learned filter and reports its size',
    a2.ff && a2.ff.ready && a2.ff.rows > 1000, JSON.stringify(a2.ff));
  check('flexisim/chain: …scores every mode, so the table is not empty',
    ['open', 'ff', 'learned', 'closed'].every((m) => b2[m]), JSON.stringify(Object.keys(b2)));
  // THE CLAIM, and it is about the OSCILLATION rather than the bias: the quasi-static
  // model and the closed loop both remove a bias and neither can touch a resonance,
  // so the learned filter is the only thing on this tab that moves this number.
  check('flexisim/chain: …and the learned filter beats the quasi-static model it sits on',
    b2.learned.rms < 0.9 * b2.ff.rms,
    `learned ${b2.learned.rms} vs model ${b2.ff.rms} vs open ${b2.open.rms}`);
  check('flexisim/chain: …by reducing the OSCILLATION, which nothing else here can',
    b2.learned.sd < 0.9 * b2.ff.sd && b2.learned.sd < 0.9 * b2.closed.sd,
    `learned ${b2.learned.sd} / model ${b2.ff.sd} / closed ${b2.closed.sd}`);
  check('flexisim/chain: …and selects the mode its own table scored best',
    a2.ctl.want === ['open', 'ff', 'learned', 'closed'].filter((m) => b2[m])
      .reduce((x, m) => (b2[m].rms < b2[x].rms ? m : x), 'open'),
    `${a2.ctl.want}`);
  const kP2 = (await fx.evaluate(() => window.__flxChainDbg())).k;
  await fx.waitForFunction((t) => window.__flxChainDbg().k > t, kP2 + 20000, { timeout: 300000 });
  const p2 = await fx.evaluate(() => window.__flxChainDbg());
  console.log(`  flexisim/chain: sensors locked at step "${p2.sensor.lockedAt.step}" after `
    + `${p2.sensor.lockedAt.trained} pairs, under ${p2.sensor.lockedAt.under}`);
  check('flexisim/chain: the LOCK is the last step of the sequence, not one in the middle',
    p2.sensor.lockedAt && p2.sensor.lockedAt.step === 'lock them', JSON.stringify(p2.sensor.lockedAt));
  check('flexisim/chain: …so the sensors keep learning past the target and top up',
    p2.sensor.lockedAt.already || p2.sensor.lockedAt.trained > 5000,
    `${p2.sensor.lockedAt.trained} pairs`);
  console.log(`  flexisim/chain: after auto-tune — running ${p2.ctl.active}, sensors under `
    + `${p2.ssUnder}, whole arm ${p2.sensor.scores.whole.toFixed(4)} vs naive `
    + `${p2.sensor.scores.naive.toFixed(4)}`);
  check('flexisim/chain: …commissions the tool sensors in the configuration it chose',
    p2.ssUnder === p2.ctl.active, `${p2.ssUnder} vs ${p2.ctl.active}`);
  check('flexisim/chain: …so the readout the user is left with is actually good',
    p2.sensor.scores.whole < 0.35 * p2.sensor.scores.naive,
    `${p2.sensor.scores.whole} vs naive ${p2.sensor.scores.naive}`);
  const off2At = (jerk) => fx.evaluate(async (j) => {
    const sl = document.getElementById('s-jerk2');
    sl.value = String(j);
    sl.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    const s = window.__flxOffSeries2(100000);
    const m = s.off.reduce((a, c) => a + c, 0) / s.off.length;
    const sd = Math.sqrt(s.off.reduce((a, c) => a + (c - m) ** 2, 0) / s.off.length);
    return { period: s.period, rough: s.rough, sd, ratio: s.rough / sd };
  }, jerk);
  await fx.selectOption('#ctl2-mode', 'ff');
  await fx.evaluate(() => {
    if (window.__flxChainDbg().running) document.getElementById('run2').click();
  });
  const j2Off = await off2At(0), j2On = await off2At(3);
  console.log(`  flexisim/chain: control roughness — jerk off ${j2Off.ratio.toExponential(2)}, `
    + `jerk 120 ${j2On.ratio.toExponential(2)} `
    + `(${(j2Off.ratio / j2On.ratio).toFixed(0)}x smoother)`);
  check('flexisim/chain: the jerk limit makes the shoulder correction smoother too',
    j2On.ratio < j2Off.ratio / 20, `${j2On.ratio} vs ${j2Off.ratio}`);
  check('flexisim/chain: …without shrinking it', j2On.sd > 0.75 * j2Off.sd,
    `${j2On.sd} vs ${j2Off.sd}`);
  await fx.selectOption('#ctl2-mode', 'open');

  // THE JERK CHECK ABOVE PAUSED THE RUN, so the scoring window is empty and the band
  // has nothing to draw. Resume and let it refill before asking the picture anything --
  // asserting on a window that was deliberately cleared is asserting on the test.
  await fx.evaluate(() => {
    if (!window.__flxChainDbg().running) document.getElementById('run2').click();
  });
  const kb = (await fx.evaluate(() => window.__flxChainDbg())).k;
  await fx.waitForFunction((t) => window.__flxChainDbg().k > t, kb + 16000, { timeout: 300000 });
  const g2 = await fx.evaluate(() => window.__flxChainDbg());
  console.log(`  flexisim/chain: drive rated ${(g2.drive.stats[0].tauMax / g2.drive.hold)
    .toFixed(0)}x hold, saturated ${(100 * g2.drive.stats[0].fraction).toFixed(1)}% / `
    + `${(100 * g2.drive.stats[1].fraction).toFixed(1)}%`);
  check('flexisim/chain: both joints have a rated drive that reports its demand',
    g2.drive.stats[0].tauMax > 0 && g2.drive.stats[0].peakDemand > 0
    && g2.drive.stats[1].peakDemand > 0, JSON.stringify(g2.drive.stats));
  check('flexisim/chain: …and it carries the shipped move without saturating',
    g2.drive.stats[0].fraction < 0.02 && g2.drive.stats[1].fraction < 0.02,
    `${g2.drive.stats[0].fraction} / ${g2.drive.stats[1].fraction}`);
  check('flexisim/chain: the stage bounds the magnified shake with the swept band',
    g2.geom && g2.geom.band && g2.geom.band.hi > g2.geom.band.lo,
    JSON.stringify(g2.geom && g2.geom.band));

  check('flexisim/chain: …and gives the manual controls back afterwards',
    await fx.$eval('#ctl2-mode', (e) => !e.disabled), 'ctl2-mode still disabled');
}

const painted2 = await fx.evaluate(() => {
  const c = document.getElementById('cv2');
  if (!c.width || !c.height) return { ok: false, why: 'zero-sized' };
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let lit = 0;
  for (let i = 0; i < d.length; i += 4 * 37) if (d[i] > 60 || d[i + 1] > 60) lit++;
  return { ok: lit > 20, lit };
});
check('flexisim/chain: the stage is painted', painted2.ok, JSON.stringify(painted2));
await fx.screenshot({ path: join(SHOTS, '06-flexisim-chain.png') });

// ---- THE BLACK BOX: the same arm, and a controller told nothing about it. Full tier
// only -- it holds the machine still, runs a step test, drives a 1400-sample probe and
// then a scored stretch, which is a few hundred thousand solver steps.
if (FULL) {
  await fx.click('.tab[data-tab="black"]');
  await fx.waitForFunction(() => window.__flxBBDbg && window.__flxBBDbg(),
    null, { timeout: 180000 });
  await fx.waitForFunction(() => window.__flxBBDbg().base != null, null, { timeout: 300000 });
  const bk0 = (await fx.evaluate(() => window.__flxBBDbg())).k;
  await fx.waitForFunction((t) => window.__flxBBDbg().k > t, bk0 + 30000, { timeout: 300000 });
  await fx.click('#bb-go');
  // COMMISSIONING IS LONGER NOW AND DELIBERATELY SO: the machine is HELD for the step test
  // AND the probe, then watched running for the disturbance map, then the correction is
  // deployed and MEASURED before it is kept. Four phases, not two.
  await fx.waitForFunction(() => window.__flxBBDbg().phase === 'correct',
    null, { timeout: 1500000 });
  const bk1 = (await fx.evaluate(() => window.__flxBBDbg())).k;
  await fx.waitForFunction((t) => window.__flxBBDbg().k > t, bk1 + 60000, { timeout: 600000 });
  const bbd = await fx.evaluate(() => window.__flxBBDbg());
  console.log(`  flexisim/blackbox: measured settling ${bbd.settleSteps} steps, DC gain `
    + `${bbd.dc.toFixed(2)} against an arm length of ${bbd.Larm} it was never told; `
    + `predicted ${bbd.design.predicted.toFixed(2)}x, MEASURED `
    + `${bbd.design.verified == null ? '—' : bbd.design.verified.toFixed(2) + 'x'}, achieved `
    + `${bbd.ratio.toFixed(2)}x, as a ${bbd.cost.kind} costing ${bbd.cost.mac} MAC/update `
    + `= ${bbd.cost.slicedMacPerCycle.toFixed(0)} MAC/cycle over the `
    + `${bbd.cost.cyclesPerUpdate} cycles between updates `
    + `(${(100 * bbd.cost.slicedMacPerCycle / bbd.cost.budget).toFixed(1)}% of 5% of a 1 ms `
    + `cycle), basis ${bbd.basis && bbd.basis.chosen}`);
  // WHAT IS ASSERTED IS THAT IT IDENTIFIED THE PLANT AND KNEW WHAT IT COULD DO -- not a
  // size of win. The win here is small and the module says so in advance, which is the
  // property worth pinning: a controller that is confident about a plant it cannot help
  // is the failure mode, and it is the one this whole tab is a check on.
  check('flexisim/blackbox: it measures the plant\'s own timescale from a step',
    bbd.settleSteps > 200 && bbd.settleSteps < 40000, `${bbd.settleSteps}`);
  check('flexisim/blackbox: …and recovers the ARM LENGTH it was never given',
    Math.abs(bbd.dc / bbd.Larm - 1) < 0.35, `${bbd.dc} vs ${bbd.Larm}`);
  check('flexisim/blackbox: …and an impulse response agreeing with it in sign and size',
    bbd.model && bbd.model.gain * bbd.dc > 0
    && Math.abs(bbd.model.gain / bbd.dc - 1) < 0.7, JSON.stringify(bbd.model));
  check('flexisim/blackbox: …and validates the PLANT model on held-out probe samples',
    bbd.plantR2 > 0.9, `plant model R2 ${bbd.plantR2}`);
  check('flexisim/blackbox: …then designs a feedforward that looks AHEAD of the command',
    bbd.design && bbd.design.previewSteps > 0 && bbd.design.alpha >= 0,
    JSON.stringify(bbd.design));
  // WHAT IT MEASURED ON THE MACHINE IS THE NUMBER THAT HAS TO BE HONEST, not what the
  // model predicted -- the model cannot check itself, which is the whole reason the
  // verify phase exists. Measured on this page: predicted and achieved have disagreed by
  // 8x while every other number looked right.
  check('flexisim/blackbox: …and what it MEASURED on the machine is what it achieves',
    bbd.design.verified != null
    && Math.abs(Math.log(bbd.ratio / bbd.design.verified)) < Math.log(1.6),
    `verified ${bbd.design.verified}, achieved ${bbd.ratio}`);
  // AND IT HAS TO FIT A PLC CYCLE, which is a hard number rather than an aspiration.
  check('flexisim/blackbox: …in an arithmetic budget a 1 ms PLC task can afford',
    bbd.cost && bbd.cost.fits && bbd.cost.mac > 0,
    `${bbd.cost && bbd.cost.mac} MAC against ${bbd.cost && bbd.cost.budget}`);
  check('flexisim/blackbox: …without making the machine worse', bbd.ratio > 0.95,
    `${bbd.ratio}`);
  // AND WHAT THE CORRECTION COSTS THE MACHINE, which no tracking number can express.
  // Before the correction was reconstructed at the solver's rate it was designed on a
  // grid of 50 steps and HELD between updates, so the commanded motor position came out
  // 6354x rougher than the bare reference and the drive torque 53x rougher — for 3.68x of
  // tracking, with the ENCODER coming out SMOOTHER than with no correction at all,
  // because the servo could not follow a staircase and the drive was spending all of it
  // moving nothing. Every functional check passed throughout.
  if (bbd.smooth && bbd.smooth.cmd && bbd.smooth.ref) {
    const q = bbd.smooth.cmd / bbd.smooth.ref;
    const t = bbd.smooth.base && bbd.smooth.base.tau
      ? bbd.smooth.tau / bbd.smooth.base.tau : null;
    console.log(`  flexisim/blackbox: command second difference ${q.toFixed(0)}x the bare `
      + `reference's${t != null ? `, torque ${t.toFixed(1)}x the uncorrected machine's` : ''}`);
    check('flexisim/blackbox: …and the command it hands the drive is one the drive can '
      + 'follow', q < 800, `${q.toFixed(0)}x the bare reference (a HELD correction is 6354x)`);
  }
  // …AND THE LADDER MEASURED IT, which is what lets the choice between designs be made on
  // both halves. The rule is the same knee the rest of the module uses: among the trials
  // within 5% of the best MEASURED tracking, the smoothest.
  if (bbd.design && bbd.design.trials && bbd.design.trials.length) {
    // The zero rung is the instrument, not a candidate — see BlackBox._verify().
    const tr = bbd.design.trials.filter((x) => !x.zero);
    const bestR = Math.max(...tr.map((x) => x.ratio));
    const bandMin = Math.min(...tr.filter((x) => x.ratio >= 0.95 * bestR).map((x) => x.curv));
    const dep = tr.find((x) => x.kind === (bbd.design.kind === 'constrained' ? 'mpc' : 'fir')
      && x.scale === bbd.design.scale);
    check('flexisim/blackbox: …and the trial ladder scored smoothness alongside tracking',
      tr.every((x) => Number.isFinite(x.curv)) && (!dep || dep.curv <= bandMin * 1.0000001),
      tr.map((x) => `${x.kind}${x.gentle ? '-g' : ''} ${x.ratio.toFixed(2)}x `
        + `curv ${x.curv.toExponential(2)}`).join(' · '));
  }
  // THE PICTURE HAS TO STAY ON THE STAGE, which "it is painted" cannot see. Once the
  // correction became a large deliberate quantity, running it through the deflection
  // magnifier drew the arm several radians off the canvas — no error, nothing blank, and
  // every functional check still green.
  check('flexisim/blackbox: …and the tool is drawn ON the stage, not off it',
    bbd.drawn && bbd.drawn.x >= 0 && bbd.drawn.x <= bbd.drawn.w
    && bbd.drawn.y >= 0 && bbd.drawn.y <= bbd.drawn.h,
    JSON.stringify(bbd.drawn));
  // …AND THE ESTIMATE IS DRAWN ON THE TOOL, which is the picture's whole claim about the
  // soft sensor and is a statement about GEOMETRY that no functional check can make.
  // Reported from the device as the estimate looking "really bad": the ring carried the
  // encoder's own offset, which this tab's correction deliberately drives to a fifth of
  // the move, so a model scoring nRMSE ~0.06 was drawn eight arm-lengths from the tool.
  // The CHART had the same two numbers on top of each other the whole time — two views of
  // one quantity cannot disagree, and that is what said the stage was the wrong one.
  check('flexisim/blackbox: …and the estimate is drawn ON the tool, as its score says',
    bbd.drawnEst && bbd.drawnEst.sep < 0.15,
    `${bbd.drawnEst && bbd.drawnEst.sep} of an arm length apart`);
  // THE CORRECTION'S SHARE OF THE DRIVE IS WHAT IS LEFT AFTER THE MOVE, AT 80% OF IT. The
  // whole rating is a number the drive cannot deliver while it is also running the
  // trajectory, and this page measured that before it fixed it: at a 6x rating the
  // correction reached 0.78 of the limit it had been handed and the drive was still
  // limited on 16% of steps.
  check('flexisim/blackbox: the correction is limited to 80% of what the drive has SPARE',
    bbd.headroom && bbd.headroom.peak > 0 && bbd.headroom.spare > 0
    && bbd.headroom.spare === bbd.headroom.tauMax - bbd.headroom.peak
    && Math.abs(bbd.headroom.offset
      / (0.8 * bbd.headroom.spare / bbd.headroom.kp) - 1) < 1e-12
    && bbd.headroom.offset < bbd.headroom.whole,
    JSON.stringify(bbd.headroom));
  // …AND ZERO MEANS ZERO. The sentinel for "no limit supplied" used to be 0, which is also
  // the honest answer when the trajectory is already using the whole actuator — so a host
  // that meant "nothing left" was read as meaning "unlimited", the exact opposite.
  check('flexisim/blackbox: …and a supplied limit of zero is a LIMIT, not an absence',
    await fx.evaluate(async () => {
      const { BlackBox } = await import('/lib/blackbox/blackbox.js');
      return new BlackBox({ ref: () => 0, sampleEvery: 1, correctionLimit: 0 })
        .correctionLimit === 0;
    }));

  // THE SCREENSHOT IS TAKEN HERE, WHILE THE TAB IS STILL COMMISSIONED. The jerk-limit
  // check below deliberately rebuilds the page, and a shot taken after it shows an
  // uncommissioned tab a few hundred steps old — no correction, no estimate, nothing the
  // visual review exists to look at. The artefact has to show the state the checks were
  // about.
  await fx.screenshot({ path: join(SHOTS, '07-flexisim-blackbox.png') });

  // THE JERK LIMIT IS A DIFFERENT COMMAND, so it throws the commissioning away. A map
  // fitted from a command window to what the machine does is a map of a command that no
  // longer exists.
  const beforeJerk = { period: bbd.period, jerk: bbd.jerk };
  await fx.evaluate(() => {
    const el = document.getElementById('s-jerk3');
    el.value = String(+el.value === 7 ? 0 : 7);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await fx.waitForFunction(() => window.__flxBBDbg() && window.__flxBBDbg().phase === 'idle',
    null, { timeout: 120000 });
  const afterJerk = await fx.evaluate(() => window.__flxBBDbg());
  console.log(`  flexisim/blackbox: jerk ${beforeJerk.jerk} → ${afterJerk.jerk} steps, move `
    + `period ${beforeJerk.period} → ${afterJerk.period}, correction limit `
    + `${bbd.headroom.offset.toExponential(3)} → ${afterJerk.headroom.offset.toExponential(3)}`);
  check('flexisim/blackbox: the jerk limit really changes the command it is given',
    afterJerk.jerk !== beforeJerk.jerk && afterJerk.period !== beforeJerk.period,
    `${JSON.stringify(beforeJerk)} → ${JSON.stringify({ period: afterJerk.period, jerk: afterJerk.jerk })}`);
  check('flexisim/blackbox: …and throws the commissioning away, because the map was of the '
    + 'old one', afterJerk.phase === 'idle' && afterJerk.design == null,
    `${afterJerk.phase}`);
  // THE SETTLE IS THE SAME KIND OF CONTROL AND HAS TO BEHAVE THE SAME WAY: it lengthens
  // the dwell, which is a different command, so the commissioning goes with it.
  const beforeSettle = { period: afterJerk.period, settle: afterJerk.settle };
  await fx.evaluate(() => {
    const el = document.getElementById('s-settle3');
    el.value = String(+el.value === 5 ? 0 : 5);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await fx.waitForFunction(() => window.__flxBBDbg() && window.__flxBBDbg().phase === 'idle',
    null, { timeout: 120000 });
  const afterSettle = await fx.evaluate(() => window.__flxBBDbg());
  console.log(`  flexisim/blackbox: settle ${beforeSettle.settle} → ${afterSettle.settle} `
    + `ring, move period ${beforeSettle.period} → ${afterSettle.period}`);
  check('flexisim/blackbox: the settle really lengthens the dwell between moves',
    afterSettle.settle !== beforeSettle.settle
    && afterSettle.period !== beforeSettle.period
    && (afterSettle.settle > beforeSettle.settle) === (afterSettle.period > beforeSettle.period),
    `settle ${beforeSettle.settle} → ${afterSettle.settle}, period `
    + `${beforeSettle.period} → ${afterSettle.period}`);

  const paint3 = await fx.evaluate(() => {
    const c = document.getElementById('cv3');
    if (!c.width || !c.height) return { ok: false };
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4 * 37) if (d[i] > 60 || d[i + 1] > 60) lit++;
    return { ok: lit > 20, lit };
  });
  check('flexisim/blackbox: the stage is painted', paint3.ok, JSON.stringify(paint3));
}

// ---- EVERY PLOTLY CONTAINER NEEDS ITS HEIGHT FROM CSS, and one that does not STROBES.
// Reported from the device as the Black box tab freaking out; measured, every element on
// that tab moved ~8 times a second. With no CSS height the container's height comes from
// its CONTENT, which Plotly is creating, so Plotly renders at its own default, the
// container grows to match, `responsive:true` sees a resize and re-renders, and the two
// chase each other. The tab's logic was fine and its stylesheet was one selector short.
// This reads the ids straight out of the page's own Plotly.newPlot calls, so a chart
// added to any tab in future is covered without anyone remembering to list it here.
const plotIds = await fx.evaluate(async () => {
  const src = await (await fetch(location.pathname, { cache: 'no-store' })).text();
  return [...src.matchAll(/Plotly\.newPlot\(\s*'([^']+)'/g)].map((m) => m[1]);
});
const plotSized = await fx.evaluate((ids) => ids.map((id) => {
  const el = document.getElementById(id);
  if (!el) return { id, ok: false, why: 'missing' };
  const h = getComputedStyle(el).height;
  return { id, ok: /^\d/.test(h) && parseFloat(h) > 20, h };
}), plotIds);
console.log(`  flexisim: chart containers — ${plotSized.map((x) => `${x.id} ${x.h}`).join(', ')}`);
check('flexisim: every Plotly container gets its height from CSS, so none can strobe',
  plotIds.length >= 5 && plotSized.every((x) => x.ok),
  JSON.stringify(plotSized.filter((x) => !x.ok)));

// …AND THE WIDTH, WHICH IS THE SAME DEFECT IN THE OTHER AXIS AND WAS WORSE. Plotly sizes
// against the container it is handed, and a `display:none` container has no width — so
// every chart on this page was created at Plotly's 700px default inside a 388px box, and
// with `body{overflow-x:hidden}` the right 45% of it was invisible AND unreachable. It
// corrected itself only if the user left the tab and came back, which fires the resize,
// so a check that visited each tab once and looked would have seen it and a check that
// navigated twice would not. Asserted as GEOMETRY — a chart wider than its own box —
// rather than as "a chart exists", which is the rule this page keeps re-learning.
const plotWide = [];
for (const [tab, ids] of [['move', ['err-chart', 'ss-chart']],
  ['chain', ['chain-pos', 'chain-chart', 'cs-chart']], ['black', ['bb-chart']]]) {
  await fx.click(`.tab[data-tab="${tab}"]`);
  await fx.waitForTimeout(400);
  plotWide.push(...await fx.evaluate((xs) => xs.map((id) => {
    const el = document.getElementById(id);
    if (!el || !el.classList.contains('on')) return { id, ok: true, why: 'not drawn yet' };
    const svg = el.querySelector('.main-svg');
    return { id, ok: el.scrollWidth <= el.clientWidth + 2
      && (!svg || svg.clientWidth <= el.clientWidth + 2),
      w: el.clientWidth, sw: el.scrollWidth, svg: svg ? svg.clientWidth : null };
  }), ids));
}
console.log('  flexisim: chart widths — '
  + plotWide.map((x) => `${x.id} ${x.w}/${x.sw}${x.svg ? `/svg ${x.svg}` : ''}`).join(', '));
check('flexisim: …and its width, so no chart is drawn wider than the box it sits in',
  plotWide.every((x) => x.ok), JSON.stringify(plotWide.filter((x) => !x.ok)));
// AND THE PAGE ITSELF MUST NOT OVERFLOW, which is the symptom a user actually meets.
const overflow = await fx.evaluate(() => ({
  doc: document.documentElement.scrollWidth, win: window.innerWidth }));
check('flexisim: …and the page does not scroll sideways on a phone',
  overflow.doc <= overflow.win + 2, JSON.stringify(overflow));
await fx.click('.tab[data-tab="move"]');

// The in-browser Verify tab runs the same closed forms against the same modules.
await fx.click('.tab[data-tab="verify"]');
await fx.click('#verify-run');
await fx.waitForSelector('#verify-out table', { timeout: 60000 });
const vres = await fx.$$eval('#verify-out tbody tr, #verify-out table tr',
  (rs) => rs.slice(1).map((r) => r.cells[0].textContent.trim()[0]));
check('flexisim: every in-browser closed-form check passes',
  vres.length > 4 && vres.every((c) => c === '\u2713'), vres.join(''));

// The page's OWN error buffer, which is the instrument that has caught what
// pageerror cannot: neither it nor a console listener sees an unhandled rejection.
const fxBuf = await fx.evaluate(() => window.__dbg.buffer().filter((e) => e.type === 'error'));
check('flexisim: the page reports no errors of its own', fxBuf.length === 0,
  JSON.stringify(fxBuf).slice(0, 300));
await fx.close();
}   // end AREA-gated flexisim page

// OUTSIDE the gate: it was inside on the first attempt, which meant that
// skipping FlowSim left the browser open and the process hanging rather than
// failing -- the worst available outcome for a change whose whole purpose is to
// make the suite finish sooner.
await browser.close();

section('end');
console.log('\nSection timings (s):');
for (const [n, ms] of timings.filter((t) => t[1] > 400)) console.log(`  ${String(Math.round(ms / 1000)).padStart(5)}  ${n}`);
console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${failed} check(s) failed. Screenshots in test/screenshots/\n`);
process.exit(failed === 0 ? 0 : 1);
