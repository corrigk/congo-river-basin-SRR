import { Cesium as C } from './cesium.js';
import { tickFlows } from './fx.js';
import { token } from './theme.js';
import basinGeo from './data/basin.json';
import zonesGeo from './data/zones.json';
import riversGeo from './data/rivers.json';
import catchGeo from './data/catchments.json';
import bordersGeo from './data/borders.json';
import maskGeo from './data/mask.json';

const css = c => C.Color.fromCssColorString(c);
const GOLD = css(token('gold'));
const RIVER = css(token('river'));
const WHITE = C.Color.WHITE;

// Vector heights (m) above the ellipsoid so layers sort cleanly against the globe.
const H_MASK = 60, H_FILL = 120, H_LINE = 400;

// Highest camera altitude (m) at which each kind of HTML marker is still shown.
export const MAX_ALT = { zone: 16_000_000, hub: 16_000_000, scenario: 12_000_000, asset: 9_000_000, label: 3_700_000 };

// Title-card camera: Africa seen from deep space, slightly west so the title card has room.
// Below this canvas width (px) the layout switches to phone mode (matches the 760px CSS breakpoint).
const PHONE_WIDTH = 760;

const INTRO_VIEW = { lon: -4, lat: 5, height: 21_000_000 };

export const BASIN = basinGeo.features[0].properties;
export const ZONE_PROPS = Object.fromEntries(zonesGeo.features.map(f => [f.properties.zone, f.properties]));

// ---------- geometry helpers ----------
const polys = g => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);
const lines = g => (g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : polys(g).flat());
const pos = (ring, h) => C.Cartesian3.fromDegreesArrayHeights(ring.flatMap(([x, y]) => [x, y, h]));

function ringContains(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inGeom = (g, x, y) => polys(g).some(p => ringContains(p[0], x, y) && !p.slice(1).some(h => ringContains(h, x, y)));

function linePrimitive(geojson, { width, material }) {
  const instances = [];
  for (const f of geojson.features) for (const part of lines(f.geometry)) {
    if (part.length < 2) continue;
    instances.push(new C.GeometryInstance({
      geometry: new C.PolylineGeometry({ positions: pos(part, H_LINE), width, arcType: C.ArcType.NONE, vertexFormat: C.PolylineMaterialAppearance.VERTEX_FORMAT }),
    }));
  }
  return new C.Primitive({ geometryInstances: instances, appearance: new C.PolylineMaterialAppearance({ material, translucent: true }), asynchronous: true });
}

const colorMat = color => C.Material.fromType('Color', { color: color.clone() });
const glowMat = (color, glowPower = 0.22) => C.Material.fromType('PolylineGlow', { color: color.clone(), glowPower, taperPower: 1 });

// ---------- the globe ----------
export async function createGlobe({ container, creditContainer }) {
  const viewer = new C.Viewer(container, {
    baseLayer: C.ImageryLayer.fromProviderAsync(
      C.TileMapServiceImageryProvider.fromUrl(C.buildModuleUrl('Assets/Textures/NaturalEarthII'))),
    animation: false, timeline: false, baseLayerPicker: false, geocoder: false, homeButton: false,
    sceneModePicker: false, navigationHelpButton: false, fullscreenButton: false, infoBox: false,
    selectionIndicator: false, creditContainer, msaaSamples: 4,
    skyBox: false, // no star field, sun or moon: their textures are never seen at basin zoom and would need caching
  });
  const { scene, camera } = viewer;
  viewer.imageryLayers.get(0).brightness = 0.6; // the bundled basemap is bright; dim it so panels and marks read on top
  viewer.useBrowserRecommendedResolution = false;
  viewer.resolutionScale = Math.min(window.devicePixelRatio, 2) / window.devicePixelRatio;

  // Real satellite imagery (no token) over the bundled offline Natural Earth base. Added only once a probe tile
  // loads, so with no internet the globe quietly stays on the bundled base instead of failing tile requests.
  const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  let esri = null;
  function addOnlineImagery() {
    if (esri) return;
    esri = viewer.imageryLayers.addImageryProvider(new C.UrlTemplateImageryProvider({
      url: ESRI, maximumLevel: 18, credit: new C.Credit('Imagery © Esri, Maxar, Earthstar Geographics'),
    }));
    Object.assign(esri, { brightness: 1.0, contrast: 1.1, saturation: 0.95, gamma: 1.0 });
  }
  function probeImagery(timeoutMs = 4000) {
    return new Promise(resolve => {
      const img = new Image(), t = setTimeout(() => { img.src = ''; resolve(false); }, timeoutMs);
      img.onload = () => { clearTimeout(t); resolve(true); };
      img.onerror = () => { clearTimeout(t); resolve(false); };
      img.src = `${ESRI.replace('{z}/{y}/{x}', '3/3/4')}?probe=${Date.now()}`;
    });
  }

  const g = scene.globe;
  Object.assign(g, {
    enableLighting: true, dynamicAtmosphereLighting: true, dynamicAtmosphereLightingFromSun: true,
    showGroundAtmosphere: true, depthTestAgainstTerrain: false, baseColor: css('#04070b'),
    maximumScreenSpaceError: 1.5, tileCacheSize: 400,
  });
  scene.backgroundColor = C.Color.BLACK;
  scene.fog.enabled = true;
  scene.skyAtmosphere.show = true;
  scene.postProcessStages.fxaa.enabled = true;
  // Freeze the sun east of Africa (equinox) so the space shot shows a terminator; below ~10,000 km Cesium fades lighting out.
  viewer.clock.currentTime = C.JulianDate.fromIso8601('2026-03-20T08:00:00Z');
  viewer.clock.shouldAnimate = false;

  const ctl = scene.screenSpaceCameraController;
  ctl.minimumZoomDistance = 25_000;
  ctl.maximumZoomDistance = 45_000_000;
  ctl.inertiaSpin = 0.88; ctl.inertiaTranslate = 0.88; ctl.inertiaZoom = 0.75;

  // ---------- static overlays ----------
  const P = scene.primitives;

  // Spotlight mask: dims everything outside the basin (hole-free pieces from scripts/build-mask.mjs).
  const mask = P.add(new C.Primitive({
    geometryInstances: maskGeo.features.map(f => new C.GeometryInstance({
      geometry: new C.PolygonGeometry({
        polygonHierarchy: new C.PolygonHierarchy(C.Cartesian3.fromDegreesArray(f.geometry.coordinates[0].flat())),
        height: H_MASK, arcType: C.ArcType.RHUMB, vertexFormat: C.EllipsoidSurfaceAppearance.VERTEX_FORMAT,
      }),
    })),
    appearance: new C.EllipsoidSurfaceAppearance({ material: colorMat(new C.Color(0.01, 0.015, 0.02, 0.5)), aboveGround: true }),
    asynchronous: true,
  }));

  const catchments = P.add(linePrimitive(catchGeo, { width: 1, material: colorMat(WHITE.withAlpha(0.13)) }));
  const borders = P.add(linePrimitive(bordersGeo, {
    width: 1.5, material: C.Material.fromType('PolylineDash', { color: WHITE.withAlpha(0.42), gapColor: C.Color.TRANSPARENT, dashLength: 10 }),
  }));

  const riverCls = [
    { width: 7, material: glowMat(RIVER.withAlpha(1), 0.28), a: 1 },
    { width: 2.6, material: colorMat(RIVER.withAlpha(0.95)), a: 0.95 },
    { width: 1.6, material: colorMat(RIVER.withAlpha(0.8)), a: 0.8 },
    { width: 1.0, material: colorMat(RIVER.withAlpha(0.5)), a: 0.5 },
  ];
  const rivers = riversGeo.features
    .sort((a, b) => b.properties.c - a.properties.c)
    .map(f => {
      const c = riverCls[f.properties.c];
      const p = P.add(linePrimitive({ features: [f] }, { width: c.width, material: c.material }));
      return { p, base: c.a };
    });

  const basinGlow = P.add(linePrimitive(basinGeo, { width: 7, material: glowMat(GOLD.withAlpha(0.8), 0.16) }));
  const basinLine = P.add(linePrimitive(basinGeo, { width: 1.6, material: colorMat(GOLD.withAlpha(1)) }));

  // ---------- zones (per-instance colours so highlight changes are instant) ----------
  const zoneKeys = zonesGeo.features.map(f => f.properties.zone);
  const zoneFillIds = {}, zoneLineIds = {};
  const fillInstances = [], lineInstances = [];
  for (const f of zonesGeo.features) {
    const k = f.properties.zone;
    zoneFillIds[k] = []; zoneLineIds[k] = [];
    polys(f.geometry).forEach((p, i) => {
      const id = `${k}:${i}`;
      zoneFillIds[k].push(id);
      fillInstances.push(new C.GeometryInstance({
        id,
        geometry: new C.PolygonGeometry({
          polygonHierarchy: new C.PolygonHierarchy(C.Cartesian3.fromDegreesArray(p[0].flat()),
            p.slice(1).map(h => new C.PolygonHierarchy(C.Cartesian3.fromDegreesArray(h.flat())))),
          height: H_FILL, vertexFormat: C.PerInstanceColorAppearance.FLAT_VERTEX_FORMAT,
        }),
        attributes: { color: C.ColorGeometryInstanceAttribute.fromColor(C.Color.TRANSPARENT) },
      }));
      p.forEach((ring, j) => {
        const lid = `${id}:${j}`;
        zoneLineIds[k].push(lid);
        lineInstances.push(new C.GeometryInstance({
          id: lid,
          geometry: new C.PolylineGeometry({ positions: pos(ring, H_LINE + 50), width: 1.6, arcType: C.ArcType.NONE, vertexFormat: C.PolylineColorAppearance.VERTEX_FORMAT }),
          attributes: { color: C.ColorGeometryInstanceAttribute.fromColor(WHITE.withAlpha(0.35)) },
        }));
      });
    });
  }
  const zoneFill = P.add(new C.Primitive({ geometryInstances: fillInstances, appearance: new C.PerInstanceColorAppearance({ flat: true, translucent: true }), asynchronous: false }));
  const zoneLines = P.add(new C.Primitive({ geometryInstances: lineInstances, appearance: new C.PolylineColorAppearance({ translucent: true }), asynchronous: false }));

  // Glowing outline for the selected zone (rebuilt on selection).
  const glowCollection = P.add(new C.PrimitiveCollection());
  function setGlow(k) {
    glowCollection.removeAll();
    if (!k) return;
    const f = zonesGeo.features.find(z => z.properties.zone === k);
    glowCollection.add(linePrimitive({ features: [f] }, { width: 10, material: glowMat(GOLD, 0.2) }));
  }

  const ZSTYLE = {
    idle:     { fill: GOLD.withAlpha(0.035), line: WHITE.withAlpha(0.30) },
    hover:    { fill: GOLD.withAlpha(0.16),  line: GOLD.withAlpha(0.85) },
    selected: { fill: GOLD.withAlpha(0.20),  line: GOLD.withAlpha(1) },
    linked:   { fill: RIVER.withAlpha(0.20), line: RIVER.withAlpha(1) },
    dim:      { fill: C.Color.TRANSPARENT,   line: WHITE.withAlpha(0.16) },
  };
  let zoneState = Object.fromEntries(zoneKeys.map(k => [k, 'idle']));
  let zonesDirty = true;
  function applyZoneState() {
    if (!zonesDirty || !zoneFill.ready || !zoneLines.ready) return;
    zonesDirty = false;
    for (const k of zoneKeys) {
      const s = ZSTYLE[zoneState[k]] || ZSTYLE.idle;
      for (const id of zoneFillIds[k]) {
        const a = zoneFill.getGeometryInstanceAttributes(id);
        a.color = C.ColorGeometryInstanceAttribute.toValue(s.fill.withAlpha(s.fill.alpha * overlay), a.color);
      }
      for (const id of zoneLineIds[k]) {
        const a = zoneLines.getGeometryInstanceAttributes(id);
        a.color = C.ColorGeometryInstanceAttribute.toValue(s.line.withAlpha(s.line.alpha * overlay), a.color);
      }
    }
  }

  // ---------- layers + altitude fade ----------
  const layers = {
    zones: true, rivers: true, catchments: true, borders: true, mask: true, labels: true, assets: false, lighting: true,
    flow: true, dataflow: false, sats: false, weather: false, coverage: false,
  };
  const ticks = new Set();
  const t0 = performance.now();
  let near = 1;
  let overlay = 0;          // 0..1 master fade for overlays (intro reveal)
  let overlayTarget = 0;
  const setMat = (prim, base, k) => {
    const u = prim.appearance.material.uniforms;
    u.color = C.Color.clone(u.color, u.color); u.color.alpha = base * k;
  };

  scene.preRender.addEventListener(() => {
    overlay += (overlayTarget - overlay) * 0.06;
    if (Math.abs(overlayTarget - overlay) < 0.002) overlay = overlayTarget;
    const h = camera.positionCartographic.height;
    // Detail layers fade out as you climb into space; outline stays.
    near = C.Math.clamp((14_000_000 - h) / 7_000_000, 0, 1);
    const secs = (performance.now() - t0) / 1000;
    tickFlows(secs);
    for (const f of ticks) f(secs, { overlay, near, h });
    const o = overlay;
    catchments.show = layers.catchments && o * near > 0.01;
    borders.show = layers.borders && o * near > 0.01;
    mask.show = layers.mask && o * near > 0.01;
    if (catchments.ready) setMat(catchments, 0.13, o * near * C.Math.clamp((6_000_000 - h) / 3_000_000, 0.25, 1));
    if (borders.ready) setMat(borders, 0.42, o * near);
    if (mask.ready) setMat(mask, 0.5, o * near);
    for (const r of rivers) { r.p.show = layers.rivers && o > 0.01; if (r.p.ready) setMat(r.p, r.base, o * (0.35 + 0.65 * near)); }
    if (basinGlow.ready) setMat(basinGlow, 0.8, Math.max(o, 0.0));
    if (basinLine.ready) setMat(basinLine, 1, Math.max(o, 0.0));
    zoneFill.show = zoneLines.show = layers.zones && o > 0.01;
    glowCollection.show = o > 0.01;
    if (overlay !== overlayTarget) zonesDirty = true;
    applyZoneState();
    g.enableLighting = layers.lighting;
  });

  // ---------- camera ----------
  const DEG = C.Math.toRadians;
  function sphereFor([w, s, e, n]) {
    return C.BoundingSphere.fromRectangle3D(C.Rectangle.fromDegrees(w, s, e, n), C.Ellipsoid.WGS84, 0);
  }
  // Frame a lon/lat box at an oblique angle. On wide screens `shift` nudges the target left to clear the
  // side panel; on phones the panel is a bottom sheet, so the target is nudged up and framed wider instead.
  function flyToBox(box, { pitch = -58, heading = 0, scale = 2.25, duration = 2.4, shift = 0.22, complete } = {}) {
    const [w, s, e, n] = box;
    const phone = scene.canvas.clientWidth < PHONE_WIDTH;
    const sphere = phone
      ? sphereFor([w, s - (n - s) * 1.7, e, n])
      : sphereFor([w, s - (n - s) * 0.08, e + (e - w) * shift, n]);
    if (phone) scale *= 1.15;
    camera.flyToBoundingSphere(sphere, {
      offset: new C.HeadingPitchRange(DEG(heading), DEG(pitch), Math.max(sphere.radius * scale, 450_000)),
      duration, easingFunction: C.EasingFunction.QUADRATIC_IN_OUT, complete,
    });
  }
  const flyHome = (opts = {}) => flyToBox(BASIN.bbox, { pitch: -64, scale: 2.55, shift: 0.1, ...opts });
  const flyToZone = (k, opts = {}) => flyToBox(ZONE_PROPS[k].bbox, { scale: k === 'mouth' ? 3.2 : 2.6, shift: 0.12, ...opts });

  // Pull back to orbit height over the basin (Space Segment view).
  function flySpace(opts = {}) {
    camera.flyTo({
      destination: C.Cartesian3.fromDegrees(29, -4, 17_000_000),
      orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
      duration: 2.8, easingFunction: C.EasingFunction.QUADRATIC_IN_OUT, ...opts,
    });
  }

  // Jump (or fly) to the title-card view.
  function introView({ animate = false, complete } = {}) {
    const destination = C.Cartesian3.fromDegrees(INTRO_VIEW.lon, INTRO_VIEW.lat, INTRO_VIEW.height);
    const orientation = { heading: 0, pitch: -Math.PI / 2, roll: 0 };
    if (animate) camera.flyTo({ destination, orientation, duration: 2.4, complete });
    else camera.setView({ destination, orientation });
  }
  let spinning = false;
  scene.preRender.addEventListener(() => { if (spinning) camera.rotate(C.Cartesian3.UNIT_Z, -0.0009); });
  const spin = on => { spinning = on; };

  // Space -> Africa -> basin, then reveal overlays.
  function flyIntro(done) {
    spin(false);
    camera.flyTo({
      destination: C.Cartesian3.fromDegrees(21, -2, 13_500_000),
      orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
      duration: 2.6, easingFunction: C.EasingFunction.QUADRATIC_IN_OUT,
      complete: () => {
        overlayTarget = 1;
        flyHome({ duration: 3.2, complete: done });
      },
    });
  }

  // ---------- picking ----------
  function lonLatAt(screen) {
    const ray = camera.getPickRay(screen);
    const cart = ray && g.pick(ray, scene);
    if (!cart) return null;
    const c = C.Cartographic.fromCartesian(cart);
    return [C.Math.toDegrees(c.longitude), C.Math.toDegrees(c.latitude)];
  }
  function zoneAt(screen) {
    const ll = lonLatAt(screen);
    if (!ll) return null;
    const f = zonesGeo.features.find(z => inGeom(z.geometry, ll[0], ll[1]));
    return f ? f.properties.zone : null;
  }
  const inBasin = ll => ll && inGeom(basinGeo.features[0].geometry, ll[0], ll[1]);

  // ---------- HTML markers pinned to the globe ----------
  const markers = new Set();
  const scratch = new C.Cartesian2();
  function addMarker(el, lon, lat, h = 0, { maxAlt = Infinity } = {}) {
    const m = { el, p: C.Cartesian3.fromDegrees(lon, lat, h), maxAlt, on: true, shown: null };
    markers.add(m);
    return {
      set on(v) { m.on = v; },
      get on() { return m.on; },
      setPos(lon2, lat2, h2 = 0) { C.Cartesian3.fromDegrees(lon2, lat2, h2, undefined, m.p); },
      setCartesian(c) { C.Cartesian3.clone(c, m.p); },
      remove() { markers.delete(m); el.remove(); },
    };
  }
  scene.postRender.addEventListener(() => {
    const occ = new C.EllipsoidalOccluder(C.Ellipsoid.WGS84, camera.positionWC);
    const h = camera.positionCartographic.height;
    for (const m of markers) {
      let vis = m.on && overlay > 0.5 && h < m.maxAlt && occ.isPointVisible(m.p);
      const w = vis && C.SceneTransforms.worldToWindowCoordinates(scene, m.p, scratch);
      if (!w) vis = false;
      if (vis) m.el.style.transform = `translate3d(${w.x.toFixed(1)}px, ${w.y.toFixed(1)}px, 0)`;
      if (vis !== m.shown) { m.el.classList.toggle('is-hidden', !vis); m.shown = vis; }
    }
  });

  // Satellite "sensing beams" from orbit to ground.
  function addBeam(from, to) {
    return viewer.entities.add({
      show: false,
      polyline: {
        positions: [C.Cartesian3.fromDegrees(...from), C.Cartesian3.fromDegrees(...to)],
        width: 1.5, arcType: C.ArcType.NONE,
        material: new C.PolylineDashMaterialProperty({ color: RIVER.withAlpha(0.8), dashLength: 8 }),
      },
    });
  }

  return {
    viewer, scene, camera, layers,
    flyHome, flyToZone, flyIntro, flySpace, flyToBox, introView, spin,
    onTick: f => ticks.add(f),
    setOverlays: on => { overlayTarget = on ? 1 : 0; },
    setZoneStates(map) { zoneState = { ...Object.fromEntries(zoneKeys.map(k => [k, 'idle'])), ...map }; zonesDirty = true; },
    setGlow,
    zoneAt, lonLatAt, inBasin, addMarker, addBeam,
    addOnlineImagery, probeImagery, get onlineImagery() { return !!esri; },
  };
}
