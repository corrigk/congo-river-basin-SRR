# Congo River Basin SRR: RFP S-3 BASINLINK & BASINCAST

Live demo for our System Requirements Review. It narrows the Congo Basin system-of-systems ConOps to what
**RFP S-3** (space-based communications for sensors, responders and communities) must do, how we would build it,
what it costs, and which requirements drive it. Flooding is the worked example; the same comms layer serves every hazard.

**Live:** https://corrigk.github.io/congo-river-basin-SRR/ · presenter link: https://corrigk.github.io/congo-river-basin-SRR/?present#conops

It is a concept visualization, not a live system. Requirement text and numbers are verbatim from the RFP (Appendix A
of `docs/brief-v2.md`). Everything else carries a visible label on the page: **Assumption**, **Modeled proxy**,
**Proposed allocation, TBR** or **Notional baseline, trade study pending**. The Sources drawer (**S**) lists every
citation and explains the labels.

## Tabs

| Key | Tab | What it shows |
| --- | --- | --- |
| 1 | **ConOps** | One map in two steps. **Why**: population density, conflict (UCDP), fire (NASA FIRMS), floods (GDACS), protected areas and existing infrastructure, with sourced figures. **What · where · how many** (→): the same map with the design: people within a station's reach, ranger stations and their reach, canopy repeaters, sensors, database nodes, the GEO alert footprint. Sliders and toggles (year, stations with the sweet-spot band, repeaters, raised antennas, database nodes, LEO size, GEO, Starlink, hydro, sensors per type, failure cases) drive live **requirement checks** (S3-01 to S3-10 and the $400M cap), the counts, and the **15-year cost range** |
| 2 | **Function flow** | The team's nine blocks: Acquire, Transmit, Process, Evaluate, Generate, Broadcast, Receive, Verify (a "No" loops back to Broadcast), and Coordinate (persistent). Each block's steps, performers and traceability; the latency budgets; and **Play**: the click-through scenarios on the globe or ground view (A flood warning chain, B routine collection, C degraded operations, D non-flood hazard), with an F1–F9 strip lighting each step's blocks |
| 3 | **Requirements** | Mission & gap, the ten Level 0 requirements (threshold / objective), and the decomposition MO → L4 |

How the ConOps numbers are worked out (coverage, latency, capacity, availability, cost range, the sweet spot) is in
[docs/conops-model.md](docs/conops-model.md). Every chart has a **Table** button.

## Presenting

| Key | Action |
| --- | --- |
| 1 – 3 | ConOps · Function flow · Requirements |
| → · PgDn · Space | ConOps: Why → What. Scenario: next step (clickers work) |
| ← · PgUp | ConOps: back to Why. Scenario: previous step |
| R | Reset the scenario to step 1 |
| Esc | Close panel; in a scenario, back to Function flow |
| T | Threshold / objective values everywhere |
| M · G · O | Next map (globe · ground · schematic) · ground view · satellite pass / fixed |
| P | Presenter mode: larger type, higher contrast, no keyboard hints (remembered) |
| H | Slide mode: hides the top bar so the page fills the screen for a screenshot (H again, or the corner button, to undo) |
| L | Light / dark theme (follows the system setting until you pick one; remembered) |
| S | Sources drawer |
| F · ? | Fullscreen · shortcuts |

**Deep links** open a view directly, so a slide can link straight to it: `…/#conops`, `…/#conops/what`,
`…/#flow/F8`, `…/#scenario/A/5`, `…/#requirements`, `…/#overview`, `…/#decomposition`. Add `?present` for presenter
mode, `?slide` for slide mode and `?offline` to skip the online satellite imagery. Laid out for 1280×720 and up (also
1024 px and phone width).

**Screenshots for slides:** open the view, press **F** (fullscreen) and **H** (slide mode), then take the screenshot.
On a 1920×1080 or 1280×720 screen the result is 16:9.

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

The numbers on the ConOps and Function flow tabs come from the Python pipeline in `analysis/` (inputs, commands,
the hazard downloads and the real-data rerun notes are in [analysis/README.md](analysis/README.md)). After a rerun,
rebuild the files the page loads and check the model:

```bash
npm run data:page                  # analysis/data -> src/s3/v2/data (core, geo, grid, pop-<year>, stations-<year>, hazards)
node scripts/conops-report.mjs     # the ConOps model on the new data: baseline, levers, failure cases, sweet spot
```

The page loads only the files a view needs, so the first paint stays small. The station slider defaults to the sweet
spot of the chosen year. Commit both `analysis/data` and `src/s3/v2/data`, and update the figures quoted in
`docs/conops-model.md` from the report.

## Edit functions and requirements

- **Functional flow (F1–F9)**: `analysis/data/functions.json`: the nine blocks with their names, steps, performers,
  inputs and outputs, traceability and latency allocation; F8's `decision` (the "No" loop back to F6) and F9's
  `persistent` flag. `latency_budgets` sets which blocks make up S3-03 and S3-05. Run `npm run data:page` afterwards.
- **ConOps assumptions**: `src/s3/conops/model.js` (`ASSUME`: relay reach, canopy shares, satellite capacity, unit
  costs and ranges). The page and `scripts/conops-report.mjs` both read it.
- **Level 0 requirements, objectives, gap facts, constraints, TBR list**: `src/s3/content.js`, the single source of
  truth for every RFP number on the page. Copy text exactly from the RFP.
- **Scenarios**: `src/s3/scenarios.json`. Each step has `title`, `text`, `fn` (the F1–F9 blocks it exercises),
  `reqs`, `mo`, `stages`, `show` and `links` (map nodes and beams), `focus`, and optionally `before`, `state`, `area`,
  `latency`, `note`. New map points go in `nodes` (`label`, `sub`, `kind`, `at: [lon, lat]`). No rendering code
  changes are needed.
- **Decomposition (MO → L4)**: edited in the separate [congo-srr-requirements](https://github.com/corrigk/congo-srr-requirements)
  repo. This page ships a snapshot (so the tab works offline) and, when online, shows the newer live baseline. After
  finalizing a baseline there, with both repos side by side: `npm run sync:decomp`, then commit
  `src/s3/decomp/snapshot.json`.

## How the offline cache works

- **First visit.** The page renders from one HTML, one JS and one CSS file plus fonts, with no WebGL or network
  needed for the ConOps, Function flow and Requirements tabs. The 3D globe (CesiumJS) loads afterwards in the background. All libraries and fonts
  are self-hosted; nothing loads from a CDN.
- **Service worker** (`dist/sw.js`, generated from `scripts/sw-template.js` by `scripts/sw-plugin.mjs` with the list
  of files the build produced):
  - on install it caches the **core**: the page, the ConOps and flow code, and all map data for every year,
    including the hazard layers (about 3.3 MB), so a second visit works offline on every tab;
  - once the globe has loaded it caches the **globe** files too (about 7.5 MB); **Preload for offline** does the
    same on demand and shows progress;
  - files are served cache-first; the page itself is served from cache and refreshed in the background, so a new
    deploy shows up on the next reload. A new build (or a change to the worker itself) gets a new cache and the
    old one is deleted;
  - `sw.js` is never cached: the page fetches it to tell whether the server is reachable at all;
  - only the site itself is answered with the cached page, so `srr-offline.html` loads as itself.
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
dark tokens in both themes. Text meets WCAG AA contrast in both themes; everything works by keyboard (on the ConOps
map, the number of database nodes is set with buttons; moving a node to another city is a mouse click); charts have table views and the maps have text descriptions.

## Code map

- `src/main.js`: state, routing, tabs, keyboard, theme, presenter and slide modes, map switching
- `src/s3/conops/`: the ConOps tab: `view.js` (layout, controls, results), `map.js` (the two-step map), `model.js`
  (the formulas behind the checks and the cost range)
- `src/s3/v2/sections.js`: the Function flow section; `ui.js` (charts, controls), `data.js` (loaders)
- `src/s3/views.js`: Requirements views, scenario card and panels, Sources drawer, help
- `src/s3/content.js`: RFP requirements and other fixed text; `src/s3/scenarios.json`: scenarios
- `src/s3/globemap.js`, `src/globe.js`: 3D globe; `src/s3/groundmap.js`: ground view; `src/s3/schematic.js`: schematic map
- `src/s3/decomp/`: decomposition tab; `src/s3/offline.js`: service worker registration and the badge
- `analysis/`: data pipeline (Python); `scripts/`: page data, ConOps report, service worker, test server
- `docs/conops-model.md`: how the ConOps numbers are worked out

## Data and licences

| Layer | Source |
| --- | --- |
| Basin outline | HydroSHEDS HydroBASINS (Lehner & Grill 2013) |
| Population | WorldPop 2020, 1 km, UN-adjusted (CC BY 4.0), projected with UN growth |
| Protected areas | UNEP-WCMC and IUCN, WDPA, October 2026 (**non-commercial use only**; cited on the page) |
| Conflict | UCDP Georeferenced Event Dataset v25.1, 2015–2024 (CC BY 4.0) |
| Fire | NASA FIRMS MODIS C6.1 active fires, 2024, DR Congo |
| Floods | GDACS flood alerts since 2000 (EC JRC) |
| Rivers, roads, borders, places | Natural Earth (public domain), GeoNames |
| Online imagery | Esri World Imagery (no token); offline: Cesium's bundled Natural Earth II |

River-gauge sites are still a **modeled proxy** (rule-based) until the GRDC station list is obtained. Illegal mining
sites (IPIS) are not shown: the service could not be reached when the data was built. All other citations are in
`analysis/data/sources.json` and in the Sources drawer.

