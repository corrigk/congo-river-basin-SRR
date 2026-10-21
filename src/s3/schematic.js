// Schematic basin map in plain SVG: basin outline, main rivers, borders, and the scenario's nodes and links.
// No WebGL, no network. It's the offline fallback for the globe and draws the same scenario view.
import basinGeo from '../data/basin.json';
import riversGeo from '../data/rivers.json';
import bordersGeo from '../data/borders.json';
import { ICON, ASSET_ICON } from '../icons.js';
import { esc } from './views.js';

const K = 40;                       // SVG units per degree
const X0 = 8, Y0 = 12;              // lon/lat at the SVG origin
const px = ([lon, lat]) => [(lon - X0) * K, (Y0 - lat) * K];
const r1 = n => Math.round(n * 10) / 10;
const path = ring => ring.map((p, i) => { const [x, y] = px(p); return `${i ? 'L' : 'M'}${r1(x)} ${r1(y)}`; }).join('');

const BASIN_BOX = basinGeo.features[0].properties.bbox;
const lines = g => (g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []);

// Precomputed geometry (rivers: main stem and major tributaries only; small streams add bytes, not meaning).
const BASIN_D = basinGeo.features[0].geometry.coordinates.map(path).join('') + 'Z';
const RIVERS = riversGeo.features.filter(f => f.properties.c <= 2)
  .map(f => ({ c: f.properties.c, d: lines(f.geometry).map(path).join('') }));
const BORDERS_D = bordersGeo.features.flatMap(f => lines(f.geometry)).map(path).join('');

const PLACES = [
  ['Kinshasa', [15.322, -4.325]], ['Bangui', [18.558, 4.394]], ['Kisangani', [25.191, 0.515]],
  ['Mbandaka', [18.26, 0.048]], ['Ouesso', [16.05, 1.61]], ['Lubumbashi', [27.479, -11.664]],
];

const KIND_ICON = {
  sensor: ASSET_ICON.water, space: ASSET_ICON.satellite, ground: ICON.dish, authority: ASSET_ICON.government,
  receiver: ICON.radio, responder: ASSET_ICON.community, outage: ICON.towerOff, field: ICON.field, hazard: ICON.alert, partner: ICON.hex,
};

export function createSchematicMap(container, { insets = () => ({ l: 0, r: 0, t: 0, b: 0 }) } = {}) {
  container.innerHTML = `
    <svg class="sm" role="img" aria-label="Schematic map of the Congo River Basin (not to GIS accuracy)" preserveAspectRatio="xMidYMid meet">
      <defs>
        <radialGradient id="sm-glow"><stop offset="0" stop-color="var(--gold)" stop-opacity=".35"/><stop offset="1" stop-color="var(--gold)" stop-opacity="0"/></radialGradient>
        <clipPath id="sm-clip"><path d="${BASIN_D}"/></clipPath>
      </defs>
      <g class="sm-base">
        <path class="sm-borders-out" d="${BORDERS_D}"/>
        <path class="sm-basin" d="${BASIN_D}"/>
        <path class="sm-borders" d="${BORDERS_D}" clip-path="url(#sm-clip)"/>
        ${RIVERS.map(r => `<path class="sm-river c${r.c}" d="${r.d}"/>`).join('')}
        <path class="sm-basin-line" d="${BASIN_D}"/>
        <g class="sm-places">${PLACES.map(([n, p]) => { const [x, y] = px(p); return `<g transform="translate(${r1(x)},${r1(y)})" class="sm-pl"><g class="sm-s"><circle r="3"/><text x="6" y="-5">${n}</text></g></g>`; }).join('')}</g>
      </g>
      <g class="sm-area"></g>
      <g class="sm-links"></g>
      <g class="sm-nodes"></g>
    </svg>
    <div class="sm-badge">Schematic map · positions illustrative</div>`;
  const svg = container.querySelector('svg');
  const gArea = svg.querySelector('.sm-area'), gLinks = svg.querySelector('.sm-links'), gNodes = svg.querySelector('.sm-nodes');

  // ---- camera: animate the viewBox to frame a lon/lat box inside the uncovered part of the screen ----
  let vb = null, anim = 0;
  function targetFor([w, s, e, n]) {
    const { width: W, height: H } = container.getBoundingClientRect();
    const ins = insets();
    const aw = Math.max(W - ins.l - ins.r, 200), ah = Math.max(H - ins.t - ins.b, 200);
    const [x1, y1] = px([w, n]), [x2, y2] = px([e, s]);
    const scale = Math.max((x2 - x1) / aw, (y2 - y1) / ah);  // svg units per pixel
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    const vx = cx - (ins.l + aw / 2) * scale, vy = cy - (ins.t + ah / 2) * scale;
    return [vx, vy, W * scale, H * scale];
  }
  function apply(v) {
    vb = v;
    svg.setAttribute('viewBox', v.map(r1).join(' '));
    svg.style.setProperty('--u', v[2] / Math.max(container.clientWidth, 1)); // svg units per px, keeps marks screen-sized
  }
  let lastBox = BASIN_BOX;
  function frame(box, { instant = false } = {}) {
    lastBox = box;
    const to = targetFor(box);
    cancelAnimationFrame(anim);
    if (!vb || instant || matchMedia('(prefers-reduced-motion: reduce)').matches) { apply(to); return; }
    const from = vb, t0 = performance.now(), D = 900;
    const step = now => {
      const k = Math.min((now - t0) / D, 1), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      apply(from.map((a, i) => a + (to[i] - a) * e));
      if (k < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }
  new ResizeObserver(() => frame(lastBox, { instant: true })).observe(container);

  // ---- scenario view ----
  // view: { nodes, show, links, state, focus, area: { km2: {t, o} } | null }
  function render(view) {
    const { nodes = {}, show = [], links = [], state = {}, focus = [], area = null } = view || {};
    const at = id => px(nodes[id].at);

    gNodes.innerHTML = show.map(id => {
      const n = nodes[id], [x, y] = at(id);
      const icon = (KIND_ICON[n.kind] || ICON.hex).replace('<svg ', '<svg x="-9" y="-9" width="18" height="18" ');
      return `<g class="sm-node k-${n.kind}${state[id] ? ` s-${state[id]}` : ''}" data-node="${id}" ${n.rfp ? `data-system="${n.rfp}"` : ''} transform="translate(${r1(x)},${r1(y)})">
        <g class="sm-n-s">
          <circle class="sm-n-halo" r="26"/>
          <circle class="sm-n-bg" r="17"/>
          ${icon}
          <g class="sm-n-lbl"><text class="sm-n-t" x="24" y="-2">${esc(n.label)}</text><text class="sm-n-sub" x="24" y="13">${esc(n.sub || '')}</text></g>
        </g>
      </g>`;
    }).join('');

    gLinks.innerHTML = links.map(([a, b, kind], i) => {
      const [x1, y1] = at(a), [x2, y2] = at(b);
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1;
      const bend = 0.18 * (i % 2 ? -1 : 1);
      const d = `M${r1(x1)} ${r1(y1)}Q${r1(mx - dy * bend)} ${r1(my + dx * bend)} ${r1(x2)} ${r1(y2)}`;
      return `<path class="sm-link k-${kind}" d="${d}"/><path class="sm-link-flow k-${kind}" d="${d}" style="--i:${i}"/>`;
    }).join('');

    gArea.innerHTML = '';
    if (area && focus.length) {
      const pts = focus.map(at), cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      const rad = km2 => (Math.sqrt(km2 / Math.PI) / 111) * K; // equal-area circle, km -> degrees -> svg units
      gArea.innerHTML = ['t', 'o'].map(m => `
        <g class="sm-target v-${m}"><circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(rad(area.km2[m]))}"/>
          <text x="${r1(cx)}" y="${r1(cy + rad(area.km2[m]))}" dy="1.3em">S3-06 footprint ≤${area.km2[m].toLocaleString('en-US')} km² · ${m === 't' ? 'threshold' : 'objective'}</text></g>`).join('');
    }

    // Frame the focus nodes (or the whole basin), with a minimum span so single nodes keep context.
    if (focus.length) {
      const ll = focus.map(id => nodes[id].at);
      let w = Math.min(...ll.map(p => p[0])), e = Math.max(...ll.map(p => p[0]));
      let s = Math.min(...ll.map(p => p[1])), n = Math.max(...ll.map(p => p[1]));
      const MIN = 5.5;
      if (e - w < MIN) { const c = (w + e) / 2; w = c - MIN / 2; e = c + MIN / 2; }
      if (n - s < MIN) { const c = (s + n) / 2; s = c - MIN / 2; n = c + MIN / 2; }
      const padX = (e - w) * 0.18, padY = (n - s) * 0.18;
      frame([w - padX, s - padY, e + padX, n + padY]);
    } else frame(BASIN_BOX);
  }

  frame(BASIN_BOX, { instant: true });
  return { kind: 'schematic', render, home: () => frame(BASIN_BOX), refit: () => frame(lastBox) };
}
