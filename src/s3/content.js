// RFP S-3 BASINLINK & BASINCAST: system of record for the SRR page.
// Requirement text and numbers are copied exactly from the team brief. Do not round, alter or add figures here.
// Anything we inferred (traceability, interface roles, latency sub-allocations) is flagged `tbr: true` or
// lives under a key whose name says so, and the page labels it on screen.

export const RFP = {
  id: 'S-3',
  name: 'BASINLINK & BASINCAST',
  tagline: 'Space-based communications for sensors, responders, and communities.',
  orbit: 'Orbit open (LEO, MEO, GEO, hosted payload, or hybrid).',
  gapTypes: ['Integration', 'System'],
  coreGap: 'Sensor data can’t get out of the forest, and warnings never reach people.',
};

// The core gap, split by direction. `k` matches the `gap` field on requirements below.
export const GAP = {
  out: {
    title: 'Out: data can’t get out of the forest',
    short: 'Data out',
    facts: [
      'Only 13-15 of 400+ pre-1960 river stations still operate, few in real time.',
      'Sensors and ranger devices sync only after 3-7 days.',
    ],
  },
  in: {
    title: 'In: warnings never reach people',
    short: 'Warnings in',
    facts: [
      '62% of people in Central and West Africa who lived through a disaster got no warning.',
      'Internet reaches about 27-32% of people.',
      'Flood bulletins go out by email once a day.',
      'Floods and conflict take down towers and the grid.',
    ],
  },
};

export const MOS = [
  { id: 'MO-1', short: 'Collect', text: 'Collect short messages from thousands of low-power gauges, sensors, wildlife tags, and ranger devices anywhere in the basin, including under canopy.' },
  { id: 'MO-2', short: 'Warn', text: 'Broadcast geo-targeted, spoken alerts to every community and confirm delivery.' },
  { id: 'MO-3', short: 'Coordinate', text: 'Give rangers and responders two-way communications that survive loss of terrestrial networks.' },
];

// Level 0 requirements. `t` = threshold, `o` = objective, verbatim.
// `mo` and `gap` are our traceability (proposed, TBR): the brief gives the requirements, not this mapping.
export const REQS = [
  { id: 'S3-01', name: 'Service area',
    t: 'Entire 3.7M km² basin, including under 30-40 m canopy for sensors', o: 'All 10 basin countries',
    mo: ['MO-1', 'MO-2', 'MO-3'], gap: ['out', 'in'] },
  { id: 'S3-02', name: 'Sensor terminals served / routine data per terminal per day',
    t: '≥10,000 / ≥2 kB', o: '≥100,000 / ≥50 kB',
    mo: ['MO-1'], gap: ['out'] },
  { id: 'S3-03', name: 'Priority sensor message to the COP',
    t: '≤30 min, ≥95% delivered', o: '≤5 min, ≥99% delivered',
    mo: ['MO-1'], gap: ['out'], headline: true },
  { id: 'S3-04', name: 'Sensor terminal life on solar or battery / unit cost',
    t: '≥1 yr / ≤$150', o: '≥3 yr / ≤$50, ≤25 g tag variant',
    mo: ['MO-1'], gap: ['out'] },
  { id: 'S3-05', name: 'Authorized alert to audible at a community receiver',
    t: '≤10 min for ≥95% of receivers', o: '≤3 min for ≥99%',
    mo: ['MO-2'], gap: ['in'], headline: true },
  { id: 'S3-06', name: 'Alert geo-targeting / spoken languages',
    t: '≤50,000 km² / French + Lingala, Kiswahili, Kikongo, Tshiluba', o: '≤2,500 km² / ≥10, selected by district',
    mo: ['MO-2'], gap: ['in'] },
  { id: 'S3-07', name: 'Community receiver',
    t: '≤$25, solar or crank, fixed antenna with no pointing', o: '≤$10, or reception on existing phones',
    mo: ['MO-2'], gap: ['in'] },
  { id: 'S3-08', name: 'Responder two-way terminals',
    t: '≥500 simultaneous at ≥4.8 kbps', o: '≥5,000 at ≥64 kbps',
    mo: ['MO-3'], gap: ['in'] },
  { id: 'S3-09', name: 'Command or acknowledgment delivered to any terminal',
    t: '≤6 h', o: '≤15 min',
    mo: ['MO-3', 'MO-1'], gap: ['in', 'out'] },
  { id: 'S3-10', name: 'Service availability in heavy tropical rain / service life',
    t: '≥99.5% / 10 yr', o: '≥99.9% / 15 yr',
    mo: ['MO-1', 'MO-2', 'MO-3'], gap: ['out', 'in'] },
];
export const reqBy = Object.fromEntries(REQS.map(r => [r.id, r]));

// S3-06 geo-targeting footprint as numbers, for drawing the alert area on the map (≤50,000 km² / ≤2,500 km²).
export const GEO_TARGET_KM2 = { t: 50_000, o: 2_500 };

// Headline numbers for the overview (S3-03, S3-05, S3-01), split for big-type display.
export const HEADLINES = [
  { id: 'S3-03', label: 'Priority sensor message to the COP', t: ['≤30 min', '≥95% delivered'], o: ['≤5 min', '≥99% delivered'] },
  { id: 'S3-05', label: 'Authorized alert to audible', t: ['≤10 min', 'for ≥95% of receivers'], o: ['≤3 min', 'for ≥99%'] },
  { id: 'S3-01', label: 'Service area', t: ['3.7M km²', 'entire basin, under 30-40 m canopy for sensors'], o: ['10', 'all basin countries'] },
];

export const CONSTRAINTS = [
  { k: 'cost', text: 'Life-cycle cost ≤$400M over 15 years including replenishment', tbr: true },
  { k: 'spectrum', text: 'Licensed spectrum and ITU filings required' },
  { k: 'cap', text: 'Alerts use CAP and the authority to issue them stays with national agencies' },
  { k: 'scope', text: 'Design scope includes terminal and receiver radios and antennas' },
  { k: 'interop', text: 'Interoperate with Iridium SBD, Argos, ICARUS where practical' },
];

// Key trades: open and unresolved. `drives` lists requirements each trade most affects (our reading, TBR).
export const TRADES = [
  { k: 'orbit', q: 'One orbit vs hybrid',
    options: ['Single orbit regime (LEO, MEO or GEO)', 'Hosted payload', 'Hybrid of the above'],
    drives: ['S3-01', 'S3-03', 'S3-05', 'S3-10'] },
  { k: 'freq', q: 'Frequency vs foliage loss, rain fade, and antenna size',
    options: ['Lower frequency: better canopy penetration, larger antennas', 'Higher frequency: smaller antennas, more rain fade and foliage loss'],
    drives: ['S3-01', 'S3-04', 'S3-07', 'S3-10'] },
  { k: 'relay', q: 'Store-and-forward vs inter-satellite links vs bent pipe',
    options: ['Store-and-forward', 'Inter-satellite links', 'Bent pipe to a gateway in view'],
    drives: ['S3-03', 'S3-09'] },
  { k: 'receiver', q: 'Broadcast receivers vs direct-to-phone',
    options: ['Dedicated broadcast receivers', 'Direct-to-phone'],
    drives: ['S3-05', 'S3-07'] },
  { k: 'payload', q: 'Shared vs separate payloads for uplink and broadcast',
    options: ['One shared payload', 'Separate uplink and broadcast payloads'],
    drives: ['S3-02', 'S3-05', 'S3-08'] },
];

// Open items to be resolved (TBR) that the page flags.
export const TBR = [
  { k: 'cost', text: 'Life-cycle cost cap of ≤$400M over 15 years including replenishment.', owner: 'RFP' },
  { k: 'latency', text: 'Latency sub-allocations inside S3-03 and S3-05 are a proposed allocation, not requirements.', owner: 'S-3 team' },
  { k: 'a1', text: 'S-3 as primary comms layer and A-1 as a complementary regional relay layer.', owner: 'S-3 and A-1 teams' },
  { k: 'icd', text: 'Every interface on the Interfaces tab: what is carried, direction and format.', owner: 'S-3 and each partner team' },
  { k: 'trace', text: 'Mapping of requirements to mission objectives and to the out / in gap.', owner: 'S-3 team' },
  { k: 'orbit', text: 'No orbit or architecture selected. The page is orbit-neutral until the trade study closes.', owner: 'S-3 team' },
  { k: 'map', text: 'Map positions of gauges, gateways, agencies, receivers and partner assets are illustrative.', owner: 'S-3 team' },
];

// Latency budget. Totals are the S3-03 and S3-05 requirement values; the segments are a PROPOSED ALLOCATION, TBR.
export const LATENCY = {
  uplink: {
    req: 'S3-03', title: 'Uplink leg', from: 'Gauge triggers', to: 'Message in the COP',
    total: { t: 30, o: 5 },
    segments: [
      { k: 'wait',   label: 'Terminal wait for satellite and transmit', t: 15, o: 2.5 },
      { k: 'relay',  label: 'Space relay and downlink to gateway',      t: 10, o: 1.5 },
      { k: 'ground', label: 'Ground processing to COP',                  t: 5,  o: 1.0 },
    ],
  },
  alert: {
    req: 'S3-05', title: 'Alert leg', from: 'Agency authorizes', to: 'Audible at the receiver',
    total: { t: 10, o: 3 },
    segments: [
      { k: 'cap',       label: 'CAP ingest and validation',            t: 1, o: 0.5 },
      { k: 'target',    label: 'Geo-targeting, translation, speech',  t: 2, o: 0.5 },
      { k: 'up',        label: 'Uplink to broadcast satellite',       t: 2, o: 0.5 },
      { k: 'broadcast', label: 'Broadcast and receiver audible',      t: 5, o: 1.5 },
    ],
  },
};

// The other RFPs. Table values are verbatim from the brief; `carry` and `dir` are our proposed interface, TBR.
// dir: 'to' = S-3 delivers to them, 'from' = S-3 carries their data, 'both' = two-way.
export const SYSTEMS = [
  { id: 'S-1', name: 'RADAR-RAPID', platform: 'LEO SAR smallsats', gap: 'Revisit and latency through cloud',
    driving: 'Priority-area revisit ≤12 h / ≤3 h', gapTypes: 'Data, system',
    dir: 'to', carry: 'Gauge trigger reaches the COP over BASINLINK; the COP cues an S-1 revisit of the priority area.' },
  { id: 'S-2', name: 'DEEP CANOPY', platform: 'Large L/P-band SAR', gap: 'Disturbance under canopy, biomass, peatland',
    driving: '≥0.1 ha / ≥0.05 ha, every ≤7 d / ≤3 d', gapTypes: 'Data',
    dir: 'from', carry: 'Under-canopy disturbance detections become alerts and tasking that S-3 carries to rangers.' },
  { id: 'A-1', name: 'SKY STATION', platform: 'Stratospheric HAPS', gap: 'No watch between passes; comms lost in conflict',
    driving: '≥30 d / ≥90 d on station at ≥18 km', gapTypes: 'Data, integration',
    dir: 'both', overlap: true,
    carry: 'Overlap on “comms lost in conflict”. S-3 is the primary basin-wide layer; A-1 is a complementary regional relay. Each backs up the other. Assumption, TBR with the A-1 team.' },
  { id: 'A-2', name: 'RANGER WING', platform: 'Dock-based VTOL UAS', gap: 'Alerts never confirmed in time',
    driving: 'Alert-to-overhead ≤45 / ≤20 min', gapTypes: 'System',
    dir: 'both', clock: 'A-2’s ≤45 min clock starts when our alert is delivered.',
    carry: 'S-3 delivers the alert and tasking to the dock; A-2 returns overhead confirmation over the two-way link.' },
  { id: 'A-3', name: 'RIVER LIFT', platform: 'Flood mapping and medical airlift', gap: 'Reactive flood response, cut-off communities',
    driving: '≥50 kg / ≥500 kg at ≥150 km / ≥300 km', gapTypes: 'System',
    dir: 'both', carry: 'Dispatch commands and acknowledgments to crews over two-way terminals; requests from cut-off communities back to the COP.' },
  { id: 'A-4', name: 'STORM SOUNDER', platform: 'Atmospheric sounding', gap: 'Missing vertical weather profiles',
    driving: '1 profile per 250 km cell every ≤12 / ≤6 h', gapTypes: 'Data',
    dir: 'from', carry: 'Balloon and sonde payloads uplink through BASINLINK like any other sensor terminal.' },
];
export const S3_ROW = {
  id: 'S-3', name: 'BASINLINK', platform: 'Comms, orbit open', gap: 'Sensor data can’t get out; warnings never reach people',
  driving: 'Message ≤30 / ≤5 min; alert ≤10 / ≤3 min', gapTypes: 'Integration, system',
};
export const systemBy = Object.fromEntries(SYSTEMS.map(s => [s.id, s]));

// The SoS nine-stage loop (from the ConOps), with the S-3 role at each stage.
// `s3` = 'primary' (S-3 carries the stage), 'supports' or null.
export const STAGES = [
  { k: 'observe',    n: 1, title: 'Observe Environment',               s3: 'supports', role: 'Gauges, sensors and tags under canopy are the S-3 user terminals.' },
  { k: 'collect',    n: 2, title: 'Collect Multi-Source Data',         s3: 'primary',  role: 'BASINLINK uplink: short messages out of the forest (MO-1).' },
  { k: 'integrate',  n: 3, title: 'Integrate & Validate Data',         s3: 'primary',  role: 'Gateway delivers messages into the COP.' },
  { k: 'assess',     n: 4, title: 'Assess Current Conditions',         s3: null,       role: 'Analysts and partner systems (for example an S-1 revisit).' },
  { k: 'forecast',   n: 5, title: 'Forecast Hazards & Risk',           s3: null,       role: 'Forecast models run on data S-3 delivered.' },
  { k: 'prioritize', n: 6, title: 'Prioritize Threats & Action Items', s3: null,       role: 'National agency decides. S-3 does not.' },
  { k: 'deploy',     n: 7, title: 'Deploy Counter Measures',           s3: 'primary',  role: 'BASINCAST: geo-targeted spoken alerts, delivery confirmed (MO-2).' },
  { k: 'support',    n: 8, title: 'Support Response',                  s3: 'primary',  role: 'Two-way terminals for rangers and responders (MO-3).' },
  { k: 'feedback',   n: 9, title: 'Feedback / Update Models',          s3: 'supports', role: 'Acknowledgments and post-event data flow back.' },
];
export const stageBy = Object.fromEntries(STAGES.map(s => [s.k, s]));
