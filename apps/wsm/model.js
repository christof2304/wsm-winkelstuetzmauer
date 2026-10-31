// Projektdatenmodell der Winkelstützmauer. Längen in m, Winkel in Grad, Lasten in kN bzw. kN/m².
// Konvention wie FRILO: links Talseite, rechts Bergseite. Ursprung = Sohle, Vorderkante Talsporn.

export const DEFAULT_MODEL = {
  name: 'Winkelstützmauer 1',
  norm: 'DIN1054-BS-P',
  wall: { hw: 2.6, dwo: 0.25, nv: 0.02, nh: 0.0, bt: 0.5, bh: 1.2, dF: 0.4, t: 0.8 },
  soil: { gamma: 19, phi: 32.5, c: 0, deltaA: 21.7, deltaS: 32.5, beta: 0, gammaF: 19, phiF: 32.5, cF: 0 },
  earth: { minEarth: false, cohesionTension: false },
  loads: { q: 10, psi2: 0.3, Vg: 0, Vq: 0, Hq: 0 },
  rc: { concrete: 'C30/37', cWall: 40, cBot: 50, cTop: 40, wk: 0.3, nSections: 5, restraint: true },
  display: { scale: 25, length: 10 },
};

// Felddefinitionen: Gruppe, Symbol, Einheit, Schritt, sinnvolle Grenzen (Warnrahmen)
export const FIELDS = [
  { group: 'Mauer', path: 'wall.hw', sym: 'h_W', unit: 'm', step: 0.05, min: 0.5, max: 8 },
  { group: 'Mauer', path: 'wall.dwo', sym: 'd_W,o', unit: 'm', step: 0.01, min: 0.15, max: 1.0 },
  { group: 'Mauer', path: 'wall.nv', sym: 'n_v', unit: 'm/m', step: 0.01, min: 0, max: 0.2 },
  { group: 'Mauer', path: 'wall.nh', sym: 'n_h', unit: 'm/m', step: 0.01, min: 0, max: 0.2 },
  { group: 'Mauer', path: 'wall.bt', sym: 'b_T', unit: 'm', step: 0.05, min: 0, max: 4 },
  { group: 'Mauer', path: 'wall.bh', sym: 'b_B', unit: 'm', step: 0.05, min: 0.2, max: 6 },
  { group: 'Mauer', path: 'wall.dF', sym: 'd_F', unit: 'm', step: 0.05, min: 0.2, max: 1.5 },
  { group: 'Mauer', path: 'wall.t', sym: 't', unit: 'm', step: 0.05, min: 0, max: 3 },
  { group: 'Boden', path: 'soil.gamma', sym: 'γ', unit: 'kN/m³', step: 0.5, min: 15, max: 23 },
  { group: 'Boden', path: 'soil.phi', sym: 'φ′', unit: '°', step: 0.5, min: 15, max: 42.5 },
  { group: 'Boden', path: 'soil.c', sym: 'c′', unit: 'kN/m²', step: 1, min: 0, max: 30 },
  { group: 'Boden', path: 'soil.deltaA', sym: 'δ_a', unit: '°', step: 0.5, min: 0, max: 35 },
  { group: 'Boden', path: 'soil.beta', sym: 'β', unit: '°', step: 1, min: -30, max: 35 },
  { group: 'Gründung', path: 'soil.gammaF', sym: 'γ_F', unit: 'kN/m³', step: 0.5, min: 15, max: 23 },
  { group: 'Gründung', path: 'soil.phiF', sym: 'φ′_F', unit: '°', step: 0.5, min: 15, max: 42.5 },
  { group: 'Gründung', path: 'soil.cF', sym: 'c′_F', unit: 'kN/m²', step: 1, min: 0, max: 30 },
  { group: 'Gründung', path: 'soil.deltaS', sym: 'δ_S,k', unit: '°', step: 0.5, min: 0, max: 35 },
  { group: 'Belastung', path: 'loads.q', sym: 'q_k', unit: 'kN/m²', step: 1, min: 0, max: 50 },
  { group: 'Belastung', path: 'loads.psi2', sym: 'ψ₂', unit: '–', step: 0.1, min: 0, max: 1 },
  { group: 'Belastung', path: 'loads.Vg', sym: 'V_G,k', unit: 'kN/m', step: 1, min: 0, max: 100 },
  { group: 'Belastung', path: 'loads.Vq', sym: 'V_Q,k', unit: 'kN/m', step: 1, min: 0, max: 100 },
  { group: 'Belastung', path: 'loads.Hq', sym: 'H_Q,k', unit: 'kN/m', step: 0.5, min: 0, max: 30 },
  { group: 'Bemessung', path: 'rc.cWall', sym: 'c_nom,W', unit: 'mm', step: 5, min: 25, max: 75 },
  { group: 'Bemessung', path: 'rc.cBot', sym: 'c_nom,u', unit: 'mm', step: 5, min: 40, max: 100 },
  { group: 'Bemessung', path: 'rc.cTop', sym: 'c_nom,o', unit: 'mm', step: 5, min: 25, max: 75 },
  { group: 'Bemessung', path: 'rc.wk', sym: 'w_k', unit: 'mm', step: 0.1, min: 0.2, max: 0.4 },
  { group: 'Bemessung', path: 'rc.nSections', sym: 'n_S', unit: '–', step: 1, min: 1, max: 20, int: true },
];

export const getPath = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
export function setPath(obj, path, value) {
  const keys = path.split('.');
  const copy = structuredClone(obj);
  let o = copy;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
  o[keys.at(-1)] = value;
  return copy;
}

/** Fehlende Felder aus dem Standardmodell ergänzen (für geladene Projekte) */
export function normalize(m) {
  const out = structuredClone(DEFAULT_MODEL);
  for (const k of Object.keys(out)) {
    if (m?.[k] && typeof out[k] === 'object') Object.assign(out[k], m[k]);
    else if (m?.[k] !== undefined) out[k] = m[k];
  }
  return out;
}
