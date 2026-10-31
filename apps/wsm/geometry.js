// Geometrie der Winkelstützmauer: Punkte, Polygone, Flächen und Schwerpunkte.
import { rad } from '../../packages/soil/earth.js';

export function polyProps(pts) {
  let A = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    const f = x1 * y2 - x2 * y1;
    A += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
  }
  A /= 2;
  if (Math.abs(A) < 1e-12) return { A: 0, cx: 0, cy: 0 };
  return { A: Math.abs(A), cx: cx / (6 * A), cy: cy / (6 * A) };
}

export function geometry(m) {
  const { hw, dwo, nv, nh, bt, bh, dF } = m.wall;
  const t = Math.min(Math.max(m.wall.t, 0), dF + hw);
  const dwu = dwo + (nv + nh) * hw;
  const H = dF + hw;
  const xFb = bt, xFt = bt + nv * hw;
  const xBt = xFt + dwo, xBb = bt + dwu;
  const B = xBb + bh;
  const tb = Math.tan(rad(m.soil.beta));
  const yT = (x) => H + (x - xBt) * tb;
  const hv = yT(B);
  const footing = [[0, 0], [B, 0], [B, dF], [0, dF]];
  const wall = [[xFb, dF], [xBb, dF], [xBt, H], [xFt, H]];
  const heelSoil = [[xBb, dF], [B, dF], [B, hv], [xBt, H]];
  const xF = (y) => bt + nv * (y - dF);
  const toeSoil = t > dF ? [[0, dF], [xFb, dF], [xF(t), t], [0, t]] : null;
  return {
    hw, dwo, dwu, nv, nh, bt, bh, dF, t, H, B, xFb, xFt, xBt, xBb, hv, tb, yT,
    footing, wall, heelSoil, toeSoil,
    pFooting: polyProps(footing), pWall: polyProps(wall),
    pHeelSoil: polyProps(heelSoil), pToeSoil: toeSoil ? polyProps(toeSoil) : { A: 0, cx: 0, cy: 0 },
  };
}
