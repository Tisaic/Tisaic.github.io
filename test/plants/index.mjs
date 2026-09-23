/**
 * @file The plant library — every machine the block is tested on, behind one interface.
 *
 * Each plant is a machine WITH ITS EXISTING CONTROL ALREADY CLOSED: a PID loop, a servo, a
 * stabiliser, or a steady-state model run open loop. The block only ever trims that control's
 * SETPOINT, in the units of the quantity measured — which is what a retrofit onto an installed
 * machine can do. Every plant exports:
 *
 *   key, name, units   identity
 *   nc                 channels (1..4)
 *   dt                 seconds per scan (the scan IS the plant step)
 *   main, heldOut      closed programs `{ lap, at(k) }`: the one commissioned on, and one it never sees
 *   make(prog)         a machine settled on program `prog`: `{ meas(out), step(sp) }`
 *   about              one line on what the plant is there to test
 *
 * and optionally `slow` (long laps; full tier only), `regulator` (the setpoint never moves),
 * `insideClass` (linear, inside the conventional feedforward's model class, so a factor measured
 * on it is not a result).
 */
import { pidloop, pidloopLinear } from './pidloop.mjs';
import { woodberry } from './woodberry.mjs';
import { quadtank } from './quadtank.mjs';
import { barrel } from './barrel.mjs';
import { mill } from './mill.mjs';
import { emps } from './emps.mjs';
import { cartpole } from './cartpole.mjs';
import { realtanks } from './realtanks.mjs';
import { realexch } from './realexch.mjs';
import { realarm } from './realarm.mjs';
import { synth4 } from './synth4.mjs';

export const PLANTS = [pidloop, woodberry, emps, cartpole, realexch, realtanks, realarm, mill,
  quadtank, barrel, pidloopLinear, synth4];

export const plant = (key) => {
  const p = PLANTS.find((q) => q.key === key);
  if (!p) throw new Error(`no plant '${key}' — have ${PLANTS.map((q) => q.key).join(', ')}`);
  return p;
};
