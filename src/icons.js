const svg = (body, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;

export const ASSET_ICON = {
  satellite: svg('<g transform="rotate(-40 12 11)"><rect x="9.6" y="8" width="4.8" height="6" rx="1"/><rect x="2.5" y="9" width="5.4" height="4" rx=".5"/><rect x="16.1" y="9" width="5.4" height="4" rx=".5"/><path d="M7.9 11h1.7M14.4 11h1.7M12 14v2.2"/></g><path d="M5.2 16.5a3.4 3.4 0 0 0 3 3M3.4 16.3a5.6 5.6 0 0 0 5 5"/>'),
  uav: svg('<path d="M12 2.8c.8 0 1.3.7 1.3 1.6V9l7.2 4.1v1.9l-7.2-2.1v4.3l2.3 1.6v1.5L12 19.4l-3.6.9v-1.5l2.3-1.6v-4.3l-7.2 2.1v-1.9L10.7 9V4.4c0-.9.5-1.6 1.3-1.6z"/>'),
  ground: svg('<path d="M12 10.5V21M8 21h8M9.2 21 12 10.5 14.8 21"/><circle cx="12" cy="8.3" r="1.5"/><path d="M8.7 5a4.8 4.8 0 0 0 0 6.6M15.3 5a4.8 4.8 0 0 1 0 6.6M6.2 2.8a8.2 8.2 0 0 0 0 11M17.8 2.8a8.2 8.2 0 0 1 0 11"/>'),
  water: svg('<path d="M2.5 15.2c1.9 0 1.9-1.4 3.8-1.4s1.9 1.4 3.8 1.4 1.9-1.4 3.8-1.4 1.9 1.4 3.8 1.4 1.9-1.4 3.8-1.4M2.5 19.6c1.9 0 1.9-1.4 3.8-1.4s1.9 1.4 3.8 1.4 1.9-1.4 3.8-1.4 1.9 1.4 3.8 1.4 1.9-1.4 3.8-1.4"/><path d="M10 11.2V6.4L12 3l2 3.4v4.8M9 11.2h6"/>'),
  community: svg('<circle cx="9" cy="8" r="3"/><path d="M3.5 20c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5"/><circle cx="17" cy="9" r="2.3"/><path d="M15.6 14.8c.5-.2 1-.3 1.6-.3 2.4 0 3.8 1.9 3.8 4.5"/>'),
  government: svg('<path d="M3 9.2 12 4l9 5.2M5 9.8v7.6M9.7 9.8v7.6M14.3 9.8v7.6M19 9.8v7.6M3.5 20h17M4.5 17.6h15"/>'),
};

export const ICON = {
  prev: svg('<path d="m15 18-6-6 6-6"/>'),
  next: svg('<path d="m9 18 6-6-6-6"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  home: svg('<path d="M3.5 11 12 4l8.5 7M6 9.5V20h12V9.5"/>'),
  layers: svg('<path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/>'),
  expand: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6M12 17.2h.01"/>'),
  play: svg('<path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none"/>'),
  loop: svg('<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4.5v4h-4"/>'),
  arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9S14.5 18.4 12 21c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z"/>'),
  pause: svg('<path d="M8 5v14M16 5v14" stroke-width="3"/>'),
  orbit: svg('<ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(-25 12 12)"/><circle cx="12" cy="12" r="3.2"/><circle cx="20" cy="8.3" r="1.4" fill="currentColor"/>'),
  cloud: svg('<path d="M7 17.5h10.2a3.8 3.8 0 0 0 .5-7.6 5.5 5.5 0 0 0-10.6 1.3A3.2 3.2 0 0 0 7 17.5z"/><path d="M9 20.5l-.7 1.5M13 20.5l-.7 1.5M17 20.5l-.7 1.5"/>'),
  wave: svg('<path d="M3 8c2.2 0 2.2-2 4.5-2S9.7 8 12 8s2.2-2 4.5-2S18.8 8 21 8M3 13c2.2 0 2.2-2 4.5-2s2.2 2 4.5 2 2.2-2 4.5-2 2.3 2 4.5 2M3 18c2.2 0 2.2-2 4.5-2s2.2 2 4.5 2 2.2-2 4.5-2 2.3 2 4.5 2"/>'),
  gap: svg('<circle cx="12" cy="12" r="8.5" stroke-dasharray="3 3"/><circle cx="12" cy="12" r="3.5"/>'),
  flow: svg('<circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><path d="M7 12h3M14 12h3"/>'),
  // S-3 additions
  radio: svg('<rect x="3.5" y="9" width="17" height="11" rx="2"/><path d="m7 9 9-5"/><circle cx="15.5" cy="14.5" r="2.6"/><path d="M7 13h3M7 16h3"/>'),
  dish: svg('<path d="M5 6.5a9 9 0 0 0 12.5 12.5z"/><path d="m11.2 12.8 4.3-4.3M15.5 8.5l1.2-1.2"/><circle cx="17.3" cy="6.7" r="1.1"/><path d="M9 18.5 6.5 21h8"/>'),
  alert: svg('<path d="M12 3.5 21.5 20h-19z"/><path d="M12 10v4.5M12 17.2h.01"/>'),
  towerOff: svg('<path d="M12 10.5V21M8 21h8M9.2 21 12 10.5 14.8 21"/><circle cx="12" cy="8.3" r="1.5"/><path d="M4 4l16 16"/>'),
  field: svg('<circle cx="6" cy="7" r="1.6"/><circle cx="15" cy="5.5" r="1.6"/><circle cx="10" cy="12" r="1.6"/><circle cx="18.5" cy="12.5" r="1.6"/><circle cx="5.5" cy="17" r="1.6"/><circle cx="13.5" cy="18.5" r="1.6"/>'),
  hex: svg('<path d="M12 2.8 20 7.4v9.2l-8 4.6-8-4.6V7.4z"/>'),
  wifi: svg('<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.3a9.5 9.5 0 0 1 13 0M8.6 15.5a5 5 0 0 1 6.8 0"/><path d="M12 19h.01" stroke-width="2.4"/>'),
  present: svg('<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 16v4M8 20h8"/>'),
  reset: svg('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4.5v4h4"/>'),
};

export const MARK = `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14.5" fill="none" style="stroke:var(--gold)" stroke-width="1.4"/><path d="M7 20.5c3-1 3.6-5.2 7-6.2s4.8 2.4 7.6 1.3c2-.8 2.6-3.1 3.4-4.6" fill="none" style="stroke:var(--river)" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="16" r="2" style="fill:var(--gold)"/></svg>`;
