// Innere Standsicherheit (EC2): Schnittgrößen Wand und Sporne, Bemessung, Stabwahl.
import { pressureModel, integrate } from '../../packages/soil/earth.js';
import { bendingDesign, shearResistance, crackCheck, restraintMinAs, anchorage, selectBars, asOf } from '../../packages/rc/ec2.js';
import { fmt, step, statusOf } from '../../packages/ui/format.js';
import { resultant, solePressure } from './calc.js';

const GAMMA_CONCRETE = 25;

/** Bemessungsfaktoren: STR (einheitlich γ_G für alle ständigen Lasten) oder quasi-ständig */
const factorSet = (norm, mode, psi2) =>
  mode === 'STR' ? (a) => (a.kind === 'G' ? norm.str.G : norm.str.Q) : (a) => (a.kind === 'G' ? 1 : psi2);

/** Integral ∫ f(x) dx und ∫ f(x)·(x − x0) dx über [a,b] (Simpson) */
function integ(f, a, b, x0, n = 80) {
  if (b <= a) return { F: 0, M: 0 };
  const h = (b - a) / n;
  let F = 0, M = 0;
  for (let i = 0; i <= n; i++) {
    const x = a + i * h, w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2, v = f(x);
    F += w * v; M += w * v * (x - x0);
  }
  return { F: (F * h) / 3, M: (M * h) / 3 };
}

/** Schnittgrößen für eine Kombination mit Faktoren f */
function sectionForces(m, ext, combo, f, wallPm) {
  const g = ext.g;
  const hasQ = combo.acts.some((a) => a.kind === 'Q');
  const fG = f({ kind: 'G' }), fQ = f({ kind: 'Q' });
  const n = Math.max(1, Math.round(m.rc.nSections));
  // Wand: Kragarm, Erddruck auf die Wand mit δ_a
  const wall = [];
  for (let i = 1; i <= n; i++) {
    const z = (g.hw * i) / n;
    const eg = integrate(wallPm.eG, z);
    const Eq = hasQ ? wallPm.eQ() * z : 0;
    const Hq = hasQ ? m.loads.Hq : 0;
    const M = fG * eg.E * eg.zFromBottom + fQ * (Eq * z / 2 + Hq * z);
    const V = fG * eg.E + fQ * (Eq + Hq);
    wall.push({ z, h: g.dwo + (g.nv + g.nh) * z, M, V });
  }
  // Sohldruck aus derselben Kombination
  const r = resultant(combo.acts, g.B, f);
  const sp = solePressure(r.V, r.e, g.B);
  // Bergsporn am Anschnitt Wandhinterkante
  const xs = g.xBb;
  let down = 0, mom = 0;
  const add = (F, x) => { down += F; mom += F * (x - xs); };
  add(fG * GAMMA_CONCRETE * g.dF * g.bh, xs + g.bh / 2);
  add(fG * m.soil.gamma * g.pHeelSoil.A, g.pHeelSoil.cx);
  for (const a of combo.acts) {
    if (a.earth) add(f(a) * a.V, g.B);
    if (a.onHeel) add(f(a) * a.V, a.x);
  }
  const up = integ(sp.sigma, xs, g.B, xs);
  const heel = { M: mom - up.M, V: down - up.F, h: g.dF };
  // Talsporn am Anschnitt Wandvorderkante
  const xt = g.xFb;
  let dT = 0, mT = 0;
  const addT = (F, x) => { dT += F; mT += F * (xt - x); };
  addT(fG * GAMMA_CONCRETE * g.dF * g.bt, g.bt / 2);
  if (g.pToeSoil.A > 0) addT(fG * m.soil.gamma * g.pToeSoil.A, g.pToeSoil.cx);
  const upT = integ(sp.sigma, 0, xt, xt);
  const toe = { M: -upT.M - mT, V: upT.F - dT, h: g.dF };
  return { wall, heel, toe, sole: { ...sp, N: r.V, e: r.e } };
}

const envelope = (arr, key) => arr.reduce((a, b) => (Math.abs(b[key]) > Math.abs(a[key]) ? b : a));

export function analyzeInternal(m, ext) {
  const { norm, g } = ext;
  const rc = m.rc;
  const wallPm = pressureModel({ gamma: m.soil.gamma, phi: m.soil.phi, c: m.soil.c, delta: m.soil.deltaA, beta: m.soil.beta, q: m.loads.q, minEarth: m.earth.minEarth, cohesionTension: m.earth.cohesionTension });
  const str = ext.combos.map((c) => ({ c, ...sectionForces(m, ext, c, factorSet(norm, 'STR'), wallPm) }));
  const qp = ext.combos.map((c) => ({ c, ...sectionForces(m, ext, c, factorSet(norm, 'QP', m.loads.psi2), wallPm) }));
  const n = str[0].wall.length;

  // Bemessungsschnitte der Wand (Umhüllende)
  const wallSec = [];
  for (let i = 0; i < n; i++) {
    const ed = envelope(str.map((s) => s.wall[i]), 'M');
    const eq = envelope(qp.map((s) => s.wall[i]), 'M');
    const Vd = Math.max(...str.map((s) => Math.abs(s.wall[i].V)));
    wallSec.push({ z: ed.z, h: ed.h, MEd: ed.M, VEd: Vd, Mqp: eq.M });
  }
  const heelStr = envelope(str.map((s) => s.heel), 'M'), heelQp = envelope(qp.map((s) => s.heel), 'M');
  const toeStr = envelope(str.map((s) => s.toe), 'M'), toeQp = envelope(qp.map((s) => s.toe), 'M');
  const VheelEd = Math.max(...str.map((s) => Math.abs(s.heel.V)));
  const VtoeEd = Math.max(...str.map((s) => Math.abs(s.toe.V)));

  const cls = rc.concrete, wk = rc.wk;
  const checks = [], pos = {};

  /** Bemessung + Stabwahl für einen Schnitt (h in m, Moment ≥ 0 auf der betrachteten Seite) */
  function designPos(id, label, MEd, Mqp, h_m, cover, extra = {}) {
    const h = h_m * 1000;
    const tryDesign = (phiGuess) => {
      const d = h - cover - phiGuess / 2;
      const bd = bendingDesign(Math.max(MEd, 0), h, d, cls);
      const need = Math.max(bd.as, extra.asMin || 0);
      const sel = selectBars(need, { crack: (phi, as) => crackCheck(Math.max(Mqp, 0), h, h - cover - phi / 2, as, phi, cls, wk).ok, minPhi: extra.minPhi || 10, diameters: extra.diameters });
      return { d, bd, need, sel };
    };
    let r = tryDesign(16);
    if (r.sel) r = tryDesign(r.sel.phi);
    const sel = r.sel ?? { phi: 25, s: 100, as: asOf(25, 100), failed: true };
    const d = h - cover - sel.phi / 2;
    const cr = crackCheck(Math.max(Mqp, 0), h, d, sel.as, sel.phi, cls, wk);
    pos[id] = { ...sel, d, h, label, asReq: r.need, bd: r.bd, crack: cr };
    return pos[id];
  }

  // Pos 1: Anschlussbewehrung bergseitig am Wandfuß
  const base = wallSec[n - 1];
  const zw = restraintMinAs(base.h * 1000, 12, cls, wk);
  const p1 = designPos('1', 'Anschluss bergseitig', base.MEd, base.Mqp, base.h, rc.cWall);
  const anc1 = anchorage(p1.phi, cls, true, Math.min(1, p1.asReq / p1.as));
  p1.l0 = anc1.l0 / 1000; p1.anc = anc1;
  // Pos 2: bergseitig oberhalb des Stoßes
  const zLap = g.hw - p1.l0; // Tiefe unter Krone, ab der Pos 2 allein trägt
  const upper = wallSec.filter((s) => s.z <= zLap + 1e-9);
  if (zLap > 0.3) {
    const gov = upper.length ? envelope(upper, 'MEd') : { MEd: 0, Mqp: 0, h: g.dwo };
    // Moment am Stoßende exakt aus Interpolation zwischen den Schnitten
    const atLap = interpSec(wallSec, zLap, g.dwo);
    const MEd = Math.max(gov.MEd, atLap.MEd), Mqp = Math.max(gov.Mqp, atLap.Mqp);
    const p2 = designPos('2', 'Wand bergseitig', MEd, Mqp, atLap.h, rc.cWall, { diameters: [10, 12, 14, 16, 20, 25].filter((d) => d <= p1.phi) });
    if (p2.as >= p1.as - 1e-6) { Object.assign(p2, { phi: p1.phi, s: p1.s, as: p1.as }); }
  }
  // Pos 3: Wand talseitig (konstruktiv, ≥ 20 % der Hauptbewehrung)
  designPos('3', 'Wand talseitig', 0, 0, base.h, rc.cWall, { asMin: Math.max(0.2 * p1.as, asOf(10, 200)) });
  pos['3'].asReq = Math.max(0.2 * p1.as, asOf(10, 200));
  // Pos 4: Wand horizontal je Seite (Querbewehrung, Zwang)
  const as4 = Math.max(0.2 * p1.as, rc.restraint ? zw.as : 0, asOf(10, 200));
  const s4 = selectBars(as4, { diameters: [10, 12, 14, 16] }) ?? { phi: 16, s: 100, as: asOf(16, 100), failed: true };
  pos['4'] = { ...s4, label: 'Wand horizontal', asReq: as4, restraint: rc.restraint ? zw : null };
  // Pos 5: Bergsporn oben
  const p5 = designPos('5', 'Bergsporn oben', heelStr.M, heelQp.M, g.dF, rc.cTop);
  p5.anc = anchorage(p5.phi, cls, g.dF <= 0.3);
  // Pos 6: Sohle unten (Talsporn)
  const p6 = designPos('6', 'Sohle unten', toeStr.M, toeQp.M, g.dF, rc.cBot);
  p6.anc = anchorage(p6.phi, cls, true);
  // Pos 7: Querbewehrung Sohle
  const as7 = Math.max(0.2 * Math.max(p5.as, p6.as), asOf(10, 200));
  pos['7'] = { ...(selectBars(as7, { diameters: [10, 12, 14, 16] }) ?? { phi: 16, s: 100, as: asOf(16, 100) }), label: 'Sohle quer', asReq: as7 };
  // Pos 8/9: Steckbügel Wandkopf und Spornenden
  pos['8'] = { phi: 10, s: (pos['2'] ?? p1).s, as: asOf(10, (pos['2'] ?? p1).s), label: 'Steckbügel Wandkopf', asReq: 0 };
  pos['9'] = { phi: 10, s: p5.s, as: asOf(10, p5.s), label: 'Steckbügel Spornenden', asReq: 0 };

  // Nachweise
  const bendCheck = (id, label, p, MEd, part) => {
    const eta = p.failed ? p.asReq / p.as : p.asReq / p.as;
    checks.push({
      id, label, short: label, eta: p.bd && !p.bd.ok ? Math.max(eta, 1.01) : eta, part,
      steps: [
        step('Bemessungsmoment', 'M_Ed', `${fmt(MEd)} kNm/m`),
        step('Nutzhöhe', `d = h − c_nom − φ/2`, `${fmt(p.d, 0)} mm`),
        step('Bezogenes Moment', 'μ_Eds = M_Ed / (b·d²·f_cd)', fmt(p.bd.mu, 3), 'DIN EN 1992-1-1 6.1'),
        step('Erforderliche Bewehrung', 'a_s,erf = max(ω·b·d·f_cd/f_yd, a_s,min)', `${fmt(p.asReq / 100)} cm²/m`, '9.2.1.1'),
        step('Gewählt', `Ø${p.phi} / ${fmt(p.s / 10, 1)} cm`, `${fmt(p.as / 100)} cm²/m`),
        step('Rissbreite', `σ_s = ${fmt(p.crack.sigma, 0)} N/mm², φ_s,lim = ${fmt(p.crack.phiLim, 1)} mm`, p.crack.ok ? `Ø${p.phi} ≤ ${fmt(p.crack.phiLim, 1)} ✓` : 'nicht erfüllt', '7.3.3, Tab. 7.2DE'),
        step('Ausnutzung', 'η = a_s,erf / a_s,vorh', fmt(eta)),
      ],
    });
  };
  const shearCheck = (id, label, VEd, d, as, part) => {
    const v = shearResistance(d, as, cls);
    const eta = VEd / v.VRdc;
    checks.push({
      id, label, short: label, eta, part,
      steps: [
        step('Querkraft', 'V_Ed', `${fmt(VEd)} kN/m`),
        step('Widerstand ohne Querkraftbewehrung', `V_Rd,c (k = ${fmt(v.k)}, ρ_l = ${fmt(v.rho * 100, 3)} %)`, `${fmt(v.VRdc)} kN/m`, '6.2.2 (1), NA'),
        step('Ausnutzung', 'η = V_Ed / V_Rd,c', fmt(eta)),
      ],
    });
  };
  bendCheck('rc-wall', 'Wand Biegung', p1, base.MEd, 'wall');
  shearCheck('rc-wall-v', 'Wand Querkraft', base.VEd, p1.d, p1.as, 'wall');
  bendCheck('rc-heel', 'Bergsporn Biegung', p5, heelStr.M, 'heel');
  shearCheck('rc-heel-v', 'Bergsporn Querkraft', VheelEd, p5.d, p5.as, 'heel');
  bendCheck('rc-toe', 'Talsporn Biegung', p6, toeStr.M, 'toe');
  shearCheck('rc-toe-v', 'Talsporn Querkraft', VtoeEd, p6.d, p6.as, 'toe');
  for (const c of checks) c.status = statusOf(c.eta);

  return { wallSec, heel: heelStr, toe: toeStr, VheelEd, VtoeEd, pos, checks, zw, sole: str.map((s) => ({ id: s.c.id, ...s.sole })), wallPm };
}

function interpSec(sec, z, h0) {
  const pts = [{ z: 0, MEd: 0, Mqp: 0, h: h0 }, ...sec];
  for (let i = 1; i < pts.length; i++) {
    if (z <= pts[i].z) {
      const a = pts[i - 1], b = pts[i], t = (z - a.z) / (b.z - a.z || 1);
      return { MEd: a.MEd + t * (b.MEd - a.MEd), Mqp: a.Mqp + t * (b.Mqp - a.Mqp), h: a.h + t * (b.h - a.h) };
    }
  }
  return sec.at(-1);
}
