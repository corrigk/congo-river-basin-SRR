// The Function flow section (tab 2): the team's nine-block Level 1 flow, each block's steps and traceability, and
// the S3-03 / S3-05 latency budgets. Every figure is read from the pipeline's data (analysis/data/functions.json),
// so a rerun updates the page. The ConOps tab (src/s3/conops) holds the map, the design levers and the costs.
import './v2.css'; // also imported by main.js; kept so the module stands alone
import { D } from './data.js';
import SC from '../scenarios.json';
import { el, fmt, seg, tag, chartBlock, card, stackBars } from './ui.js';

export const S = { haz: 'flood', fn: 'F1', lat: 'threshold' };
const FN_COL = ['#C99A2E', '#C88A2A', '#C47B2E', '#B86E36', '#A9663E', '#9A6B57', '#8F7769', '#8A8276', '#7E8C8A'];
const fnBy = id => D.fn.functions.find(f => f.id === id);
const head = (eyebrow, title, lede) => el('header', { class: 'v2-head' },
  el('div', {}, el('div', { class: 'pv-eyebrow', text: eyebrow }), el('h2', { class: 'v2-title', text: title })),
  el('p', { class: 'v2-lede' }, lede));

// =============== 1. Function flow ===============
// The team's nine blocks. F1-F4 left to right, then down and F5-F8 right to left (serpentine, as on the team's
// slide); at F8 Verify, missing acknowledgments send the alert back to F6 Broadcast; F9 Coordinate runs alongside.
function flow(ctx) {
  const F = D.fn, f = fnBy(S.fn) || fnBy('F1'), hz = F.hazards.find(h => h.id === S.haz);
  const order = ['F1', 'F2', 'F3', 'F4', 'F8', 'F7', 'F6', 'F5'];
  const box = (id, k) => {
    const fn = fnBy(id), i = +id.slice(1) - 1;
    return el('button', { class: `v2-fn${k >= 4 ? ' is-back' : ''}${fn.decision ? ' is-decision' : ''}`, style: `--c:${FN_COL[i]}`, 'aria-pressed': String(S.fn === id), onclick: () => { S.fn = id; ctx.full(); } },
      el('span', { class: 'v2-fn-id', text: id }), el('span', { text: fn.title }),
      fn.decision ? el('span', { class: 'v2-fn-q', text: `${fn.decision.question} Yes: ${fn.decision.yes.toLowerCase()}` }) : null);
  };
  const v = fnBy('F8').decision, p = fnBy('F9');
  const boxes = el('div', { class: 'v2-flow', role: 'group', 'aria-label': 'Level 1 functional flow' },
    order.map(box),
    el('div', { class: 'v2-loop', role: 'note', 'aria-label': `F8 to F6 if not all acknowledged: ${v.no_label}` },
      el('span', { text: `No: ${v.no_label.toLowerCase()} (back to ${v.no})` })),
    el('button', { class: 'v2-fn is-persistent', style: `--c:${FN_COL[8]}`, 'aria-pressed': String(S.fn === 'F9'), onclick: () => { S.fn = 'F9'; ctx.full(); } },
      el('span', { class: 'v2-fn-id', text: 'F9 · persistent' }), el('span', { text: p.title }), el('span', { class: 'v2-fn-q', text: 'Runs alongside every block, with towers and the grid down' })));
  const L = (F.derived_L1_drafts || []).filter(r => r.function === f.id), lt = f.latency_min;
  // Scenario walkthrough steps that exercise this function (the walkthrough is a mode of this section).
  const inSteps = SC.scenarios.flatMap(s => s.steps.map((st, i) => ({ s, st, i })).filter(x => x.st.fn?.includes(f.id)));
  const detail = card(`${f.id} · ${f.title}${f.persistent ? ' (persistent)' : ''}`,
    el('p', { text: f.description }),
    f.id === 'F1' ? el('p', { class: 'why' }, el('b', { text: `${hz.name}: ` }), hz.detect_example) : null,
    el('h4', { text: 'Steps' }),
    el('ol', { class: 'v2-substeps' }, f.steps.map(t => el('li', { text: t }))),
    f.decision ? el('p', { class: 'why' }, el('b', { text: `${f.decision.question} ` }), `Yes: ${f.decision.yes.toLowerCase()}. No: ${f.decision.no_label.toLowerCase()} (back to ${f.decision.no}).`) : null,
    el('p', {}, el('b', { text: 'Performed by: ' }), f.performed_by.join(' · ')),
    el('p', {}, el('b', { text: 'In → out: ' }), `${f.inputs} → ${f.outputs}`),
    el('p', {}, el('b', { text: 'Traces to: ' }), f.traces.join(', ')),
    el('p', {}, el('b', { text: 'Time allocated: ' }), lt.threshold == null ? lt.budget : `${lt.threshold} min threshold / ${lt.objective} min objective (${lt.budget}) `, lt.threshold == null ? null : tag('Proposed allocation, TBR')),
    el('h4', { text: 'Draft Level 1 requirements from this function' }),
    L.length ? L.map(r => el('p', { class: 'why' }, el('b', { text: `${r.id} (${r.parent}) ` }), `${r.text} `, el('small', { text: `Verify: ${r.verify}` })))
      : el('p', { class: 'note', text: lt.threshold == null ? 'No S-3 requirement allocated: this is an agency function.' : "No draft yet. Add the team's own Level 1 requirement for this function." }),
    L.length ? tag('Draft suggestions; the team owns its L1 to L3 requirements') : null,
    inSteps.length ? el('h4', { text: 'See it in the walkthrough' }) : null,
    inSteps.length ? el('div', { class: 'v2-steps' }, inSteps.map(({ s, st, i }) => el('a', { class: 'v2-steplink', href: `#scenario/${s.id}/${i + 1}` },
      el('b', { text: `${s.id}${i + 1}` }), el('span', { text: `${st.title} · ${s.title}` })))) : null);

  // Latency budgets: S3-03 covers F1-F3, S3-05 covers F6-F7; each bar is drawn against its own total.
  const budgets = [['S3-03', ['F1', 'F2', 'F3']], ['S3-05', ['F6', 'F7']]].map(([rid, fns]) => {
    const tot = F.latency_budgets[rid][`${S.lat}_min`];
    return { rid, tot, fns: fns.map(id => ({ id, name: `${id} ${fnBy(id).name}`, min: fnBy(id).latency_min[S.lat] })) };
  });
  const latSvg = stackBars({ W: 560, xMax: 1, bars: budgets.map(b => ({ label: b.rid, sub: `≤ ${b.tot} min`,
    parts: b.fns.map(x => ({ v: x.min / b.tot, color: FN_COL[+x.id.slice(1) - 1], name: x.name, label: `${x.id} · ${x.min}`, tip: `${x.min} min` })) })) });
  const lat = chartBlock('lat', 'Latency budgets', latSvg,
    [['Budget', 'Function', `${S.lat === 'threshold' ? 'Threshold' : 'Objective'} (min)`], ...budgets.flatMap(b => b.fns.map(x => [`${b.rid} (≤ ${b.tot} min)`, x.name, fmt(x.min, 1)]))],
    [seg([['threshold', 'Threshold'], ['objective', 'Objective']], S.lat, v => { S.lat = v; ctx.full(); }, 'Latency values'), tag('Proposed allocation, TBR')]);
  lat.append(el('p', { class: 'note', text: 'S3-03 covers acquire → COP (F1-F3). S3-05 covers authorized alert → audible (F6-F7). Evaluating and generating the alert (F4-F5) belong to the agencies and sit outside S-3 timing. S3-09 (≤6 h) applies to each acknowledgment (F8) and command (F9).' }));

  return [
    head('Section 1 · Level 1 functional flow', 'From any detection to a confirmed warning',
      'The team\'s nine blocks, for every hazard S-3 carries. Select a block to see its steps, who performs it and which requirement it answers. Verify loops back to Broadcast until every receiver has acknowledged; Coordinate runs throughout.'),
    el('div', { class: 'v2-controls' }, el('span', { class: 'note', text: 'Hazard:' }), seg(F.hazards.map(h => [h.id, h.name]), S.haz, v => { S.haz = v; ctx.full(); }, 'Hazard')),
    boxes,
    el('div', { class: 'v2-walk' },
      el('a', { class: 'v2-play', href: '#scenario/A/1' }, el('span', { class: 'v2-play-i', 'aria-hidden': 'true', text: '▶' }),
        el('span', {}, el('small', { text: 'Walk through it on the map' }), `${SC.scenarios[0].title}, step by step`)),
      el('span', { class: 'note', text: 'Same chain, other cases:' }),
      SC.scenarios.slice(1).map(s => el('a', { class: 'v2-steplink', href: `#scenario/${s.id}/1` }, el('b', { text: s.id }), el('span', { text: s.title })))),
    el('div', { class: 'v2-grid2' }, detail, lat),
  ];
}

const SECTIONS = { flow };
export const SECTION_IDS = Object.keys(SECTIONS);

// Render one section into its <section> element.
export function renderSection(id, root) {
  const inner = root.querySelector('.v2-inner') || root.appendChild(el('div', { class: 'pv-inner v2-inner' }));
  const ctx = { full: () => { const y = root.scrollTop; renderSection(id, root); root.scrollTop = y; } };
  inner.replaceChildren(...SECTIONS[id](ctx));
}
