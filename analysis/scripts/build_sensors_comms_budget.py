"""
Step 6: sensor network, existing infrastructure, comms options and the budget stack.

Everything here is a PLANNING ESTIMATE. Values tagged "assumption" are ours;
"sourced" values point to sources.json. Sensors are owned by user agencies
(hydrology services, park authorities, researchers); S-3 provides their
radios/terminals and the network. Their cost is shown separately.

Outputs: data/sensors.json, data/infrastructure.json, data/protected_areas.json,
         data/comms_options.json, data/budget.json
"""
import json, os, math
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data")
rng = np.random.default_rng(351)

P = json.load(open(os.path.join(OUT, "population.json")))
ST = json.load(open(os.path.join(OUT, "stations.json")))
DB = json.load(open(os.path.join(OUT, "databases.json")))
LEO = json.load(open(os.path.join(OUT, "leo_revisit.json")))
CM = json.load(open(os.path.join(OUT, "cost_model.json")))
idx = np.array(P["cells"]["i"])
lon = P["lon0"] + (idx % P["nx"]) * P["res_deg"]
lat = P["lat0"] + (idx // P["nx"]) * P["res_deg"]
d_river = np.array(P["cells"]["river_km"]); d_road = np.array(P["cells"]["road_km"]); d_town = np.array(P["cells"]["town_km"])
km2 = np.array(P["cells"]["km2"])

# ---------------- protected areas (approximate centroids) ----------------
PA = [  # name, lat, lon, country, radius_km (rough size for placement only)
    ("Salonga NP", -2.1, 21.2, "DRC", 140), ("Lomami NP", -1.9, 25.0, "DRC", 60),
    ("Maiko NP", -0.5, 27.6, "DRC", 80), ("Kahuzi-Biega NP", -2.3, 28.2, "DRC", 60),
    ("Okapi Wildlife Reserve", 1.6, 28.6, "DRC", 70), ("Garamba NP", 4.2, 29.3, "DRC", 50),
    ("Bili-Uere Reserve", 4.3, 25.0, "DRC", 80), ("Upemba NP", -9.0, 26.7, "DRC", 70),
    ("Kundelungu NP", -10.5, 28.0, "DRC", 45), ("Tumba-Lediima Reserve", -1.7, 17.7, "DRC", 50),
    ("Virunga NP (southern sector)", -1.2, 29.4, "DRC", 35), ("Odzala-Kokoua NP", 0.7, 14.9, "Rep. Congo", 60),
    ("Nouabale-Ndoki NP", 2.4, 16.5, "Rep. Congo", 45), ("Lac Tele Community Reserve", 1.3, 17.2, "Rep. Congo", 45),
    ("Dzanga-Sangha", 2.6, 16.2, "CAR", 40), ("Lobeke NP", 2.3, 15.8, "Cameroon", 30),
    ("Nki NP", 2.3, 14.4, "Cameroon", 35), ("Dja Faunal Reserve", 3.1, 12.9, "Cameroon", 40),
    ("Mahale Mountains NP", -6.2, 29.9, "Tanzania", 30), ("Gombe Stream NP", -4.7, 29.6, "Tanzania", 8),
    ("Kasanka NP", -12.6, 30.2, "Zambia", 15),
]
pa = [{"name": n, "lat": a, "lon": b, "country": c, "approx_radius_km": r} for n, a, b, c, r in PA]
json.dump({"_note": "APPROXIMATE centroids and sizes for display and sensor placement only. Replace with WDPA polygons (protectedplanet.net) in production.",
           "areas": pa}, open(os.path.join(OUT, "protected_areas.json"), "w"), indent=1)


def near_pa(maxk=1.0):
    m = np.zeros(len(idx), bool)
    for p in pa:
        d = np.hypot((lon - p["lon"]) * math.cos(math.radians(p["lat"])), lat - p["lat"]) * 111.32
        m |= d <= p["approx_radius_km"] * maxk
    return m


MINING = [("Kolwezi", -10.72, 25.47), ("Likasi", -10.98, 26.73), ("Lubumbashi", -11.66, 27.48),
          ("Kamituga", -3.06, 28.18), ("Mongbwalu", 1.95, 30.03), ("Misisi", -4.35, 28.98),
          ("Kalima", -2.51, 26.62), ("Punia", -1.47, 26.45)]
mining_mask = np.zeros(len(idx), bool)
for n, a, b in MINING:
    mining_mask |= np.hypot((lon - b) * math.cos(math.radians(a)), lat - a) * 111.32 <= 60

savanna = (lat > 4.5) | (lat < -6.0)
pa_mask = near_pa()

SENSORS = [
    # id, name, unit_usd, life_yr, bytes/day, baseline_count, placement, hazards, basis
    ("gauge", "River level gauge (radar + satellite radio)", 2500, 5, 2000, 450,
     "river cells, weighted to people downstream", ["flood"], "assumption; 450 restores the pre-1960 network size (400+ stations)"),
    ("rain", "Rain gauge (tipping bucket)", 900, 5, 600, 1500,
     "one per about 2,500 km2", ["flood", "fire"], "assumption"),
    ("tag", "Wildlife tag (<= 25 g variant at objective)", 150, 1, 400, 3000,
     "protected areas", ["wildlife", "poaching"], "S3-04 threshold cost <= $150, objective <= $50"),
    ("camera", "Camera trap with satellite thumbnail uplink", 450, 2, 8000, 1200,
     "protected areas", ["wildlife", "poaching", "logging"], "assumption"),
    ("acoustic", "Acoustic sensor (chainsaw, gunshot, engine detection)", 500, 3, 3000, 2000,
     "protected-area edges and mining zones", ["logging", "mining", "poaching"], "assumption (smartphone-based acoustic monitors are the reference design)"),
    ("fire", "Fire / smoke sensor", 200, 3, 300, 1000,
     "savanna belts north and south of the forest", ["fire"], "assumption"),
    ("water_q", "Water quality probe (turbidity, pH, conductivity)", 1200, 3, 1500, 300,
     "rivers downstream of mining zones", ["mining", "health"], "assumption"),
    ("ranger", "Ranger handheld (tracking + two-way text)", 350, 3, 5000, 1500,
     "with ranger teams at stations", ["all"], "S3-08 class terminal, assumption"),
]


def place(mask, weight, k):
    cand = np.nonzero(mask)[0]
    if len(cand) == 0 or k == 0:
        return []
    w = weight[cand] / weight[cand].sum()
    pick = rng.choice(cand, size=min(k, 4000), replace=True, p=w)
    jit = rng.uniform(-0.06, 0.06, size=(len(pick), 2))
    return [[round(float(lat[p] + j[0]), 3), round(float(lon[p] + j[1]), 3)] for p, j in zip(pick, jit)]


pop = np.array(P["pop"]["2026"], float)
rules = {
    "gauge": (d_river <= 4, pop + 1000),
    "rain": (np.ones(len(idx), bool), km2),
    "tag": (pa_mask, km2),
    "camera": (pa_mask, km2),
    "acoustic": (near_pa(1.4) & ~near_pa(0.8) | mining_mask, km2),
    "fire": (savanna, km2),
    "water_q": (mining_mask & (d_river <= 10), km2),
}
sens = []
for sid, name, usd, life, bpd, cnt, placement, hz, basis in SENSORS:
    pts = place(*rules[sid], cnt) if sid in rules else []
    sens.append({"id": sid, "name": name, "unit_usd": usd, "life_years": life, "bytes_per_day": bpd,
                 "baseline_count": cnt, "placement_rule": placement, "hazards": hz, "basis": basis,
                 "sample_points": pts[:600]})

# community receivers (S3-07) from the population surface
urban = (pop / km2) >= 1000
rec = {}
for y in P["years"]:
    p = np.array(P["pop"][str(y)], float)
    u = p[urban].sum(); r = p[~urban].sum()
    n_rec = r / CM["community_receiver"]["people_per_receiver_rural"] + u / CM["community_receiver"]["people_per_receiver_urban"]
    rec[str(y)] = {"rural_pop": int(r), "urban_pop": int(u), "receivers": int(n_rec),
                   "cost_threshold_usd": int(n_rec * 25), "cost_objective_usd": int(n_rec * 10)}

json.dump({"_note": "Planning estimates. Sensors belong to user agencies; S-3 supplies the radio/terminal and the network. "
                    "S3-02 threshold: >=10,000 terminals at >=2 kB/day; objective >=100,000 at >=50 kB/day.",
           "s3_02": {"threshold_terminals": 10000, "threshold_bytes_per_day": 2000,
                     "objective_terminals": 100000, "objective_bytes_per_day": 50000},
           "types": sens, "community_receivers": rec,
           "receiver_rule": CM["community_receiver"]},
          open(os.path.join(OUT, "sensors.json"), "w"), separators=(",", ":"))

# ---------------- existing infrastructure ----------------
infra = {
    "_note": "What we build on. Locations are city-level; verify before final.",
    "items": [
        {"type": "data_centre", "name": "Raxio DRC1 (Tier III, 1.5 MW, 2024)", "lat": -4.36, "lon": 15.34, "source": "raxio"},
        {"type": "data_centre", "name": "OADC Kinshasa data centre", "lat": -4.32, "lon": 15.31, "source": "oadc"},
        {"type": "data_centre_planned", "name": "Raxio Lubumbashi (announced)", "lat": -11.66, "lon": 27.48, "source": "raxio_expansion"},
        {"type": "cable_landing", "name": "WACS subsea cable landing, Muanda (2012)", "lat": -5.93, "lon": 12.35, "source": "wacs"},
        {"type": "cable_landing", "name": "WACS landing, Pointe-Noire area (Rep. Congo)", "lat": -4.78, "lon": 11.86, "source": "wacs"},
        {"type": "hydro", "name": "Inga dams (Congo River)", "lat": -5.52, "lon": 13.62, "source": "general knowledge"},
        {"type": "hydro", "name": "Matebe run-of-river plant, 13.8 MW (2015)", "lat": -1.24, "lon": 29.44, "source": "matebe"},
        {"type": "conflict", "name": "Goma (AFC/M23 control)", "lat": -1.68, "lon": 29.22, "source": "m23"},
        {"type": "conflict", "name": "Bukavu (AFC/M23 control)", "lat": -2.51, "lon": 28.86, "source": "m23"},
    ],
    "river_gauges_note": "Only 13-15 of 400+ pre-1960 river stations still operate (RFP need statement). Exact operating sites: obtain from GRDC / national hydrology services.",
    "starlink_status": {"COD": "licensed May 2025, live June 2025 (kit $389, $50/month)",
                        "CAF": "licensed Dec 2025, live March 2026 (kit about $418, about $57/month)",
                        "others": "verify current status on Starlink's availability map"},
    "direct_to_cell": "Airtel Africa + SpaceX direct-to-cell rollout across Airtel's 14 African markets from 2026 (text first), subject to each country's approval",
}
json.dump(infra, open(os.path.join(OUT, "infrastructure.json"), "w"), indent=1)

# ---------------- comms options ----------------
leo15 = {(r["satellites"]): r for r in LEO["results"] if r["inclination_deg"] == 15}
comms = {
    "_note": "Notional options for the S-3 space and backhaul layers. Costs are 15-year planning estimates (TBR).",
    "options": [
        {"id": "leo_iot", "name": "Own LEO IoT smallsat constellation (about 24 sats, 15 deg inclination, 550 km)",
         "serves": ["MO-1 sensor uplink", "MO-3 low-rate two-way"], "requirements": ["S3-01", "S3-02", "S3-03", "S3-04", "S3-09"],
         "latency": f"open sky: p95 wait {leo15[24]['open_sky_20deg']['p95_wait_min']} min (24 sats); under canopy (45 deg mask): p95 {leo15[24]['under_canopy_45deg']['p95_wait_min']} min",
         "cost_15yr_musd": 265,
         "cost_basis": "anchor: Kineis raised EUR 100M to fund a 25-nanosat IoT constellation (sourced); we assume about $100M per generation incl. launch and 4 gateways, 2 replenishments at 60%, $3M/yr operations (assumption). Low inclination needs dedicated small launches, not SSO rideshare at $7,000/kg.",
         "pros": ["Sovereign control of spectrum and service", "Tiny, cheap terminals (S3-04)", "Store-and-forward reaches anywhere"],
         "cons": ["Under-canopy links are slow without a relay", "Largest single cost line"]},
        {"id": "geo_broadcast", "name": "GEO hosted L-band broadcast payload",
         "serves": ["MO-2 spoken alerts to every community"], "requirements": ["S3-05", "S3-06", "S3-07", "S3-10"],
         "latency": "continuous coverage; seconds from uplink to every receiver",
         "cost_15yr_musd": 80,
         "cost_basis": "anchor: USAF CHIRP hosted payload cost $65M vs about $500M for a dedicated satellite (sourced); we assume $80M incl. uplink and 15-year hosting (assumption). Precedent: AfriStar (1998-2018) broadcast L-band digital radio over Africa to portable receivers.",
         "pros": ["One satellite covers the whole basin all the time", "Fixed receiver antenna, no pointing (S3-07)", "Proven over Africa (AfriStar)"],
         "cons": ["Broadcast only, no return channel", "Depends on finding a host satellite slot"]},
        {"id": "starlink_backhaul", "name": "Commercial broadband (Starlink) at hub, nodes and ranger stations",
         "serves": ["Station and node backhaul", "Backup path for MO-3"], "requirements": ["S3-08", "S3-10"],
         "latency": "real time (tens of ms)",
         "cost_15yr_musd_per_100_stations": round(100 * (389 + 50 * 12 * 15) / 1e6, 2),
         "cost_basis": "DRC price $389 kit + $50/month (sourced)",
         "pros": ["Very cheap per site", "High bandwidth for images, voice, video"],
         "cons": ["Licensed only in some basin countries (DRC 2025, CAR 2026; others verify)", "Needs clear sky and about 50-100 W", "Cannot serve $150 sensors or $25 receivers", "Foreign commercial dependency: DRC banned it before licensing"]},
        {"id": "iridium_sbd", "name": "Commercial Iridium SBD for sensors",
         "serves": ["MO-1 sensor uplink"], "requirements": ["S3-02", "S3-03"],
         "latency": "near real time",
         "cost_15yr_musd_10k_terminals": round(10000 * 26.99 * 12 * 15 / 1e6, 1),
         "cost_15yr_musd_100k_terminals": round(100000 * 26.99 * 12 * 15 / 1e6, 1),
         "cost_basis": "$26.99/month plan + $50 activation (sourced, one reseller); module price not sourced",
         "pros": ["Exists today, global", "Named interoperability target in the RFP"],
         "cons": ["Airtime cost scales with every terminal", "Module cost likely above S3-04 $150 cap (verify)"]},
        {"id": "dtc", "name": "Direct-to-cell text alerts (Airtel + Starlink)",
         "serves": ["MO-2 supplementary channel to existing phones"], "requirements": ["S3-07 objective"],
         "latency": "minutes (text)", "cost_15yr_musd": None,
         "cost_basis": "commercial service, pricing not public",
         "pros": ["Reaches phones people already own (S3-07 objective)"],
         "cons": ["Only in Airtel markets with approval", "Many people have no phone or no charge"]},
        {"id": "station_relay", "name": "Ranger-station tower as canopy-top relay (LoRa-class mesh to tower)",
         "serves": ["MO-1 under-canopy sensors", "MO-3 local two-way"], "requirements": ["S3-01", "S3-03", "S3-04"],
         "latency": "seconds to the tower, then the satellite path",
         "cost_15yr_musd": None, "cost_basis": "included in station cost",
         "pros": ["Fixes the under-canopy latency problem the LEO model shows", "Reuses the tower we build anyway"],
         "cons": ["Only within about 15-25 km of a station"]},
    ],
    "notional_baseline": ["leo_iot", "geo_broadcast", "station_relay", "starlink_backhaul"],
    "baseline_label": "Notional baseline, trade study pending",
}
json.dump(comms, open(os.path.join(OUT, "comms_options.json"), "w"), indent=1)

# ---------------- budget stack at the sweet spot ----------------
cap = CM["budget"]["lcc_cap_usd"] / 1e6
rows = []
for key in ("mix_2041", "radio_2041"):
    r = ST["runs"][key]
    k = r["sweet_spot_knee"]
    rows.append({"run": key, "stations": k, "station_cost_musd": r["stations"][k - 1]["cum_cost_musd"],
                 "pct_people_covered": r["stations"][k - 1]["cum_pct"]})
recv = rec["2041"]
budget = {
    "cap_musd": cap,
    "lines_musd": {"LEO IoT constellation": 265, "GEO broadcast payload": 80,
                   "Ranger stations (sweet spot, mix, 2041)": rows[0]["station_cost_musd"],
                   "Community receivers (S3-07 threshold)": round(recv["cost_threshold_usd"] / 1e6, 1),
                   "Commercial backhaul": round(rows[0]["stations"] * (389 + 50 * 12 * 15) / 1e6 + 4 * (389 + 50 * 180) / 1e6, 1)},
    "excluded": ["Staff salaries (set aside)", "Sensors themselves (owned by user agencies)"],
    "sweet_spots": rows,
}
budget["total_musd"] = round(sum(budget["lines_musd"].values()), 1)
budget["over_cap_musd"] = round(budget["total_musd"] - cap, 1)
json.dump(budget, open(os.path.join(OUT, "budget.json"), "w"), indent=1)
print(json.dumps(budget, indent=1))
print("receivers:", rec)
print({s["id"]: len(s["sample_points"]) for s in sens})
