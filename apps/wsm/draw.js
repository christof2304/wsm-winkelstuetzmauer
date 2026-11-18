// Zeichnungen der Winkelstützmauer: Systemgrafik mit Ergebnissen und Bewehrungsskizze.
import { Drawing, hatchDefs } from '../../packages/rebar-draw/drawing.js';
import { fmt } from '../../packages/ui/format.js';

const cm = (v) => fmt(v * 100, 0);

function contour(d, g, { hatch = true } = {}) {
  const outline = [[0, 0], [g.B, 0], [g.B, g.dF], [g.xBb, g.dF], [g.xBt, g.H], [g.xFt, g.H], [g.xFb, g.dF], [0, g.dF]];
  if (hatch) d.poly(outline, { layer: 'BETON', cls: 'concrete-fill', closed: true, dxf: false });
  d.poly([[0, 0], [g.B, 0], [g.B, g.dF], [0, g.dF]], { layer: 'BETON', cls: 'hit part', part: 'footing', closed: true, dxf: false });
  d.poly([[g.xFb, g.dF], [g.xBb, g.dF], [g.xBt, g.H], [g.xFt, g.H]], { layer: 'BETON', cls: 'hit part', part: 'wall', closed: true, dxf: false });
  d.poly([[g.xBb, 0], [g.B, 0], [g.B, g.dF], [g.xBb, g.dF]], { layer: 'BETON', cls: 'hit part', part: 'heel', closed: true, dxf: false });
  d.poly([[0, 0], [g.xFb, 0], [g.xFb, g.dF], [0, g.dF]], { layer: 'BETON', cls: 'hit part', part: 'toe', closed: true, dxf: false });
  d.poly(outline, { layer: 'BETON', cls: 'concrete', closed: true });
}

function terrain(d, g, ext = 1.2) {
  const xEnd = g.B + ext;
  const soil = [[g.xBt, g.H], [xEnd, g.yT(xEnd)], [xEnd, -0.6], [g.B, -0.6], [g.B, 0], [g.B, g.dF], [g.xBb, g.dF]];
  d.poly(soil, { layer: 'BODEN', cls: 'soil-fill', closed: true, dxf: false });
  d.poly([[g.xBt, g.H], [xEnd, g.yT(xEnd)]], { layer: 'GELAENDE', cls: 'ground' });
  const xs = -Math.max(0.8, ext * 0.8);
  // Baugrund unter der Sohle
  d.poly([[xs, -0.6], [g.B, -0.6], [g.B, 0], [xs, 0]], { layer: 'BODEN', cls: 'soil-fill', closed: true, dxf: false });
  // Boden vor dem Talsporn bis zur Geländeoberkante t
  if (g.t > 0) {
    const front = g.t > g.dF
      ? [[xs, 0], [0, 0], [0, g.dF], [g.xFb, g.dF], [g.xFb + g.nv * (g.t - g.dF), g.t], [xs, g.t]]
      : [[xs, 0], [0, 0], [0, g.t], [xs, g.t]];
    d.poly(front, { layer: 'BODEN', cls: 'soil-fill', closed: true, dxf: false });
    d.line([xs, g.t], [front.at(-2)[0], g.t], { layer: 'GELAENDE', cls: 'ground' });
  }
}

/** Systemgrafik: Geometrie, Bemaßung, Erddruck, Sohldruck, Resultierende */
export function drawSystem(m, res, { layers = {}, highlight = null } = {}) {
  const g = res.ext.g;
  const d = new Drawing(m.display.scale);
  terrain(d, g);
  contour(d, g);
  // virtueller Schnitt am Spornende
  d.line([g.B, 0], [g.B, g.hv], { layer: 'HILFS', cls: 'aux' });

  // Flächenlast
  if (m.loads.q > 0) {
    const n = 7, x0 = g.xBt, x1 = g.B + 1.2, h = d.p(6);
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, y = g.yT(x);
      d.line([x, y + h], [x, y + d.p(0.8)], { layer: 'LAST', cls: 'load' });
      d.poly([[x - d.p(0.6), y + d.p(1.6)], [x, y + d.p(0.4)], [x + d.p(0.6), y + d.p(1.6)]], { layer: 'LAST', cls: 'load head', closed: true });
    }
    d.line([x0, g.yT(x0) + h], [x1, g.yT(x1) + h], { layer: 'LAST', cls: 'load' });
    d.text([(x0 + x1) / 2, g.yT((x0 + x1) / 2) + h + d.p(1.2)], `q = ${fmt(m.loads.q, 1)} kN/m²`, { layer: 'LAST', cls: 'load-text', anchor: 'middle' });
  }

  // Erddruckfigur am lotrechten Schnitt (Bodenanteil + q-Anteil)
  if (layers.earth !== false) {
    const pm = res.ext.pm, hv = g.hv, k = d.p(25) / Math.max(1, pm.eG(hv) + m.loads.q * pm.Kah);
    const ptsG = [], n = 24;
    for (let i = 0; i <= n; i++) { const z = (hv * i) / n; ptsG.push([g.B + k * (pm.eG(z) + m.loads.q * pm.Kah), hv - z]); }
    const fig = [[g.B, hv], ...ptsG, [g.B, 0]];
    d.poly(fig, { layer: 'ERDDRUCK', cls: 'earth-fill', closed: true, dxf: false });
    d.poly(ptsG, { layer: 'ERDDRUCK', cls: 'earth' });
    if (m.loads.q > 0) d.line([g.B + k * m.loads.q * pm.Kah, hv], [g.B + k * m.loads.q * pm.Kah, 0], { layer: 'ERDDRUCK', cls: 'earth thin' });
    const eBot = pm.eG(hv) + m.loads.q * pm.Kah;
    d.text([g.B + k * eBot + d.p(1), d.p(1)], `${fmt(eBot, 1)} kN/m²`, { layer: 'ERDDRUCK', cls: 'earth-text' });
    d.text([g.B + d.p(1), hv - d.p(4)], `K_ah = ${fmt(pm.Kah, 3)}`, { layer: 'ERDDRUCK', cls: 'earth-text' });
  }

  // Sohldruck (charakteristisch, maßgebende Kombination mit größter Randspannung)
  if (layers.sole !== false) {
    const sp = res.ext.sole.filter((s) => s.ok).reduce((a, b) => (b.smax > a.smax ? b : a), res.ext.sole[0]);
    if (sp?.ok) {
      const k = d.p(18) / sp.smax, n = 30, pts = [];
      for (let i = 0; i <= n; i++) { const x = (g.B * i) / n; pts.push([x, -k * sp.sigma(x)]); }
      d.poly([[0, 0], ...pts, [g.B, 0]], { layer: 'SOHLDRUCK', cls: 'sole-fill', closed: true, dxf: false });
      d.poly(pts, { layer: 'SOHLDRUCK', cls: 'sole' });
      d.text([0, -k * sp.s0 - d.p(3)], `${fmt(sp.s0, 1)}`, { layer: 'SOHLDRUCK', cls: 'sole-text', anchor: 'middle' });
      d.text([g.B, -k * sp.sB - d.p(3)], `${fmt(sp.sB, 1)}`, { layer: 'SOHLDRUCK', cls: 'sole-text', anchor: 'middle' });
      d.text([g.B / 2, -k * sp.smax - d.p(7)], `σ_k [kN/m²] · ${sp.label}`, { layer: 'SOHLDRUCK', cls: 'sole-text', anchor: 'middle' });
      // Resultierende und Kernweiten
      const xR = g.B / 2 - sp.e;
      d.line([xR, d.p(10)], [xR, d.p(1)], { layer: 'SOHLDRUCK', cls: 'resultant' });
      d.poly([[xR - d.p(0.8), d.p(2.4)], [xR, 0], [xR + d.p(0.8), d.p(2.4)]], { layer: 'SOHLDRUCK', cls: 'resultant head', closed: true });
      for (const [f, c] of [[1 / 6, 'core1'], [1 / 3, 'core2']]) {
        d.line([g.B / 2 - f * g.B, -d.p(1)], [g.B / 2 + f * g.B, -d.p(1)], { layer: 'SOHLDRUCK', cls: c });
      }
    }
  }

  // Bemaßung
  const yb = -d.p(layers.sole !== false ? 34 : 10);
  if (g.bt > 1e-6) d.dim([0, 0], [g.xFb, 0], 'h', yb, cm(g.bt));
  d.dim([g.xFb, 0], [g.xBb, 0], 'h', yb, cm(g.dwu));
  d.dim([g.xBb, 0], [g.B, 0], 'h', yb, cm(g.bh));
  d.dim([0, 0], [g.B, 0], 'h', yb - d.p(7), cm(g.B));
  d.dim([g.xFt, g.H], [g.xBt, g.H], 'h', g.H + d.p(layers.earth === false ? 6 : 6), cm(g.dwo));
  const xv = -d.p(14) - 0.8;
  d.dim([0, 0], [0, g.dF], 'v', xv, cm(g.dF));
  d.dim([0, g.dF], [0, g.H], 'v', xv, cm(g.hw));
  d.dim([0, 0], [0, g.H], 'v', xv - d.p(7), cm(g.H));
  d.level([-0.4, g.t], `t = ${fmt(g.t, 2)}`);
  if (Math.abs(m.soil.beta) > 0) d.text([g.B + 0.3, g.yT(g.B + 0.3) + d.p(2)], `β = ${fmt(m.soil.beta, 1)}°`, { layer: 'GELAENDE', cls: 'dim' });

  const svg = d.toSVG({ defs: hatchDefs(m.display.scale), cls: `drawing system${highlight ? ' hl-' + highlight : ''}` });
  return { svg, drawing: d };
}

/** Bewehrungsskizze mit Positionsfahnen */
export function drawRebar(m, res, { highlight = null } = {}) {
  const g = res.ext.g, pos = res.int.pos, { bars, dots } = res.layout;
  const d = new Drawing(m.display.scale);
  contour(d, g, { hatch: false });
  d.poly([[g.xBt, g.H], [g.B + 0.4, g.yT(g.B + 0.4)]], { layer: 'GELAENDE', cls: 'ground thin' });
  for (const b of bars) d.poly(b.pts, { layer: 'BEWEHRUNG', cls: `bar pos-${b.id}`, data: b.id });
  const rDot = (id) => Math.max(pos[id].phi / 2000, d.p(0.35));
  for (const p of dots) d.circle([p.x, p.y], rDot(p.id), { layer: 'BEWEHRUNG', cls: `dot pos-${p.id}`, data: p.id });

  // Positionsfahnen: Ankerpunkt am Stab, Beschriftung in einer Spalte links bzw. rechts
  const bar = (id) => bars.find((x) => x.id === id && !x.copy);
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const onSeg = (a, b, y) => [a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]), y];
  const flags = [];
  // ly: gewünschte Höhe der Beschriftung, wenn eine waagerechte Führungslinie auf Höhe des Ankers
  // auf einer Bauteil- oder Geländekante liegen würde; die Linie knickt dann unter 45° vom Stab ab
  const add = (id, at, side, ly) => { if (pos[id] && at) flags.push({ id, at, side, ly }); };
  const b1 = bar('1'), b2 = bar('2'), b3 = bar('3'), b5 = bar('5'), b6 = bar('6'), b8 = bar('8'), b9 = bar('9');
  add('1', b1 && onSeg(b1.pts[2], b1.pts[3], g.dF + (b1.pts[3][1] - g.dF) * 0.55), 'R');
  add('2', b2 && onSeg(b2.pts[0], b2.pts[1], g.dF + g.hw * 0.62), 'R');
  add('8', b8 && mid(b8.pts[1], b8.pts[2]), 'R', g.H + d.p(6));
  add('5', b5 && [g.xBb + g.bh * 0.55, b5.pts[0][1]], 'R', g.dF + d.p(5));
  add('3', b3 && onSeg(b3.pts[2], b3.pts[3], g.dF + g.hw * 0.4), 'L');
  const d4 = dots.filter((x) => x.id === '4' && x.x < g.xFb + g.dwu / 2);
  if (d4.length) { const p4 = d4[Math.round((d4.length - 1) * 0.75)]; add('4', [p4.x, p4.y], 'L'); }
  const d7 = dots.filter((x) => x.id === '7' && x.y > g.dF / 2);
  if (d7.length) { const p7 = d7[Math.min(1, d7.length - 1)]; add('7', [p7.x, p7.y], 'L'); }
  add('9', b9 && mid(b9.pts[1], b9.pts[2]), 'L');
  add('6', b6 && [Math.max(b6.pts[0][0] + d.p(4), g.bt * 0.5), b6.pts[0][1]], 'L');

  const rC = d.p(2.1), gapY = d.p(6.5), elbow = d.p(5);
  const label = (id) => { const p = pos[id]; return `Ø${p.phi} / ${fmt(p.s / 10, 1).replace(',0', '')}`; };
  const textW = (s, size = 2.5) => d.p(size) * 0.6 * s.length;
  const xl = Math.min(0, g.xFb - d.p(4)) - d.p(16);
  const xr = g.B + d.p(16);
  for (const side of ['L', 'R']) {
    const ty = (f) => f.ly ?? f.at[1];
    const col = flags.filter((f) => f.side === side).sort((a, b) => ty(b) - ty(a));
    // von oben nach unten mit Mindestabstand verteilen, danach Gruppe mittig auf die Zielhöhen zurückschieben
    const ys = [];
    for (const f of col) ys.push(ys.length ? Math.min(ty(f), ys.at(-1) - gapY) : ty(f));
    const shift = col.reduce((s, f, i) => s + ty(f) - ys[i], 0) / (col.length || 1);
    col.forEach((f, i) => { f.y = ys[i] + Math.max(0, shift); });
    for (const f of col) {
      const sgn = side === 'L' ? -1 : 1, x0 = side === 'L' ? xl : xr;
      const cx = x0 + sgn * rC;
      const kx = f.at[0] + sgn * Math.abs(f.y - f.at[1]);
      const knee = f.ly != null && sgn * (x0 - sgn * elbow - kx) > 0 ? [kx, f.y] : [x0 - sgn * elbow, f.y];
      d.poly([f.at, knee, [x0, f.y]], { layer: 'TEXT', cls: 'leader' });
      d.circle(f.at, d.p(0.45), { layer: 'TEXT', cls: 'leader-dot' });
      d.circle([cx, f.y], rC, { layer: 'TEXT', cls: `pos-circle pos-${f.id}`, data: f.id });
      d.text([cx, f.y - d.p(0.9)], f.id, { layer: 'TEXT', cls: `pos-no pos-${f.id}`, anchor: 'middle', size: 2.6, data: f.id });
      d.text([x0 + sgn * (2 * rC + d.p(1.2)), f.y - d.p(0.9)], label(f.id), { layer: 'TEXT', cls: `flag pos-${f.id}`, anchor: side === 'L' ? 'end' : 'start', data: f.id });
    }
  }
  const flagW = Math.max(0, ...flags.filter((f) => f.side === 'R').map((f) => 2 * rC + d.p(1.2) + textW(label(f.id))));

  // Bemaßung
  if (g.bt > 1e-6) d.dim([0, 0], [g.xFb, 0], 'h', -d.p(14), cm(g.bt));
  d.dim([g.xFb, 0], [g.xBb, 0], 'h', -d.p(14), cm(g.dwu));
  d.dim([g.xBb, 0], [g.B, 0], 'h', -d.p(14), cm(g.bh));
  d.dim([0, 0], [g.B, 0], 'h', -d.p(21), cm(g.B));
  d.dim([g.xFt, g.H], [g.xBt, g.H], 'h', g.H + d.p(10), cm(g.dwo));
  const xv = xr + flagW + d.p(8);
  d.dim([g.B, 0], [g.B, g.dF], 'v', xv, cm(g.dF));
  d.dim([g.B, g.dF], [g.B, g.H], 'v', xv, cm(g.hw));
  d.dim([g.B, 0], [g.B, g.H], 'v', xv + d.p(7), cm(g.H));
  if (pos['2']) d.dim([g.xBb, g.dF], [g.xBb, g.dF + pos['1'].l0], 'v', g.xBb + d.p(5), `l₀ = ${cm(pos['1'].l0)}`);
  d.text([0, -d.p(32)], `Bewehrungsskizze M 1:${m.display.scale}`, { layer: 'TEXT', cls: 'title', size: 3.5 });
  d.text([0, -d.p(37)], `${m.rc.concrete} · B500B · c_nom = ${m.rc.cWall}/${m.rc.cBot}/${m.rc.cTop} mm`, { layer: 'TEXT', cls: 'subtitle', size: 2.2 });

  const svg = d.toSVG({ cls: `drawing rebar${highlight ? ' hl-' + highlight : ''}` });
  return { svg, drawing: d };
}
