// Zahlenformat deutsch (Dezimalkomma), feste Nachkommastellen.
export const fmt = (v, d = 2) =>
  Number.isFinite(v) ? v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–';

/** Rechenschritt als strukturierte Daten, gemeinsam genutzt von UI und Bericht */
export const step = (label, formula, result, ref = '') => ({ label, formula, result, ref });

/** Status aus Ausnutzung */
export const statusOf = (eta) => (!Number.isFinite(eta) || eta > 1.0 + 1e-9 ? 'fail' : eta > 0.9 ? 'warn' : 'ok');

/** Ausdruck in Eingabefeldern auswerten: "2,5+0,3" → 2.8 */
export function evalExpr(text) {
  const s = String(text).trim().replace(/,/g, '.');
  if (!/^[0-9+\-*/(). eE]+$/.test(s)) return NaN;
  try {
    const v = Function(`"use strict";return (${s})`)();
    return typeof v === 'number' ? v : NaN;
  } catch { return NaN; }
}
