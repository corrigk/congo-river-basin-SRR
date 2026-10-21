// Vite plugin: after the build, write dist/sw.js with two precache lists taken from the files actually emitted.
//   core  = the page, its JS/CSS, fonts (woff2) and the schematic map: cached when the service worker installs.
//   globe = the lazy globe chunk and the Cesium workers/assets: cached when the globe has loaded, or on "Preload".
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const walk = dir => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

export function serviceWorker() {
  let outDir = 'dist';
  return {
    name: 'srr-service-worker',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir; },
    closeBundle() {
      const files = walk(outDir).map(f => path.relative(outDir, f).split(path.sep).join('/'))
        // Browsers that can run a service worker all take woff2, so the .woff fallbacks are never fetched.
        .filter(f => f !== 'sw.js' && !f.endsWith('.woff') && (!f.endsWith('.html') || f === 'index.html'));
      const isGlobe = f => f.startsWith('cesium/') || /^assets\/globemap-/.test(f);
      const core = ['./', ...files.filter(f => !isGlobe(f))];
      const globe = files.filter(isGlobe);
      const hash = crypto.createHash('sha256');
      for (const f of [...core.slice(1), ...globe]) hash.update(f).update(fs.readFileSync(path.join(outDir, f)));
      const size = list => list.reduce((s, f) => s + (f === './' ? 0 : fs.statSync(path.join(outDir, f)).size), 0);
      const template = fs.readFileSync(new URL('./sw-template.js', import.meta.url), 'utf8');
      fs.writeFileSync(path.join(outDir, 'sw.js'), template
        .replace('__VERSION__', hash.digest('hex').slice(0, 12))
        .replace('__CORE__', JSON.stringify(core))
        .replace('__GLOBE__', JSON.stringify(globe)));
      const mb = n => `${(n / 1048576).toFixed(2)} MB`;
      console.log(`sw.js: core ${core.length} files (${mb(size(core))}), globe ${globe.length} files (${mb(size(globe))})`);
    },
  };
}
