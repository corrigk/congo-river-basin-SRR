// SDR equipment catalog: two to four real options per element of the S-3 system, each with its unit costs, life,
// the performance numbers the engine uses, and where every figure comes from.
//
// basis (shown on the page as a label):
//   'published' a public price or figure from the vendor or the trade press (source + date given; check before
//               committing to it: list prices change and contracts are negotiated)
//   'datasheet' a vendor datasheet value
//   'quote'     a vendor quote (none yet: replace estimates with quotes as the team gets them)
//   'estimate'  our engineering estimate, with the reasoning in `basis_note`
//   'srr'       carried over from the SRR cost model (core.json cost, sources.json), itself an assumption set
// range: [low, high] multipliers on the capex for the cost range and the Monte Carlo draws.
// risk:  1 (flown, off the shelf) .. 5 (new development); feeds the Risk criterion.
// leadYr: years from contract to first service; feeds the Schedule criterion.
//
// Accessed 2026-11-02 unless stated. Search notes are in docs/sdr-catalog.md.

const SRC = {
  enduro: { label: 'EnduroSat CubeSat store list prices (6U XL $355k, 12U XL $449k); satsearch 12U listing Feb 2024', url: 'https://satsearch.co/products/endurosat-12u-platform' },
  satcat6u: { label: 'satcatalog: 6U CubeSat platform average $140k–260k (FY2021)', url: 'https://satcatalog.com/component/6u-cubesat-platform/' },
  electron: { label: 'Rocket Lab Electron: $7.5M (Next Spaceflight) to $8.4M average 2025 price', url: 'https://paulgennett.substack.com/p/was-rocket-labs-electron-worth-it' },
  rideshare: { label: 'SpaceX rideshare: $350k for up to 50 kg, then $7,000/kg (Feb 2026 market analysis of the public price)', url: 'https://newspaceeconomy.ca/2026/02/27/satellite-ridesharing-market-analysis-2026/' },
  kineis: { label: 'ESA NAVISP profile of Kinéis: modems €15–30, airtime €1–5 per device per month (indicative, may be dated)', url: 'https://navisp.esa.int/actors-involved/details/300/show' },
  rockblock: { label: 'RockBLOCK 9603 $299.95 (SparkFun); Ground Control line rental $17/month, credits £0.08–0.16 per 50 bytes', url: 'https://docs.groundcontrol.com/iot/rockblock/web-services/iridium-contract-costs' },
  transponder: { label: 'Africa 36 MHz transponder leases: about $0.86M–1.5M per year (SpaceNews, dated; Space in Africa 2025)', url: 'https://spaceinafrica.com/2025/09/23/the-billion-dollar-satellite-game-africa-becoming-an-equal-player/' },
  astranis: { label: 'Astranis MicroGEO: price not published; trade press "under $50M" (unverified), "1/10th the cost" of a full GEO', url: 'https://payloadspace.com/astranis-microgeo-testing-complete' },
  starlink: { label: 'Starlink Standard kit in DRC $389, service $50/month (SRR sources.json)', url: '' },
  lfp: { label: 'LiFePO4 pack prices about $110–120/kWh (2025 market summary); installed African systems cost several times that', url: 'https://www.ajot.com/news/falling-battery-prices-highlight-africas-energy-storage-investment-gap' },
  srrCost: { label: 'SRR cost model (core.json cost.station), assumptions with performance classes from Federal Signal and Darley', url: '' },
};

// Elements in the order the configurator shows them. Each option's `perf` is what the engine reads.
export const ELEMENTS = [
  {
    id: 'leo', name: 'Sensor uplink (LEO IoT)', segment: 'Space',
    help: 'How sensor messages get to the ground: our own constellation, or a commercial service we pay per device.',
    options: [
      { id: 'own6u', name: 'Own 6U CubeSats, LoRa-class IoT payload', example: 'EnduroSat 6U XL bus + IoT payload',
        capexUsd: 355000 + 250000, opexUsdYr: 0, lifeYr: 5, massKg: 8, range: [0.7, 1.5], risk: 3, leadYr: 3,
        perf: { kind: 'own', kbpsPerSat: 20, availSpace: 0.999 },
        basis: 'published', source: SRC.enduro,
        basis_note: 'Bus $355k is the 6U XL list price; payload $250k, integration and test are our estimate. 5-year life: low orbit, no propulsion (estimate).' },
      { id: 'own12u', name: 'Own 12U CubeSats, larger antenna and power', example: 'EnduroSat 12U XL bus + IoT payload',
        capexUsd: 449000 + 400000, opexUsdYr: 0, lifeYr: 7, massKg: 16, range: [0.7, 1.5], risk: 3, leadYr: 3,
        perf: { kind: 'own', kbpsPerSat: 60, availSpace: 0.999 },
        basis: 'published', source: SRC.enduro,
        basis_note: 'Bus $449k list price; payload $400k is our estimate. 3x the uplink capacity of the 6U (bigger deployable antenna, more power) is an estimate to confirm with a link budget.' },
      { id: 'ownmicro', name: 'Own 100 kg microsatellites (ESPA class)', example: 'Microsat bus + multi-channel IoT payload',
        capexUsd: 8.0e6, opexUsdYr: 0, lifeYr: 10, massKg: 110, range: [0.6, 1.6], risk: 2, leadYr: 4,
        perf: { kind: 'own', kbpsPerSat: 250, availSpace: 0.9995 },
        basis: 'estimate', source: null,
        basis_note: 'Our estimate for a 100 kg class satellite with propulsion; no public list price. Ten-year life with propulsion.' },
      { id: 'kineis', name: 'Commercial service: Kinéis (Argos heritage)', example: 'KIM2 two-way module + airtime',
        capexUsd: 0, opexUsdYr: 0, lifeYr: 15, massKg: 0, range: [0.8, 2.0], risk: 2, leadYr: 1,
        perf: { kind: 'service', moduleUsd: 30, moduleLifeYr: 5, airtimeUsdMo: 4, inclination: 97.6, sats: 24, kbpsPerSat: 30, availSpace: 0.998 },
        basis: 'published', source: SRC.kineis,
        basis_note: 'Module €15–30 and airtime €1–5 per month (ESA NAVISP, indicative). Revisit modeled with our 24-satellite near-polar row as a proxy for its 25 near-polar satellites. Capacity is the provider\'s; we assume it is not our bottleneck.' },
      { id: 'iridium', name: 'Commercial service: Iridium SBD', example: 'RockBLOCK 9603 class module + line rental',
        capexUsd: 0, opexUsdYr: 0, lifeYr: 15, massKg: 0, range: [0.8, 1.6], risk: 1, leadYr: 1,
        perf: { kind: 'service', moduleUsd: 300, moduleLifeYr: 5, airtimeUsdMo: 17 + 4, continuous: { p95: 2, mean: 0.7, canopyP95: 40, canopyMean: 12, max: 25 }, kbpsPerSat: 500, availSpace: 0.9995 },
        basis: 'published', source: SRC.rockblock,
        basis_note: '66 satellites give continuous coverage. Module $300 retail and $17/month line rental plus about $4/month of credits at our message sizes. Under-canopy waits are our estimate (L-band through foliage).' },
    ],
  },
  {
    id: 'launch', name: 'Launch (own constellation only)', segment: 'Space',
    help: 'The orbit you can buy sets the revisit: 15° needs dedicated launches; rideshares go to 53° or sun-synchronous.',
    options: [
      { id: 'dedicated', name: 'Dedicated small launch per orbital plane, 15°', example: 'Electron class, low-latitude site',
        capexUsd: 8.4e6, lifeYr: 15, range: [0.9, 1.4], risk: 3, leadYr: 2,
        perf: { inclination: 15, perPlane: true, capKg: 250 },
        basis: 'published', source: SRC.electron,
        basis_note: '$8.4M average 2025 price. A 15° orbit needs a low-latitude launch site or a plane change; that is a risk to retire (TBR).' },
      { id: 'mid', name: 'Rideshare to mid inclination, 53°', example: 'Falcon 9 rideshare (Bandwagon class)',
        capexUsd: 350000, perKgUsd: 7000, lifeYr: 15, range: [0.9, 1.3], risk: 1, leadYr: 1,
        perf: { inclination: 53, perPlane: true },
        basis: 'published', source: SRC.rideshare,
        basis_note: 'The published SSO price ($350k up to 50 kg, then $7,000/kg) applied to mid-inclination flights (assumption). One slot per plane.' },
      { id: 'sso', name: 'Rideshare to sun-synchronous, 97.6°', example: 'Falcon 9 Transporter',
        capexUsd: 350000, perKgUsd: 7000, lifeYr: 15, range: [0.9, 1.3], risk: 1, leadYr: 1,
        perf: { inclination: 97.6, perPlane: true },
        basis: 'published', source: SRC.rideshare,
        basis_note: 'Cheapest and most frequent, but a polar orbit spends little time over the equator: revisit is far worse.' },
    ],
  },
  {
    id: 'geo', name: 'Alert broadcast (GEO)', segment: 'Space',
    help: 'One footprint over the whole basin carries spoken alerts to every community receiver.',
    options: [
      { id: 'hosted', name: 'Hosted L-band payload on a commercial GEO', example: 'Payload on an operator\'s next satellite',
        capexUsd: 80e6, opexUsdYr: 0.5e6, lifeYr: 15, range: [0.8, 1.5], risk: 3, leadYr: 4,
        perf: { alertMin: 3.5, availSpace: 0.999, ok: true },
        basis: 'srr', source: null,
        basis_note: 'SRR assumption ($65–120M). Hosted-payload prices are negotiated; ask Avanti, SES, Intelsat for a quote. The launch date depends on the host satellite.' },
      { id: 'lease', name: 'Lease capacity on an existing GEO', example: 'One transponder-equivalent, L/S band',
        capexUsd: 4e6, opexUsdYr: 1.2e6, lifeYr: 15, range: [0.7, 1.6], risk: 3, leadYr: 1,
        perf: { alertMin: 3.5, availSpace: 0.999, ok: true, receiverRisk: true },
        basis: 'published', source: SRC.transponder,
        basis_note: 'Leases in Africa run about $0.86–1.5M a year per 36 MHz transponder (dated). $4M is our estimate for the uplink station and integration. Risk: a $25 receiver must work in whatever band is leased.' },
      { id: 'microgeo', name: 'Dedicated small GEO satellite', example: 'MicroGEO class, about 400 kg',
        capexUsd: 60e6, opexUsdYr: 1.5e6, lifeYr: 8, range: [0.7, 1.5], risk: 3, leadYr: 3,
        perf: { alertMin: 3.5, availSpace: 0.995, ok: true },
        basis: 'published', source: SRC.astranis,
        basis_note: 'Under $50M per satellite (unverified trade press) plus about $10M for a shared launch (estimate). An 8-year life (estimate) means a second satellite inside 15 years. One satellite, no spare: lower availability.' },
      { id: 'none', name: 'No GEO broadcast', example: '',
        capexUsd: 0, opexUsdYr: 0, lifeYr: 15, range: [1, 1], risk: 1, leadYr: 0,
        perf: { ok: false }, basis: 'estimate', source: null, basis_note: 'Leaves S3-05, S3-06 and S3-07 with no path.' },
    ],
  },
  {
    id: 'receiver', name: 'Community receiver', segment: 'User',
    help: 'One per village of about 500 people and one per 5,000 urban residents (SRR assumption).',
    options: [
      { id: 'r25', name: 'Solar/crank L-band receiver, $25 class', example: 'Custom design, high-volume build',
        capexUsd: 25, lifeYr: 5, range: [0.8, 1.6], risk: 3, leadYr: 2, perf: { distribution: 0.3 },
        basis: 'estimate', source: null, basis_note: 'S3-07 threshold price; 5-year life and 30% for distribution and installation are estimates.' },
      { id: 'r10', name: 'Low-cost receiver, $10 class', example: 'Single-chip, crank only',
        capexUsd: 10, lifeYr: 3, range: [0.8, 2.0], risk: 4, leadYr: 3, perf: { distribution: 0.3 },
        basis: 'estimate', source: null, basis_note: 'S3-07 objective price; shorter life and higher risk of not reaching the price at volume (estimate).' },
      { id: 'r45', name: 'Rugged receiver with battery and loudspeaker', example: 'Mast-mounted, village loudspeaker',
        capexUsd: 45, lifeYr: 8, range: [0.8, 1.4], risk: 2, leadYr: 2, perf: { distribution: 0.3 },
        basis: 'estimate', source: null, basis_note: 'Our estimate. Lasts longer and is louder, but misses the $25 threshold (S3-07).' },
    ],
  },
  {
    id: 'power', name: 'Station power', segment: 'Ground',
    help: 'Every ranger station runs on its own power (the grid is unreliable or absent).',
    options: [
      { id: 'lfp', name: 'Solar 6 kWp + 40 kWh LiFePO4', example: 'Standard off-grid kit',
        capexUsd: 28000, battUsd: 10000, battLifeYr: 8, range: [0.7, 1.4], risk: 1, leadYr: 1, perf: { avail: 0.999 },
        basis: 'srr', source: SRC.lfp, basis_note: 'SRR station item ($20–40k). Pack prices have fallen to about $110–120/kWh; installed cost in the basin is several times that.' },
      { id: 'agm', name: 'Solar 6 kWp + lead-acid (AGM) bank', example: 'Cheaper up front',
        capexUsd: 21000, battUsd: 7000, battLifeYr: 3, range: [0.7, 1.4], risk: 1, leadYr: 1, perf: { avail: 0.997 },
        basis: 'estimate', source: null, basis_note: 'Our estimate: lower capex, a battery swap every 3 years in the heat, slightly lower availability.' },
      { id: 'hydro', name: 'Micro-hydro at river sites, solar elsewhere', example: '3 kW run-of-river',
        capexUsd: 28000, battUsd: 10000, battLifeYr: 8, range: [0.7, 1.5], risk: 2, leadYr: 2, perf: { avail: 0.999, hydro: true },
        basis: 'srr', source: null, basis_note: 'SRR hydro option (about $5,000/kW at micro scale) at river stations.' },
    ],
  },
  {
    id: 'backhaul', name: 'Station backhaul (responders, S3-08)', segment: 'Ground',
    help: 'Broadband at each station and database node for responder two-way data.',
    options: [
      { id: 'starlink', name: 'Starlink Standard', example: 'Commercial LEO broadband',
        capexUsd: 389, opexUsdYr: 600, lifeYr: 5, range: [0.8, 1.5], risk: 2, leadYr: 0, perf: { mbps: 50 },
        basis: 'published', source: SRC.starlink, basis_note: 'Kit $389 and $50/month in DRC (sourced in the SRR). Risk: licensing and service terms are a foreign operator\'s.' },
      { id: 'vsat', name: 'Ku-band VSAT', example: 'GEO broadband terminal',
        capexUsd: 3500, opexUsdYr: 3600, lifeYr: 8, range: [0.7, 1.5], risk: 1, leadYr: 1, perf: { mbps: 10 },
        basis: 'estimate', source: null, basis_note: 'Our estimate for a 1.2 m terminal and a 10 Mbps plan; mature, independent of Starlink.' },
      { id: 'none', name: 'None (LEO IoT only)', example: '',
        capexUsd: 0, opexUsdYr: 0, lifeYr: 15, range: [1, 1], risk: 1, leadYr: 0, perf: { mbps: 0 },
        basis: 'estimate', source: null, basis_note: 'Responders share the IoT uplink: S3-08 fails.' },
    ],
  },
  {
    id: 'db', name: 'Hub and database nodes', segment: 'Ground',
    help: 'Kinshasa hub plus regional nodes that hold full replicas and can run the alert chain.',
    options: [
      { id: 'colo', name: 'Racks colocated in existing data centres', example: 'Raxio / OADC Tier III',
        hubUsd: 2.5e6, nodeUsd: 1.0e6, opexUsdYr: 0, lifeYr: 15, range: [0.6, 1.6], risk: 1, leadYr: 1, perf: { nodeAvail: 0.99 },
        basis: 'srr', source: null, basis_note: 'SRR assumption, 15-year cost incl. two hardware refreshes and colocation fees.' },
      { id: 'cloud', name: 'Hybrid: small on-site edge + public cloud', example: 'Edge servers + cloud region',
        hubUsd: 1.0e6, nodeUsd: 0.3e6, opexUsdYr: 0.35e6, lifeYr: 15, range: [0.7, 1.8], risk: 2, leadYr: 1, perf: { nodeAvail: 0.993, needsBackhaul: true },
        basis: 'estimate', source: null, basis_note: 'Our estimate. The cloud region is outside the basin: it depends on the backhaul and on data-sovereignty approval.' },
      { id: 'container', name: 'Own containerized data centres', example: '20 ft container, own power',
        hubUsd: 5.0e6, nodeUsd: 3.0e6, opexUsdYr: 0.2e6, lifeYr: 15, range: [0.7, 1.5], risk: 2, leadYr: 2, perf: { nodeAvail: 0.985 },
        basis: 'estimate', source: null, basis_note: 'Our estimate. Fully sovereign, but we run power and cooling ourselves.' },
    ],
  },
  {
    id: 'tower', name: 'Station tower', segment: 'Ground',
    help: 'Holds the VHF repeater, loudspeakers and relay antenna above the canopy.',
    options: [
      { id: 'lattice30', name: '30 m self-supporting lattice', example: '',
        capexUsd: 45000, lifeYr: 25, range: [0.7, 1.8], risk: 1, leadYr: 1, perf: { relayKm: 20 },
        basis: 'srr', source: SRC.srrCost, basis_note: 'SRR station item ($30–80k).' },
      { id: 'guyed24', name: '24 m guyed mast', example: '',
        capexUsd: 22000, lifeYr: 20, range: [0.7, 1.6], risk: 1, leadYr: 1, perf: { relayKm: 17 },
        basis: 'estimate', source: null, basis_note: 'Our estimate. Half the cost; radio horizon scales with the square root of height, so relay reach drops to about 17 km.' },
    ],
  },
  {
    id: 'ops', name: 'Operations staffing', segment: 'Operations',
    help: 'Network operations centre and field maintenance teams. The SRR left staff out; the SDR needs them.',
    options: [
      { id: 'lean', name: 'Lean: business hours, 14 staff', example: '',
        fte: 14, usdPerFteYr: 30000, range: [0.7, 1.5], risk: 3, leadYr: 0, perf: { repairDays: 10, nodeAvailBonus: 0 },
        basis: 'estimate', source: null, basis_note: 'Our estimate of loaded cost per person in the region ($30k/yr). Slow repairs.' },
      { id: 'standard', name: 'Standard: 24/7 operations, 30 staff', example: '',
        fte: 30, usdPerFteYr: 30000, range: [0.7, 1.5], risk: 2, leadYr: 0, perf: { repairDays: 5, nodeAvailBonus: 0.003 },
        basis: 'estimate', source: null, basis_note: 'Our estimate. Faster repairs raise node availability (illustrative).' },
      { id: 'full', name: 'Full: 24/7 plus regional field teams, 55 staff', example: '',
        fte: 55, usdPerFteYr: 30000, range: [0.7, 1.5], risk: 1, leadYr: 0, perf: { repairDays: 2, nodeAvailBonus: 0.006 },
        basis: 'estimate', source: null, basis_note: 'Our estimate.' },
    ],
  },
];

export const ELEMENT = Object.fromEntries(ELEMENTS.map(e => [e.id, e]));
export const opt = (el, id) => ELEMENT[el].options.find(o => o.id === id) || ELEMENT[el].options[0];

export const BASIS = {
  published: { label: 'Published', title: 'Public price or figure from the vendor or trade press; check before committing' },
  datasheet: { label: 'Datasheet', title: 'Vendor datasheet value' },
  quote: { label: 'Quote', title: 'Vendor quote' },
  estimate: { label: 'Estimate', title: 'Our engineering estimate; reasoning given' },
  srr: { label: 'SRR assumption', title: 'Carried over from the SRR cost model' },
};
