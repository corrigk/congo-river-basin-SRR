import './style.css';
import './s3/s3.css';
import { ICON, MARK } from './icons.js';
import { LATENCY, GEO_TARGET_KM2 } from './s3/content.js';
import * as V from './s3/views.js';
import { createSchematicMap } from './s3/schematic.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const app = $('#app');
const TABS = ['overview', 'requirements', 'scenario', 'interfaces', 'trades'];

// ---------- static chrome ----------
$('#brand-mark').innerHTML = MARK;
$('[data-act="fullscreen"]').innerHTML = ICON.expand;
$('[data-act="help"]').innerHTML = ICON.help;
$('#view-overview').innerHTML = V.overviewView();
$('#view-requirements').innerHTML = V.requirementsView();
$('#view-interfaces').innerHTML = V.interfacesView();
$('#view-trades').innerHTML = V.tradesView();
$('#sc-card').innerHTML = V.scenarioCard();
$('#lt-card').innerHTML = V.latencyCard();
$('#help').innerHTML = V.helpView();

// ---------- state ----------
// tab, mode ('t' threshold | 'o' objective), scenario + step, side panel, highlighted requirement.
const state = { tab: 'overview', mode: 't', sc: 'A', step: 0, panel: null, hl: null };

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
const schematic = createSchematicMap($('#map .map-sch'), { insets });
let map = schematic, globeMap = null, lastView = null;
const pref = { get: () => { try { return localStorage.getItem('srr-map'); } catch { return null; } },
               set: v => { try { localStorage.setItem('srr-map', v); } catch { /* private mode: no memory */ } } };

function useMap(kind) {
  if (kind === 'globe' && !globeMap) return;
  map = kind === 'globe' ? globeMap : schematic;
  app.dataset.map = kind;
  for (const b of $$('.map-switch [data-map]')) b.setAttribute('aria-pressed', b.dataset.map === kind);
  globeMap?.pause(state.tab !== 'scenario' || map !== globeMap);
  if (lastView) map.render(lastView);
}
function setMapStatus(s) {
  const text = { loading: 'Loading 3D globe…', failed: '3D globe unavailable', none: 'No WebGL: schematic only', ready: '' }[s];
  $('.map-status').textContent = text;
  $('.map-switch [data-map="globe"]').disabled = s !== 'ready';
}
const hasWebGL = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } };
async function loadGlobe() {
  if (!hasWebGL()) { setMapStatus('none'); return; }
  setMapStatus('loading');
  try {
    window.CESIUM_BASE_URL ??= './cesium/';
    const { createGlobeMap } = await import('./s3/globemap.js');
    globeMap = await createGlobeMap($('#map .map-globe'), { insets });
    setMapStatus('ready');
    useMap(pref.get() === 'schematic' ? 'schematic' : 'globe');
  } catch (err) {
    console.warn('Globe failed to load; staying on the schematic map.', err);
    globeMap = null;
    setMapStatus('failed');
  }
}

// ---------- routing (hash deep links, e.g. #scenario/A/3 from a slide) ----------
function readHash() {
  const [tab, sc, step] = location.hash.slice(1).split('/');
  if (TABS.includes(tab)) state.tab = tab;
  if (V.scenarioBy[sc]) state.sc = sc;
  const n = +step;
  if (n >= 1 && n <= V.scenarioBy[state.sc].steps.length) state.step = n - 1;
}
function writeHash() {
  const h = state.tab === 'scenario' ? `#scenario/${state.sc}/${state.step + 1}` : `#${state.tab}`;
  if (location.hash !== h) history.replaceState(null, '', h);
}
addEventListener('hashchange', () => { readHash(); render(); });

// ---------- render ----------
function render() {
  app.dataset.view = state.tab;
  app.dataset.mode = state.mode;
  for (const t of $$('.tabs [role="tab"]')) {
    const on = t.dataset.view === state.tab;
    t.setAttribute('aria-selected', on);
    t.tabIndex = on ? 0 : -1;
  }
  for (const v of TABS) $(`#view-${v}`).hidden = v !== state.tab;
  for (const b of $$('.mode button')) b.setAttribute('aria-pressed', b.dataset.mode === state.mode);
  moveInk();
  globeMap?.pause(state.tab !== 'scenario' || map !== globeMap);
  renderPanel();     // before the scenario, so the map frames around an open panel
  renderScenario();
  renderHighlights();
  writeHash();
}

function renderScenario() {
  const s = V.scenarioBy[state.sc], i = state.step, st = s.steps[i];
  for (const b of $$('.sc-pick [data-scenario]')) b.setAttribute('aria-checked', b.dataset.scenario === s.id);
  $('#sc-head').innerHTML = V.scenarioHead(s);
  $('#sc-steps').innerHTML = V.scenarioSteps(s, i);
  $('#sc-count').textContent = `Step ${i + 1} / ${s.steps.length}`;
  $('[data-act="step-prev"]').disabled = i === 0;
  $('[data-act="step-next"]').disabled = i === s.steps.length - 1;
  $('#sc-stages').innerHTML = V.stageStrip(st.stages);

  // Latency budget: shown for scenarios that carry it; segments fill in as the chain reaches them.
  app.classList.toggle('has-latency', !!s.latency);
  app.style.setProperty('--lt-h', `${$('#lt-card').offsetHeight}px`);
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
  else if (state.panel?.type === 'system') html = V.systemPanel(state.panel.k);
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
  app.classList.toggle('has-panel', !!html);
}

// Selected requirement / system glows wherever it appears; steps that cite the highlighted requirement are marked.
function renderHighlights() {
  const req = state.panel?.type === 'req' ? state.panel.k : state.hl;
  for (const el of $$('[data-req], [data-req-row]')) el.classList.toggle('is-hl', (el.dataset.req || el.dataset.reqRow) === req);
  const sys = state.panel?.type === 'system' ? state.panel.k : null;
  for (const el of $$('[data-system]')) el.classList.toggle('is-hl', el.dataset.system === sys);
  $('#view-interfaces').classList.toggle('has-sel', !!sys);
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
  const t = $(`.tabs [data-view="${state.tab}"]`), ink = $('.tabs-ink');
  if (t) Object.assign(ink.style, { width: `${t.offsetWidth}px`, transform: `translateX(${t.offsetLeft - 4}px)` });
}
addEventListener('resize', moveInk);

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
  const t = e.target.closest('button, [data-system], [data-act], [data-req-row]');
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
    }
  }
  if (d.view) { setTab(d.view); return; }
  if (d.mode) { setMode(d.mode); return; }
  if (d.map) { pref.set(d.map); useMap(d.map); return; }
  if (d.scenario) { setScenario(d.scenario); return; }
  if (d.openScenario) { setScenario(d.openScenario); return; }
  if (d.step) { goStep(+d.step); return; }
  if (d.goto) { const [sc, i] = d.goto.split(':'); state.hl = state.panel?.type === 'req' ? state.panel.k : state.hl; state.panel = null; setScenario(sc, +i); return; }
  if (d.trade) { setTab('trades'); $(`#trade-${d.trade}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  if (d.req) {
    // On the scenario map a requirement toggles its highlight; elsewhere it opens the requirement panel.
    if (state.tab === 'scenario') { state.hl = state.hl === d.req ? null : d.req; renderHighlights(); return; }
    openPanel({ type: 'req', k: d.req }); return;
  }
  if (d.reqRow) { openPanel({ type: 'req', k: d.reqRow }); return; }
  if (d.system) { if (state.tab !== 'interfaces') setTab('interfaces'); openPanel({ type: 'system', k: d.system }); return; }
});
// SVG interface nodes are focusable groups: Enter / Space activates them like buttons.
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('g[data-system]')) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
}, true);
document.addEventListener('pointerdown', e => {
  const h = $('#help');
  if (!h.hidden && !h.contains(e.target) && !e.target.closest('[data-act="help"]')) h.hidden = true;
});

// Keyboard (presentation clickers send PageUp / PageDown or arrows)
document.addEventListener('keydown', e => {
  if (e.target.closest?.('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key, lk = k.toLowerCase();
  const onControl = e.target.closest?.('button, summary, a, [role="tab"], g[data-system]');
  if ((k === ' ' || k === 'Enter') && onControl) return;
  if ((k === 'ArrowRight' || k === 'ArrowLeft') && e.target.closest?.('[role="tab"]')) {
    e.preventDefault();
    const tabs = $$('.tabs [role="tab"]'), i = tabs.indexOf(e.target.closest('[role="tab"]'));
    const next = tabs[(i + (k === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    next.focus(); setTab(next.dataset.view);
    return;
  }
  if (/^[1-5]$/.test(k)) { setTab(TABS[+k - 1]); return; }
  if (state.tab === 'scenario' && (k === 'ArrowRight' || k === 'PageDown' || k === ' ')) { e.preventDefault(); goStep(state.step + 1); return; }
  if (state.tab === 'scenario' && (k === 'ArrowLeft' || k === 'PageUp')) { e.preventDefault(); goStep(state.step - 1); return; }
  if (lk === 'r') { reset(); return; }
  if (lk === 'm') { const k = map === globeMap ? 'schematic' : 'globe'; pref.set(k); useMap(k); return; }
  if (lk === 't') { setMode(state.mode === 't' ? 'o' : 't'); return; }
  if (lk === 'f') { fullscreen(); return; }
  if (k === '?') { toggleHelp(); return; }
  if (k === 'Escape') {
    if (!$('#help').hidden) $('#help').hidden = true;
    else if (state.panel) { state.panel = null; render(); }
    else if (state.hl) { state.hl = null; renderHighlights(); }
  }
});

readHash();
render();
requestAnimationFrame(() => { moveInk(); app.classList.add('is-ready'); });
setTimeout(loadGlobe, 150); // after first paint: the page is usable before Cesium arrives
window.__srr = { state, render, get map() { return map; }, LATENCY };
