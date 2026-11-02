# SDR workbench: how it works

Tab **4 · SDR** (`#sdr`). The SRR tabs (1–3) are unchanged. Code in `src/sdr/`; the same engine runs in node:
`node scripts/sdr-report.mjs` (baseline, every option swapped in one at a time) and `--opt` (the optimizer).

## Pieces

| File | What it does |
| --- | --- |
| `catalog.js` | 2–5 real options per element (LEO uplink, launch, GEO, receiver, station power, backhaul, databases, tower, staffing) with unit costs, life, the performance numbers the engine uses, risk (1–5), lead time and **where each figure comes from** (Published / Datasheet / Quote / Estimate / SRR assumption, with the source and date) |
| `engine.js` | A Design (every choice and slider) → the SRR ConOps model fed with the chosen equipment, a 15-year cost ledger by year, requirement checks with a **margin** each, five failure cases, and a 0–1 score on eight criteria |
| `decide.js` | Team-weighted score, ranking, winner map, flip points, weight robustness |
| `optimize.js` | Random sampling then hill climbing over the whole design space; best design for five objectives; Pareto frontier |
| `sensitivity.js` | Tornado, elasticity matrix, Monte Carlo |
| `worker.js` | Runs the optimizer and Monte Carlo off the page's main thread |
| `view.js`, `sdr.css` | The tab |
| `designs/*.json` | Preset designs (★ in the design menu). Export a design to a JSON file and commit it here to share it |

## The engine

**Performance** comes from the SRR model (`src/s3/conops/model.js`, explained in `conops-model.md`), with:
- the revisit table for the orbit the launch buys (15° dedicated, 53° rideshare, 97.6° SSO rideshare) or, for a
  commercial service, its own row (Kinéis: the 24-satellite near-polar row as a proxy; Iridium: continuous coverage);
- uplink capacity per satellite from the satellite option (20 / 60 / 250 kbps: estimates to confirm with a link budget);
- terminal module price and life from the uplink option (S3-04), receiver price (S3-07), backhaul Mbps per site (S3-08);
- node availability from the database option plus the staffing level, space availability from the LEO and GEO options;
- station relay reach from the tower (30 m: 20 km; 24 m: 17 km, radio horizon ∝ √height).

**Cost ledger.** First service (IOC) is the slowest element's lead time. Each line buys its equipment over the build
years (1..IOC), replaces it every `life` years after that, and pays its recurring cost from IOC to year 15:

- own satellites: (satellites + spares per plane × planes) × unit cost, replaced every life (5 yr 6U, 7 yr 12U, 10 yr microsat);
- launch: planes × price per launch each generation (dedicated: one launch per plane per 250 kg; rideshare: $350k up to 50 kg + $7,000/kg);
- gateways and integration $25M once, $8M per replenishment; satellite operations $3M/yr (SRR assumptions);
- commercial service: integration $2M + devices × airtime × 12 a year;
- sensor radio modules: terminals × module price, replaced every module life;
- GEO: capex (replaced if its life is under 15 years) + operations a year;
- ranger stations: the SRR station items with the chosen tower and power, + the access kit, × the logistics multiplier
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

## Sensitivity

Fifteen uncertain inputs are multipliers on the catalog values (`KNOBS` in `engine.js`, each with a low and high).
**Tornado**: each to its low and high, the others held, ranked by the change in cost, latency or score; ⚠ where the design
stops meeting a requirement. **Elasticity**: % change in eight outcomes per % change in each design lever and input
(+10%, or the next step for discrete levers). **Monte Carlo**: 600 draws of all inputs together (triangular: low,
1, high): cost percentiles, the probability of staying under the cap and of passing each requirement, and the band
on the cumulative cost chart.

## First findings (baseline, 2041)

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
