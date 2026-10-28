# ConOps model: how the numbers on the ConOps tab are worked out

Companion to the **ConOps** tab of the S-3 BASINLINK SRR page. The page stays nearly text-free; this document carries
the explanation: what each device does, how coverage and cost are calculated, where the sweet spot and the ranges
come from, and why the design looks the way it does.

All formulas live in one place, `src/s3/conops/model.js`. The page runs them live as you move the sliders, and
`node scripts/conops-report.mjs` prints every number quoted below from the same code. Requirement values are the
RFP S-3 Level 0 numbers, verbatim. Everything else is a **planning assumption** and is tagged as one on the page.

---

## 1. The story the tab tells

**Why** (first view): the same basin map shows what S-3 is up against.

| Layer | What it shows | Source |
| --- | --- | --- |
| Population density | Where people live, 2026–2041 | WorldPop 2020 1 km, scaled to UN totals |
| Existing infrastructure | Data centres, cable landing, hydro, roads, rivers | Natural Earth, press sources (see Sources drawer) |
| Conflict | 5,413 violent events and 34,558 deaths (best estimate), 2015–2024, in the basin | UCDP GED v25.1 |
| Fire | 409,465 active-fire detections in 2024 (≥50% confidence), DR Congo only | NASA FIRMS MODIS C6.1 |
| Floods | 130 flood alerts in the basin since 2000 (all ten basin countries) | GDACS (EC JRC) |
| Protected areas | Where poaching and logging pressure concentrates | WDPA |

Illegal mining is not shown: the IPIS mine-site service could not be reached when the data was built. It is listed
as an open item rather than drawn from guesses.

**What / Where / How many** (→ or PgDn, or the step buttons): the problem layers fade out and the system fades in, on the same map:
the hub and regional databases, ranger stations with their towers, canopy repeaters, sensors, and the footprint of
each device. Sliders and toggles change the design; the cost bar and the requirement checks update live.

---

## 2. What each device is, and how far it reaches

| Device | What it does | Reach / footprint | Basis |
| --- | --- | --- | --- |
| LEO IoT satellites (12–36) | Collect sensor messages, low-rate two-way | Whole basin; wait depends on constellation size | `leo_revisit.json` (orbit simulation) |
| GEO broadcast payload | Spoken alerts to every receiver | Whole basin, continuous | AfriStar precedent, CHIRP cost anchor |
| Hub + regional databases | Receive, store, process, run the COP | Failover between nodes | `databases.json` siting study |
| Ranger station (30 m tower) | Canopy-top relay for sensors; VHF to handhelds; Starlink backhaul | Sensor relay **20 km**, handheld radio **25 km** | Assumption (station_relay "15–25 km"; cost_model radio) |
| Canopy repeater | Solar mast relaying canopy sensors to a satellite | **10 km** | Assumption |
| Raised antenna on a fixed sensor | Puts the sensor's antenna above the canopy | Open-sky timing for that sensor | Assumption; antennas are in S-3's design scope |
| Community receiver | $25 solar/crank L-band radio, plays spoken alerts | Village (about 500 people) or 5,000 urban residents | S3-07; `cost_model.json` |

**Under canopy.** A sensor under closed canopy cannot see satellites low on the horizon. The model stands this in
with a 45° minimum elevation (from the LEO study): with 24 satellites the 95th-percentile wait for a pass is
**7 min in the open but 134 min under canopy**. That single fact drives most of the design.

Share of each sensor type under canopy (assumption): gauges and water-quality probes 0 (river banks), fire sensors
0.2 (savanna), rain gauges 0.5, camera traps and acoustic sensors 1, wildlife tags 1, ranger handhelds 0.5.

---

## 3. Requirement by requirement: the formula behind each check

Each check on the page is **pass**, **near** (close enough to fix with a modest change) or **fail**, with the number
behind it. Objective values are reported separately.

| Req | Formula on the page | Baseline result |
| --- | --- | --- |
| **S3-01** Service area | Pass if the LEO constellation is up (it covers the whole basin, canopy included) | Pass |
| **S3-02** ≥10,000 terminals × ≥2 kB/day | Terminals = sum of the sensor sliders. Daily data = Σ count × bytes/day. Network capacity = 100 kbps per satellite (assumption) × 86,400 s × share of time in contact | 10,950 terminals, 26.9 MB/day of 562 MB/day: **pass**. Objective (100,000 × 50 kB = 5 GB/day): not met |
| **S3-03** Priority message ≤30 min, ≥95% | Time = sensor forms message (F1, 2 min) + **p95 satellite wait** + ground processing to the COP (F3, 10 min); the split is a proposed allocation, TBR. A priority-capable sensor gets open-sky timing if it is in the open, has a raised antenna, or is within a station's or repeater's relay reach; otherwise the under-canopy wait applies. Share within 30 min must be ≥95% | Open-sky path 19 min, canopy path 2.4 h. **49% within 30 min: fail** without raised antennas; **100% with them** |
| **S3-04** Terminal ≥1 yr, ≤$150 | Design value: $60 radio module, 3-year life (assumption) | Pass |
| **S3-05** Alert audible ≤10 min, ≥95% of receivers | Authorize 2 min + GEO broadcast 0.5 min + receiver playback ≤1 min (L2-2.1.2, L2-2.3.1). Without the GEO payload, $25 fixed-antenna receivers have no path | ≈3.5 min: **pass**; fails with no GEO |
| **S3-06** Geo-targeting ≤50,000 km² | Receivers addressed by district group code | Pass with GEO; objective 2,500 km² needs location-coded receivers |
| **S3-07** Receiver ≤$25 | Design value | Pass |
| **S3-08** ≥500 responders at ≥4.8 kbps | Need 500 × 4.8 kbps = 2.4 Mbps. Available = stations × 50 Mbps Starlink (if on) + LEO IoT capacity | Pass with Starlink at stations; **fails without station backhaul** |
| **S3-09** Command delivered ≤6 h | Worst case = maximum under-canopy wait + processing | 4.1 h: pass. Objective (15 min) not met |
| **S3-10** ≥99.5% availability | Illustrative: space 99.9% × rain margin 99.9% × ground, where each database node is 99% and nodes fail over: 1 − 0.01^N | 4 nodes 99.80%: pass. **1 node 98.8%: fail** |
| **LCC** ≤$400M over 15 years (TBR) | Sum of the cost lines below; range from each line's low and high | **$397M** base, range $309–561M: pass at base |

Requirements that are verification wording only (for example "≥95% successful delivery of ≥100 valid test messages")
do not size the system and are not modelled; see section 8.

---

## 4. Cost, as a range, 15 years

The page shows each line as low / base / high and the total as a bar with the $400M cap marked. Staff salaries are
set aside, and sensors are owned by user agencies (shown separately, not in the S-3 total).

| Line | Low | Base | High | How it is worked out |
| --- | --- | --- | --- | --- |
| LEO IoT constellation (24 sats) | 212 | **265** | 358 | Per generation $40M fixed + $2.5M per satellite; 1 generation + 2 replenishments at 60% + $3M/yr operations. Range ×0.8 / ×1.35 |
| GEO broadcast payload | 65 | **80** | 120 | Hosted payload; CHIRP anchor ($65M) |
| Ranger stations (78) | 24 | **36.6** | 60 | Station optimizer's cumulative cost (capex + 15-yr opex by access type); range from each capex item's range |
| Hub + 3 regional databases | 3.3 | **5.5** | 10 | Racks colocated in existing data centres: hub $2.5M, $1.0M per regional node |
| Community receivers (358k in 2041) | 3.6 | **9.0** | 11.6 | Low: S3-07 objective $10; base $25; high +30% for distribution |
| Commercial backhaul (Starlink) | 0.6 | **0.8** | 1.2 | $389 kit + $50/month at each station and node |
| **Total** | **309** | **397** | **561** | Cap $400M |
| Sensors (user agencies, not in total) | | 28.9 | | Σ count × unit price × replacements over 15 years |

Toggles add or remove lines: raised antennas ($40 each on about 5,700 fixed sensors, about $0.23M), canopy
repeaters (about $14,500 each over 15 years, range $8,000–25,000), hydro at river stations (+$6,470 per river
station over 15 years against solar).

**What drives the range.** The LEO line is two thirds of the cost and most of its uncertainty (launch for a
low-inclination orbit is the big unknown). The GEO line is next. Stations, databases, receivers and backhaul together
are under 15%. That is why the high end ($561M) sits well over the cap while the base sits just under it: the design
fits the cap if the satellite estimates hold.

---

## 5. The sweet spot (ranger stations)

The station optimizer adds stations one at a time where each covers the most people not already covered (greedy
maximum coverage on the 0.125° population grid, coverage mode "mix": radio reach, one-hour response, loudspeaker).
The curve rises fast and then flattens.

- **Sweet spot (knee): 78 stations** in 2041. 40.6% of the basin's people within reach, $36.6M over 15 years.
  The knee is where the curve bends: past it, each extra station covers markedly fewer people.
- **Sweet-spot range: 58–136 stations**: 36.6–49.0% of people, $27–65M. The low end keeps at least 90% of the
  knee's coverage; the high end is where an extra station still buys at least two thirds of the coverage per dollar
  that stations buy at the knee. Inside the range, the station count is a judgment call (budget, staffing,
  partners); outside it, it is hard to defend.
- By year (the population grows and shifts): 2026 knee 84 (range 63–138), 2031 and 2036 knee 76 (57–135),
  2041 knee 78 (58–136). The slider defaults to the knee for the chosen year.

Coverage here means people within a station's reach, not alert coverage: every community is reached by the GEO
broadcast and its receiver regardless of stations.

---

## 6. What the what-if levers show

| Change (from the baseline) | Effect |
| --- | --- |
| **Raised antennas on fixed sensors** | S3-03 goes from 49% to **100%** within 30 min, for about $0.2M. The cheapest fix by far |
| Canopy repeaters instead (25 → 300) | S3-03 only 50% → 63%: sensors are spread over huge protected areas and a 10 km relay reaches few of them. Repeaters still help routine canopy traffic and commands |
| LEO 12 satellites | S3-03 0% even in the open (p95 wait 19 min + 12 min fixed > 30) |
| LEO 18 satellites | Saves $33M; S3-03 still met with raised antennas (open-sky p95 11 min) |
| LEO 36 satellites | +$66M; objective-level waits in the open (p95 5 min) but the canopy problem remains without antennas |
| 1 database node (Kinshasa only) | S3-10 fails (98.8%); a hub outage stops everything |
| 2–4 nodes | S3-10 passes; with the hub down, the next node takes over and nothing fails |
| No GEO payload | Saves $80M but S3-05 and S3-06 fail: $25 receivers have no other path |
| No Starlink backhaul | S3-08 fails: the LEO IoT link cannot carry 500 responders at 4.8 kbps |
| More stations (100, 150, 200) | 44%, 51%, 55% of people within reach for +$11M, +$35M, +$59M |
| 100,000 terminals (S3-02 objective count) | Fits the threshold checks; the objective data volume (5 GB/day) needs far more satellite capacity |

**Failure cases** (with raised antennas): the hub down, one satellite plane lost, the grid and cell towers down, or a
river station flooded each leave every threshold met. The grid case is the point of MO-3: stations run on solar, the
receivers on solar or crank, and nothing depends on terrestrial networks. Losing the GEO payload is the one single
point of failure for alerts.

---

## 7. Why the design is the way it is

- **Low-inclination LEO for sensors.** The basin straddles the equator; 15° orbits spend far more time over it than
  polar ones (the LEO study), so fewer satellites meet S3-03.
- **GEO for alerts.** One payload covers every community all the time, which is what makes a $25 fixed-antenna
  receiver possible (S3-07) and alerts in minutes (S3-05).
- **Antennas above the canopy, not more satellites.** Under canopy even 36 satellites leave a 46-minute p95 wait;
  lifting the antenna removes the problem for a few dollars per sensor.
- **Four database nodes.** Kinshasa plus Mbuji-Mayi, Kisangani and Kalemie cut the average distance from a resident
  to a node from 1,120 km to 359 km and survive any single node loss (S3-10).
- **Ranger stations at the knee.** 78 stations is where coverage per dollar falls off; the slider shows the range.
- **Starlink at stations.** Cheap, high-bandwidth backhaul that S3-08 needs; the trade study on commercial dependence
  is pending (Notional baseline, trade study pending).

---

## 8. Caveats and open items

- All coverage radii, the canopy shares, satellite capacity, availability figures and cost ranges are planning
  assumptions, tagged on the page. The latency split across function blocks is a proposed allocation, TBR.
- River-gauge sites are rule-based (modeled proxy) until the GRDC station list is obtained.
- Fire data covers the DR Congo only (about 75% of the basin). GDACS flood alerts are event points (where an alert was issued), not flood extents.
- Illegal mining sites (IPIS) could not be downloaded; not shown.
- **Requirements data quality, worth fixing before the review:** 226 of the 340 thresholds in the requirements
  repo reuse one of 13 boilerplate sentences, and some no longer measure their requirement (for example
  L3-1.7.2.3 *Peak Traffic Capacity* has the threshold "Pass 100% of approved installation, fit… inspection
  checks"). Reviewers may notice.
