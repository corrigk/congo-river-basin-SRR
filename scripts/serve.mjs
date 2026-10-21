// Test server for the production build: serves dist/ under a GitHub Pages-style subpath, gzipped,
// optionally throttled to imitate bad Wi-Fi. Stop it to imitate "network gone".
//   node scripts/serve.mjs [--port 4180] [--base /congo-river-basin-SRR/] [--kbps 400] [--latency 400] [--block globemap]
// --block makes matching paths fail, e.g. to test that a missing globe falls back to the schematic map.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const PORT = +arg('port', 4180), BASE = arg('base', '/congo-river-basin-SRR/');
const KBPS = +arg('kbps', 0), LATENCY = +arg('latency', 0), BLOCK = arg('block', '');
const ROOT = path.resolve('dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.png': 'image/png', '.jpg': 'image/jpeg', '.xml': 'application/xml', '.wasm': 'application/wasm' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Write the body in small slices at the configured rate.
async function send(res, buf) {
  if (!KBPS) return res.end(buf);
  const slice = Math.max(512, Math.round((KBPS * 1000) / 8 / 20)); // ~20 slices per second
  for (let i = 0; i < buf.length; i += slice) {
    if (!res.write(buf.subarray(i, i + slice))) await new Promise(r => res.once('drain', r));
    await sleep(50);
  }
  res.end();
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith(BASE)) { res.writeHead(302, { Location: BASE }); return res.end(); }
  let file = path.join(ROOT, decodeURIComponent(url.pathname.slice(BASE.length)) || 'index.html');
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (LATENCY) await sleep(LATENCY);
  if (BLOCK && url.pathname.includes(BLOCK)) { res.writeHead(503); return res.end(); }
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
  let body = fs.readFileSync(file);
  const type = TYPES[path.extname(file)] || 'application/octet-stream';
  const headers = { 'Content-Type': type, 'Cache-Control': 'max-age=600' }; // what GitHub Pages sends
  if (/gzip/.test(req.headers['accept-encoding'] || '') && /text|json|xml|javascript/.test(type)) {
    body = zlib.gzipSync(body);
    headers['Content-Encoding'] = 'gzip';
  }
  headers['Content-Length'] = body.length;
  res.writeHead(200, headers);
  send(res, body);
}).listen(PORT, () => console.log(`Serving dist at http://localhost:${PORT}${BASE}${KBPS ? ` (${KBPS} kbps, +${LATENCY} ms)` : ''}`));
