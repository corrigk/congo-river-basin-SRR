// HTML for the S-3 SRR views. Everything renders from src/s3/content.js and src/s3/scenarios.json.
// Threshold / objective values are both rendered (.v-t / .v-o); CSS shows the one #app[data-mode] selects.
import { RFP, GAP, MOS, REQS, reqBy, HEADLINES, CONSTRAINTS, TBR, LATENCY, FUNCTIONS, STAGES, stageBy } from './content.js';
import SC from './scenarios.json';
import SOURCES from '../../analysis/data/sources.json';
import { ICON } from '../icons.js';

export const SCENARIOS = SC.scenarios;
export const NODES = SC.nodes;
export const scenarioBy = Object.fromEntries(SCENARIOS.map(s => [s.id, s]));

export const pad = n => String(n).padStart(2, '0');
export const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const tv = (t, o) => `<span class="v-t">${esc(t)}</span><span class="v-o">${esc(o)}</span>`;
const moBy = Object.fromEntries(MOS.map(m => [m.id, m]));

// Who each mission objective serves, read straight from the MO text.
const MO_USERS = { 'MO-1': 'Gauge, sensor and wildlife-tag owners; rangers', 'MO-2': 'Communities; national agencies', 'MO-3': 'Rangers; responders' };

// Every scenario step that cites a requirement, for "where it applies".
export const stepsForReq = id => SCENARIOS.flatMap(s => s.steps.map((st, i) => ({ s, st, i })).filter(x => x.st.reqs.includes(id)));

const reqChip = id => `<button class="chip chip-req" data-req="${id}"><b>${id}</b><span>${esc(reqBy[id].name)}</span>${ICON.arrow}</button>`;
const moPill = id => `<span class="pill pill-mo" title="${esc(moBy[id].text)}">${id}</span>`;
const gapPill = k => `<span class="pill pill-gap is-${k}">${GAP[k].short}</span>`;
const tbrTag = (text = 'TBR') => `<span class="tbr">${text}</span>`;
const closeBtn = `<button class="p-close icon-btn" data-act="close" title="Close (Esc)" aria-label="Close panel">${ICON.close}</button>`;
const head = (eyebrow, title, extra = '') => `${closeBtn}<div class="p-eyebrow">${eyebrow}</div><h2 class="p-title">${title}</h2>${extra}`;
const pageHead = (eyebrow, title, lede) => `
  <header class="pv-head">
    <div><div class="pv-eyebrow">${eyebrow}</div><h2 class="pv-title">${title}</h2></div>
    <p class="pv-lede">${lede}</p>
  </header>`;
const modeNote = `<span class="mode-note">Showing <b class="v-t">threshold</b><b class="v-o">objective</b> values · press <kbd>T</kbd> to switch</span>`;

// ---------- 1. S-3 Overview ----------
export function overviewView() {
  return `
  <div class="pv-inner s3-page">
    ${pageHead(`RFP ${RFP.id} · System Requirements Review`, esc(RFP.name), `${esc(RFP.tagline)} ${esc(RFP.orbit)}`)}
    <div class="s3-gaptypes"><span>Gap types</span>${RFP.gapTypes.map(g => `<b>${g}</b>`).join('')}</div>

    <section class="s3-core" aria-label="Core gap">
      <div class="s3-core-head"><span class="pv-eyebrow">Core gap</span><h3>${esc(RFP.coreGap)}</h3></div>
      <div class="s3-gaps">
        ${['out', 'in'].map(k => `
        <div class="s3-gap is-${k}">
          <div class="s3-gap-t"><i></i>${esc(GAP[k].title)}</div>
          <ul>${GAP[k].facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
        </div>`).join('')}
      </div>
    </section>

    <div class="pv-section">Headline requirements ${modeNote}</div>
    <div class="s3-heads">
      ${HEADLINES.map(h => `
      <button class="s3-head" data-req="${h.id}">
        <span class="s3-head-id">${h.id}</span>
        <span class="s3-head-l">${esc(h.label)}</span>
        <b>${tv(h.t[0], h.o[0])}</b>
        <span class="s3-head-s">${tv(h.t[1], h.o[1])}</span>
      </button>`).join('')}
    </div>

    <div class="pv-section">Mission objectives</div>
    <div class="s3-mos">
      ${MOS.map(m => `
      <div class="s3-mo">
        <div class="s3-mo-top"><span class="s3-mo-id">${m.id}</span><span class="s3-mo-s">${m.short}</span></div>
        <p>${esc(m.text)}</p>
        <div class="s3-mo-reqs">${REQS.filter(r => r.mo.includes(m.id)).map(r => `<button class="pill pill-req" data-req="${r.id}">${r.id}</button>`).join('')}</div>
      </div>`).join('')}
    </div>
    <p class="s3-foot">${tbrTag('Proposed')} Requirement-to-objective traceability is ours, not the RFP’s.</p>

    <div class="pv-section">Where S-3 sits in the nine-stage loop <small>gold = S-3 carries the stage · blue = S-3 supports it</small></div>
    ${stageStrip()}

    <div class="pv-section">One comms layer, every hazard <small>flooding is one worked example</small></div>
    <div class="s3-scs">
      ${SCENARIOS.map(s => `
      <button class="s3-sc" data-open-scenario="${s.id}">
        <span class="s3-sc-id">${s.id}</span>
        <span class="s3-sc-b"><b>${esc(s.title)}</b><small>${esc(s.pov)}</small></span>
        <span class="s3-sc-r">${s.reqs.map(r => `<i>${r}</i>`).join('')}</span>
      </button>`).join('')}
    </div>
  </div>`;
}

export function stageStrip(active = []) {
  return `<ol class="st-strip">${STAGES.map(s => `
    <li class="st-node is-${s.s3 || 'none'}${active.includes(s.k) ? ' is-active' : ''}" data-stage-k="${s.k}" title="${esc(s.role)}">
      <span class="st-n">${s.n}</span><span class="st-t">${esc(s.title)}</span><span class="st-r">${esc(s.role)}</span>
    </li>`).join('')}</ol>`;
}

// ---------- 2. Requirements ----------
export function requirementsView() {
  return `
  <div class="pv-inner s3-page">
    ${pageHead('Level 0 requirements', 'Requirements', 'Ten Level 0 requirements, exactly as written in the RFP. Select one to see what it traces to and where it applies in the scenarios and on the map.')}
    <div class="rq-bar">${modeNote}<span class="rq-legend">${gapPill('out')} sensor data out ${gapPill('in')} warnings in</span></div>
    <div class="rq-table" role="table" aria-label="S-3 Level 0 requirements">
      <div class="rq-row rq-head" role="row">
        <span role="columnheader">ID</span><span role="columnheader">Requirement</span>
        <span role="columnheader" class="rq-c-t">Threshold</span><span role="columnheader" class="rq-c-o">Objective</span>
        <span role="columnheader">Traces to</span>
      </div>
      ${REQS.map(r => `
      <div class="rq-row" role="row" data-req-row="${r.id}">
        <button class="rq-id" data-req="${r.id}" role="rowheader" aria-label="${r.id}: ${esc(r.name)}">${r.id}</button>
        <span class="rq-name" role="cell">${esc(r.name)}</span>
        <span class="rq-c-t" role="cell">${esc(r.t)}</span>
        <span class="rq-c-o" role="cell">${esc(r.o)}</span>
        <span class="rq-tr" role="cell">${r.mo.map(moPill).join('')}${r.gap.map(gapPill).join('')}</span>
      </div>`).join('')}
    </div>
    <p class="s3-foot">${tbrTag('Proposed')} The “Traces to” column is our traceability, TBR. Requirement text and values are verbatim.</p>

    <div class="rq-cols">
      <section>
        <div class="pv-section">Constraints</div>
        <ul class="s3-cons">${CONSTRAINTS.map(c => `<li>${esc(c.text)}${c.tbr ? ` ${tbrTag()}` : ''}</li>`).join('')}</ul>
      </section>
      <section>
        <div class="pv-section">Open items (TBR)</div>
        <ol class="tbr-list">${TBR.map(t => `<li><span>${esc(t.text)}</span><small>${esc(t.owner)}</small></li>`).join('')}</ol>
      </section>
    </div>
  </div>`;
}

export function reqPanel(id) {
  const r = reqBy[id];
  const uses = stepsForReq(id);
  return `
    ${head('<span>Level 0 requirement</span><i></i><span>RFP S-3</span>', `${r.id} <small>${esc(r.name)}</small>`)}
    <div class="p-tv">
      <div class="p-tv-t"><span class="lbl">Threshold</span><p>${esc(r.t)}</p></div>
      <div class="p-tv-o"><span class="lbl">Objective</span><p>${esc(r.o)}</p></div>
    </div>
    <h3 class="p-h">Traces to ${tbrTag('Proposed')}</h3>
    <ul class="p-mos">${r.mo.map(m => `<li><b>${m}</b><span>${esc(moBy[m].text)}<small>Serves: ${esc(MO_USERS[m])}</small></span></li>`).join('')}</ul>
    ${r.gap.map(k => `<div class="p-block gap"><div class="p-block-top"><span class="lbl">Gap it closes · ${esc(GAP[k].title)}</span></div><ul class="p-facts">${GAP[k].facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>`).join('')}
    <button class="chip chip-decomp" data-decomp="${r.id}"><b>MO → L4</b><span>Show in the requirements decomposition</span>${ICON.arrow}</button>
    <h3 class="p-h">Where it applies</h3>
    <div class="p-chips">${uses.length ? uses.map(({ s, st, i }) => `
      <button class="chip chip-step" data-goto="${s.id}:${i}"><b>${s.id}${i + 1}</b><span>${esc(st.title)}<small>${esc(s.title)}</small></span>${ICON.arrow}</button>`).join('')
      : '<p class="p-text">Applies across the whole service rather than at one scenario step.</p>'}</div>`;
}

// ---------- 3. Scenario (chrome over the map) ----------
export function scenarioCard() {
  return `
    <button class="sc-back" data-view="flow">${ICON.prev}<span>Function flow</span></button>
    <div class="sc-pick" role="group" aria-label="Scenario">
      ${SCENARIOS.map(s => `<button data-scenario="${s.id}" aria-pressed="false" aria-label="Scenario ${s.id}: ${esc(s.title)}" title="${esc(s.title)}"><b>${s.id}</b><span>${esc(s.title)}</span></button>`).join('')}
    </div>
    <div class="sc-head" id="sc-head"></div>
    <ol class="sc-steps" id="sc-steps"></ol>
    <div class="sc-ctl">
      <button class="sc-btn" data-act="step-prev" aria-label="Back (←)">${ICON.prev}<span>Back</span></button>
      <span class="sc-count" id="sc-count" aria-live="polite"></span>
      <button class="sc-btn is-next" data-act="step-next" aria-label="Next (→)"><span>Next</span>${ICON.next}</button>
      <button class="sc-btn sc-reset" data-act="step-reset" title="Reset (R)" aria-label="Reset scenario (R)">${ICON.reset}</button>
    </div>
    <div class="sc-stages" id="sc-stages"></div>`;
}

export function scenarioHead(s) {
  return `<div class="pv-eyebrow">Scenario ${s.id} · ${esc(s.pov)}</div><h2 class="sc-title">${esc(s.title)}</h2><p class="sc-sum">${esc(s.summary)}</p>`;
}

export function scenarioSteps(s, i) {
  return s.steps.map((st, j) => `
    <li><button class="sc-step${j === i ? ' is-active' : ''}${j < i ? ' is-done' : ''}" data-step="${j}" ${j === i ? 'aria-current="step"' : ''}>
      <span class="sc-step-n">${j + 1}</span><span class="sc-step-t">${esc(st.title)}</span>
    </button></li>`).join('');
}

export function stepPanel(s, i) {
  const st = s.steps[i];
  const lat = st.latency && LATENCY[st.latency.leg];
  return `
    <div class="p-eyebrow"><span>Scenario ${s.id} · Step ${i + 1} of ${s.steps.length}</span></div>
    <h2 class="p-title">${esc(st.title)}</h2>
    <p class="p-text p-lead">${esc(st.text)}</p>
    ${st.before ? `<div class="p-block gap"><div class="p-block-top"><span class="lbl">Today, without S-3</span></div><p>${esc(st.before)}</p></div>` : ''}
    ${st.reqs.length ? `<h3 class="p-h">Requirements in play ${modeNote}</h3>
      <div class="p-reqs">${st.reqs.map(id => `<button class="p-req" data-req="${id}"><b>${id}</b><span>${esc(reqBy[id].name)}</span><em>${tv(reqBy[id].t, reqBy[id].o)}</em></button>`).join('')}</div>` : ''}
    ${lat ? `<p class="p-text p-latnote">${ICON.flow}<span>Counts against the <b>${lat.title.toLowerCase()}</b> budget below (${lat.req}).</span></p>` : ''}
    ${st.mo.length ? `<h3 class="p-h">Mission objective</h3><ul class="p-mos">${st.mo.map(m => `<li><b>${m}</b><span>${esc(moBy[m].text)}</span></li>`).join('')}</ul>` : ''}
    ${st.fn?.length ? `<h3 class="p-h">Functions in this step</h3><div class="p-fns">${st.fn.map(fnChip).join('')}</div>` : ''}
    ${st.interfaces?.length ? `<h3 class="p-h">Partner interfaces ${tbrTag()}</h3><ul class="p-ifs">${st.interfaces.map(x => `<li><span class="pill pill-rfp">${x.id}</span><span>${esc(x.note)}</span></li>`).join('')}</ul>` : ''}
    ${st.note ? `<p class="p-note">${esc(st.note)}</p>` : ''}
    <p class="p-foot">Map positions are illustrative. The scenario map draws no constellation; the notional baseline is in Space &amp; backhaul.</p>`;
}

// A function from the Level 1 flow (F1-F8 link back to it; continuous functions C1, C2 are labels).
function fnChip(id) {
  const f = FUNCTIONS.functions.find(x => x.id === id) || FUNCTIONS.continuous_functions.find(x => x.id === id);
  const label = `<b>${id}</b><span>${esc(f ? f.name : '')}</span>`;
  return id.startsWith('F') ? `<button class="chip chip-fn" data-fn="${id}">${label}${ICON.arrow}</button>` : `<span class="chip chip-fn is-static">${label}</span>`;
}

// Latency budget: both legs, both modes rendered; CSS picks the mode, JS marks the active segments.
export function latencyCard() {
  const bar = (leg, m) => {
    const L = LATENCY[leg];
    return `<div class="lt-bar v-${m}">${L.segments.map((g, j) => `
      <span class="lt-seg" data-seg="${leg}:${g.k}" style="flex:${g[m]};--j:${j}" title="${esc(g.label)}: ${g[m]} min">
        <b>${g[m]}</b><em><span class="lt-id">${esc(g.k)}</span><span class="lt-name">${esc(g.label.slice(g.k.length))}</span></em>
      </span>`).join('')}</div>`;
  };
  return `
    <div class="lt-head">
      <span class="lt-title">Latency budget</span>
      <span class="tbr">Proposed allocation, TBR</span>
      ${modeNote}
    </div>
    ${['uplink', 'alert'].map(leg => {
      const L = LATENCY[leg];
      return `<div class="lt-leg" data-leg="${leg}">
        <div class="lt-leg-h"><b>${L.title}</b><span>${L.req} · ${esc(L.from)} → ${esc(L.to)}</span><strong>≤${tv(L.total.t, L.total.o)} min</strong></div>
        ${bar(leg, 't')}${bar(leg, 'o')}
      </div>`;
    }).join('')}
    <p class="lt-foot">Totals are the ${LATENCY.uplink.req} and ${LATENCY.alert.req} requirement values. The split into segments is our proposed allocation, not a requirement.</p>`;
}

// ---------- sources drawer ----------
// Every citation in analysis/data/sources.json, plus what the on-page labels mean.
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
export function sourcesPanel() {
  const list = Object.values(SOURCES.sources);
  const label = (cls, text, what) => `<li><span class="${cls}">${text}</span><span>${what}</span></li>`;
  return `
    ${head(`<span>Sources</span><i></i><span>${list.length} cited</span>`, 'Sources and labels')}
    <p class="p-text">${esc(SOURCES._note)} Requirement text and numbers come from the RFP S-3 class document.</p>
    <h3 class="p-h">What the labels mean</h3>
    <ul class="src-labels">
      ${label('vtag is-assume', 'Assumption', 'A planning value we chose. Not sourced; open to change.')}
      ${label('vtag is-proxy', 'Modeled proxy', 'Placed or computed by a rule because the real data is not in hand yet.')}
      ${label('vtag is-baseline', 'Notional baseline', 'The architecture we drew to size things. The trade study is pending.')}
      ${label('tbr', 'TBR', 'To be resolved: a proposed allocation or open item, not a requirement.')}
    </ul>
    <h3 class="p-h">Cited sources</h3>
    <ol class="src-list">${list.map(s => `<li><span>${esc(s.title)}</span>${s.url
      ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(host(s.url))}<span class="sr-only"> (opens in a new tab)</span></a>` : ''}</li>`).join('')}</ol>`;
}

// ---------- help ----------
export function helpView() {
  const rows = [
    ['1 – 3', 'ConOps · Function flow · Requirements'], ['→ &nbsp;PgDn &nbsp;Space', 'ConOps: Why → What · scenario: next step'], ['← &nbsp;PgUp', 'Back'], ['R', 'Reset scenario'],
    ['T', 'Threshold / objective'], ['M', 'Next map: globe · ground · schematic'], ['G', 'Ground view'], ['O', 'Satellite: pass overhead / fixed in sky'], ['P', 'Presenter mode'], ['L', 'Light / dark theme'], ['S', 'Sources'], ['F', 'Fullscreen'], ['Esc', 'Close panel'], ['?', 'This help'],
  ];
  return `<div class="help-head"><span>Keyboard</span><button class="icon-btn" data-act="help" aria-label="Close shortcuts">${ICON.close}</button></div>
    <dl>${rows.map(([k, v]) => `<dt>${k.split(' &nbsp;').map(x => `<kbd>${x}</kbd>`).join('')}</dt><dd>${v}</dd>`).join('')}</dl>`;
}

export { stageBy };
