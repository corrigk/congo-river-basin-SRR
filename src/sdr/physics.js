// SDR physics: the link budgets, rain fade and station power sizing behind the engine's performance numbers.
// Each function returns the budget as rows (parameter, value, unit, note) so the page can show exactly how a margin
// was reached, plus the derived numbers the engine uses:
//   uplink:   satellite capacity (kbps per satellite) and the elevation at which a sensor under canopy closes its link
//   relay:    how far a station reaches canopy sensors (two-ray ground reflection, radio horizon, foliage)
//   GEO:      alert downlink margin at a $25 receiver
//   rain:     feeder-link and backhaul availability in tropical rain (ITU-R P.838 / P.618, simplified)
//   power:    PV and battery size and cost per station from its loads
// Constants marked (estimate) are ours; the models (free-space loss, Weissberger foliage, two-ray, ITU rain) are
// standard textbook / ITU-R forms. Design-level sliders override PHYS through design.phys.

export const PHYS = {
  orbitKm: 550,
  term: { dbm: 27, gainDbi: 0, lossDb: 1, kbps: 1.2 },  // sensor radio: 0.5 W, quarter-wave whip, 1.2 kbps burst (estimate)
  polLossDb: 3, atmLossDb: 0.5,                         // linear terminal to circular satellite antenna; gases at UHF
  ebn0ReqDb: 6, marginReqDb: 3,                         // BPSK with rate-1/2 FEC incl. implementation loss; required margin
  access: 0.184,                                        // pure ALOHA peak throughput, 1/(2e): random access by unsynchronised sensors
  foliage: { layerM: 15, wet: 1.5 },                    // crown layer crossed by the path; wet tropical foliage vs Weissberger (estimate)
  relay: { freqMHz: 433, rxSensDbm: -137, rxGainDbi: 6, cableDb: 2, fadeDb: 10, sensorHm: 1.5, vegPathM: 40 },
  geo: { freqMHz: 1490, rangeKm: 36500, rxGainDbi: 4, rxTempK: 250, lossDb: 1, indoorDb: 3, audioKbps: 8, ebn0ReqDb: 3, marginReqDb: 6 },
  rain: { r001: 120, hRkm: 4.8, feederGHz: 14, feederEl: 70, feederMarginDb: 10, backhaulGHz: 12, backhaulEl: 60 },
  power: { psh: 4.5, pr: 0.75, autonomyDays: 3, invEff: 0.92, recharge: 1.3, alertHours: 1 },
};

// Design sliders (design.phys) with their ranges; anything not set takes PHYS.
export const PHYS_SLIDERS = [
  { id: 'termDbm', label: 'Sensor transmit power', unit: 'dBm', min: 20, max: 33, step: 1, get: p => p.term.dbm, set: (p, v) => { p.term.dbm = v; } },
  { id: 'termKbps', label: 'Sensor burst rate', unit: 'kbps', min: 0.3, max: 4.8, step: 0.3, get: p => p.term.kbps, set: (p, v) => { p.term.kbps = v; } },
  { id: 'layerM', label: 'Canopy crown layer', unit: 'm', min: 5, max: 30, step: 1, get: p => p.foliage.layerM, set: (p, v) => { p.foliage.layerM = v; } },
  { id: 'wet', label: 'Wet-foliage factor', unit: '×', min: 1, max: 2.5, step: 0.1, get: p => p.foliage.wet, set: (p, v) => { p.foliage.wet = v; } },
  { id: 'r001', label: 'Rain rate exceeded 0.01% of the time', unit: 'mm/h', min: 60, max: 180, step: 5, get: p => p.rain.r001, set: (p, v) => { p.rain.r001 = v; } },
  { id: 'feederMarginDb', label: 'GEO feeder fade margin', unit: 'dB', min: 3, max: 20, step: 1, get: p => p.rain.feederMarginDb, set: (p, v) => { p.rain.feederMarginDb = v; } },
  { id: 'autonomyDays', label: 'Battery autonomy', unit: 'days', min: 1, max: 6, step: 0.5, get: p => p.power.autonomyDays, set: (p, v) => { p.power.autonomyDays = v; } },
  { id: 'psh', label: 'Peak sun hours (worst month)', unit: 'h', min: 3, max: 6, step: 0.1, get: p => p.power.psh, set: (p, v) => { p.power.psh = v; } },
];

export function physFor(design, knobs = {}) {
  const p = structuredClone(PHYS), k = id => knobs[id] ?? 1;
  for (const s of PHYS_SLIDERS) if (design.phys?.[s.id] != null) s.set(p, design.phys[s.id]);
  p.foliage.wet *= k('foliage');
  p.rain.r001 *= k('rain');
  p.power.psh *= k('psh');
  p.loadScale = k('load');
  return p;
}

// ---------- geometry and propagation ----------
const RE = 6371;
const db = x => 10 * Math.log10(x);
export const slantKm = (elDeg, h) => { const e = (elDeg * Math.PI) / 180; return Math.sqrt((RE + h) ** 2 - (RE * Math.cos(e)) ** 2) - RE * Math.sin(e); };
export const fspl = (fMHz, dKm) => 32.45 + 20 * Math.log10(fMHz) + 20 * Math.log10(dKm);
// Weissberger modified exponential decay (in-leaf trees, 230 MHz-95 GHz, foliage depth up to 400 m).
export const weissberger = (fGHz, dM) => (dM <= 0 ? 0 : dM <= 14 ? 0.45 * fGHz ** 0.284 * dM : 1.33 * fGHz ** 0.284 * Math.min(dM, 400) ** 0.588);
const BOLTZ = -228.6; // dBW/K/Hz

// ---------- sensor uplink to a LEO satellite ----------
// sat: { freqMHz, gtDbK, channels, maxChKbps }
export function uplink(p, sat, elDeg, canopy) {
  const d = slantKm(elDeg, p.orbitKm), L = fspl(sat.freqMHz, d);
  const fol = canopy ? weissberger(sat.freqMHz / 1000, p.foliage.layerM / Math.sin((elDeg * Math.PI) / 180)) * p.foliage.wet : 0;
  const eirp = p.term.dbm - 30 + p.term.gainDbi - p.term.lossDb;
  const cn0 = eirp + sat.gtDbK - L - p.polLossDb - p.atmLossDb - fol - BOLTZ;
  const margin = cn0 - db(p.term.kbps * 1000) - p.ebn0ReqDb;
  return { el: elDeg, d, L, fol, eirp, cn0, margin, ok: margin >= p.marginReqDb };
}
export function uplinkBudget(p, sat) {
  const open = uplink(p, sat, 20, false), can20 = uplink(p, sat, 20, true), can45 = uplink(p, sat, 45, true);
  let closeEl = null;
  for (let e = 10; e <= 90; e += 1) if (uplink(p, sat, e, true).ok) { closeEl = e; break; }
  const canopyClass = closeEl == null || closeEl > 70 ? 'none' : closeEl <= 20 ? 'open' : closeEl <= 45 ? 'mask45' : 'high';
  // Capacity: the bit rate one channel supports at the worst open-sky elevation (20°), capped by the channel
  // bandwidth, × channels × random-access efficiency.
  const chBps = 10 ** ((open.cn0 - p.ebn0ReqDb - p.marginReqDb) / 10);
  const chKbps = Math.min(sat.maxChKbps, chBps / 1000);
  const kbpsPerSat = sat.channels * chKbps * p.access;
  const rows = [
    ['Frequency', sat.freqMHz, 'MHz', 'UHF data-collection band'],
    ['Terminal transmit power', p.term.dbm, 'dBm', `${(10 ** (p.term.dbm / 10) / 1000).toFixed(2)} W`],
    ['Terminal antenna gain − losses', p.term.gainDbi - p.term.lossDb, 'dB', 'whip antenna, cable'],
    ['Terminal EIRP', open.eirp, 'dBW', ''],
    ['Slant range at 20° / 45°', `${open.d.toFixed(0)} / ${can45.d.toFixed(0)}`, 'km', `${p.orbitKm} km orbit`],
    ['Free-space loss at 20°', -open.L, 'dB', '32.45 + 20 log f + 20 log d'],
    ['Polarization + atmosphere', -(p.polLossDb + p.atmLossDb), 'dB', ''],
    ['Satellite G/T', sat.gtDbK, 'dB/K', 'antenna gain − 10 log T_sys'],
    ['− Boltzmann', -BOLTZ, 'dB', '228.6'],
    ['C/N₀ open sky, 20°', open.cn0, 'dB-Hz', ''],
    ['Required Eb/N₀', -p.ebn0ReqDb, 'dB', 'BPSK, rate-1/2 FEC'],
    [`Burst rate ${p.term.kbps} kbps`, -db(p.term.kbps * 1000), 'dB-Hz', ''],
    ['Margin, open sky 20°', open.margin, 'dB', `need ≥ ${p.marginReqDb} dB`],
    ['Foliage loss at 20° / 45°', `${(-can20.fol).toFixed(1)} / ${(-can45.fol).toFixed(1)}`, 'dB', `Weissberger, ${p.foliage.layerM} m crown layer × ${p.foliage.wet.toFixed(1)} wet`],
    ['Margin under canopy, 20° / 45°', `${can20.margin.toFixed(1)} / ${can45.margin.toFixed(1)}`, 'dB', ''],
    ['Canopy link closes above', closeEl == null ? 'never' : closeEl, '°', canopyClass === 'open' ? 'like open sky' : canopyClass === 'mask45' ? 'uses the 45° revisit' : 'too high: canopy sensors need a relay'],
    ['Channel rate at 20° (cap)', `${chKbps.toFixed(1)} (${sat.maxChKbps})`, 'kbps', ''],
    ['× channels × ALOHA 0.184', `${sat.channels} × ${p.access}`, '', 'unsynchronised random access'],
    ['Uplink capacity per satellite', kbpsPerSat, 'kbps', 'feeds S3-02 and congestion'],
  ];
  return { id: 'uplink', name: 'Sensor uplink to LEO', rows, margin: open.margin, req: p.marginReqDb, ok: open.ok, canopyMargin: can45.margin, closeEl, canopyClass, kbpsPerSat, chKbps };
}

// ---------- station relay to canopy sensors (terrestrial UHF) ----------
// Two-ray ground reflection beyond the breakpoint: PL = 40 log d − 20 log h_t − 20 log h_r (d, h in metres),
// limited by the radio horizon 4.12 (√h_t + √h_r) km; the sensor's signal first crosses `vegPathM` of forest.
export function relayBudget(p, towerM) {
  const r = p.relay, fol = weissberger(r.freqMHz / 1000, r.vegPathM) * p.foliage.wet;
  const plMax = p.term.dbm - p.term.lossDb + r.rxGainDbi - r.cableDb - fol - (r.rxSensDbm + r.fadeDb);
  const dTwoRay = 10 ** ((plMax + 20 * Math.log10(towerM) + 20 * Math.log10(r.sensorHm)) / 40) / 1000;
  const horizon = 4.12 * (Math.sqrt(towerM) + Math.sqrt(r.sensorHm));
  const km = Math.min(dTwoRay, horizon);
  const prx = dKm => p.term.dbm - p.term.lossDb + r.rxGainDbi - r.cableDb - fol - (40 * Math.log10(dKm * 1000) - 20 * Math.log10(towerM) - 20 * Math.log10(r.sensorHm));
  const rows = [
    ['Frequency', r.freqMHz, 'MHz', 'licence-free UHF, LoRa class'],
    ['Sensor transmit power − losses', p.term.dbm - p.term.lossDb, 'dBm', ''],
    ['Tower antenna gain − cable', r.rxGainDbi - r.cableDb, 'dB', 'collinear omni'],
    [`Forest crossed near the sensor (${r.vegPathM} m)`, -fol, 'dB', 'Weissberger × wet factor'],
    ['Receiver sensitivity', r.rxSensDbm, 'dBm', 'spreading factor 12, 125 kHz (datasheet class)'],
    ['Fade margin', r.fadeDb, 'dB', 'multipath, seasonal foliage'],
    ['Allowed path loss', plMax, 'dB', ''],
    [`Two-ray reach (tower ${towerM} m, sensor ${r.sensorHm} m)`, dTwoRay, 'km', '40 log d − 20 log h_t − 20 log h_r'],
    ['Radio horizon', horizon, 'km', '4.12 (√h_t + √h_r)'],
    ['Relay reach used', km, 'km', km === horizon ? 'horizon-limited' : 'path-loss-limited'],
  ];
  return { id: 'relay', name: 'Station relay to canopy sensors', rows, km, dTwoRay, horizon, prx, plMax, margin: r.fadeDb, req: r.fadeDb, ok: true };
}

// ---------- GEO alert downlink to a community receiver ----------
export function geoBudget(p, eirpDbw) {
  const g = p.geo, L = fspl(g.freqMHz, g.rangeKm), gt = g.rxGainDbi - db(g.rxTempK);
  const cn0 = eirpDbw + gt - L - g.lossDb - g.indoorDb - BOLTZ;
  const margin = cn0 - db(g.audioKbps * 1000) - g.ebn0ReqDb;
  const rows = [
    ['Frequency', g.freqMHz, 'MHz', 'L-band broadcast'],
    ['Satellite EIRP (beam over the basin)', eirpDbw, 'dBW', 'from the GEO option'],
    ['Range', g.rangeKm, 'km', 'equatorial Africa, high elevation'],
    ['Free-space loss', -L, 'dB', ''],
    ['Receiver G/T', gt, 'dB/K', `${g.rxGainDbi} dBi patch, ${g.rxTempK} K`],
    ['Atmosphere, polarization', -g.lossDb, 'dB', ''],
    ['Thatch, wall or tree cover', -g.indoorDb, 'dB', 'receiver at a public point (estimate)'],
    ['− Boltzmann', -BOLTZ, 'dB', ''],
    ['C/N₀', cn0, 'dB-Hz', ''],
    [`Audio stream ${g.audioKbps} kbps`, -db(g.audioKbps * 1000), 'dB-Hz', 'low-rate speech codec'],
    ['Required Eb/N₀', -g.ebn0ReqDb, 'dB', 'QPSK, strong FEC + interleaving'],
    ['Margin', margin, 'dB', `need ≥ ${g.marginReqDb} dB`],
    ['Speech channels at this margin', Math.max(0, Math.floor(10 ** ((margin - g.marginReqDb) / 10))), '', 'margin traded for more languages in the same power'],
  ];
  return { id: 'geo', name: 'GEO alert downlink', rows, margin, req: g.marginReqDb, ok: margin >= g.marginReqDb, cn0 };
}

// ---------- rain (ITU-R P.838-3 coefficients, horizontal; ITU-R P.618 simplified) ----------
const KA = [[10, 0.01217, 1.2571], [12, 0.02386, 1.1825], [15, 0.04481, 1.1233], [20, 0.09164, 1.0568], [30, 0.2403, 0.9485]];
function kAlpha(f) {
  if (f <= KA[0][0]) { const [f0, k0, a0] = KA[0]; return [k0 * (f / f0) ** 4, a0]; } // steep fall-off below 10 GHz
  for (let i = 1; i < KA.length; i++) if (f <= KA[i][0]) {
    const [f0, k0, a0] = KA[i - 1], [f1, k1, a1] = KA[i], t = Math.log(f / f0) / Math.log(f1 / f0);
    return [Math.exp(Math.log(k0) + t * Math.log(k1 / k0)), a0 + t * (a1 - a0)];
  }
  return KA.at(-1).slice(1);
}
export function rainA001(p, fGHz, elDeg) {
  const [k, a] = kAlpha(fGHz), R = p.rain.r001, e = (elDeg * Math.PI) / 180;
  const gamma = k * R ** a, Ls = p.rain.hRkm / Math.sin(e), Lg = Ls * Math.cos(e), L0 = 35 * Math.exp(-0.015 * R), r = 1 / (1 + Lg / L0);
  return { gamma, Ls, r, A: gamma * Ls * r };
}
export const rainAp = (A001, pct) => A001 * 0.12 * pct ** -(0.546 + 0.043 * Math.log10(pct));
// Share of the year the link is up: the percentage of time p at which rain fade equals the margin.
export function rainAvail(A001, marginDb) {
  if (rainAp(A001, 5) >= marginDb) return 0.95;
  let lo = 0.001, hi = 5;
  if (rainAp(A001, lo) <= marginDb) return 1 - lo / 100;
  for (let i = 0; i < 50; i++) { const m = Math.sqrt(lo * hi); if (rainAp(A001, m) > marginDb) lo = m; else hi = m; }
  return 1 - hi / 100;
}
export function rainBudget(p, backhaulMarginDb) {
  const fe = rainA001(p, p.rain.feederGHz, p.rain.feederEl), bh = rainA001(p, p.rain.backhaulGHz, p.rain.backhaulEl), up = rainA001(p, 0.4, 45);
  const feederAvail = rainAvail(fe.A, p.rain.feederMarginDb), backhaulAvail = backhaulMarginDb > 0 ? rainAvail(bh.A, backhaulMarginDb) : null;
  const rows = [
    ['Rain rate exceeded 0.01% of the time', p.rain.r001, 'mm/h', 'tropical rain zone (ITU-R P.837 class, estimate)'],
    ['Rain height', p.rain.hRkm, 'km', 'equatorial'],
    [`GEO feeder uplink ${p.rain.feederGHz} GHz, ${p.rain.feederEl}° from the hub`, `${fe.gamma.toFixed(1)} dB/km × ${(fe.Ls * fe.r).toFixed(1)} km`, '', 'γ = k R^α (P.838), effective path (P.618)'],
    ['Feeder fade exceeded 0.01% / 0.1% / 1%', `${fe.A.toFixed(1)} / ${rainAp(fe.A, 0.1).toFixed(1)} / ${rainAp(fe.A, 1).toFixed(1)}`, 'dB', ''],
    ['Feeder fade margin', p.rain.feederMarginDb, 'dB', 'uplink power control'],
    ['Feeder availability in rain', `${(feederAvail * 100).toFixed(3)}`, '%', 'feeds S3-10'],
    [`Backhaul ${p.rain.backhaulGHz} GHz at ${p.rain.backhaulEl}°: fade 0.01%`, bh.A, 'dB', ''],
    ['Backhaul availability in rain', backhaulAvail == null ? 'none' : (backhaulAvail * 100).toFixed(2), '%', `at ${backhaulMarginDb} dB margin`],
    ['Sensor uplink at UHF: fade 0.01%', up.A, 'dB', 'negligible: why S-3 uses UHF and L-band'],
  ];
  return { id: 'rain', name: 'Rain fade', rows, feederAvail, backhaulAvail, fe, bh, margin: p.rain.feederMarginDb - rainAp(fe.A, 0.5), req: 0, ok: feederAvail >= 0.995 };
}

// ---------- station power sizing ----------
export function powerSizing(p, { backhaul = 'starlink', tech }) {
  const s = p.loadScale ?? 1;
  const loads = [
    { name: 'VHF repeater and radios', w: 15, h: 24 },
    { name: 'S-3 fixed terminal', w: 10, h: 24 },
    { name: backhaul === 'vsat' ? 'VSAT terminal' : 'Starlink terminal', w: backhaul === 'none' ? 0 : backhaul === 'vsat' ? 45 : 60, h: 24 },
    { name: 'Ops room: lights, laptop, chargers', w: 120, h: 6 },
    { name: 'Medical fridge (solar class)', w: 25, h: 24 },
    { name: 'Sensor and handheld charging', w: 50, h: 4 },
  ].filter(l => l.w > 0).map(l => ({ ...l, wh: l.w * l.h * s }));
  const speaker = { name: 'Loudspeaker array (alert day)', w: 3200, h: p.power.alertHours, wh: 3200 * p.power.alertHours * s };
  const normal = loads.reduce((a, l) => a + l.wh, 0);
  const P = p.power;
  const battKwh = (normal * P.autonomyDays + speaker.wh) / 1000 / tech.dod / P.invEff;
  const pvKwp = (normal * P.recharge + speaker.wh / P.autonomyDays) / 1000 / (P.psh * P.pr);
  const pvUsd = pvKwp * 1000 * tech.pvUsdW, battUsd = battKwh * tech.battUsdKwh;
  const capexUsd = pvUsd + battUsd + tech.bosUsd;
  const rows = [
    ...loads.map(l => [l.name, l.wh, 'Wh/day', `${l.w} W × ${l.h} h`]),
    ['Normal day', normal, 'Wh/day', ''],
    [speaker.name, speaker.wh, 'Wh', `${speaker.w} W × ${speaker.h} h`],
    ['Battery', battKwh, 'kWh', `(normal × ${P.autonomyDays} days + alert) / DoD ${tech.dod} / inverter ${P.invEff}`],
    ['PV array', pvKwp, 'kWp', `(normal × ${P.recharge} + alert / ${P.autonomyDays}) / (${P.psh.toFixed(1)} sun-h × PR ${P.pr})`],
    ['PV cost', pvUsd, 'USD', `$${tech.pvUsdW}/W installed (estimate)`],
    ['Battery cost', battUsd, 'USD', `$${tech.battUsdKwh}/kWh installed (estimate)`],
    ['Controller, inverter, wiring', tech.bosUsd, 'USD', ''],
    ['Power system per station', capexUsd, 'USD', 'SRR kit was $28,000 for 6 kWp + 40 kWh'],
  ];
  return { id: 'power', name: 'Station power', rows, loads, speaker, normal, battKwh, pvKwp, pvUsd, battUsd, capexUsd };
}
