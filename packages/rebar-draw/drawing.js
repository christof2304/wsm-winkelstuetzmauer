// @ws/rebar-draw – Zeichnungsmodell in Weltkoordinaten (m), Ausgabe als SVG und DXF R12.
// Textgrößen und Abstände werden in Papier-mm angegeben und über den Maßstab umgerechnet.

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n = (v) => +v.toFixed(5);

export class Drawing {
  constructor(scale = 25) {
    this.scale = scale; // 1:scale
    this.items = [];
  }
  /** Papier-mm → Welt-m */
  p(mmPaper) { return (mmPaper * this.scale) / 1000; }

  poly(pts, o = {}) { this.items.push({ t: 'poly', pts, ...o }); return this; }
  line(a, b, o = {}) { return this.poly([a, b], o); }
  circle(c, r, o = {}) { this.items.push({ t: 'circle', c, r, ...o }); return this; }
  text(pos, str, o = {}) { this.items.push({ t: 'text', pos, str, size: o.size ?? 2.5, ...o }); return this; }

  /** Lineares Maß. dir 'h' oder 'v', at = Koordinate der Maßlinie (y bei 'h', x bei 'v') */
  dim(a, b, dir, at, label, o = {}) {
    const L = { layer: 'BEMASSUNG', cls: 'dim', ...o };
    const tick = this.p(1.5), ext = this.p(1.5), gap = this.p(1);
    if (dir === 'h') {
      const sgn = Math.sign(at - a[1]) || 1;
      this.line([a[0], a[1] + sgn * gap], [a[0], at + sgn * ext], L);
      this.line([b[0], b[1] + sgn * gap], [b[0], at + sgn * ext], L);
      this.line([a[0], at], [b[0], at], L);
      for (const x of [a[0], b[0]]) this.line([x - tick / 2, at - tick / 2], [x + tick / 2, at + tick / 2], { ...L, cls: 'dim tick' });
      this.text([(a[0] + b[0]) / 2, at + this.p(1)], label, { ...L, anchor: 'middle', size: 2.2 });
    } else {
      const sgn = Math.sign(at - a[0]) || 1;
      this.line([a[0] + sgn * gap, a[1]], [at + sgn * ext, a[1]], L);
      this.line([b[0] + sgn * gap, b[1]], [at + sgn * ext, b[1]], L);
      this.line([at, a[1]], [at, b[1]], L);
      for (const y of [a[1], b[1]]) this.line([at - tick / 2, y - tick / 2], [at + tick / 2, y + tick / 2], { ...L, cls: 'dim tick' });
      this.text([at - this.p(1), (a[1] + b[1]) / 2], label, { ...L, anchor: 'middle', size: 2.2, rotate: -90 });
    }
    return this;
  }

  /** Höhenkote ▽ */
  level(pos, label, o = {}) {
    const s = this.p(1.6);
    this.poly([[pos[0] - s / 2, pos[1] + s], [pos[0] + s / 2, pos[1] + s], [pos[0], pos[1]]], { layer: 'BEMASSUNG', cls: 'dim', closed: true, ...o });
    this.text([pos[0] + s, pos[1] + s * 0.9], label, { layer: 'BEMASSUNG', cls: 'dim', size: 2.2, ...o });
    return this;
  }

  bbox(pad = 0) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const use = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    for (const it of this.items) {
      if (it.t === 'poly') it.pts.forEach(([x, y]) => use(x, y));
      else if (it.t === 'circle') { use(it.c[0] - it.r, it.c[1] - it.r); use(it.c[0] + it.r, it.c[1] + it.r); }
      else if (it.t === 'text') {
        const w = this.p(it.size) * 0.6 * String(it.str).length, h = this.p(it.size);
        if (it.rotate) { use(it.pos[0] - h, it.pos[1] - w / 2); use(it.pos[0], it.pos[1] + w / 2); }
        else { const xa = it.anchor === 'middle' ? it.pos[0] - w / 2 : it.anchor === 'end' ? it.pos[0] - w : it.pos[0]; use(xa, it.pos[1]); use(xa + w, it.pos[1] + h); }
      }
    }
    return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
  }

  /** SVG mit y nach oben (Welt) → y nach unten (SVG) */
  toSVG({ defs = '', pad = this.p(6), cls = '' } = {}) {
    const b = this.bbox(pad);
    const out = [];
    for (const it of this.items) {
      const c = `${it.cls ?? ''} L-${it.layer ?? 'X'}${it.part ? ' part-' + it.part : ''}`.trim();
      const data = it.data ? ` data-ref="${esc(it.data)}"` : '';
      if (it.t === 'poly') {
        const d = it.pts.map(([x, y], i) => `${i ? 'L' : 'M'}${n(x)} ${n(-y)}`).join('') + (it.closed ? 'Z' : '');
        out.push(`<path class="${c}" d="${d}"${it.fill ? ` fill="${it.fill}"` : ''}${data}/>`);
      } else if (it.t === 'circle') {
        out.push(`<circle class="${c}" cx="${n(it.c[0])}" cy="${n(-it.c[1])}" r="${n(it.r)}"${data}/>`);
      } else {
        const fs = this.p(it.size);
        const tr = it.rotate ? ` transform="rotate(${it.rotate} ${n(it.pos[0])} ${n(-it.pos[1])})"` : '';
        out.push(`<text class="${c}" x="${n(it.pos[0])}" y="${n(-it.pos[1])}" font-size="${n(fs)}" text-anchor="${it.anchor ?? 'start'}"${tr}${data}>${esc(it.str)}</text>`);
      }
    }
    const w = b.x1 - b.x0, h = b.y1 - b.y0;
    return `<svg xmlns="http://www.w3.org/2000/svg" class="${cls}" viewBox="${n(b.x0)} ${n(-b.y1)} ${n(w)} ${n(h)}" data-w="${n(w)}" data-h="${n(h)}"><defs>${defs}</defs>${out.join('')}</svg>`;
  }

  /** DXF R12 (ASCII), Einheit mm, Layer aus den Elementen */
  toDXF() {
    const k = 1000;
    const L = [];
    const g = (code, v) => L.push(String(code), String(v));
    const layers = [...new Set(this.items.map((i) => i.layer ?? '0'))];
    g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1009'); g(9, '$INSUNITS'); g(70, 4); g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'TABLES'); g(0, 'TABLE'); g(2, 'LAYER'); g(70, layers.length);
    const colors = { BETON: 8, BEWEHRUNG: 1, BEMASSUNG: 5, TEXT: 7, BODEN: 42, GELAENDE: 3 };
    for (const ly of layers) { g(0, 'LAYER'); g(2, ly); g(70, 0); g(62, colors[ly] ?? 7); g(6, 'CONTINUOUS'); }
    g(0, 'ENDTAB'); g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'ENTITIES');
    for (const it of this.items) {
      if (it.dxf === false) continue;
      const ly = it.layer ?? '0';
      if (it.t === 'poly') {
        const pts = it.closed ? [...it.pts, it.pts[0]] : it.pts;
        for (let i = 1; i < pts.length; i++) {
          g(0, 'LINE'); g(8, ly); g(10, n(pts[i - 1][0] * k)); g(20, n(pts[i - 1][1] * k)); g(30, 0); g(11, n(pts[i][0] * k)); g(21, n(pts[i][1] * k)); g(31, 0);
        }
      } else if (it.t === 'circle') {
        g(0, 'CIRCLE'); g(8, ly); g(10, n(it.c[0] * k)); g(20, n(it.c[1] * k)); g(30, 0); g(40, n(it.r * k));
      } else {
        g(0, 'TEXT'); g(8, ly); g(10, n(it.pos[0] * k)); g(20, n(it.pos[1] * k)); g(30, 0); g(40, n(this.p(it.size) * k)); g(1, it.str);
        if (it.rotate) g(50, -it.rotate);
        if (it.anchor === 'middle' || it.anchor === 'end') { g(72, it.anchor === 'middle' ? 1 : 2); g(11, n(it.pos[0] * k)); g(21, n(it.pos[1] * k)); g(31, 0); }
      }
    }
    g(0, 'ENDSEC'); g(0, 'EOF');
    return L.join('\r\n');
  }
}

/** Schraffurmuster in Weltmaßen (abhängig vom Maßstab) */
export function hatchDefs(scale) {
  const s = (2.5 * scale) / 1000; // 2,5 mm Papier
  const s2 = s * 1.6;
  return `
  <pattern id="h-concrete" patternUnits="userSpaceOnUse" width="${s}" height="${s}" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="${s}" class="hatch-concrete"/></pattern>
  <pattern id="h-soil" patternUnits="userSpaceOnUse" width="${s2}" height="${s2}" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="${s2 * 0.5}" class="hatch-soil"/><circle cx="${s2 * 0.6}" cy="${s2 * 0.75}" r="${s2 * 0.06}" class="hatch-soil-dot"/></pattern>`;
}
