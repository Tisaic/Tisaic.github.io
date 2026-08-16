// The lattice stencil itself. A mistyped weight produces a simulation that
// runs, looks like fluid, and solves the wrong equations -- so the isotropy
// conditions that put D3Q19 in the Navier-Stokes limit are asserted directly.
import { Q, C, W, OPP, CS2, feq, momentResiduals, wgslConstants } from '../../lib/lattsim/d3q19.js';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\nlattsim: D3Q19 velocity set');

check('19 velocities and 19 weights', C.length === Q && W.length === Q);

const r = momentResiduals();
check('sum of weights is 1', r.mass < 1e-15, r.mass);
check('first moment vanishes (no preferred direction)', r.momentum < 1e-15, r.momentum);
check('second moment is cs^2 * I (isotropy)', r.stress < 1e-15, r.stress);
check('cs^2 = 1/3', Math.abs(CS2 - 1 / 3) < 1e-15);

check('every velocity has its opposite', OPP.every((o, q) =>
  C[o][0] === -C[q][0] && C[o][1] === -C[q][1] && C[o][2] === -C[q][2]), OPP.join(','));
check('opposite is an involution', OPP.every((o, q) => OPP[o] === q));
check('rest velocity is its own opposite', OPP[0] === 0);

// Squared lengths: one rest, six axis (1), twelve diagonal (2). Anything else
// is not D3Q19.
const lens = C.map((c) => c[0] * c[0] + c[1] * c[1] + c[2] * c[2]);
check('speeds are 0 x1, 1 x6, 2 x12',
  lens.filter((l) => l === 0).length === 1
  && lens.filter((l) => l === 1).length === 6
  && lens.filter((l) => l === 2).length === 12, lens.join(','));
check('no duplicate velocities', new Set(C.map((c) => c.join(','))).size === Q);

// Equilibrium must reproduce the moments it was built from, for any state a
// solver will actually pass it.
for (const [rho, ux, uy, uz] of [[1, 0, 0, 0], [1.05, 0.08, -0.03, 0.02], [0.9, -0.1, 0.05, 0.07]]) {
  let m0 = 0, mx = 0, my = 0, mz = 0;
  for (let q = 0; q < Q; q++) {
    const v = feq(q, rho, ux, uy, uz);
    m0 += v; mx += v * C[q][0]; my += v * C[q][1]; mz += v * C[q][2];
  }
  const tag = `(rho=${rho}, u=[${ux},${uy},${uz}])`;
  check(`equilibrium recovers density ${tag}`, Math.abs(m0 - rho) < 1e-12, m0 - rho);
  check(`equilibrium recovers momentum ${tag}`,
    Math.abs(mx - rho * ux) < 1e-12 && Math.abs(my - rho * uy) < 1e-12 && Math.abs(mz - rho * uz) < 1e-12,
    [mx - rho * ux, my - rho * uy, mz - rho * uz].join(','));
}

// The WGSL generator is the mechanism that stops the shader carrying its own
// copy of the constants. If it stops emitting them, the two backends are free
// to disagree, so its output is asserted rather than assumed.
const src = wgslConstants();
// vec3<i32>( with a paren is a constructed value; the bare vec3<i32>, in the
// array type parameter must not be counted.
check('WGSL constants emit all 19 velocities', (src.match(/vec3<i32>\(/g) || []).length === Q,
  String((src.match(/vec3<i32>\(/g) || []).length));
check('WGSL constants emit all 19 weights + opposites',
  /const WT : /.test(src) === false && /WT = array<f32, 19>/.test(src) && /OPP = array<u32, 19>/.test(src));
check('WGSL weights are full precision (not rounded to 1/18 ~ 0.056)',
  /0\.0555555555555555[0-9]/.test(src), src.slice(src.indexOf('WT')).slice(0, 120));

console.log(failed ? `\n  ${failed} check(s) failed\n` : '  all checks passed\n');
process.exit(failed ? 1 : 0);
