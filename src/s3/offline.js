// Offline cache: registers the service worker (production builds only) and drives the status badge,
// which doubles as the "Preload for offline" button.
const LABEL = {
  loading: 'Loading…', partial: 'Preload for offline', ready: 'Ready offline', busy: 'Caching…',
  error: 'Preload failed · retry', none: 'No offline cache', dev: 'Offline cache: build only', file: 'Offline file',
};

export function createOffline(badge) {
  const text = badge.querySelector('span');
  const set = (state, label = LABEL[state]) => {
    badge.dataset.state = state;
    text.textContent = label;
    badge.disabled = !['partial', 'error'].includes(state);
    badge.title = state === 'ready' ? 'Everything, including the 3D globe, is cached on this computer'
      : state === 'partial' ? 'The page works offline; click to also cache the 3D globe (about 7 MB)' : label;
  };

  if (!location.protocol.startsWith('http')) { set('file'); return { preload() {} }; } // opened from disk
  if (import.meta.env.DEV) { set('dev'); return { preload() {} }; }
  if (!('serviceWorker' in navigator)) { set('none'); return { preload() {} }; }

  set('loading');
  const ready = navigator.serviceWorker.register('./sw.js').then(() => navigator.serviceWorker.ready);
  ready.catch(err => { console.warn('Service worker failed to register', err); set('none'); });

  // One request/response round trip with the worker; progress messages arrive on the same channel.
  const ask = async (type, onProgress) => {
    const reg = await ready;
    return new Promise(resolve => {
      const ch = new MessageChannel();
      ch.port1.onmessage = e => (e.data.type === 'progress' ? onProgress?.(e.data) : resolve(e.data));
      reg.active.postMessage({ type }, [ch.port2]);
    });
  };
  const show = s => set(s.globe ? 'ready' : s.core ? 'partial' : 'loading');

  let busy = false;
  async function preload() {
    if (busy) return;
    busy = true;
    set('busy', 'Caching 0%');
    try {
      const s = await ask('preload', p => set('busy', `Caching ${Math.round((100 * p.done) / Math.max(p.total, 1))}%`));
      s.globe ? show(s) : set('error');
    } catch { set('error'); }
    busy = false;
  }

  ready.then(() => ask('status')).then(show, () => {});
  return { preload };
}
