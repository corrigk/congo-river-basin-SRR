// SDR workbench tab: configure the system with catalog equipment (left), and read what it delivers, costs and risks
// (right) on six tabs: Overview, Cost over time, Decide, Explore (optimizer + Pareto cloud), Sensitivity, Catalog.
// Designs are saved in the browser and exported/imported as JSON files to share through git (designs/ folder).
import { D, stations as loadStations, YEARS } from '../s3/v2/data.js';
import { el, seg, fmt, sv, svText, chartBlock, showTip, hideTip, kv, card } from '../s3/v2/ui.js';
import { evaluateDesign, DEFAULT_DESIGN, DEFAULT_WEIGHTS, CRITERIA, CAP_MUSD, LIFE, START_YEAR, KNOBS, FAIL_CASES } from './engine.js';
import { ELEMENTS, ELEMENT, opt, BASIS } from './catalog.js';
import { weightedScore, contributions, winnerMap, flips, robustness, rank } from './decide.js';
import { OBJECTIVES, frontier } from './optimize.js';
import { tornado, elasticity, OUTCOMES } from './sensitivity.js';
import { LEO_SIZES } from '../s3/conops/model.js';
import '../s3/v2/v2.css';
import './sdr.css';

const PRESETS = Object.values(import.meta.glob('../../designs/*.json', { eager: true, import: 'default' }));
const TABS = [['overview', 'Overview'], ['time', 'Cost over time'], ['decide', 'Decide'], ['explore', 'Explore'], ['sens', 'Sensitivity'], ['catalog', 'Catalog']];
const COLORS = ['--s1', '--s2', '--s4', '--s7', '--s5', '--s3', '--s6'];
const NAMES = { 'S3-01': 'Coverage', 'S3-02': 'Capacity', 'S3-03': 'Priority ≤30 min', 'S3-04': 'Terminal ≤$150', 'S3-05': 'Alert ≤10 min', 'S3-06': 'Targeting', 'S3-07': 'Receiver ≤$25', 'S3-08': 'Responders', 'S3-09': 'Command ≤6 h', 'S3-10': 'Availability', LCC: 'Cost ≤$400M' };
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window: nothing kept */ } },
};
const S = {
  d: store.get('sdr-design', null) || DEFAULT_DESIGN(), prev: null, tab: 'overview',
  weights: store.get('sdr-weights', { ...DEFAULT_WEIGHTS }), penalty: 0.6, budget: CAP_MUSD, yAxis: 'pop', tOut: 'lcc',
  saved: store.get('sdr-saved', []), compare: store.get('sdr-compare', null), opt: null, mc: null, busy: null, sens: null,
};
let root = null, ctx = null, R = null, worker = null, jobs = 0;
const $ = s => root.querySelector(s);
const fill = (node, ...kids) => node.replaceChildren(...kids.flat(Infinity).filter(k => k != null && k !== false && k !== ''));
const persist = () => { store.set('sdr-design', S.d); store.set('sdr-weights', S.weights); store.set('sdr-saved', S.saved); store.set('sdr-compare', S.compare); };
const allDesigns = () => [...PRESETS.map(p => ({ ...p, preset: true })), ...S.saved];
const money = v => (Number.isFinite(v) ? `$${fmt(v, Math.abs(v) < 10 ? 1 : 0)}M` : '–');
const mins = v => (Number.isFinite(v) ? (v >= 120 ? `${fmt(v / 60, 1)} h` : `${fmt(v, v < 10 ? 1 : 0)} min`) : 'saturated');
const btag = b => el('span', { class: `vtag sd-b is-${b}`, title: BASIS[b]?.title, text: BASIS[b]?.label || b });
const col = i => `var(${COLORS[i % COLORS.length]})`;

export async function mount(host) {
  root = host;
  root.replaceChildren(el('div', { class: 'v2-loading', text: 'Loading the SDR workbench…' }));
  ctx = { D, Y: {} };
  await ensureYear(S.d.year);
  root.replaceChildren(el('div', { class: 'sd' },
    el('div', { class: 'sd-head' },
      el('div', { class: 'sd-titles' }, el('span', { class: 'sd-kicker', text: 'SDR · decision workbench' }), el('h2', { class: 'sd-title', text: 'Design the system, then defend it' })),
      el('div', { class: 'sd-bar' })),
    el('div', { class: 'sd-body' }, el('aside', { class: 'sd-cfg', 'aria-label': 'Configure the design' }), el('main', { class: 'sd-main' }, el('div', { class: 'sd-tabs' }), el('div', { class: 'sd-pane' })))));
  update();
}
export function refit() { if (root && R) renderPane(); }

async function ensureYear(y) { if (!ctx.Y[y]) ctx.Y[y] = await loadStations(y); }
function update() {
  R = evaluateDesign(ctx, S.d, { withFails: true });
  persist();
  renderBar(); renderCfg(); renderTabs(); renderPane();
}
function setD(patch, { keepOpt = true } = {}) {
  S.d = { ...S.d, ...patch, pick: { ...S.d.pick, ...(patch.pick || {}) } };
  S.sens = null; S.mc = null;
  if (!keepOpt) S.opt = null;
  update();
}
function loadDesign(d) { S.prev = S.d; S.d = structuredClone(d); delete S.d.preset; S.sens = null; S.mc = null; ensureYear(S.d.year).then(update); }

// ---------- design bar: name, save, compare, export / import ----------
function renderBar() {
  const list = allDesigns();
  const pick = el('select', { 'aria-label': 'Open a saved design', onchange: e => { const d = list[+e.target.value]; if (d) loadDesign(d); e.target.value = ''; } },
    el('option', { value: '', text: 'Open a design…' }), list.map((d, i) => el('option', { value: i, text: `${d.preset ? '★ ' : ''}${d.name}` })));
  const name = el('input', { class: 'sd-name', value: S.d.name, 'aria-label': 'Design name', onchange: e => { S.d.name = e.target.value || 'Untitled'; persist(); renderTabs(); } });
  const save = () => {
    const i = S.saved.findIndex(x => x.name === S.d.name);
    if (i >= 0) S.saved[i] = structuredClone(S.d); else S.saved.push(structuredClone(S.d));
    if (!(S.compare || []).includes(S.d.name)) S.compare = [...(S.compare || defaultCompare()), S.d.name];
    persist(); renderBar(); if (S.tab === 'decide') renderPane(); flash(`Saved "${S.d.name}"`);
  };
  const exportJson = () => download(`${slug(S.d.name)}.json`, JSON.stringify(S.d, null, 2));
  const importJson = el('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: async e => {
    for (const f of e.target.files) { try { const d = JSON.parse(await f.text()); for (const x of Array.isArray(d) ? d : [d]) if (x.pick) { S.saved = S.saved.filter(s => s.name !== x.name).concat(x); } } catch { flash(`Could not read ${f.name}`); } }
    persist(); renderBar(); flash('Imported');
  } });
  fill($('.sd-bar'), pick, name,
    el('button', { class: 'sd-btn is-primary', onclick: save, text: 'Save' }),
    el('button', { class: 'sd-btn', onclick: () => { S.d = { ...structuredClone(S.d), name: `${S.d.name} (copy)` }; save(); update(); }, text: 'Duplicate' }),
    el('button', { class: 'sd-btn', onclick: exportJson, title: 'Download this design as a JSON file (commit it under designs/ to share)', text: 'Export' }),
    el('button', { class: 'sd-btn', onclick: () => importJson.click(), text: 'Import' }), importJson,
    S.prev ? el('button', { class: 'sd-btn', onclick: () => { const p = S.prev; S.prev = S.d; S.d = p; update(); }, text: 'Undo load' }) : null,
    el('button', { class: 'sd-btn', onclick: () => loadDesign(DEFAULT_DESIGN()), text: 'Reset' }),
    el('span', { class: 'sd-flash', role: 'status' }));
}
let flashT; function flash(t) { const f = $('.sd-flash'); if (!f) return; f.textContent = t; clearTimeout(flashT); flashT = setTimeout(() => { f.textContent = ''; }, 2500); }
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'design';
function download(name, text, type = 'application/json') {
  const a = el('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name }); document.body.append(a); a.click(); a.remove();
}

// ---------- configurator ----------
function renderCfg() {
  const d = S.d, own = opt('leo', d.pick.leo).perf.kind === 'own';
  const slider = (label, key, min, max, step, unit = '', note = '') => {
    const out = el('b', { text: `${d[key]}${unit}` });
    const inp = el('input', { type: 'range', min, max, step, value: d[key], 'aria-label': label, oninput: e => { out.textContent = `${e.target.value}${unit}`; }, onchange: e => setD({ [key]: +e.target.value }) });
    return el('div', { class: 'sd-num' }, el('div', { class: 'sd-num-h' }, el('span', { text: label }), out), inp, note ? el('small', { text: note }) : null);
  };
  const segs = (label, key, vals, fmtv = v => String(v), disabled = false) => el('div', { class: `sd-num${disabled ? ' is-off' : ''}` }, el('div', { class: 'sd-num-h' }, el('span', { text: label })),
    seg(vals.map(v => [v, fmtv(v)]), d[key], v => setD({ [key]: v }), label));
  const nMax = ctx.Y[d.year].runs[d.mode].stations.length;
  const groups = {};
  for (const e of ELEMENTS) (groups[e.segment] ||= []).push(e);
  const elementBox = e => {
    const cur = opt(e.id, d.pick[e.id]), off = e.id === 'launch' && !own;
    return el('details', { class: `sd-el${off ? ' is-off' : ''}`, open: S.openEl === e.id || null, ontoggle: ev => { if (ev.target.open) S.openEl = e.id; } },
      el('summary', {}, el('span', { class: 'sd-el-n', text: e.name }), el('span', { class: 'sd-el-v', text: off ? 'not used' : cur.name })),
      el('p', { class: 'sd-help', text: e.help }),
      e.options.map(o => el('label', { class: `sd-opt${o.id === cur.id ? ' is-on' : ''}` },
        el('input', { type: 'radio', name: `sd-${e.id}`, checked: o.id === cur.id || null, onchange: () => setD({ pick: { [e.id]: o.id } }) }),
        el('span', { class: 'sd-opt-b' }, el('b', { text: o.name }), el('small', { text: optSummary(e.id, o) }), el('span', { class: 'sd-opt-tags' }, btag(o.basis), el('i', { class: 'sd-risk', title: 'Risk 1 (flown) to 5 (new)', text: `risk ${o.risk}` }), o.leadYr ? el('i', { class: 'sd-risk', text: `${o.leadYr} yr lead` }) : null)))));
  };
  fill($('.sd-cfg'), 
    el('h3', { class: 'sd-h', text: 'Sizing' }),
    segs('Population year', 'year', YEARS),
    slider('Ranger stations', 'n', 2, Math.min(200, nMax), 1, '', 'Placed in the SRR optimizer\'s order (mix of reach goals)'),
    slider('Canopy repeaters', 'repeaters', 0, 300, 10),
    segs('Satellites', 'leoSats', LEO_SIZES, String, !own),
    segs('Spares per plane', 'sparesPerPlane', [0, 1], String, !own),
    segs('Database nodes (hub + regional)', 'dbNodes', [1, 2, 3, 4]),
    segs('Raised antennas on fixed sensors', 'raised', [false, true], v => (v ? 'Yes' : 'No')),
    slider('Sensors (× SRR baseline)', 'sensorScale', 0.5, 4, 0.25, '×'),
    slider('Discount rate (0 = nominal)', 'discountPct', 0, 10, 0.5, '%'),
    Object.entries(groups).map(([g, es]) => [el('h3', { class: 'sd-h', text: g }), es.map(elementBox)]));
}
function optSummary(eid, o) {
  const p = o.perf || {};
  const parts = [];
  if (o.capexUsd) parts.push(o.capexUsd >= 1e6 ? `$${fmt(o.capexUsd / 1e6, 1)}M` : `$${fmt(o.capexUsd)}`);
  if (o.perKgUsd) parts.push(`+ $${fmt(o.perKgUsd)}/kg over 50 kg`);
  if (o.hubUsd) parts.push(`hub $${fmt(o.hubUsd / 1e6, 1)}M, node $${fmt(o.nodeUsd / 1e6, 1)}M`);
  if (o.opexUsdYr) parts.push(`$${fmt(o.opexUsdYr >= 1e6 ? o.opexUsdYr / 1e6 : o.opexUsdYr, o.opexUsdYr >= 1e6 ? 1 : 0)}${o.opexUsdYr >= 1e6 ? 'M' : ''}/yr`);
  if (p.moduleUsd) parts.push(`module $${p.moduleUsd}, $${p.airtimeUsdMo}/device/mo`);
  if (p.kbpsPerSat && p.kind === 'own') parts.push(`${p.kbpsPerSat} kbps/sat`);
  if (o.fte) parts.push(`${o.fte} staff × $${fmt(o.usdPerFteYr / 1000)}k`);
  if (o.lifeYr && o.lifeYr < 15) parts.push(`${o.lifeYr}-yr life`);
  if (o.battLifeYr) parts.push(`battery every ${o.battLifeYr} yr`);
  if (p.inclination && eid === 'launch') parts.push(`${p.inclination}° orbit`);
  if (p.mbps != null && eid === 'backhaul') parts.push(`${p.mbps} Mbps/site`);
  return parts.join(' · ');
}

// ---------- tabs ----------
function renderTabs() {
  fill($('.sd-tabs'), 
    seg(TABS, S.tab, t => { S.tab = t; renderTabs(); renderPane(); }, 'Workbench view'),
    el('div', { class: 'sd-score', title: 'Team-weighted score of the current design (Decide tab)' },
      el('span', { text: 'Score' }), el('b', { text: fmt(weightedScore(R, S.weights, S.penalty) * 100) }),
      el('i', { class: `sd-pill is-${R.compliant ? 'pass' : 'fail'}`, text: R.compliant ? 'Meets every requirement' : `${R.checks.filter(c => !c.ok).length} requirement${R.checks.filter(c => !c.ok).length > 1 ? 's' : ''} missed` })));
}
function renderPane() {
  const pane = $('.sd-pane');
  const f = { overview, time: timeTab, decide: decideTab, explore: exploreTab, sens: sensTab, catalog: catalogTab }[S.tab];
  fill(pane, f());
}

// ---------- overview ----------
function kpis() {
  const m = R.metrics;
  const cells = [
    [money(R.lcc), `15-year cost (${money(R.total.low)}–${money(R.total.high)})${S.d.discountPct ? ', NPV' : ''}`, R.lcc <= CAP_MUSD ? 'pass' : 'fail'],
    [money(R.capexTotal), 'setup (capex)'],
    [money(R.opexYr), 'running cost a year'],
    [`${START_YEAR + R.ioc - 1}`, `first service (driven by ${ELEMENT[R.driver]?.name.split(' (')[0].toLowerCase() || R.driver})`],
    [mins(m.p95Fast), 'priority message, p95', m.p95Fast <= 30 ? 'pass' : 'fail'],
    [`${fmt(R.R.popPct, 1)}%`, 'of people within a station\'s reach'],
    [`${fmt(R.R.avail * 100, 2)}%`, 'availability (illustrative)', R.R.avail >= 0.995 ? 'pass' : 'fail'],
    [`${fmt(m.util * 100)}%`, 'of uplink capacity used', m.util < 0.8 ? 'pass' : m.util < 1 ? 'near' : 'fail'],
  ];
  return el('div', { class: 'sd-kpis' }, cells.map(([b, s, st]) => el('div', { class: `sd-kpi${st ? ` is-${st}` : ''}` }, el('b', { text: b }), el('span', { text: s }))));
}
function overview() {
  return [kpis(), el('div', { class: 'sd-grid2' }, marginCard(), failCard()), linesCard(), whyCard()];
}
function marginCard() {
  const rows = R.checks.filter(c => c.id !== 'S3-01' && c.id !== 'S3-06').sort((a, b) => a.margin - b.margin);
  const W = 520, rowH = 22, left = 128, H = rows.length * rowH + 26, X = v => left + ((Math.max(-1, Math.min(1, v)) + 1) / 2) * (W - left - 46);
  const s = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'vsvg', role: 'img', 'aria-label': 'Requirement margins' });
  sv('line', { x1: X(0), x2: X(0), y1: 4, y2: H - 18, class: 'sd-axis' }, s);
  [-1, -0.5, 0.5, 1].forEach(v => svText(s, { x: X(v), y: H - 4, 'text-anchor': 'middle', class: 'sub' }, `${v > 0 ? '+' : ''}${v * 100}%`));
  rows.forEach((c, i) => {
    const y = 6 + i * rowH, x0 = X(0), x1 = X(c.margin);
    svText(s, { x: 0, y: y + 13, class: 'lbl' }, `${c.id} ${NAMES[c.id] || ''}`);
    const r = sv('rect', { x: Math.min(x0, x1), y: y + 2, width: Math.max(2, Math.abs(x1 - x0)), height: rowH - 8, rx: 3, fill: `var(${c.state === 'pass' ? (c.margin < 0.1 ? '--alert' : '--good') : c.state === 'near' ? '--alert' : '--critical'})`, class: c === R.tight ? 'sd-tight' : '' }, s);
    svText(s, { x: Math.max(x0, x1) + 5, y: y + 13, class: 'sub' }, `${c.margin >= 0 ? '+' : ''}${fmt(c.margin * 100)}%`);
    r.addEventListener('pointermove', ev => showTip(ev, [el('b', { text: `${c.id} ${NAMES[c.id] || ''}: ${c.state}` }), el('div', { text: c.v }), el('div', { class: 'k', text: c === R.tight ? 'The tightest requirement: the weakest link' : 'Margin = headroom against the threshold' })]));
    r.addEventListener('pointerleave', hideTip);
  });
  return chartBlock('sd-margin', `Requirement margins · weakest link: ${R.tight.id} ${NAMES[R.tight.id] || ''}`, s,
    [['Requirement', 'State', 'Margin', 'Value'], ...rows.map(c => [`${c.id} ${NAMES[c.id] || ''}`, c.state, `${fmt(c.margin * 100)}%`, c.v])]);
}
function failCard() {
  const ids = R.checks.filter(c => c.id !== 'LCC').map(c => c.id);
  const rows = [{ label: 'Nominal', pass: R.checks.filter(c => c.id !== 'LCC'), f: null }, ...R.fails.map(f => ({ label: f.label, failed: f.failed || [], f }))];
  const grid = el('div', { class: 'sd-fail', role: 'table' },
    el('div', { class: 'sd-fail-r is-h', role: 'row' }, el('span', { text: '' }), ids.map(id => el('span', { title: NAMES[id], text: id.replace('S3-', '') }))),
    rows.map(r => el('div', { class: 'sd-fail-r', role: 'row' }, el('span', { class: 'sd-fail-l', text: r.label }),
      ids.map(id => { const bad = r.f ? (r.f.failed || []).includes(id) : !R.checks.find(c => c.id === id).ok; return el('i', { class: bad ? 'is-bad' : 'is-ok', title: `${r.label}: ${id} ${bad ? 'fails' : 'passes'}`, text: bad ? '✕' : '✓' }); }))));
  return chartBlock('sd-fails', `Failure scorecard · resilience ${fmt(R.criteria.resilience * 100)}%`, el('div', {}, grid,
    el('p', { class: 'sd-note', text: 'Each row reruns the design with one element down. "Grid and cell down" changes nothing here: stations and receivers have their own power.' })),
    [['Case', ...ids], ...rows.map(r => [r.label, ...ids.map(id => (r.f ? ((r.f.failed || []).includes(id) ? 'fail' : 'pass') : R.checks.find(c => c.id === id).state))])]);
}
function linesCard() {
  const lines = [...R.lines].sort((a, b) => b.base - a.base), max = Math.max(...lines.map(l => l.high));
  const body = el('div', { class: 'sd-lines' },
    el('div', { class: 'sd-line is-h' }, ['Line', 'Basis', 'Setup', 'Running', 'Replace', '15-yr', 'Range'].map(t => el('span', { text: t }))),
    lines.map(l => el('div', { class: 'sd-line' },
      el('span', { class: 'sd-line-n', text: l.name }), el('span', {}, btag(l.basis)),
      el('span', { text: money(l.capex) }), el('span', { text: money(l.opex) }), el('span', { text: money(l.repl) }), el('b', { text: money(l.base) }),
      el('span', { class: 'sd-range' }, el('i', { style: `left:${(l.low / max) * 100}%;width:${((l.high - l.low) / max) * 100}%` }), el('em', { style: `left:${(l.base / max) * 100}%` })))),
    el('div', { class: 'sd-line is-t' }, el('span', { text: 'Total' }), el('span'), el('span', { text: money(R.capexTotal) }), el('span', { text: money(R.lines.reduce((a, l) => a + l.opex, 0)) }), el('span', { text: money(R.lines.reduce((a, l) => a + l.repl, 0)) }), el('b', { text: money(R.total.base) }), el('span', { text: `${money(R.total.low)}–${money(R.total.high)}` })));
  return chartBlock('sd-lines', 'Life-cycle cost by line, 15 years', body,
    [['Line', 'Basis', 'Setup $M', 'Running $M', 'Replace $M', '15-yr $M', 'Low', 'High'], ...lines.map(l => [l.name, l.basis, fmt(l.capex, 1), fmt(l.opex, 1), fmt(l.repl, 1), fmt(l.base, 1), fmt(l.low, 1), fmt(l.high, 1)])]);
}
// Plain-language explanation of the current design (also the start of the decision log).
function explain(r = R) {
  const d = r.design, p = r.P, m = r.metrics, big = [...r.lines].sort((a, b) => b.base - a.base).slice(0, 3);
  const out = [];
  out.push(`${d.name}: ${r.own ? `${r.sats} ${p.leo.name.replace(/^Own /, '').toLowerCase()} on ${p.launch.name.toLowerCase()}` : p.leo.name.replace('Commercial service: ', 'the commercial ') + ' service'}, ${p.geo.perf.ok ? p.geo.name.toLowerCase() : 'no GEO broadcast'}, ${d.n} ranger stations, ${d.repeaters} repeaters and ${d.dbNodes} database node${d.dbNodes > 1 ? 's' : ''}.`);
  out.push(`It costs ${money(r.total.base)} over 15 years (range ${money(r.total.low)}–${money(r.total.high)}): ${money(r.capexTotal)} to set up and ${money(r.opexYr)} a year to run. The biggest lines are ${big.map(l => `${l.name.toLowerCase()} (${money(l.base)})`).join(', ')}.`);
  out.push(r.compliant ? `It meets every Level 0 requirement. The tightest is ${r.tight.id} ${NAMES[r.tight.id] || ''} with ${fmt(r.tight.margin * 100)}% margin.` : `It misses ${r.checks.filter(c => !c.ok).map(c => `${c.id} ${NAMES[c.id] || ''}`).join(', ')}.`);
  out.push(`Priority sensor messages reach the COP in ${mins(m.p95Fast)} (p95); ${fmt(r.R.within30 * 100)}% arrive within 30 minutes. Uplink use is ${fmt(m.util * 100)}% of capacity. ${fmt(r.R.popPct, 1)}% of people live within a station's reach.`);
  if (r.fails) { const weak = r.fails.filter(f => f.pass < 1); out.push(weak.length ? `Under failure it is weakest when ${weak.map(f => `${f.label.toLowerCase()} (${(f.failed || []).join(', ')})`).join('; ')}.` : 'It keeps passing in every failure case.'); }
  out.push(`First service in ${START_YEAR + r.ioc - 1}, set by the ${r.driver} lead time.`);
  return out;
}
function whyCard() { return card('This design in words', el('div', { class: 'sd-why' }, explain().map(t => el('p', { text: t })))); }

// ---------- cost over time ----------
function timeTab() {
  const P = R.perYear, band = S.mc?.band;
  const W = 680, H = 260, l = 46, r = 54, t = 16, b = 28, maxBar = Math.max(...P.map(p => p.total)) * 1.1, maxCum = Math.max(CAP_MUSD * 1.05, P.at(-1).cum, band ? band.at(-1).p90 : 0) * 1.05;
  const bw = (W - l - r) / LIFE, X = i => l + i * bw, Yb = v => H - b - (v / maxBar) * (H - t - b), Yc = v => H - b - (v / maxCum) * (H - t - b);
  const s = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'vsvg', role: 'img', 'aria-label': 'Cost by year and cumulative cost' });
  for (let k = 0; k <= 4; k++) { const v = (maxCum * k) / 4; sv('line', { x1: l, x2: W - r, y1: Yc(v), y2: Yc(v), class: 'sd-grid' }, s); svText(s, { x: W - r + 4, y: Yc(v) + 4, class: 'sub' }, `$${fmt(v)}M`); }
  for (let k = 0; k <= 3; k++) { const v = (maxBar * k) / 3; svText(s, { x: l - 4, y: Yb(v) + 4, 'text-anchor': 'end', class: 'sub' }, `${fmt(v)}`); }
  svText(s, { x: 2, y: 10, class: 'sub' }, '$M / yr');
  P.forEach((p, i) => {
    let acc = 0;
    for (const [k, c, name] of [['capex', '--s1', 'Setup'], ['opex', '--s4', 'Running'], ['repl', '--s2', 'Replacement']]) {
      if (p[k] <= 0) continue;
      const rect = sv('rect', { x: X(i) + 3, y: Yb(acc + p[k]), width: bw - 6, height: Yb(acc) - Yb(acc + p[k]), rx: 2, fill: `var(${c})` }, s);
      rect.addEventListener('pointermove', ev => showTip(ev, [el('b', { text: `${p.cal}: ${money(p.total)}` }), kv('Setup', money(p.capex)), kv('Running', money(p.opex)), kv('Replacement', money(p.repl)), kv('Cumulative', money(p.cum)),
        el('div', { class: 'k', text: R.lines.filter(x => x.byYear[i] > 0.05).sort((a, b2) => b2.byYear[i] - a.byYear[i]).slice(0, 3).map(x => `${x.name}: ${money(x.byYear[i])}`).join(' · ') })]));
      rect.addEventListener('pointerleave', hideTip);
      acc += p[k];
    }
    if (i % 2 === 0) svText(s, { x: X(i) + bw / 2, y: H - 10, 'text-anchor': 'middle', class: 'sub' }, String(p.cal));
  });
  if (band) sv('path', { d: `M${band.map((q, i) => `${X(i) + bw / 2},${Yc(q.p90)}`).join('L')}L${[...band].reverse().map((q, i) => `${X(LIFE - 1 - i) + bw / 2},${Yc(q.p10)}`).join('L')}Z`, class: 'sd-band' }, s);
  sv('path', { d: `M${P.map((p, i) => `${X(i) + bw / 2},${Yc(p.cum)}`).join('L')}`, class: 'sd-cum' }, s);
  sv('line', { x1: l, x2: W - r, y1: Yc(CAP_MUSD), y2: Yc(CAP_MUSD), class: 'sd-cap' }, s);
  svText(s, { x: l + 4, y: Yc(CAP_MUSD) - 5, class: 'lbl' }, `$${CAP_MUSD}M cap`);
  const legend = el('div', { class: 'sd-legend' }, [['--s1', 'Setup'], ['--s4', 'Running'], ['--s2', 'Replacement'], ['--accent', 'Cumulative (right axis)']].map(([c, t2]) => el('span', {}, el('i', { style: `background:var(${c})` }), t2)),
    band ? el('span', {}, el('i', { class: 'is-band' }), 'Monte Carlo 10th–90th percentile') : el('button', { class: 'sd-btn', onclick: () => runMc().then(() => renderPane()), text: 'Add Monte Carlo band' }));
  const chart = chartBlock('sd-time', 'Cost by year, 2027–2041', el('div', {}, s, legend),
    [['Year', 'Setup $M', 'Running $M', 'Replacement $M', 'Total $M', 'Cumulative $M'], ...P.map(p => [String(p.cal), fmt(p.capex, 1), fmt(p.opex, 1), fmt(p.repl, 1), fmt(p.total, 1), fmt(p.cum, 1)])]);
  return [chart, el('div', { class: 'sd-grid2' }, ganttCard(), segCard())];
}
function ganttCard() {
  const rows = Object.entries(R.lead).filter(([k, v]) => v > 0 && !(k === 'launch' && !R.own)).sort((a, b) => b[1] - a[1]);
  const W = 420, rowH = 22, left = 130, H = rows.length * rowH + 30, X = y => left + (y / 6) * (W - left - 10);
  const s = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'vsvg', role: 'img', 'aria-label': 'Lead time to first service by element' });
  for (let y = 0; y <= 6; y++) { sv('line', { x1: X(y), x2: X(y), y1: 4, y2: H - 20, class: 'sd-grid' }, s); svText(s, { x: X(y), y: H - 6, 'text-anchor': 'middle', class: 'sub' }, String(START_YEAR + y)); }
  rows.forEach(([k, v], i) => {
    const y = 6 + i * rowH;
    svText(s, { x: 0, y: y + 13, class: 'lbl' }, ELEMENT[k].name.split(' (')[0]);
    sv('rect', { x: X(0), y: y + 3, width: X(v) - X(0), height: rowH - 8, rx: 3, fill: `var(${k === R.driver ? '--accent' : '--s1'})`, opacity: k === R.driver ? 1 : 0.7 }, s);
    svText(s, { x: X(v) + 4, y: y + 13, class: 'sub' }, `${v} yr · ${opt(k, S.d.pick[k]).name.split(',')[0]}`);
  });
  sv('line', { x1: X(R.ioc), x2: X(R.ioc), y1: 2, y2: H - 20, class: 'sd-cap' }, s);
  return chartBlock('sd-gantt', `Build and launch: first service ${START_YEAR + R.ioc - 1}`, s, [['Element', 'Lead (yr)', 'Choice'], ...rows.map(([k, v]) => [ELEMENT[k].name, String(v), opt(k, S.d.pick[k]).name])]);
}
function segCard() {
  const segs = {}; for (const l of R.lines) segs[l.seg] = (segs[l.seg] || 0) + l.base;
  const tot = Object.values(segs).reduce((a, b) => a + b, 0), order = Object.entries(segs).sort((a, b) => b[1] - a[1]);
  const body = el('div', { class: 'sd-segs' }, order.map(([g, v], i) => el('div', { class: 'sd-seg' }, el('span', { text: g }), el('div', { class: 'sd-segbar' }, el('i', { style: `width:${(v / tot) * 100}%;background:${col(i)}` })), el('b', { text: `${money(v)} · ${fmt((v / tot) * 100)}%` }))),
    el('p', { class: 'sd-note', text: `Setup is ${fmt((R.capexTotal / R.total.base) * 100)}% of the 15-year cost; replacements are ${fmt((R.lines.reduce((a, l) => a + l.repl, 0) / R.total.base) * 100)}%.` }));
  return chartBlock('sd-segs', 'Cost by segment', body, [['Segment', '$M', 'Share'], ...order.map(([g, v]) => [g, fmt(v, 1), `${fmt((v / tot) * 100)}%`])]);
}

// ---------- decide ----------
function defaultCompare() { return PRESETS.map(p => p.name); }
function compareSet() {
  const names = S.compare || defaultCompare();
  const ds = allDesigns().filter(d => names.includes(d.name) && d.name !== S.d.name);
  const opt2 = S.opt ? OBJECTIVES.map(o => S.opt.best[o.id]?.point.d && { ...S.opt.best[o.id].point.d, name: `Optimizer: ${o.short}` }).filter(Boolean) : [];
  const list = [{ ...S.d, name: `${S.d.name} (current)` }, ...ds, ...opt2];
  const missing = [...new Set(list.map(d => d.year).filter(y => !ctx.Y[y]))];
  if (missing.length) Promise.all(missing.map(ensureYear)).then(() => S.tab === 'decide' && renderPane());
  return list.filter(d => ctx.Y[d.year]).map((d, i) => (i === 0 ? { ...R, design: d } : evaluateDesign(ctx, d, { withFails: true })));
}
function decideTab() {
  const res = compareSet();
  const order = rank(res, S.weights, S.penalty);
  const weights = el('div', { class: 'sd-weights' }, CRITERIA.map(c => {
    const out = el('b', { text: fmt(S.weights[c.id], 1) });
    return el('label', { class: 'sd-w', title: c.help }, el('span', { text: c.label }),
      el('input', { type: 'range', min: 0, max: 10, step: 0.5, value: S.weights[c.id], 'aria-label': `Weight on ${c.label}`, oninput: e => { out.textContent = e.target.value; }, onchange: e => { S.weights[c.id] = +e.target.value; persist(); renderTabs(); renderPane(); } }), out);
  }), el('label', { class: 'sd-w', title: 'Score kept by a design that misses a requirement' }, el('span', { text: 'Non-compliant keeps' }),
    el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: S.penalty, onchange: e => { S.penalty = +e.target.value; renderTabs(); renderPane(); } }), el('b', { text: `${fmt(S.penalty * 100)}%` })),
  el('button', { class: 'sd-btn', onclick: () => { S.weights = { ...DEFAULT_WEIGHTS }; persist(); renderTabs(); renderPane(); }, text: 'Reset weights' }));
  const choose = el('div', { class: 'sd-choose' }, el('span', { class: 'sd-note', text: 'Compare:' }), allDesigns().filter(d => d.name !== S.d.name).map(d => {
    const on = (S.compare || defaultCompare()).includes(d.name);
    return el('button', { class: 'sd-chip', 'aria-pressed': String(on), onclick: () => { const c = S.compare || defaultCompare(); S.compare = on ? c.filter(x => x !== d.name) : [...c, d.name]; persist(); renderPane(); }, text: d.name });
  }), S.opt ? el('span', { class: 'sd-note', text: '+ optimizer winners' }) : el('span', { class: 'sd-note', text: 'Run the optimizer (Explore) to add its winners.' }));
  return [card('Team weights: what matters most to you', weights, choose), rankCard(res, order), el('div', { class: 'sd-grid2' }, winnerCard(res), robustCard(res)), flipCard(res), logCard(res, order)];
}
function rankCard(res, order) {
  const max = Math.max(...order.map(o => o.s), 0.01);
  const rows = order.map(({ i, s }, k) => {
    const r = res[i], parts = contributions(r, S.weights), pen = r.compliant ? 1 : S.penalty;
    return el('div', { class: 'sd-rank' },
      el('span', { class: 'sd-rank-n', text: String(k + 1) }),
      el('div', { class: 'sd-rank-b' },
        el('div', { class: 'sd-rank-h' }, el('i', { class: 'sd-dot', style: `background:${col(i)}` }), el('b', { text: r.design.name }),
          el('span', { class: 'sd-note', text: `${money(r.lcc)} · p95 ${mins(r.metrics.p95Fast)} · ${fmt(r.R.popPct)}% people` }),
          r.compliant ? null : el('i', { class: 'sd-pill is-fail', text: `misses ${r.checks.filter(c => !c.ok).map(c => c.id).join(', ')}` }),
          i ? el('button', { class: 'sd-link', onclick: () => loadDesign({ ...r.design, name: r.design.name.replace(' (current)', '') }), text: 'Open' }) : null),
        el('div', { class: 'sd-stack', style: `width:${(s / max) * 100}%` }, parts.map((p, j) => el('i', { style: `flex:${p.v * pen};background:${col(j)}`, title: `${p.label}: ${fmt(p.raw * 100)}/100 × weight → ${fmt(p.v * pen * 100, 1)} points` })))),
      el('b', { class: 'sd-rank-s', text: fmt(s * 100, 1) }));
  });
  const key = el('div', { class: 'sd-legend' }, CRITERIA.map((c, j) => el('span', {}, el('i', { style: `background:${col(j)}` }), c.label)));
  return chartBlock('sd-rank', 'Ranking: weighted score out of 100, split by criterion', el('div', {}, rows, key),
    [['Rank', 'Design', 'Score', ...CRITERIA.map(c => c.label), 'Compliant'], ...order.map(({ i, s }, k) => [String(k + 1), res[i].design.name, fmt(s * 100, 1), ...CRITERIA.map(c => fmt(res[i].criteria[c.id] * 100)), res[i].compliant ? 'yes' : 'no'])]);
}
function winnerCard(res) {
  const map = winnerMap(res, S.weights, S.penalty);
  const W = 460, rowH = 22, left = 96, H = map.length * rowH + 26, X = v => left + (v / 10) * (W - left - 8);
  const s = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'vsvg', role: 'img', 'aria-label': 'Which design wins as each weight changes' });
  map.forEach((row, k) => {
    const y = 4 + k * rowH;
    svText(s, { x: 0, y: y + 14, class: 'lbl' }, row.label);
    for (const g of row.segs) {
      const r = sv('rect', { x: X(g.from), y: y + 3, width: Math.max(3, X(g.to) - X(g.from) + 4), height: rowH - 8, fill: col(g.lead), rx: 2 }, s);
      r.addEventListener('pointermove', ev => showTip(ev, [el('b', { text: res[g.lead].design.name }), el('div', { text: `wins when ${row.label.toLowerCase()} weight is ${fmt(g.from, 1)}–${fmt(g.to, 1)}` })]));
      r.addEventListener('pointerleave', hideTip);
    }
    sv('path', { d: `M${X(row.w)},${y + 1}l-4,-4h8z M${X(row.w)},${y + rowH - 3}v-${rowH - 6}`, class: 'sd-mark' }, s);
  });
  [0, 5, 10].forEach(v => svText(s, { x: X(v), y: H - 4, 'text-anchor': 'middle', class: 'sub' }, String(v)));
  return chartBlock('sd-winner', 'Winner map: who wins as you turn one weight', el('div', {}, s, el('p', { class: 'sd-note', text: 'Each row turns one weight from 0 to 10 with the others held. One colour across a row means that weight cannot change the answer. ▼ is your current weight.' })),
    [['Criterion', 'Segments (weight range: winner)'], ...map.map(r => [r.label, r.segs.map(g => `${fmt(g.from, 1)}–${fmt(g.to, 1)}: ${res[g.lead].design.name}`).join('; ')])]);
}
function robustCard(res) {
  const p = robustness(res, S.penalty);
  const body = el('div', { class: 'sd-segs' }, p.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).map(([v, i]) => el('div', { class: 'sd-seg' }, el('span', { text: res[i].design.name }), el('div', { class: 'sd-segbar' }, el('i', { style: `width:${v * 100}%;background:${col(i)}` })), el('b', { text: `${fmt(v * 100)}%` }))),
    el('p', { class: 'sd-note', text: 'Share of 3,000 random weightings (each weight 0–10) in which each design comes first. Above about 70%: a robust choice whatever the team values. A split means the priorities decide it, so agree the weights first.' }));
  return chartBlock('sd-robust', 'Weight robustness', body, [['Design', 'Wins'], ...p.map((v, i) => [res[i].design.name, `${fmt(v * 100)}%`])]);
}
function flipCard(res) {
  const f = flips(res, S.weights, S.penalty), lead = res[f.leader].design.name;
  const items = f.flips.slice(0, 8).map(x => el('li', {}, el('i', { class: 'sd-dot', style: `background:${col(x.rival)}` }), el('b', { text: res[x.rival].design.name }), ` takes over if the ${x.label.toLowerCase()} weight goes ${x.dir} ${fmt(x.at, 1)} (now ${fmt(S.weights[x.crit], 1)}).`));
  return card(`What flips the winner (now: ${lead})`, items.length ? el('ul', { class: 'sd-flips' }, items) : el('p', { class: 'sd-note', text: `No single weight between 0 and 10 makes another design beat ${lead}: the choice is robust to any one priority changing.` }));
}
function logCard(res, order) {
  const win = res[order[0].i], run = res[order[1]?.i];
  const text = [`# Decision log: ${new Date().toISOString().slice(0, 10)}`, '', `## Recommended: ${win.design.name}`, ...explain(win).map(t => `- ${t}`), '',
    '## Weights', CRITERIA.map(c => `${c.label} ${S.weights[c.id]}`).join(', '), '',
    '## Ranking', ...order.map(({ i, s }, k) => `${k + 1}. ${res[i].design.name}: ${fmt(s * 100, 1)} (${money(res[i].lcc)}, ${res[i].compliant ? 'compliant' : `misses ${res[i].checks.filter(c => !c.ok).map(c => c.id).join(', ')}`})`), '',
    run ? `## Why not ${run.design.name}` : '', run ? CRITERIA.map(c => [c, win.criteria[c.id] - run.criteria[c.id]]).filter(([, v]) => Math.abs(v) > 0.03).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).map(([c, v]) => `- ${c.label}: ${v > 0 ? 'better' : 'worse'} by ${fmt(Math.abs(v) * 100)} points`).join('\n') : '',
    '', '## Flip points', ...flips(res, S.weights, S.penalty).flips.slice(0, 5).map(x => `- ${res[x.rival].design.name} wins if ${x.label.toLowerCase()} weight goes ${x.dir} ${fmt(x.at, 1)}`),
    '', '## Team notes', S.d.notes || '(none)'].join('\n');
  const notes = el('textarea', { class: 'sd-notes', rows: 3, placeholder: 'Why the team chose this design, open questions, actions…', onchange: e => { S.d.notes = e.target.value; persist(); } });
  notes.value = S.d.notes || '';
  return card('Decision log', notes, el('div', { class: 'sd-row' },
    el('button', { class: 'sd-btn is-primary', onclick: () => download(`decision-log-${new Date().toISOString().slice(0, 10)}.md`, text, 'text/markdown'), text: 'Download decision log (.md)' }),
    el('button', { class: 'sd-btn', onclick: () => navigator.clipboard?.writeText(text).then(() => flash('Copied')), text: 'Copy' })),
  el('pre', { class: 'sd-pre', text }));
}

// ---------- explore: optimizer and Pareto cloud ----------
function runWorker(kind, opts, onProgress) {
  worker ||= new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  const id = ++jobs;
  return new Promise((resolve, reject) => {
    const h = e => {
      if (e.data.id !== id) return;
      if (e.data.progress != null) { onProgress?.(e.data.progress); return; }
      worker.removeEventListener('message', h);
      e.data.error ? reject(new Error(e.data.error)) : resolve(e.data.result);
    };
    worker.addEventListener('message', h);
    worker.postMessage({ id, kind, design: S.d, year: ctx.Y[S.d.year], opts });
  });
}
async function runOpt() {
  if (S.busy) return;
  S.busy = 'opt'; renderPane();
  const prog = p => { const b = $('.sd-prog i'); if (b) b.style.width = `${p * 100}%`; };
  try { S.opt = await runWorker('opt', { samples: 1200, budget: S.budget, weights: S.weights, penalty: S.penalty }, prog); }
  catch (e) { flash('Optimizer failed'); console.error(e); }
  S.busy = null; renderTabs(); renderPane();
}
async function runMc() {
  if (S.busy) return;
  S.busy = 'mc'; if (S.tab === 'sens' || S.tab === 'time') renderPane();
  try { S.mc = await runWorker('mc', { n: 600 }, p => { const b = $('.sd-prog i'); if (b) b.style.width = `${p * 100}%`; }); }
  catch (e) { flash('Monte Carlo failed'); console.error(e); }
  S.busy = null;
}
const Y_AXES = {
  pop: { label: 'People within a station\'s reach (%)', get: p => p.pop },
  w30: { label: 'Priority messages within 30 min (%)', get: p => p.w30 * 100 },
  score: { label: 'Team-weighted score', get: p => p.score * 100 },
  margin: { label: 'Margin on the tightest requirement (%)', get: p => Math.max(-50, p.margin * 100) },
};
function exploreTab() {
  const budget = el('label', { class: 'sd-w' }, el('span', { text: 'Budget ($M)' }), el('input', { type: 'number', min: 100, max: 1000, step: 10, value: S.budget, onchange: e => { S.budget = +e.target.value || CAP_MUSD; } }));
  const head = card('Find the best design',
    el('p', { class: 'sd-note', text: 'Searches every equipment choice and slider: 1,200 random designs, then hill climbing from the best ones for each goal (about 2,500 designs, 10–20 s). The year, mode and sensor count stay as set.' }),
    el('div', { class: 'sd-row' }, budget, el('button', { class: 'sd-btn is-primary', disabled: !!S.busy || null, onclick: runOpt, text: S.busy === 'opt' ? 'Searching…' : S.opt ? 'Search again' : 'Run the optimizer' })),
    S.busy === 'opt' ? el('div', { class: 'sd-prog' }, el('i')) : null);
  if (!S.opt) return [head];
  const bests = el('div', { class: 'sd-bests' }, OBJECTIVES.map((o, i) => {
    const b = S.opt.best[o.id]?.point; if (!b) return null;
    return el('div', { class: 'sd-best' }, el('span', { class: 'sd-best-k', text: o.label }),
      el('b', { text: money(b.lcc) }), el('span', { class: 'sd-note', text: `${b.d.n} stations · ${b.d.repeaters} repeaters · ${opt('leo', b.d.pick.leo).perf.kind === 'own' ? `${b.d.leoSats} × ${opt('leo', b.d.pick.leo).name.replace('Own ', '').split(',')[0]}` : opt('leo', b.d.pick.leo).name.replace('Commercial service: ', '')} · ${opt('geo', b.d.pick.geo).name.split(' ').slice(0, 2).join(' ')} · p95 ${mins(b.p95)} · ${fmt(b.pop)}% people` }),
      b.compliant ? el('i', { class: 'sd-pill is-pass', text: 'compliant' }) : el('i', { class: 'sd-pill is-fail', text: `misses ${b.fails.join(', ')}` }),
      el('button', { class: 'sd-link', onclick: () => loadDesign({ ...b.d, name: `Optimizer: ${o.short}` }), text: 'Open in configurator' }));
  }));
  return [head, cloudCard(), card(`Best designs (${fmt(S.opt.evaluated)} evaluated)`, bests), choiceCard()];
}
function cloudCard() {
  const A = Y_AXES[S.yAxis], pts = S.opt.cloud, W = 680, H = 350, l = 48, r = 14, t = 30, b = 34;
  const xs = pts.map(p => p.lcc).filter(Number.isFinite), ys = pts.map(A.get).filter(Number.isFinite);
  const xMax = Math.min(Math.max(...xs), 1000) * 1.02, xMin = Math.max(0, Math.min(...xs) * 0.95), yMin = Math.min(...ys), yMax = Math.max(...ys) * 1.02 + 0.01;
  const X = v => l + ((v - xMin) / (xMax - xMin)) * (W - l - r), Y = v => H - b - ((v - yMin) / (yMax - yMin || 1)) * (H - t - b);
  const s = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'vsvg sd-cloud', role: 'img', 'aria-label': `Design cloud: cost against ${A.label}` });
  for (let k = 0; k <= 4; k++) { const v = xMin + ((xMax - xMin) * k) / 4, w = yMin + ((yMax - yMin) * k) / 4; svText(s, { x: X(v), y: H - 16, 'text-anchor': 'middle', class: 'sub' }, `$${fmt(v)}M`); svText(s, { x: l - 4, y: Y(w) + 4, 'text-anchor': 'end', class: 'sub' }, fmt(w)); sv('line', { x1: l, x2: W - r, y1: Y(w), y2: Y(w), class: 'sd-grid' }, s); }
  svText(s, { x: W / 2, y: H - 2, 'text-anchor': 'middle', class: 'lbl' }, '15-year cost');
  svText(s, { x: 0, y: 12, class: 'lbl' }, A.label);
  if (S.budget >= xMin && S.budget <= xMax) { sv('line', { x1: X(S.budget), x2: X(S.budget), y1: t, y2: H - b, class: 'sd-cap' }, s); svText(s, { x: X(S.budget) + 4, y: H - b - 6, class: 'sub' }, 'budget'); }
  const front = frontier(pts, p => p.lcc, A.get, p => p.compliant && Number.isFinite(p.lcc));
  const g = sv('g', {}, s);
  for (const p of pts) {
    if (!Number.isFinite(p.lcc) || p.lcc > xMax || !Number.isFinite(A.get(p))) continue;
    sv('circle', { cx: X(p.lcc), cy: Y(A.get(p)), r: 2.6, class: p.compliant ? 'sd-pt is-ok' : 'sd-pt' }, g);
  }
  sv('path', { d: `M${front.map(p => `${X(p.lcc)},${Y(A.get(p))}`).join('L')}`, class: 'sd-front' }, s);
  front.forEach(p => sv('circle', { cx: X(p.lcc), cy: Y(A.get(p)), r: 4, class: 'sd-pt is-front' }, s));
  OBJECTIVES.forEach((o, i) => { const p = S.opt.best[o.id]?.point; if (!p || !Number.isFinite(p.lcc)) return; sv('circle', { cx: X(p.lcc), cy: Y(A.get(p)), r: 7, class: 'sd-best-pt', stroke: col(i) }, s); svText(s, { x: X(p.lcc) + 9, y: Y(A.get(p)) - 6, class: 'sub' }, o.short); });
  const cur = { lcc: R.lcc, pop: R.R.popPct, w30: R.R.within30, score: weightedScore(R, S.weights, S.penalty), margin: R.tight.margin };
  if (Number.isFinite(cur.lcc)) { sv('path', { d: `M${X(cur.lcc) - 7},${Y(A.get(cur))}h14M${X(cur.lcc)},${Y(A.get(cur)) - 7}v14`, class: 'sd-cur' }, s); svText(s, { x: X(cur.lcc) + 9, y: Y(A.get(cur)) + 14, class: 'lbl' }, 'current'); }
  // hover and click: nearest design
  const hit = sv('rect', { x: l, y: t, width: W - l - r, height: H - t - b, fill: 'transparent' }, s);
  const near = ev => {
    const bb = s.getBoundingClientRect(), mx = ((ev.clientX - bb.left) / bb.width) * W, my = ((ev.clientY - bb.top) / bb.height) * H;
    let best = null, bd = 144;
    for (const p of pts) { if (!Number.isFinite(p.lcc)) continue; const dd = (X(p.lcc) - mx) ** 2 + (Y(A.get(p)) - my) ** 2; if (dd < bd) { bd = dd; best = p; } }
    return best;
  };
  hit.addEventListener('pointermove', ev => { const p = near(ev); if (!p) return hideTip(); showTip(ev, [el('b', { text: `${money(p.lcc)} · ${A.label.split(' (')[0]} ${fmt(A.get(p), 1)}` }), el('div', { text: `${p.d.n} stations, ${p.d.repeaters} repeaters, ${opt('leo', p.d.pick.leo).name}, ${opt('geo', p.d.pick.geo).name}` }), el('div', { class: 'k', text: p.compliant ? 'Meets every requirement · click to open' : `Misses ${p.fails.join(', ')} · click to open` })]); });
  hit.addEventListener('pointerleave', hideTip);
  hit.addEventListener('click', ev => { const p = near(ev); if (p) loadDesign({ ...p.d, name: `From the cloud (${money(p.lcc)})` }); });
  const ctrl = seg(Object.entries(Y_AXES).map(([k, v]) => [k, v.label.split(' (')[0]]), S.yAxis, v => { S.yAxis = v; renderPane(); }, 'Vertical axis');
  return chartBlock('sd-cloud', 'Design cloud and efficient frontier', el('div', {}, s,
    el('div', { class: 'sd-legend' }, el('span', {}, el('i', { class: 'is-ok' }), 'meets every requirement'), el('span', {}, el('i', { class: 'is-no' }), 'misses one or more'), el('span', {}, el('i', { class: 'is-front' }), 'efficient frontier: nothing cheaper does better'), el('span', {}, el('i', { class: 'is-cur' }), 'current design'))),
  [['Cost $M', A.label, 'Compliant', 'Stations', 'Uplink', 'GEO'], ...front.map(p => [fmt(p.lcc, 1), fmt(A.get(p), 1), 'yes', String(p.d.n), p.d.pick.leo, p.d.pick.geo])], [ctrl]);
}
// Which option each element takes among the compliant designs near the frontier: a vote on every equipment choice.
function choiceCard() {
  const good = S.opt.cloud.filter(p => p.compliant).sort((a, b) => a.lcc - b.lcc).slice(0, 100);
  if (!good.length) return card('What the best designs choose', el('p', { class: 'sd-note', text: 'No compliant design found: relax the budget or the sensor count.' }));
  const rows = ELEMENTS.map(e => ({ e, shares: e.options.map(o => ({ o, v: good.filter(p => p.d.pick[e.id] === o.id).length / good.length })) }));
  return chartBlock('sd-choice', `What the ${good.length} cheapest compliant designs choose`, el('div', { class: 'sd-segs' }, rows.map(({ e, shares }) => el('div', { class: 'sd-seg is-wide' }, el('span', { text: e.name.split(' (')[0] }),
    el('div', { class: 'sd-stackbar' }, shares.filter(x => x.v > 0).map((x, j) => el('i', { style: `flex:${x.v};background:${col(e.options.indexOf(x.o))}`, title: `${x.o.name}: ${fmt(x.v * 100)}%`, text: x.v > 0.18 ? x.o.name.split(/[,(:]/)[0].replace('Own ', '').replace('Commercial service', '').trim().slice(0, 22) : '' }))))),
  el('p', { class: 'sd-note', text: 'A solid bar is a clear choice; a split bar means that element hardly changes cost or compliance, so decide it on risk or schedule.' })),
  [['Element', ...['Option', 'Share']], ...rows.flatMap(({ e, shares }) => shares.map(x => [e.name, x.o.name, `${fmt(x.v * 100)}%`]))]);
}

// ---------- sensitivity ----------
function sensTab() {
  S.sens ||= { tor: tornado(ctx, S.d, S.weights, S.penalty), ela: elasticity(ctx, S.d) };
  return [el('div', { class: 'sd-grid2' }, tornadoCard(), mcCard()), elasticityCard()];
}
function tornadoCard() {
  const { base, rows } = S.sens.tor, key = S.tOut, f = key === 'lcc' ? money : key === 'p95' ? mins : v => fmt(v * 100, 1);
  const sorted = rows.map(r => ({ ...r, span: Math.abs((r.hi[key] ?? 0) - (r.lo[key] ?? 0)) })).filter(r => Number.isFinite(r.span)).sort((a, b) => b.span - a.span).slice(0, 12);
  const all = sorted.flatMap(r => [r.lo[key], r.hi[key]]).filter(Number.isFinite), lo = Math.min(base[key], ...all), hi = Math.max(base[key], ...all);
  const W = 460, rowH = 22, left = 150, H = sorted.length * rowH + 26, X = v => left + ((v - lo) / (hi - lo || 1)) * (W - left - 40);
  const s = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'vsvg', role: 'img', 'aria-label': 'Tornado chart' });
  sorted.forEach((r, i) => {
    const y = 4 + i * rowH;
    svText(s, { x: 0, y: y + 14, class: 'lbl' }, r.k.label);
    for (const [side, v, c] of [['low', r.lo[key], '--s1'], ['high', r.hi[key], '--s2']]) {
      if (!Number.isFinite(v)) continue;
      const rect = sv('rect', { x: Math.min(X(base[key]), X(v)), y: y + 3, width: Math.max(1.5, Math.abs(X(v) - X(base[key]))), height: rowH - 8, rx: 2, fill: `var(${c})` }, s);
      rect.addEventListener('pointermove', ev => showTip(ev, [el('b', { text: `${r.k.label} ×${side === 'low' ? r.k.lo : r.k.hi}` }), el('div', { text: `${f(v)} (base ${f(base[key])})` })]));
      rect.addEventListener('pointerleave', hideTip);
    }
    if (!r.lo.compliant || !r.hi.compliant) svText(s, { x: W - 36, y: y + 14, class: 'sub sd-warn' }, '⚠ fails');
  });
  sv('line', { x1: X(base[key]), x2: X(base[key]), y1: 0, y2: H - 20, class: 'sd-axis' }, s);
  svText(s, { x: X(base[key]), y: H - 6, 'text-anchor': 'middle', class: 'sub' }, `base ${f(base[key])}`);
  const ctrl = seg([['lcc', 'Cost'], ['p95', 'Latency'], ['score', 'Score']], key, v => { S.tOut = v; renderPane(); }, 'Outcome');
  return chartBlock('sd-tornado', 'Tornado: which uncertain input matters most', el('div', {}, s, el('p', { class: 'sd-note', text: 'Each input moved to its low (blue) and high (orange) value, the others held. ⚠: the design stops meeting a requirement at that end.' })),
    [['Input', 'Low ×', 'At low', 'High ×', 'At high'], ...sorted.map(r => [r.k.label, String(r.k.lo), f(r.lo[key]), String(r.k.hi), f(r.hi[key])])], [ctrl]);
}
function mcCard() {
  const mc = S.mc;
  if (!mc) return card('Monte Carlo: how sure are we?', el('p', { class: 'sd-note', text: `Draws all ${KNOBS.length} uncertain inputs together (triangular: low, catalog value, high), 600 times, and counts how often the design stays under the cap and meets each requirement.` }),
    el('button', { class: 'sd-btn is-primary', disabled: !!S.busy || null, onclick: () => runMc().then(() => renderPane()), text: S.busy === 'mc' ? 'Running…' : 'Run Monte Carlo' }), S.busy === 'mc' ? el('div', { class: 'sd-prog' }, el('i')) : null);
  const lo = Math.min(...mc.lcc), hi = Math.max(...mc.lcc), bins = 24, w = (hi - lo) / bins || 1, h = new Array(bins).fill(0);
  for (const v of mc.lcc) h[Math.min(bins - 1, Math.floor((v - lo) / w))]++;
  const W = 440, H = 150, l = 8, X = v => l + ((v - lo) / (hi - lo || 1)) * (W - 2 * l), maxH = Math.max(...h);
  const s = sv('svg', { viewBox: `0 0 ${W} ${H + 20}`, class: 'vsvg', role: 'img', 'aria-label': 'Distribution of the 15-year cost' });
  h.forEach((c, i) => sv('rect', { x: X(lo + i * w) + 1, y: H - (c / maxH) * (H - 10), width: Math.max(1, X(lo + w) - X(lo) - 2), height: (c / maxH) * (H - 10), fill: `var(${lo + (i + 0.5) * w <= CAP_MUSD ? '--s4' : '--critical'})`, rx: 1 }, s));
  if (CAP_MUSD > lo && CAP_MUSD < hi) { sv('line', { x1: X(CAP_MUSD), x2: X(CAP_MUSD), y1: 0, y2: H, class: 'sd-cap' }, s); svText(s, { x: X(CAP_MUSD) + 3, y: 10, class: 'sub' }, 'cap'); }
  for (const [k, v] of Object.entries({ P10: mc.stats.p10, P50: mc.stats.p50, P90: mc.stats.p90 })) svText(s, { x: X(v), y: H + 14, 'text-anchor': 'middle', class: 'sub' }, `${k} ${money(v)}`);
  const reqs = el('div', { class: 'sd-segs' }, Object.entries(mc.pass).map(([id, v]) => el('div', { class: 'sd-seg' }, el('span', { text: `${id} ${NAMES[id] || ''}` }), el('div', { class: 'sd-segbar' }, el('i', { style: `width:${v * 100}%;background:var(${v >= 0.9 ? '--good' : v >= 0.6 ? '--alert' : '--critical'})` })), el('b', { text: `${fmt(v * 100)}%` }))));
  return chartBlock('sd-mc', `Monte Carlo: ${fmt(mc.pUnderCap * 100)}% under the cap, ${fmt(mc.pCompliant * 100)}% meet everything`, el('div', {}, s, reqs,
    el('button', { class: 'sd-btn', onclick: () => { S.mc = null; runMc().then(() => renderPane()); renderPane(); }, text: 'Run again' })),
  [['Measure', 'Value'], ['Draws', String(mc.n)], ['P10 cost', money(mc.stats.p10)], ['Median cost', money(mc.stats.p50)], ['P90 cost', money(mc.stats.p90)], ['Probability under the cap', `${fmt(mc.pUnderCap * 100)}%`], ['Probability compliant', `${fmt(mc.pCompliant * 100)}%`], ...Object.entries(mc.pass).map(([id, v]) => [`Pass ${id}`, `${fmt(v * 100)}%`])]);
}
function elasticityCard() {
  const { rows, outcomes } = S.sens.ela;
  const cell = (v, o) => {
    if (v == null || !Number.isFinite(v)) return el('td', { class: 'sd-e', text: '·' });
    const good = (o.good === 'high' ? v : -v), a = Math.min(1, Math.abs(v) / 1.2);
    return el('td', { class: 'sd-e', style: `background:color-mix(in srgb, var(${good >= 0 ? '--good' : '--critical'}) ${Math.round(a * 70)}%, transparent)`, title: `+10% → ${v >= 0 ? '+' : ''}${fmt(v * 10, 1)}% ${o.label.toLowerCase()}`, text: Math.abs(v) < 0.005 ? '0' : fmt(v, 2) });
  };
  const table = el('table', { class: 'sd-etable' }, el('thead', {}, el('tr', {}, el('th', { text: '' }), outcomes.map(o => el('th', { text: o.label })))),
    el('tbody', {}, rows.map(r => el('tr', { class: r.kind === 'lever' ? 'is-lever' : '' }, el('th', { scope: 'row', text: `${r.label}${r.kind === 'lever' && Math.abs(r.dx - 0.1) > 0.01 ? ` (+${fmt(r.dx * 100)}%)` : ''}` }), r.e.map((v, i) => cell(v, outcomes[i]))))));
  return card('Elasticity matrix: % change in each outcome per % change in each lever or input',
    el('div', { class: 'sd-escroll' }, table),
    el('p', { class: 'sd-note', text: 'Read across a row: 0.8 means +10% on that lever moves the outcome +8%. Green helps, red hurts (lower cost and latency are good). Bold rows are design levers you choose; the rest are uncertain inputs. Discrete levers step to the next value.' }));
}

// ---------- catalog ----------
function catalogTab() {
  return [card('Equipment catalog',
    el('p', { class: 'sd-note' }, 'Every option the configurator offers, with where its numbers come from. ', ...Object.entries(BASIS).map(([k, b]) => el('span', { class: 'sd-bk' }, btag(k), ` ${b.title}. `)),
      'Replace estimates with vendor quotes as the team gets them (src/sdr/catalog.js).')),
  ...ELEMENTS.map(e => card(`${e.segment} · ${e.name}`, el('p', { class: 'sd-note', text: e.help }),
    el('div', { class: 'sd-cat' }, e.options.map(o => el('div', { class: `sd-cat-r${S.d.pick[e.id] === o.id ? ' is-on' : ''}` },
      el('div', {}, el('b', { text: o.name }), o.example ? el('div', { class: 'sd-note', text: o.example }) : null),
      el('div', { class: 'sd-note', text: optSummary(e.id, o) || '–' }),
      el('div', {}, btag(o.basis), el('i', { class: 'sd-risk', text: `risk ${o.risk}` })),
      el('div', { class: 'sd-cat-src' }, el('span', { text: o.basis_note }), o.source ? (o.source.url ? el('a', { href: o.source.url, target: '_blank', rel: 'noopener', text: o.source.label }) : el('span', { class: 'sd-note', text: o.source.label })) : null))))))];
}
