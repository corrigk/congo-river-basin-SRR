// Shared visual effects: an animated "flow" polyline material and line-sampling helpers.
import { Cesium as C } from './cesium.js';

// Comet pulses travelling along the line in vertex order (st.s goes 0 → 1 along the polyline).
// NB: Cesium sets st.s = vertexIndex / (n - 1), so lines must be resampled to even spacing (see resample()).
const FLOW_GLSL = `
uniform vec4 color;
uniform float time;
uniform float repeat;
uniform float tail;
czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material m = czm_getDefaultMaterial(materialInput);
  float x = fract(materialInput.st.s * repeat - time);
  float a = smoothstep(1.0 - tail, 0.985, x) * (1.0 - smoothstep(0.985, 1.0, x));
  float core = 1.0 - abs(materialInput.st.t - 0.5) * 2.0;
  a *= smoothstep(0.0, 0.7, core);
  m.diffuse = color.rgb;
  m.emission = color.rgb * a * 0.6;
  m.alpha = color.a * a;
  return m;
}`;

const flowMats = new Set();
export function flowMaterial(color, { repeat = 1, speed = 0.5, tail = 0.35 } = {}) {
  const mat = new C.Material({
    translucent: true,
    fabric: { type: 'ConopsFlow', uniforms: { color: color.clone(), time: 0, repeat, tail }, source: FLOW_GLSL },
  });
  mat.__speed = speed;
  mat.__base = color.alpha;
  flowMats.add(mat);
  return mat;
}
export function tickFlows(seconds) {
  for (const m of flowMats) m.uniforms.time = seconds * m.__speed;
}
export function setAlpha(mat, a) {
  const c = mat.uniforms.color;
  mat.uniforms.color = new C.Color(c.red, c.green, c.blue, (mat.__base ?? 1) * a);
}

export const kmBetween = ([x1, y1], [x2, y2]) => {
  const k = Math.cos(((y1 + y2) / 2) * Math.PI / 180);
  return Math.hypot((x2 - x1) * k, y2 - y1) * 111.32;
};

// Resample a lon/lat polyline into points spaced `stepKm` apart (keeps the first and last point).
export function resample(pts, stepKm) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const d = kmBetween(a, b);
    let t = stepKm - carry;
    while (t <= d) {
      const f = t / d;
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
      t += stepKm;
    }
    carry = d - (t - stepKm);
  }
  if (out.at(-1) !== pts.at(-1)) out.push(pts.at(-1));
  return out;
}

// Cut a polyline into consecutive pieces of ~`pieceKm`, each resampled evenly (for comet animation).
export function pieces(pts, pieceKm, stepKm) {
  const even = resample(pts, stepKm);
  const n = Math.max(2, Math.round(pieceKm / stepKm));
  const res = [];
  for (let i = 0; i < even.length - 1; i += n) {
    const p = even.slice(i, i + n + 1);
    if (p.length >= Math.max(3, n * 0.35)) res.push(p);
  }
  return res;
}

// A raised great-circle arc between two lon/lat points: [Cartesian3 …], evenly spaced.
export function arc([x1, y1, h1 = 0], [x2, y2, h2 = 0], { n = 64, lift = 0.18 } = {}) {
  const g = new C.EllipsoidGeodesic(C.Cartographic.fromDegrees(x1, y1), C.Cartographic.fromDegrees(x2, y2));
  const dist = g.surfaceDistance;
  const out = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const c = g.interpolateUsingFraction(f);
    c.height = h1 + (h2 - h1) * f + Math.sin(Math.PI * f) * dist * lift;
    out.push(C.Cartographic.toCartesian(c));
  }
  return out;
}
// Stop ticking a flow material once its primitive is removed.
export function releaseFlow(mat) { flowMats.delete(mat); }
