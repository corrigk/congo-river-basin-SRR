// 3D globe map for the Scenario tab (CesiumJS, lazy-loaded). Same API as the schematic map:
// render(view) draws the step's nodes, links, alert footprint and frames the camera.
import { Cesium as C } from '../cesium.js';
import { createGlobe } from '../globe.js';
import { createRiverFlow } from '../riverflow.js';
import { flowMaterial, releaseFlow, arc, setAlpha } from '../fx.js';
import { token } from '../theme.js';
import { ICON } from '../icons.js';
import { KIND_ICON } from './schematic.js';
import { esc } from './views.js';

const LINK_COLOR = { up: 'data', down: 'alert', two: 'river', cue: 'precip', relay: 'precip' };

export async function createGlobeMap(container, { insets = () => ({ l: 0, r: 0, t: 0, b: 0 }) } = {}) {
  container.innerHTML = `<div class="gm-globe"></div><div id="markers"></div><div class="gm-credits"></div>
    <div class="sm-badge">3D globe · positions illustrative</div>`;
  const globe = await createGlobe({ container: container.querySelector('.gm-globe'), creditContainer: container.querySelector('.gm-credits') });
  Object.assign(globe.layers, { zones: false, catchments: false, labels: false });
  globe.setOverlays(true);
  createRiverFlow(globe);
  const layer = container.querySelector('#markers');
  const P = globe.scene.primitives;

  // ---- per-step objects, rebuilt on every render ----
  let markers = [], links = [], areas = [];
  const fading = new Set();
  globe.onTick(() => {
    for (const l of fading) {
      l.a += (1 - l.a) * 0.07;
      for (const m of l.mats) setAlpha(m, l.a);
      if (l.a > 0.995) fading.delete(l);
    }
  });

  function clear() {
    for (const m of markers) m.remove();
    for (const l of links) { for (const p of l.prims) P.remove(p); l.mats.forEach(releaseFlow); fading.delete(l); }
    for (const e of areas) globe.viewer.entities.remove(e);
    markers = []; links = []; areas = [];
  }

  function marker(html, cls, [lon, lat], attrs = '') {
    const d = document.createElement('div');
    d.className = `mk ${cls} is-hidden`;
    d.innerHTML = html;
    if (attrs) for (const [k, v] of Object.entries(attrs)) d.dataset[k] = v;
    layer.appendChild(d);
    const m = globe.addMarker(d, lon, lat, 0);
    markers.push(m);
    return m;
  }

  function link(from, to, kind) {
    const color = C.Color.fromCssColorString(token(LINK_COLOR[kind] || 'river'));
    const positions = arc([...from, 0], [...to, 0], { n: 80, lift: 0.16 });
    const base = C.Material.fromType('PolylineGlow', { color: color.withAlpha(0.5), glowPower: 0.2 });
    base.__base = 0.5;
    const pulse = flowMaterial(color.withAlpha(1), { repeat: 2, speed: kind === 'two' ? 0.3 : 0.45, tail: 0.42 });
    const geom = w => new C.GeometryInstance({
      geometry: new C.PolylineGeometry({ positions, width: w, arcType: C.ArcType.NONE, vertexFormat: C.PolylineMaterialAppearance.VERTEX_FORMAT }),
    });
    const prim = (w, material) => P.add(new C.Primitive({ geometryInstances: geom(w), appearance: new C.PolylineMaterialAppearance({ material, translucent: true }), asynchronous: false }));
    const mats = [base, pulse], prims = [prim(5, base), prim(9, pulse)];
    // Two-way links get a second pulse running back the other way.
    if (kind === 'two') {
      const back = flowMaterial(color.withAlpha(0.8), { repeat: 2, speed: -0.3, tail: 0.42 });
      mats.push(back); prims.push(prim(9, back));
    }
    for (const m of mats) setAlpha(m, 0);
    const l = { prims, mats, a: 0 };
    links.push(l);
    fading.add(l);
  }

  // Frame a lon/lat box inside the part of the screen the scenario card, panel and budget leave free.
  function frame([w, s, e, n], opts = {}) {
    const { width: W, height: H } = container.getBoundingClientRect();
    const ins = insets();
    const aw = Math.max(W - ins.l - ins.r, 200), ah = Math.max(H - ins.t - ins.b, 200);
    const dx = e - w, dy = n - s;
    const box = [w - (dx * ins.l) / aw, s - (dy * ins.b) / ah, e + (dx * ins.r) / aw, n + (dy * ins.t) / ah];
    globe.flyToBox(box, { pitch: -74, scale: 1.95, shift: 0, duration: 1.8, ...opts });
  }
  const BASIN_BOX = [11.8, -13.5, 34.0, 9.3];

  function render(view) {
    const { nodes = {}, show = [], links: ls = [], state = {}, focus = [], area = null, mode = 't' } = view || {};
    clear();
    for (const id of show) {
      const n = nodes[id];
      const icon = KIND_ICON[n.kind] || ICON.hex;
      marker(`<div class="gm-node k-${n.kind}${state[id] ? ` s-${state[id]}` : ''}">
          <span class="gm-halo"></span><span class="gm-ico">${icon}</span>
          <span class="gm-lbl"><b>${esc(n.label)}</b><em>${esc(n.sub || '')}</em></span></div>`,
        'mk-gm', n.at, n.rfp ? { system: n.rfp } : '');
    }
    for (const [a, b, kind] of ls) link(nodes[a].at, nodes[b].at, kind);

    if (area && focus.length) {
      const pts = focus.map(id => nodes[id].at);
      const lon = pts.reduce((s, p) => s + p[0], 0) / pts.length, lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      const km2 = area.km2[mode], r = Math.sqrt(km2 / Math.PI) * 1000;
      const gold = C.Color.fromCssColorString(token('gold'));
      areas.push(globe.viewer.entities.add({
        position: C.Cartesian3.fromDegrees(lon, lat),
        ellipse: { semiMajorAxis: r, semiMinorAxis: r, height: 300, material: gold.withAlpha(0.12), outline: true, outlineColor: gold.withAlpha(0.9) },
      }));
      marker(`<span class="gm-area">S3-06 footprint ≤${km2.toLocaleString('en-US')} km² · ${mode === 't' ? 'threshold' : 'objective'}</span>`,
        'mk-gm-area', [lon, lat - r / 111_000 - 0.12]);
    }

    if (focus.length) {
      const ll = focus.map(id => nodes[id].at);
      let w = Math.min(...ll.map(p => p[0])), e = Math.max(...ll.map(p => p[0]));
      let s = Math.min(...ll.map(p => p[1])), n = Math.max(...ll.map(p => p[1]));
      const MIN = 5;
      if (e - w < MIN) { const c = (w + e) / 2; w = c - MIN / 2; e = c + MIN / 2; }
      if (n - s < MIN) { const c = (s + n) / 2; s = c - MIN / 2; n = c + MIN / 2; }
      frame([w, s, e, n]);
    } else frame(BASIN_BOX);
  }

  // Pause rendering while the Scenario tab is hidden so the globe doesn't burn CPU behind other tabs.
  const pause = p => { globe.viewer.useDefaultRenderLoop = !p; };

  return { kind: 'globe', render, pause, home: () => frame(BASIN_BOX), viewer: globe.viewer };
}
