/**
 * @file The stored ILC tables — the exact per-scan correction the bench arm needs on six programs,
 * learned lap by lap on the machine. Load them to fit or test a model that must reproduce the
 * correction on programs it was not fitted on, without spending the ~25 minutes of simulation that
 * generating them costs. Each table's bytes are checked against the manifest's sha256.
 *
 *   const tabs = ilcTables();   // [{ file, shape, feed, lap, ref, U, bareRms, learnedRms, factor }]
 *   tabs[0].ref[2 * k + j]      // the joint program at scan k, joint j (rad)
 *   tabs[0].U[2 * k + j]        // the learned setpoint trim at scan k, joint j (rad)
 *
 * `refMismatch(table, prog)` is the largest difference between a table's stored program and a live
 * one (Infinity if the lengths differ): the tables are stale the moment the bench machine's
 * programs move, and `test/flexisim/bench.test.mjs` asserts they have not.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const dir = new URL('.', import.meta.url);
export const ilcManifest = () => JSON.parse(readFileSync(new URL('manifest.json', dir)));

export function ilcTables() {
  return ilcManifest().tables.map((t) => {
    const buf = readFileSync(new URL(t.file, dir));
    const sha = createHash('sha256').update(buf).digest('hex');
    if (sha !== t.sha256) throw new Error(`ilc-tables: ${t.file} does not match its manifest (sha256)`);
    if (buf.length !== 32 * t.lap) throw new Error(`ilc-tables: ${t.file} is ${buf.length} bytes, expected ${32 * t.lap}`);
    const all = new Float64Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
    return { ...t, ref: all.subarray(0, 2 * t.lap), U: all.subarray(2 * t.lap) };
  });
}

export function refMismatch(table, prog) {
  if (prog.lap !== table.lap) return Infinity;
  let d = 0;
  for (let k = 0; k < table.lap; k++) {
    const r = prog.at(k);
    d = Math.max(d, Math.abs(r[0] - table.ref[2 * k]), Math.abs(r[1] - table.ref[2 * k + 1]));
  }
  return d;
}
