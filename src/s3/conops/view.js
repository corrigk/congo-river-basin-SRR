// ConOps tab: one map in two steps. "Why" shows what S-3 is up against (people, conflict, fire, floods, protected
// areas, existing infrastructure); "What · where · how many" fades those out and the design in, with sliders and
// toggles that drive the requirement checks, the cost range and the coverage curve (model.js).
import { D, YEARS, MODES, geo as loadGeo, grid as loadGrid, pop as loadPop, stations as loadStations, hazards as loadHz, firstCovered } from '../v2/data.js';
import { el, seg, tag, fmt, fmtM, sv, svText, chartBlock, showTip, hideTip, kv } from '../v2/ui.js';
import { evaluate, sweetSpot, LEO_SIZES, ASSUME } from './model.js';
import { createConopsMap, FAMILY, familyOf } from './map.js';
import { GAP } from '../content.js';
import '../v2/v2.css';
import './conops.css';

const BEST = k => (k === 1 ? [D.db.recommended[0]] : D.db.best_by_count[String(k)].nodes);
const DESIGN = () => ({
  year: 2041, mode: 'mix', n: null, repeaters: 0, nodes: BEST(4), leoSats: 24, geo: true, starlink: true, hydro: false, raised: true, fail: null,
  sensors: Object.fromEntries(D.sn.types.map(t => [t.id, t.baseline_count])),
});
export const S = {
  step: 'why', ...DESIGN(), resTab: 'overview', sweep: 'leoSats',
  why: { pop: true, infra: true, conflict: true, fire: true, flood: true, pa: true },
  show: { coverage: true, reach: true, geo: true, water: true, forest: true, fire: true, flowUp: false, flowAlert: false, flowTwo: false, hud: true },
};

const CHECK_NAMES = {
  'S3-01': 'Coverage', 'S3-02': 'Capacity', 'S3-03': '≤30 min', 'S3-04': 'Terminal', 'S3-05': 'Alert ≤10 min',
  'S3-06': 'Targeting', 'S3-07': '≤$25', 'S3-08': 'Responders', 'S3-09': '≤6 h', 'S3-10': '≥99.5%', LCC: '≤$400M',
};
const CHECK_FULL = {
  'S3-01': 'Service area', 'S3-02': 'Sensor terminals and data', 'S3-03': 'Priority sensor message to the COP', 'S3-04': 'Terminal life and cost',
  'S3-05': 'Authorized alert to audible', 'S3-06': 'Geo-targeting and languages', 'S3-07': 'Community receiver', 'S3-08': 'Responder two-way terminals',
  'S3-09': 'Command or acknowledgment delivered', 'S3-10': 'Availability in rain, service life', LCC: 'Life-cycle cost, 15 years',
};
const FAILS = [[null, 'None'], ['hub', 'Hub down'], ['leo', 'LEO plane lost'], ['geo', 'GEO lost'], ['grid', 'Grid and cell down'], ['station', 'Station flooded']];
const LINE_COL = { leo: '--s1', geo: '--s7', stations: '--s4', repeaters: '--data', antennas: '--s3', db: '--accent', receivers: '--s5', backhaul: '--s2' };

let root = null, map = null, hud = null, G = null, R = null, base = null, spot = null, nodeStats = null, raf = 0, timer = 0;
const $ = s => root.querySelector(s);

// ---------- data for the current year ----------
async function loadYear() {
  const [geo, grid, pop, st, hz] = await Promise.all([loadGeo(), loadGrid(), loadPop(S.year), loadStations(S.year), loadHz()]);
  G = G && G.grid === grid ? { ...G, pop, st, hz } : {
    geo, grid, pop, st, hz, first: firstCovered,
    cellLL: grid.i.map(i => [grid.lon0 + (i % grid.nx) * grid.res_deg, grid.lat0 + Math.floor(i / grid.nx) * grid.res_deg]),
    cellIdx: new Map(grid.i.map((g, k) => [g, k])),
  };
  spot = sweetSpot(st.runs[S.mode]);
  if (S.n == null) S.n = spot.knee;
  base = evaluate(D, st, { ...DESIGN(), n: spot.knee, year: S.year, mode: S.mode, dbNodes: BEST(4) });
}
const opts = () => ({ ...S, dbNodes: S.nodes });

// Average distance from a resident to the nearest database node, and the share within 500 km (population-weighted).
function nodeDistances() {
  const nodes = S.nodes.map(n => D.db.candidates.find(c => c.name === n)).filter(Boolean);
  let sum = 0, w = 0, near = 0;
  for (let k = 0; k < G.grid.i.length; k++) {
    const [lon, lat] = G.cellLL[k], p = G.pop[k];
    let best = 1e9;
    for (const nd of nodes) {
      const dLat = ((nd.lat - lat) * Math.PI) / 180, dLon = ((nd.lon - lon) * Math.PI) / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat * Math.PI) / 180) * Math.cos((nd.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
      best = Math.min(best, 2 * 6371 * Math.asin(Math.sqrt(a)));
    }
    sum += best * p; w += p; if (best <= 500) near += p;
  }
  return { meanKm: sum / w, within500: (100 * near) / w };
}

// ---------- layout ----------
export async function mount(el_, step = 'why') {
  root = el_;
  S.step = step;
  root.innerHTML = `
    <div class="co" data-step="${S.step}">
      <header class="co-head">
        <div><div class="pv-eyebrow">ConOps · RFP S-3</div>
          <h2 class="co-title"><span class="co-t-why">Why the basin needs S-3</span><span class="co-t-what">What we build, where, and how many</span></h2></div>
        <div class="seg co-step" role="group" aria-label="ConOps step (← →)">
          <button data-co-step="why" aria-pressed="${S.step === 'why'}">Why</button>
          <button data-co-step="what" aria-pressed="${S.step === 'what'}">What · where · how many</button>
        </div>
      </header>
      <div class="co-body">
        <div class="co-mapcol"><div class="co-map"><div class="v2-loading">Loading the basin…</div></div><div class="co-legend"></div></div>
        <div class="co-col co-side"><div class="co-pane is-why"></div><div class="co-pane is-what"></div></div>
        <div class="co-col co-res"><div class="co-pane is-why"></div><div class="co-pane is-what"></div></div>
      </div>
    </div>`;
  await loadYear();
  map = createConopsMap($('.co-map'), { onNode: toggleNode });
  hud = el('div', { class: 'co-hud', role: 'status', 'aria-label': 'Design numbers' });
  map.wrap.append(hud);
  nodeStats = nodeDistances();
  R = evaluate(D, G.st, opts());
  map.draw(G, S, R);
  buildWhy();
  buildWhat();
  renderLegend();
  renderResults();
  renderHud();
}

export function setStep(step) {
  if (!root || (step !== 'why' && step !== 'what')) return;
  S.step = step;
  $('.co').dataset.step = step;
  for (const b of root.querySelectorAll('[data-co-step]')) b.setAttribute('aria-pressed', b.dataset.coStep === step);
  renderLegend();
  map?.describe(R);
  map?.sync(S);
  hideTip();
}
export const getStep = () => S.step;
export function refit() { if (map && G) map.draw(G, S, R); }

// ---------- recompute after a change (at most once per frame) ----------
// Next animation frame, or a short timer when the page gets no frames (a background tab) so changes still apply.
function nextFrame(fn) {
  let done = false;
  const run = () => { if (!done) { done = true; cancelAnimationFrame(raf); clearTimeout(timer); fn(); } };
  cancelAnimationFrame(raf); clearTimeout(timer);
  raf = requestAnimationFrame(run); timer = setTimeout(run, 80);
}
function update({ data = false } = {}) {
  nextFrame(async () => {
    if (data) { await loadYear(); nodeStats = nodeDistances(); }
    R = evaluate(D, G.st, opts());
    if (data) map.draw(G, S, R); else map.drawWhat(S, R);
    renderResults();
    renderHud();
    syncControls();
  });
}

function toggleNode(name) {
  if (name === S.nodes[0]) return;
  if (S.nodes.includes(name)) S.nodes = S.nodes.filter(n => n !== name);
  else if (S.nodes.length < 4) S.nodes = [...S.nodes, name];
  else return;
  nodeStats = nodeDistances();
  update();
}

// ---------- why: layer switches and the facts behind them ----------
function buildWhy() {
  const hz = G.hz, pa = G.geo.pa.areas, paKm2 = pa.reduce((a, x) => a + (x.area_km2_in_basin || 0), 0);
  const layers = [
    ['pop', 'People per km²', 'linear-gradient(90deg, var(--seq-1), var(--seq-6))', 'WorldPop'],
    ['conflict', `Violent events 2015–24 · ${fmt(hz.conflict.events)}`, 'var(--critical)', 'UCDP'],
    ['fire', `Fire detections 2024 · ${fmt(hz.fires.detections)}`, 'var(--s2)', 'NASA FIRMS'],
    ['flood', `Flood alerts since 2000 · ${hz.floods.events.length}`, 'var(--river)', 'GDACS'],
    ['pa', `Protected areas · ${pa.length}`, 'var(--s6)', 'WDPA'],
    ['infra', 'Data centres, cables, hydro, roads', 'var(--text)', 'see Sources'],
  ];
  const side = $('.co-side .is-why');
  side.replaceChildren(
    el('h3', { class: 'co-h', text: 'On the map' }),
    el('div', { class: 'co-layers' }, layers.map(([k, label, sw, src]) => {
      const cb = el('input', { type: 'checkbox' }); cb.checked = S.why[k];
      cb.addEventListener('change', () => { S.why[k] = cb.checked; map.drawWhy(S); });
      return el('label', { class: 'co-layer' }, cb, el('i', { style: `background:${sw}` }), el('span', { text: label }), el('small', { text: src }));
    })),
    el('p', { class: 'co-hint' }, 'Press ', el('kbd', { text: '→' }), ' for what S-3 builds.'),
  );
  const people = y => G.grid.summary[String(y)].basin_total;
  const byYear = Object.entries(hz.conflict.by_year);
  const maxY = Math.max(...byYear.map(([, v]) => v));
  const bars = sv('svg', { viewBox: '0 0 300 86', class: 'vsvg', role: 'img', 'aria-label': 'Violent events in the basin by year, 2015 to 2024' });
  byYear.forEach(([y, v], i) => {
    const h = (v / maxY) * 50, x = 6 + i * 29;
    sv('rect', { x, y: 66 - h, width: 22, height: h, rx: 2, fill: 'var(--critical)', opacity: 0.75 }, bars);
    svText(bars, { x: x + 11, y: 80, 'text-anchor': 'middle', class: 'axl' }, `'${y.slice(2)}`);
    svText(bars, { x: x + 11, y: 62 - h, 'text-anchor': 'middle', class: 'sub' }, fmt(v));
  });
  const fact = (v, l, src) => el('div', { class: 'co-fact' }, el('b', { text: v }), el('span', { text: l }), src ? el('small', { text: src }) : null);
  $('.co-res .is-why').replaceChildren(
    el('div', { class: 'co-facts' },
      fact(`${fmt(people(2026) / 1e6, 0)}M → ${fmt(people(2041) / 1e6, 0)}M`, 'people in the basin, 2026 → 2041', 'WorldPop, UN growth'),
      fact(fmt(hz.conflict.deaths_best), `deaths in ${fmt(hz.conflict.events)} violent events, 2015–24`, 'UCDP GED'),
      fact(fmt(hz.fires.detections), 'fire detections in 2024 (DR Congo)', 'NASA FIRMS'),
      fact(String(hz.floods.events.length), 'flood alerts since 2000', 'GDACS'),
      fact(`${fmt((100 * paKm2) / 3.7e6, 1)}%`, `of the basin is protected (${pa.length} areas)`, 'WDPA'),
    ),
    chartBlock('co-conflict', 'Violent events by year', bars, [['Year', 'Events'], ...byYear.map(([y, v]) => [y, fmt(v)])]),
    el('div', { class: 'co-gap' }, el('h3', { class: 'co-h', text: 'The gap' }),
      el('ul', {}, [GAP.out.facts[0], GAP.out.facts[1], GAP.in.facts[0], GAP.in.facts[2]].map(f => el('li', { text: f })))),
  );
}

// ---------- what: the design controls ----------
let ctl = {};
function buildWhat() {
  const group = (title, ...kids) => el('div', { class: 'co-group' }, el('h3', { class: 'co-h', text: title }), ...kids);
  const range = (label, min, max, step, get, set, fmtOut = v => fmt(v)) => {
    const out = el('b', { class: 'ctl-out' }), inp = el('input', { type: 'range', min, max, step, 'aria-label': label });
    inp.value = get(); out.textContent = fmtOut(get());
    inp.addEventListener('input', () => { set(+inp.value); out.textContent = fmtOut(+inp.value); update(); });
    return { node: el('label', { class: 'ctl co-range' }, el('span', { text: label }), inp, out), inp, out, sync: () => { inp.value = get(); out.textContent = fmtOut(get()); } };
  };
  const toggle = (label, key, note) => {
    const cb = el('input', { type: 'checkbox' }); cb.checked = S[key];
    cb.addEventListener('change', () => { S[key] = cb.checked; update(); });
    return el('label', { class: 'co-opt' }, cb, el('span', { text: label }), note ? el('small', { text: note }) : null);
  };

  ctl.year = el('div', { class: 'co-slot' });
  ctl.mode = el('div', { class: 'co-slot' });
  ctl.stations = range('Ranger stations', 0, 400, 1, () => S.n, v => { S.n = v; });
  ctl.spot = el('div', { class: 'co-spot' });
  ctl.curve = el('div', { class: 'co-curve' });
  ctl.repeaters = range('Canopy repeaters', 0, 300, 5, () => S.repeaters, v => { S.repeaters = v; });
  ctl.nodes = el('div', { class: 'co-slot' });
  ctl.nodeNote = el('p', { class: 'co-note' });
  ctl.leo = el('div', { class: 'co-slot' });
  ctl.fail = el('div', { class: 'co-slot' });
  ctl.sensors = D.sn.types.map(t => range(t.name.split(' (')[0], 0, t.baseline_count * 3, Math.max(10, Math.round(t.baseline_count / 20)),
    () => S.sensors[t.id], v => { S.sensors[t.id] = v; }));
  ctl.sensorSum = el('span', { class: 'co-sum' });

  $('.co-side .is-what').replaceChildren(
    group('Year', ctl.year),
    group('Ranger stations', ctl.stations.node, ctl.spot, ctl.curve, ctl.mode),
    group('Under the canopy', ctl.repeaters.node, toggle('Raised antennas on fixed sensors', 'raised', '≈$40 each')),
    group('Database nodes', ctl.nodes, ctl.nodeNote),
    group('Space and backhaul', ctl.leo, toggle('GEO broadcast payload', 'geo'), toggle('Starlink at stations and nodes', 'starlink'), toggle('Micro-hydro at river stations', 'hydro')),
    el('details', { class: 'co-group co-sensors' }, el('summary', {}, el('span', { class: 'co-h', text: 'Sensors' }), ctl.sensorSum), ...ctl.sensors.map(s => s.node)),
    group('Failure case', ctl.fail),
    el('button', { class: 'v2-link co-reset', onclick: resetDesign, text: 'Reset to the baseline design' }),
    el('p', { class: 'co-foot' }, tag('Assumptions'), ' radii, canopy shares, capacity and costs · ', tag('Proposed allocation, TBR'), ' latency split · method: ',
      el('a', { class: 'v2-link', href: 'https://github.com/corrigk/congo-river-basin-SRR/blob/main/docs/conops-model.md', target: '_blank', rel: 'noopener', text: 'ConOps model note' })),
  );
  syncControls();
}

// Segmented controls are rebuilt on change (a click, never mid-drag); sliders only update their value.
function syncControls() {
  ctl.year.replaceChildren(seg(YEARS.map(y => [y, String(y)]), S.year, v => { S.year = v; S.n = null; update({ data: true }); }, 'Year'));
  ctl.mode.replaceChildren(el('span', { class: 'co-sub', text: 'Reach counted by' }),
    seg(Object.entries(MODES).map(([k, m]) => [k, m.short]), S.mode, v => { S.mode = v; S.n = null; update({ data: true }); }, 'Coverage mode'));
  ctl.nodes.replaceChildren(seg([1, 2, 3, 4].map(k => [k, String(k)]), S.nodes.length, k => { S.nodes = BEST(k); nodeStats = nodeDistances(); update(); }, 'Number of database nodes'));
  ctl.nodeNote.textContent = `${S.nodes.join(', ')}. Average ${fmt(nodeStats.meanKm)} km to a node; ${fmt(nodeStats.within500)}% of people within 500 km. Click a city on the map to move one.`;
  ctl.leo.replaceChildren(el('span', { class: 'co-sub', text: 'LEO satellites' }), seg(LEO_SIZES.map(n => [n, String(n)]), S.leoSats, v => { S.leoSats = v; update(); }, 'LEO satellites'));
  ctl.fail.replaceChildren(seg(FAILS, S.fail, v => { S.fail = v; update(); }, 'Failure case'));
  ctl.stations.sync(); ctl.repeaters.sync(); ctl.sensors.forEach(s => s.sync());
  ctl.sensorSum.textContent = `${fmt(R.terminals)} terminals`;
  ctl.curve.replaceChildren(curveChart());
  // Sweet-spot band painted under the station slider.
  const pct = v => `${(v / 400) * 100}%`;
  ctl.spot.replaceChildren(
    el('div', { class: 'co-band', 'aria-hidden': 'true' }, el('i', { style: `left:${pct(spot.lo)};width:calc(${pct(spot.hi)} - ${pct(spot.lo)})` }), el('b', { style: `left:${pct(spot.knee)}` })),
    el('p', { class: 'co-note' }, `Sweet spot ${spot.knee} · range ${spot.lo}–${spot.hi} · `, el('button', { class: 'v2-link', text: 'use it', onclick: () => { S.n = spot.knee; update(); } })),
  );
}

function resetDesign() {
  const keepYear = S.year;
  Object.assign(S, DESIGN(), { year: keepYear, n: null });
  update({ data: true });
}

// ---------- legend (changes with the step; in "what" every item that can be switched is a button) ----------
function renderLegend() {
  if (S.step === 'why') {
    const item = (sw, text) => el('span', { class: 'co-lg is-fixed' }, el('i', { class: 'co-sw', style: sw }), text);
    $('.co-legend').replaceChildren(el('div', { class: 'co-lgroup' },
      item('background:linear-gradient(90deg,var(--seq-1),var(--seq-6))', 'People per km²'), item('background:var(--critical);border-radius:50%;opacity:.7', 'Conflict (size = deaths)'),
      item('background:var(--s2);border-radius:50%', 'Fire'), item('background:var(--river);border-radius:50%', 'Flood alert'),
      item('border:1px dashed var(--s6)', 'Protected area'), item('background:var(--text)', 'Infrastructure')));
    return;
  }
  const tog = (key, sw, text) => el('button', { class: 'co-lg', 'aria-pressed': String(!!S.show[key]), title: `Show or hide: ${text}`,
    onclick: () => { S.show[key] = !S.show[key]; if (key.startsWith('flow')) map.sync(S); else if (key === 'hud') renderHud(); else map.drawWhat(S, R); renderLegend(); } },
  el('i', { class: 'co-sw', style: sw }), text);
  const fixed = (sw, text) => el('span', { class: 'co-lg is-fixed' }, el('i', { class: 'co-sw', style: sw }), text);
  const grp = (title, ...items) => el('div', { class: 'co-lgroup' }, el('b', { text: title }), ...items);
  const lane = v => `height:4px;border-radius:2px;background:repeating-linear-gradient(90deg,var(${v}) 0 5px,transparent 5px 8px)`;
  $('.co-legend').replaceChildren(
    grp('Built', fixed('background:var(--s5);outline:1.5px solid var(--paper)', 'Database node'), fixed('background:var(--text);border-radius:50%', 'Ranger station'),
      fixed('background:var(--precip);clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)', 'Repeater'), tog('geo', 'border:2.5px solid var(--alert)', 'GEO alert footprint')),
    grp('Coverage', tog('coverage', 'background:var(--gold);opacity:.75', 'People within reach'), tog('reach', 'border:1.5px solid var(--river);border-radius:50%', 'Station / repeater reach')),
    grp('Sensors', ...Object.entries(FAMILY).map(([k, f]) => tog(k, `background:var(${f.col});border-radius:50%`, f.name.split(':')[0])),
      fixed('border:1.5px solid var(--critical);border-radius:50%', 'Misses S3-03')),
    grp('Data flow', tog('flowUp', lane('--data'), 'Sensor data ↑'), tog('flowAlert', lane('--alert'), 'Alerts ↓'), tog('flowTwo', lane('--s7'), 'Two-way ↔'),
      tog('hud', 'background:var(--glass);border:1px solid var(--line-2)', 'Numbers')),
  );
}

// ---------- the numbers on the map: time, data, reach, cost, each against the baseline ----------
function renderHud() {
  hud.hidden = !S.show.hud;
  if (!S.show.hud) return;
  const m = R.metrics, b = base.metrics;
  // kind: 'low' = lower is better, 'high' = higher is better, 'neutral' = neither
  const delta = (v, bv, unit, kind, digits = 1) => {
    const d = v - bv;
    if (!Number.isFinite(v) || !Number.isFinite(bv) || Math.abs(d) < 10 ** -digits / 2) return null;
    const cls = kind === 'neutral' ? 'is-neutral' : (kind === 'low' ? d < 0 : d > 0) ? 'is-good' : 'is-bad';
    return el('em', { class: cls, title: 'Change against the baseline design' }, `${d > 0 ? '▲' : '▼'}${fmt(Math.abs(d), digits)}${unit}`);
  };
  const min = v => (Number.isFinite(v) ? `${fmt(v, v < 10 ? 1 : 0)} min` : 'no path');
  const cell = (big, label, d, over, extra) => el('div', { class: `co-hud-c${over ? ' is-over' : ''}` }, el('b', { text: big }), d, el('span', { text: label }), extra);
  const usePct = Math.min(100, m.util * 100);
  hud.replaceChildren(
    cell(min(m.p95Fast), 'priority p95 · ≤30', delta(m.p95Fast, b.p95Fast, '', 'low'), m.p95Fast > 30),
    cell(min(m.avgCop), 'average message', delta(m.avgCop, b.avgCop, '', 'low')),
    cell(min(m.alertMin), 'alert · ≤10', delta(m.alertMin, b.alertMin, '', 'low'), m.alertMin > 10),
    cell(`${fmt(m.bytesDay / 1e6, 1)} MB`, m.saturated ? 'a day · network full' : `a day · ${fmt(usePct)}% full`, delta(m.bytesDay / 1e6, b.bytesDay / 1e6, '', 'neutral'), m.util > 0.8,
      el('i', { class: 'co-hud-bar', style: `--w:${usePct}%` })),
    cell(`${fmt(m.popPct, 1)}%`, 'people reached', delta(m.popPct, b.popPct, '', 'high')),
    cell(`$${fmt(m.costBase)}M`, `15 yr · ${fmt(m.costLow)}–${fmt(m.costHigh)}`, delta(m.costBase, b.costBase, '', 'low', 0), m.costBase > 400),
  );
}

// ---------- results: two tabs ----------
function renderResults() {
  const pane = $('.co-res .is-what');
  const tabs = el('div', { class: 'co-tabs' }, seg([['overview', 'Requirements and cost'], ['detail', 'How it adds up']], S.resTab, v => { S.resTab = v; renderResults(); }, 'Results'));
  pane.replaceChildren(tabs, ...(S.resTab === 'detail' ? detailTab() : overviewTab()));
}

function overviewTab() {
  const baseState = Object.fromEntries(base.checks.map(c => [c.id, c.state]));
  const checks = el('div', { class: 'co-checks', role: 'list', 'aria-label': 'Requirement checks' }, R.checks.map(c => {
    const changed = baseState[c.id] !== c.state;
    const chip = el('div', { class: `co-check is-${c.state}${changed ? ' is-changed' : ''}`, role: 'listitem', tabindex: 0,
      'aria-label': `${c.id} ${CHECK_FULL[c.id]}: ${c.state}. ${c.v}` },
    el('b', { text: c.id }), el('span', { text: CHECK_NAMES[c.id] }), el('i', { 'aria-hidden': 'true', text: c.state === 'pass' ? '✓' : c.state === 'near' ? '≈' : '✗' }));
    const tip = ev => showTip(ev, [el('b', { text: `${c.id} · ${CHECK_FULL[c.id]}` }), el('div', { text: c.v }), c.obj === undefined ? null : kv('Objective', c.obj ? 'met' : 'not met')]);
    chip.addEventListener('pointermove', tip); chip.addEventListener('pointerleave', hideTip);
    chip.addEventListener('focus', () => { const r = chip.getBoundingClientRect(); tip({ clientX: r.left, clientY: r.bottom }); }); chip.addEventListener('blur', hideTip);
    return chip;
  }));
  const C = R.counts;
  const count = (v, l) => el('div', { class: 'co-count' }, el('b', { text: v }), el('span', { text: l }));
  const counts = el('div', { class: 'co-counts' },
    count(fmt(C.stations), 'ranger stations'), count(fmt(C.repeaters), 'repeaters'), count(fmt(C.dbNodes), 'database nodes'),
    count(`${C.satellites}${C.geo ? ' + 1' : ''}`, `LEO${C.geo ? ' + GEO' : ''} satellites`), count(fmt(C.terminals), 'sensor terminals'), count(`${fmt(C.receivers / 1000)}k`, 'community receivers'));
  return [checks, el('h3', { class: 'co-h', text: 'How many' }), counts, costChart()];
}

// ---------- "How it adds up": what one lever does to everything, the time and data behind the numbers, the formulas ----------
const LEVERS = {
  leoSats: { name: 'Satellites', xs: () => LEO_SIZES, set: v => ({ leoSats: v }), cur: () => S.leoSats, fmtX: v => String(v) },
  n: { name: 'Stations', xs: () => [10, 25, 50, 75, spot.knee, 100, 150, 200, 300, 400].sort((a, b) => a - b), set: v => ({ n: v }), cur: () => S.n, fmtX: v => String(v) },
  repeaters: { name: 'Repeaters', xs: () => [0, 25, 50, 100, 150, 200, 300], set: v => ({ repeaters: v }), cur: () => S.repeaters, fmtX: v => String(v) },
  sensors: {
    name: 'Sensors', xs: () => [0.5, 1, 1.5, 2, 2.5, 3],
    set: f => ({ sensors: Object.fromEntries(D.sn.types.map(t => [t.id, Math.round(t.baseline_count * f)])) }),
    cur: () => D.sn.types.reduce((a, t) => a + S.sensors[t.id], 0) / D.sn.types.reduce((a, t) => a + t.baseline_count, 0), fmtX: v => `×${v}`,
  },
};
const sweepCache = new Map();
function sweep(key) {
  const L = LEVERS[key], sig = `${key}|${S.year}|${JSON.stringify({ ...opts(), [key]: null, ...(key === 'sensors' ? { sensors: null } : {}) })}`;
  if (!sweepCache.has(sig)) sweepCache.set(sig, L.xs().map(x => ({ x, m: evaluate(D, G.st, { ...opts(), ...L.set(x) }).metrics })));
  return sweepCache.get(sig);
}

function mini({ title, pts, series, ref, refLabel, cur, yFmt, xFmt }) {
  const W = 168, H = 104, m = { l: 34, r: 6, t: 16, b: 18 };
  const vals = series.flatMap(s => pts.map(p => s.y(p.m))).filter(Number.isFinite).concat(ref ?? []);
  const yMax = Math.max(1, ...vals) * 1.08, yMin = 0;
  const xs = pts.map(p => p.x), x0 = Math.min(...xs), x1 = Math.max(...xs);
  const X = v => m.l + ((v - x0) / Math.max(1e-9, x1 - x0)) * (W - m.l - m.r), Y = v => H - m.b - ((v - yMin) / (yMax - yMin)) * (H - m.t - m.b);
  const s = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'vsvg co-mini', role: 'img', 'aria-label': title });
  svText(s, { x: 2, y: 10, class: 'lbl' }, title);
  for (const v of [0, yMax / 2]) { sv('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: 'gl' }, s); svText(s, { x: m.l - 3, y: Y(v) + 3, 'text-anchor': 'end', class: 'axl' }, yFmt(v)); }
  if (ref != null && ref <= yMax) { sv('line', { x1: m.l, x2: W - m.r, y1: Y(ref), y2: Y(ref), stroke: 'var(--critical)', 'stroke-dasharray': '3 3', 'stroke-width': 1 }, s); svText(s, { x: W - m.r, y: Y(ref) - 3, 'text-anchor': 'end', class: 'sub', fill: 'var(--critical)' }, refLabel); }
  for (const sr of series) {
    const d = pts.map(p => [X(p.x), sr.y(p.m)]).filter(([, v]) => Number.isFinite(v)).map(([px_, v], i) => `${i ? 'L' : 'M'}${px_.toFixed(1)},${Y(v).toFixed(1)}`).join('');
    sv('path', { d, fill: 'none', stroke: `var(${sr.col})`, 'stroke-width': 2, 'stroke-dasharray': sr.dash || null }, s);
  }
  if (cur != null) sv('line', { x1: X(cur), x2: X(cur), y1: m.t, y2: H - m.b, class: 'cursor' }, s);
  svText(s, { x: m.l, y: H - 5, class: 'axl' }, xFmt(x0)); svText(s, { x: W - m.r, y: H - 5, 'text-anchor': 'end', class: 'axl' }, xFmt(x1));
  return s;
}

function detailTab() {
  const L = LEVERS[S.sweep], pts = sweep(S.sweep), cur = Math.min(Math.max(L.cur(), Math.min(...pts.map(p => p.x))), Math.max(...pts.map(p => p.x)));
  const min = v => `${fmt(v)}`;
  const grid = el('div', { class: 'co-minis' },
    mini({ title: '15-yr cost, $M', pts, series: [{ y: m => m.costBase, col: '--s4' }, { y: m => m.costHigh, col: '--s4', dash: '2 3' }], ref: 400, refLabel: 'cap', cur, yFmt: min, xFmt: L.fmtX }),
    mini({ title: 'Time to COP, min', pts, series: [{ y: m => m.p95Fast, col: '--s1' }, { y: m => m.avgCop, col: '--s1', dash: '3 3' }], ref: 30, refLabel: '30 min', cur, yFmt: min, xFmt: L.fmtX }),
    mini({ title: 'Network capacity used, %', pts, series: [{ y: m => Math.min(120, m.util * 100), col: '--data' }], ref: 100, refLabel: 'full', cur, yFmt: min, xFmt: L.fmtX }),
    mini({ title: 'Reach, %', pts, series: [{ y: m => m.popPct, col: '--gold' }, { y: m => m.fastShare * 100, col: '--s6', dash: '3 3' }], cur, yFmt: min, xFmt: L.fmtX }),
  );
  const rows = [['Lever value', 'Cost $M', 'p95 to COP', 'Average', 'Capacity used', 'People reached', 'Fast-path sensors'],
    ...pts.map(p => [L.fmtX(p.x), fmt(p.m.costBase), fmt(p.m.p95Fast, 1), fmt(p.m.avgCop, 1), `${fmt(p.m.util * 100)}%`, `${fmt(p.m.popPct, 1)}%`, `${fmt(p.m.fastShare * 100)}%`])];
  const sweepCard = chartBlock('co-sweep', `What ${L.name.toLowerCase()} change`, el('div', {},
    el('div', { class: 'co-slot co-lever' }, el('span', { class: 'co-sub', text: 'Vary' }), seg(Object.entries(LEVERS).map(([k, l]) => [k, l.name]), S.sweep, v => { S.sweep = v; renderResults(); }, 'Lever to vary')),
    grid, el('p', { class: 'co-note', text: 'Everything else stays as set. Solid: cost (base), p95 priority time, capacity used, people reached. Dashed: cost (high), average message, priority sensors on a fast path. The line marks the current value.' })), rows);
  return [sweepCard, timeCard(), dataCard(), formulas()];
}

function timeCard() {
  const A = ASSUME, lr = R.leo.row, m = R.metrics, F = A.s303FixedMin.threshold;
  const bars = [
    { label: 'Priority, fast path', parts: [['Acquire (F1)', 2, '--s4'], ['Wait for a pass (p95)', lr.open_sky_20deg.p95_wait_min, '--s1'], ['Queue', m.qPrio, '--critical'], ['Process (F3)', F - 2, '--s3']], ref: 30 },
    { label: 'Priority, under canopy', parts: [['Acquire (F1)', 2, '--s4'], ['Wait for a pass (p95)', lr.under_canopy_45deg.p95_wait_min, '--s1'], ['Queue', m.qPrio, '--critical'], ['Process (F3)', F - 2, '--s3']], ref: 30 },
    { label: 'Average message', parts: [['Acquire + process', F, '--s4'], ['Average wait', m.avgCop - F - m.qRoutine, '--s1'], ['Queue', m.qRoutine, '--critical']] },
    { label: 'Alert to audible', parts: [['Authorize and hand over', 2, '--s4'], ['GEO broadcast', 0.5, '--alert'], ['Playback', 1, '--s3']], ref: 10 },
  ];
  const W = 340, rowH = 30, top = 6, left = 108, max = 60, X = v => left + (Math.min(v, max) / max) * (W - left - 30);
  const s = sv('svg', { viewBox: `0 0 ${W} ${top + bars.length * rowH + 14}`, class: 'vsvg', role: 'img', 'aria-label': 'Where the time goes, in minutes' });
  bars.forEach((b, i) => {
    const y = top + i * rowH; let acc = 0;
    svText(s, { x: 0, y: y + 13, class: 'lbl' }, b.label);
    for (const [name, v, col] of b.parts) {
      if (!Number.isFinite(v) || v <= 0) continue;
      const r = sv('rect', { x: X(acc), y: y + 2, width: Math.max(0.8, X(acc + v) - X(acc)), height: 14, fill: `var(${col})` }, s);
      sv('title', {}, r).textContent = `${name}: ${fmt(v, 1)} min`; acc += v;
    }
    svText(s, { x: Math.min(X(acc) + 4, W - 2), y: y + 13, class: 'sub', 'text-anchor': acc > max ? 'end' : 'start' }, `${fmt(acc, acc < 10 ? 1 : 0)} min${acc > max ? ' →' : ''}`);
    if (b.ref) sv('line', { x1: X(b.ref), x2: X(b.ref), y1: y, y2: y + 18, stroke: 'var(--critical)', 'stroke-dasharray': '2 2' }, s);
  });
  const rows = [['Path', 'Part', 'Minutes'], ...bars.flatMap(b => b.parts.map(([n, v]) => [b.label, n, fmt(v, 1)]))];
  return chartBlock('co-time', 'Where the time goes (min)', el('div', {}, s, el('div', { class: 'v2-legend' },
    [['Acquire / process', '--s4'], ['Waiting for a satellite', '--s1'], ['Queue (congestion)', '--critical']].map(([t, c]) => el('span', {}, el('i', { style: `background:var(${c})` }), t)))), rows);
}

function dataCard() {
  const m = R.metrics, W = 340, cap = m.capacity, max = Math.max(cap, m.bytesDay) * 1.05, X = v => 4 + (v / max) * (W - 8);
  const s = sv('svg', { viewBox: `0 0 ${W} 62`, class: 'vsvg', role: 'img', 'aria-label': `Sensor data ${fmt(m.bytesDay / 1e6, 1)} MB per day against ${fmt(cap / 1e6)} MB per day capacity` });
  let acc = 0;
  for (const t of m.byType) {
    const col = FAMILY[familyOf(t.id)].col, r = sv('rect', { x: X(acc), y: 8, width: Math.max(0.5, X(acc + t.bytes) - X(acc)), height: 18, fill: `var(${col})`, stroke: 'var(--bg)', 'stroke-width': 0.6 }, s);
    sv('title', {}, r).textContent = `${t.name}: ${fmt(t.count)} × → ${fmt(t.bytes / 1e6, 2)} MB/day`; acc += t.bytes;
  }
  sv('line', { x1: X(cap), x2: X(cap), y1: 2, y2: 36, stroke: 'var(--critical)', 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }, s);
  svText(s, { x: Math.min(X(cap), W - 4), y: 48, 'text-anchor': 'end', class: 'sub', fill: 'var(--critical)' }, `capacity ${fmt(cap / 1e6)} MB/day`);
  svText(s, { x: 4, y: 48, class: 'lbl' }, `${fmt(m.bytesDay / 1e6, 1)} MB/day · ${m.saturated ? 'saturated' : `${fmt(m.util * 100)}% used`}`);
  const rows = [['Sensor type', 'Count', 'Bytes per day each', 'MB per day'], ...m.byType.map(t => [t.name, fmt(t.count), fmt(D.sn.types.find(x => x.id === t.id).bytes_per_day), fmt(t.bytes / 1e6, 2)])];
  return chartBlock('co-data', 'Data handled per day', el('div', {}, s, el('div', { class: 'v2-legend' },
    Object.values(FAMILY).map(f => el('span', {}, el('i', { style: `background:var(${f.col})` }), f.name.split(':')[0])))), rows);
}

function formulas() {
  const A = ASSUME, m = R.metrics, lr = R.leo.row, f = (v, d = 1) => fmt(v, d);
  const items = [
    ['Capacity', `${A.leoKbpsPerSat} kbps × 86,400 s × ${f(lr.open_sky_20deg.pct_time_in_contact, 0)}% of the day with a satellite in view = ${f(m.capacity / 1e6, 0)} MB/day`],
    ['Use', `${f(m.bytesDay / 1e6)} MB sensor data ÷ ${f(m.capacity / 1e6, 0)} MB capacity = ${f(m.util * 100, 0)}%`],
    ['Queue', m.saturated ? 'network saturated: routine data backs up' : `average wait ${f(lr.open_sky_20deg.mean_wait_min)} min × u/(1−u) = ${f(m.qRoutine)} min (priority sees half: ${f(m.qPrio)} min)`],
    ['Priority to COP', `F1 2 + p95 wait ${f(lr.open_sky_20deg.p95_wait_min)} + queue ${f(m.qPrio)} + F3 ${A.s303FixedMin.threshold - 2} = ${f(m.p95Fast)} min (under canopy ${f(m.p95Canopy, 0)} min)`],
    ['Within 30 min', `${f(m.fastShare * 100, 0)}% of priority sensors on a fast path (open sky, raised antenna or relay) → ${f(m.within30 * 100, 0)}% within 30 min`],
    ['Average message', `12 + ${f(m.fastShareAll * 100, 0)}% × ${f(lr.open_sky_20deg.mean_wait_min)} + ${f(100 - m.fastShareAll * 100, 0)}% × ${f(lr.under_canopy_45deg.mean_wait_min)} + queue ${f(m.qRoutine)} = ${f(m.avgCop)} min`],
    ['Alert to audible', `authorize 2 + GEO 0.5 + playback 1 = ${f(m.alertMin)} min`],
    ['S-3 share of warning', `priority ${f(m.p95Fast)} + alert ${f(m.alertMin)} = ${f(m.s3Chain)} min (agency evaluation F4–F5 not included)`],
    ['People reached', `station curve at ${S.n} stations = ${f(m.popPct)}% (${f(m.peopleReached / 1e6)}M people)`],
    ['Availability', `${A.avail.space * 100}% space × ${A.avail.rain * 100}% rain × (1 − 0.01^${S.nodes.length - (R.hubDown ? 1 : 0)}) ground = ${f(R.avail * 100, 2)}%`],
    ['Cost', `${R.lines.map(l => `${l.name.replace(/ \(.*\)/, '')} ${fmtM(l.base)}`).join(' + ')} = ${fmtM(m.costBase)}`],
    ['Value', `stations ${m.costPerPerson ? `$${f(m.costPerPerson, 2)}` : '–'} per person reached; whole system $${f(m.costPerTerminalYr, 0)} per sensor terminal per year`],
  ];
  return el('div', { class: 'vcard co-formulas' }, el('div', { class: 'vcard-h' }, el('h3', { text: 'The formulas, with today\'s numbers' }), tag('Illustrative')),
    el('dl', {}, items.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })])));
}

function costChart() {
  const W = 340, H = 104, cap = D.cost.budget.lcc_cap_usd / 1e6, max = Math.max(R.total.high, cap) * 1.06, x = v => 8 + (v / max) * (W - 16);
  const s = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'vsvg', role: 'img', 'aria-label': `15-year cost ${fmtM(R.total.base)}, range ${fmtM(R.total.low)} to ${fmtM(R.total.high)}, against the ${fmtM(cap)} cap` });
  let acc = 0;
  for (const l of R.lines) {
    const w = x(acc + l.base) - x(acc);
    const r = sv('rect', { x: x(acc), y: 22, width: Math.max(0.5, w), height: 20, fill: `var(${LINE_COL[l.k] || '--neu-4'})` }, s);
    sv('title', {}, r).textContent = `${l.name}: ${fmtM(l.base)} (${fmtM(l.low)}–${fmtM(l.high)})`;
    acc += l.base;
  }
  sv('line', { x1: x(R.total.low), x2: x(R.total.high), y1: 56, y2: 56, stroke: 'var(--text)', 'stroke-width': 1.5 }, s);
  for (const v of [R.total.low, R.total.high]) sv('line', { x1: x(v), x2: x(v), y1: 51, y2: 61, stroke: 'var(--text)', 'stroke-width': 1.5 }, s);
  sv('circle', { cx: x(R.total.base), cy: 56, r: 3.5, fill: 'var(--text)' }, s);
  svText(s, { x: x(R.total.low), y: 74, 'text-anchor': 'middle', class: 'sub' }, fmtM(R.total.low));
  svText(s, { x: x(R.total.high), y: 74, 'text-anchor': 'end', class: 'sub' }, fmtM(R.total.high));
  sv('line', { x1: x(cap), x2: x(cap), y1: 10, y2: 84, stroke: 'var(--critical)', 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }, s);
  svText(s, { x: x(cap), y: 96, 'text-anchor': 'middle', class: 'lbl', fill: 'var(--critical)' }, `$${cap}M cap`);
  svText(s, { x: 8, y: 14, class: 'lbl' }, `Base ${fmtM(R.total.base)}`);
  const d = R.total.base - base.total.base;
  if (Math.abs(d) >= 0.5) svText(s, { x: W - 8, y: 14, 'text-anchor': 'end', class: d > 0 ? 'sub co-up' : 'sub co-down' }, `${d > 0 ? '+' : '−'}${fmtM(Math.abs(d))} vs baseline`);
  const legend = el('div', { class: 'v2-legend co-costlegend' }, R.lines.map(l => el('span', {}, el('i', { style: `background:var(${LINE_COL[l.k] || '--neu-4'})` }), `${l.name.replace(/ \(.*\)/, '')} ${fmtM(l.base)}`)));
  const rows = [['Line', 'Low', 'Base', 'High'], ...R.lines.map(l => [l.name, fmtM(l.low), fmtM(l.base), fmtM(l.high)]), ['Total', fmtM(R.total.low), fmtM(R.total.base), fmtM(R.total.high)]];
  return chartBlock('co-cost', '15-year cost range', el('div', {}, s, legend), rows);
}

function curveChart() {
  const run = G.st.runs[S.mode], st = run.stations, W = 300, H = 118, m = { l: 32, r: 8, t: 8, b: 22 };
  const yMax = Math.ceil(st[st.length - 1].cum_pct / 10) * 10, x = n => m.l + (n / 400) * (W - m.l - m.r), y = p => H - m.b - (p / yMax) * (H - m.t - m.b);
  const s = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'vsvg', role: 'img', 'aria-label': `People within reach of ranger stations: ${fmt(R.popPct, 1)}% with ${S.n} stations; sweet spot ${spot.knee}, range ${spot.lo} to ${spot.hi}` });
  sv('rect', { x: x(spot.lo), y: m.t, width: x(spot.hi) - x(spot.lo), height: H - m.t - m.b, fill: 'var(--accent)', opacity: 0.1 }, s);
  for (const p of [0, yMax / 2, yMax]) { sv('line', { x1: m.l, x2: W - m.r, y1: y(p), y2: y(p), class: 'gl' }, s); svText(s, { x: m.l - 4, y: y(p) + 3, 'text-anchor': 'end', class: 'axl' }, `${p}%`); }
  for (const n of [0, 100, 200, 300, 400]) svText(s, { x: x(n), y: H - 10, 'text-anchor': 'middle', class: 'axl' }, String(n));
  sv('path', { d: `M${x(0)},${y(0)}${st.map((p, i) => `L${x(i + 1).toFixed(1)},${y(p.cum_pct).toFixed(1)}`).join('')}`, fill: 'none', stroke: `var(${MODES[S.mode].color})`, 'stroke-width': 2 }, s);
  sv('circle', { cx: x(spot.knee), cy: y(st[spot.knee - 1].cum_pct), r: 3.5, fill: 'var(--accent)' }, s);
  svText(s, { x: x(spot.knee) + 6, y: y(st[spot.knee - 1].cum_pct) + 14, class: 'sub' }, `sweet spot ${spot.knee}`);
  if (S.n > 0) {
    const p = st[S.n - 1];
    sv('line', { x1: x(S.n), x2: x(S.n), y1: m.t, y2: H - m.b, class: 'cursor' }, s);
    svText(s, { x: Math.min(x(S.n) + 5, W - 116), y: m.t + 10, class: 'lbl' }, `${fmt(p.cum_pct, 1)}% · $${fmt(p.cum_cost_musd, 1)}M`);
  }
  const rows = [['Stations', 'People within reach', '15-yr cost'], ...[20, 40, 60, spot.knee, 100, 150, 200, 300, 400].sort((a, b) => a - b).map(n => [String(n), `${fmt(st[n - 1].cum_pct, 1)}%`, `$${fmt(st[n - 1].cum_cost_musd, 1)}M`])];
  return chartBlock('co-curve', 'People within reach', s, rows);
}
