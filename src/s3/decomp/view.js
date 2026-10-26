// Decomposition tab: the requirements decomposition (MO → L4) from the congo-srr-requirements repo, read-only.
// Data: the snapshot bundled at build time (works offline and on a first visit), replaced by the live published
// baseline from the requirements site when that is reachable and newer. Loaded lazily the first time the tab opens.
import { hierarchy, tree as d3tree, select, zoom, zoomIdentity, linkHorizontal, linkRadial } from 'd3';
import SNAPSHOT from './snapshot.json';
import { build, short, SEGMENTS, VERIFICATION } from './model.js';

export const SITE = 'https://corrigk.github.io/congo-srr-requirements/';
const REMOTE = `${SITE}data/published.json`;
const BOX_W = 220, BOX_H = 26, COL = 270, ROW = 32;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(`--${n}`).trim();
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const vName = Object.fromEntries(VERIFICATION.map(v => [v.k, v.name]));
const SEG_TOKEN = { Space: 'gold', Ground: 'river', Air: 'precip', Launch: 'rust-hi', 'User equipment': 'data', Operations: 'rust-soft', System: 'paper' };
const MO_TOKEN = ['data', 'alert', 'river', 'precip'];

export function createDecomposition(root, { goSrr, onSelect }) {
  let data = SNAPSHOT, model = build(SNAPSHOT), live = 'snapshot';
  const ui = { mode: 'tree', colorBy: 'mo', segs: new Set(), zoom: {}, selected: null };

  // Newer published baseline on the requirements site? (Skipped offline and when opened from a file.)
  if (navigator.onLine && location.protocol.startsWith('http')) {
    const ctl = new AbortController();
    setTimeout(() => ctl.abort(), 5000);
    fetch(REMOTE, { signal: ctl.signal, cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).then(remote => {
      if (!remote?.reqs) return;
      const a = SNAPSHOT.baseline?.created || '', b = remote.baseline?.created || '';
      if (a && b && a >= b) return; // bundled snapshot is as new as the live one
      data = remote; model = build(remote); live = 'live';
      if (ui.selected && !model.get(ui.selected)) ui.selected = null;
      render(ui.selected);
    }).catch(() => {});
  }

  const color = r => {
    if (!r) return 'rgba(245,242,234,.35)';
    if (ui.colorBy === 'segment') return r.segment ? css(SEG_TOKEN[r.segment] || 'paper') : 'rgba(245,242,234,.35)';
    if (r.mos.length > 1) return '#C9A0FF';
    const i = model.mos.findIndex(m => m.id === r.mos[0]);
    return i < 0 ? 'rgba(245,242,234,.35)' : css(MO_TOKEN[i % MO_TOKEN.length]);
  };

  function header() {
    const b = data.baseline;
    const legend = ui.colorBy === 'mo'
      ? [...model.mos.map(m => [`${m.id} ${m.name || ''}`, color(m)]), ['Serves several MOs', '#C9A0FF']]
      : SEGMENTS.map(s => [s, css(SEG_TOKEN[s])]);
    return `
      <div class="dc-head">
        <div class="dc-title"><div class="pv-eyebrow">Requirements decomposition</div><h2>MO → Level ${model.maxLevel}</h2></div>
        <div class="dc-tools">
          <div class="seg dc-mode" role="group" aria-label="View">
            <button data-dc-mode="tree" aria-pressed="${ui.mode === 'tree'}">Thread tree</button>
            <button data-dc-mode="radial" aria-pressed="${ui.mode === 'radial'}">Radial</button>
          </div>
          <div class="seg" role="group" aria-label="Colour by">
            <button data-dc-color="mo" aria-pressed="${ui.colorBy === 'mo'}">By MO</button>
            <button data-dc-color="segment" aria-pressed="${ui.colorBy === 'segment'}">By segment</button>
          </div>
          <div class="seg dc-segs" role="group" aria-label="Show segments">
            ${SEGMENTS.map(s => `<button data-dc-seg="${s}" aria-pressed="${ui.segs.has(s)}">${s}</button>`).join('')}
          </div>
        </div>
        <div class="dc-meta">
          <span class="dc-legend">${legend.map(([l, c]) => `<span><i style="background:${c}"></i>${esc(l)}</span>`).join('')}</span>
          <span class="dc-src">${b ? `Baseline <b>${esc(b.name)}</b> · ${b.created.slice(0, 10)}` : '<b>Draft</b> · not finalized yet'} · ${live === 'live' ? 'live from' : 'snapshot of'}
            <a href="${SITE}" target="_blank" rel="noopener">the requirements site ↗</a></span>
        </div>
      </div>`;
  }

  // Is a requirement lit: in the selected thread and in the chosen segments?
  function litFn() {
    const focus = ui.selected ? model.thread(ui.selected) : null;
    return { focus, on: id => { const r = model.get(id); return !!r && (!focus || focus.has(id)) && (!ui.segs.size || r.type === 'mo' || ui.segs.has(r.segment)); },
      filtered: !!(focus || ui.segs.size) };
  }

  function primaryTree() {
    return hierarchy({ id: '__root' }, d => (d.id === '__root' ? model.mos : model.childrenOf(d.id).filter(c => model.primary.get(c) === d.id).map(id => ({ id }))));
  }
  const extraLinks = () => model.links.filter(l => model.primary.get(l.child) !== l.parent && model.get(l.parent)?.level != null);

  function canvas(el, fit) {
    const key = `${ui.mode}:${ui.selected || ''}`;
    const { width: W, height: H } = el.getBoundingClientRect();
    el.innerHTML = `<svg class="dc-svg" width="${W}" height="${H}" role="img" aria-label="Requirements decomposition"><g></g></svg><button class="sc-btn dc-fit" data-dc-fit>Fit</button>`;
    const svg = select(el).select('svg'), g = svg.select('g');
    const z = zoom().scaleExtent([0.15, 4]).on('zoom', e => { g.attr('transform', e.transform); if (e.sourceEvent) ui.zoom[key] = e.transform; });
    svg.call(z).on('dblclick.zoom', null);
    el.querySelector('[data-dc-fit]').onclick = () => svg.call(z.transform, fit(W, H, true));
    svg.call(z.transform, ui.zoom[key] || fit(W, H, false));
    return g;
  }

  function drawTree(el) {
    const { focus, on, filtered } = litFn();
    const rt = primaryTree();
    d3tree().nodeSize([ROW, COL]).separation((a, b) => (a.parent === b.parent ? 1 : 1.25))(rt);
    const nodes = rt.descendants().filter(d => d.depth > 0);
    const pos = new Map(nodes.map(d => [d.data.id, { x: (d.depth - 1) * COL, y: d.x }]));
    const fit = (W, H, all) => {
      const box = focus && !all ? nodes.filter(d => focus.has(d.data.id)) : nodes;
      const y0 = Math.min(...box.map(d => d.x)) - ROW, y1 = Math.max(...box.map(d => d.x)) + ROW;
      const x0 = Math.min(...box.map(d => (d.depth - 1) * COL)), x1 = Math.max(...box.map(d => (d.depth - 1) * COL)) + BOX_W;
      const k = Math.min(1.3, (W - 60) / (x1 - x0), (H - 80) / (y1 - y0 + 40));
      const sel = ui.selected && pos.get(ui.selected);
      if (sel && k < 0.75 && !all) return zoomIdentity.translate(W / 2 - (sel.x + BOX_W / 2) * 0.75, H / 2 - sel.y * 0.75).scale(0.75);
      return zoomIdentity.translate((W - (x1 - x0) * k) / 2 - x0 * k, (H - (y1 - y0) * k) / 2 - y0 * k + 16).scale(k);
    };
    const g = canvas(el, fit);
    const top = Math.min(...nodes.map(d => d.x));
    g.append('g').attr('class', 'dc-levels').selectAll('text').data([...Array(model.maxLevel + 1).keys()]).join('text')
      .attr('x', l => l * COL).attr('y', top - 34).text(l => (l === 0 ? 'Level 0 · Mission objectives' : `Level ${l}`));
    const path = linkHorizontal().x(p => p[0]).y(p => p[1]);
    const links = [
      ...nodes.filter(d => d.depth > 1).map(d => ({ parent: d.parent.data.id, child: d.data.id })),
      ...extraLinks().filter(l => pos.has(l.parent) && pos.has(l.child)).map(l => ({ ...l, extra: true })),
    ];
    g.append('g').selectAll('path').data(links).join('path')
      .attr('class', l => `dc-link${l.extra ? ' is-extra' : ''}${filtered && !(on(l.parent) && on(l.child)) ? ' is-dim' : ''}${focus && on(l.parent) && on(l.child) ? ' is-hot' : ''}`)
      .attr('stroke', l => color(model.get(l.child)))
      .attr('d', l => path({ source: [pos.get(l.parent).x + BOX_W, pos.get(l.parent).y], target: [pos.get(l.child).x, pos.get(l.child).y] }));
    const n = g.append('g').selectAll('g').data(nodes).join('g')
      .attr('class', d => { const r = model.get(d.data.id); return `dc-node${r.type === 'mo' ? ' is-mo' : ''}${on(r.id) ? '' : ' is-dim'}${ui.selected === r.id ? ' is-sel' : ''}${r.example ? ' is-ex' : ''}`; })
      .attr('transform', d => `translate(${(d.depth - 1) * COL},${d.x - BOX_H / 2})`)
      .attr('data-dc-select', d => d.data.id).attr('tabindex', 0).attr('role', 'button')
      .style('--c', d => color(model.get(d.data.id)));
    n.append('rect').attr('width', BOX_W).attr('height', BOX_H).attr('rx', 6);
    n.append('rect').attr('class', 'dc-stripe').attr('width', 4).attr('height', BOX_H).attr('rx', 2);
    n.append('text').attr('class', 'dc-id').attr('x', 11).attr('y', 17).text(d => d.data.id);
    n.append('text').attr('class', 'dc-nm').attr('x', d => 11 + d.data.id.length * 7.2 + 8).attr('y', 17)
      .text(d => short(model.get(d.data.id).name, Math.max(6, 28 - d.data.id.length)));
    n.append('title').text(d => `${d.data.id} · ${model.get(d.data.id).name || ''}\n${model.get(d.data.id).statement || ''}`);
  }

  function drawRadial(el) {
    const { focus, on, filtered } = litFn();
    const rt = primaryTree();
    const R = 330, ring = R / Math.max(1, model.maxLevel + 1);
    d3tree().size([2 * Math.PI, R]).separation((a, b) => (a.parent === b.parent ? 1 : 2) / Math.max(1, a.depth))(rt);
    const nodes = rt.descendants().filter(d => d.depth > 0);
    const polar = new Map(nodes.map(d => [d.data.id, { a: d.x, r: d.depth * ring }]));
    const fit = (W, H) => zoomIdentity.translate(W / 2, H / 2 + 8).scale(Math.min(1.15, (Math.min(W, H) - 30) / (2 * (R + 70))));
    const g = canvas(el, fit);
    g.append('g').attr('class', 'dc-rings').selectAll('circle').data([...Array(model.maxLevel + 1).keys()]).join('circle').attr('r', l => (l + 1) * ring);
    g.append('g').attr('class', 'dc-levels').selectAll('text').data([...Array(model.maxLevel + 1).keys()]).join('text').attr('x', 4).attr('y', l => -(l + 1) * ring - 4).text(l => `L${l}`);
    g.append('text').attr('class', 'dc-center').attr('text-anchor', 'middle').attr('y', 7).text('S-3');
    const rl = linkRadial().angle(p => p.a).radius(p => p.r);
    const links = [
      ...nodes.map(d => ({ parent: d.parent.depth ? d.parent.data.id : null, child: d.data.id })),
      ...extraLinks().filter(l => polar.has(l.parent) && polar.has(l.child)).map(l => ({ ...l, extra: true })),
    ];
    g.append('g').selectAll('path').data(links).join('path')
      .attr('class', l => `dc-link${l.extra ? ' is-extra' : ''}${filtered && !((l.parent ? on(l.parent) : true) && on(l.child)) ? ' is-dim' : ''}`)
      .attr('stroke', l => color(model.get(l.child)))
      .attr('d', l => rl({ source: l.parent ? polar.get(l.parent) : { a: polar.get(l.child).a, r: 0 }, target: polar.get(l.child) }));
    const size = l => [11, 7.5, 6, 5, 4.5][l] ?? 4;
    const n = g.append('g').selectAll('g').data(nodes).join('g')
      .attr('class', d => `dc-dot${on(d.data.id) ? '' : ' is-dim'}${ui.selected === d.data.id ? ' is-sel' : ''}`)
      .attr('transform', d => { const { a, r } = polar.get(d.data.id); return `translate(${r * Math.sin(a)},${-r * Math.cos(a)})`; })
      .attr('data-dc-select', d => d.data.id).attr('tabindex', 0).attr('role', 'button');
    n.append('circle').attr('r', d => size(d.depth - 1)).attr('fill', d => color(model.get(d.data.id)));
    n.append('text')
      .attr('transform', d => `rotate(${(d.x * 180) / Math.PI - 90}) translate(${size(d.depth - 1) + 5},0) ${d.x > Math.PI ? 'rotate(180)' : ''}`)
      .attr('text-anchor', d => (d.x > Math.PI ? 'end' : 'start')).attr('dy', '0.32em')
      .attr('class', d => (d.depth === 1 ? 'is-mo' : ''))
      .text(d => { const id = d.data.id; if (focus) return focus.has(id) ? id : ''; return d.depth === 1 ? `${id} ${model.get(id).name || ''}` : !d.children ? id : ''; });
    n.append('title').text(d => `${d.data.id} · ${model.get(d.data.id).name || ''}`);
  }

  function detail() {
    const r = ui.selected && model.get(ui.selected);
    if (!r) {
      const by = [...Array(model.maxLevel + 1).keys()].map(l => [l, model.reqs.filter(x => x.level === l).length]);
      return `
        <div class="dc-sum">
          ${by.map(([l, n]) => `<div><b>${n}</b><span>${l === 0 ? 'Mission objectives' : `Level ${l}`}</span></div>`).join('')}
        </div>
        <p class="p-text">Select any block to light up its whole thread: every parent up to its mission objective and every child below it. Dashed threads are a second parent.</p>
        ${model.reqs.some(x => x.example) ? '<p class="p-foot">Blocks with a dashed outline are examples from the starter data, not team requirements.</p>' : ''}`;
    }
    const chip = id => { const x = model.get(id); return `<button class="dc-chip" data-dc-select="${esc(id)}" style="--c:${color(x)}"><b>${esc(id)}</b><span>${esc(short(x?.name, 34))}</span></button>`; };
    const kv = (k, v) => (v ? `<div class="dc-kv"><span>${k}</span><p>${esc(v)}</p></div>` : '');
    const SRR_LABEL = { scenario: 'Scenario step', interface: 'Interface', trade: 'Trade', 'srr-req': 'RFP requirement' };
    return `
      <div class="dc-dhead" style="--c:${color(r)}">
        <div class="p-eyebrow"><span>${r.type === 'mo' ? 'Mission objective · Level 0' : `Level ${r.level ?? '?'} · ${esc(r.outline)}`}</span></div>
        <h2 class="p-title">${esc(r.id)}</h2>
        <div class="dc-name">${esc(r.name || '')}${r.example ? ' <em class="tbr">Example</em>' : ''}${r.status === 'TBR' || r.status === 'TBD' ? ` <em class="tbr">${r.status}</em>` : ''}</div>
      </div>
      <p class="p-lead">${esc(r.statement || '')}</p>
      ${r.threshold || r.objective ? `<div class="p-tv"><div class="p-tv-t"><span class="lbl">Threshold</span><p>${esc(r.threshold || '—')}</p></div><div class="p-tv-o"><span class="lbl">Objective</span><p>${esc(r.objective || '—')}</p></div></div>` : ''}
      ${kv('Rationale', r.rationale)}${kv('Verification', r.verification && `${vName[r.verification]}${r.verNote ? ` · ${r.verNote}` : ''}`)}
      ${kv('Segment', r.segment)}${kv('Source', r.source)}
      <h3 class="p-h">Parents</h3><div class="dc-chips">${r.parents.map(chip).join('') || '<span class="p-text">Top of the tree</span>'}</div>
      <h3 class="p-h">Children</h3><div class="dc-chips">${r.children.map(chip).join('') || '<span class="p-text">None</span>'}</div>
      ${r.srr?.length ? `<h3 class="p-h">On this page</h3><div class="dc-chips">${r.srr.map(x => `<button class="dc-chip is-srr" data-dc-srr="${esc(x.kind)}:${esc(x.ref)}"><b>${esc(x.ref)}</b><span>${SRR_LABEL[x.kind] || x.kind}</span></button>`).join('')}</div>` : ''}`;
  }

  function render(sel = ui.selected) {
    ui.selected = sel && model.get(sel) ? sel : null;
    root.innerHTML = `${header()}<div class="dc-body"><div class="dc-canvas" id="dc-canvas"></div><aside class="dc-detail glass">${detail()}</aside></div>`;
    (ui.mode === 'tree' ? drawTree : drawRadial)(root.querySelector('#dc-canvas'));
  }

  root.addEventListener('click', e => {
    const t = e.target.closest('[data-dc-mode], [data-dc-color], [data-dc-seg], [data-dc-select], [data-dc-srr]');
    if (!t) return;
    const d = t.dataset;
    if (d.dcMode) ui.mode = d.dcMode;
    else if (d.dcColor) ui.colorBy = d.dcColor;
    else if (d.dcSeg) ui.segs.has(d.dcSeg) ? ui.segs.delete(d.dcSeg) : ui.segs.add(d.dcSeg);
    else if (d.dcSelect) { const id = ui.selected === d.dcSelect ? null : d.dcSelect; onSelect(id); return; }
    else if (d.dcSrr) { const [kind, ref] = d.dcSrr.split(':'); goSrr(kind, ref); return; }
    render();
  });
  root.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('g[data-dc-select]')) { e.preventDefault(); e.stopPropagation(); onSelect(ui.selected === e.target.dataset.dcSelect ? null : e.target.dataset.dcSelect); }
  });

  return {
    render,
    // The block that carries an RFP requirement (e.g. S3-05), for "Show in the decomposition" links.
    findBySrr: ref => model.reqs.find(r => (r.srr || []).some(x => x.kind === 'srr-req' && x.ref === ref))?.id || null,
    resize: () => render(),
  };
}
