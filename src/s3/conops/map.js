// ConOps map: three stacked canvases over the same projection. Base (borders, basin, rivers) never moves; the
// "why" layer (people, conflict, fire, floods, protected areas, existing infrastructure) and the "what" layer
// (coverage, stations, repeaters, sensors, databases, footprints) crossfade when the step changes.
import { D } from '../v2/data.js';
import { el, css, fmt, kv, showTip, hideTip } from '../v2/ui.js';

const BB = { lon0: 11.3, lon1: 34.6, lat0: -14.2, lat1: 10.2 };
const ASPECT = (BB.lat1 - BB.lat0) / (BB.lon1 - BB.lon0);
const DENS = [1, 5, 15, 40, 100, 300, 1000];
const densClass = d => { let k = 0; while (k < DENS.length && d >= DENS[k]) k++; return k; };
export const SENSOR_COL = { gauge: '--s1', rain: '--s7', tag: '--s6', camera: '--s3', acoustic: '--s2', fire: '--critical', water_q: '--s5', ranger: '--text' };

// opts: { onNode(name) } ; draw(G, S, R): G = loaded data, S = ConOps state, R = model result
export function createConopsMap(holder, opts = {}) {
  const wrap = el('div', { class: 'co-mapwrap', role: 'img' });
  const cvs = ['base', 'why', 'what'].map(k => el('canvas', { class: `co-cv co-${k}`, 'aria-hidden': 'true' }));
  wrap.append(...cvs);
  holder.replaceChildren(wrap);
  const [cb, cw, cx] = cvs.map(c => c.getContext('2d'));
  let W = 500, H = 500, G = null, S = null, hits = { why: [], what: [] };

  function size() {
    const maxW = holder.clientWidth || 500, maxH = holder.clientHeight || maxW * ASPECT;
    W = Math.max(260, Math.min(maxW, maxH / ASPECT)); H = W * ASPECT;
    const dpr = devicePixelRatio || 1;
    wrap.style.width = `${W}px`; wrap.style.height = `${H}px`;
    for (const [c, x] of [[cvs[0], cb], [cvs[1], cw], [cvs[2], cx]]) {
      c.width = W * dpr; c.height = H * dpr; c.style.width = `${W}px`; c.style.height = `${H}px`;
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }
  const px = (lon, lat) => [((lon - BB.lon0) / (BB.lon1 - BB.lon0)) * W, ((BB.lat1 - lat) / (BB.lat1 - BB.lat0)) * H];
  // A circle of `km` on the ground, as an ellipse in this plate carrée projection.
  function ring(ctx, lon, lat, km) {
    const [x, y] = px(lon, lat);
    const rx = (km / (111.32 * Math.cos((lat * Math.PI) / 180)) / (BB.lon1 - BB.lon0)) * W, ry = (km / 110.57 / (BB.lat1 - BB.lat0)) * H;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 7);
  }
  function geoPath(ctx, fc) {
    ctx.beginPath();
    const line = (pts, close) => { pts.forEach(([lon, lat], i) => { const [a, b] = px(lon, lat); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); if (close) ctx.closePath(); };
    for (const f of fc.features) {
      const g = f.geometry;
      if (g.type === 'Polygon') g.coordinates.forEach(r => line(r, true));
      else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => p.forEach(r => line(r, true)));
      else if (g.type === 'LineString') line(g.coordinates, false);
      else if (g.type === 'MultiLineString') g.coordinates.forEach(l => line(l, false));
    }
  }
  const stroke = (ctx, fc, col, w, dash) => { geoPath(ctx, fc); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.setLineDash(dash || []); ctx.stroke(); ctx.setLineDash([]); };
  const fill = (ctx, fc, col) => { geoPath(ctx, fc); ctx.fillStyle = col; ctx.fill('evenodd'); };
  const cellRect = (ctx, k, col) => {
    const res = G.grid.res_deg, [x, y] = px(G.cellLL[k][0] - res / 2, G.cellLL[k][1] + res / 2);
    ctx.fillStyle = col; ctx.fillRect(x, y, (res / (BB.lon1 - BB.lon0)) * W + 0.6, (res / (BB.lat1 - BB.lat0)) * H + 0.6);
  };
  const label = (ctx, text, x, y, col, size = 11, weight = 600) => {
    ctx.font = `${weight} ${size}px Inter, sans-serif`; ctx.lineWidth = 3; ctx.strokeStyle = css('--bg'); ctx.strokeText(text, x, y);
    ctx.fillStyle = col; ctx.fillText(text, x, y);
  };
  const shape = (ctx, kind, x, y, r) => {
    ctx.beginPath();
    if (kind === 'river') ctx.arc(x, y, r, 0, 7);
    else if (kind === 'road') ctx.rect(x - r * 0.9, y - r * 0.9, r * 1.8, r * 1.8);
    else if (kind === 'diamond') { ctx.moveTo(x, y - r * 1.2); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r * 1.2); ctx.lineTo(x - r, y); ctx.closePath(); }
    else { ctx.moveTo(x, y - r * 1.2); ctx.lineTo(x + r * 1.1, y + r * 0.8); ctx.lineTo(x - r * 1.1, y + r * 0.8); ctx.closePath(); }
  };

  // ---------- base: the same in both steps ----------
  function drawBase() {
    const g = G.geo;
    cb.clearRect(0, 0, W, H);
    fill(cb, g.basin, css('--card-3'));
    stroke(cb, g.countries, css('--line-2'), 0.8);
    stroke(cb, g.rivers, css('--river'), 1);
    fill(cb, g.lakes, css('--river'));
  }

  // ---------- why: what S-3 is up against ----------
  function drawWhy() {
    const L = S.why, g = G.geo, hz = G.hz;
    cw.clearRect(0, 0, W, H);
    const h = hits.why = [];
    if (L.pop) {
      const seq = [...Array(8).keys()].map(i => css(`--seq-${i}`));
      for (let k = 0; k < G.grid.i.length; k++) cellRect(cw, k, seq[densClass(G.pop[k] / G.grid.km2[k])]);
    }
    if (L.fire) {
      // Dots, not filled cells, so the people underneath stay readable. Size and strength follow the detections.
      const col = css('--s2'), cellPx = (G.grid.res_deg / (BB.lon1 - BB.lon0)) * W;
      cw.fillStyle = col;
      for (const [i, c] of Object.entries(hz.fires.cells)) {
        const k = G.cellIdx.get(+i); if (k == null || c < 3) continue;
        const [x, y] = px(G.cellLL[k][0], G.cellLL[k][1]), r = Math.min(cellPx * 0.55, 0.5 + Math.log10(c) * cellPx * 0.22);
        cw.globalAlpha = Math.min(0.6, 0.12 + Math.log10(c) / 5);
        cw.beginPath(); cw.arc(x, y, r, 0, 7); cw.fill();
      }
      cw.globalAlpha = 1;
    }
    if (L.pa) for (const a of g.pa.areas) if (a.geometry) {
      const fc = { features: [{ geometry: a.geometry }] };
      fill(cw, fc, 'rgba(47,158,68,.16)'); stroke(cw, fc, css('--s6'), 1.1, [3, 3]);
      const [x, y] = px(a.lon, a.lat);
      h.push({ x, y, r: 7, tip: () => [el('b', { text: a.name }), kv('Protected area ·', `${a.desig || 'protected area'}, ${a.country}`), a.area_km2_in_basin ? kv('In basin', `${fmt(a.area_km2_in_basin)} km²`) : null] });
    }
    stroke(cw, g.basin, css('--accent'), 1.6);
    if (L.infra) {
      stroke(cw, g.roads, css('--neu-4'), 0.7);
      for (const it of D.infra.items) {
        if (it.type === 'conflict') continue; // the UCDP layer shows conflict
        const [x, y] = px(it.lon, it.lat);
        if (x < 0 || x > W) continue;
        cw.beginPath();
        if (it.type.startsWith('data_centre')) cw.rect(x - 4, y - 4, 8, 8); else if (it.type === 'hydro') shape(cw, 'remote', x, y, 4.5); else cw.arc(x, y, 4, 0, 7);
        cw.fillStyle = it.type === 'data_centre_planned' ? css('--bg') : css('--text'); cw.fill(); cw.strokeStyle = css('--bg'); cw.lineWidth = 1.5; cw.stroke();
        h.push({ x, y, r: 8, tip: () => [el('b', { text: it.name }), el('div', { class: 'k', text: it.type.replace(/_/g, ' ') })] });
      }
    }
    if (L.conflict) {
      const col = css('--critical');
      for (const [i, [ev, deaths]] of Object.entries(hz.conflict.cells)) {
        const k = G.cellIdx.get(+i); if (k == null) continue;
        const [x, y] = px(G.cellLL[k][0], G.cellLL[k][1]), r = Math.min(16, 2 + Math.sqrt(deaths) * 0.32);
        cw.beginPath(); cw.arc(x, y, r, 0, 7); cw.globalAlpha = 0.3; cw.fillStyle = col; cw.fill(); cw.globalAlpha = 0.85; cw.strokeStyle = col; cw.lineWidth = 1; cw.stroke(); cw.globalAlpha = 1;
        h.push({ x, y, r: Math.max(5, r), tip: () => [el('b', { text: `${fmt(ev)} violent event${ev === 1 ? '' : 's'}, 2015–2024` }), kv('Deaths (best estimate)', fmt(deaths)), el('div', { class: 'k', text: 'UCDP GED v25.1' })] });
      }
    }
    if (L.flood) {
      const col = css('--river');
      for (const f of hz.floods.events) {
        const [x, y] = px(f.lon, f.lat), r = f.alert === 'Red' ? 6 : f.alert === 'Orange' ? 5 : 3.8;
        cw.beginPath(); cw.moveTo(x, y - r * 1.3); cw.bezierCurveTo(x + r, y - r * 0.2, x + r, y + r, x, y + r); cw.bezierCurveTo(x - r, y + r, x - r, y - r * 0.2, x, y - r * 1.3);
        cw.fillStyle = col; cw.fill(); cw.strokeStyle = css('--bg'); cw.lineWidth = 1.2; cw.stroke();
        h.push({ x, y, r: 8, tip: () => [el('b', { text: f.name || 'Flood' }), kv('When', f.to && f.to !== f.from ? `${f.from} to ${f.to}` : f.from), kv('GDACS alert', f.alert || '–'), el('div', { class: 'k', text: f.country })] });
      }
    }
    for (const c of D.db.candidates.filter(c => !c.excluded)) { const [x, y] = px(c.lon, c.lat); label(cw, c.name, x + 5, y - 4, css('--muted'), 10.5, 500); }
  }

  // ---------- what: what S-3 builds, where, and how many ----------
  function drawWhat(R) {
    const L = S.show, run = G.st.runs[S.mode];
    cx.clearRect(0, 0, W, H);
    const h = hits.what = [];
    // People: covered by a station (mode colour) or not (neutral, darker = more people).
    const fc = G.first(run, `${S.mode}_${S.year}`), lost = R.lostStation;
    const neu = [...Array(6).keys()].map(i => css(`--neu-${i}`)), cov = css('--s4');
    for (let k = 0; k < G.grid.i.length; k++) {
      const c = densClass(G.pop[k] / G.grid.km2[k]);
      const covered = L.coverage && fc[k] < S.n && fc[k] !== lost;
      if (covered) { cx.globalAlpha = 0.6 + 0.05 * c; cellRect(cx, k, cov); } else { cx.globalAlpha = 0.25 + 0.08 * Math.min(c, 5); cellRect(cx, k, neu[Math.min(c, 5)]); }
      cx.globalAlpha = 1;
    }
    // GEO alert footprint: the whole basin (dashed red when the payload is lost).
    if (S.geo) stroke(cx, G.geo.basin, R.geoUp ? css('--alert') : css('--critical'), R.geoUp ? 2.4 : 2, R.geoUp ? [] : [6, 4]);
    else stroke(cx, G.geo.basin, css('--accent'), 1.4);
    // Network: regional nodes linked to the hub.
    const nodes = S.nodes.map(n => D.db.candidates.find(c => c.name === n)).filter(Boolean);
    const hub = nodes[0];
    if (hub) for (const nd of nodes.slice(1)) {
      const [a, b] = px(hub.lon, hub.lat), [c, d] = px(nd.lon, nd.lat);
      cx.beginPath(); cx.moveTo(a, b); cx.lineTo(c, d); cx.strokeStyle = css('--accent'); cx.globalAlpha = 0.55; cx.lineWidth = 1.2; cx.setLineDash([4, 4]); cx.stroke(); cx.setLineDash([]); cx.globalAlpha = 1;
    }
    // Footprints: station reach (relay 20 km solid, radio 25 km dashed) and repeater reach (10 km).
    if (L.reach) {
      cx.lineWidth = 1;
      for (const s of R.stations) {
        ring(cx, s.lon, s.lat, 20); cx.fillStyle = 'rgba(127,203,234,.10)'; cx.fill(); cx.strokeStyle = css('--river'); cx.globalAlpha = 0.7; cx.stroke();
        ring(cx, s.lon, s.lat, 25); cx.setLineDash([2, 3]); cx.globalAlpha = 0.45; cx.stroke(); cx.setLineDash([]); cx.globalAlpha = 1;
      }
      for (const r of R.repeaters) { ring(cx, r.lon, r.lat, 10); cx.fillStyle = 'rgba(124,245,207,.12)'; cx.fill(); cx.strokeStyle = css('--data'); cx.globalAlpha = 0.8; cx.stroke(); cx.globalAlpha = 1; }
    }
    // Sensors: sample locations by type. Hollow red = a priority sensor under canopy with no relay or raised antenna (misses S3-03).
    if (L.sensors) {
      const relayed = new Map(R.canopyPoints.map(p => [`${p.t}:${p.ll[0]},${p.ll[1]}`, p.covered]));
      const crit = css('--critical');
      for (const t of D.sn.types) {
        const col = css(SENSOR_COL[t.id] || '--text'), canopy = R.canopyShare(t.id), prio = R.priority.includes(t.id);
        const scale = (S.sensors[t.id] ?? t.baseline_count) / t.baseline_count, pts = t.sample_points.slice(0, Math.round(t.sample_points.length * Math.min(1, scale)));
        for (const [lat, lon] of pts) {
          const [x, y] = px(lon, lat);
          const misses = prio && canopy >= 0.5 && !relayed.get(`${t.id}:${lon},${lat}`);
          if (misses) { cx.beginPath(); cx.arc(x, y, 2.4, 0, 7); cx.strokeStyle = crit; cx.lineWidth = 1.1; cx.stroke(); }
          else { cx.globalAlpha = t.id === 'tag' ? 0.4 : 0.85; cx.fillStyle = col; cx.fillRect(x - 1.1, y - 1.1, 2.2, 2.2); cx.globalAlpha = 1; }
        }
      }
    }
    // Repeaters and stations.
    for (const [i, r] of R.repeaters.entries()) {
      const [x, y] = px(r.lon, r.lat);
      shape(cx, 'diamond', x, y, 4); cx.fillStyle = css('--data'); cx.fill(); cx.strokeStyle = css('--bg'); cx.lineWidth = 1; cx.stroke();
      h.push({ x, y, r: 7, tip: () => [el('b', { text: `Canopy repeater #${i + 1}` }), kv('Reach', '10 km (assumption)'), el('div', { class: 'k', text: 'Relays canopy sensors to a satellite' })] });
    }
    R.allStations.forEach((s, i) => {
      const [x, y] = px(s.lon, s.lat), isLost = i === lost;
      shape(cx, s.type, x, y, 3.6); cx.fillStyle = isLost ? css('--critical') : css('--text'); cx.fill(); cx.strokeStyle = css('--bg'); cx.lineWidth = 1.2; cx.stroke();
      if (isLost) cross(x, y, 8);
      h.push({ x, y, r: 7, tip: () => [el('b', { text: `Ranger station #${i + 1} · ${s.type} access` }), kv('Adds', `${fmt(s.gain)} people`), kv('People covered so far', `${fmt(s.cum_pct, 1)}%`), kv('15-yr cost so far', `$${fmt(s.cum_cost_musd, 1)}M`), isLost ? el('div', { class: 'k crit', text: 'Taken out by flood (failure case)' }) : null] });
    });
    // Database candidates (click to add or remove) and the chosen nodes.
    for (const c of D.db.candidates.filter(c => !c.excluded)) {
      const on = S.nodes.includes(c.name), [x, y] = px(c.lon, c.lat), isHub = c.name === S.nodes[0], down = isHub && R.hubDown, acting = R.hubDown && c.name === S.nodes[1];
      const r = on ? (isHub ? 8 : 6.5) : 4.5;
      cx.beginPath(); cx.rect(x - r, y - r, 2 * r, 2 * r);
      if (on) { cx.fillStyle = down ? css('--neu-3') : css('--gold'); cx.fill(); cx.strokeStyle = '#000'; cx.lineWidth = 1.6; cx.stroke(); }
      else { cx.strokeStyle = css('--accent'); cx.lineWidth = 1.2; cx.globalAlpha = 0.7; cx.stroke(); cx.globalAlpha = 1; }
      if (down) cross(x, y, r + 3);
      if (acting) { cx.beginPath(); cx.arc(x, y, r + 6, 0, 7); cx.strokeStyle = css('--data'); cx.lineWidth = 2.2; cx.stroke(); }
      if (on) label(cx, `${down ? 'OFFLINE · ' : acting ? 'ACTING HUB · ' : isHub ? 'HUB · ' : ''}${c.name}`, x + r + 4, y + 4, down ? css('--critical') : acting ? css('--data') : css('--text'), 11.5, 700);
      h.push({ x, y, r: 10, node: c.name, tip: () => [el('b', { text: on ? `${isHub ? 'Main hub' : 'Regional database'} · ${c.name}` : `Candidate site · ${c.name}` }),
        el('div', { class: 'k', text: isHub ? 'The hub stays in Kinshasa' : on ? 'Click to remove this node' : S.nodes.length >= 4 ? 'Four nodes already: remove one first' : 'Click to add a database node here' })] });
    }
  }
  function cross(x, y, r) {
    cx.beginPath(); cx.moveTo(x - r, y - r); cx.lineTo(x + r, y + r); cx.moveTo(x + r, y - r); cx.lineTo(x - r, y + r);
    cx.strokeStyle = css('--critical'); cx.lineWidth = 2.2; cx.stroke();
  }

  // ---------- hover and click ----------
  const nearest = (mx, my) => { let best = null, bd = 1e9; for (const h of hits[S.step]) { const d = Math.hypot(h.x - mx, h.y - my); if (d < h.r && d < bd) { bd = d; best = h; } } return best; };
  wrap.addEventListener('pointermove', ev => {
    if (!G) return;
    const r = wrap.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top, hit = nearest(mx, my);
    wrap.style.cursor = hit?.node && hit.node !== S.nodes[0] ? 'pointer' : 'default';
    if (hit) return showTip(ev, hit.tip().filter(Boolean));
    const lon = BB.lon0 + (mx / W) * (BB.lon1 - BB.lon0), lat = BB.lat1 - (my / H) * (BB.lat1 - BB.lat0), g = G.grid;
    const i = Math.round((lat - g.lat0) / g.res_deg) * g.nx + Math.round((lon - g.lon0) / g.res_deg), k = G.cellIdx.get(i);
    if (k == null) return hideTip();
    const nodes = [el('b', { text: `${fmt(G.pop[k])} people` }), kv('Density', `${fmt(G.pop[k] / g.km2[k], 1)} /km²`), kv('Country', g.country[k])];
    if (S.step === 'why') {
      const fire = G.hz.fires.cells[i], con = G.hz.conflict.cells[i];
      if (fire) nodes.push(kv('Fire detections 2024', fmt(fire)));
      if (con) nodes.push(kv('Violent events 2015–24', `${fmt(con[0])} (${fmt(con[1])} deaths)`));
    } else {
      const f = G.first(G.st.runs[S.mode], `${S.mode}_${S.year}`)[k];
      nodes.push(kv('Within a station\'s reach', f < S.n ? `yes, station #${f + 1}` : 'no'));
    }
    showTip(ev, nodes);
  });
  wrap.addEventListener('pointerleave', hideTip);
  wrap.addEventListener('click', ev => {
    if (S?.step !== 'what') return;
    const r = wrap.getBoundingClientRect(), hit = nearest(ev.clientX - r.left, ev.clientY - r.top);
    if (hit?.node && opts.onNode) opts.onNode(hit.node);
  });

  return {
    // full redraw (data, year or size changed)
    draw(g, s, R) { G = g; S = s; size(); drawBase(); drawWhy(); drawWhat(R); this.describe(R); },
    // design changed: only the what layer
    drawWhat(s, R) { S = s; drawWhat(R); this.describe(R); },
    drawWhy(s) { S = s; drawWhy(); },
    describe(R) {
      wrap.setAttribute('aria-label', S.step === 'why'
        ? `Map of the Congo River Basin: population density, ${fmt(G.hz.conflict.events)} violent events 2015–2024, ${fmt(G.hz.fires.detections)} fire detections in 2024, ${G.hz.floods.events.length} flood alerts, protected areas and existing infrastructure.`
        : `Map of the S-3 design, ${S.year}: ${S.nodes.length} database node${S.nodes.length === 1 ? '' : 's'} (${S.nodes.join(', ')}), ${S.n} ranger stations reaching ${fmt(R.popPct, 1)}% of people, ${R.repeaters.length} canopy repeaters, ${fmt(R.terminals)} sensor terminals.`);
    },
  };
}
