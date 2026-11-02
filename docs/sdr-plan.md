# SDR decision workbench: plan

Written after the SRR, from a question-and-answer session with the team lead. Hand this to the build session (Opus 5.5,
high effort). Everything under "Decisions" is settled; everything under "Open" is for later.

## Status (2026-11-02, first build session)

Built on branch `sdr`, tab 4 (`#sdr`); see `docs/sdr-workbench.md`. Done in a first pass: Phase 0 (Design object,
save / duplicate / export / import, presets in `designs/`), Phase 1 (catalog with 2-5 options per element, sources
and basis labels; several figures are still estimates), Phase 2 (cost ledger by year, build timeline; performance
still the SRR formulas), Phase 3 (weights, ranking, winner map, flip points, robustness, failure scorecard, decision
log), Phase 4 (optimizer in a Web Worker, five objectives, Pareto cloud), Phase 5 (tornado, elasticity, Monte Carlo).
Second session: link budgets (sensor uplink with canopy foliage, station relay, GEO downlink), ITU rain fade and
station power sizing now drive capacity, canopy timing, relay reach, S3-10 and station cost (Links & power tab).
Third session: presenting mode (seven-slide deck from the live design, keys, deep links, PNG/SVG chart export,
Markdown summary).
Not yet: satellite power and mass budgets, spares and reliability models; vendor quotes; the optimizer does not run in `srr-offline.html`
(the worker is a separate file).

## What it is

The SRR page, turned into a **decision workbench** for the System Definition Review: an interactive page that monitors
many variables, lets the team configure the system with **real, named equipment**, shows **setup cost, maintenance and
replacement over 15 years**, finds the **best-fit design**, and **explains why**. It runs locally and is shared through
GitHub commits (no server). It is a team working tool first, with a clean presenting mode for the review.

## Decisions

- **Use:** team tool and live demo. Design for working first; add a tidy presenting mode.
- **Purpose (all of these):** compare options (trade studies); configure with real equipment; find best-fit values
  automatically; track requirements and risk; cost and schedule over time; save, name and compare designs with a
  decision log; generate write-ups (tables, charts, summaries to paste into the SDR report and slides).
- **Detail:** everything. Space (LEO sats, GEO payload, launch), ground (hub and databases, station towers, power,
  backhaul), user equipment (sensor radios, receivers, responder terminals, repeaters), operations and maintenance
  (staffing, replacement cycles, replenishment, spares).
- **Equipment data:** the assistant researches and proposes **two or three real options per item with sources and
  prices**; the team picks. Label every figure as sourced (with the source), vendor quote, or assumption.
- **"Best fit" means, selectable:** lowest 15-year cost that meets every requirement; most coverage for a given budget;
  most resilient design; widest margin on the hardest requirements.
- **Team weights:** the team values some things more than others. Weights are sliders and must change the answer.
- **Views wanted first:** team-weighted score with "what flips the winner"; Pareto cloud with the efficient frontier;
  tornado chart and elasticity matrix; Monte Carlo confidence and cost over time. Wanted later: failure scorecard,
  decision log, design diff.
- **Teamwork:** one person works at a time; designs saved and loaded as files, shared through git. No live editing.
- **SRR page:** keep it intact as an "SRR" view at its own link; build the SDR beside it (a separate `sdr` branch and
  route). The SRR site must keep working.
- **No rubric** for the SDR was given. The page should inform decisions, find the best design and explain why; the team
  works out how to present it later.
- **Timing:** SDR in about 3 to 6 weeks. Build in phases so something useful exists after each one.

## What already exists (do not rebuild)

- `src/s3/conops/model.js`: coverage, latency, capacity and congestion, availability, 15-year cost with low/base/high,
  S3-01..S3-10 checks, failure cases, sweet spot, today-vs-S-3 comparison. All constants in `ASSUME`.
- `src/s3/conops/view.js`, `map.js`: the ConOps map, sliders, results tabs. `docs/conops-model.md` explains the formulas.
- `analysis/`: population, station optimizer, database siting, LEO revisit, hazards, today layer (Python, rerunnable).
- The nine-block functional flow (`analysis/data/functions.json`) and requirements repo (congo-srr-requirements,
  340+ requirements; F1-F9 tags). Note: about two thirds of the requirement thresholds reuse 13 boilerplate sentences;
  worth fixing before they are used as verification targets.
- Offline-first service worker, light and dark themes, slide mode, presenter mode, deploy to GitHub Pages.

## Phases (3 to 6 weeks)

**Phase 0: foundation (1-2 days).** Branch `sdr`; keep SRR reachable. A single serializable **Design** object (every
choice and slider) with save, load, name, duplicate and compare, stored as JSON files in the repo. Move the model to
take a Design plus an equipment catalog. Keep the current checks passing.

**Phase 1: equipment catalog and research (about a week, parallel).** A catalog file per segment with, for each option:
name, vendor, key specs, unit cost (capex), recurring cost (opex), design life, replacement cycle, mass and power where it
matters, source URL and date, confidence (quote, datasheet, estimate). Items to cover: LEO satellite bus and payload,
launch (rideshare vs dedicated), GEO hosted payload, gateway antennas, hub and database racks, station tower, solar and
battery, station radio and backhaul, canopy repeater, sensor radio module, community receiver, responder terminal,
vehicles and spares, ground-segment staffing. The assistant proposes 2-3 options per item for the team to pick.

**Phase 2: configurator and real cost engine.** Choose equipment per element; cost = quantity x unit cost, plus install,
logistics multipliers by access type, recurring costs and replacement by year. Output: setup (capex), annual maintenance
and replacement, replenishment, 15-year total, cumulative cost by year, a build and launch timeline. Replace the
planning-level performance formulas with proper ones where the SDR needs them: RF link budgets (uplink margin under
canopy and in rain), orbit and revisit by constellation, battery and solar sizing, reliability and spares.

**Phase 3: decision layer.** Team weight sliders over criteria (cost, coverage, resilience, requirement margin, risk,
schedule, maintainability); one weighted score per design; a **flip analysis** ("choose B instead if cost weight is
above X"); requirement margins with the weakest link highlighted; a risk register tied to the design; failure
scorecard; decision log (why this design) that exports to text.

**Phase 4: optimizer and Pareto cloud.** Generate thousands of designs (grid, random, then evolutionary search);
filter by constraints (budget, requirements); plot cost vs coverage vs resilience; draw the efficient frontier; grey out
dominated designs. Implement the four "best fit" objectives and explain the winner in words. Run in a Web Worker so the
page stays smooth.

**Phase 5: sensitivity.** Tornado chart (every assumption +-20%, ranked by effect on cost and on each requirement's
margin); elasticity matrix (percent change in each outcome per percent change in each lever); Monte Carlo (about 1,000
randomized assumption draws): probability the design stays under the cap and meets each requirement.

**Phase 6: presenting and write-ups.** A clean presenting mode; export tables, charts (PNG/SVG) and a design summary;
decision-log export; the SRR link. Offline check, README, deploy.

## Working rules for the build

- Never invent a number. Every figure is sourced (with URL and date), a vendor quote, or a labelled assumption. Keep the
  existing labels (Assumption, Modeled proxy, Proposed allocation TBR) and add "Quote" and "Datasheet".
- Show the formulas: each result can reveal how it was computed (as the SRR "How it adds up" tab does).
- Check each phase in the browser at 1280x720 and wide, in both themes, with the network off for the offline cache.
- Commit per phase on `sdr`; push only when asked. Ask before downloading anything large or needing an account.
- Ask the team before choosing between real vendors; propose with evidence instead.

## Open (decide as we go)

- Which criteria the team weights most (start with sliders; defaults can come from the first session).
- Whether to treat the 15-year cost as nominal or discounted (NPV).
- How much of the equipment research the team wants to do themselves vs the assistant.
- Whether to bring the requirements repo data into the page (margins per requirement) or keep the ten Level 0 checks.
