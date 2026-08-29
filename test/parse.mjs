// Parse every shipped module AS A MODULE.
//
// WHY THIS EXISTS, and it is not a formality. The project's static check was
// `node --check <file>`, which parses a `.js` file as a CommonJS SCRIPT -- and it
// PASSES on a duplicate `const` in one scope, which is a hard SyntaxError in an ES
// module. Verified on a four-line reproduction: `node --check` accepts it,
// `vm.SourceTextModule` and `import()` both reject it.
//
// The consequence was not a clear error. An unparseable `webgpu.js` cannot be
// imported, so `WebGPUBackend` silently became unavailable, the page fell back to
// the CPU reference, and the CPU reference refused the default lattice as too
// large. What the badge said was "build failed -- CPU reference backend is capped
// at 131072 cells", three layers from the cause, with the real error visible
// nowhere: `simulation.js` catches an import failure on purpose, because that is
// also what a browser without WebGPU looks like.
//
// Run with: node --experimental-vm-modules test/parse.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { SourceTextModule } from 'node:vm';

const ROOT = new URL('..', import.meta.url).pathname;
let failed = 0;

function check(name, src) {
  try {
    // PARSE ONLY. Importing would also run top-level code, which for a page
    // script means touching a DOM that does not exist here.
    new SourceTextModule(src, { identifier: name });
    return true;
  } catch (e) {
    console.log(`  ✗ ${name}: ${e.message}`);
    failed++;
    return false;
  }
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (entry.endsWith('.js') || entry.endsWith('.mjs')) out.push(p);
  }
  return out;
}

console.log('\nmodule parse');

// Shipped libraries and the dev experiments. `vendor/` is excluded: it is
// third-party UMD, not our modules, and it is not ours to parse as one.
let n = 0;
for (const dir of ['lib', 'experiments']) {
  for (const file of walk(join(ROOT, dir))) {
    if (check(relative(ROOT, file), readFileSync(file, 'utf8'))) n++;
  }
}

// The pages' inline scripts, which are `type="module"` and carry most of the app.
const SCRIPT = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g;
for (const page of ['index.html', 'flowsim.html', 'ngrc.html', 'flexisim.html']) {
  const html = readFileSync(join(ROOT, page), 'utf8');
  let m, i = 0;
  while ((m = SCRIPT.exec(html))) {
    i++;
    if (!m[1].trim()) continue;
    if (check(`${page} inline script ${i}`, m[1])) n++;
  }
}

// ---------------------------------------------------------------------------
// AND NO SHIPPED MODULE MAY REACH FOR A NODE GLOBAL.
//
// PARSING IS NOT ENOUGH: `process.env.X` parses perfectly and throws
// `process is not defined` the moment a browser reaches that line. One did.
// `pilot.js` read an env var to make a ridge penalty adjustable for a single
// Node measurement, and because the line sits on the FIT path rather than the
// excite path, ⑤ ran happily in the browser for tens of thousands of steps and
// died the instant it stopped exciting and started solving. ⑨'s pilot rung
// inherited it, since both drive the same `Pilot`.
//
// NOTHING REPORTED IT. The page's frame loop catches, so the throw became a
// badge; the smoke check waited out its 900-second timeout and reported a
// TimeoutError naming no cause; and the Node tests could not see it at all,
// because in Node the global exists. A defect invisible to the Node half, and
// reported by the browser half only as a timeout, is one that ships.
//
// This is the cheap static check that closes the class. `typeof process` is
// allowed — that is the guard, not the hazard.
const NODE_GLOBALS = ['process', 'require', '__dirname', '__filename'];
let leaks = 0;
for (const file of walk(join(ROOT, 'lib'))) {
  const src = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file);
  src.split('\n').forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');
    for (const g of NODE_GLOBALS) {
      const re = new RegExp(`(^|[^\\w.$'"\`])${g}\\s*[.([]`);
      if (!re.test(code)) continue;
      if (new RegExp(`typeof\\s+${g}`).test(code)) continue;   // the guard itself
      console.log(`  ✗ ${rel}:${i + 1}: bare Node global \`${g}\` — this file ships to a browser`);
      console.log(`      ${line.trim().slice(0, 100)}`);
      leaks++;
    }
  });
}
if (!leaks) console.log(`  ✓ no shipped module reaches for a Node global`);

console.log(failed ? `\n${failed} module(s) failed to parse\n` : `  ✓ ${n} modules parse\n`);
process.exit(failed || leaks ? 1 : 0);
