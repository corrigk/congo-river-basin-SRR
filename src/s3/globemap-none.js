// Stand-in for the globe in the single-file offline build (vite.offline.config.js): Cesium needs its worker
// and asset files next to the page, which a lone HTML file can't provide, so that file is schematic-only.
export async function createGlobeMap() {
  throw new Error('The single-file offline build has no 3D globe.');
}
