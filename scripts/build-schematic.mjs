// Precompute the schematic map's geometry as compact SVG path strings (src/s3/schematic-geo.json),
// so the first page load ships ~tens of kB instead of the full HydroSHEDS GeoJSON.
//   node scripts/build-schematic.mjs   (run after build-data.mjs; the projection must match src/s3/schematic.js)
import fs from 'node:fs';

const K = 40, X0 = 8, Y0 = 12;           // keep in sync with schematic.js
const TOL = 0.6;                          // simplification tolerance in SVG units (40 units = 1°)
const VIEW = [4, -18, 40, 14];            // drop border lines far outside the basin (lon/lat)
const read = f => JSON.parse(fs.readFileSync(new URL(`../src/data/${f}.json`, import.meta.url)));
const px = ([lon, lat]) => [(lon - X0) * K, (Y0 - lat) * K];

function simplify(pts) {                  // Douglas–Peucker
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts.at(-1)];
  let max = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i], dx = b[0] - a[0], dy = b[1] - a[1];
    const d = Math.abs(dy * x - dx * y + b[0] * a[1] - b[1] * a[0]) / (Math.hypot(dx, dy) || 1);
    if (d > max) { max = d; idx = i; }
  }
  return max > TOL ? [...simplify(pts.slice(0, idx + 1)).slice(0, -1), ...simplify(pts.slice(idx))] : [a, b];
}
const r = n => Math.round(n);
// Absolute first point, then relative integer moves: short and exact enough at this scale.
function d(line, close = false) {
  const p = simplify(line.map(px)).map(([x, y]) => [r(x), r(y)]);
  let s = `M${p[0][0]} ${p[0][1]}`;
  for (let i = 1; i < p.length; i++) s += `l${p[i][0] - p[i - 1][0]} ${p[i][1] - p[i - 1][1]}`;
  return close ? s + 'z' : s;
}
const lines = g => (g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []);
const inView = line => line.some(([x, y]) => x > VIEW[0] && x < VIEW[2] && y > VIEW[1] && y < VIEW[3]);

const basin = read('basin').features[0];
const out = {
  bbox: basin.properties.bbox,
  basin: basin.geometry.coordinates.map(ring => d(ring, true)).join(''),
  rivers: read('rivers').features.filter(f => f.properties.c <= 2)
    .map(f => ({ c: f.properties.c, d: lines(f.geometry).map(l => d(l)).join('') })),
  borders: read('borders').features.flatMap(f => lines(f.geometry)).filter(inView).map(l => d(l)).join(''),
};
const json = JSON.stringify(out);
fs.writeFileSync(new URL('../src/s3/schematic-geo.json', import.meta.url), json);
console.log(`schematic-geo.json ${(json.length / 1024).toFixed(1)} kB`);
