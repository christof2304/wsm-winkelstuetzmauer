// @ws/soil – Erddruckbeiwerte und Erddruckverteilungen nach DIN 4085.
// Winkel in Grad, Längen in m, Kräfte in kN je m.

export const rad = (deg) => (deg * Math.PI) / 180;
export const deg = (r) => (r * 180) / Math.PI;

/**
 * Aktiver Erddruckbeiwert nach Coulomb (DIN 4085 Gl. für ebene Gleitflächen).
 * alpha: Wandneigung (0 = lotrecht), beta: Geländeneigung, delta: Wandreibungswinkel.
 * Liefert {Ka, Kah, Kav}.
 */
export function kaCoulomb(phi, delta, beta = 0, alpha = 0) {
  const p = rad(phi), d = rad(delta), b = rad(beta), a = rad(alpha);
  if (beta > phi) throw new Error(`Geländeneigung β = ${beta}° größer als φ′ = ${phi}°`);
  const num = Math.cos(p - a) ** 2;
  const root = Math.sqrt((Math.sin(p + d) * Math.sin(p - b)) / (Math.cos(a + d) * Math.cos(a - b)));
  const Ka = num / (Math.cos(a) ** 2 * Math.cos(a + d) * (1 + root) ** 2);
  const Kah = Ka * Math.cos(a + d);
  return { Ka, Kah, Kav: Kah * Math.tan(a + d) };
}

/** Kohäsionsbeiwert (horizontal), DIN 4085: Kach = 2·cos φ·cos(α−β)·cos(α+δ) / (1+sin(φ+α+δ−β)) / cos α */
export function kachCoulomb(phi, delta, beta = 0, alpha = 0) {
  const p = rad(phi), d = rad(delta), b = rad(beta), a = rad(alpha);
  return (2 * Math.cos(p) * Math.cos(a - b) * Math.cos(a + d)) / ((1 + Math.sin(p + a + d - b)) * Math.cos(a));
}

/** Erdruhedruckbeiwert nach Jáky, für geneigtes Gelände nach DIN 4085 (Franke) */
export function k0(phi, beta = 0) {
  const s = Math.sin(rad(phi));
  return ((1 - s) * (1 + Math.sin(rad(beta)))) ;
}

/**
 * Erddruckverteilung über eine lotrechte Fläche der Höhe h (z = 0 oben).
 * opt: {gamma, phi, c, delta, beta, q, minPhi?: number|null, cohesionTension:boolean}
 * Liefert Funktionen eG(z), eQ(z) (horizontal, kN/m²) sowie Beiwerte.
 */
export function pressureModel(opt) {
  const { gamma, phi, c = 0, delta, beta = 0, q = 0, minEarth = false, cohesionTension = false } = opt;
  const k = kaCoulomb(phi, delta, beta);
  const kach = kachCoulomb(phi, delta, beta);
  const kMin = minEarth ? kaCoulomb(40, Math.min(delta, 2 / 3 * 40), Math.min(beta, 39.9)).Kah : 0;
  const eG = (z) => {
    let e = gamma * z * k.Kah - c * kach;
    if (!cohesionTension) e = Math.max(e, 0);
    if (minEarth) e = Math.max(e, gamma * z * kMin);
    return e;
  };
  const eQ = () => q * k.Kah;
  return { ...k, Kach: kach, KahMin: kMin, eG, eQ, delta };
}

/**
 * Integriert eine Verteilung e(z) über [0,h] numerisch (Simpson).
 * Liefert Resultierende E und Abstand ihres Angriffspunkts vom Fußpunkt (zFromBottom).
 */
export function integrate(e, h, n = 120) {
  if (h <= 0) return { E: 0, zFromBottom: 0 };
  if (n % 2) n++;
  const dz = h / n;
  let E = 0, M = 0; // M: Moment um den Kopf
  for (let i = 0; i <= n; i++) {
    const z = i * dz, w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2;
    const v = e(z);
    E += w * v; M += w * v * z;
  }
  E *= dz / 3; M *= dz / 3;
  return { E, zFromBottom: E > 1e-12 ? h - M / E : h / 3 };
}
