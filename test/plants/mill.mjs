/**
 * @file A cold-rolling mill's gauge loop — a REGULATOR, and the library's refuse control.
 *
 * The roll gap is set through a hydraulic capsule (20 ms lag); exit thickness follows the gap
 * through the mill and material moduli; the backup roll's eccentricity (30 µm) and a slowly
 * wandering entry thickness disturb it. The X-ray gauge is 1 m downstream — 100 scans of transport
 * delay at 5 m/s — with 2 µm of noise. The existing control is a monitor AGC: a PI on the gauge.
 * Scan 2 ms.
 *
 * The setpoint never moves. A feedforward addressed by the reference has nothing to act on, so
 * the right answer here is to change nothing; the plant exists to check that a block handed a
 * constant program does no harm.
 */
import { periodic } from './program.mjs';

const MM = 500, QM = 250, H0 = 2.0, HREF = 1.5, DT = 0.002, TAU_A = 0.02;
const V_LINE = 5.0, L_GAUGE = 1.0, D_BUR = 1.3, A_ECC = 0.030, NOISE = 0.002;
const DLY = Math.round(L_GAUGE / V_LINE / DT);
const F_ECC = V_LINE / (Math.PI * D_BUR);
const S0 = (HREF * (MM + QM) - QM * H0) / MM;

function lcg(s0) { let s = s0 >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
function gauss(r) { const u = Math.max(1e-12, r()); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }

function makeMill(seed) {
  const rnd = lcg(seed), buf = [];
  let S = S0, k = 0, h = HREF;
  const entry = (kk) => H0 + 0.020 * Math.sin(2 * Math.PI * kk * DT / 4.3) + 0.012 * Math.sin(2 * Math.PI * kk * DT / 1.9);
  return {
    step(Scmd) {
      S += (DT / TAU_A) * (Scmd - S);
      const ecc = A_ECC * Math.sin(2 * Math.PI * F_ECC * k * DT);
      h = (MM * (S + ecc) + QM * entry(k)) / (MM + QM);
      buf.push(h);
      if (buf.length > DLY + 2) buf.shift();
      k++;
    },
    gauge() { return (buf.length > DLY ? buf[buf.length - 1 - DLY] : HREF) + NOISE * gauss(rnd); },
  };
}

function make(prog) {
  const sp0 = prog.at(0);
  const m = makeMill(1);
  let I = 0, g = HREF;
  const step = (sp) => {
    const e = sp[0] - g;
    I += e * DT;
    m.step(S0 + 1.2 * (e + I / 0.50));
    g = m.gauge();
  };
  for (let k = 0; k < 4000; k++) step(sp0);
  return { meas: (o) => { o[0] = g; }, step };
}

export const mill = {
  key: 'mill', name: 'cold mill gauge regulator (monitor AGC)', units: 'mm', nc: 1, dt: DT,
  main: periodic(2000, () => [HREF]),
  heldOut: periodic(2000, () => [HREF]),
  make, regulator: true,
  about: 'a regulator: the setpoint never moves, so the right result is to change nothing',
};
