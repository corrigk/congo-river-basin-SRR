"""The "why" layers for the ConOps map: where conflict, fire and floods hit the basin.

Inputs (analysis/raw/hazards/, git-ignored; see sources.json for citations):
  ucdp/ged251-csv.zip        UCDP Georeferenced Event Dataset v25.1 (CC BY 4.0)
  firms/modis_2024_*.csv     NASA FIRMS MODIS C6.1 active fires, 2024, DR Congo only
  gdacs/*.json               GDACS flood and drought event lists (EC JRC), when present

Output: data/hazards.json, aggregated onto the population grid (0.125 deg cells, index i = iy * nx + ix,
rows from the south), so the page draws them with the same cells as population and coverage.

  python -I scripts/build_hazards.py
"""
import csv
import glob
import io
import json
import math
import os
import zipfile

from shapely.geometry import Point, shape
from shapely.prepared import prep

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RAW = os.path.join(ROOT, "raw", "hazards")
DATA = os.path.join(ROOT, "data")

YEARS_CONFLICT = (2015, 2024)  # ten full years
FIRE_MIN_CONFIDENCE = 50       # FIRMS MODIS confidence 0-100; below 50 is mostly noise


def load_json(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


basin = prep(shape(load_json("basin.geojson")["features"][0]["geometry"]))
pop = load_json("population.json")
RES, LON0, LAT0, NX, NY = pop["res_deg"], pop["lon0"], pop["lat0"], pop["nx"], pop["ny"]
grid_cells = set(pop["cells"]["i"])


def cell(lon, lat):
    ix = math.floor((lon - (LON0 - RES / 2)) / RES)
    iy = math.floor((lat - (LAT0 - RES / 2)) / RES)
    if 0 <= ix < NX and 0 <= iy < NY:
        i = iy * NX + ix
        return i if i in grid_cells else None
    return None


def in_basin(lon, lat):
    return basin.contains(Point(lon, lat))


# ---------- conflict: UCDP GED ----------
def conflict():
    z = zipfile.ZipFile(os.path.join(RAW, "ucdp", "ged251-csv.zip"))
    f = io.TextIOWrapper(z.open(z.namelist()[0]), encoding="utf-8")
    cells, kinds, n_events, deaths = {}, {1: 0, 2: 0, 3: 0}, 0, 0
    by_year = {}
    for row in csv.DictReader(f):
        y = int(row["year"])
        if not (YEARS_CONFLICT[0] <= y <= YEARS_CONFLICT[1]) or row["region"] != "Africa":
            continue
        lon, lat = float(row["longitude"]), float(row["latitude"])
        if not in_basin(lon, lat):
            continue
        i = cell(lon, lat)
        if i is None:
            continue
        d = int(row["best"] or 0)
        c = cells.setdefault(i, [0, 0])
        c[0] += 1
        c[1] += d
        n_events += 1
        deaths += d
        kinds[int(row["type_of_violence"])] += 1
        by_year[y] = by_year.get(y, 0) + 1
    return {
        "source": "ucdp_ged",
        "years": list(YEARS_CONFLICT),
        "events": n_events,
        "deaths_best": deaths,
        "by_type": {"state_based": kinds[1], "non_state": kinds[2], "one_sided": kinds[3]},
        "by_year": dict(sorted(by_year.items())),
        "cells": {str(k): v for k, v in sorted(cells.items())},  # i -> [events, deaths]
    }


# ---------- fires: NASA FIRMS ----------
def fires():
    files = glob.glob(os.path.join(RAW, "firms", "*.csv"))
    cells, n = {}, 0
    for path in files:
        with open(path, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                if int(row["confidence"]) < FIRE_MIN_CONFIDENCE:
                    continue
                lon, lat = float(row["longitude"]), float(row["latitude"])
                i = cell(lon, lat)
                if i is None or not in_basin(lon, lat):
                    continue
                cells[i] = cells.get(i, 0) + 1
                n += 1
    return {
        "source": "nasa_firms",
        "year": 2024,
        "coverage": "DR Congo only (about 75% of the basin)",
        "min_confidence": FIRE_MIN_CONFIDENCE,
        "detections": n,
        "cells": {str(k): v for k, v in sorted(cells.items())},  # i -> detections
    }


# ---------- floods and droughts: GDACS ----------
def gdacs():
    events, seen = [], set()
    for path in sorted(glob.glob(os.path.join(RAW, "gdacs", "*.json"))):
        with open(path, encoding="utf-8") as f:
            try:
                fc = json.load(f)
            except json.JSONDecodeError:
                continue
        for feat in fc.get("features", []):
            p, g = feat.get("properties", {}), feat.get("geometry") or {}
            if g.get("type") != "Point":
                continue
            lon, lat = g["coordinates"][:2]
            key = (p.get("eventtype"), p.get("eventid"))
            if key in seen or not in_basin(lon, lat):
                continue
            seen.add(key)
            events.append({
                "type": p.get("eventtype"), "lon": round(lon, 3), "lat": round(lat, 3),
                "from": (p.get("fromdate") or "")[:10], "to": (p.get("todate") or "")[:10],
                "alert": p.get("alertlevel"), "name": p.get("name") or p.get("eventname") or "",
                "country": p.get("country") or "",
            })
    events.sort(key=lambda e: e["from"])
    return {"source": "gdacs", "events": events}


out = {
    "_note": "Problem layers for the ConOps 'why' map, on the population grid. Built by scripts/build_hazards.py.",
    "grid": {"res_deg": RES, "lon0": LON0, "lat0": LAT0, "nx": NX},
    "conflict": conflict(),
    "fires": fires(),
    "floods": gdacs(),
}
with open(os.path.join(DATA, "hazards.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, separators=(",", ":"))
c, fi, fl = out["conflict"], out["fires"], out["floods"]
print(f"conflict {c['years'][0]}-{c['years'][1]}: {c['events']} events, {c['deaths_best']} deaths (best), {len(c['cells'])} cells")
print(f"fires 2024: {fi['detections']} detections >= {FIRE_MIN_CONFIDENCE}% confidence, {len(fi['cells'])} cells")
print(f"gdacs: {len(fl['events'])} events in basin ({sum(e['type'] == 'FL' for e in fl['events'])} floods)")
