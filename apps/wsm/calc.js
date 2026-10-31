// Äußere Standsicherheit der Winkelstützmauer (Erddruck auf lotrechten Schnitt am Spornende).
import { NORMS } from '../../packages/norm/din1054.js';
import { pressureModel, integrate, rad } from '../../packages/soil/earth.js';
import { bearingResistance } from '../../packages/soil/bearing.js';
import { fmt, step, statusOf } from '../../packages/ui/format.js';
import { geometry } from './geometry.js';

const GAMMA_CONCRETE = 25;

/**
 * Charakteristische Einwirkungen. Jede Einwirkung: V (↓ positiv) bei x, H (talwärts positiv) bei y.
 * Erddruck und seine Vertikalkomponente bilden eine Einwirkung.
 */
export function actions(m, g) {
  const s = m.soil, L = m.loads;
  const list = [];
  const Wc = GAMMA_CONCRETE * (g.pFooting.A + g.pWall.A);
  const xc = (g.pFooting.A * g.pFooting.cx + g.pWall.A * g.pWall.cx) / (g.pFooting.A + g.pWall.A);
  list.push({ id: 'Gc', kind: 'G', label: 'Eigengewicht Mauer', V: Wc, x: xc, H: 0, y: 0 });
  list.push({ id: 'Gs', kind: 'G', label: 'Boden auf Bergsporn', V: s.gamma * g.pHeelSoil.A, x: g.pHeelSoil.cx, H: 0, y: 0 });
  if (g.pToeSoil.A > 0) list.push({ id: 'Gt', kind: 'G', label: 'Boden auf Talsporn', V: s.gamma * g.pToeSoil.A, x: g.pToeSoil.cx, H: 0, y: 0 });

  // Erddruck auf den lotrechten Schnitt am Spornende, δ = β (DIN 4085, EAB)
  const pm = pressureModel({ gamma: s.gamma, phi: s.phi, c: s.c, delta: s.beta, beta: s.beta, q: L.q, minEarth: m.earth.minEarth, cohesionTension: m.earth.cohesionTension });
  const EG = integrate(pm.eG, g.hv);
  const tanD = Math.tan(rad(pm.delta));
  list.push({ id: 'EG', kind: 'G', label: 'Erddruck aus Boden', V: EG.E * tanD, x: g.B, H: EG.E, y: EG.zFromBottom, earth: true });
  const EQ = L.q * pm.Kah * g.hv;
  if (L.q > 0) {
    list.push({ id: 'EQ', kind: 'Q', label: 'Erddruck aus q', V: EQ * tanD, x: g.B, H: EQ, y: g.hv / 2, earth: true });
    const lq = g.B - g.xBt;
    list.push({ id: 'Qh', kind: 'Q', label: 'q auf Bergsporn', V: L.q * lq, x: g.xBt + lq / 2, H: 0, y: 0, onHeel: true });
  }
  const xCrown = (g.xFt + g.xBt) / 2;
  if (L.Vg > 0) list.push({ id: 'Vg', kind: 'G', label: 'Kopflast ständig', V: L.Vg, x: xCrown, H: 0, y: 0 });
  if (L.Vq > 0) list.push({ id: 'Vq', kind: 'Q', label: 'Kopflast veränderlich', V: L.Vq, x: xCrown, H: 0, y: 0 });
  if (L.Hq > 0) list.push({ id: 'Hq', kind: 'Q', label: 'Horizontallast Kopf', V: 0, x: xCrown, H: L.Hq, y: g.H });
  return { list, pm, EG, EQ };
}

/** Lastkombinationen (Zus-/Alt-Gruppen in vereinfachter Form) */
export function combinations(list) {
  const hasQ = list.some((a) => a.kind === 'Q');
  const combos = [{ id: 'G', label: 'nur ständig', acts: list.filter((a) => a.kind === 'G') }];
  if (hasQ) {
    combos.push({ id: 'GQ1', label: 'G + Q, q überall', acts: list });
    combos.push({ id: 'GQ2', label: 'G + Q, q nur hinter Schnitt', acts: list.filter((a) => !a.onHeel) });
  }
  return combos;
}

/** Resultierende um die Talkante (Ursprung) mit Faktoren f(a) */
export function resultant(acts, B, f = () => 1) {
  let V = 0, H = 0, M = 0;
  for (const a of acts) {
    const k = f(a);
    V += k * a.V; H += k * a.H; M += k * (a.V * a.x - a.H * a.y);
  }
  const xR = V > 0 ? M / V : NaN;
  return { V, H, M, xR, e: B / 2 - xR };
}

/** Sohldruckverteilung σ(x) aus N und Ausmitte e (e > 0: zum Talsporn) */
export function solePressure(N, e, B) {
  if (!(N > 0) || Math.abs(e) >= B / 2) return { ok: false, sigma: () => 0, smax: Infinity, L: 0 };
  if (Math.abs(e) <= B / 6) {
    const s0 = (N / B) * (1 + (6 * e) / B), sB = (N / B) * (1 - (6 * e) / B);
    return { ok: true, full: true, s0, sB, L: B, smax: Math.max(s0, sB), sigma: (x) => s0 + ((sB - s0) * x) / B };
  }
  const L = 3 * (B / 2 - Math.abs(e)), smax = (2 * N) / L;
  const sigma = e > 0 ? (x) => (x <= L ? smax * (1 - x / L) : 0) : (x) => (x >= B - L ? smax * (1 - (B - x) / L) : 0);
  return { ok: true, full: false, L, smax, s0: sigma(0), sB: sigma(B), sigma };
}

export function analyzeExternal(m) {
  const norm = NORMS[m.norm];
  const g = geometry(m);
  const { list, pm, EG, EQ } = actions(m, g);
  const combos = combinations(list);
  const s = m.soil;
  const warnings = [];
  if (s.deltaS > 35) warnings.push('δ_S,k > 35° ist nach DIN 1054 nicht zulässig.');
  if (s.deltaS > s.phiF) warnings.push('δ_S,k sollte φ′ der Gründungsschicht nicht überschreiten.');
  if (g.t < g.dF) warnings.push('Einbindetiefe t kleiner als Sohldicke: Sporn steht frei.');

  const R = combos.map((c) => ({ ...c, k: resultant(c.acts, g.B) }));
  const checks = [];

  // Kippen (EQU)
  {
    let worst = null;
    for (const c of combos) {
      let dst = 0, stb = 0;
      for (const a of c.acts) {
        const Mo = a.H * a.y - a.V * a.x; // > 0: kippend um Talkante
        if (Mo > 0) dst += (a.kind === 'G' ? norm.equ.Gdst : norm.equ.Qdst) * Mo;
        else stb += (a.kind === 'G' ? norm.equ.Gstb : 0) * -Mo;
      }
      const eta = dst / stb;
      if (!worst || eta > worst.eta) worst = { eta, dst, stb, c };
    }
    checks.push({
      id: 'equ', label: 'Kippen (EQU)', short: 'Kippen', eta: worst.eta, combo: worst.c.label, part: 'footing',
      steps: [
        step('Maßgebende Kombination', worst.c.label, ''),
        step('Kippendes Moment', 'E_dst,d = Σ γ_dst · M_dst', `${fmt(worst.dst)} kNm/m`, norm.refs.equ),
        step('Haltendes Moment', 'E_stb,d = Σ γ_G,stb · M_stb', `${fmt(worst.stb)} kNm/m`),
        step('Ausnutzung', 'η = E_dst,d / E_stb,d', fmt(worst.eta)),
      ],
    });
  }

  // Klaffende Fuge
  {
    const rg = R.find((r) => r.id === 'G').k;
    const eta1 = Math.abs(rg.e) / (g.B / 6);
    checks.push({
      id: 'ecc1', label: 'Klaffende Fuge, ständig', short: 'Fuge ständig', eta: eta1, combo: 'nur ständig', part: 'sole',
      steps: [
        step('Sohlbreite', 'B', `${fmt(g.B)} m`),
        step('Ausmitte', 'e = B/2 − (ΣV·x − ΣH·y)/ΣV', `${fmt(rg.e, 3)} m`, norm.refs.eccentricity),
        step('1. Kernweite', 'e ≤ B/6', `${fmt(g.B / 6, 3)} m`),
        step('Ausnutzung', 'η = |e| / (B/6)', fmt(eta1)),
      ],
    });
    const rq = R.filter((r) => r.id !== 'G');
    const worst = (rq.length ? rq : R).reduce((a, b) => (Math.abs(b.k.e) > Math.abs(a.k.e) ? b : a));
    const eta2 = Math.abs(worst.k.e) / (g.B / 3);
    checks.push({
      id: 'ecc2', label: 'Klaffende Fuge, gesamt', short: 'Fuge gesamt', eta: eta2, combo: worst.label, part: 'sole',
      steps: [
        step('Maßgebende Kombination', worst.label, ''),
        step('Ausmitte', 'e', `${fmt(worst.k.e, 3)} m`, norm.refs.eccentricity),
        step('2. Kernweite', 'e ≤ B/3', `${fmt(g.B / 3, 3)} m`),
        step('Ausnutzung', 'η = |e| / (B/3)', fmt(eta2)),
      ],
    });
  }

  // Gleiten (GEO-2)
  {
    let worst = null;
    for (const r of R) {
      const Td = r.acts.reduce((t, a) => t + (a.kind === 'G' ? norm.geo2.G : norm.geo2.Q) * a.H, 0);
      // günstige veränderliche Vertikallasten ohne Horizontalanteil werden nicht angesetzt
      const Nk = r.acts.reduce((t, a) => t + (a.kind === 'Q' && a.H === 0 ? 0 : a.V), 0);
      const Rtd = (Nk * Math.tan(rad(s.deltaS))) / norm.R.h;
      const eta = Td / Rtd;
      if (!worst || eta > worst.eta) worst = { eta, Td, Nk, Rtd, r };
    }
    checks.push({
      id: 'sliding', label: 'Gleiten (GEO-2)', short: 'Gleiten', eta: worst.eta, combo: worst.r.label, part: 'sole',
      steps: [
        step('Maßgebende Kombination', worst.r.label, ''),
        step('Horizontale Bemessungskraft', 'T_d = γ_G·H_G,k + γ_Q·H_Q,k', `${fmt(worst.Td)} kN/m`),
        step('Normalkraft (charakteristisch)', 'N_k', `${fmt(worst.Nk)} kN/m`),
        step('Gleitwiderstand', `R_t,d = N_k · tan δ_S,k / γ_R,h = ${fmt(worst.Nk)} · tan ${fmt(s.deltaS, 1)}° / ${fmt(norm.R.h)}`, `${fmt(worst.Rtd)} kN/m`, norm.refs.sliding),
        step('Ausnutzung', 'η = T_d / R_t,d', fmt(worst.eta)),
      ],
    });
  }

  // Grundbruch (GEO-2, DIN 4017)
  {
    let worst = null;
    for (const r of R) {
      const Nd = r.acts.reduce((t, a) => t + (a.kind === 'G' ? norm.geo2.G : norm.geo2.Q) * a.V, 0);
      const br = bearingResistance({ b: g.B, e: r.k.e, V: r.k.V, H: r.k.H, phi: s.phiF, c: s.cF, gamma1: s.gammaF, gamma2: s.gamma, d: g.t });
      const Rnd = br.Rnk / norm.R.v;
      const eta = Nd / Rnd;
      if (!worst || eta > worst.eta) worst = { eta, Nd, br, Rnd, r };
    }
    const { br } = worst;
    checks.push({
      id: 'bearing', label: 'Grundbruch (GEO-2)', short: 'Grundbruch', eta: worst.eta, combo: worst.r.label, part: 'sole',
      steps: [
        step('Maßgebende Kombination', worst.r.label, ''),
        step('Reduzierte Breite', `b′ = B − 2·|e| = ${fmt(g.B)} − 2·${fmt(Math.abs(worst.r.k.e), 3)}`, `${fmt(br.bp, 3)} m`),
        step('Lastneigung', 'tan δ = H_k / V_k', fmt(worst.r.k.H / worst.r.k.V, 3)),
        step('Tragfähigkeitsbeiwerte', `N_d0 / N_b0 / N_c0 (φ′ = ${fmt(s.phiF, 1)}°)`, `${fmt(br.N.Nd0)} / ${fmt(br.N.Nb0)} / ${fmt(br.N.Nc0)}`, 'DIN 4017 Tab. 2'),
        step('Neigungsbeiwerte', 'i_d = (1 − H/V)², i_b = (1 − H/V)³', `${fmt(br.i.d, 3)} / ${fmt(br.i.b, 3)}`, 'DIN 4017 Tab. 5'),
        step('Grundbruchwiderstand', 'R_n,k = b′·(c·N_c + γ₂·d·N_d + γ₁·b′·N_b)', `${fmt(br.Rnk)} kN/m`, norm.refs.bearing),
        step('Bemessungswert', `R_n,d = R_n,k / γ_R,v = ${fmt(br.Rnk)} / ${fmt(norm.R.v)}`, `${fmt(worst.Rnd)} kN/m`),
        step('Bemessungslast', 'N_d = γ_G·V_G,k + γ_Q·V_Q,k', `${fmt(worst.Nd)} kN/m`),
        step('Ausnutzung', 'η = N_d / R_n,d', fmt(worst.eta)),
      ],
    });
  }

  for (const c of checks) c.status = statusOf(c.eta);
  const sole = R.map((r) => ({ id: r.id, label: r.label, ...solePressure(r.k.V, r.k.e, g.B), e: r.k.e }));
  return { g, list, combos: R, pm, EG, EQ, checks, sole, warnings, norm };
}
