// @ws/rc – Stahlbetonbemessung nach DIN EN 1992-1-1 + NA(D) für Plattenstreifen b = 1 m.
// Einheiten intern: N, mm. Schnittstellen: M in kNm/m, V in kN/m, Querschnitt in mm, As in mm²/m.

export const CONCRETE = {
  'C20/25': { fck: 20, fctm: 2.2, fctk005: 1.5 },
  'C25/30': { fck: 25, fctm: 2.6, fctk005: 1.8 },
  'C30/37': { fck: 30, fctm: 2.9, fctk005: 2.0 },
  'C35/45': { fck: 35, fctm: 3.2, fctk005: 2.2 },
  'C40/50': { fck: 40, fctm: 3.5, fctk005: 2.5 },
  'C45/55': { fck: 45, fctm: 3.8, fctk005: 2.7 },
  'C50/60': { fck: 50, fctm: 4.1, fctk005: 2.9 },
};
export const FYK = 500;
export const GAMMA_C = 1.5, GAMMA_S = 1.15, ALPHA_CC = 0.85;

export const DIAMETERS = [10, 12, 14, 16, 20, 25];
export const SPACINGS = [100, 125, 150, 200];

export const barArea = (phi) => (Math.PI * phi * phi) / 4;
export const asOf = (phi, s) => (barArea(phi) * 1000) / s;
export const kgPerM = (phi) => (phi * phi * 0.00617);

export function materials(cls) {
  const c = CONCRETE[cls];
  return { ...c, fcd: (ALPHA_CC * c.fck) / GAMMA_C, fyd: FYK / GAMMA_S };
}

/**
 * Biegebemessung (Spannungsblock, ω = 1 − √(1 − 2μ), entspricht kd-Tafeln).
 * Liefert As,erf inkl. Mindestbewehrung nach 9.2.1.1.
 */
export function bendingDesign(MEd_kNm, h, d, cls) {
  const m = materials(cls);
  const b = 1000;
  const M = Math.abs(MEd_kNm) * 1e6;
  const mu = M / (b * d * d * m.fcd);
  const ok = mu <= 0.296; // ξ ≤ 0,45 (NA: ohne Umlagerung, ≤ C50/60)
  const omega = mu < 0.5 ? 1 - Math.sqrt(1 - 2 * mu) : NaN;
  const z = d * (1 - omega / 2);
  const asReq = (omega * b * d * m.fcd) / m.fyd;
  const asMin = Math.max((0.26 * m.fctm * b * d) / FYK, 0.0013 * b * d);
  return { mu, omega, z, asReq, asMin, as: Math.max(asReq || 0, asMin), ok, fcd: m.fcd, fyd: m.fyd };
}

/** Querkrafttragfähigkeit ohne Querkraftbewehrung (6.2.2, NA) in kN/m */
export function shearResistance(d, asProv, cls) {
  const m = materials(cls);
  const k = Math.min(1 + Math.sqrt(200 / d), 2);
  const rho = Math.min(asProv / (1000 * d), 0.02);
  const cRd = 0.15 / GAMMA_C;
  const vmin = d <= 600 ? (0.0525 / GAMMA_C) * k ** 1.5 * Math.sqrt(m.fck) : (0.0375 / GAMMA_C) * k ** 1.5 * Math.sqrt(m.fck);
  const v = Math.max(cRd * k * (100 * rho * m.fck) ** (1 / 3), vmin);
  return { VRdc: (v * 1000 * d) / 1000, k, rho, vmin };
}

// Tab. 7.2DE: Grenzdurchmesser φs* [mm] in Abhängigkeit von σs, Spalten wk = 0,4 / 0,3 / 0,2 mm
const PHI_STAR = [
  [160, 54, 41, 27], [200, 35, 26, 17], [240, 24, 18, 12], [280, 18, 13, 9],
  [320, 14, 10, 7], [360, 11, 8, 5], [400, 9, 7, 4], [450, 7, 5, 3],
];

export function phiStar(sigma, wk) {
  const col = wk >= 0.4 ? 1 : wk >= 0.3 ? 2 : 3;
  if (sigma <= PHI_STAR[0][0]) return PHI_STAR[0][col];
  for (let i = 1; i < PHI_STAR.length; i++) {
    const [s1, ...a] = PHI_STAR[i - 1], [s2, ...b] = PHI_STAR[i];
    if (sigma <= s2) return a[col - 1] + ((b[col - 1] - a[col - 1]) * (sigma - s1)) / (s2 - s1);
  }
  return 0;
}

/**
 * Rissbreitenbegrenzung ohne direkte Berechnung (7.3.3, NA): zulässiger Durchmesser
 * für Lastbeanspruchung. Mqp in kNm/m.
 */
export function crackCheck(Mqp_kNm, h, d, asProv, phi, cls, wk = 0.3) {
  const m = materials(cls);
  const z = 0.9 * d;
  const sigma = (Math.abs(Mqp_kNm) * 1e6) / (asProv * z);
  const ps = phiStar(sigma, wk);
  const fctEff = m.fctm;
  const phiLim = ps * Math.max((sigma * asProv) / (4 * (h - d) * 1000 * 2.9), fctEff / 2.9);
  return { sigma, phiStar: ps, phiLim, ok: phi <= phiLim + 1e-9 && sigma < 450, wk };
}

/**
 * Mindestbewehrung für Zwang (7.3.2, NA) je Seite, vereinfachter Ansatz für Wände auf Fundament:
 * kc = 1 (zentrischer Zwang), k = 0,8 … 0,5, fct,eff = 0,5·fctm (frühes Betonalter).
 */
export function restraintMinAs(h, phi, cls, wk = 0.3) {
  const m = materials(cls);
  const k = h <= 300 ? 0.8 : h >= 800 ? 0.5 : 0.8 - (0.3 * (h - 300)) / 500;
  const fctEff = 0.5 * m.fctm;
  // σs aus Grenzdurchmesser rückrechnen (φs = φs*·fct,eff/2,9)
  let sigma = 160;
  for (let s = 160; s <= 450; s += 5) {
    if (phiStar(s, wk) * (fctEff / 2.9) >= phi) sigma = s; else break;
  }
  const Act = (h / 2) * 1000;
  return { as: (1.0 * k * fctEff * Act) / sigma, k, fctEff, sigma };
}

/** Grundwert der Verankerungslänge und Übergreifungslänge (8.4, 8.7, NA) in mm */
export function anchorage(phi, cls, goodBond = true, utilisation = 1) {
  const m = materials(cls);
  const fbd = (2.25 * (goodBond ? 1 : 0.7) * m.fctk005) / GAMMA_C;
  const lbRqd = (phi / 4) * (m.fyd * utilisation) / fbd;
  const lbd = Math.max(lbRqd, 0.3 * lbRqd, 10 * phi, 100);
  const a6 = phi < 16 ? 1.4 : 2.0;
  const l0 = Math.max(a6 * lbRqd, 0.3 * a6 * (phi / 4) * m.fyd / fbd, 15 * phi, 200);
  return { fbd, lbRqd, lbd, l0, a6 };
}

/**
 * Stabwahl: leichteste Kombination aus φ und s mit as,prov ≥ as,erf, die die Rissbreite einhält.
 * crack: (phi, as) => boolean
 */
export function selectBars(asReq, { diameters = DIAMETERS, spacings = SPACINGS, crack = () => true, minPhi = 10 } = {}) {
  let best = null;
  for (const phi of diameters) {
    if (phi < minPhi) continue;
    for (const s of spacings) {
      const as = asOf(phi, s);
      if (as < asReq - 1e-6 || !crack(phi, as)) continue;
      if (!best || as < best.as - 1e-6 || (Math.abs(as - best.as) < 1e-6 && s > best.s)) best = { phi, s, as };
    }
  }
  return best;
}
