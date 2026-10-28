// Page data for the six analysis sections (built by scripts/build-page-data.mjs from analysis/data).
// core.json ships with the sections; the map data loads the first time a map is drawn, one year at a time.
import core from './data/core.json';

export const D = core;
const loaders = import.meta.glob(['./data/geo.json', './data/grid.json', './data/pop-*.json', './data/stations-*.json', './data/hazards.json'], { import: 'default' });
const cache = new Map();
const load = name => {
  if (!cache.has(name)) cache.set(name, loaders[`./data/${name}.json`]().catch(e => { cache.delete(name); throw e; }));
  return cache.get(name);
};
export const geo = () => load('geo');
export const grid = () => load('grid');
export const pop = year => load(`pop-${year}`);
export const stations = year => load(`stations-${year}`);
export const hazards = () => load('hazards'); // ConOps "why" layers
export const peek = name => cache.get(name); // the promise, if already requested

// first_covered_b64: little-endian Uint16 per cell, the index of the first station that covers it (65535 = never).
const firstCache = new Map();
export function firstCovered(run, key) {
  if (!firstCache.has(key)) {
    const b = atob(run.first_covered_b64), u = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    firstCache.set(key, new Uint16Array(u.buffer));
  }
  return firstCache.get(key);
}

export const YEARS = [2026, 2031, 2036, 2041];
export const MODES = {
  radio: { name: 'Radio reach', short: 'Radio', color: '--s1' },
  response: { name: '1-hour response', short: '1-hour', color: '--s2' },
  speaker: { name: 'Loudspeaker', short: 'Speaker', color: '--s3' },
  mix: { name: 'Mix', short: 'Mix', color: '--s4' },
};
// Default station count: the sweet spot of the default run (mix, 2041), from the pipeline's budget.
export const DEFAULT_N = (D.budget.sweet_spots.find(s => s.run === 'mix_2041') || D.budget.sweet_spots[0]).stations;
