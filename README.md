# Congo River Basin SRR: RFP S-3 BASINLINK & BASINCAST

Live demo for our System Requirements Review. It narrows the Congo Basin system-of-systems ConOps to what
**RFP S-3** (space-based communications for sensors, responders and communities) must accomplish, which requirements
drive it, and which gaps it closes. Flooding is one worked example; the same comms layer serves every hazard.

**Live:** https://corrigk.github.io/congo-river-basin-SRR/ · presenter link: https://corrigk.github.io/congo-river-basin-SRR/?present#scenario/A/1

It is a concept visualization, not a live system. Requirement text and numbers are verbatim from the RFP; anything
we inferred (traceability, interface roles, latency sub-allocations, map positions) is labelled *Proposed*, *TBR* or
*illustrative* on the page. The page is orbit-neutral: no orbit or architecture is shown as decided.

## Tabs

| Key | Tab | What it shows |
| --- | --- | --- |
| 1 | **S-3 Overview** | Core gap (data out, warnings in), headline requirements, mission objectives, S-3's role in the nine-stage loop, scenarios |
| 2 | **Requirements** | The ten Level 0 requirements with a threshold / objective toggle; select one for what it traces to and where it applies |
| 3 | **Scenario** | Click-to-advance scenarios on the map with the latency budget; A flood warning chain, B routine collection, C degraded operations, D non-flood hazard |
| 4 | **Interfaces** | S-3 in the centre, partner RFPs around it, what we carry and in which direction |
| 5 | **Trades & Open Items** | Open trades, TBR list, constraints |

## Presenting

| Key | Action |
| --- | --- |
| 1 – 5 | Switch tab |
| → · PgDn · Space | Next scenario step (clickers work) |
| ← · PgUp | Previous step |
| R | Reset the scenario to step 1 |
| T | Threshold / objective values everywhere |
| M | Next map: 3D globe · ground view · schematic |
| G | Ground view |
| O | Ground view satellite: pass overhead (LEO/MEO) / fixed in sky (GEO) |
| P | Presenter mode: projector contrast, larger type, no keyboard hints (remembered) |
| F · ? · Esc | Fullscreen · shortcuts · close panel |

**Deep links** open a view directly, so a slide can link straight to a step:
`…/#overview`, `…/#requirements`, `…/#scenario/A/5`, `…/#interfaces`, `…/#trades`.
Add `?present` to open in presenter mode and `?offline` to skip the online satellite imagery
(`…/?present&offline#scenario/A/1`). Laid out for 1280×720 and up; also checked at 1024×768 and phone width.

**Before presenting on a computer you don't control:** open the page once and wait for the badge in the top bar to
read **Ready offline** (or click **Preload for offline**). After that the page and the 3D globe work with no network.
If anything goes wrong, `srr-offline.html` is a single file with everything inside: copy it to a USB stick and
double-click it (schematic map only).

## Ground view

The Scenario tab has three maps: the 3D globe, an eye-level **Ground** view, and the schematic. The ground view is an
illustrative low-poly scene on an Ubangi riverbank (Three.js, self-hosted, about 130 kB compressed, cached offline):
the river gauge under the canopy, the ranger station with its two-way terminal, the village's community receiver,
a radio tower in the distance, and the satellite overhead. Every scenario step drives it from the same data as the maps:
beams for links, the gauge alarm, the receiver playing the alert, the tower going dark in degraded operations, smoke at
the incursion site, A-2's drone and A-1's platform. Nodes that are far away (gateway, COP, agency, other partners) are
labelled "beyond the horizon".

The **Satellite** toggle shows the open orbit trade instead of deciding it: *Pass overhead* (LEO/MEO; between passes
the terminal shows "Waiting for a satellite pass", which is the "terminal wait" segment of the latency budget) or
*Fixed in sky* (GEO). The scene is not to scale and time is compressed; the page says so.

## Run it locally

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

All paths are relative (`base: './'`), so the same build works on GitHub Pages under the repo subpath, on
`localhost`, and from any folder behind a static server. Opening `dist/index.html` straight from disk does not work
(browsers block ES modules over `file://`); use `srr-offline.html` for that. Pushing to `main` deploys to GitHub Pages
(`.github/workflows/deploy.yml`).

## Add or edit a scenario

Scenarios are data: `src/s3/scenarios.json`. No rendering code changes are needed.

1. Add any new map points to `nodes` (`label`, `sub`, `kind`, `at: [lon, lat]`, and `rfp` for a partner system).
   Kinds: `sensor`, `field`, `space`, `ground`, `authority`, `receiver`, `responder`, `outage`, `hazard`, `partner`.
2. Append an object to `scenarios` with `id` (one letter), `title`, `pov`, `summary`, `reqs`, optional `latency: true`
   (shows the budget bars), and `steps`.
3. Each step has `title`, `text`, optional `before` (the "today, without S-3" contrast), `reqs` (requirement IDs),
   `mo`, `stages` (nine-stage keys), `show` (node IDs on the map), `links` (`[from, to, kind]`, kind
   `up | down | two | cue | relay`), `focus` (nodes to frame), and optionally `state`, `area` (draw the S3-06 alert
   footprint), `latency` (`{ leg, segments }`), `interfaces` (`[{ id, note }]`) and `note`.

The selector, step list, panel, map and keyboard pick it up automatically. Requirement text lives in
`src/s3/content.js`, the single source of truth for every number on the page.

## How the offline cache works

- **First visit.** The page needs about 105 kB to render (HTML, one JS file, one CSS file, five fonts) and draws the
  schematic map with no WebGL or network. The 3D globe (CesiumJS, about 1.5 MB compressed) loads afterwards in the
  background and takes over when ready. All libraries and fonts are self-hosted; nothing loads from a CDN.
- **Service worker** (`dist/sw.js`, generated from `scripts/sw-template.js` by `scripts/sw-plugin.mjs` with the list
  of files the build actually produced):
  - on install it caches the **core** files (about 0.25 MB), so a second visit works offline;
  - once the globe has loaded it caches the **globe** files too (about 7 MB uncompressed); **Preload for offline**
    does the same on demand and shows progress;
  - files are served cache-first; the page itself is served from cache and refreshed in the background, so a new
    deploy shows up on the next reload.
- **Badge** (top bar): *Loading…* → *Preload for offline* (page cached, globe not yet) → *Ready offline* (everything).
- **Imagery.** The globe always has Cesium's bundled Natural Earth II basemap. Esri World Imagery is layered on top
  only after a probe tile loads, so with no internet the globe stays on the bundled basemap instead of failing. Esri
  tiles are not bulk-cached, to stay within Esri's terms of use.
- **Fallbacks.** No WebGL, or the globe fails to load: the schematic map stays, with a short notice. You can switch
  maps at any time with **M**.

## Code map

- `src/s3/content.js`: requirements, objectives, gap facts, constraints, trades, TBR list, latency budget, partner RFPs
- `src/s3/scenarios.json`: scenario steps and map nodes
- `src/s3/views.js`: HTML for every tab and panel
- `src/main.js`: state, routing (`#scenario/A/5`), tabs, keyboard, map switching
- `src/s3/schematic.js`: SVG schematic map (geometry precomputed by `scripts/build-schematic.mjs`)
- `src/s3/groundmap.js`: ground view (Three.js), same `render(view)` API
- `src/s3/globemap.js`: 3D globe adapter (same `render(view)` API), built on `src/globe.js`, `src/riverflow.js`, `src/fx.js`
- `src/s3/offline.js`: service-worker registration and the offline badge
- `src/style.css` (`:root` colour tokens, shared components) and `src/s3/s3.css`

## Data

| Layer | Source |
| --- | --- |
| Basin boundary, river network | HydroSHEDS HydroBASINS / HydroRIVERS (Africa) |
| National borders | Natural Earth 50m |
| Online imagery | Esri World Imagery (no token); offline: Cesium's bundled Natural Earth II |

To regenerate `src/data/*.json` and the schematic geometry, see the header of `scripts/build-data.mjs`, then run
`RAW=<folder> npm run data`.
