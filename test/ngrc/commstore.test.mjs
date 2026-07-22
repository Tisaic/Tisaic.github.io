// Validates lib/ngrc/commstore.js against golden vectors — especially the
// BigInt checksum's bit-exact reproducibility and the fail-safe load paths.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { CommStore } from '../../lib/ngrc/commstore.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const g = JSON.parse(readFileSync(join(HERE, 'golden', 'commstore.json'), 'utf8'));

const TOL = 1e-12;
let failed = 0, checks = 0;
const approx = (a, b) => Math.abs(a - b) <= TOL + TOL * Math.abs(b);
const arrEq = (a, b) => a.length === b.length && a.every((v, i) => approx(v, b[i]));
function check(name, cond, detail) {
  checks++;
  if (!cond) { failed++; console.log(`  ✗ ${name}${detail ? '  → ' + detail : ''}`); }
}

console.log('\nNGRC CommStore — golden-vector parity\n');

const { sig, theta, norm } = g;
const mk = () => { const c = new CommStore(sig, { recommissionSustain: 5 }); c.register('theta', theta.length); c.register('norm', norm.length); return c; };

const cs = new CommStore(sig, { qualityFloor: 85.0, driftLimit: 40.0, saveOnChange: 1e-3, recommissionSustain: 5 });
cs.register('theta', theta.length); cs.register('norm', norm.length);
cs.capture({ theta, norm }, 97.5, 42);
const blob = cs.toBlob();
check('checksum matches Python', blob.checksum === g.blob_checksum, `${blob.checksum} vs ${g.blob_checksum}`);

const cs2 = mk();
const [okGood, reasonGood] = cs2.load(blob);
check('load good', okGood === g.load_good[0] && reasonGood === g.load_good[1]);
check('checksum after load', cs2.checksum === g.checksum);
check('restored theta', arrEq(cs2.restore('theta'), g.restored_theta));

const badPayload = [...blob.payload]; badPayload[0] += 1e-6;
const [okBad, reasonBad] = mk().load({ ...blob, payload: badPayload });
check('load corrupt → fail', okBad === g.load_bad[0] && reasonBad === g.load_bad[1], reasonBad);

const cs4 = new CommStore(sig ^ 0x1, { recommissionSustain: 5 });
cs4.register('theta', theta.length); cs4.register('norm', norm.length);
const [okSig, reasonSig] = cs4.load(blob);
check('load wrong sig → fail', okSig === g.load_sig[0] && reasonSig === g.load_sig[1], reasonSig);

let monFail = 0;
for (let i = 0; i < 7; i++) {
  const rc = cs.monitor(80.0, 10.0, false);
  const e = g.monitor[i];
  if (!(rc === e.recommission && cs.state === e.state && cs.recommissionReason === e.reason)) monFail++;
}
check('monitor hysteresis', monFail === 0, `${monFail} mismatched`);

cs.state = 1;
const saved1 = cs.maybeAutosave({ theta, norm }, 90.0);
const theta2 = [...theta]; theta2[0] += 5e-3;
const saved2 = cs.maybeAutosave({ theta: theta2, norm }, 90.0);
check('autosave throttle', saved1 === g.saved1 && saved2 === g.saved2, `${saved1},${saved2}`);

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${checks - failed}/${checks} checks passed\n`);
process.exit(failed === 0 ? 0 : 1);
