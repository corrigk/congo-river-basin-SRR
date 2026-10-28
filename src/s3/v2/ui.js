// Small DOM and chart helpers for the Function flow and ConOps tabs (ported from the brief v2 prototype).
// Every chart comes with a table view (chartBlock) for accessibility and for reading exact values aloud.

export const $ = (s, r = document) => r.querySelector(s);
export const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
export const fmt = (n, d = 0) => (n == null || Number.isNaN(n) ? '–' : Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }));
export const fmtM = n => `$${fmt(n, n < 10 ? 1 : 0)}M`;

export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false && k !== '') e.append(k);
  return e;
}
const NS = 'http://www.w3.org/2000/svg';
export function sv(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
  if (parent) parent.append(e);
  return e;
}
export const svText = (parent, attrs, text) => { const t = sv('text', attrs, parent); t.textContent = text; return t; };

// ---------- tooltip ----------
let tipEl = null;
export function showTip(ev, nodes) {
  tipEl ||= document.body.appendChild(el('div', { class: 'v2-tip', role: 'status' }));
  tipEl.replaceChildren(...nodes);
  tipEl.style.display = 'block';
  const x = Math.min(ev.clientX + 14, innerWidth - tipEl.offsetWidth - 8), y = Math.min(ev.clientY + 14, innerHeight - tipEl.offsetHeight - 8);
  tipEl.style.transform = `translate(${x}px, ${y}px)`;
}
export function hideTip() { if (tipEl) tipEl.style.display = 'none'; }
export const kv = (k, v) => el('div', {}, el('span', { class: 'k', text: `${k} ` }), el('b', { text: v }));

// ---------- controls ----------
// Segmented buttons. items: [[value, label]]; onPick(value).
export function seg(items, current, onPick, label) {
  return el('div', { class: 'seg', role: 'group', 'aria-label': label },
    items.map(([v, l]) => el('button', { 'aria-pressed': String(current === v), onclick: () => onPick(v), text: l })));
}
export const tag = (text, kind = 'assume') => el('span', { class: `vtag is-${kind}`, text });

// A chart with a Chart / Table switch. rows: [[header...], ...rows]; the first row is the header.
const tableMode = new Set();
export function chartBlock(id, title, chartNode, rows, extra = []) {
  const showTable = tableMode.has(id);
  const table = el('table', { class: 'vtable' },
    el('thead', {}, el('tr', {}, rows[0].map(h => el('th', { text: h })))),
    el('tbody', {}, rows.slice(1).map(r => el('tr', {}, r.map((c, i) => el(i ? 'td' : 'th', { text: c, scope: i ? null : 'row' }))))));
  const toggle = el('button', { class: 'vtoggle', 'aria-pressed': String(showTable), onclick: e => {
    tableMode.has(id) ? tableMode.delete(id) : tableMode.add(id);
    const on = tableMode.has(id);
    e.currentTarget.setAttribute('aria-pressed', on);
    e.currentTarget.textContent = on ? 'Chart' : 'Table';
    chartWrap.hidden = on; tableWrap.hidden = !on;
  }, text: showTable ? 'Chart' : 'Table', 'aria-label': `Show ${title} as a table` });
  const chartWrap = el('div', { class: 'vchart' }, chartNode);
  const tableWrap = el('div', { class: 'vtable-wrap' }, table);
  chartWrap.hidden = showTable; tableWrap.hidden = !showTable;
  return el('div', { class: 'vcard' }, el('div', { class: 'vcard-h' }, el('h3', { text: title }), ...extra, toggle), chartWrap, tableWrap);
}
export const card = (title, ...kids) => el('div', { class: 'vcard' }, title ? el('div', { class: 'vcard-h' }, el('h3', { text: title })) : null, ...kids);

// Horizontal stacked bar(s). bars: [{ label, sub, parts: [{ v, color, name }], total }]; refs: [{ v, label, color }].
export function stackBars({ bars, xMax, refs = [], W = 640, rowH = 34, gap = 30, left = 78, fmtV = v => fmt(v), unit = '' }) {
  const top = 22, H = top + bars.length * (rowH + gap);
  const s = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'vsvg', role: 'img', 'aria-label': bars.map(b => b.label).join(', ') });
  const X = v => left + (v / xMax) * (W - left - 16);
  bars.forEach((b, bi) => {
    const y = top + bi * (rowH + gap);
    svText(s, { x: 0, y: y + rowH / 2 - 1, class: 'lbl' }, b.label);
    if (b.sub) svText(s, { x: 0, y: y + rowH / 2 + 13, class: 'sub' }, b.sub);
    let acc = 0;
    for (const p of b.parts) {
      if (p.v <= 0) continue;
      const x = X(acc), w = X(acc + p.v) - x;
      const r = sv('rect', { x: x + 1, y, width: Math.max(w - 2, 1), height: rowH, rx: 4, fill: p.color, class: p.dim ? 'is-dim' : '' }, s);
      r.addEventListener('pointermove', ev => showTip(ev, [el('b', { text: p.tip ?? `${fmtV(p.v)}${unit}` }), el('div', { class: 'k', text: p.name })]));
      r.addEventListener('pointerleave', hideTip);
      if (p.label && w > 46) svText(s, { x: x + w / 2, y: y + rowH / 2 + 4, 'text-anchor': 'middle', class: 'in' }, p.label);
      acc += p.v;
    }
  });
  refs.forEach(r => {
    if (r.v > xMax) return;
    sv('line', { x1: X(r.v), x2: X(r.v), y1: top - 8, y2: H - gap + 8, stroke: r.color, 'stroke-width': 2, 'stroke-dasharray': '5 3' }, s);
    svText(s, { x: X(r.v), y: top - 11, 'text-anchor': 'middle', class: 'lbl' }, r.label);
  });
  return s;
}
