// 2D canvas map of the basin: population or station coverage on the 0.125° grid, plus vector layers, the hub and
// database nodes, ranger stations, protected areas and sensor samples. Vector-only: works offline, redraws fast.
import { D, geo as loadGeo, grid as loadGrid, pop as loadPop, stations as loadStations, firstCovered, MODES } from './data.js';
import { css, el, fmt, fmtM, kv, showTip, hideTip } from './ui.js';

const BB = { lon0: 11.3, lon1: 34.6, lat0: -14.2, lat1: 10.2 };
const DENS = [1, 5, 15, 40, 100, 300, 1000];
const densClass = d => { let k = 0; while (k < DENS.length && d >= DENS[k]) k++; return k; };
export const DENS_LABELS = ['<1', '1–5', '5–15', '15–40', '40–100', '100–300', '300–1k', '1k+'];
const SN_COL = { gauge: '--s1', rain: '--s7', tag: '--s6', camera: '--s3', acoustic: '--s2', fire: '--critical', water_q: '--s5' };

// opts: { onDb(name), maxHeight() } ; draw(state) with state = { year, mode, n, view, layers, fail, db }
export function createMap(container, opts = {}) {
  const cv = el('canvas', { class: 'vmap', role: 'img', 'aria-label': 'Map of the Congo River Basin' });
  const status = el('div', { class: 'vmap-status', text: 'Loading map data…' });
  container.replaceChildren(cv, status);
  const ctx = cv.getContext('2d');
  let W = 600, H = 600, hits = [], last = null, G = null, cellLL = null, cellIdx = null;

  const px = (lon, lat) => [((lon - BB.lon0) / (BB.lon1 - BB.lon0)) * W, ((BB.lat1 - lat) / (BB.lat1 - BB.lat0)) * H];
  function size() {
    const aspect = (BB.lat1 - BB.lat0) / (BB.lon1 - BB.lon0);
    let w = container.clientWidth || 600;
    const maxH = opts.maxHeight ? opts.maxHeight() : Infinity;
    if (w * aspect > maxH) w = maxH / aspect;
    W = Math.max(240, w); H = W * aspect;
    const dpr = devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = `${W}px`; cv.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function path(coords, polygon) {
    for (const ring of polygon ? coords : [coords]) ring.forEach(([x, y], i) => { const [a, b] = px(x, y); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); });
    if (polygon) ctx.closePath();
  }
  function drawGeo(fc, stroke, width, fill, dash) {
    ctx.beginPath();
    for (const f of fc.features) {
      const g = f.geometry;
      if (g.type === 'Polygon') path(g.coordinates, true);
      else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => path(p, true));
      else if (g.type === 'LineString') path(g.coordinates, false);
      else if (g.type === 'MultiLineString') g.coordinates.forEach(l => path(l, false));
    }
    if (fill) { ctx.fillStyle = fill; ctx.fill('evenodd'); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.setLineDash(dash || []); ctx.stroke(); ctx.setLineDash([]); }
  }

  async function draw(state) {
    last = state;
    // Screen readers get the map's state in words; the numbers behind it are in the cards and tables beside it.
    const f = state.fail || {};
    cv.setAttribute('aria-label', `Map of the Congo River Basin, ${state.year}: ${state.view === 'pop' ? 'population density' : `${MODES[state.mode].name} coverage`}, ${state.n} ranger stations, `
      + `hub ${f.hub ? `${D.db.recommended[0]} offline, ${D.db.recommended[1]} acting` : D.db.recommended[0]}${f.station != null ? `, station #${f.station + 1} lost` : ''}.`);
    const [geo, grid, pop, st] = await Promise.all([loadGeo(), loadGrid(), loadPop(state.year), loadStations(state.year)]);
    if (state !== last) return; // a newer draw started while data was loading
    status.remove();
    G = { geo, grid, pop, st };
    if (!cellLL) {
      cellLL = grid.i.map(i => [grid.lon0 + (i % grid.nx) * grid.res_deg, grid.lat0 + Math.floor(i / grid.nx) * grid.res_deg]);
      cellIdx = new Map(grid.i.map((g, k) => [g, k]));
    }
    size();
    ctx.clearRect(0, 0, W, H);
    hits = [];
    const L = state.layers, run = st.runs[state.mode], fail = state.fail || {};
    const seq = [...Array(8).keys()].map(i => css(`--seq-${i}`)), neu = [...Array(6).keys()].map(i => css(`--neu-${i}`));
    const res = grid.res_deg, cw = (res / (BB.lon1 - BB.lon0)) * W + 0.6, ch = (res / (BB.lat1 - BB.lat0)) * H + 0.6;
    const fc = state.view === 'cov' ? firstCovered(run, `${state.mode}_${state.year}`) : null;
    const modeCol = css(MODES[state.mode].color);
    for (let k = 0; k < grid.i.length; k++) {
      const c = densClass(pop[k] / grid.km2[k]);
      const [x, y] = px(cellLL[k][0] - res / 2, cellLL[k][1] + res / 2);
      if (!fc) ctx.fillStyle = seq[c];
      else {
        const covered = fc[k] < state.n && fc[k] !== fail.station;
        ctx.fillStyle = covered ? modeCol : neu[Math.min(c, 5)];
        ctx.globalAlpha = covered ? 0.6 + 0.05 * c : 1;
      }
      ctx.fillRect(x, y, cw, ch);
      ctx.globalAlpha = 1;
    }
    if (L.countries) drawGeo(geo.countries, css('--line-2'), 0.8);
    drawGeo(geo.basin, css('--accent'), 1.6);
    if (L.roads) drawGeo(geo.roads, css('--s2'), 0.7);
    if (L.rivers) { drawGeo(geo.rivers, css('--river'), 1.1); drawGeo(geo.lakes, null, 0, css('--river')); }
    if (L.pa) {
      for (const a of geo.pa.areas) {
        if (a.geometry) drawGeo({ features: [{ geometry: a.geometry }] }, css('--s6'), 1.2, 'rgba(0,131,0,.12)', [3, 3]);
        const [x, y] = px(a.lon, a.lat);
        hits.push({ x, y, r: 8, tip: () => [el('b', { text: a.name }), kv('Protected area ·', `${a.desig || 'protected area'}, ${a.country}`),
          a.area_km2_in_basin ? kv('In basin', `${fmt(a.area_km2_in_basin)} km²`) : null, el('div', { class: 'k', text: geo.pa.source === 'wdpa' ? `WDPA ${geo.pa.release}` : 'Approximate outline' })] });
      }
    }
    if (L.sensors) {
      for (const t of D.sn.types) {
        if (!t.sample_points.length) continue;
        ctx.fillStyle = css(SN_COL[t.id] || '--text');
        for (const [la, lo] of t.sample_points.slice(0, 300)) { const [x, y] = px(lo, la); ctx.fillRect(x - 1.2, y - 1.2, 2.4, 2.4); }
      }
    }
    if (L.stations && state.n > 0) {
      run.stations.slice(0, state.n).forEach((s, i) => {
        const [x, y] = px(s.lon, s.lat);
        ctx.beginPath();
        if (s.type === 'river') ctx.arc(x, y, 3.6, 0, 7);
        else if (s.type === 'road') ctx.rect(x - 3.2, y - 3.2, 6.4, 6.4);
        else { ctx.moveTo(x, y - 4.4); ctx.lineTo(x + 4, y + 3); ctx.lineTo(x - 4, y + 3); ctx.closePath(); }
        const lost = fail.station === i;
        ctx.fillStyle = lost ? css('--critical') : css('--text');
        ctx.fill(); ctx.strokeStyle = css('--bg'); ctx.lineWidth = 1.2; ctx.stroke();
        if (lost) cross(x, y, 9);
        hits.push({ x, y, r: 7, tip: () => [el('b', { text: `Ranger station #${i + 1} · ${s.type} access` }), kv('Adds', `${fmt(s.gain)} people`),
          kv('Coverage so far', `${fmt(s.cum_pct, 1)}%`), kv('Cost so far', fmtM(s.cum_cost_musd)), s.hydro_ok && s.type === 'river' ? el('div', { class: 'k', text: 'River site: micro-hydro option' }) : null,
          lost ? el('div', { class: 'k crit', text: 'Taken out by flood (failure case)' }) : null] });
      });
    }
    if (L.infra) {
      for (const it of D.infra.items) {
        const [x, y] = px(it.lon, it.lat);
        if (x < 0 || x > W) continue;
        ctx.beginPath(); ctx.arc(x, y, 4.5, 0, 7);
        const conflict = it.type === 'conflict';
        ctx.fillStyle = conflict ? css('--critical') : css('--bg'); ctx.fill();
        ctx.strokeStyle = conflict ? css('--critical') : css('--text'); ctx.lineWidth = 1.5; ctx.stroke();
        hits.push({ x, y, r: 8, tip: () => [el('b', { text: it.name }), el('div', { class: 'k', text: it.type.replace(/_/g, ' ') })] });
      }
    }
    if (L.db) {
      const rec = D.db.recommended;
      const acting = fail.hub ? rec[1] : null;
      D.db.candidates.filter(c => rec.includes(c.name)).forEach(c => {
        const [x, y] = px(c.lon, c.lat), main = c.name === rec[0], r = main ? 9 : 7;
        const down = fail.hub && main, act = c.name === acting;
        ctx.fillStyle = down ? css('--neu-3') : css('--gold'); ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.rect(x - r, y - r, 2 * r, 2 * r); ctx.fill(); ctx.stroke();
        if (act) { ctx.beginPath(); ctx.arc(x, y, r + 7, 0, 7); ctx.strokeStyle = css('--data'); ctx.lineWidth = 2.5; ctx.stroke(); }
        if (down) cross(x, y, r + 4);
        if (state.db === c.name) { ctx.beginPath(); ctx.rect(x - r - 4, y - r - 4, 2 * r + 8, 2 * r + 8); ctx.strokeStyle = css('--text'); ctx.lineWidth = 1.5; ctx.stroke(); }
        ctx.font = "800 13px 'Big Shoulders Text', sans-serif";
        const lab = `${down ? 'OFFLINE · ' : act ? 'ACTING HUB · ' : main ? 'HUB · ' : 'DB · '}${c.name}`;
        // The acting hub's longer label sits above its node so it clears neighbouring labels.
        const [lx, ly] = act ? [x - ctx.measureText(lab).width / 2, y - r - 11] : [x + r + 4, y + 4];
        ctx.lineWidth = 3; ctx.strokeStyle = css('--bg'); ctx.strokeText(lab, lx, ly);
        ctx.fillStyle = down ? css('--critical') : act ? css('--data') : css('--text'); ctx.fillText(lab, lx, ly);
        hits.push({ x, y, r: 14, db: c.name, tip: () => [el('b', { text: `${main ? 'Main hub' : 'Regional database'} · ${c.name}` }), el('div', { class: 'k', text: opts.onDb ? 'Click for the siting rationale' : '' })] });
      });
    }
  }
  function cross(x, y, r) {
    ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r);
    ctx.strokeStyle = css('--critical'); ctx.lineWidth = 2.5; ctx.stroke();
  }

  const nearest = (mx, my) => { let best = null, bd = 1e9; for (const h of hits) { const d = Math.hypot(h.x - mx, h.y - my); if (d < h.r && d < bd) { bd = d; best = h; } } return best; };
  cv.addEventListener('pointermove', ev => {
    if (!G) return;
    const r = cv.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top, h = nearest(mx, my);
    cv.style.cursor = h?.db && opts.onDb ? 'pointer' : 'default';
    if (h) return showTip(ev, h.tip().filter(Boolean));
    const { grid, pop } = G, res = grid.res_deg;
    const lon = BB.lon0 + (mx / W) * (BB.lon1 - BB.lon0), lat = BB.lat1 - (my / H) * (BB.lat1 - BB.lat0);
    const k = cellIdx.get(Math.round((lat - grid.lat0) / res) * grid.nx + Math.round((lon - grid.lon0) / res));
    if (k == null) return hideTip();
    const nodes = [el('b', { text: `${fmt(pop[k])} people` }), kv('Density', `${fmt(pop[k] / grid.km2[k], 1)} /km²`), kv('Country', grid.country[k]),
      kv('To river / road', `${fmt(grid.river_km[k])} / ${fmt(grid.road_km[k])} km`)];
    if (last.view === 'cov') {
      const f = firstCovered(G.st.runs[last.mode], `${last.mode}_${last.year}`)[k];
      nodes.push(kv('Covered', f < last.n ? `yes, by station #${f + 1}` : f < 65535 ? `from station #${f + 1}` : 'not within 400 stations'));
    }
    showTip(ev, nodes);
  });
  cv.addEventListener('pointerleave', hideTip);
  cv.addEventListener('click', ev => {
    const r = cv.getBoundingClientRect(), h = nearest(ev.clientX - r.left, ev.clientY - r.top);
    if (h?.db && opts.onDb) opts.onDb(h.db);
  });
  // Colours come from the theme tokens, so redraw when the theme changes (toggle or system setting).
  addEventListener('srr-theme', () => last && cv.isConnected && draw(last));
  return { draw, redraw: () => last && draw(last) };
}
