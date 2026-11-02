# SDR workbench: how it works

Tab **4 · SDR** (`#sdr`). The SRR tabs (1–3) are unchanged. Code in `src/sdr/`; the same engine runs in node:
`node scripts/sdr-report.mjs` (baseline, every option swapped in one at a time) and `--opt` (the optimizer).

## Pieces

| File | What it does |
| --- | --- |
| `catalog.js` | 2–5 real options per element (LEO uplink, launch, GEO, receiver, station power, backhaul, databases, tower, staffing) with unit costs, life, the performance numbers the engine uses, risk (1–5), lead time and **where each figure comes from** (Published / Datasheet / Quote / Estimate / SRR assumption, with the source and date) |
| `physics.js` | Link budgets (sensor uplink, station relay, GEO alert downlink), rain fade and station power sizing, as tables of parameter, value, unit and note |
| `engine.js` | A Design (every choice and slider) → the SRR ConOps model fed with the chosen equipment, a 15-year cost ledger by year, requirement checks with a **margin** each, five failure cases, and a 0–1 score on eight criteria |
| `decide.js` | Team-weighted score, ranking, winner map, flip points, weight robustness |
| `optimize.js` | Random sampling then hill climbing over the whole design space; best design for five objectives; Pareto frontier |
| `sensitivity.js` | Tornado, elasticity matrix, Monte Carlo |
| `worker.js` | Runs the optimizer and Monte Carlo off the page's main thread |
| `export.js` | Chart export: any SVG chart with its colours and fonts written inline, as .svg or a 2x .png |
| `view.js`, `sdr.css` | The tab, including the presenting deck |
| `designs/*.json` | Preset designs (★ in the design menu). Export a design to a JSON file and commit it here to share it |

## The physics (Links & power tab)

The tab shows every budget line by line, plus four charts: uplink margin against elevation (open sky and under
canopy), relay received power against distance, rain fade against share of the year, and station loads. The
assumptions are sliders under **Physics assumptions** in the configurator (saved with the design).

**Sensor uplink to LEO** (UHF, 401 MHz). C/N₀ = terminal EIRP + satellite G/T − free-space loss (32.45 + 20 log f + 20 log
d, slant range at the elevation) − polarization and atmosphere − foliage + 228.6. Margin = C/N₀ − 10 log(burst rate)
− required Eb/N₀ (6 dB: BPSK, rate-1/2 FEC); it must be at least 3 dB.
- **Capacity per satellite** = channels × min(channel cap, rate the link supports at 20°) × 0.184 (pure ALOHA: sensors
  transmit unsynchronised). This replaces the SRR's assumed 20 kbps: the 6U gives 16.9 kbps, the 12U 84.8, the
  microsat 339.
- **Canopy**: foliage loss is Weissberger's model over the crown layer crossed (layer / sin elevation) × a wet-tropical
  factor. The elevation where the canopy margin reaches 3 dB decides the canopy sensors' revisit: from 20° they are
  timed like open sky, up to 45° they use the 45° revisit row, above that they have no direct path (and need a relay).
  The 6U closes at 33°, the 12U at 24°, the microsat at 18°.

**Station relay to canopy sensors** (433 MHz). Allowed path loss = sensor power + tower antenna gain − cable − forest
near the sensor − (sensitivity + 10 dB fade margin). Reach = the two-ray distance (40 log d − 20 log h_t − 20 log
h_r), capped at the radio horizon 4.12 (√h_t + √h_r) km. 30 m tower: 25.6 km (the SRR assumed 20); 24 m: 22.9 km.

**GEO alert downlink** (L-band, 1,490 MHz) to a 4 dBi, 250 K receiver behind 3 dB of thatch or trees, 8 kbps speech:
margin 28 dB with a 53 dBW hosted beam, 19 dB with a 44 dBW leased beam. Spare margin can carry more language
channels in the same power, or a cheaper receiver antenna.

**Rain**: specific attenuation γ = k R^α (ITU-R P.838, horizontal, interpolated in frequency) over the effective path
(ITU-R P.618, rain height 4.8 km), scaled from 0.01% to other percentages with the classic P.618 formula. The 14 GHz
GEO feeder at the hub fades 34 dB at 0.01%; with 10 dB of uplink power control it is up 99.82% of the year. That
figure now sets the rain term of S3-10. UHF and L-band links lose under 0.1 dB.

**Station power**: loads (radios, S-3 terminal, backhaul terminal, ops room, medical fridge, charging; loudspeakers
1 h on an alert day). Battery = (normal day × days of autonomy + alert) / depth of discharge / inverter efficiency;
PV = (normal day × 1.3 + alert / autonomy) / (peak sun hours × 0.75). Baseline: 3.6 kWh a day, 1.7 kWp and 19 kWh
LiFePO4, about $13.9k a station against the SRR's $28k kit.

## The engine

**Performance** comes from the SRR model (`src/s3/conops/model.js`, explained in `conops-model.md`), with:
- the revisit table for the orbit the launch buys (15° dedicated, 53° rideshare, 97.6° SSO rideshare) or, for a
  commercial service, its own row (Kinéis: the 24-satellite near-polar row as a proxy; Iridium: continuous coverage);
- uplink capacity, canopy timing, relay reach, rain availability and station power from `physics.js` (above);
- terminal module price and life from the uplink option (S3-04), receiver price (S3-07), backhaul Mbps per site (S3-08);
- node availability from the database option plus the staffing level, space availability from the LEO and GEO options;
- tower height (30 or 24 m) into the relay budget.

**Cost ledger.** First service (IOC) is the slowest element's lead time. Each line buys its equipment over the build
years (1..IOC), replaces it every `life` years after that, and pays its recurring cost from IOC to year 15:

- own satellites: (satellites + spares per plane × planes) × unit cost, replaced every life (5 yr 6U, 7 yr 12U, 10 yr microsat);
- launch: planes × price per launch each generation (dedicated: one launch per plane per 250 kg; rideshare: $350k up to 50 kg + $7,000/kg);
- gateways and integration $25M once, $8M per replenishment; satellite operations $3M/yr (SRR assumptions);
- commercial service: integration $2M + devices × airtime × 12 a year;
- sensor radio modules: terminals × module price, replaced every module life;
- GEO: capex (replaced if its life is under 15 years) + operations a year;
- ranger stations: the SRR station items with the chosen tower and the sized power system, + the access kit, × the logistics multiplier
  for road / river / remote sites; 6% of capex a year maintenance; battery swaps every battery life; hydro extras;
- repeaters $10k + $300/yr; databases 40% up front, the rest spread over the service years, + option opex;
- backhaul kits at every station and node, replaced, + subscriptions; receivers × price × 1.3 (distribution), replaced;
- raised antennas $40 each, replaced every 5 years; staff × $30k/yr from year 1.

Low and high: each line's total × its option's range. With a discount rate above 0 the cost checked against the cap is
the NPV.

**Margins** (headroom against the threshold): S3-02 1 − use; S3-03 (share within 30 min − 0.95)/0.95; S3-04
(150 − module)/150; S3-05 (10 − minutes)/10; S3-07 (25 − price)/25; S3-08 (available − needed)/needed; S3-09
(360 − worst minutes)/360; S3-10 (availability − 0.995)/0.005 × 0.2; LCC (400 − cost)/400. The smallest is the
**weakest link**.

**Criteria (0–1).** Cost: (500 − $M)/350. Coverage: 0.6 × people in reach/60% + 0.4 × sensors on a fast path.
Speed: half from p95 (45 min → 0, 2 min → 1), half from the share within 30 min. Resilience: share of requirement
checks still passing across hub down, a LEO plane lost, GEO lost, a station flooded, grid down. Margin: tightest
margin from −50% → 0 to +50% → 1. Risk: from the options' 1–5 ratings (average and worst). Schedule: IOC 1 yr → 1,
6 yr → 0. Maintainability: recurring $/yr and the number of field sites. All of these scales are our choices: change
them in `engine.js` if the team disagrees.

## Deciding

- **Weighted score** = Σ weight × criterion / Σ weights; a design that misses a requirement keeps 60% (slider).
- **Winner map**: for each criterion, its weight from 0 to 10 with the others held, coloured by the design that wins.
- **Flip points**: the exact weight at which a rival overtakes the leader (the score difference is linear in each weight).
- **Weight robustness**: the share of 3,000 random weightings each design wins. High = the choice does not depend on
  what the team values; split = agree the weights first.
- **Decision log**: the recommendation in words, the weights, the ranking, why not the runner-up, the flip points and
  the team's notes, as Markdown.

## Exploring

The optimizer samples 1,200 random designs, then hill-climbs from the four best for each objective (about 2,500 designs,
10–20 s): lowest cost that meets every requirement; most people in reach within the budget; most resilient; widest
tightest margin; best weighted score. The cloud plots every design (cost against the chosen measure) with the
efficient frontier of compliant designs; click any point to open it. "What the cheapest compliant designs choose"
shows, per element, how often each option appears: a solid bar is a clear choice.

## Presenting

**Present ▸** in the design bar (or a link to `#sdr/present/1`) turns the current design into a short deck. The
configurator and tabs step aside and each slide gets a title, a one-line takeaway written from the live numbers, and
its charts:

1. **The design**: headline numbers and the design in words
2. **Does it meet the requirements?**: margins with the weakest link, failure scorecard
3. **What it costs, year by year**: cost by year with the cap, cost by segment
4. **How the links close**: link summary, uplink margin against elevation, rain fade
5. **Why this design and not the others**: ranking by team weights, weight robustness
6. **Where it sits in the design space**: the Pareto cloud (only after the optimizer has run)
7. **What could change the answer**: tornado and Monte Carlo (run it first for the odds)

→ / ← / Space / PgDn / PgUp move (clickers work), Home / End jump, Esc leaves; the link follows the slide
(`#sdr/present/4`), so a slide can be linked from the team's deck. **H** hides the top bar for a full-screen
screenshot, **P** is the site's larger-type presenter mode. Each slide has **Charts as PNG** (every chart on it) and
**Summary (.md)**: all the takeaways plus the requirement, cost, equipment and link-budget tables as Markdown, ready to
paste into the SDR report. Outside the deck, every chart card has **PNG** and **SVG** buttons. Exported images use the
current theme; the PNG falls back to a system sans-serif font.

## Sensitivity

Fifteen uncertain inputs are multipliers on the catalog values (`KNOBS` in `engine.js`, each with a low and high).
**Tornado**: each to its low and high, the others held, ranked by the change in cost, latency or score; ⚠ where the design
stops meeting a requirement. **Elasticity**: % change in eight outcomes per % change in each design lever and input
(+10%, or the next step for discrete levers). **Monte Carlo**: 600 draws of all inputs together (triangular: low,
1, high): cost percentiles, the probability of staying under the cap and of passing each requirement, and the band
on the cumulative cost chart.

## First findings (baseline, 2041)

- With the link budgets: the baseline costs **$395M**; the 6U uplink closes with 11 dB at 20° but carries 16.9 kbps per
  satellite, so the uplink is 28% used. Relay reach is 25.6 km. S3-10 drops to 99.72% because of rain on the feeder.
- **Wet canopy is the uplink's big unknown.** At a wet-foliage factor of about 2.4 the 6U canopy link no longer closes
  below 70°, canopy sensors lose their direct path and S3-09 fails. A foliage measurement campaign (or a relay for
  every canopy sensor) retires that risk.

- The SRR baseline costs **$398M** (range $314–588M) with first service in 2030 (the hosted GEO payload's lead time).
  Monte Carlo puts its chance of staying under $400M at only **about 24%**: it has 1% margin on cost.
- **Launch is the biggest single line** ($101M): 6U satellites last 5 years, so the constellation is launched three times.
  **12U satellites** (7-year life, two generations) cut $45M and pass everything.
- **Orbit matters more than price**: rideshares are cheaper but their 53° and sun-synchronous orbits fail S3-03 (p95
  over 8 hours). A 15° orbit needs a dedicated launch from a low-latitude site: a risk to retire.
- **Commercial services**: Kinéis fails S3-03 and S3-09 on revisit; Iridium meets the latency but its $300 module breaks
  S3-04's $150.
- **Leasing GEO capacity** instead of a hosted payload saves about $60M and a year of schedule, if a $25 receiver can
  work in the leased band (the main risk of that option).
- The optimizer's designs converge on **12U satellites, dedicated launches, leased GEO**. Its cheapest compliant
  design has very few ranger stations, because no Level 0 requirement asks for people within a station's reach: if
  the team wants stations for response and loudspeakers, that needs a requirement (or a high Coverage weight).
