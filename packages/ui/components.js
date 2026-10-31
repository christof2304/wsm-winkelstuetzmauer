// @ws/ui – kleine Komponentenbibliothek (Preact + htm, ohne Build).
import { h } from 'preact';
import { useState, useEffect, useRef, useMemo, useCallback } from 'preact/hooks';
import htm from 'htm';
import { fmt, evalExpr } from './format.js';

export const html = htm.bind(h);

/** Formelzeichen typografisch: "δ_S,k" → δ<sub>S,k</sub> */
export function Sym({ s }) {
  const i = s.indexOf('_');
  if (i < 0) return html`<span>${s}</span>`;
  return html`<span>${s.slice(0, i)}<sub>${s.slice(i + 1)}</sub></span>`;
}

const decimals = (step) => (step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step) - 1e-9)));

/** Zahlenfeld: Symbol – Wert – Einheit, rechnet Ausdrücke, Pfeiltasten = Schritt (Shift ×10) */
export function NumberField({ f, value, onChange, onFocusField, tip }) {
  const d = Math.max(decimals(f.step), 2 - (f.int ? 2 : 0));
  const shown = f.int ? String(value) : fmt(value, d);
  const [text, setText] = useState(shown);
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setText(shown); }, [shown, editing]);
  const commit = (t) => {
    let v = evalExpr(t);
    if (!Number.isFinite(v)) { setText(shown); return; }
    if (f.int) v = Math.round(v);
    if (v !== value) onChange(f.path, v);
  };
  const out = value < f.min || value > f.max;
  const msg = out ? `außerhalb üblicher Grenzen ${fmt(f.min, d)} … ${fmt(f.max, d)} ${f.unit}` : '';
  const onKey = (e) => {
    if (e.key === 'Enter') { commit(text); e.target.select(); }
    else if (e.key === 'Escape') { setText(shown); e.target.blur(); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const k = (e.key === 'ArrowUp' ? 1 : -1) * f.step * (e.shiftKey ? 10 : 1);
      const v = +(value + k).toFixed(6);
      onChange(f.path, f.int ? Math.round(v) : v);
    }
  };
  return html`<div class="field ${out ? 'warn has-msg' : ''}" ...${tip(f.path)}>
    <label class="sym" for=${'f-' + f.path}><${Sym} s=${f.sym} /></label>
    <input id=${'f-' + f.path} inputmode="decimal" autocomplete="off" spellcheck="false" value=${editing ? text : shown}
      aria-describedby=${out ? 'm-' + f.path : undefined}
      onFocus=${(e) => { setEditing(true); setText(shown); onFocusField(f.path); requestAnimationFrame(() => e.target.select()); }}
      onBlur=${() => { commit(text); setEditing(false); onFocusField(null); }}
      onInput=${(e) => setText(e.target.value)} onKeyDown=${onKey} />
    <span class="unit">${f.unit}</span>
    ${out && html`<span class="msg" id=${'m-' + f.path}>${msg}</span>`}
  </div>`;
}

export function SelectField({ path, sym, value, options, onChange, onFocusField, tip, unit = '' }) {
  return html`<div class="field" ...${tip(path)}>
    <label class="sym" for=${'f-' + path}><${Sym} s=${sym} /></label>
    <select id=${'f-' + path} value=${value} onChange=${(e) => onChange(path, isNaN(+e.target.value) ? e.target.value : +e.target.value)}
      onFocus=${() => onFocusField(path)} onBlur=${() => onFocusField(null)}>
      ${options.map((o) => html`<option value=${o.value ?? o}>${o.label ?? o}</option>`)}
    </select>
    <span class="unit">${unit}</span>
  </div>`;
}

export function CheckField({ path, label, value, onChange, onFocusField, tip }) {
  return html`<div class="field check" ...${tip(path)}>
    <label for=${'f-' + path}>${label}</label>
    <input type="checkbox" id=${'f-' + path} checked=${value} style="width:auto;height:auto"
      onChange=${(e) => onChange(path, e.target.checked)} onFocus=${() => onFocusField(path)} onBlur=${() => onFocusField(null)} />
  </div>`;
}

export function Group({ title, open = true, children }) {
  return html`<details class="group" open=${open}><summary>${title}</summary><div class="body">${children}</div></details>`;
}

/** Tooltip-Steuerung: liefert Props für Felder und das Popover-Element */
export function useTooltips(enabled, help) {
  const [tip, setTip] = useState(null);
  const timer = useRef(0);
  const show = (path, el) => {
    clearTimeout(timer.current);
    if (!enabled || !help[path]) return;
    timer.current = setTimeout(() => {
      const r = el.getBoundingClientRect();
      const left = Math.min(r.right + 8, window.innerWidth - 310);
      setTip({ path, x: left < r.right ? r.left : left, y: left < r.right ? r.bottom + 6 : r.top });
    }, 400);
  };
  const hide = () => { clearTimeout(timer.current); setTip(null); };
  useEffect(() => { if (!enabled) hide(); }, [enabled]);
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && hide();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  const props = (path) => ({
    onMouseEnter: (e) => show(path, e.currentTarget),
    onMouseLeave: hide,
    onFocusCapture: (e) => show(path, e.currentTarget),
    onBlurCapture: hide,
  });
  const el = tip && help[tip.path] ? html`<div class="tip" role="tooltip" style=${`left:${tip.x}px;top:${tip.y}px`}>
    <b>${help[tip.path].short}</b><br />${help[tip.path].long}
    ${help[tip.path].range && html`<span class="range">typisch: ${help[tip.path].range}</span>`}
    ${help[tip.path].ref && html`<span class="ref">${help[tip.path].ref}</span>`}
  </div>` : null;
  return { props, el };
}

const MARK = { ok: '✓', warn: '!', fail: '✕' };

/** Nachweiszeile: Status-Symbol, Name, η, Balken (Skala 0…1,5 mit 1,0-Marke) */
export function StatusRow({ c, open, onToggle, onHover }) {
  const w = Math.min(100, (Math.max(0, c.eta) / 1.5) * 100);
  return html`<div class="ck ${open ? 'open' : ''}">
    <button aria-expanded=${open} onClick=${onToggle} onMouseEnter=${() => onHover(c.part)} onMouseLeave=${() => onHover(null)}
      title=${c.label}>
      <span class="st ${c.status}" aria-label=${c.status === 'ok' ? 'erfüllt' : c.status === 'warn' ? 'knapp' : 'nicht erfüllt'}>${MARK[c.status]}</span>
      <span>${c.short}</span>
      <span class="eta">${Number.isFinite(c.eta) ? fmt(c.eta) : '∞'}</span>
      <span class="meter ${c.status}"><i style=${`width:${w}%`}></i></span>
    </button>
    ${open && html`
      ${c.combo && html`<div class="combo">maßgebend: ${c.combo}</div>`}
      <div class="steps">${c.steps.map((s) => html`<div class="s">
        <span class="r">${s.result}</span><div class="l">${s.label}</div>
        <div class="f">${s.formula}</div>${s.ref && html`<div class="ref">${s.ref}</div>`}
      </div>`)}</div>`}
  </div>`;
}

export function Tabs({ tabs, value, onChange, children }) {
  return html`<div class="tabs" role="tablist">
    ${tabs.map((t) => html`<button role="tab" aria-selected=${value === t.id} onClick=${() => onChange(t.id)}>${t.label}</button>`)}
    <div class="tools">${children}</div>
  </div>`;
}

/** SVG-Viewer mit Zoom (Mausrad) und Pan (Ziehen) */
export function SvgView({ svg, onRef, grid, cls = '', onClick, children }) {
  const box = useRef(null);
  const [vt, setVt] = useState({ k: 1, x: 0, y: 0 });
  const drag = useRef(null);
  useEffect(() => { if (onRef) onRef(box.current?.querySelector('svg')); });
  const onWheel = (e) => {
    e.preventDefault();
    const r = box.current.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const k = Math.min(8, Math.max(0.5, vt.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    setVt({ k, x: mx - ((mx - vt.x) * k) / vt.k, y: my - ((my - vt.y) * k) / vt.k });
  };
  useEffect(() => {
    const el = box.current;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });
  const down = (e) => { if (e.button !== 0) return; drag.current = { x: e.clientX - vt.x, y: e.clientY - vt.y }; e.currentTarget.setPointerCapture(e.pointerId); };
  const move = (e) => { if (drag.current) setVt({ ...vt, x: e.clientX - drag.current.x, y: e.clientY - drag.current.y }); };
  const up = () => { drag.current = null; };
  const zoom = (f) => setVt((v) => ({ ...v, k: Math.min(8, Math.max(0.5, v.k * f)) }));
  return html`<div class="canvas ${grid ? 'grid' : ''} ${cls}">
    <div class="stage" ref=${box} onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onClick=${onClick}
      style=${`transform:translate(${vt.x}px,${vt.y}px) scale(${vt.k});transform-origin:0 0`}
      dangerouslySetInnerHTML=${{ __html: svg }}></div>
    <div class="zoom no-print">
      <button class="btn icon" title="Vergrößern" aria-label="Vergrößern" onClick=${() => zoom(1.25)}>+</button>
      <button class="btn icon" title="Verkleinern" aria-label="Verkleinern" onClick=${() => zoom(0.8)}>−</button>
      <button class="btn icon" title="Einpassen" aria-label="Einpassen" onClick=${() => setVt({ k: 1, x: 0, y: 0 })}>⤢</button>
    </div>
    ${children}
  </div>`;
}

/** Befehlspalette (Strg+K) */
export function Palette({ commands, onClose }) {
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const list = useMemo(() => commands.filter((c) => c.label.toLowerCase().includes(q.toLowerCase())), [q, commands]);
  const run = (c) => { onClose(); setTimeout(c.run, 0); };
  const key = (e) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setI((i + 1) % Math.max(1, list.length)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setI((i - 1 + list.length) % Math.max(1, list.length)); }
    else if (e.key === 'Enter' && list[i]) run(list[i]);
  };
  return html`<div class="palette-bg" onClick=${(e) => e.target === e.currentTarget && onClose()}>
    <div class="palette" role="dialog" aria-label="Befehlspalette">
      <input autofocus placeholder="Befehl suchen …" value=${q} onInput=${(e) => { setQ(e.target.value); setI(0); }} onKeyDown=${key}
        ref=${(el) => el && setTimeout(() => el.focus(), 0)} />
      <ul role="listbox">${list.map((c, k) => html`<li role="option" aria-selected=${k === i} onMouseEnter=${() => setI(k)} onClick=${() => run(c)}>
        <span>${c.label}</span><small>${c.hint ?? ''}</small></li>`)}</ul>
    </div>
  </div>`;
}

/**
 * Liniendiagramm für die Parameterstudie: eine y-Achse (η), Grenzlinie 1,0,
 * Fadenkreuz mit Tooltip, Legende, Marke für den aktuellen Wert.
 */
export function LineChart({ xs, series, current, xLabel, unit }) {
  const W = 720, H = 300, m = { l: 40, r: 12, t: 10, b: 30 };
  const [hov, setHov] = useState(null);
  const wrap = useRef(null);
  const all = series.flatMap((s) => s.ys.filter(Number.isFinite));
  const yMax = Math.max(1.2, Math.min(3, Math.ceil(Math.max(...all, 1) * 5) / 5));
  const x0 = xs[0], x1 = xs.at(-1);
  const X = (x) => m.l + ((x - x0) / (x1 - x0 || 1)) * (W - m.l - m.r);
  const Y = (y) => m.t + (1 - Math.min(y, yMax) / yMax) * (H - m.t - m.b);
  const yt = []; for (let v = 0; v <= yMax + 1e-9; v += yMax > 2 ? 0.5 : 0.2) yt.push(+v.toFixed(2));
  const xt = []; const nx = 6; for (let i = 0; i <= nx; i++) xt.push(x0 + ((x1 - x0) * i) / nx);
  const path = (ys) => { let d = '', pen = false; ys.forEach((y, i) => { if (!Number.isFinite(y)) { pen = false; return; } d += `${pen ? 'L' : 'M'}${X(xs[i]).toFixed(1)} ${Y(y).toFixed(1)}`; pen = true; }); return d; };
  const move = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0; xs.forEach((x, i) => { if (Math.abs(X(x) - px) < Math.abs(X(xs[best]) - px)) best = i; });
    setHov({ i: best, left: ((e.clientX - r.left) / r.width) });
  };
  const dec = Math.abs(x1 - x0) >= 10 ? 1 : 2;
  return html`<div class="chart" ref=${wrap}>
    <div class="legend">${series.map((s, k) => html`<span><i style=${`background:var(--series-${k + 1})`}></i>${s.label}</span>`)}</div>
    <svg viewBox=${`0 0 ${W} ${H}`} role="img" aria-label=${`Ausnutzung über ${xLabel}`} onPointerMove=${move} onPointerLeave=${() => setHov(null)}>
      <g class="grid">${yt.map((v) => html`<line x1=${m.l} x2=${W - m.r} y1=${Y(v)} y2=${Y(v)} />`)}</g>
      <g class="axis">
        ${yt.map((v) => html`<text x=${m.l - 6} y=${Y(v) + 4} text-anchor="end">${fmt(v, 1)}</text>`)}
        ${xt.map((v) => html`<text x=${X(v)} y=${H - 10} text-anchor="middle">${fmt(v, dec)}</text>`)}
        <text x=${W - m.r} y=${H - 10 - 14} text-anchor="end">${xLabel} [${unit}]</text>
      </g>
      <line class="limit" x1=${m.l} x2=${W - m.r} y1=${Y(1)} y2=${Y(1)} />
      ${Number.isFinite(current) && current >= x0 && current <= x1 && html`<line class="cur" x1=${X(current)} x2=${X(current)} y1=${m.t} y2=${H - m.b} />`}
      ${series.map((s, k) => html`<path class="series" d=${path(s.ys)} style=${`stroke:var(--series-${k + 1})`} />`)}
      ${hov && html`<g class="hov"><line class="xh" x1=${X(xs[hov.i])} x2=${X(xs[hov.i])} y1=${m.t} y2=${H - m.b} />
        ${series.map((s, k) => Number.isFinite(s.ys[hov.i]) && html`<circle cx=${X(xs[hov.i])} cy=${Y(s.ys[hov.i])} r="4" style=${`fill:var(--series-${k + 1})`} />`)}</g>`}
    </svg>
    ${hov && html`<div class="ctip" style=${`left:${Math.min(hov.left * 100, 70)}%;top:30px`}>
      <div class="h">${xLabel} = ${fmt(xs[hov.i], dec)} ${unit}</div>
      ${series.map((s, k) => html`<div class="row"><i style=${`background:var(--series-${k + 1})`}></i><span>${s.label}</span><b>${fmt(s.ys[hov.i])}</b></div>`)}
    </div>`}
  </div>`;
}

export function useLocal(key, init) {
  const [v, setV] = useState(() => { try { const s = localStorage.getItem(key); return s === null ? init : JSON.parse(s); } catch { return init; } });
  const set = useCallback((x) => setV((old) => { const n = typeof x === 'function' ? x(old) : x; try { localStorage.setItem(key, JSON.stringify(n)); } catch {} return n; }), [key]);
  return [v, set];
}
