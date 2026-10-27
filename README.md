# Congo River Basin SRR: RFP S-3 BASINLINK & BASINCAST

Live demo for our System Requirements Review. It narrows the Congo Basin system-of-systems ConOps to what
**RFP S-3** (space-based communications for sensors, responders and communities) must do, how we would build it,
what it costs, and which requirements drive it. Flooding is the worked example; the same comms layer serves every hazard.

**Live:** https://corrigk.github.io/congo-river-basin-SRR/ · presenter link: https://corrigk.github.io/congo-river-basin-SRR/?present#flow

It is a concept visualization, not a live system. Requirement text and numbers are verbatim from the RFP (Appendix A
of `docs/brief-v2.md`). Everything else carries a visible label on the page: **Assumption**, **Modeled proxy**,
**Proposed allocation, TBR** or **Notional baseline, trade study pending**. The Sources drawer (**S**) lists every
citation and explains the labels.

## Tabs

| Key | Tab | What it shows |
| --- | --- | --- |
| 1 | **Function flow** | The Level 1 functional flow (F1–F8) for any hazard, who performs each function, which requirement it serves, the latency budget, and **Play**: the click-through scenarios on the map (A flood warning chain, B routine collection, C degraded operations, D non-flood hazard) |
| 2 | **ConOps map** | 2D map: population or station coverage by year, hub and regional databases (with the siting rationale), ranger stations, infrastructure, protected areas, sensors |
| 3 | **Stations** | Ranger-station optimizer: coverage against station count, the sweet spot (78), hydro break-even, station kit |
| 4 | **Sensors** | Sensor network by type, placement, and the S3-02 terminals / data check |
| 5 | **Space & backhaul** | LEO revisit, GEO broadcast, backhaul options (Starlink in the notional baseline) |
| 6 | **Cost & resilience** | 15-year life-cycle cost against the $400M cap, and what happens when the hub, a satellite, the grid or a station fails |
| 7 | **Requirements** | Mission & gap, the ten Level 0 requirements (threshold / objective), and the decomposition MO → L4 |

The station slider, year and coverage mode are shared by the map, optimizer and budget. Every chart has a
**Table** button.

## Presenting

| Key | Action |
| --- | --- |
| 1 – 7 | Switch tab |
| → · PgDn · Space | Next scenario step (clickers work) |
| ← · PgUp | Previous step |
| R | Reset the scenario to step 1 |
| Esc | Close panel; in a scenario, back to Function flow |
| T | Threshold / objective values everywhere |
| M · G · O | Next map (globe · ground · schematic) · ground view · satellite pass / fixed |
| P | Presenter mode: larger type, higher contrast, no keyboard hints (remembered) |
| L | Light / dark theme (follows the system setting until you pick one; remembered) |
| S | Sources drawer |
| F · ? | Fullscreen · shortcuts |

**Deep links** open a view directly, so a slide can link straight to it: `…/#flow/F2`, `…/#map`, `…/#stations`,
`…/#budget`, `…/#requirements`, `…/#overview`, `…/#decomposition`, `…/#scenario/A/5`. Add `?present` for presenter
mode and `?offline` to skip the online satellite imagery. Laid out for 1280×720 and up (also 1024 px and phone width).

**Before presenting on a computer you don't control:** open the page once and wait for the badge in the top bar to
read **Ready offline** (about 30 seconds on slow Wi-Fi; or click **Preload for offline**). After that everything,
including the 3D globe, works with no network. If anything goes wrong, `srr-offline.html` is one file with the whole
page inside (about 4 MB): copy it to a USB stick and double-click it (schematic map only).

## Run it locally

Node 20+.

```bash
npm install
npm run dev            # http://localhost:5173 (no service worker in dev)
```

Production build and a local copy of the GitHub Pages setup:

```bash
npm run build          # dist/ (site + sw.js) and srr-offline.html
npm run serve          # http://localhost:4180/congo-river-basin-SRR/
node scripts/serve.mjs --port 4181 --kbps 400 --latency 400   # imitate bad Wi-Fi
node scripts/serve.mjs --port 4182 --block globemap            # imitate the globe failing to load
```

Stop the server to imitate "network gone". Use a new port for a clean test: each port is its own origin with its own
offline cache. Opening `dist/index.html` from disk does not work (browsers block ES modules over `file://`); use
`srr-offline.html` for that. Pushing to `main` deploys to GitHub Pages (`.github/workflows/deploy.yml`).

## Rerun the analysis pipeline

The numbers in sections 2–6 come from the Python pipeline in `analysis/` (inputs, commands and the real-data rerun
notes are in [analysis/README.md](analysis/README.md)). After a rerun, rebuild the files the page loads:

```bash
npm run data:page      # analysis/data -> src/s3/v2/data (core, geo, grid, pop-<year>, stations-<year>)
```

Sections load only the files they need, so the first paint stays small. The station slider defaults to the sweet
spot in `budget.json`, so it follows the data. Commit both `analysis/data` and `src/s3/v2/data`.

## Edit functions and requirements

- **Functions (F1–F8)**: `analysis/data/functions.json`: names, performers, inputs and outputs, the requirement each
  serves, and the latency allocation. The Function flow tab and the scenario latency budget both read it
  (`latency_budgets` sets which functions make up S3-03 and S3-05). Run `npm run data:page` afterwards.
- **Level 0 requirements, objectives, gap facts, constraints, TBR list**: `src/s3/content.js`, the single source of
  truth for every RFP number on the page. Copy text exactly from the RFP.
- **Scenarios**: `src/s3/scenarios.json`. Each step has `title`, `text`, `fn` (function IDs), `reqs`, `mo`, `stages`,
  `show` and `links` (map nodes and beams), `focus`, and optionally `before`, `state`, `area`, `latency`, `note`.
  New map points go in `nodes` (`label`, `sub`, `kind`, `at: [lon, lat]`). No rendering code changes are needed.
- **Decomposition (MO → L4)**: edited in the separate [congo-srr-requirements](https://github.com/corrigk/congo-srr-requirements)
  repo. This page ships a snapshot (so the tab works offline) and, when online, shows the newer live baseline. After
  finalizing a baseline there, with both repos side by side: `npm run sync:decomp`, then commit
  `src/s3/decomp/snapshot.json`.

## How the offline cache works

- **First visit.** The page renders from one HTML, one JS and one CSS file plus fonts, with no WebGL or network
  needed for the analysis tabs. The 3D globe (CesiumJS) loads afterwards in the background. All libraries and fonts
  are self-hosted; nothing loads from a CDN.
- **Service worker** (`dist/sw.js`, generated from `scripts/sw-template.js` by `scripts/sw-plugin.mjs` with the list
  of files the build produced):
  - on install it caches the **core**: the page, the section code and all section data (about 3 MB), so a second
    visit works offline on every tab;
  - once the globe has loaded it caches the **globe** files too (about 7.5 MB); **Preload for offline** does the
    same on demand and shows progress;
  - files are served cache-first; the page itself is served from cache and refreshed in the background, so a new
    deploy shows up on the next reload. A new build gets a new cache and the old one is deleted.
- **Badge** (top bar): *Loading…* → *Preload for offline* (page cached, globe not yet) → *Ready offline* (everything).
- **Partly cached globe.** If the connection drops while the globe is being saved and the server can't be reached,
  the scenario starts on the schematic map and says "Offline and the globe is not cached" instead of showing an
  empty globe.
- **Imagery.** The globe always has Cesium's bundled Natural Earth II basemap. Esri World Imagery is layered on top
  only after a probe tile loads; Esri tiles are not bulk-cached, to stay within Esri's terms of use.
- **Other fallbacks.** No WebGL, or the globe fails to load: the schematic map stays, with a short notice.

## Themes and accessibility

Dark is the default; light follows the system setting or **L**. Colours are tokens in `src/style.css` (site) and
`src/s3/v2/v2.css` (charts and map ramps, from the brief's prototype). The map and scenario stage (`.stage`) keep
dark tokens in both themes. Text meets WCAG AA contrast in both themes; everything works by keyboard (including the
database nodes on the map); charts have table views and the maps have text descriptions.

## Code map

- `src/main.js`: state, routing, tabs, keyboard, theme, map switching
- `src/s3/v2/sections.js`: the six analysis sections; `mapcanvas.js` (2D map), `ui.js` (charts, controls), `data.js` (loaders)
- `src/s3/views.js`: Requirements views, scenario card and panels, Sources drawer, help
- `src/s3/content.js`: RFP requirements and other fixed text; `src/s3/scenarios.json`: scenarios
- `src/s3/globemap.js`, `src/globe.js`: 3D globe; `src/s3/groundmap.js`: ground view; `src/s3/schematic.js`: schematic map
- `src/s3/decomp/`: decomposition tab; `src/s3/offline.js`: service worker registration and the badge
- `analysis/`: data pipeline (Python); `scripts/`: page data, service worker, test server

## Data and licences

| Layer | Source |
| --- | --- |
| Basin outline | HydroSHEDS HydroBASINS (Lehner & Grill 2013) |
| Population | WorldPop 2020, 1 km, UN-adjusted (CC BY 4.0), projected with UN growth |
| Protected areas | UNEP-WCMC and IUCN, WDPA, October 2026 (**non-commercial use only**; cited on the page) |
| Rivers, roads, borders, places | Natural Earth (public domain), GeoNames |
| Online imagery | Esri World Imagery (no token); offline: Cesium's bundled Natural Earth II |

River-gauge sites are still a **modeled proxy** (rule-based) until the GRDC station list is obtained. All other
citations are in `analysis/data/sources.json` and in the Sources drawer.
