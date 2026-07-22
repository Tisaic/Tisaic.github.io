/**
 * @file CommStore — commissioning store / lifecycle manager. JavaScript port of
 * `Testing/ngrc_ref/commstore.py` (mirror of `TC_NGRC_CommStore.st`).
 *
 * Owns the whole commissioning lifecycle so the estimator blocks stay pure:
 * collects every retained weight vector into one payload with a version + config
 * signature + checksum; loads on startup, validating and FAILING SAFE on any
 * mismatch (never apply a stale/corrupt comp); monitors health and raises a
 * recommission request with hysteresis; throttles saving. The checksum uses
 * BigInt for bit-exact 64-bit reproducibility with the PLC.
 */

export const STATE_UNCOMMISSIONED = 0;
export const STATE_COMMISSIONED = 1;
export const STATE_DEGRADED = 2;
export const FORMAT_VERSION = 1;

const M32 = 0xFFFFFFFFn;
const M64 = 0xFFFFFFFFFFFFFFFFn;

/**
 * Deterministic 32-bit checksum over signature + payload (FNV-1a style over a
 * 1e-9 fixed-point quantization of each value). Mirrors `_checksum`.
 * @param {number[]} payload @param {number} signature @returns {number}
 */
export function checksum(payload, signature) {
  let h = (2166136261n ^ (BigInt(signature) & M32)) & M32;
  h = (h ^ BigInt(FORMAT_VERSION)) & M32;
  for (const v of payload) {
    const q = BigInt(Math.round(v * 1.0e9)) & M64;
    for (const shift of [0n, 16n, 32n, 48n]) {
      h = ((h ^ ((q >> shift) & 0xFFFFn)) * 16777619n) & M32;
    }
  }
  return Number(h);
}

export class CommStore {
  /**
   * @param {number} signature config hash (block types, sizes, plant id)
   * @param {object} [opts]
   * @param {number} [opts.qualityFloor] @param {number} [opts.driftLimit]
   * @param {number} [opts.saveOnChange] @param {number} [opts.recommissionSustain]
   */
  constructor(signature, opts = {}) {
    const { qualityFloor = 85.0, driftLimit = 40.0, saveOnChange = 1.0e-3, recommissionSustain = 200 } = opts;
    this.signature = Number(BigInt(signature) & M32);
    this.qualityFloor = qualityFloor;
    this.driftLimit = driftLimit;
    this.saveOnChange = saveOnChange;
    this.recommissionSustain = recommissionSustain;

    this._slots = []; this._offset = {}; this._len = {}; this._total = 0;
    this.payload = [];
    this.checksum = 0;
    this.valid = false;
    this.state = STATE_UNCOMMISSIONED;
    this.qualityAtCommission = 0.0;
    this.commissionStamp = 0;
    this.health = 0.0;
    this.recommission = false;
    this.recommissionReason = '';
    this.saveRequest = false;
    this._lastSaved = null;
    this._degradedCount = 0;
  }

  /** Register a block's retained vector (once, at config time). */
  register(name, length) {
    this._offset[name] = this._total;
    this._len[name] = length | 0;
    this._total += length | 0;
    this._slots.push([name, length | 0]);
    this.payload = new Array(this._total).fill(0.0);
  }

  _flatten(valuesByName) {
    const out = new Array(this._total).fill(0.0);
    for (const [name, length] of this._slots) {
      const vals = valuesByName[name];
      if (vals.length !== length) throw new Error(`length mismatch for ${name}: ${vals.length} != ${length}`);
      for (let i = 0; i < length; i++) out[this._offset[name] + i] = vals[i];
    }
    return out;
  }

  /** Snapshot live weights → payload, stamp checksum, request a save. */
  capture(valuesByName, quality, stamp = null) {
    this.payload = this._flatten(valuesByName);
    this.qualityAtCommission = quality;
    if (stamp != null) this.commissionStamp = stamp;
    this.checksum = checksum(this.payload, this.signature);
    this.valid = true;
    this.state = STATE_COMMISSIONED;
    this.saveRequest = true;
    this._lastSaved = [...this.payload];
    this._degradedCount = 0;
  }

  /** @returns {object} the persisted blob */
  toBlob() {
    return {
      version: FORMAT_VERSION, signature: this.signature, checksum: this.checksum,
      valid: this.valid, quality: this.qualityAtCommission, stamp: this.commissionStamp,
      payload: [...this.payload],
    };
  }

  /** Validate + restore-or-fail-safe on startup. @returns {[boolean, string]} */
  load(blob) {
    if (!blob || !blob.valid) { this.state = STATE_UNCOMMISSIONED; return [false, 'empty/invalid']; }
    if ((blob.version | 0) !== FORMAT_VERSION) { this.state = STATE_UNCOMMISSIONED; return [false, 'version mismatch']; }
    if (Number(BigInt(blob.signature) & M32) !== this.signature) { this.state = STATE_UNCOMMISSIONED; return [false, 'signature mismatch (config changed)']; }
    const payload = [...(blob.payload || [])];
    if (payload.length !== this._total) { this.state = STATE_UNCOMMISSIONED; return [false, 'length mismatch']; }
    if (checksum(payload, this.signature) !== (Number(BigInt(blob.checksum) & M32))) { this.state = STATE_UNCOMMISSIONED; return [false, 'checksum mismatch (corrupt)']; }
    this.payload = payload;
    this.checksum = Number(BigInt(blob.checksum) & M32);
    this.valid = true;
    this.qualityAtCommission = blob.quality != null ? blob.quality : 0.0;
    this.commissionStamp = blob.stamp != null ? blob.stamp : 0;
    this.state = STATE_COMMISSIONED;
    this._lastSaved = [...payload];
    return [true, 'ok'];
  }

  /** Restore a registered block's vector. @returns {number[]|null} */
  restore(name) {
    if (!this.valid) return null;
    const o = this._offset[name];
    return this.payload.slice(o, o + this._len[name]);
  }

  /** Health + recommission request with hysteresis. @returns {boolean} recommission */
  monitor(quality, driftPct, diverged) {
    this.health = quality;
    let reason = '';
    if (diverged) reason = 'diverged';
    else if (quality < this.qualityFloor) reason = 'quality below floor';
    else if (driftPct > this.driftLimit) reason = 'drift beyond limit';
    if (reason) {
      this._degradedCount += 1;
      if (this._degradedCount >= this.recommissionSustain || diverged) {
        this.state = STATE_DEGRADED;
        this.recommission = true;
        this.recommissionReason = reason;
      }
    } else {
      this._degradedCount = 0;
      this.recommission = false;
      this.recommissionReason = '';
      if (this.valid) this.state = STATE_COMMISSIONED;
    }
    return this.recommission;
  }

  /** Auto-save adapted weights, throttled by `saveOnChange`. @returns {boolean} saved */
  maybeAutosave(valuesByName, quality, stamp = null) {
    const flat = this._flatten(valuesByName);
    if (this._lastSaved == null) { this.capture(valuesByName, quality, stamp); return true; }
    let changed = 0.0;
    for (let i = 0; i < this._total; i++) changed = Math.max(changed, Math.abs(flat[i] - this._lastSaved[i]));
    if (changed > this.saveOnChange) { this.capture(valuesByName, quality, stamp); return true; }
    return false;
  }

  clearSaveRequest() { this.saveRequest = false; }
}
