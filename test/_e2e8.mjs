import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 412, height: 915 } });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
p.on('console', m => { if (m.type()==='error') errs.push('CONSOLE ' + m.text().slice(0,300)); });
await p.goto('http://127.0.0.1:8137/flexisim.html', { waitUntil: 'load' });
await p.click('.tab[data-tab="path"]');
await p.waitForFunction(() => window.__flxPathDbg && window.__flxPathDbg(), null, {timeout:180000});
const D = () => p.evaluate(() => window.__flxPathDbg());

// 1) the setup button
await p.evaluate(() => { const e=document.getElementById('ctlP'); e.value='stack';
  e.dispatchEvent(new Event('change',{bubbles:true})); });
await p.click('#stk-setup');
await p.waitForFunction(() => { const d=window.__flxPathDbg(); return d && !d.busy && Math.abs(d.K-1)<1e-9; }, null, {timeout:180000});
console.log('after setup:', JSON.stringify(await D().then(d=>({K:d.K,E:d.E,shape:d.shape,mode:d.mode,want:d.want,stack:d.stack}))));

await p.evaluate(() => { document.getElementById('s-spfP').value = '300'; });

// 2) Commission (compliance)
await p.click('#commP');
await p.waitForFunction(() => { const d=window.__flxPathDbg(); return d && d.c && !d.busy; }, null, {timeout:600000});
console.log('after compliance:', JSON.stringify(await D().then(d=>({c:d.c,want:d.want,mode:d.mode}))));

// 3) Commission pilot
await p.click('#pilotP-btn');
await p.waitForFunction(() => { const d=window.__flxPathDbg(); return d && d.pilot && d.pilot.verdict && !d.busy; }, null, {timeout:1800000});
console.log('after pilot:', JSON.stringify(await D().then(d=>({verdict:d.pilot.verdict,want:d.want,stack:d.stack}))));

// 4) select mode 8 and run laps in three configs
async function score(comp, pilot, label) {
  await p.evaluate(([c,pl]) => {
    document.getElementById('stk-comp').checked = c;
    document.getElementById('stk-pilot').checked = pl;
    const e=document.getElementById('ctlP'); e.value='stack';
    e.dispatchEvent(new Event('change',{bubbles:true}));
  }, [comp,pilot]);
  const l0 = (await D()).lap;
  if (!(await D()).running) await p.click('#runP');
  await p.waitForFunction((t)=>window.__flxPathDbg().lap > t, l0+2, {timeout:600000});
  const l1 = (await D()).lap;
  await p.waitForFunction((t)=>window.__flxPathDbg().lap > t, l1, {timeout:600000});
  const d = await D();
  console.log(`  ${label}: mode=${d.mode} contour=${d.lapScore.contourRms.toExponential(3)} uPk=${(d.pilot&&d.pilot.uPeak)||'-'} stack=${JSON.stringify(d.stack)}`);
  return d.lapScore.contourRms;
}
// THE DEDICATED MODES ON THE SAME COMMISSIONED MACHINE. If ③ alone and ⑧'s comp-only
// half disagree, ⑧'s wiring is wrong; if they AGREE and both lose to Node's 4.12e-1,
// the page's compliance identification is the thing that differs, not the stack.
async function scoreMode(v, label) {
  await p.evaluate((m) => { const e=document.getElementById('ctlP'); e.value=m;
    e.dispatchEvent(new Event('change',{bubbles:true})); }, v);
  const l0=(await D()).lap;
  if (!(await D()).running) await p.click('#runP');
  await p.waitForFunction((t)=>window.__flxPathDbg().lap>t+1,l0,{timeout:600000});
  const l1=(await D()).lap;
  await p.waitForFunction((t)=>window.__flxPathDbg().lap>t,l1,{timeout:600000});
  const d=await D();
  console.log(`  ${label}: mode=${d.mode} contour=${d.lapScore.contourRms.toExponential(3)}`);
  return d.lapScore.contourRms;
}
const m3 = await scoreMode('ident','③ compliance alone');
const m5 = await scoreMode('pilot','⑤ pilot alone');
const both = await score(true,true,'8 both');
const co   = await score(true,false,'8 comp only');
const po   = await score(false,true,'8 pilot only');
await p.evaluate(()=>{const e=document.getElementById('ctlP'); e.value='open'; e.dispatchEvent(new Event('change',{bubbles:true}));});
const l0=(await D()).lap; await p.waitForFunction((t)=>window.__flxPathDbg().lap>t+1,l0,{timeout:600000});
const op=(await D()).lapScore.contourRms;
console.log(`\nRESULT open=${op.toExponential(3)} ③=${m3.toExponential(3)} ⑤=${m5.toExponential(3)} ⑧both=${both.toExponential(3)} ⑧comp=${co.toExponential(3)} ⑧pilot=${po.toExponential(3)}`);
console.log(`  ③ vs ⑧comp ${(m3/co).toFixed(3)}  |  ⑤ vs ⑧pilot ${(m5/po).toFixed(3)}  (1.000 = the halves match the dedicated modes)`);
console.log(`  both vs open ${(op/both).toFixed(2)}x | comp ${(op/co).toFixed(2)}x | pilot ${(op/po).toFixed(2)}x`);
const buf = await p.evaluate(() => (window.__consoleBuf&&window.__consoleBuf())||null);
console.log('page errors:', JSON.stringify(errs.slice(0,10)));
await b.close();
