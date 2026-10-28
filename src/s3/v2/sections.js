// The six analysis sections from brief v2: function flow, ConOps map, station optimizer, sensor network,
// space & backhaul, cost & resilience. Ported from the prototype (analysis/prototype/template.html); every
// figure is read from the pipeline's data so a rerun updates the page. Shared state (year, coverage mode,
// station count) is one object across the map, the optimizer and the budget.
//
// Each section builds its header and controls once, and puts everything that depends on a slider into
// "slots" that refresh while the slider moves (rebuilding the slider itself mid-drag would break the drag).
import './v2.css'; // also imported by main.js; kept so the module stands alone
import { D, DEFAULT_N, YEARS, MODES, stations as loadStations, grid as loadGrid } from './data.js';
import { createMap, DENS_LABELS } from './mapcanvas.js';
import SC from '../scenarios.json';
import { el, css, fmt, fmtM, seg, slider, tag, stat, chartBlock, card, lineChart, stackBars } from './ui.js';

export const S = {
  year: 2041, mode: 'mix', n: DEFAULT_N,
  view: 'pop', layers: { rivers: true, roads: false, countries: true, infra: true, db: true, stations: true, pa: false, sensors: false },
  haz: 'flood', fn: 'F1', lat: 'threshold', sky: 'open_sky_20deg', fail: null, db: D.db.recommended[0],
  sensors: Object.fromEntries(D.sn.types.map(t => [t.id, t.baseline_count])), hydroKw: 5000,
};
const ST = {}; // station runs by year, once loaded
const FN_COL = ['#C99A2E', '#C88A2A', '#C47B2E', '#B86E36', '#A9663E', '#9A6B57', '#8F7769', '#8A8276', '#7E8C8A'];
const fnBy = id => D.fn.functions.find(f => f.id === id);
const yearItems = () => YEARS.map((y, i) => [y, i ? `+${y - YEARS[0]} yr` : String(y)]);
const head = (eyebrow, title, lede) => el('header', { class: 'v2-head' },
  el('div', {}, el('div', { class: 'pv-eyebrow', text: eyebrow }), el('h2', { class: 'v2-title', text: title })),
  el('p', { class: 'v2-lede' }, lede));

// A slot: a container whose content is rebuilt by its builder on refresh.
function slot(build) {
  const box = el('div', { class: 'v2-slot' });
  const refresh = () => box.replaceChildren(...[build()].flat().filter(Boolean));
  refresh();
  return { box, refresh };
}

// Year / coverage mode / station count, shared by the map, the optimizer and the budget.
function sharedControls(ctx, run) {
  return el('div', { class: 'v2-controls' },
    seg(yearItems(), S.year, v => { S.year = v; ctx.full(); }, 'Year'),
    seg(Object.entries(MODES).map(([k, m]) => [k, m.short]), S.mode, v => { S.mode = v; ctx.full(); }, 'What counts as covered'),
    slider({ label: 'Stations', min: 0, max: 400, value: S.n, onInput: v => { S.n = v; ctx.quick(); } }),
    el('button', { class: 'v2-link', onclick: () => { S.n = run.sweet_spot_knee; ctx.full(); }, text: `Sweet spot (${run.sweet_spot_knee})` }));
}

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

// =============== 2. ConOps map ===============
function mapSection(ctx) {
  const run = ST[S.year].runs[S.mode];
  const names = { rivers: 'Rivers', roads: 'Major roads', countries: 'Borders', infra: 'Existing infrastructure', db: 'Hub & databases', stations: 'Ranger stations', pa: 'Protected areas', sensors: 'Sensors (sample)' };
  let map = null;
  const layers = el('div', { class: 'v2-controls v2-layers' }, el('span', { class: 'note', text: 'Layers:' }), Object.entries(names).map(([k, l]) => {
    const cb = el('input', { type: 'checkbox' }); cb.checked = S.layers[k];
    cb.addEventListener('change', () => { S.layers[k] = cb.checked; map.draw({ ...S }); });
    return el('label', { class: 'ctl-check' }, cb, l);
  }));
  const holder = el('div', { class: 'v2-mapholder' });
  // Database nodes are picked on the map or, by keyboard, with the buttons in the side card.
  const pickDb = name => {
    const keep = side.box.contains(document.activeElement);
    S.db = name; side.refresh(); map.draw({ ...S });
    if (keep) side.box.querySelector('.seg [aria-pressed="true"]')?.focus();
  };
  const side = slot(() => dbSide(pickDb));
  const seq = [...Array(8).keys()].map(i => css(`--seq-${i}`));
  const legend = el('div', { class: 'v2-legend' }, ...(S.view === 'pop'
    ? [el('span', { text: 'People per km²:' }), ...DENS_LABELS.map((t, i) => el('span', {}, el('i', { style: `background:${seq[i]}` }), t))]
    : [el('span', {}, el('i', { style: `background:${css(MODES[S.mode].color)}` }), `Covered (${MODES[S.mode].name})`), el('span', {}, el('i', { style: `background:${css('--neu-3')}` }), 'Not covered (darker = more people)')]),
    el('span', { text: '■ road site  ● river site  ▲ remote site  ◼ gold = database node' }));
  ctx.onQuick(() => map.draw({ ...S }));
  ctx.after(() => {
    map = createMap(holder, { onDb: pickDb, maxHeight: () => fitHeight(holder, 64) });
    map.draw({ ...S });
  });
  return [
    head('Section 2 · ConOps map', 'What we build, and where',
      `Main hub in ${D.db.recommended[0]}, ${D.db.recommended.length - 1} regional databases, ranger stations where they reach the most people, and community receivers everywhere else. Hover anything; select a database node to see why it sits there.`),
    // Controls sit beside the map, not above it, so the whole map fits a 1280 × 720 projector without scrolling.
    el('div', { class: 'v2-grid-map' }, el('div', { class: 'vcard v2-mapcard' }, holder, legend, dataNote()),
      el('div', { class: 'v2-col' },
        el('div', { class: 'vcard v2-mapctl' },
          el('div', { class: 'v2-controls' }, seg([['pop', 'Population'], ['cov', 'Station coverage']], S.view, v => { S.view = v; ctx.full(); }, 'Map shows')),
          sharedControls(ctx, run), layers),
        side.box)),
  ];
}
// Tallest map that still fits on screen below where it starts (with `below` px for its legend), at the view's zoom.
function fitHeight(holder, below) {
  const view = holder.closest('.process-view'), z = parseFloat(getComputedStyle(holder.closest('.pv-inner')).zoom) || 1;
  const top = holder.getBoundingClientRect().top + (view?.scrollTop || 0);
  return Math.max(320, (innerHeight - top) / z - below);
}
function dataNote() {
  return el('p', { class: 'note' }, 'Basin outline: HydroSHEDS. Population: WorldPop 2020, projected with UN growth. Protected areas: WDPA. ',
    tag('Modeled proxy', 'proxy'), ' river-gauge sites (rule-based until the GRDC station list is obtained).');
}
function dbSide(pick) {
  const db = D.db, name = S.db, c = db.candidates.find(x => x.name === name), best = db.best_by_count, top = db.top_sets_of_4.slice(0, 5);
  const bangui = db.top_sets_of_4.find(s => s.nodes.includes('Bangui'));
  const spread = top.at(-1).mean_km - top[0].mean_km;
  return card(`${name === db.recommended[0] ? 'Main hub' : 'Regional database'} · ${name}`,
    seg(db.recommended.map(n => [n, n]), name, pick, 'Database node'),
    el('p', { text: c.notes }),
    el('p', { class: 'why' }, el('b', { text: 'Why four nodes, and why these? ' }),
      `With ${db.recommended[0]} alone, the average basin resident is ${fmt(db.kinshasa_only_mean_km)} km from a node. Adding nodes cuts that to ${fmt(best[2].mean_km)} km (2), ${fmt(best[3].mean_km)} km (3) and ${fmt(best[4].mean_km)} km (4), and each extra node is a full replica that can run the alert chain alone. Returns flatten after four, which is why we stop there.`),
    el('p', { class: 'why' }, el('b', { text: 'Rules used: ' }),
      `nodes at least ${fmt(db.min_sep_km)} km apart (no single flood, outage or conflict hits two); none within 150 km of areas under armed-group control (Goma, Bukavu, so Bujumbura drops out); cities of 400k+ for staff, power and fibre. Brazzaville is too close to Kinshasa to be an independent backup.`),
    el('h4', { text: 'Best sets of four (2041 population)' }),
    el('table', { class: 'vtable' }, el('thead', {}, el('tr', {}, el('th', { text: 'Regional nodes' }), el('th', { class: 'n', text: 'Avg km' }), el('th', { class: 'n', text: '% ≤500 km' }))),
      el('tbody', {}, top.map((r, i) => el('tr', { class: i ? '' : 'is-best' }, el('td', { text: `${i ? '' : '★ '}${r.nodes.slice(1).join(', ')}` }), el('td', { class: 'n', text: fmt(r.mean_km) }), el('td', { class: 'n', text: fmt(r.pct_pop_within_500km, 1) }))))),
    el('p', { class: 'note', text: `The top sets are within about ${fmt(Math.max(spread, 1))} km of each other, so the final pick can weigh things the distance metric ignores.${bangui ? ` A node in Bangui (CAR) costs only about ${fmt(bangui.mean_km - top[0].mean_km)} km on average and adds a second country for cross-border authority.` : ''}` }));
}

// =============== 3. Station optimizer ===============
function stationsSection(ctx) {
  const Y = ST[S.year], R = Y.runs[S.mode], k = R.sweet_spot_knee, kn = R.stations[k - 1];
  const stats = slot(() => {
    const n = S.n, cur = n ? R.stations[n - 1] : null;
    return el('div', { class: 'v2-stats' },
      stat(n ? `${fmt(cur.cum_pct, 1)}%` : '0%', `People covered (${MODES[S.mode].short}, ${S.year})`),
      stat(n ? fmtM(cur.cum_cost_musd) : '$0', `15-yr cost of ${n} stations`),
      stat(String(k), 'Sweet spot (knee)'),
      stat(`${fmt(kn.cum_pct, 1)}% · ${fmtM(kn.cum_cost_musd)}`, 'At the sweet spot'),
      stat(String(R.sweet_spot_marginal_0p1pct), 'Last station adding ≥0.1%'));
  });
  const marks = [10, 25, 50, 100, 150, 200, 300, 400];
  const chart = slot(() => chartBlock('cov', 'People covered vs. number of stations',
    lineChart({ xMax: 400, yMax: 80, yLabel: '% of basin population covered', xLabel: 'Ranger stations', cursorX: S.n,
      yTicks: [0, 20, 40, 60, 80], xTicks: [0, 100, 200, 300, 400], markers: [{ x: k, y: kn.cum_pct, color: css(MODES[S.mode].color), label: `sweet spot · ${k}` }],
      series: Object.keys(MODES).map(md => ({ label: MODES[md].short, color: css(MODES[md].color), bold: md === S.mode, dim: md !== S.mode,
        pts: [[0, 0], ...Y.runs[md].stations.map((s, i) => [i + 1, s.cum_pct])], fmt: v => `${fmt(v, 1)}%` })) }),
    [['Stations', ...Object.values(MODES).map(m => `${m.short} %`)],
      ...[...new Set([...marks, k, S.n])].filter(x => x > 0).sort((a, b) => a - b)
        .map(N => [`${N}${N === k ? ' (sweet spot)' : ''}${N === S.n ? ' (selected)' : ''}`, ...Object.keys(MODES).map(md => fmt(Y.runs[md].stations[N - 1].cum_pct, 1))])]));
  const C = D.cost;
  const ex = {
    radio: `Within ${C.radio.radius_km} km of the station tower's radio (VHF to handhelds). This is the reach of the station's own network; the satellite layer covers everywhere.`,
    response: `Reachable by a ranger team within ${C.travel.limit_min} minutes: boat at ${C.travel.boat_kmh} km/h on rivers, vehicle at ${C.travel.road_kmh} km/h on roads, ${C.travel.foot_kmh} km/h on foot in forest.`,
    speaker: `Within ${C.loudspeaker.intelligible_radius_km} km of the tower loudspeaker (3.2 kW class array reaches 70 dB at about 4,200 ft). Even 400 stations reach only about ${fmt(Y.runs.speaker.stations[399].cum_pct, 0)}% of people by loudspeaker, which is why every village also needs a community receiver.`,
    mix: `Covered by radio OR reachable within an hour; the siting score weights radio ${Y.mix_weights.radio}, response ${Y.mix_weights.response}, loudspeaker ${Y.mix_weights.speaker}.`,
  };
  const sc = Y.station_cost_15yr;
  ctx.onQuick(() => { stats.refresh(); chart.refresh(); });
  return [
    head('Section 3 · Station optimizer', 'How many ranger stations? Finding the sweet spot',
      'Each added station goes where it covers the most not-yet-covered people (greedy maximal-coverage siting). Coverage climbs fast, then flattens while cost keeps rising. The knee marks the best value.'),
    sharedControls(ctx, R),
    stats.box,
    el('div', { class: 'v2-grid2' }, chart.box,
      card('What "covered" means', ...Object.keys(MODES).map(md => el('p', { class: md === S.mode ? 'why' : 'note' }, el('b', { text: `${MODES[md].name}: ` }), ex[md])), tag('Ranges and speeds are assumptions'),
        el('h4', { text: 'Station cost (15 years, no salaries)' }),
        el('table', { class: 'vtable' }, el('thead', {}, el('tr', {}, ['Site type', 'Capex', '15-yr O&M', 'Total'].map((h, i) => el('th', { class: i ? 'n' : '', text: h })))),
          el('tbody', {}, Object.entries(sc).map(([ty, v]) => el('tr', {}, el('td', { text: ty }), ...[v.capex, v.opex_15yr, v.total].map(x => el('td', { class: 'n', text: `$${fmt(x / 1000)}k` })))))),
        el('p', { class: 'note', text: 'Remote sites cost more to haul and build. Staff salaries are excluded for now.' }))),
    el('div', { class: 'v2-grid2' }, hydroBlock(), kitBlock()),
  ];
}
function hydroCost(perKw) {
  const st = D.cost.station, h = st.hydro_option, mult = st.logistics_multiplier.river, life = D.cost.life_years, pct = st.opex.maintenance_pct_of_capex_per_year;
  const solarItem = st.capex_items.find(i => i.id === 'solar').usd;
  const solar = solarItem * mult * (1 + pct * life) + st.opex.battery_replacement_usd;
  const hyd = (3 * perKw + h.reduced_solar_capex_usd) * mult * (1 + pct * life) + h.battery_replacement_usd + h.extra_opex_usd_per_year * life;
  return [solar, hyd];
}
function hydroBlock() {
  const xs = [];
  for (let k = 1500; k <= 8000; k += 250) xs.push(k);
  const be = xs.find(x => hydroCost(x)[1] > hydroCost(x)[0]);
  const body = slot(() => {
    const v = S.hydroKw, [a, b] = hydroCost(v);
    return [lineChart({ series: [{ label: 'Solar', color: css('--s4'), pts: xs.map(x => [x, hydroCost(x)[0] / 1000]), fmt: y => `$${fmt(y)}k` },
      { label: 'Hydro', color: css('--s1'), pts: xs.map(x => [x, hydroCost(x)[1] / 1000]), fmt: y => `$${fmt(y)}k` }],
      xMin: 1500, xMax: 8000, yMax: 150, yLabel: '15-yr power cost per station ($k)', xLabel: 'Micro-hydro installed cost ($/kW)', cursorX: v,
      yTicks: [0, 50, 100, 150], xTicks: [2000, 4000, 6000, 8000], xFmt: x => `$${fmt(x / 1000)}k`, H: 260 }),
    el('p', { class: 'note', text: `At $${fmt(v)}/kW a river station's power system costs $${fmt(b / 1000)}k over 15 years vs $${fmt(a / 1000)}k solar-only (${b < a ? 'saves' : 'costs'} $${fmt(Math.abs(a - b) / 1000)}k). Break-even is about $${fmt(be)}/kW. Reference: the 13.8 MW Matebe plant in DRC came in near $1,430/kW, but micro plants cost several times more per kW. The stronger case for hydro is steady power through the rainy season, when solar output drops.` })];
  });
  const block = chartBlock('hydro', 'River sites: does micro-hydro pay?', body.box,
    [['Installed cost ($/kW)', 'Solar-only ($k)', 'Hydro ($k)'], ...xs.filter(x => x % 1000 === 0 || x === 1500).map(x => [`$${fmt(x)}`, fmt(hydroCost(x)[0] / 1000), fmt(hydroCost(x)[1] / 1000)])]);
  block.insertBefore(slider({ label: 'Installed micro-hydro cost', min: 1500, max: 8000, step: 100, value: S.hydroKw, out: x => `$${fmt(x)}/kW`, onInput: x => { S.hydroKw = x; body.refresh(); } }), block.children[1]);
  return block;
}
function kitBlock() {
  const st = D.cost.station;
  return card('Station kit',
    el('table', { class: 'vtable' }, el('thead', {}, el('tr', {}, el('th', { text: 'Item' }), el('th', { class: 'n', text: 'Planning $' }))),
      el('tbody', {}, ...st.capex_items.map(i => el('tr', {}, el('td', { text: i.name }), el('td', { class: 'n', text: `$${fmt(i.usd / 1000, 1)}k` }))),
        ...Object.entries(st.access_kit).map(([k, v]) => el('tr', {}, el('td', { text: `${v.name} (${k} sites)` }), el('td', { class: 'n', text: `$${fmt(v.usd / 1000, 1)}k` }))))),
    el('p', {}, tag('Assumptions unless noted'), ' Speaker and Starlink figures reference published specs and prices.'));
}

// =============== 4. Sensor network ===============
const SN_COL = { gauge: '--s1', rain: '--s7', tag: '--s6', camera: '--s3', acoustic: '--s2', fire: '--critical', water_q: '--s5', ranger: '--s4' };
function sensorsSection(ctx) {
  const T = D.sn.types, R = D.sn.s3_02, cnt = S.sensors;
  const totals = () => {
    const tot = T.reduce((a, t) => a + cnt[t.id], 0), bytes = T.reduce((a, t) => a + cnt[t.id] * t.bytes_per_day, 0);
    return { tot, bytes, avg: bytes / Math.max(tot, 1), capex: T.reduce((a, t) => a + cnt[t.id] * t.unit_usd, 0),
      repl: T.reduce((a, t) => a + cnt[t.id] * t.unit_usd * Math.max(0, Math.ceil(15 / t.life_years) - 1), 0) };
  };
  const stats = slot(() => { const t = totals(); return el('div', { class: 'v2-stats' }, stat(fmt(t.tot), 'Terminals'), stat(`${fmt(t.bytes / 1e6, 1)} MB`, 'Data per day'),
    stat(`${fmt(t.avg / 1000, 1)} kB`, 'Average per terminal per day'), stat(fmtM(t.capex / 1e6), 'Sensor hardware (user agencies)'), stat(fmtM(t.repl / 1e6), 'Replacements over 15 yr')); });
  const check = slot(() => {
    const { tot, avg } = totals();
    const xMax = tot >= R.objective_terminals * 0.5 ? Math.max(R.objective_terminals, tot) * 1.08 : Math.max(R.threshold_terminals, tot) * 1.6;
    const ok1 = tot >= R.threshold_terminals && avg >= R.threshold_bytes_per_day, ok2 = tot >= R.objective_terminals && avg >= R.objective_bytes_per_day;
    const b = chartBlock('sn', 'Against S3-02',
      stackBars({ W: 560, gap: 18, xMax, bars: [{ label: 'Terminals', parts: T.map(sn => ({ v: cnt[sn.id], color: css(SN_COL[sn.id]), name: sn.name })) }],
        refs: [{ v: R.threshold_terminals, label: `Threshold ${fmt(R.threshold_terminals / 1000)}k`, color: css('--text') }, { v: R.objective_terminals, label: `Objective ${fmt(R.objective_terminals / 1000)}k`, color: css('--muted') }] }),
      [['Type', 'Terminals', 'Bytes/day each'], ...T.map(t => [t.name, fmt(cnt[t.id]), fmt(t.bytes_per_day)]), ['Total', fmt(tot), `${fmt(avg)} average`]]);
    b.append(el('p', { class: `v2-verdict${ok1 ? ' is-ok' : ' is-bad'}` }, `${ok1 ? '✔ Meets' : '✖ Below'} the S3-02 threshold · ${ok2 ? '✔ meets' : '✖ below'} the objective`),
      el('p', { class: 'note', text: `Average ${fmt(avg)} bytes per terminal per day vs ≥${fmt(R.threshold_bytes_per_day)} threshold, ≥${fmt(R.objective_bytes_per_day)} objective; ${fmt(tot)} terminals vs ≥${fmt(R.threshold_terminals)} threshold, ≥${fmt(R.objective_terminals)} objective.` }),
      el('div', { class: 'v2-legend' }, T.map(sn => el('span', {}, el('i', { style: `background:${css(SN_COL[sn.id])}` }), sn.id))));
    return b;
  });
  ctx.onQuick(() => { stats.refresh(); check.refresh(); });
  const table = el('table', { class: 'vtable v2-sensors' }, el('thead', {}, el('tr', {}, ['Type', 'Count', 'Unit $', 'Bytes/day', 'Placed where'].map((h, i) => el('th', { class: i === 2 || i === 3 ? 'n' : '', text: h })))),
    el('tbody', {}, T.map(s => el('tr', {},
      el('td', {}, el('i', { class: 'swatch', style: `background:${css(SN_COL[s.id])}` }), s.name, s.id === 'gauge' ? el('div', {}, tag('Modeled proxy sites', 'proxy')) : null),
      el('td', {}, slider({ label: `${s.name} count`, min: 0, max: Math.max(s.baseline_count * 4, 100), step: Math.max(10, Math.round(s.baseline_count / 50)), value: cnt[s.id], out: v => fmt(v), onInput: v => { cnt[s.id] = v; ctx.quick(); }, cls: 'is-compact' })),
      el('td', { class: 'n', text: `$${fmt(s.unit_usd)}` }), el('td', { class: 'n', text: fmt(s.bytes_per_day) }), el('td', { class: 'note', text: s.placement_rule })))));
  const rc = D.sn.community_receivers[String(S.year)], rule = D.sn.receiver_rule;
  return [
    head('Section 4 · Sensor network', 'The sensor network S-3 has to carry',
      `Sensors belong to the agencies that use them; S-3 supplies their radios and the network. Adjust counts and see whether the mix meets S3-02 (≥${fmt(R.threshold_terminals)} terminals at ≥${fmt(R.threshold_bytes_per_day / 1000)} kB/day, objective ≥${fmt(R.objective_terminals)} at ≥${fmt(R.objective_bytes_per_day / 1000)} kB/day).`),
    stats.box,
    el('div', { class: 'v2-grid2' }, card('Terminals by type', table, el('p', {}, tag('Counts, costs and data rates are planning assumptions'))),
      el('div', { class: 'v2-col' }, check.box, card('Community receivers (S3-07)',
        el('div', { class: 'v2-controls' }, seg(yearItems(), S.year, v => { S.year = v; ctx.full(); }, 'Year')),
        el('p', {}, el('b', { text: `${fmt(rc.receivers)} receivers` }), ` for ${S.year}: one per village of about ${fmt(rule.people_per_receiver_rural)} rural people and one per ${fmt(rule.people_per_receiver_urban)} urban residents at schools, markets and churches. That is ${fmtM(rc.cost_threshold_usd / 1e6)} at the $25 threshold or ${fmtM(rc.cost_objective_usd / 1e6)} at the $10 objective, each with a hand crank.`),
        el('p', { class: 'note', text: 'Receivers carry most of the spoken warnings; station loudspeakers cover the town around each tower and the stations verify delivery.' })))),
  ];
}

// =============== 5. Space & backhaul ===============
function commsSection(ctx) {
  const L = D.leo.results, incs = [15, 30, 53, 97.6], cols = ['--s1', '--s2', '--s3', '--s4'], B = D.fn.latency_budgets['S3-03'];
  const chart = lineChart({ xMax: 36, yMax: 1000, log: true, yLabel: 'p95 wait (min, log scale)', xLabel: 'Satellites', yTicks: [1, 10, 100, 1000], xTicks: [4, 8, 12, 18, 24, 36],
    refs: [{ y: B.threshold_min, label: `S3-03 threshold ≤${B.threshold_min} min`, color: css('--text') }, { y: B.objective_min, label: `Objective ≤${B.objective_min} min`, color: css('--muted') }],
    series: incs.map((inc, i) => ({ label: `${inc}°${inc > 90 ? ' (polar)' : ''}`, color: css(cols[i]), bold: inc === 15,
      pts: L.filter(r => r.inclination_deg === inc).map(r => [r.satellites, r[S.sky].p95_wait_min]), fmt: v => `${fmt(v, 1)} min` })) });
  const sats = [...new Set(L.map(r => r.satellites))].sort((a, b) => a - b);
  const rows = [['Satellites', ...incs.map(i => `${i}° p95 (min)`)], ...sats.map(n => [String(n), ...incs.map(i => { const r = L.find(x => x.inclination_deg === i && x.satellites === n); return r ? fmt(r[S.sky].p95_wait_min, 1) : '–'; })])];
  const r24 = L.find(r => r.inclination_deg === 15 && r.satellites === 24), r36 = L.find(r => r.inclination_deg === 15 && r.satellites === 36);
  const takes = card('What the model says',
    el('p', { class: 'why' }, el('b', { text: 'Low inclination wins. ' }), 'The basin straddles the equator (13°S–9°N). Satellites in 15° orbits pass over it on every orbit; polar or 53° orbits spend most of their time elsewhere.'),
    el('p', { class: 'why' }, el('b', { text: 'About 24 satellites meet the threshold in the open. ' }), `At 15°, 24 satellites in ${r24.planes} planes give a p95 wait of ${fmt(r24.open_sky_20deg.p95_wait_min, 1)} min, inside the ${fnBy('F2').latency_min.threshold}-min share of S3-03. Reaching the ${B.objective_min}-min objective takes about 36 (p95 ${fmt(r36.open_sky_20deg.p95_wait_min, 1)} min).`),
    el('p', { class: 'why' }, el('b', { text: 'Under canopy, LEO alone fails. ' }), `With a 45° mask the same 24 satellites give a p95 of ${fmt(r24.under_canopy_45deg.p95_wait_min, 1)} min. That is the case for ranger-station towers as canopy-top relays: sensors talk to the tower in seconds, and the tower talks to the satellite from open sky.`),
    el('p', { class: 'why' }, el('b', { text: 'Broadcast goes to GEO. ' }), 'One geostationary payload covers the whole basin continuously, so alerts reach every receiver in seconds (S3-05) with a fixed, no-pointing antenna (S3-07). AfriStar did L-band radio over Africa this way from 1998.'),
    el('p', { class: 'note', text: `Model: circular orbits at ${D.leo.altitude_km} km, Earth rotation, ${D.leo.gateways.length} gateways at the database nodes, 2-day run. Some non-monotonic points reflect simple phasing choices, not physics.` }));
  const base = D.comms.notional_baseline;
  const opt = el('div', { class: 'vcard' }, el('div', { class: 'vcard-h' }, el('h3', { text: 'Options compared' }), tag(D.comms.baseline_label, 'baseline')),
    el('div', { class: 'vtable-scroll' }, el('table', { class: 'vtable v2-opts' },
      el('thead', {}, el('tr', {}, ['Option', 'Serves', 'Latency', '15-yr cost', 'For', 'Against'].map(h => el('th', { text: h })))),
      el('tbody', {}, D.comms.options.map(o => {
        const cost = o.cost_15yr_musd != null ? fmtM(o.cost_15yr_musd) : o.cost_15yr_musd_per_100_stations != null ? `${fmtM(o.cost_15yr_musd_per_100_stations)} per 100 sites`
          : o.cost_15yr_musd_10k_terminals != null ? `${fmtM(o.cost_15yr_musd_10k_terminals)} (10k) · ${fmtM(o.cost_15yr_musd_100k_terminals)} (100k)` : '–';
        return el('tr', { class: base.includes(o.id) ? 'is-base' : '' },
          el('td', {}, el('b', { text: o.name }), base.includes(o.id) ? el('div', {}, tag('in baseline', 'baseline')) : null),
          el('td', { text: o.serves.join('; ') }), el('td', { text: o.latency }), el('td', {}, cost, el('div', { class: 'note', text: o.cost_basis })),
          el('td', { text: o.pros.join('; ') }), el('td', { text: o.cons.join('; ') }));
      })))));
  return [
    head('Section 5 · Space and backhaul', 'Build, buy, or both',
      `Orbit simulation of LEO constellations at ${D.leo.altitude_km} km over the basin: how long a sensor waits until a satellite sees it and a gateway at the same time. That wait is most of the S3-03 budget.`),
    el('div', { class: 'v2-controls' }, seg([['open_sky_20deg', 'Open sky (20° mask)'], ['under_canopy_45deg', 'Under canopy (45° mask)']], S.sky, v => { S.sky = v; ctx.full(); }, 'Sky view')),
    el('div', { class: 'v2-grid2' }, chartBlock('leo', '95th-percentile wait vs. number of satellites', chart, rows), takes),
    opt,
  ];
}

// =============== 6. Cost & resilience ===============
const FAILS = [['hub', 'Kinshasa hub offline'], ['sat', 'Lose 1 of 24 satellites'], ['grid', 'Grid and cell towers down'], ['station', 'Flood takes out a station'], ['geo', 'GEO payload lost']];
function budgetSection(ctx) {
  const R = ST[S.year].runs[S.mode], cap = D.cost.budget.lcc_cap_usd / 1e6, rec = D.db.recommended;
  const lines = () => {
    const n = S.n, rc = D.sn.community_receivers[String(S.year)], BL = D.budget.lines_musd;
    // Commercial backhaul: one Starlink kit ($389) plus 180 months at $50 per station and per database node.
    return [['LEO IoT constellation', BL['LEO IoT constellation'], '--s1'], ['GEO broadcast payload', BL['GEO broadcast payload'], '--s7'],
      [`Ranger stations (${n})`, n ? R.stations[n - 1].cum_cost_musd : 0, '--s2'], ['Community receivers', rc.cost_threshold_usd / 1e6, '--s3'],
      ['Commercial backhaul', ((n + rec.length) * (389 + 50 * 180)) / 1e6, '--s4']];
  };
  const budget = slot(() => {
    const ls = lines(), total = ls.reduce((a, l) => a + l[1], 0), over = total - cap;
    const b = chartBlock('budget', '15-year life-cycle cost',
      stackBars({ W: 1000, rowH: 40, left: 90, xMax: Math.max(cap, total) * 1.08, fmtV: v => fmtM(v),
        bars: [{ label: '15-yr total', sub: fmtM(total), parts: ls.map(([l, v, c]) => ({ v, color: css(c), name: l, label: fmtM(v) })) }],
        refs: [{ v: cap, label: `$${fmt(cap)}M cap`, color: css('--critical') }] }),
      [['Line', '15-yr cost'], ...ls.map(([l, v]) => [l, fmtM(v)]), ['Total', fmtM(total)], ['Cap', fmtM(cap)]], [tag('Assumptions, ±30%')]);
    b.append(el('p', { class: `v2-verdict ${over > 0 ? 'is-bad' : 'is-ok'}` }, `Total ${fmtM(total)} · ${over > 0 ? `over the cap by ${fmtM(over)}` : `under the cap by ${fmtM(-over)}`}`),
      el('div', { class: 'v2-legend' }, ls.map(([l, v, c]) => el('span', {}, el('i', { style: `background:${css(c)}` }), `${l} ${fmtM(v)}`))),
      el('p', { class: 'note', text: 'Excludes staff salaries and the sensors themselves (owned by user agencies). LEO and GEO lines are anchored to Kinéis and CHIRP but are assumptions; treat the whole stack as ±30%.' }));
    return b;
  });
  const msgs = {
    hub: [`${rec.slice(1).join(', ').replace(/, ([^,]*)$/, ' or $1')} takes over.`, 'Every node holds a full replica (L1-04) and has its own gateway, so detection, the COP and the CAP-to-broadcast chain keep running. The national agency authorizes from wherever it is, over any surviving link.'],
    sat: ['Wait grows slightly; threshold still met.', 'Losing one of 24 satellites opens a gap in one plane. Open-sky p95 wait moves toward the 18-satellite figure in the model; the on-orbit spare and the next replenishment close it.'],
    grid: ['Nothing in the alert chain needs the grid.', 'Stations run on solar, micro-hydro where available, and hand crank; receivers are solar or crank; all long-haul links are satellite. This is the scenario S-3 exists for (MO-3).'],
    station: ['Its area falls back to receivers and neighbouring stations.', "Community receivers still get the broadcast directly from GEO. Verification for that area slows until a neighbouring team or an A-2 drone confirms. Removing one station drops coverage by only that station's marginal people (see the optimizer)."],
    geo: ['Alerts fall back to LEO, stations and phones.', 'Rangers get text over LEO; station loudspeakers broadcast locally; direct-to-cell text reaches phones where available. Spoken coverage of remote villages drops until a backup host is found, so a second hosted payload or a lease option is a trade worth costing.'],
  };
  // On the map: the hub greys out and the first regional node becomes the acting hub; a flood takes out the
  // first river station in the build order, and its coverage disappears.
  const failState = () => {
    const i = S.fail === 'station' ? R.stations.slice(0, S.n).findIndex(s => s.type === 'river') : -1;
    return { i, map: { hub: S.fail === 'hub', station: i >= 0 ? i : undefined } };
  };
  const holder = el('div', { class: 'v2-mapholder' });
  let map = null;
  const drawMap = () => map.draw({ ...S, view: S.fail === 'station' ? 'cov' : 'pop', layers: { countries: true, rivers: true, db: true, stations: true }, fail: failState().map });
  const explain = slot(() => {
    const { i } = failState();
    if (!S.fail) return el('p', { class: 'note', text: 'Pick a failure to see how the system degrades. Hub and station failures also show on the map.' });
    return el('p', { class: 'why' }, el('b', { text: `${msgs[S.fail][0]} ` }), msgs[S.fail][1],
      i >= 0 ? el('span', { class: 'crit', text: ` Station #${i + 1} (a river site) is out; ${fmt(R.stations[i].gain)} people lose its coverage unless a neighbour also reaches them.` }) : null,
      S.fail === 'station' && i < 0 ? el('span', { class: 'note', text: ' (No river station among the selected stations.)' }) : null);
  });
  ctx.onQuick(() => { budget.refresh(); explain.refresh(); drawMap(); });
  ctx.after(() => { map = createMap(holder, { maxHeight: () => Math.max(320, innerHeight - 360) }); drawMap(); });
  return [
    head('Section 6 · Cost and resilience', `Cost against the $${fmt(cap)}M cap, and what fails gracefully`, 'The budget follows the station slider. Over the cap is allowed here; the point is to see by how much.'),
    sharedControls(ctx, R),
    budget.box,
    el('div', { class: 'v2-grid-map' }, el('div', { class: 'vcard v2-mapcard' }, holder),
      card('Resilience: knock something out',
        el('div', { class: 'v2-controls' }, seg(FAILS, S.fail, v => { S.fail = S.fail === v ? null : v; ctx.full(); }, 'Failure case')),
        explain.box)),
  ];
}

// ---------- entry ----------
const SECTIONS = { flow, map: mapSection, stations: stationsSection, sensors: sensorsSection, comms: commsSection, budget: budgetSection };
const NEEDS_STATIONS = new Set(['map', 'stations', 'budget']);
export const SECTION_IDS = Object.keys(SECTIONS);

// Render one section into its <section> element.
export function renderSection(id, root) {
  const inner = root.querySelector('.v2-inner') || root.appendChild(el('div', { class: 'pv-inner v2-inner' }));
  if (NEEDS_STATIONS.has(id) && !ST[S.year]) {
    inner.replaceChildren(el('p', { class: 'note v2-loading', text: 'Loading station data…' }));
    loadStations(S.year).then(d => { ST[S.year] = d; renderSection(id, root); }, () => inner.replaceChildren(el('p', { class: 'note', text: 'Station data could not be loaded.' })));
    return;
  }
  if (id === 'map' || id === 'budget') loadGrid(); // start the grid download alongside
  let quickFn = null;
  const afters = [];
  const ctx = {
    full: () => { const y = root.scrollTop; renderSection(id, root); root.scrollTop = y; },
    quick: () => (quickFn ? quickFn() : ctx.full()),
    onQuick: f => { quickFn = f; },
    after: f => afters.push(f),
  };
  inner.replaceChildren(...SECTIONS[id](ctx));
  afters.forEach(f => f());
}
