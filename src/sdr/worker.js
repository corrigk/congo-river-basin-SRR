// Heavy SDR runs off the main thread: the design-space search and the Monte Carlo.
import D from '../s3/v2/data/core.json';
import { optimize } from './optimize.js';
import { monteCarlo } from './sensitivity.js';

onmessage = async e => {
  const { id, kind, design, year, opts } = e.data; // year: that year's stations file, sent by the page
  try {
    const ctx = { D, Y: { [design.year]: year } };
    const progress = p => postMessage({ id, progress: p });
    if (kind === 'opt') {
      const res = optimize(ctx, design, { ...opts, onProgress: progress });
      postMessage({ id, result: { cloud: res.cloud, evaluated: res.evaluated, best: Object.fromEntries(Object.entries(res.best).map(([k, v]) => [k, { point: v.point, value: v.value }])) } });
    } else if (kind === 'mc') {
      postMessage({ id, result: monteCarlo(ctx, design, { ...opts, onProgress: progress }) });
    }
  } catch (err) { postMessage({ id, error: String(err?.stack || err) }); }
};
