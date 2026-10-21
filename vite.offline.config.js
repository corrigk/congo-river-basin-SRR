// Single-file offline backup: the whole page (code, data, fonts) inlined into one HTML file that opens by
// double-click with no server or network. Schematic map only (see src/s3/globemap-none.js).
//   npm run build:offline  ->  srr-offline.html (and dist/srr-offline.html when dist exists)
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

export default defineConfig({
  base: './',
  resolve: {
    alias: [{ find: /^\.\/s3\/globemap\.js$/, replacement: fileURLToPath(new URL('./src/s3/globemap-none.js', import.meta.url)) }],
  },
  plugins: [
    viteSingleFile(),
    {
      name: 'copy-out',
      closeBundle() {
        fs.copyFileSync('dist-offline/index.html', 'srr-offline.html');
        if (fs.existsSync('dist')) fs.copyFileSync('dist-offline/index.html', 'dist/srr-offline.html');
      },
    },
  ],
  build: { target: 'es2022', outDir: 'dist-offline', emptyOutDir: true },
});
