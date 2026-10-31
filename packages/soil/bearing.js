// @ws/soil – Grundbruchwiderstand nach DIN 4017:2006 für Streifenfundamente.
import { rad } from './earth.js';

/** Tragfähigkeitsbeiwerte N0 (DIN 4017 Tab. 2) */
export function bearingFactors(phi) {
  const t = Math.tan(rad(phi));
  const Nd0 = Math.tan(rad(45 + phi / 2)) ** 2 * Math.exp(Math.PI * t);
  const Nb0 = (Nd0 - 1) * t;
  const Nc0 = phi > 0 ? (Nd0 - 1) / t : Math.PI + 2;
  return { Nd0, Nb0, Nc0 };
}

/**
 * Charakteristischer Grundbruchwiderstand je m Fundamentlänge.
 * p: {b, e, V, H, phi, c, gamma1 (unter Sohle), gamma2 (über Sohle), d (Einbindetiefe)}
 * Lastneigungsbeiwerte für Streifen (m = 2), H in Richtung der Breite.
 */
export function bearingResistance(p) {
  const { b, e, V, H, phi, c = 0, gamma1, gamma2, d } = p;
  const bp = b - 2 * Math.abs(e);
  if (bp <= 0) return { bp, Rnk: 0, N: bearingFactors(phi), i: { d: 0, b: 0, c: 0 }, err: 'b′ ≤ 0' };
  const N = bearingFactors(phi);
  const m = 2;
  const t = Math.tan(rad(phi));
  const denom = V + bp * (phi > 0 ? c / t : 0);
  const ratio = denom > 0 ? Math.min(Math.abs(H) / denom, 0.999) : 0.999;
  const id = (1 - ratio) ** m;
  const ib = (1 - ratio) ** (m + 1);
  const ic = phi > 0 ? (id * N.Nd0 - 1) / (N.Nd0 - 1) : 1 - (m * Math.abs(H)) / (bp * c * (Math.PI + 2));
  const Nc = N.Nc0 * ic, Nd = N.Nd0 * id, Nb = N.Nb0 * ib;
  const qc = c * Nc, qd = gamma2 * d * Nd, qb = gamma1 * bp * Nb;
  const Rnk = bp * (qc + qd + qb);
  return { bp, Rnk, N, i: { d: id, b: ib, c: ic }, Nc, Nd, Nb, parts: { qc, qd, qb }, tanDelta: H / V };
}
