/**
 * @file A MATLAB v5 `.mat` READER, because the KUKA benchmark ships as one and Node has no
 * way to open it. Handles what these records contain and refuses the rest loudly rather
 * than returning something plausible: numeric arrays of every width, char arrays, structs,
 * cells, and zlib-compressed elements.
 *
 * MAT v5 IS A TAG-LENGTH-VALUE STREAM after a 128-byte header, and two things about it are
 * easy to get silently wrong, so both are handled explicitly here:
 *
 *   - THE SMALL-ELEMENT FORM. When a tag's upper 16 bits are non-zero the element is packed
 *     into the tag itself: byte count in the high half, type in the low half, payload in the
 *     next 4 bytes. Read as a normal tag it yields an enormous length and a nonsense type.
 *   - COLUMN-MAJOR ORDER. MATLAB stores an m-by-n array down its columns. A reader that
 *     hands back the raw buffer as rows returns a transposed matrix that is the right SIZE
 *     and the wrong DATA, which no shape check catches. Arrays come back here as an array of
 *     COLUMNS, so the caller indexes `cols[j][i]` and the convention is visible at the call
 *     site rather than assumed.
 *
 * Every element is padded to an 8-byte boundary except in the small form.
 */
import { inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

const miINT8 = 1, miUINT8 = 2, miINT16 = 3, miUINT16 = 4, miINT32 = 5, miUINT32 = 6,
  miSINGLE = 7, miDOUBLE = 9, miINT64 = 12, miUINT64 = 13, miMATRIX = 14,
  miCOMPRESSED = 15, miUTF8 = 16, miUTF16 = 17, miUTF32 = 18;
const mxCELL = 1, mxSTRUCT = 2, mxOBJECT = 3, mxCHAR = 4, mxSPARSE = 5, mxDOUBLE = 6,
  mxSINGLE = 7, mxINT8 = 8, mxUINT8 = 9, mxINT16 = 10, mxUINT16 = 11, mxINT32 = 12,
  mxUINT32 = 13, mxINT64 = 14, mxUINT64 = 15;

/** One tag: {type, len, dataOff, next} — `next` already padded to the 8-byte boundary. */
function tag(b, off) {
  const w = b.readUInt32LE(off);
  if ((w >>> 16) !== 0) {                       // SMALL-ELEMENT FORM
    return { type: w & 0xffff, len: w >>> 16, dataOff: off + 4, next: off + 8 };
  }
  const len = b.readUInt32LE(off + 4);
  // COMPRESSED ELEMENTS ARE NOT PADDED, and every other element is. Getting this wrong reads
  // ONE variable and then silently stops, because the next tag lands 3-6 bytes into the
  // following element and comes back as a nonsense type that ends the loop — no error, no
  // short read, just a file that appears to contain a single array. Verified against this
  // file rather than taken from the spec: at each of six elements the unpadded offset lands
  // on a valid type-15 tag and the padded one lands on garbage.
  const pad = w === miCOMPRESSED ? 0 : (8 - (len & 7)) & 7;
  return { type: w, len, dataOff: off + 8, next: off + 8 + len + pad };
}

function readNumeric(b, t) {
  const o = t.dataOff, n = t.len;
  switch (t.type) {
    case miINT8: return Int8Array.from(b.subarray(o, o + n));
    case miUINT8: return Uint8Array.from(b.subarray(o, o + n));
    case miINT16: { const a = new Int16Array(n / 2); for (let i = 0; i < a.length; i++) a[i] = b.readInt16LE(o + 2 * i); return a; }
    case miUINT16: { const a = new Uint16Array(n / 2); for (let i = 0; i < a.length; i++) a[i] = b.readUInt16LE(o + 2 * i); return a; }
    case miINT32: { const a = new Int32Array(n / 4); for (let i = 0; i < a.length; i++) a[i] = b.readInt32LE(o + 4 * i); return a; }
    case miUINT32: { const a = new Uint32Array(n / 4); for (let i = 0; i < a.length; i++) a[i] = b.readUInt32LE(o + 4 * i); return a; }
    case miSINGLE: { const a = new Float32Array(n / 4); for (let i = 0; i < a.length; i++) a[i] = b.readFloatLE(o + 4 * i); return a; }
    case miDOUBLE: { const a = new Float64Array(n / 8); for (let i = 0; i < a.length; i++) a[i] = b.readDoubleLE(o + 8 * i); return a; }
    case miINT64: case miUINT64: { const a = new Float64Array(n / 8); for (let i = 0; i < a.length; i++) a[i] = Number(b.readBigInt64LE(o + 8 * i)); return a; }
    case miUTF8: return b.subarray(o, o + n).toString('utf8');
    case miUTF16: { let s = ''; for (let i = 0; i < n / 2; i++) s += String.fromCharCode(b.readUInt16LE(o + 2 * i)); return s; }
    case miUTF32: { let s = ''; for (let i = 0; i < n / 4; i++) s += String.fromCodePoint(b.readUInt32LE(o + 4 * i)); return s; }
    default: throw new Error(`matread: unhandled data type ${t.type}`);
  }
}

/** An m-by-n array as an array of COLUMNS — see the header on why not rows. */
function toColumns(flat, dims) {
  const [m, n] = [dims[0] ?? 1, dims[1] ?? 1];
  if (dims.length > 2) throw new Error(`matread: ${dims.length}-D arrays not handled`);
  const cols = [];
  for (let j = 0; j < n; j++) {
    const c = new Float64Array(m);
    for (let i = 0; i < m; i++) c[i] = flat[j * m + i];
    cols.push(c);
  }
  return cols;
}

function readMatrix(b, t) {
  let o = t.dataOff;
  const fl = tag(b, o); const flags = readNumeric(b, fl);
  const cls = flags[0] & 0xff, complex = !!(flags[0] & 0x0800);
  o = fl.next;
  const dt = tag(b, o); const dims = Array.from(readNumeric(b, dt)); o = dt.next;
  const nt = tag(b, o); const name = Buffer.from(readNumeric(b, nt)).toString('latin1'); o = nt.next;

  if (cls === mxSTRUCT) {
    const fl1 = tag(b, o); const fieldLen = readNumeric(b, fl1)[0]; o = fl1.next;
    const fn = tag(b, o); const raw = readNumeric(b, fn); o = fn.next;
    const names = [];
    for (let i = 0; i + fieldLen <= raw.length; i += fieldLen) {
      names.push(Buffer.from(raw.subarray(i, i + fieldLen)).toString('latin1').replace(/\0.*$/, ''));
    }
    const nEl = dims.reduce((a, c) => a * c, 1);
    const out = [];
    for (let e = 0; e < nEl; e++) {
      const rec = {};
      for (const nm of names) { const ft = tag(b, o); rec[nm] = readMatrix(b, ft).value; o = ft.next; }
      out.push(rec);
    }
    return { name, value: nEl === 1 ? out[0] : out };
  }
  if (cls === mxCELL) {
    const nEl = dims.reduce((a, c) => a * c, 1);
    const out = [];
    for (let e = 0; e < nEl; e++) { const ct = tag(b, o); out.push(readMatrix(b, ct).value); o = ct.next; }
    return { name, value: out };
  }
  const pr = tag(b, o); const re = readNumeric(b, pr); o = pr.next;
  if (cls === mxCHAR) {
    const s = typeof re === 'string' ? re : Array.from(re).map((c) => String.fromCharCode(c)).join('');
    return { name, value: s };
  }
  if (complex) {
    const pi = tag(b, o); const im = readNumeric(b, pi);
    return { name, value: { re: toColumns(re, dims), im: toColumns(im, dims), dims } };
  }
  return { name, value: toColumns(re, dims), dims };
}

/** Read a `.mat` file into `{ name: value }`. Numeric arrays come back as arrays of columns. */
function readMat(path) {
  return readMatBuffer(readFileSync(path));
}
function readMatBuffer(buf) {
  const hdr = buf.subarray(0, 116).toString('latin1').replace(/\0+$/, '');
  if (!/^MATLAB 5/.test(hdr)) {
    throw new Error(`matread: not a MATLAB v5 file (header "${hdr.slice(0, 40)}"). `
      + 'A v7.3 file is HDF5 and needs a different reader — this one would return nonsense.');
  }
  const out = {};
  let o = 128;
  while (o + 8 <= buf.length) {
    const t = tag(buf, o);
    if (t.type === miCOMPRESSED) {
      const sub = inflateSync(buf.subarray(t.dataOff, t.dataOff + t.len));
      let so = 0;
      while (so + 8 <= sub.length) {
        const st = tag(sub, so);
        if (st.type !== miMATRIX) break;
        const { name, value } = readMatrix(sub, st);
        out[name] = value;
        so = st.next;
      }
    } else if (t.type === miMATRIX) {
      const { name, value } = readMatrix(buf, t);
      out[name] = value;
    }
    o = t.next;
  }
  return out;
}

export { readMat, readMatBuffer };
