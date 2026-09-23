/**
 * @file Production programs for the plant library.
 *
 * Every program is CLOSED: it returns to where it started, so it can repeat lap after lap and a
 * block that learns per lap sees one program and not a program plus a jump. `at(k)` accepts any k,
 * including negative k and k past the lap, and returns an array with one value per channel.
 */

export const quintic = (t) => t * t * t * (10 + t * (-15 + 6 * t));

/**
 * A recipe: hold a level, then a quintic ramp to the next one. `levels` lists the values of one
 * channel and must end where it starts. With several channels, pass one list per channel; `phase`
 * shifts a channel's timing, so the channels do not all move together.
 */
export function recipe(levels, seg, hold, { phase = null } = {}) {
  const chans = Array.isArray(levels[0]) ? levels : [levels];
  for (const lv of chans) {
    if (lv[0] !== lv[lv.length - 1]) throw new Error(`recipe: not closed (${lv[0]} → ${lv[lv.length - 1]})`);
    if (lv.length !== chans[0].length) throw new Error('recipe: channels need the same number of levels');
  }
  const n = chans[0].length - 1, lap = seg * n;
  const one = (lv, k) => {
    const kk = ((k % lap) + lap) % lap, i = Math.floor(kk / seg);
    const t = (kk - i * seg - hold) / (seg - hold);
    const s = t <= 0 ? 0 : t >= 1 ? 1 : quintic(t);
    return lv[i] + (lv[i + 1] - lv[i]) * s;
  };
  return { lap, at: (k) => chans.map((lv, c) => one(lv, k + (phase ? phase[c] : 0))) };
}

/** A program built from any periodic function of k; `lap` must be its period. */
export const periodic = (lap, f) => ({ lap, at: (k) => f((((k % lap) + lap) % lap)) });
