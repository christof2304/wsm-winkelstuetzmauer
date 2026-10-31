// WSM – Oberfläche: Eingabe | Zeichnung | Nachweise. Live-Rechnung bei jeder Eingabe.
import { render } from 'preact';
import { useState, useMemo, useEffect, useRef, useCallback } from 'preact/hooks';
import { html, NumberField, SelectField, CheckField, Group, useTooltips, StatusRow, Tabs, SvgView, Palette, LineChart, useLocal, Sym } from '../../packages/ui/components.js';
import { fmt } from '../../packages/ui/format.js';
import { CONCRETE } from '../../packages/rc/ec2.js';
import { DEFAULT_MODEL, FIELDS, getPath, setPath, normalize } from './model.js';
import { analyze, optimize, study, STUDY_PARAMS } from './analyze.js';
import { drawSystem, drawRebar } from './draw.js';
import { HELP } from './help-de.js';

const GROUPS = ['Mauer', 'Boden', 'Gründung', 'Belastung', 'Bemessung'];
const EXTERNAL = ['equ', 'ecc1', 'ecc2', 'sliding', 'bearing'];

function loadModel() {
  try { const s = localStorage.getItem('wsm.model'); if (s) return normalize(JSON.parse(s)); } catch {}
  return structuredClone(DEFAULT_MODEL);
}

function download(name, data, type) {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** SVG mit berechneten Stilen inline, damit es ohne Stylesheet korrekt aussieht */
function standaloneSVG(svgEl) {
  const clone = svgEl.cloneNode(true);
  const src = svgEl.querySelectorAll('*'), dst = clone.querySelectorAll('*');
  const props = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'font-family', 'font-weight', 'display'];
  src.forEach((el, i) => {
    const cs = getComputedStyle(el);
    dst[i].setAttribute('style', props.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';') + ';vector-effect:non-scaling-stroke');
  });
  const w = +svgEl.dataset.w, h = +svgEl.dataset.h;
  clone.setAttribute('width', `${(w * 1000) / 40}mm`); // Papiergröße wird im Export nicht maßstäblich erzwungen
  clone.setAttribute('height', `${(h * 1000) / 40}mm`);
  clone.style.background = getComputedStyle(svgEl.closest('.canvas') ?? document.body).backgroundColor;
  return new XMLSerializer().serializeToString(clone);
}

function svgToPng(svgText, w, h, name) {
  const img = new Image();
  img.onload = () => {
    const k = 2400 / w, c = Object.assign(document.createElement('canvas'), { width: 2400, height: Math.round(h * k) });
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    c.toBlob((b) => download(name, b));
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
}

function scheduleCSV(sch, m) {
  const rows = [['Pos', 'Bezeichnung', 'Ø [mm]', 's [cm]', 'Form', 'Schenkel [cm]', 'Länge [m]', 'Anzahl', 'Gewicht [kg/lfm]', 'Gewicht gesamt [kg]']];
  for (const r of sch.rows) rows.push([r.pos, r.label, r.phi, fmt(r.s / 10, 1), r.shape, r.segs.join(' / '), fmt(r.L, 2), r.n, fmt(r.kgPerLfm, 2), fmt(r.kgPerLfm * m.display.length, 1)]);
  rows.push(['', 'Summe', '', '', '', '', '', '', fmt(sch.totalLfm, 2), fmt(sch.total, 1)]);
  return '﻿' + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
}

function App() {
  const [model, setModel] = useState(loadModel);
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const [tab, setTab] = useLocal('wsm.tab', 'system');
  const [tips, setTips] = useLocal('wsm.tooltips', false);
  const [theme, setTheme] = useLocal('wsm.theme', 'auto');
  const [layers, setLayers] = useLocal('wsm.layers', { earth: true, sole: true, dims: true, load: true, grid: false });
  const [focus, setFocus] = useState(null);
  const [hoverPart, setHoverPart] = useState(null);
  const [openCk, setOpenCk] = useState(null);
  const [palette, setPalette] = useState(false);
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState(null);
  const [selPos, setSelPos] = useState(null);
  const [studyParam, setStudyParam] = useLocal('wsm.study', 'wall.bh');
  const [mtab, setMtab] = useState('draw');
  const svgRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => { try { localStorage.setItem('wsm.model', JSON.stringify(model)); } catch {} }, [model]);
  const say = (t) => { setToast(t); setTimeout(() => setToast(null), 2600); };

  const change = useCallback((path, value) => {
    setModel((m) => {
      if (getPath(m, path) === value) return m;
      setPast((p) => [...p.slice(-99), m]); setFuture([]);
      return setPath(m, path, value);
    });
  }, []);
  const replace = (next) => { setPast((p) => [...p.slice(-99), model]); setFuture([]); setModel(next); };
  const undo = () => { if (!past.length) return; setFuture((f) => [model, ...f]); setModel(past.at(-1)); setPast(past.slice(0, -1)); };
  const redo = () => { if (!future.length) return; setPast((p) => [...p, model]); setModel(future[0]); setFuture(future.slice(1)); };

  const [res, calcMs] = useMemo(() => { const t0 = performance.now(); const r = analyze(model); return [r, performance.now() - t0]; }, [model]);
  const highlight = hoverPart ?? (focus ? HELP[focus]?.part : null);
  const sys = useMemo(() => (res.ok ? drawSystem(model, res, { highlight }) : null), [res, highlight]);
  const reb = useMemo(() => (res.ok ? drawRebar(model, res, { highlight }) : null), [res, highlight]);
  const tt = useTooltips(tips, HELP);

  // Markierte Position in der Bewehrungsskizze
  useEffect(() => {
    const svg = svgRef.current; if (!svg) return;
    svg.querySelectorAll('.sel').forEach((e) => e.classList.remove('sel'));
    if (selPos) svg.querySelectorAll(`[data-ref="${selPos}"]`).forEach((e) => e.classList.add('sel'));
  });

  const exportSVG = () => { if (svgRef.current) download(`${model.name}-${tab}.svg`, standaloneSVG(svgRef.current), 'image/svg+xml'); };
  const exportPNG = () => { const s = svgRef.current; if (s) svgToPng(standaloneSVG(s), +s.dataset.w, +s.dataset.h, `${model.name}-${tab}.png`); };
  const exportDXF = () => res.ok && download(`${model.name}-bewehrung.dxf`, reb.drawing.toDXF(), 'application/dxf');
  const exportCSV = () => res.ok && download(`${model.name}-stahlliste.csv`, scheduleCSV(res.layout.schedule, model), 'text/csv');
  const saveJSON = () => download(`${model.name}.wsm.json`, JSON.stringify({ app: 'wsm', version: 1, model }, null, 2), 'application/json');
  const openJSON = () => fileRef.current?.click();
  const onFile = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try { const j = JSON.parse(await f.text()); replace(normalize(j.model ?? j)); say(`„${f.name}" geladen`); } catch { say('Datei konnte nicht gelesen werden'); }
    e.target.value = '';
  };
  const doOptimize = () => {
    const r = optimize(model, 1.0);
    if (!r) { say('Keine Lösung im Suchbereich gefunden'); return; }
    replace({ ...model, wall: { ...model.wall, bt: r.bt, bh: r.bh } });
    say(`Optimiert: b_T = ${fmt(r.bt)} m, b_B = ${fmt(r.bh)} m, B = ${fmt(r.B)} m`);
  };
  const reset = () => { replace(structuredClone(DEFAULT_MODEL)); say('Referenzbeispiel geladen'); };
  const print = () => { setTab('report'); setTimeout(() => window.print(), 150); };

  const commands = [
    { label: 'System anzeigen', run: () => setTab('system') },
    { label: 'Bewehrungsskizze anzeigen', run: () => setTab('rebar') },
    { label: 'Stahlliste anzeigen', run: () => setTab('schedule') },
    { label: 'Parameterstudie', run: () => setTab('study') },
    { label: 'Rechenbericht', run: () => setTab('report') },
    { label: 'Abmessungen optimieren', hint: 'b_T, b_B', run: doOptimize },
    { label: 'DXF exportieren (Bewehrung)', run: exportDXF },
    { label: 'SVG exportieren', run: exportSVG },
    { label: 'PNG exportieren', run: exportPNG },
    { label: 'Stahlliste als CSV', run: exportCSV },
    { label: 'Projekt speichern (JSON)', hint: 'Strg+S', run: saveJSON },
    { label: 'Projekt öffnen', hint: 'Strg+O', run: openJSON },
    { label: 'Bericht drucken / PDF', hint: 'Strg+P', run: print },
    { label: 'Tooltips ein/aus', hint: 'F1', run: () => setTips((v) => !v) },
    { label: 'Theme: hell / dunkel / auto', run: () => setTheme((t) => (t === 'auto' ? 'dark' : t === 'dark' ? 'light' : 'auto')) },
    { label: 'Erddruckfigur ein/aus', run: () => setLayers((l) => ({ ...l, earth: !l.earth })) },
    { label: 'Sohldruck ein/aus', run: () => setLayers((l) => ({ ...l, sole: !l.sole })) },
    { label: 'Raster ein/aus', run: () => setLayers((l) => ({ ...l, grid: !l.grid })) },
    { label: 'Referenzbeispiel laden', run: reset },
    { label: 'Rückgängig', hint: 'Strg+Z', run: undo },
    { label: 'Wiederholen', hint: 'Strg+Y', run: redo },
  ];

  useEffect(() => {
    const onKey = (e) => {
      const inField = /INPUT|SELECT|TEXTAREA/.test(e.target.tagName);
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); }
      else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveJSON(); }
      else if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); openJSON(); }
      else if (mod && e.key.toLowerCase() === 'p') { e.preventDefault(); print(); }
      else if (mod && !inField && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (mod && !inField && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      else if (e.key === 'F1' || (e.key === '?' && !inField)) { e.preventDefault(); setTips((v) => !v); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const fieldProps = { onChange: change, onFocusField: setFocus, tip: tt.props };
  const help = focus && HELP[focus];
  const ext = res.checks.filter((c) => EXTERNAL.includes(c.id));
  const rc = res.checks.filter((c) => !EXTERNAL.includes(c.id));
  const nFail = res.checks.filter((c) => c.status === 'fail').length;

  const inputs = html`<aside class="col inputs" aria-label="Eingabe">
    ${GROUPS.map((g) => html`<${Group} title=${g} open=${g !== 'Bemessung' || true}>
      ${g === 'Bemessung' && html`<${SelectField} path="rc.concrete" sym="Beton" value=${model.rc.concrete} options=${Object.keys(CONCRETE)} ...${fieldProps} />`}
      ${FIELDS.filter((f) => f.group === g).map((f) => html`<${NumberField} f=${f} value=${getPath(model, f.path)} ...${fieldProps} />`)}
      ${g === 'Boden' && html`
        <${CheckField} path="earth.minEarth" label="Mindesterddruck (EAB)" value=${model.earth.minEarth} ...${fieldProps} />
        <${CheckField} path="earth.cohesionTension" label="Zug aus Kohäsion ansetzen" value=${model.earth.cohesionTension} ...${fieldProps} />`}
      ${g === 'Bemessung' && html`
        <${CheckField} path="rc.restraint" label="Mindestbewehrung Zwang" value=${model.rc.restraint} ...${fieldProps} />`}
    <//>`)}
    <${Group} title="Ausgabe" open=${false}>
      <${SelectField} path="display.scale" sym="M 1:" value=${model.display.scale} options=${[20, 25, 50]} ...${fieldProps} />
      <${NumberField} f=${{ path: 'display.length', sym: 'L', unit: 'm', step: 1, min: 1, max: 500 }} value=${model.display.length} ...${fieldProps} />
    <//>
    <div class="info" aria-live="polite">${help
      ? html`<b>${help.short}</b><br />${help.long}${help.range && html`<br /><span class="mono">typisch ${help.range}</span>`}${help.ref && html`<span class="ref">${help.ref}</span>`}`
      : html`Feld wählen für Erläuterung und Normverweis. Werte lassen sich berechnen (<span class="mono">2,4+0,3</span>), <span class="kbd">↑</span>/<span class="kbd">↓</span> ändern schrittweise, mit <span class="kbd">Shift</span> ×10.`}</div>
  </aside>`;

  const P = res.ok ? res.int.pos : {};
  const posCard = selPos && P[selPos] && html`<div class="poscard">
    <h4>Pos ${selPos} · ${P[selPos].label}</h4>
    <dl>
      <dt>gewählt</dt><dd>Ø${P[selPos].phi} / ${fmt(P[selPos].s / 10, 1)} cm</dd>
      <dt>a_s,vorh</dt><dd>${fmt(P[selPos].as / 100)} cm²/m</dd>
      <dt>a_s,erf</dt><dd>${fmt((P[selPos].asReq ?? 0) / 100)} cm²/m</dd>
      ${P[selPos].crack?.sigma > 0 && html`<dt>σ_s (quasi-ständig)</dt><dd>${fmt(P[selPos].crack.sigma, 0)} N/mm²</dd><dt>φ_s,lim</dt><dd>${fmt(P[selPos].crack.phiLim, 1)} mm</dd>`}
      ${P[selPos].l0 && html`<dt>l₀ (Stoß)</dt><dd>${fmt(P[selPos].l0 * 100, 0)} cm</dd>`}
      ${P[selPos].anc && html`<dt>l_bd</dt><dd>${fmt(P[selPos].anc.lbd / 10, 0)} cm</dd>`}
    </dl>
  </div>`;

  const hideCls = Object.entries({ earth: 'hide-earth', sole: 'hide-sole', dims: 'hide-dims', load: 'hide-load' }).filter(([k]) => !layers[k]).map(([, c]) => c).join(' ');
  const layerBtn = (k, label) => html`<button class="btn ${layers[k] ? 'on' : ''}" aria-pressed=${layers[k]} onClick=${() => setLayers({ ...layers, [k]: !layers[k] })}>${label}</button>`;

  let body;
  if (!res.ok) body = html`<div class="scroll"><div class="warns"><div class="err">Berechnung nicht möglich: ${res.error}</div></div></div>`;
  else if (tab === 'system') body = html`<${SvgView} svg=${sys.svg} onRef=${(s) => (svgRef.current = s)} grid=${layers.grid} cls=${hideCls}>
      <div class="layers no-print">${layerBtn('earth', 'Erddruck')}${layerBtn('sole', 'Sohldruck')}${layerBtn('load', 'Lasten')}${layerBtn('dims', 'Maße')}${layerBtn('grid', 'Raster')}</div>
      <div class="scalebar">Erddruck am lotrechten Schnitt · Sohldruck charakteristisch</div>
    <//>`;
  else if (tab === 'rebar') body = html`<${SvgView} svg=${reb.svg} onRef=${(s) => (svgRef.current = s)} grid=${layers.grid}
      onClick=${(e) => { const r = e.target.closest('[data-ref]'); setSelPos(r ? r.dataset.ref : null); }}>
      ${posCard}
      <div class="scalebar">Position anklicken für Details · M 1:${model.display.scale}</div>
    <//>`;
  else if (tab === 'schedule') body = html`<div class="scroll"><${Schedule} res=${res} m=${model} onSel=${(id) => { setSelPos(id); setTab('rebar'); }} /></div>`;
  else if (tab === 'study') body = html`<div class="scroll"><${Study} m=${model} param=${studyParam} setParam=${setStudyParam} /></div>`;
  else body = html`<div class="scroll"><${Report} m=${model} res=${res} sys=${sys} reb=${reb} /></div>`;

  const exportTools = html`
    ${(tab === 'system' || tab === 'rebar') && html`<button class="btn" onClick=${exportSVG}>SVG</button><button class="btn" onClick=${exportPNG}>PNG</button>`}
    ${tab === 'rebar' && html`<button class="btn" onClick=${exportDXF}>DXF</button>`}
    ${tab === 'schedule' && html`<button class="btn" onClick=${exportCSV}>CSV</button>`}
    ${tab === 'report' && html`<button class="btn" onClick=${print}>Drucken / PDF</button>`}`;

  const checks = html`<aside class="col checks" aria-label="Nachweise">
    <div class="ck-head"><h2>Nachweise</h2>
      <span class="sum" style=${`color:var(--${nFail ? 'fail' : res.etaMax > 0.9 ? 'warn' : 'ok'})`}>${nFail ? `${nFail} ✕` : '✓'} η_max ${fmt(res.etaMax)}</span></div>
    <div class="ck-sec">Äußere Standsicherheit · ${res.ok ? res.ext.norm.label : ''}</div>
    ${ext.map((c) => html`<${StatusRow} c=${c} open=${openCk === c.id} onToggle=${() => setOpenCk(openCk === c.id ? null : c.id)} onHover=${setHoverPart} />`)}
    <div class="ck-sec">Bemessung DIN EN 1992-1-1</div>
    ${rc.map((c) => html`<${StatusRow} c=${c} open=${openCk === c.id} onToggle=${() => setOpenCk(openCk === c.id ? null : c.id)} onHover=${setHoverPart} />`)}
    <div style="padding:10px 14px;display:flex;gap:6px">
      <button class="btn primary" onClick=${doOptimize} title="Kleinste Sohlbreite mit η ≤ 1 für alle äußeren Nachweise">Abmessungen optimieren</button>
      <button class="btn" onClick=${() => setTab('study')}>Studie</button>
    </div>
    ${res.warnings.length > 0 && html`<div class="warns">${res.warnings.map((w) => html`<div>${w}</div>`)}</div>`}
    <p class="disclaimer">Vorbemessung, ersetzt keine prüffähige Statik. Rechenzeit ${fmt(calcMs, 1)} ms.</p>
  </aside>`;

  return html`<div class="app">
    <header class="hdr">
      <span class="brand">WSM<small>Winkelstützmauer</small></span>
      <input class="name" aria-label="Projektname" value=${model.name} onChange=${(e) => change('name', e.target.value || 'Winkelstützmauer')} />
      <span class="chip" title="Normprofil">${res.ok ? res.ext.norm.label : 'DIN 1054'}</span>
      <span class="spacer"></span>
      <button class="btn icon" title="Rückgängig (Strg+Z)" aria-label="Rückgängig" disabled=${!past.length} onClick=${undo}>↶</button>
      <button class="btn icon" title="Wiederholen (Strg+Y)" aria-label="Wiederholen" disabled=${!future.length} onClick=${redo}>↷</button>
      <button class="btn" onClick=${() => setPalette(true)} title="Befehlspalette">Befehle <span class="kbd">Strg K</span></button>
      <div class="menu">
        <button class="btn" aria-expanded=${menu} onClick=${() => setMenu(!menu)}>Datei ▾</button>
        ${menu && html`<div class="menu-list" onClick=${() => setMenu(false)}>
          <button onClick=${saveJSON}>Speichern (JSON)<span class="kbd">Strg S</span></button>
          <button onClick=${openJSON}>Öffnen …<span class="kbd">Strg O</span></button>
          <button onClick=${exportDXF}>Bewehrung als DXF</button>
          <button onClick=${exportCSV}>Stahlliste als CSV</button>
          <button onClick=${print}>Bericht drucken / PDF<span class="kbd">Strg P</span></button>
          <button onClick=${reset}>Referenzbeispiel laden</button>
        </div>`}
      </div>
      <button class="btn icon ${tips ? 'on' : ''}" aria-pressed=${tips} title="Tooltips ein/aus (F1)" aria-label="Tooltips" onClick=${() => setTips(!tips)}>?</button>
      <button class="btn icon" title=${`Theme: ${theme}`} aria-label="Theme wechseln" onClick=${() => setTheme(theme === 'auto' ? 'dark' : theme === 'dark' ? 'light' : 'auto')}>${theme === 'dark' ? '☾' : theme === 'light' ? '☀' : '◐'}</button>
      <input type="file" accept=".json" ref=${fileRef} style="display:none" onChange=${onFile} />
    </header>
    <div>
      <nav class="mobile-tabs">${[['inputs', 'Eingabe'], ['draw', 'Zeichnung'], ['checks', 'Nachweise']].map(([k, l]) => html`<button class="btn ${mtab === k ? 'on' : ''}" onClick=${() => setMtab(k)}>${l}</button>`)}</nav>
    </div>
    <main class="main" data-mtab=${mtab}>
      ${inputs}
      <section class="center">
        <${Tabs} tabs=${[{ id: 'system', label: 'System' }, { id: 'rebar', label: 'Bewehrung' }, { id: 'schedule', label: 'Stahlliste' }, { id: 'study', label: 'Studie' }, { id: 'report', label: 'Bericht' }]} value=${tab} onChange=${setTab}>${exportTools}<//>
        ${body}
      </section>
      ${checks}
    </main>
    ${tt.el}
    ${palette && html`<${Palette} commands=${commands} onClose=${() => setPalette(false)} />`}
    ${toast && html`<div class="toast" role="status">${toast}</div>`}
  </div>`;
}

function Schedule({ res, m, onSel }) {
  const s = res.layout.schedule, P = res.int.pos;
  return html`
    <h3 class="sec">Positionen</h3>
    <table class="t"><thead><tr><th>Pos</th><th>Lage</th><th class="n">gewählt</th><th class="n">a_s,erf</th><th class="n">a_s,vorh</th><th class="n">Ausn.</th></tr></thead>
      <tbody>${Object.entries(P).map(([id, p]) => html`<tr style="cursor:pointer" onClick=${() => onSel(id)}><td class="n">${id}</td><td>${p.label}</td>
        <td class="n">Ø${p.phi} / ${fmt(p.s / 10, 1)}</td><td class="n">${fmt((p.asReq ?? 0) / 100)}</td><td class="n">${fmt(p.as / 100)}</td>
        <td class="n">${p.asReq ? fmt(p.asReq / p.as) : '–'}</td></tr>`)}</tbody></table>
    <p class="mono" style="color:var(--text-3);font-size:11px">a_s in cm²/m · Zeile anklicken zeigt die Position in der Skizze</p>
    <h3 class="sec">Stahlliste · B500B · Mauerlänge ${fmt(m.display.length, 1)} m</h3>
    <table class="t"><thead><tr><th>Pos</th><th>Bezeichnung</th><th class="n">Ø</th><th class="n">s [cm]</th><th>Form</th><th class="n">Schenkel [cm]</th><th class="n">L [m]</th><th class="n">Anz.</th><th class="n">kg/lfm</th><th class="n">kg ges.</th></tr></thead>
      <tbody>${s.rows.map((r) => html`<tr><td class="n">${r.pos}</td><td>${r.label}</td><td class="n">${r.phi}</td><td class="n">${fmt(r.s / 10, 1)}</td><td>${r.shape}</td>
        <td class="n">${r.segs.join(' / ')}</td><td class="n">${fmt(r.L)}</td><td class="n">${r.n}</td><td class="n">${fmt(r.kgPerLfm)}</td><td class="n">${fmt(r.kgPerLfm * m.display.length, 1)}</td></tr>`)}</tbody>
      <tfoot><tr><td></td><td>Summe</td><td colspan="6"></td><td class="n">${fmt(s.totalLfm)}</td><td class="n">${fmt(s.total, 0)}</td></tr></tfoot></table>
    <h3 class="sec">Massen je lfm</h3>
    <${Masses} res=${res} m=${m} />`;
}

function Masses({ res, m }) {
  const g = res.ext.g;
  const V = g.pFooting.A + g.pWall.A;
  const form = g.hw * Math.hypot(1, g.nv) + g.hw * Math.hypot(1, g.nh) + 2 * g.dF;
  return html`<table class="t"><tbody>
    <tr><td>Beton</td><td class="n">${fmt(V, 3)} m³/lfm</td><td class="n">${fmt(V * m.display.length, 1)} m³</td></tr>
    <tr><td>Schalung</td><td class="n">${fmt(form, 2)} m²/lfm</td><td class="n">${fmt(form * m.display.length, 0)} m²</td></tr>
    <tr><td>Bewehrungsgrad</td><td class="n">${fmt(res.layout.schedule.totalLfm / V, 0)} kg/m³</td><td></td></tr>
  </tbody></table>`;
}

function Study({ m, param, setParam }) {
  const p = STUDY_PARAMS.find((x) => x.path === param) ?? STUDY_PARAMS[0];
  const data = useMemo(() => {
    const r = study(m, p, 27);
    const ext = r.series.filter((s) => EXTERNAL.includes(s.id));
    const rcs = r.series.filter((s) => !EXTERNAL.includes(s.id));
    const rcMax = { id: 'rc', label: 'Bemessung (max)', ys: r.xs.map((_, i) => Math.max(...rcs.map((s) => s.ys[i]).filter(Number.isFinite))) };
    return { ...r, series: [...EXTERNAL.map((id) => ext.find((s) => s.id === id)).filter(Boolean), rcMax] };
  }, [m, p.path]);
  return html`
    <div class="controls">
      <label for="sp">Parameter</label>
      <select id="sp" value=${p.path} onChange=${(e) => setParam(e.target.value)}>${STUDY_PARAMS.map((x) => html`<option value=${x.path}>${x.label}</option>`)}</select>
      <span style="color:var(--text-3);font-size:var(--fs-1)">aktuell ${fmt(data.current)} ${p.unit} · gestrichelt: η = 1,0</span>
    </div>
    <h3 class="sec">Ausnutzung η über ${p.label}</h3>
    <${LineChart} xs=${data.xs} series=${data.series} current=${data.current} xLabel=${p.label.split(' ').at(-1)} unit=${p.unit} />
    <details style="margin-top:12px"><summary style="cursor:pointer;color:var(--text-2)">Tabelle</summary>
      <table class="t"><thead><tr><th class="n">${p.unit}</th>${data.series.map((s) => html`<th class="n">${s.label}</th>`)}</tr></thead>
        <tbody>${data.xs.map((x, i) => html`<tr><td class="n">${fmt(x)}</td>${data.series.map((s) => html`<td class="n">${fmt(s.ys[i])}</td>`)}</tr>`)}</tbody></table>
    </details>`;
}

function Report({ m, res, sys, reb }) {
  const g = res.ext.g;
  const date = new Date().toLocaleDateString('de-DE');
  const stp = (s) => html`<div class="stp"><div>${s.label}<div class="f">${s.formula}</div>${s.ref && html`<div class="ref">${s.ref}</div>`}</div><div class="r">${s.result}</div></div>`;
  return html`<article class="report">
    <h1>${m.name}</h1>
    <div class="meta">Winkelstützmauer · ${res.ext.norm.label} · DIN EN 1992-1-1 · ${date} · Vorbemessung, ersetzt keine prüffähige Statik</div>
    <h2>1 System und Eingabe</h2>
    <div class="figs"><div dangerouslySetInnerHTML=${{ __html: sys.svg }}></div><div dangerouslySetInnerHTML=${{ __html: reb.svg }}></div></div>
    <table class="t" style="margin-top:10px"><tbody>
      ${FIELDS.map((f) => html`<tr><td>${HELP[f.path]?.short ?? f.path}</td><td class="mono"><${Sym} s=${f.sym} /></td><td class="n">${fmt(getPath(m, f.path), f.int ? 0 : 2)}</td><td>${f.unit}</td></tr>`)}
      <tr><td>Beton</td><td></td><td class="n">${m.rc.concrete}</td><td></td></tr>
    </tbody></table>
    <h2>2 Einwirkungen (charakteristisch, je lfm)</h2>
    <table class="t"><thead><tr><th>Einwirkung</th><th></th><th class="n">V [kN]</th><th class="n">x [m]</th><th class="n">H [kN]</th><th class="n">y [m]</th></tr></thead>
      <tbody>${res.ext.list.map((a) => html`<tr><td>${a.label}</td><td>${a.kind}</td><td class="n">${fmt(a.V)}</td><td class="n">${fmt(a.x)}</td><td class="n">${fmt(a.H)}</td><td class="n">${fmt(a.y)}</td></tr>`)}</tbody></table>
    <p class="mono" style="font-size:11px;color:var(--text-3)">K_ah = ${fmt(res.ext.pm.Kah, 4)} (lotrechter Schnitt, δ = β) · Höhe Schnitt h_v = ${fmt(g.hv)} m · B = ${fmt(g.B)} m</p>
    <h2>3 Gleichgewichtskontrolle (charakteristisch)</h2>
    <table class="t"><thead><tr><th>Kombination</th><th class="n">ΣV [kN]</th><th class="n">ΣH [kN]</th><th class="n">ΣM um Talkante [kNm]</th><th class="n">x_R [m]</th><th class="n">e [m]</th></tr></thead>
      <tbody>${res.ext.combos.map((c) => html`<tr><td>${c.label}</td><td class="n">${fmt(c.k.V)}</td><td class="n">${fmt(c.k.H)}</td><td class="n">${fmt(c.k.M)}</td><td class="n">${fmt(c.k.xR, 3)}</td><td class="n">${fmt(c.k.e, 3)}</td></tr>`)}</tbody></table>
    <h2>4 Nachweise</h2>
    ${res.checks.map((c) => html`<section style="break-inside:avoid;margin-bottom:12px"><h3 class="sec" style="margin:14px 0 4px">${c.label}${c.combo ? ` · ${c.combo}` : ''}</h3>
      ${c.steps.map(stp)}<div class="res">η = ${fmt(c.eta)} ${c.status === 'fail' ? '✕ nicht erfüllt' : c.status === 'warn' ? '! erfüllt (knapp)' : '✓ erfüllt'}</div></section>`)}
    <h2>5 Bewehrung</h2>
    <${Schedule} res=${res} m=${m} onSel=${() => {}} />
  </article>`;
}

render(html`<${App} />`, document.getElementById('app'));
