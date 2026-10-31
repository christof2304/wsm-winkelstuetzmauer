// Gesamtberechnung, Optimierung der Abmessungen und Parameterstudie.
import { analyzeExternal } from './calc.js';
import { analyzeInternal } from './design.js';
import { rebarLayout } from './rebar.js';
import { setPath, getPath } from './model.js';

export function analyze(m) {
  try {
    const ext = analyzeExternal(m);
    const int = analyzeInternal(m, ext);
    const layout = rebarLayout(m, ext.g, int.pos);
    const checks = [...ext.checks, ...int.checks];
    const crack = Object.entries(int.pos).filter(([, p]) => p.crack && p.crack.sigma > 0 && !p.crack.ok);
    const warnings = [...ext.warnings];
    for (const [id] of crack) warnings.push(`Rissbreite Pos ${id}: kein Stab aus dem Katalog erfüllt w_k – Querschnitt vergrößern.`);
    for (const [id, p] of Object.entries(int.pos)) if (p.failed) warnings.push(`Pos ${id}: erforderliche Bewehrung nicht mit Ø ≤ 25 / 10 cm abdeckbar.`);
    for (const s of ext.sole) if (!s.ok) warnings.push(`Resultierende außerhalb der Sohlfläche (${s.label}).`);
    const etaMax = Math.max(...checks.map((c) => c.eta));
    return { ok: true, ext, int, layout, checks, warnings, etaMax };
  } catch (err) {
    return { ok: false, error: err.message, checks: [], warnings: [err.message] };
  }
}

const EXTERNAL = ['equ', 'ecc1', 'ecc2', 'sliding', 'bearing'];

/**
 * Optimierung: kleinste Sohlbreite (Betonvolumen) mit allen Nachweisen der äußeren
 * Standsicherheit η ≤ ηmax. Rastersuche über Tal- und Bergspornlänge.
 */
export function optimize(m, etaMax = 1.0) {
  let best = null;
  for (let bt = 0; bt <= 2.0 + 1e-9; bt += 0.05) {
    for (let bh = 0.3; bh <= 5.0 + 1e-9; bh += 0.05) {
      const mm = structuredClone(m);
      mm.wall.bt = +bt.toFixed(2); mm.wall.bh = +bh.toFixed(2);
      let ext;
      try { ext = analyzeExternal(mm); } catch { continue; }
      if (ext.checks.filter((c) => EXTERNAL.includes(c.id)).every((c) => c.eta <= etaMax)) {
        const B = ext.g.B;
        // bei gleicher Breite den längeren Talsporn bevorzugen (kleinerer Sohldruck am Bergsporn)
        if (!best || B < best.B - 1e-6) best = { bt: mm.wall.bt, bh: mm.wall.bh, B };
        break; // größere bh bei gleichem bt sind nicht besser
      }
    }
  }
  return best;
}

export const STUDY_PARAMS = [
  { path: 'wall.bh', label: 'Bergspornlänge b_B', unit: 'm', from: 0.4, to: 3.0 },
  { path: 'wall.bt', label: 'Talspornlänge b_T', unit: 'm', from: 0.0, to: 1.5 },
  { path: 'wall.hw', label: 'Wandhöhe h_W', unit: 'm', from: 1.0, to: 5.0 },
  { path: 'wall.dF', label: 'Sohldicke d_F', unit: 'm', from: 0.25, to: 0.8 },
  { path: 'loads.q', label: 'Flächenlast q_k', unit: 'kN/m²', from: 0, to: 30 },
  { path: 'soil.phi', label: 'Reibungswinkel φ′', unit: '°', from: 25, to: 37.5 },
];

/** Parameterstudie: Ausnutzungen aller Nachweise über einen Parameter */
export function study(m, param, nPts = 27) {
  const xs = [], series = new Map();
  for (let i = 0; i < nPts; i++) {
    const x = param.from + ((param.to - param.from) * i) / (nPts - 1);
    const r = analyze(setPath(m, param.path, x));
    xs.push(x);
    for (const c of r.checks) {
      if (!series.has(c.id)) series.set(c.id, { id: c.id, label: c.short, ys: Array(i).fill(NaN) });
      series.get(c.id).ys.push(c.eta);
    }
    for (const s of series.values()) if (s.ys.length < i + 1) s.ys.push(NaN);
  }
  return { xs, series: [...series.values()], current: getPath(m, param.path) };
}
