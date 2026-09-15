/**
 * @file ONE APPEND, FOR ANY INSTRUMENT THAT WANTS TO BE READ BACK (plan §90.1).
 *
 * `distilkit.emitRow` established the pattern §87.1 needed — a harness EMITS its row where it
 * measured it and a table READS them back, so a summary costs no plant time and cannot disagree
 * with the run that produced it (rule 30). But that helper takes a ladder's `rep` and `auto`, and
 * the SCREENS have neither: `invert.mjs` measures a plant's step response and `disscreen.mjs`
 * decomposes its open-loop error, and neither commissions anything.
 *
 * So the append is here, dependency-free, and `distilkit` is not dragged into two instruments that
 * want none of it. It is eleven lines because that is all the pattern is; what makes it worth a
 * module is that the THIRD copy of a file append is where the paths drift.
 */
import fs from 'fs';

/**
 * Append one JSON row to `<dir>/<file>` when `dir` is set, and do nothing at all when it is not —
 * so every existing run of every caller is byte-identical (rule 21).
 * @param {string|undefined} dir   the directory, normally an env var the caller reads
 * @param {string} file            the file within it, e.g. 'screen.jsonl'
 * @param {object} row             the row; the caller decides its shape
 */
function emitTo(dir, file, row) {
  if (!dir) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(`${dir}/${file}`, JSON.stringify(row) + '\n');
  } catch (e) { console.log(`  (${file} row not emitted: ${e.message})`); }
}

/** Read back what `emitTo` wrote, newest-wins per `key`, or [] when there is nothing. */
function readFrom(dir, file, key = 'name') {
  if (!dir) return [];
  let txt = '';
  try { txt = fs.readFileSync(`${dir}/${file}`, 'utf8'); } catch { return []; }
  const byKey = new Map();
  for (const line of txt.split('\n')) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); byKey.set(r[key], r); } catch { /* a torn line is not a row */ }
  }
  return [...byKey.values()];
}

export { emitTo, readFrom };
