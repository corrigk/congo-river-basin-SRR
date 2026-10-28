import './style.css';
import './s3/s3.css';
import './s3/v2/v2.css'; // tokens and labels (.vtag) used outside the sections too
import { ICON, MARK } from './icons.js';
import { LATENCY, GEO_TARGET_KM2 } from './s3/content.js';
import * as V from './s3/views.js';
import { createSchematicMap } from './s3/schematic.js';
import { createOffline } from './s3/offline.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const app = $('#app');
// Three tabs: ConOps (why, then what / where / how many), Function flow (with the scenario walkthrough as a mode)
// and Requirements (mission & gap, Level 0, decomposition).
const SECTION_TABS = ['flow'];
const REQ_VIEWS = ['overview', 'requirements', 'decomposition'];
const TABS = ['conops', ...SECTION_TABS, ...REQ_VIEWS, 'scenario'];
const MAIN_TABS = ['conops', 'flow', 'requirements'];
const tabFor = v => (REQ_VIEWS.includes(v) ? 'requirements' : v === 'scenario' ? 'flow' : v);

// ---------- static chrome ----------
$('#brand-mark').innerHTML = MARK;
$('[data-act="fullscreen"]').innerHTML = ICON.expand;
$('[data-act="help"]').innerHTML = ICON.help;
$('[data-act="present"]').innerHTML = ICON.present;
$('[data-act="sources"]').innerHTML = ICON.book;
$('#view-overview').innerHTML = V.overviewView();
$('#view-requirements').innerHTML = V.requirementsView();
$('#sc-card').innerHTML = V.scenarioCard();
$('#lt-card').innerHTML = V.latencyCard();
$('#help').innerHTML = V.helpView();

// ---------- state ----------
// tab, mode ('t' threshold | 'o' objective), scenario + step, side panel, highlighted requirement.
const state = { tab: 'conops', coStep: 'why', mode: 't', sc: 'A', step: 0, panel: null, hl: null, dsel: null, dsrr: null, fn: null };

// ---------- map ----------
const panel = $('#panel');
const insets = () => {
  if (state.tab !== 'scenario') return { l: 0, r: 0, t: 0, b: 0 };
  const W = innerWidth, gut = 16;
  const card = $('#sc-card').getBoundingClientRect(), lt = $('#lt-card');
  const phone = W < 760;
  return {
    t: $('.map-switch').getBoundingClientRect().bottom + gut,
    l: phone ? 0 : card.right + gut,
    r: phone || !panel.classList.contains('is-open') ? 0 : panel.offsetWidth + 2 * gut, // not its rect: it may still be sliding in
    b: (lt.offsetParent && !phone ? innerHeight - lt.getBoundingClientRect().top : 0) + gut,
  };
};
// The schematic draws instantly with no WebGL or network; the 3D globe loads lazily and takes over once ready.
const offline = createOffline($('.offline'));
const schematic = createSchematicMap($('#map .map-sch'), { insets });
let map = schematic, globeMap = null, groundMap = null, lastView = null;
const pref = { get: () => { try { return localStorage.getItem('srr-map'); } catch { return null; } },
               set: v => { try { localStorage.setItem('srr-map', v); } catch { /* private mode: no memory */ } },
               present: () => { try { return localStorage.getItem('srr-present') === '1'; } catch { return false; } },
               setPresent: v => { try { localStorage.setItem('srr-present', v ? '1' : '0'); } catch { /* no memory */ } },
               orbit: () => { try { return localStorage.getItem('srr-orbit') || 'pass'; } catch { return 'pass'; } },
               setOrbit: v => { try { localStorage.setItem('srr-orbit', v); } catch { /* no memory */ } } };
const MAPS = ['globe', 'ground', 'schematic'];

function useMap(kind) {
  if (kind === 'ground' && !groundMap) { loadGround(); return; }
  if (kind === 'globe' && !globeMap) return;
  map = { globe: globeMap, ground: groundMap }[kind] || schematic;
  app.dataset.map = kind;
  for (const b of $$('.map-switch [data-map]')) b.setAttribute('aria-pressed', b.dataset.map === kind);
  pauseMaps();
  if (lastView) map.render(lastView);
}
// Only the visible WebGL map renders; the others stop their frame loops.
function pauseMaps() {
  globeMap?.pause(state.tab !== 'scenario' || map !== globeMap);
  groundMap?.pause(state.tab !== 'scenario' || map !== groundMap);
}
function pickMap(kind) { pref.set(kind); useMap(kind); }

// Ground view: an illustrative eye-level scene (Three.js), loaded the first time it is chosen.
let groundLoading = null;
function loadGround() {
  if (!hasWebGL()) return;
  groundLoading ||= import('./s3/groundmap.js')
    .then(({ createGroundMap }) => createGroundMap($('#map .map-ground'), { insets, orbit: pref.orbit() }))
    .then(g => { groundMap = g; $('.map-switch').append(g.controls); useMap('ground'); })
    .catch(err => { console.warn('Ground view failed to load.', err); $('.map-switch [data-map="ground"]').disabled = true; groundLoading = null; });
}
function setMapStatus(s) {
  const text = { loading: 'Loading 3D globe…', failed: '3D globe unavailable', none: 'No WebGL: schematic only', file: 'Offline file: schematic only',
    uncached: 'Offline and the globe is not cached: schematic only', ready: '' }[s];
  $('.map-status').textContent = text;
  $('.map-switch [data-map="globe"]').disabled = s !== 'ready';
  $('.map-switch [data-map="ground"]').disabled = s === 'none';
}
const hasWebGL = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } };
// Can we reach the server? sw.js is never cached, so this goes to the network even with the service worker.
const reachable = () => Promise.race([
  fetch(`./sw.js?probe=${Date.now()}`, { cache: 'no-store' }).then(r => r.ok, () => false),
  new Promise(r => setTimeout(() => r(false), 4000)),
]);
async function loadGlobe() {
  if (!hasWebGL()) { setMapStatus('none'); return; }
  setMapStatus('loading');
  // Offline with only part of the globe cached (the connection dropped while it was being saved), the globe
  // would come up as a black sphere. Stay on the schematic map; the globe returns once the files are cached.
  const cached = await offline.status().catch(() => null);
  if (cached && !cached.globe && !(await reachable())) { setMapStatus('uncached'); $('.map-switch [data-map="ground"]').disabled = true; return; }
  try {
    window.CESIUM_BASE_URL ??= './cesium/';
    const { createGlobeMap } = await import('./s3/globemap.js');
    globeMap = await createGlobeMap($('#map .map-globe'), { insets });
    setMapStatus('ready');
    setTimeout(() => offline.preload(), 2000); // the globe files are already downloaded: keep them for offline use
    if (pref.get() !== 'ground') useMap(pref.get() === 'schematic' ? 'schematic' : 'globe');
  } catch (err) {
    console.warn('Globe failed to load; staying on the schematic map.', err);
    globeMap = null;
    setMapStatus(location.protocol.startsWith('http') ? 'failed' : 'file');
  }
}

// The scenario card and the ground view's orbit box sit above the latency budget, so track its real height
// (measuring during render reads 0 while the Scenario tab is hidden).
new ResizeObserver(([e]) => { if (e.contentRect.height) app.style.setProperty('--lt-h', `${$('#lt-card').offsetHeight}px`); }).observe($('#lt-card'));

// ---------- routing (hash deep links, e.g. #scenario/A/3 from a slide) ----------
function readHash() {
  const [tab, sc, step] = location.hash.slice(1).split('/');
  if (TABS.includes(tab)) state.tab = tab;
  if (tab === 'conops') { state.coStep = sc === 'what' ? 'what' : 'why'; return; }
  if (tab === 'decomposition') { state.dsel = sc ? decodeURIComponent(sc) : null; return; }
  if (tab === 'flow') { state.fn = /^F\d$/.test(sc || '') ? sc : null; return; }
  if (V.scenarioBy[sc]) state.sc = sc;
  const n = +step;
  if (n >= 1 && n <= V.scenarioBy[state.sc].steps.length) state.step = n - 1;
}
function writeHash() {
  const h = state.tab === 'scenario' ? `#scenario/${state.sc}/${state.step + 1}`
    : state.tab === 'conops' ? `#conops${state.coStep === 'what' ? '/what' : ''}`
    : state.tab === 'decomposition' && state.dsel ? `#decomposition/${encodeURIComponent(state.dsel)}` : `#${state.tab}`;
  if (location.hash !== h) history.replaceState(null, '', h);
}
addEventListener('hashchange', () => { readHash(); render(); });

// ---------- render ----------
function render() {
  app.dataset.view = state.tab;
  app.dataset.mode = state.mode;
  const sub = REQ_VIEWS.includes(state.tab);
  $('#req-subnav').hidden = !sub;
  app.classList.toggle('has-subnav', sub);
  for (const b of $$('#req-subnav [data-view]')) b.setAttribute('aria-current', b.dataset.view === state.tab ? 'page' : 'false');
  for (const t of $$('.tabs [role="tab"]')) {
    const on = t.dataset.view === tabFor(state.tab);
    t.setAttribute('aria-selected', on);
    t.tabIndex = on ? 0 : -1;
  }
  for (const v of TABS) $(`#view-${v}`).hidden = v !== state.tab;
  for (const b of $$('.mode button')) b.setAttribute('aria-pressed', b.dataset.mode === state.mode);
  moveInk();
  pauseMaps();
  renderPanel();     // before the scenario, so the map frames around an open panel
  renderScenario();
  renderHighlights();
  renderDecomposition();
  renderAnalysis();
  renderConops();
  writeHash();
}

// ---------- decomposition tab (loaded the first time it opens) ----------
let decomp = null, decompLoading = null;
function loadDecomposition() {
  decompLoading ||= import('./s3/decomp/view.js').then(({ createDecomposition }) => {
    decomp = createDecomposition($('#view-decomposition'), { goSrr, onSelect: id => { state.dsel = id; render(); } });
    return decomp;
  });
  return decompLoading;
}
function renderDecomposition() {
  if (state.tab !== 'decomposition') return;
  loadDecomposition().then(d => {
    if (state.dsrr) { state.dsel = d.findBySrr(state.dsrr) || state.dsel; state.dsrr = null; writeHash(); }
    if (state.tab === 'decomposition') d.render(state.dsel);
  });
}
// From a decomposition block to the matching place on this page.
function goSrr(kind, ref) {
  if (kind === 'scenario') { const sc = ref[0], i = +ref.slice(1) - 1; if (V.scenarioBy[sc]) setScenario(sc, i); return; }
  if (kind === 'interface') { // the first scenario step that exercises this partner interface
    for (const s of V.SCENARIOS) { const i = s.steps.findIndex(st => st.interfaces?.some(x => x.id === ref)); if (i >= 0) { setScenario(s.id, i); return; } }
    setTab('flow'); return;
  }
  if (kind === 'trade') { state.coStep = 'what'; setTab('conops'); return; } // the space and backhaul options live in the ConOps design
  if (kind === 'srr-req') { setTab('requirements'); openPanel({ type: 'req', k: ref }); }
}

function renderScenario() {
  const s = V.scenarioBy[state.sc], i = state.step, st = s.steps[i];
  for (const b of $$('.sc-pick [data-scenario]')) b.setAttribute('aria-pressed', b.dataset.scenario === s.id);
  $('#sc-head').innerHTML = V.scenarioHead(s);
  $('#sc-steps').innerHTML = V.scenarioSteps(s, i);
  $('#sc-steps .is-active')?.scrollIntoView({ block: 'nearest' }); // the list scrolls on short screens
  $('#sc-count').textContent = `Step ${i + 1} / ${s.steps.length}`;
  $('[data-act="step-prev"]').disabled = i === 0;
  $('[data-act="step-next"]').disabled = i === s.steps.length - 1;
  $('#sc-stages').innerHTML = V.flowStrip(st.fn);

  // Latency budget: shown for scenarios that carry it; segments fill in as the chain reaches them.
  app.classList.toggle('has-latency', !!s.latency);
  const done = new Set(), on = new Set();
  s.steps.forEach((x, j) => {
    if (!x.latency || j > i) return;
    for (const k of x.latency.segments) (j === i ? on : done).add(`${x.latency.leg}:${k}`);
  });
  for (const seg of $$('.lt-seg')) {
    seg.classList.toggle('is-on', on.has(seg.dataset.seg));
    seg.classList.toggle('is-done', done.has(seg.dataset.seg));
  }
  for (const leg of $$('.lt-leg')) leg.classList.toggle('is-on', [...on].some(k => k.startsWith(leg.dataset.leg)));

  if (state.tab !== 'scenario') return;
  const area = st.area ? { km2: GEO_TARGET_KM2 } : null;
  lastView = { nodes: V.NODES, show: st.show, links: st.links, state: st.state || {}, focus: st.focus, area, mode: state.mode };
  map.render(lastView);
}

function renderPanel() {
  let html = '';
  if (state.tab === 'scenario') html = V.stepPanel(V.scenarioBy[state.sc], state.step);
  else if (state.panel?.type === 'req') html = V.reqPanel(state.panel.k);
  else if (state.panel?.type === 'sources') html = V.sourcesPanel();
  const key = state.tab === 'scenario' ? `step:${state.sc}:${state.step}` : state.panel ? `${state.panel.type}:${state.panel.k}` : '';
  if (html && panel.dataset.k !== key) {
    panel.classList.remove('is-swap');
    void panel.offsetWidth;
    panel.innerHTML = `<div class="p-inner">${html}</div>`;
    panel.classList.add('is-swap');
    panel.scrollTop = 0;
    $('#announce').textContent = $('.p-title', panel)?.textContent || '';
  }
  panel.dataset.k = html ? key : '';
  panel.classList.toggle('is-open', !!html);
  panel.classList.toggle('stage', state.tab === 'scenario'); // over the map it keeps the dark stage tokens
  $('[data-act="sources"]').setAttribute('aria-expanded', state.panel?.type === 'sources');
  app.classList.toggle('has-panel', !!html);
}

// The selected requirement glows wherever it appears; steps that cite the highlighted requirement are marked.
function renderHighlights() {
  const req = state.panel?.type === 'req' ? state.panel.k : state.hl;
  for (const el of $$('[data-req], [data-req-row]')) el.classList.toggle('is-hl', (el.dataset.req || el.dataset.reqRow) === req);
  const s = V.scenarioBy[state.sc];
  for (const b of $$('.sc-step')) {
    const hit = !!state.hl && s.steps[+b.dataset.step].reqs.includes(state.hl);
    b.classList.toggle('is-hl', hit);
    b.dataset.hl = hit ? state.hl : '';
  }
  $('#sc-card').classList.toggle('has-hl', !!state.hl);
  $('#map').classList.toggle('is-hl', !!state.hl && s.steps[state.step].reqs.includes(state.hl));
}

// ---------- actions ----------
// ---------- brief v2 analysis sections (loaded with the first section opened) ----------
let analysis = null;
function renderAnalysis() {
  if (!SECTION_TABS.includes(state.tab)) return;
  (analysis ||= import('./s3/v2/sections.js')).then(m => {
    if (!SECTION_TABS.includes(state.tab)) return;
    if (state.fn) { m.S.fn = state.fn; state.fn = null; } // arrived from a scenario step's function chip
    m.renderSection(state.tab, $(`#view-${state.tab}`));
  });
}
// ---------- ConOps tab (loaded the first time it is opened) ----------
let conops = null;
function renderConops() {
  if (state.tab !== 'conops') return;
  (conops ||= import('./s3/conops/view.js').then(async m => { await m.mount($('#view-conops'), state.coStep); return m; }))
    .then(m => { if (state.tab === 'conops') m.setStep(state.coStep); });
}
function setCoStep(step) {
  if (step === state.coStep) return;
  state.coStep = step;
  writeHash();
  conops?.then(m => m.setStep(step));
  $('#announce').textContent = step === 'what' ? 'What we build, where, and how many' : 'Why the basin needs S-3';
}
let resizeT;
addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (state.tab === 'conops') conops?.then(m => m.refit()); }, 200); });

function setTab(t) {
  if (!TABS.includes(t)) return;
  if (t !== state.tab) state.panel = null;
  state.tab = t;
  render();
}
function goStep(i) {
  const n = V.scenarioBy[state.sc].steps.length;
  state.step = Math.max(0, Math.min(n - 1, i));
  if (state.tab !== 'scenario') state.tab = 'scenario';
  render();
}
function setScenario(id, step = 0) { state.sc = id; state.step = step; goStep(step); }
function reset() { state.step = 0; state.hl = null; render(); }
function setMode(m) { state.mode = m; render(); $('#announce').textContent = m === 't' ? 'Showing threshold values' : 'Showing objective values'; }
function openPanel(p) {
  if (state.tab === 'scenario') return;
  state.panel = state.panel && p && state.panel.type === p.type && state.panel.k === p.k ? null : p;
  render();
}

function moveInk() {
  const t = $(`.tabs [role="tab"][data-view="${tabFor(state.tab)}"]`), ink = $('.tabs-ink');
  if (t) Object.assign(ink.style, { width: `${t.offsetWidth}px`, transform: `translateX(${t.offsetLeft - 4}px)` });
}
addEventListener('resize', () => { moveInk(); if (state.tab === 'decomposition') decomp?.resize(); });

// Presenter mode: larger type, higher contrast, no keyboard hints. ?present in the link turns it on.
function setPresent(on) {
  app.classList.toggle('is-present', on);
  $('[data-act="present"]').setAttribute('aria-pressed', on);
  pref.setPresent(on);
  requestAnimationFrame(() => { moveInk(); map.refit?.(); });
}

// Theme: html[data-theme] when the presenter picked one (L), else the system setting. Modules that paint with
// the tokens (the 2D map canvas) listen for 'srr-theme'.
const systemLight = matchMedia('(prefers-color-scheme: light)');
const isLight = () => (document.documentElement.dataset.theme || (systemLight.matches ? 'light' : 'dark')) === 'light';
function syncTheme() {
  const b = $('[data-act="theme"]'), light = isLight();
  b.innerHTML = light ? ICON.moon : ICON.sun;
  b.setAttribute('aria-label', light ? 'Switch to dark theme' : 'Switch to light theme');
  $('meta[name="theme-color"]').content = light ? '#FAF8F2' : '#0A0A0A';
  dispatchEvent(new Event('srr-theme'));
}
function toggleTheme() {
  const next = isLight() ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('srr-theme', next); } catch { /* no memory */ }
  syncTheme();
  $('#announce').textContent = `${next === 'light' ? 'Light' : 'Dark'} theme`;
}
systemLight.addEventListener('change', syncTheme);

function toggleHelp() {
  const h = $('#help');
  h.hidden = !h.hidden;
  if (!h.hidden) $('button', h)?.focus();
}
function fullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
}

// ---------- events ----------
document.addEventListener('click', e => {
  const t = e.target.closest('button, [data-act], [data-req-row]');
  if (!t) return;
  const d = t.dataset;
  if (d.act) {
    switch (d.act) {
      case 'step-next': goStep(state.step + 1); return;
      case 'step-prev': goStep(state.step - 1); return;
      case 'step-reset': reset(); return;
      case 'close': state.panel = null; render(); return;
      case 'help': toggleHelp(); return;
      case 'fullscreen': fullscreen(); return;
      case 'preload': offline.preload(); return;
      case 'present': setPresent(!app.classList.contains('is-present')); return;
      case 'theme': toggleTheme(); return;
      case 'skip': { const v = $(`#view-${state.tab}`); v.tabIndex = -1; v.focus(); return; }
      case 'sources': openPanel({ type: 'sources', k: 'all' }); return;
    }
  }
  if (d.view) { setTab(d.view === 'requirements' && t.getAttribute('role') === 'tab' && REQ_VIEWS.includes(state.tab) ? state.tab : d.view); return; }
  if (d.fn) { location.hash = `#flow/${d.fn}`; return; }
  if (d.coStep) { setCoStep(d.coStep); return; }
  if (d.mode) { setMode(d.mode); return; }
  if (d.map) { pickMap(d.map); return; }
  if (d.orbit) { groundMap?.setOrbit(d.orbit); pref.setOrbit(d.orbit); return; }
  if (d.scenario) { setScenario(d.scenario); return; }
  if (d.openScenario) { setScenario(d.openScenario); return; }
  if (d.step) { goStep(+d.step); return; }
  if (d.decomp) { state.dsrr = d.decomp; state.panel = null; setTab('decomposition'); return; }
  if (d.goto) { const [sc, i] = d.goto.split(':'); state.hl = state.panel?.type === 'req' ? state.panel.k : state.hl; state.panel = null; setScenario(sc, +i); return; }
  if (d.req) {
    // On the scenario map a requirement toggles its highlight; elsewhere it opens the requirement panel.
    if (state.tab === 'scenario') { state.hl = state.hl === d.req ? null : d.req; renderHighlights(); return; }
    openPanel({ type: 'req', k: d.req }); return;
  }
  if (d.reqRow) { openPanel({ type: 'req', k: d.reqRow }); return; }
});
document.addEventListener('pointerdown', e => {
  const h = $('#help');
  if (!h.hidden && !h.contains(e.target) && !e.target.closest('[data-act="help"]')) h.hidden = true;
});

// Keyboard (presentation clickers send PageUp / PageDown or arrows)
document.addEventListener('keydown', e => {
  if (e.target.closest?.('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key, lk = k.toLowerCase();
  const onControl = e.target.closest?.('button, summary, a, [role="tab"]');
  if ((k === ' ' || k === 'Enter') && onControl) return;
  if ((k === 'ArrowRight' || k === 'ArrowLeft') && e.target.closest?.('[role="tab"]')) {
    e.preventDefault();
    const tabs = $$('.tabs [role="tab"]'), i = tabs.indexOf(e.target.closest('[role="tab"]'));
    const next = tabs[(i + (k === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    next.focus(); setTab(next.dataset.view);
    return;
  }
  if (/^[1-3]$/.test(k)) { const t = MAIN_TABS[+k - 1]; setTab(t === 'requirements' && REQ_VIEWS.includes(state.tab) ? state.tab : t); return; }
  if (state.tab === 'conops' && (k === 'ArrowRight' || k === 'PageDown' || k === ' ')) { e.preventDefault(); setCoStep('what'); return; }
  if (state.tab === 'conops' && (k === 'ArrowLeft' || k === 'PageUp')) { e.preventDefault(); setCoStep('why'); return; }
  if (state.tab === 'scenario' && (k === 'ArrowRight' || k === 'PageDown' || k === ' ')) { e.preventDefault(); goStep(state.step + 1); return; }
  if (state.tab === 'scenario' && (k === 'ArrowLeft' || k === 'PageUp')) { e.preventDefault(); goStep(state.step - 1); return; }
  if (lk === 'r') { reset(); return; }
  if (lk === 'm') { // cycle through the maps that are available
    const avail = MAPS.filter(k => !$(`.map-switch [data-map="${k}"]`).disabled);
    pickMap(avail[(avail.indexOf(app.dataset.map) + 1) % avail.length]); return;
  }
  if (lk === 'g') { pickMap('ground'); return; }
  if (lk === 'o' && map === groundMap) { const o = groundMap.orbit === 'pass' ? 'fixed' : 'pass'; groundMap.setOrbit(o); pref.setOrbit(o); return; }
  if (lk === 't') { setMode(state.mode === 't' ? 'o' : 't'); return; }
  if (lk === 'f') { fullscreen(); return; }
  if (lk === 'p') { setPresent(!app.classList.contains('is-present')); return; }
  if (lk === 'l') { toggleTheme(); return; }
  if (lk === 's' && state.tab !== 'scenario') { openPanel({ type: 'sources', k: 'all' }); return; }
  if (k === '?') { toggleHelp(); return; }
  if (k === 'Escape') {
    if (!$('#help').hidden) $('#help').hidden = true;
    else if (state.panel) { state.panel = null; render(); }
    else if (state.tab === 'decomposition' && state.dsel) { state.dsel = null; render(); }
    else if (state.hl) { state.hl = null; renderHighlights(); }
    else if (state.tab === 'scenario') setTab('flow');
  }
});

readHash();
syncTheme();
setPresent(new URLSearchParams(location.search).has('present') || pref.present());
render();
requestAnimationFrame(() => { moveInk(); app.classList.add('is-ready'); });
setTimeout(loadGlobe, 150); // after first paint: the page is usable before Cesium arrives
if (pref.get() === 'ground') setTimeout(loadGround, 150);
window.__srr = { state, render, get map() { return map; }, LATENCY };
