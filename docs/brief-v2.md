# Claude Code Brief v2: Congo River Basin SRR page (S-3 BASINLINK & BASINCAST)

**This brief replaces the earlier `congo-srr-s3-claude-code-brief.md`.** Work in the cloned repo `congo-river-basin-SRR`. The original ConOps repo must stay untouched.

Read this whole file, then `prototypes/srr_prototype.html` (open it in a browser), then the data files. Show me an audit and a plan before editing anything.

---

## 1. What the page is for

Our team presents a System Requirements Review (SRR) for RFP S-3 in PowerPoint. This page is a **live demo I switch to from a link in the slides**, probably on my professor's computer, in front of industry reviewers. It must answer four questions:

1. **What does our system look like?** (hub, databases, ranger stations, community receivers, sensors, space layer)
2. **How did we make the decisions?** (the method behind every placement and count)
3. **Why did we make them?** (a stated reason for each, visible on click)
4. **How flexible and resilient is it?** (sliders, years, coverage definitions, failure cases)

Scope is **S-3 only**. Its three Level 0 mission objectives:
- **MO-1** Collect short messages from thousands of low-power gauges, sensors, wildlife tags and ranger devices anywhere in the basin, including under canopy.
- **MO-2** Broadcast geo-targeted, spoken alerts to every community and confirm they were delivered.
- **MO-3** Give rangers and responders two-way communications that survive the loss of terrestrial networks.

Flooding is one hazard among many. The system detects and responds to **flooding, fire, illegal logging and deforestation, illegal mining and pollution, wildlife and poaching, and disease or community emergencies**.

## 2. What is in this package

```
BRIEF.md                         this file
prototypes/srr_prototype.html    WORKING reference prototype (all 6 sections, data embedded). Match its behavior.
prototypes/template.html         same prototype without data (readable source)
data/*.json, *.geojson           all data the page needs (contracts in section 6)
scripts/*.py                     the analysis pipeline that produced the data (rerun in section 5)
```

The prototype is a **functional reference, not the final design**. Rebuild its sections inside the existing repo's look, map and code structure. Keep the prototype's numbers, logic and wording unless this brief says otherwise.

## 3. Changes from the current page

- **Remove** the Interfaces tab and the Trades & open items tab.
- **Add** the six sections below (they can be tabs, as in the prototype).
- **Keep** the Purdue look (Big Shoulders Text headlines, Inter body, black / gold / river-blue), dark and light modes, the side-panel click pattern, and the existing scenario engine if it fits under section 1 or 6.

## 4. The six sections (see the prototype for each)

### 4.1 Function flow
- The team's Level 1 functional flow, eight boxes in the same serpentine layout as our slide:
  DETECT → TRANSMIT to satellite → SEND to database → PROCESS, evaluate threat → AUTHORIZE → RETRANSMIT to satellite → SEND to outposts → VERIFICATION.
- A hazard selector relabels DETECT (e.g. "Detect rising water", "Detect fire").
- Clicking a box shows: description, who performs it, input → output, traced MO/S3 IDs, time allocated, and draft L1 requirements (`functions.json`).
- Latency budget bars for S3-03 (F1–F3) and S3-05 (F6–F7), with a threshold/objective toggle, labeled **"Proposed allocation, TBR"**. F4–F5 sit outside S-3 timing (agency process).
- **Important:** the draft L1 requirements are suggestions. The team has its own L1–L3 requirements. Make the requirement list easy to replace by editing `functions.json`.

### 4.2 ConOps map ("What we build, and where")
- Layers (toggleable): population density (by year), station coverage (by mode, for N stations), rivers, roads, borders, existing infrastructure, hub and databases, ranger stations, protected areas, sensor sample points.
- Year selector: 2026, +5, +10, +15 (2031, 2036, 2041).
- Station slider 0–400 shared with sections 4.3 and 4.6.
- Hover anything for details. **Click a database node** for the siting rationale (`databases.json`):
  - Main hub **Kinshasa**: largest urban area (about 10.9M), Tier III data centre, government and agency seat, subsea cable route.
  - Regional nodes chosen by a p-median analysis on 2041 population, with rules: ≥500 km apart, none within 150 km of areas under armed-group control (Goma, Bukavu), cities ≥400k. Result: **Mbuji-Mayi, Kisangani, Kalemie** (average resident 354 km from a node vs 1,051 km with Kinshasa alone). Show the top-5 table and the note that a Bangui node costs only about 8 km and adds a second country.
- Use the repo's existing map (Cesium or otherwise). If it uses online imagery, keep a **vector-only fallback** like the prototype's canvas map so the page never goes blank offline.

### 4.3 Station optimizer ("Finding the sweet spot")
- Line chart: % of basin population covered vs number of stations (0–400), four coverage modes, the selected mode emphasized, a cursor at the slider value, and a **sweet-spot marker** (knee of coverage vs cost).
- Stat tiles: people covered, 15-year station cost, sweet spot N, coverage and cost at the sweet spot, last station adding ≥0.1%.
- Coverage modes (what "covered" means), each explained on the page:
  - **Radio reach**: within 25 km of the tower.
  - **1-hour response**: reachable by rangers within 60 min (boat 25 km/h on rivers, vehicle 30 km/h on roads, 3 km/h on foot).
  - **Loudspeaker**: within 1.28 km of the tower speaker. Only about 5% of people even at 400 stations, which is why every village gets a community receiver.
  - **Mix**: radio OR 1-hour response; siting weights 0.50 / 0.35 / 0.15.
- Station cost table by site type (road / river / remote), 15 years, **no salaries**.
- **Micro-hydro break-even** chart with a $/kW slider: hydro beats solar-only below about $4,250/kW installed. The stronger argument for hydro is steady rainy-season power.
- Station kit table (`cost_model.json`).
- Key results (2041, mix): sweet spot ≈ **97 stations**, ≈ **47%** of people covered, ≈ **$46M** over 15 years.

### 4.4 Sensor network
- Table of sensor types with count sliders, unit cost, bytes/day and placement rule (`sensors.json`).
- Stat tiles: terminals, data per day, average per terminal, hardware cost, replacements over 15 years.
- Stacked bar against **S3-02** (≥10,000 terminals at ≥2 kB/day; objective ≥100,000 at ≥50 kB/day) with pass/fail text.
- Community receivers (S3-07): about 255k (2026) to 365k (2041), $6–9M at $25 each. All have hand cranks.
- Sensors belong to user agencies; S-3 supplies their radios and the network. Say so on the page.

### 4.5 Space and backhaul ("Build, buy, or both")
- Log-scale chart: p95 wait vs number of LEO satellites for 15°, 30°, 53° and polar orbits, open-sky vs under-canopy toggle, reference lines at 30 min (S3-03 threshold) and 5 min (objective) (`leo_revisit.json`).
- Findings to state: low inclination wins for an equatorial basin; about 24 satellites at 15° meet the threshold in the open (p95 7 min); about 36 approach the objective; **under canopy LEO alone fails** (p95 134 min), which is the case for ranger-station towers as canopy-top relays; broadcast goes to a GEO hosted payload.
- Options table (`comms_options.json`) with the tag **"Notional baseline, trade study pending"**. Baseline: own LEO IoT + GEO broadcast + station relays + commercial (Starlink) backhaul. Starlink is shown honestly: cheap and fast, but licensed only in some basin countries, needs power and clear sky, cannot serve $150 sensors or $25 receivers, and is a foreign commercial dependency.

### 4.6 Cost and resilience
- Stacked bar of 15-year cost against the **$400M cap** that follows the station slider. Over-budget is allowed; show **by how much**. At the sweet spot it lands almost exactly on the cap (about $401M).
- Lines: LEO $265M, GEO $80M, stations (slider), receivers, commercial backhaul. Excludes salaries and the sensors themselves.
- Failure buttons with a short explanation each: hub offline, lose a satellite, grid and towers down, flood takes a station, GEO payload lost. Where possible, also show the effect on the map (e.g. hub offline → a regional node lights up as acting hub; station lost → its coverage disappears).

## 5. Before the review: replace the proxy data with real data (please do this)

My sandbox could not reach the big geodata sites, so two inputs are **proxies**, clearly labeled on the page. Your machine has internet; please upgrade them and rerun the pipeline:

| Input | Now | Replace with |
|---|---|---|
| Basin outline | concave hull of Natural Earth rivers, calibrated to 3.7M km² | HydroBASINS (hydrosheds.org) level 3 Congo polygon, or the outline already in the repo |
| Population | modeled: towns + river/road-weighted rural, calibrated to UN country totals | WorldPop 2020 1 km UN-adjusted (or GHS-POP) clipped to the 10 countries |
| Protected areas | 21 approximate centroids | WDPA polygons (protectedplanet.net) |
| River gauges | rule-based placement | GRDC station list if obtainable |

Pipeline (Python 3.11+, `pip install shapely pyproj geonamescache scipy numpy rasterio`). Natural Earth GeoJSONs go in `raw/` (download URLs in `sources.json`):

```
python scripts/build_geography.py [--basin path/to/hydrobasins_congo.geojson]
python scripts/build_population.py [--worldpop path/to/worldpop.tif]    # WORLDPOP_YEAR=2020
python scripts/optimize_stations.py
python scripts/site_databases.py
python scripts/leo_revisit.py
python scripts/build_sensors_comms_budget.py
python scripts/build_prototype.py     # optional: rebuilds the reference prototype
```

After rerunning, remove the "modeled proxy" labels only for the inputs you actually replaced, and tell me how the key numbers moved (sweet spot N, % covered, cost, database picks).

## 6. Data contracts

- `population.json`: grid (`lon0`, `lat0`, `nx`, `res_deg` = 0.125°), `cells.i` (grid index), `cells.country`, `cells.km2`, distances to river/road/town, `pop[year]` arrays aligned with `cells.i`, `summary`, `mode` (proxy or WorldPop).
- `stations.json`: `runs["<mode>_<year>"]` with `stations` (ordered; lat, lon, type, gain, cum_pct, cum_area_pct, cum_cost_musd, hydro_ok), `sweet_spot_knee`, `sweet_spot_marginal_0p1pct`, and `first_covered_b64` (base64 little-endian Uint16 per cell: index of the first station that covers it; 65535 = never). Cell is covered for N stations if value < N. Also station costs and hydro comparison.
- `databases.json`: candidates (with notes, exclusions), best set per count, top sets of 4, recommended set, roles.
- `functions.json`: hazards, functions F1–F8, continuous functions, latency budgets, draft L1 requirements.
- `cost_model.json`: every cost and range with its basis (assumption vs sourced).
- `sensors.json`, `comms_options.json`, `leo_revisit.json`, `budget.json`, `infrastructure.json`, `protected_areas.json`: as named.
- `sources.json`: every sourced value's citation. Surface these in a small "Sources" drawer on the page.

## 7. Performance and offline (must-have, carried over)

1. Self-host all libraries and fonts. No runtime CDN dependencies.
2. Service worker that precaches everything on first load; a "Preload for offline" button and a status badge ("Ready offline" / "Loading…").
3. Keep first load small: lazy-load `population.json` and `stations.json` (about 1 MB and 1.7 MB), gzip-friendly. Consider splitting `stations.json` per year.
4. Correct relative paths for the GitHub Pages subpath; also works from a local folder or `localhost`.
5. Test with the network throttled and then disabled in a clean profile. Report results.

## 8. Presenter mode (carried over)

Arrow keys step the scenario; number keys 1–6 jump to sections; `R` resets; a clean large-type layout; works on a 1280×720 projector.

## 9. Honesty rules

- Use the S-3 Level 0 numbers exactly (Appendix A).
- Everything that is a modeled proxy or an assumption carries a visible tag: **"Modeled proxy"**, **"Assumption"**, **"Proposed allocation, TBR"**, or **"Notional baseline, trade study pending"**.
- Do not round away or alter the analysis numbers; if you rerun with real data, use the new outputs.
- Do not use photos of real people; no brand logos.
- Accessibility: contrast, focus states, aria labels, keyboard operation, and a table view for every chart.

## 10. Open questions to ask me (don't guess)

1. Map engine: keep Cesium for the globe fly-in and add these layers, or switch the SRR page to the 2D vector map?
2. Station slider default: the sweet spot (97) or a round number we present (e.g. 100)?
3. Should the Bangui alternative replace Kalemie for cross-border reasons?
4. Do the team's own L1–L3 requirements replace `derived_L1_drafts` now? (I will send them.)
5. Starlink: keep it in the baseline as backhaul, or show it only as an option?

## 11. Acceptance criteria

- [ ] Original repo unchanged; work in `congo-river-basin-SRR`.
- [ ] Interfaces and Trades tabs removed; six sections working and matching the prototype's behavior and numbers.
- [ ] Shared year, mode and station-count state across the map, optimizer and budget.
- [ ] Database "why" panel, coverage modes, hydro break-even, S3-02 check, LEO chart and budget-vs-cap all working.
- [ ] Proxy data replaced (or clearly labeled if not), with a short note on how the numbers changed.
- [ ] Works offline after one visit; never blank offline on first visit; deployed to GitHub Pages; I get the URL.
- [ ] README: how to run locally, rerun the pipeline, edit functions/requirements, and how the offline cache works.

Work in stages: audit and plan, then data upgrade, then sections 4.1–4.6, then offline and presenter mode, then polish. Show me the plan first.

## Appendix A: S-3 Level 0 requirements (use exactly)

| ID | Requirement | Threshold | Objective |
|---|---|---|---|
| S3-01 | Service area | Entire 3.7M km² basin, including under 30-40 m canopy for sensors | All 10 basin countries |
| S3-02 | Sensor terminals served / routine data per terminal per day | ≥10,000 / ≥2 kB | ≥100,000 / ≥50 kB |
| S3-03 | Priority sensor message to the COP | ≤30 min, ≥95% delivered | ≤5 min, ≥99% delivered |
| S3-04 | Sensor terminal life on solar or battery / unit cost | ≥1 yr / ≤$150 | ≥3 yr / ≤$50, ≤25 g tag variant |
| S3-05 | Authorized alert to audible at a community receiver | ≤10 min for ≥95% of receivers | ≤3 min for ≥99% |
| S3-06 | Alert geo-targeting / spoken languages | ≤50,000 km² / French + Lingala, Kiswahili, Kikongo, Tshiluba | ≤2,500 km² / ≥10, selected by district |
| S3-07 | Community receiver | ≤$25, solar or crank, fixed antenna with no pointing | ≤$10, or reception on existing phones |
| S3-08 | Responder two-way terminals | ≥500 simultaneous at ≥4.8 kbps | ≥5,000 at ≥64 kbps |
| S3-09 | Command or acknowledgment delivered to any terminal | ≤6 h | ≤15 min |
| S3-10 | Service availability in heavy tropical rain / service life | ≥99.5% / 10 yr | ≥99.9% / 15 yr |

Constraints: life-cycle cost ≤$400M over 15 years including replenishment (TBR); licensed spectrum and ITU filings; alerts use CAP and authority stays with national agencies; terminal and receiver radios and antennas are in scope; interoperate with Iridium SBD, Argos and ICARUS where practical.
