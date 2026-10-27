// RFP S-3 BASINLINK & BASINCAST: system of record for the SRR page.
// Requirement text and numbers are copied exactly from the team brief. Do not round, alter or add figures here.
// Anything we inferred (traceability, latency sub-allocations) is flagged `tbr: true` or
// lives under a key whose name says so, and the page labels it on screen.

import FUNCTIONS from '../../analysis/data/functions.json';
export { FUNCTIONS };

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

// Open items to be resolved (TBR) that the page flags.
export const TBR = [
  { k: 'cost', text: 'Life-cycle cost cap of ≤$400M over 15 years including replenishment.', owner: 'RFP' },
  { k: 'latency', text: 'Latency sub-allocations inside S3-03 and S3-05 are a proposed allocation, not requirements.', owner: 'S-3 team' },
  { k: 'a1', text: 'S-3 as primary comms layer and A-1 as a complementary regional relay layer.', owner: 'S-3 and A-1 teams' },
  { k: 'icd', text: 'Partner interfaces (S-1, S-2, A-1 to A-4): what S-3 carries, in which direction and in what format.', owner: 'S-3 and each partner team' },
  { k: 'trace', text: 'Mapping of requirements to mission objectives and to the out / in gap.', owner: 'S-3 team' },
  { k: 'orbit', text: 'Architecture is a notional baseline (own LEO IoT, GEO broadcast, station relays, commercial backhaul); the trade study is pending.', owner: 'S-3 team' },
  { k: 'gauges', text: 'River-gauge sites are rule-based (modeled proxy) until the GRDC station list is obtained.', owner: 'S-3 team' },
  { k: 'map', text: 'Map positions of gauges, gateways, agencies, receivers and partner assets are illustrative.', owner: 'S-3 team' },
];

// Latency budget for the scenario walkthrough, taken from the functional flow (analysis/data/functions.json):
// S3-03 is split across F1-F3 and S3-05 across F6-F7. Totals are the requirement values; the split is a
// PROPOSED ALLOCATION, TBR (the page says so).
const fnSeg = id => {
  const f = FUNCTIONS.functions.find(x => x.id === id);
  return { k: id, label: `${id} ${f.name.charAt(0)}${f.name.slice(1).toLowerCase()}`, t: f.latency_min.threshold, o: f.latency_min.objective };
};
const BUD = FUNCTIONS.latency_budgets;
export const LATENCY = {
  uplink: { req: 'S3-03', title: 'Uplink leg', from: 'Detection', to: 'Message in the COP',
    total: { t: BUD['S3-03'].threshold_min, o: BUD['S3-03'].objective_min }, segments: BUD['S3-03'].functions.map(fnSeg) },
  alert: { req: 'S3-05', title: 'Alert leg', from: 'Agency authorizes', to: 'Audible at the receiver',
    total: { t: BUD['S3-05'].threshold_min, o: BUD['S3-05'].objective_min }, segments: BUD['S3-05'].functions.map(fnSeg) },
};

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
