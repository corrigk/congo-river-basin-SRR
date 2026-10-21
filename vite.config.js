import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { serviceWorker } from './scripts/sw-plugin.mjs';

const cesium = 'node_modules/cesium/Build/Cesium';

// Only the Cesium files the globe actually requests (recorded across every scenario step):
// all workers, the bundled Natural Earth II basemap (offline imagery), terrain heights, the one
// IAU2006 XYS file for the globe's frozen clock date (2026-03-20, see src/globe.js) and the credit logo.
// Sky box, moon, ThirdParty decoders and Widgets images are not used.
const CESIUM_FILES = [
  'Workers/*',
  'Assets/approximateTerrainHeights.json',
  'Assets/IAU2006_XYS/IAU2006_XYS_18.json',
  'Assets/Images/ion-credit.png',
  'Assets/Textures/NaturalEarthII',
];

export default defineConfig({
  base: './',
  plugins: [
    viteStaticCopy({
      targets: CESIUM_FILES.map(f => ({ src: `${cesium}/${f}`, dest: 'cesium', rename: { stripBase: 4 } })),
    }),
    serviceWorker(),
  ],
  build: { target: 'es2022', chunkSizeWarningLimit: 6000 },
  server: { port: 5173 },
});
