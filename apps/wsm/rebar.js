// Bewehrungsführung: Positionen als Polylinien (Stabachse, m) bzw. Punktreihen im Querschnitt.
import { anchorage, kgPerM } from '../../packages/rc/ec2.js';

const mm = (v) => v / 1000;
const len = (pts) => pts.reduce((L, p, i) => (i ? L + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);

export function rebarLayout(m, g, pos) {
  const rc = m.rc;
  const P = (id) => pos[id];
  const bars = [], dots = [];
  const cEnd = rc.cTop;
  const ph = (id) => mm(P(id).phi);

  // Sohle: Pos 6 unten, Pos 5 oben, Steckbügel Pos 9 an den Enden außen
  const y6 = mm(rc.cBot) + ph('6') / 2;
  const y5 = g.dF - mm(rc.cTop) - ph('5') / 2;
  const x9a = mm(cEnd) + ph('9') / 2, x9b = g.B - mm(cEnd) - ph('9') / 2;
  const xa = x9a + ph('9') / 2 + ph('6') / 2, xb = x9b - ph('9') / 2 - ph('6') / 2;
  bars.push({ id: '6', pts: [[xa, y6], [xb, y6]] });
  bars.push({ id: '5', pts: [[xa, y5], [xb, y5]] });
  const y9t = y5 - ph('5') / 2 - ph('9') / 2, y9b = y6 + ph('6') / 2 + ph('9') / 2;
  const leg9 = Math.min(mm(anchorage(P('9').phi, rc.concrete).l0), g.B / 2 - 0.05);
  bars.push({ id: '9', pts: [[x9a + leg9, y9t], [x9a, y9t], [x9a, y9b], [x9a + leg9, y9b]] });
  bars.push({ id: '9', pts: [[x9b - leg9, y9t], [x9b, y9t], [x9b, y9b], [x9b - leg9, y9b]], copy: true });

  // Querbewehrung Sohle Pos 7 (Punkte innerhalb von Pos 5 / 6)
  const y7b = y6 + ph('6') / 2 + ph('7') / 2, y7t = y5 - ph('5') / 2 - ph('7') / 2;
  const s7 = mm(P('7').s);
  const n7 = Math.max(2, Math.floor((xb - xa) / s7) + 1);
  for (let i = 0; i < n7; i++) {
    const x = xa + ((xb - xa) * i) / (n7 - 1);
    dots.push({ id: '7', x, y: y7b }, { id: '7', x, y: y7t });
  }

  // Wand: Achsen der lotrechten Stäbe folgen den Wandflächen
  const xBack = (y) => g.xBb - ((g.xBb - g.xBt) * (y - g.dF)) / g.hw;
  const xFront = (y) => g.xFb + g.nv * (y - g.dF);
  const top = g.H - mm(rc.cWall) - mm(P('8').phi) - 0.005;
  const yFoot = y7b + ph('7') / 2 + ph('1') / 2;
  const x1 = (y) => xBack(y) - mm(rc.cWall) - ph('1') / 2;
  const hasP2 = !!P('2');
  const l0 = P('1').l0;
  const y1top = hasP2 ? Math.min(g.dF + l0, top) : top;
  const foot1 = Math.min(x1(g.dF) - xa, Math.max(0.35, (20 * P('1').phi) / 1000));
  bars.push({ id: '1', pts: [[x1(g.dF) - foot1, yFoot], [x1(g.dF), yFoot], [x1(g.dF), g.dF], [x1(y1top), y1top]] });
  if (hasP2) {
    const off = ph('2'); // im Stoß neben Pos 1 dargestellt
    const x2 = (y) => xBack(y) - mm(rc.cWall) - ph('2') / 2 - off;
    bars.push({ id: '2', pts: [[x2(g.dF + 0.02), g.dF + 0.02], [x2(top), top]], lap: [g.dF, g.dF + l0] });
  }
  const x3 = (y) => xFront(y) + mm(rc.cWall) + ph('3') / 2;
  const foot3 = Math.min(xb - x3(g.dF), Math.max(0.3, (20 * P('3').phi) / 1000));
  const yFoot3 = yFoot + ph('1');
  bars.push({ id: '3', pts: [[x3(g.dF) + foot3, yFoot3], [x3(g.dF), yFoot3], [x3(g.dF), g.dF], [x3(top), top]] });

  // Pos 4: horizontale Wandbewehrung beidseitig (innen liegend)
  const s4 = mm(P('4').s);
  const yStart = g.dF + 0.05, yEnd = top - 0.03;
  const n4 = Math.max(2, Math.floor((yEnd - yStart) / s4) + 1);
  for (let i = 0; i < n4; i++) {
    const y = yStart + ((yEnd - yStart) * i) / (n4 - 1);
    dots.push({ id: '4', x: x1(y) - ph('1') / 2 - ph('4') / 2, y });
    dots.push({ id: '4', x: x3(y) + ph('3') / 2 + ph('4') / 2, y });
  }

  // Pos 8: Steckbügel am Wandkopf
  const y8 = g.H - mm(rc.cWall) - ph('8') / 2;
  const leg8 = Math.min(0.5, g.hw / 2);
  bars.push({ id: '8', pts: [[x1(y8 - leg8), y8 - leg8], [x1(y8), y8], [x3(y8), y8], [x3(y8 - leg8), y8 - leg8]] });

  return { bars, dots, schedule: schedule(pos, bars, dots, m.display.length) };
}

/** Stahlliste je lfm und für die Mauerlänge */
export function schedule(pos, bars, dots, wallLength) {
  const rows = [];
  const seen = new Set();
  for (const b of bars) {
    if (b.copy || seen.has(b.id)) continue;
    seen.add(b.id);
    const p = pos[b.id];
    const copies = bars.filter((x) => x.id === b.id).length;
    const L = len(b.pts);
    const nPerM = (1000 / p.s) * copies;
    const segs = b.pts.slice(1).map((pt, i) => Math.round(Math.hypot(pt[0] - b.pts[i][0], pt[1] - b.pts[i][1]) * 100));
    rows.push({ pos: b.id, label: p.label, phi: p.phi, s: p.s, shape: segs.length === 1 ? 'gerade' : segs.length === 3 && b.id !== '1' && b.id !== '3' ? 'U' : 'L', segs, L, nPerM, n: Math.ceil((wallLength * 1000) / p.s + 1) * copies, kgPerLfm: nPerM * L * kgPerM(p.phi) });
  }
  for (const id of ['4', '7']) {
    const p = pos[id];
    const cnt = dots.filter((d) => d.id === id).length;
    rows.push({ pos: id, label: p.label, phi: p.phi, s: p.s, shape: 'gerade (längs)', segs: [Math.round(wallLength * 100)], L: wallLength, nPerM: cnt, n: cnt, kgPerLfm: cnt * 1 * kgPerM(p.phi) });
  }
  rows.sort((a, b) => Number(a.pos) - Number(b.pos));
  const totalLfm = rows.reduce((t, r) => t + r.kgPerLfm, 0);
  return { rows, totalLfm, total: totalLfm * wallLength };
}
