// Ground view for the Scenario tab (Three.js, lazy-loaded): an illustrative eye-level scene on an Ubangi
// riverbank. Same API as the other maps: render(view) maps the step's nodes onto scene objects (gauge under the
// canopy, ranger station, village receiver, radio tower, satellite, partner assets) and draws its links as beams.
// The satellite toggle shows the open orbit trade instead of deciding it: a pass overhead (LEO/MEO, terminals
// wait between passes) or fixed in the sky (GEO). Not to scale; time is compressed.
import * as THREE from 'three';
import { token } from '../theme.js';
import { esc } from './views.js';

const CAM = new THREE.Vector3(0, 1.8, 6);
const LOOK = new THREE.Vector3(0, 8.7, -60); // ~6° up: riverbank low in frame, satellite sky above
const SKY_R = 600;                    // satellite / sky-object distance from the camera (m, illustrative)
const PASS = { period: 32, visible: 24 }; // seconds per pass cycle (time compressed)
const LINK_TOKEN = { up: 'data', down: 'alert', two: 'river', cue: 'precip', relay: 'precip' };

// Which scene object stands in for each scenario node.
function anchorFor(n) {
  if (n.kind === 'sensor' || n.kind === 'field') return 'gauge';
  if (n.kind === 'space') return 'sat';
  if (n.kind === 'receiver') return 'receiver';
  if (n.kind === 'responder') return 'ranger';
  if (n.kind === 'outage') return 'tower';
  if (n.kind === 'hazard') return 'site';
  if (n.rfp === 'A-2') return 'drone';
  if (n.rfp === 'A-1') return 'haps';
  if (n.kind === 'partner') return 'east';
  return 'west'; // gateway, COP, national agency: beyond the horizon
}

// Small deterministic random numbers so the forest is the same on every load.
function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; }

export async function createGroundMap(container, { insets = () => ({ l: 0, r: 0, t: 0, b: 0 }), orbit = 'pass' } = {}) {
  container.innerHTML = `<canvas class="gv-canvas"></canvas><div class="gv-labels"></div>`;
  // The satellite toggle; the page places it in its map bar (see main.js), so it never covers the scene.
  const ui = document.createElement('div');
  ui.className = 'gv-orbit';
  ui.setAttribute('role', 'group');
  ui.setAttribute('aria-label', 'Satellite in the sky (O); orbit not selected');
  ui.innerHTML = `<span class="gv-orbit-k">Satellite</span>
    <button data-orbit="pass" aria-pressed="false">Pass overhead</button>
    <button data-orbit="fixed" aria-pressed="false">Fixed in sky</button>
    <span class="gv-orbit-note" aria-live="polite"></span>`;
  const canvas = container.querySelector('canvas');
  const labelLayer = container.querySelector('.gv-labels');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 4000);
  camera.position.copy(CAM);
  camera.lookAt(LOOK);
  const col = c => new THREE.Color(c);
  const lambert = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: col(c), flatShading: true, ...extra });

  // ---------- sky, haze, light ----------
  const HAZE = '#b9c8bf';
  scene.fog = new THREE.Fog(HAZE, 140, 1100);
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: col('#3a78a8') }, mid: { value: col('#93bdd6') }, low: { value: col(HAZE) } },
    vertexShader: 'varying vec3 p; void main(){ p = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 low; varying vec3 p;
      void main(){ float h = normalize(p).y; vec3 c = mix(low, mid, smoothstep(0.0, 0.18, h)); c = mix(c, top, smoothstep(0.18, 0.7, h)); gl_FragColor = vec4(c, 1.0); }`,
  })));
  scene.add(new THREE.HemisphereLight(col('#d8e8ff'), col('#2a3a1c'), 1.25));
  const sun = new THREE.DirectionalLight(col('#fff0d2'), 1.7);
  sun.position.set(-120, 220, 60);
  scene.add(sun);

  // ---------- ground and river ----------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), lambert('#203b1c'));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const clearing = new THREE.Mesh(new THREE.CircleGeometry(30, 40), lambert('#58663a'));
  clearing.rotation.x = -Math.PI / 2; clearing.position.set(-2, 0.02, -22);
  scene.add(clearing);
  const farClearing = clearing.clone(); farClearing.scale.setScalar(0.6); farClearing.position.set(-8, 0.02, -76);
  scene.add(farClearing);
  const river = new THREE.Mesh(new THREE.PlaneGeometry(4000, 24), new THREE.MeshLambertMaterial({ color: col('#3f7c8f'), emissive: col('#173843') }));
  river.rotation.x = -Math.PI / 2; river.position.set(0, 0.05, -52);
  scene.add(river);

  // ---------- rainforest (instanced trunks and crowns) ----------
  const rand = rng(7);
  const trees = [];
  const addTree = (x, z, h) => trees.push({ x, z, h, r: h * (0.22 + rand() * 0.12) });
  for (let i = 0; i < 900; i++) {                      // far bank, back to the horizon
    const x = -420 + rand() * 840, z = -68 - rand() * 380;
    if (x > -30 && x < 8 && z > -90) continue;          // village clearing
    addTree(x, z, 22 + rand() * 16 + (rand() < 0.08 ? 10 : 0));
  }
  for (let i = 0; i < 160; i++) {                      // our bank, either side of the clearing
    const side = rand() < 0.5 ? -1 : 1, x = side * (42 + rand() * 160), z = -4 - rand() * 34;
    addTree(x, z, 20 + rand() * 18);
  }
  addTree(15, -34, 34); trees.at(-1).r = 11;           // the tree over the gauge: canopy the uplink must get through
  addTree(24, -24, 30);
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.6, 1, 6); trunkGeo.translate(0, 0.5, 0);
  const crownGeo = new THREE.IcosahedronGeometry(1, 1);
  const trunks = new THREE.InstancedMesh(trunkGeo, lambert('#4a3a28'), trees.length);
  const crowns = new THREE.InstancedMesh(crownGeo, lambert('#ffffff'), trees.length * 2);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const greens = ['#1f4d22', '#2b5e2a', '#3a6b2c', '#24552f', '#4a7a33'].map(col);
  trees.forEach((t, i) => {
    trunks.setMatrixAt(i, m.compose(p.set(t.x, 0, t.z), q.identity(), s.set(t.h * 0.03, t.h * 0.8, t.h * 0.03)));
    for (let k = 0; k < 2; k++) {
      const j = i * 2 + k;
      crowns.setMatrixAt(j, m.compose(p.set(t.x + (k ? t.r * 0.35 : 0), t.h * (0.82 + k * 0.1), t.z + (k ? -t.r * 0.2 : 0)),
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6), s.set(t.r * (k ? 0.7 : 1), t.r * 0.55, t.r * (k ? 0.7 : 1))));
      crowns.setColorAt(j, greens[Math.floor(rand() * greens.length)]);
    }
  });
  scene.add(trunks, crowns);

  // ---------- scene objects ----------
  const group = (x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); scene.add(g); return g; };
  const add = (g, geo, mat, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); g.add(o); return o; };
  const light = (g, c, x, y, z, r = 0.35) => add(g, new THREE.SphereGeometry(r, 12, 8), new THREE.MeshBasicMaterial({ color: col(c), fog: false }), x, y, z);

  // Ranger station with its two-way terminal mast.
  const ranger = group(-11, 0, -30);
  add(ranger, new THREE.BoxGeometry(7, 3.2, 5), lambert('#8b6a47'), 0, 1.6, 0);
  const roof = add(ranger, new THREE.ConeGeometry(5.6, 2.4, 4), lambert('#5b3b25'), 0, 4.4, 0); roof.rotation.y = Math.PI / 4;
  add(ranger, new THREE.BoxGeometry(1.2, 2.1, 0.1), lambert('#3a2618'), 1.4, 1.05, 2.55);
  add(ranger, new THREE.CylinderGeometry(0.08, 0.1, 7, 6), lambert('#c8c8c8'), 3, 3.5, -1.5);
  const dish = add(ranger, new THREE.CylinderGeometry(0.7, 0.1, 0.35, 12), lambert('#e8e8e0'), 3, 7.1, -1.5); dish.rotation.x = -0.6;
  const rangerLight = light(ranger, '#7CF5CF', 3, 7.6, -1.5, 0.22);

  // River gauge under the overhanging crown: post, logger box, solar panel, status light.
  const gauge = group(11, 0, -38.5);
  add(gauge, new THREE.CylinderGeometry(0.09, 0.09, 3, 6), lambert('#c8c8c8'), 0, 1.5, 0);
  add(gauge, new THREE.BoxGeometry(0.7, 0.8, 0.4), lambert('#e6e2d4'), 0, 2.1, 0.25);
  const panel = add(gauge, new THREE.BoxGeometry(1.0, 0.05, 0.7), lambert('#203a60'), 0, 3.05, 0); panel.rotation.x = 0.5;
  add(gauge, new THREE.BoxGeometry(0.15, 2.5, 0.15), lambert('#d9c94a'), 0.6, 0.6, -1.4); // staff gauge in the water
  const gaugeLight = light(gauge, '#7CF5CF', 0, 2.65, 0.3, 0.16);

  // Far-bank village with the community receiver (fixed antenna, loudspeaker).
  const village = group(-8, 0, -74);
  [[-9, -6], [-3, -9], [6, -7], [-12, 1]].forEach(([x, z]) => {
    add(village, new THREE.CylinderGeometry(2.2, 2.4, 2.4, 10), lambert('#a07d55'), x, 1.2, z);
    add(village, new THREE.ConeGeometry(3.1, 2.4, 10), lambert('#c4a36a'), x, 3.6, z);
  });
  add(village, new THREE.CylinderGeometry(0.1, 0.12, 5, 6), lambert('#c8c8c8'), 0, 2.5, 0);
  add(village, new THREE.BoxGeometry(0.8, 0.9, 0.5), lambert('#e6e2d4'), 0, 3.8, 0.3);
  const horn = add(village, new THREE.ConeGeometry(0.45, 0.9, 12, 1, true), lambert('#d8d0b0', { side: THREE.DoubleSide }), 0.6, 4.6, 0.6);
  horn.rotation.z = -Math.PI / 2;
  const receiverLight = light(village, '#E6C98F', 0, 4.5, 0.6, 0.2);
  const rings = [0, 1, 2].map(() => {
    const r = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 40), new THREE.MeshBasicMaterial({ color: col(token('alert')), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    r.position.set(1.4, 4.6, 0.6); village.add(r); r.visible = false; return r;
  });

  // Distant radio tower above the canopy (lattice, aircraft light). Falls over in degraded operations.
  const tower = group(62, 0, -330);
  const towerBody = new THREE.Group(); tower.add(towerBody);
  const TH = 96;
  // At this distance a true lattice is thinner than a pixel, so draw a tapered mast in aviation red and white.
  const bands = 8;
  for (let i = 0; i < bands; i++) {
    const y0 = (i / bands) * TH, h = TH / bands, r0 = 2.6 * (1 - y0 / TH) + 0.5, r1 = 2.6 * (1 - (y0 + h) / TH) + 0.5;
    add(towerBody, new THREE.CylinderGeometry(r1, r0, h, 4), lambert(i % 2 ? '#e8e4dc' : '#c8402c', { fog: false }), 0, y0 + h / 2, 0);
  }
  add(towerBody, new THREE.BoxGeometry(5, 0.6, 5), lambert('#d8d8d8', { fog: false }), 0, TH * 0.8, 0);
  const towerLight = light(towerBody, '#ff3b2f', 0, TH + 1.5, 0, 2);

  // Smoke over the incursion site (scenario D), the A-2 drone, and A-1's stratospheric platform.
  const site = group(-62, 0, -260);
  const puffs = [0, 1, 2, 3, 4, 5].map(i => add(site, new THREE.SphereGeometry(8 + i * 2, 10, 8),
    new THREE.MeshLambertMaterial({ color: col('#6f6a63'), transparent: true, opacity: 0.7, depthWrite: false, fog: false }), 0, 30 + i * 8, 0));
  site.visible = false;
  const drone = group(7, 12, -44);
  add(drone, new THREE.BoxGeometry(1.4, 0.4, 1.4), lambert('#2a2d33'));
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) add(drone, new THREE.CylinderGeometry(0.6, 0.6, 0.05, 16), new THREE.MeshBasicMaterial({ color: col('#aab4c4'), transparent: true, opacity: 0.5 }), x, 0.3, z);
  light(drone, '#A9B8FF', 0, -0.3, 0, 0.18);
  drone.visible = false;
  const haps = group(0, 0, 0);
  const hull = add(haps, new THREE.SphereGeometry(1, 20, 12), lambert('#f4f5f6', { fog: false, emissive: col('#3a3d42') })); hull.scale.set(30, 7, 7);
  haps.visible = false;

  // The satellite: generic bus and solar wings, with a glow so it reads against the sky at distance.
  const sat = group(0, 0, 0);
  add(sat, new THREE.BoxGeometry(4, 4, 6), lambert('#d8b46a'));
  for (const side of [-1, 1]) add(sat, new THREE.BoxGeometry(14, 0.3, 4.5), lambert('#2a4a8a', { emissive: col('#0d1d3a') }), side * 9.5, 0, 0);
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.3, 'rgba(230,201,143,.6)'); gr.addColorStop(1, 'rgba(230,201,143,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const satGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  satGlow.scale.setScalar(70); sat.add(satGlow);

  // Positions in the sky as azimuth / elevation from the camera (0 az = straight ahead).
  const skyPoint = (azDeg, elDeg, r = SKY_R) => {
    const az = THREE.MathUtils.degToRad(azDeg), el = THREE.MathUtils.degToRad(elDeg);
    return CAM.clone().add(new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(r));
  };
  const HORIZON = { west: skyPoint(-19, 3, 700), east: skyPoint(19, 3, 700) };
  haps.position.copy(skyPoint(-12, 13, 650));

  // ---------- beams (links): a unit cylinder stretched between two points, pulses drawn in the shader ----------
  const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
  const beamMat = (c, two) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { t: { value: 0 }, color: { value: col(c) }, two: { value: two ? 1 : 0 }, a: { value: 0 } },
    // Keep the beam a few pixels wide at any distance: the radius grows with distance from the camera.
    vertexShader: `varying float v;
      void main(){ v = uv.y;
        vec4 axis = modelMatrix * vec4(0.0, position.y, 0.0, 1.0);
        float d = distance(cameraPosition, axis.xyz);
        vec3 w = axis.xyz + mat3(modelMatrix) * vec3(position.x, 0.0, position.z) * d * 0.0022;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0); }`,
    fragmentShader: `uniform float t; uniform vec3 color; uniform float two; uniform float a; varying float v;
      float pulse(float x){ x = fract(x); return smoothstep(0.62, 0.96, x) * (1.0 - smoothstep(0.96, 1.0, x)); }
      void main(){ float p = pulse(v * 5.0 - t * 0.9);
        if (two > 0.5) p = max(p, 0.85 * pulse(1.0 - v * 5.0 - t * 0.9 + 0.5));
        gl_FragColor = vec4(color, a * (0.28 + 0.95 * p)); }`,
  });
  let beams = [];
  const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
  function placeBeam(b, from, to) {
    dir.subVectors(to, from);
    const len = dir.length();
    b.mesh.position.copy(from).addScaledVector(dir, 0.5);
    b.mesh.quaternion.setFromUnitVectors(up, dir.normalize());
    b.mesh.scale.set(1, len, 1);
  }

  // ---------- labels (HTML, projected each frame) ----------
  let labels = [];
  const anchorPos = {
    gauge: () => gauge.localToWorld(new THREE.Vector3(0, 3.2, 0)),
    ranger: () => ranger.localToWorld(new THREE.Vector3(3, 7.6, -1.5)),
    receiver: () => village.localToWorld(new THREE.Vector3(0, 5.2, 0.6)),
    tower: () => towerBody.localToWorld(new THREE.Vector3(0, TH + 2, 0)),
    site: () => site.localToWorld(new THREE.Vector3(0, 60, 0)),
    drone: () => drone.position.clone(),
    haps: () => haps.position.clone(),
    sat: () => sat.position.clone(),
    west: () => HORIZON.west.clone(),
    east: () => HORIZON.east.clone(),
  };

  // ---------- satellite motion ----------
  let mode = orbit;
  const satState = { up: true };
  function placeSat(secs) {
    if (mode === 'fixed') { sat.position.copy(skyPoint(5, 19)); satState.up = true; }
    else {
      const k = (secs % PASS.period) / PASS.visible;                // 0..1 while the satellite is above the horizon
      satState.up = k <= 1;
      const f = Math.min(k, 1);
      sat.position.copy(skyPoint(-22 + 44 * f, -3 + 25 * Math.sin(Math.PI * f)));
    }
    sat.visible = satState.up;
    sat.lookAt(CAM);
  }
  const note = ui.querySelector('.gv-orbit-note');
  function setOrbit(m) {
    mode = m;
    for (const b of ui.querySelectorAll('[data-orbit]')) b.setAttribute('aria-pressed', b.dataset.orbit === m);
    note.textContent = `Orbit not selected · ${m === 'pass'
      ? 'LEO / MEO: satellites cross the sky; terminals wait between passes'
      : 'GEO: one satellite stays in view; no wait for a pass'} · illustrative, time compressed`;
  }
  setOrbit(mode);

  // ---------- render(view) ----------
  let view = { show: [], links: [], state: {} }, shown = new Set();
  function render(v) {
    view = v || view;
    const { nodes = {}, show = [], links = [], state = {} } = view;
    const nodeAnchor = id => anchorFor(nodes[id]);
    shown = new Set(show.map(nodeAnchor));

    // Object states.
    const stateOf = a => show.filter(id => nodeAnchor(id) === a).map(id => state[id]).find(Boolean);
    const towerDown = stateOf('tower') === 'down';
    towerBody.rotation.z = towerDown ? 0.38 : 0; // leaning, lights out
    towerLight.visible = !towerDown;
    site.visible = shown.has('site');
    drone.visible = shown.has('drone');
    haps.visible = shown.has('haps');
    gaugeLight.userData.alarm = stateOf('gauge') === 'alarm';
    receiverLight.userData.ok = stateOf('receiver') === 'ok';
    receiverLight.userData.broadcast = links.some(([a, b, k]) => k === 'down' && nodeAnchor(b) === 'receiver');

    // Beams: one per distinct anchor pair.
    for (const b of beams) { scene.remove(b.mesh); b.mesh.material.dispose(); }
    const seen = new Set();
    beams = links.map(([a, b, kind]) => [nodeAnchor(a), nodeAnchor(b), kind])
      .filter(([a, b, kind]) => a !== b && !seen.has(`${a}>${b}`) && seen.add(`${a}>${b}`))
      .map(([a, b, kind]) => {
        const mesh = new THREE.Mesh(beamGeo, beamMat(token(LINK_TOKEN[kind] || 'river'), kind === 'two'));
        mesh.frustumCulled = false;
        scene.add(mesh);
        return { a, b, mesh, alpha: 0 };
      });

    // Labels: one per anchor in view, listing the scenario nodes it stands for.
    labelLayer.innerHTML = '';
    const byAnchor = {};
    for (const id of show) (byAnchor[nodeAnchor(id)] ||= []).push(nodes[id]);
    labels = Object.entries(byAnchor).map(([a, ns]) => {
      const el = document.createElement('div');
      const names = [...new Set(ns.map(n => n.label))];
      const sub = a === 'west' || a === 'east' ? 'beyond the horizon' : ns[0].sub || '';
      el.className = `gv-label k-${ns[0].kind}${ns.some(n => n.rfp) ? ' is-partner' : ''}`;
      el.innerHTML = `<b>${names.map(esc).join(' · ')}</b><em>${esc(sub)}</em><i class="gv-wait">Waiting for a satellite pass…</i>`;
      if (ns[0].rfp) el.dataset.system = ns[0].rfp;
      labelLayer.appendChild(el);
      return { a, el };
    });
  }

  // ---------- frame loop ----------
  const clock = new THREE.Clock();
  const pv = new THREE.Vector3();
  let W = 1, H = 1, parallax = 0, parallaxTarget = 0;
  container.addEventListener('pointermove', e => { parallaxTarget = (e.clientX / innerWidth - 0.5) * 2; });
  function resize() {
    const r = container.getBoundingClientRect();
    W = Math.max(r.width, 1); H = Math.max(r.height, 1);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    // Centre the scene in the area the scenario card, panel and budget leave free.
    const ins = insets();
    const cx = (ins.l + (W - ins.r)) / 2, cy = (ins.t + (H - ins.b)) / 2;
    camera.setViewOffset(W, H, W / 2 - cx, 0, W, H);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function tick() {
    const secs = reduced ? 8 : clock.getElapsedTime();
    parallax += (parallaxTarget - parallax) * 0.03;
    camera.position.set(CAM.x + parallax * 1.2, CAM.y, CAM.z);
    camera.lookAt(LOOK);
    placeSat(secs);

    const blink = Math.sin(secs * 4) > 0;
    gaugeLight.material.color.set(gaugeLight.userData.alarm ? (blink ? '#ff4a3a' : '#5a1510') : '#7CF5CF');
    receiverLight.material.color.set(receiverLight.userData.ok ? '#7CF5CF' : receiverLight.userData.broadcast ? (blink ? '#ffd27a' : '#6a5420') : '#E6C98F');
    towerLight.material.color.set(Math.sin(secs * 2.2) > 0.3 ? '#ff3b2f' : '#401010');
    rings.forEach((r, i) => {
      const on = receiverLight.userData.broadcast && !reduced;
      r.visible = on;
      if (!on) return;
      const k = ((secs * 0.6 + i / 3) % 1);
      r.scale.setScalar(1 + k * 7); r.material.opacity = 0.7 * (1 - k);
      r.lookAt(camera.position);
    });
    if (drone.visible) drone.position.y = 12 + Math.sin(secs * 1.3) * 0.5;
    puffs.forEach((pf, i) => { pf.position.y = 30 + ((i * 8 + secs * 3) % 48); });

    // Beams to the satellite only exist while it is above the horizon; otherwise the terminal waits.
    let waiting = new Set();
    for (const b of beams) {
      const live = (b.a !== 'sat' && b.b !== 'sat') || satState.up;
      if (!live) waiting.add(b.a === 'sat' ? b.b : b.a);
      b.alpha += ((live ? 1 : 0) - b.alpha) * 0.08;
      b.mesh.visible = b.alpha > 0.02;
      b.mesh.material.uniforms.a.value = b.alpha;
      b.mesh.material.uniforms.t.value = secs;
      if (b.mesh.visible) placeBeam(b, anchorPos[b.a](), anchorPos[b.b]());
    }

    for (const { a, el } of labels) {
      const vis = (a !== 'sat' || satState.up) && (a !== 'site' || site.visible);
      pv.copy(anchorPos[a]()).project(camera);
      const on = vis && pv.z < 1 && Math.abs(pv.x) < 1.05 && Math.abs(pv.y) < 1.05;
      el.classList.toggle('is-hidden', !on);
      el.classList.toggle('is-waiting', waiting.has(a));
      if (on) el.style.transform = `translate3d(${((pv.x + 1) / 2 * W).toFixed(1)}px, ${((1 - pv.y) / 2 * H).toFixed(1)}px, 0)`;
    }
    renderer.render(scene, camera);
  }

  let paused = true;
  const pause = p => { if (p === paused) return; paused = p; renderer.setAnimationLoop(p ? null : tick); };
  resize();
  pause(false);
  return {
    kind: 'ground', render, pause, setOrbit, controls: ui,
    get orbit() { return mode; },
    refit: () => resize(),
    frame: () => tick(), // render one frame now (used when checking steps with animation frames paused)
    home() {},
  };
}
