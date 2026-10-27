"""
Step 2: population surface for the basin, now and +5/+10/+15 years.

TWO MODES
  --worldpop path.tif   (PREFERRED) use a real WorldPop / GHS-POP raster
                        (e.g. WorldPop 2020 1km UN-adjusted mosaic clipped to the
                        10 basin countries). Cells are summed onto the model grid and
                        projected forward with the national growth rates below.
  (default)             MODELED PROXY. Urban population is placed at known towns;
                        rural population is spread along rivers and roads (where
                        people in the Congo basin overwhelmingly live) and then
                        calibrated so each country's total and urban share match the
                        UN figures below. Good for the pattern; not a census.

Output: data/population.json  (grid + population per year)
"""
import json, os, math, argparse
import numpy as np
import shapely
from shapely.geometry import shape
from shapely.ops import unary_union
from scipy.spatial import cKDTree
import geonamescache

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "..", "raw")
OUT = os.path.join(HERE, "..", "data")
RES = 0.125                      # degrees (~13.9 km at the equator)
YEARS = [2026, 2031, 2036, 2041]  # now, +5, +10, +15
KM_PER_DEG = 111.32

# UN WPP via Worldometers (2026 population, yearly change, urban share). Sources in sources.json
COUNTRIES = {
    #  iso3  iso2  pop2026      growth  urban
    "COD": ("CD", 116_452_162, 0.0321, 0.45),
    "COG": ("CG", 6_637_785, 0.0236, 0.70),
    "CAF": ("CF", 5_698_984, 0.0337, 0.45),
    "CMR": ("CM", 30_640_817, 0.0255, 0.60),
    "AGO": ("AO", 40_215_179, 0.0301, 0.69),
    "ZMB": ("ZM", 22_521_915, 0.0277, 0.47),
    "TZA": ("TZ", 72_563_780, 0.0286, 0.41),
    "BDI": ("BI", 14_729_157, 0.0236, 0.15),
    "RWA": ("RW", 14_889_693, 0.0220, 0.18),
    "GAB": ("GA", 2_647_399, 0.0209, 0.84),
}
# DRC has an explicit UN medium-variant path; others use their 2026 rate, easing 0.03 pp/yr
DRC_PATH = {2026: 116_452_162, 2030: 131_532_201, 2035: 151_560_103, 2040: 172_595_582, 2045: 194_865_379}
URBAN_SHARE_GAIN = 0.005  # +0.5 percentage points per year (assumption, consistent with UN urbanization trend)

# UN World Urbanization Prospects 2025 urban-area estimates (Worldometers) override stale gazetteer values
CITY_OVERRIDES = {
    "Kinshasa": 10_943_641, "Mbuji-Mayi": 3_605_738, "Lubumbashi": 2_832_853, "Kananga": 1_504_370,
    "Tshikapa": 1_054_686, "Bukavu": 948_948, "Kisangani": 900_330, "Goma": 809_601,
    "Kalemie": 758_379, "Kamina": 724_982, "Likasi": 673_034, "Kikwit": 549_102, "Manono": 517_304,
}


def load(name):
    with open(os.path.join(RAW, name)) as f:
        return json.load(f)["features"]


def nat_pop(iso3, year):
    if iso3 == "COD":
        ks = sorted(DRC_PATH)
        for a, b in zip(ks, ks[1:]):
            if a <= year <= b:
                t = (year - a) / (b - a)
                return DRC_PATH[a] * (DRC_PATH[b] / DRC_PATH[a]) ** t
    _, _, p, r, _ = (None,) + COUNTRIES[iso3]
    for _ in range(year - 2026):
        p *= 1 + r
        r = max(r - 0.0003, 0.01)
    return p


def line_points(geoms, step=0.03):
    pts = []
    for g in geoms:
        for part in (g.geoms if hasattr(g, "geoms") else [g]):
            if part.geom_type not in ("LineString", "LinearRing"):
                continue
            L = part.length
            n = max(2, int(L / step))
            for i in range(n + 1):
                p = part.interpolate(i / n, normalized=True)
                pts.append((p.x, p.y))
    return np.array(pts)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--worldpop", nargs="+", help="optional population raster(s) (GeoTIFF, WGS84); several are summed, e.g. one per country")
    a = ap.parse_args()

    basin = shape(json.load(open(os.path.join(OUT, "basin.geojson")))["features"][0]["geometry"])
    ctry = {f["properties"]["ADM0_A3"]: shape(f["geometry"]) for f in load("ne_10m_admin_0_countries.geojson")
            if f["properties"]["ADM0_A3"] in COUNTRIES}
    allc = unary_union(list(ctry.values()))
    minx, miny, maxx, maxy = allc.bounds
    xs = np.arange(math.floor(minx / RES) * RES + RES / 2, maxx, RES)
    ys = np.arange(math.floor(miny / RES) * RES + RES / 2, maxy, RES)
    X, Y = np.meshgrid(xs, ys)
    X, Y = X.ravel(), Y.ravel()
    cid = np.full(X.shape, -1)
    keys = list(COUNTRIES)
    for i, k in enumerate(keys):
        cid[shapely.contains_xy(ctry[k], X, Y)] = i
    land = cid >= 0
    in_basin = shapely.contains_xy(basin, X, Y)
    coslat = np.cos(np.radians(Y))
    cell_km2 = (RES * KM_PER_DEG) ** 2 * coslat

    # distance features (km), using local equirectangular scaling
    def dist_km(pts):
        if len(pts) == 0:
            return np.full(X.shape, 1e4)
        t = cKDTree(np.c_[pts[:, 0] * np.cos(np.radians(pts[:, 1])), pts[:, 1]])
        d, _ = t.query(np.c_[X * coslat, Y])
        return d * KM_PER_DEG

    rivers = [shape(f["geometry"]) for f in load("ne_10m_rivers_lake_centerlines.geojson")
              if f["geometry"] and shape(f["geometry"]).intersects(allc.envelope)]
    roads = [shape(f["geometry"]) for f in load("ne_10m_roads.geojson")
             if f["geometry"] and f["properties"].get("continent") == "Africa"
             and shape(f["geometry"]).intersects(allc.envelope)]
    d_river = dist_km(line_points(rivers))
    d_road = dist_km(line_points(roads))

    gc = geonamescache.GeonamesCache()
    iso2map = {v[0]: k for k, v in COUNTRIES.items()}
    towns = []
    for c in gc.get_cities().values():
        if c["countrycode"] in iso2map:
            towns.append([c["name"], iso2map[c["countrycode"]], c["latitude"], c["longitude"],
                          CITY_OVERRIDES.get(c["name"], c["population"])])
    tp = np.array([[t[3], t[2]] for t in towns])
    d_town = dist_km(tp)

    # ---------------- base year surface ----------------
    pop = {y: np.zeros(X.shape) for y in YEARS}
    w_rural = (0.06 + 1.0 * np.exp(-d_river / 8) + 1.3 * np.exp(-d_road / 6) + 0.9 * np.exp(-d_town / 25)) * cell_km2
    w_periurban = np.exp(-d_town / 12) * cell_km2
    tree = cKDTree(np.c_[X * coslat, Y])

    urban_layer = np.zeros(X.shape)
    for name, iso3, lat, lon, p in towns:
        sigma_km = 2.5 + 4.0 * math.sqrt(p / 1e6)
        idx = tree.query_ball_point([lon * math.cos(math.radians(lat)), lat], r=3 * sigma_km / KM_PER_DEG)
        if not idx:
            continue
        idx = np.array(idx)
        dd = np.hypot((X[idx] - lon) * coslat[idx], Y[idx] - lat) * KM_PER_DEG
        k = np.exp(-0.5 * (dd / sigma_km) ** 2)
        urban_layer[idx] += p * k / k.sum()

    for y in YEARS:
        for i, k in enumerate(keys):
            m = cid == i
            total = nat_pop(k, y)
            ushare = min(0.9, COUNTRIES[k][3] + URBAN_SHARE_GAIN * (y - 2026))
            U = total * ushare
            # listed towns grow with the national urban total, capped at 95% of it
            U0 = COUNTRIES[k][1] * COUNTRIES[k][3]
            ul = urban_layer[m] * (U / U0)
            if ul.sum() > 0.95 * U:
                ul *= 0.95 * U / ul.sum()
            resid_urban = max(U - ul.sum(), 0)
            pu = w_periurban[m]
            rural = total - U
            wr = w_rural[m]
            pop[y][m] = ul + resid_urban * pu / pu.sum() + rural * wr / wr.sum()

    if a.worldpop:
        import rasterio
        base = np.zeros(X.shape)
        for path in a.worldpop:  # one raster per country: per-country files do not overlap, so sum them
            with rasterio.open(path) as src:
                arr = src.read(1, masked=True).filled(0)
                T = src.transform
                rows, cols = np.nonzero(arr > 0)
                lon = T.c + (cols + 0.5) * T.a
                lat = T.f + (rows + 0.5) * T.e
                gi = np.floor((lat - ys[0] + RES / 2) / RES).astype(int)
                gj = np.floor((lon - xs[0] + RES / 2) / RES).astype(int)
                ok = (gi >= 0) & (gi < len(ys)) & (gj >= 0) & (gj < len(xs))
                np.add.at(base, gi[ok] * len(xs) + gj[ok], arr[rows[ok], cols[ok]])
        raster_year = int(os.environ.get("WORLDPOP_YEAR", 2020))
        for y in YEARS:
            for i, k in enumerate(keys):
                m = cid == i
                f = nat_pop(k, y) / max(base[m].sum(), 1)
                pop[y][m] = base[m] * f
        names = os.path.basename(a.worldpop[0]) if len(a.worldpop) == 1 else f"{len(a.worldpop)} country rasters"
        mode = f"WorldPop {raster_year} 1 km UN-adjusted ({names}), scaled to UN national totals per year"
    else:
        mode = "modeled proxy (towns + river/road-weighted rural), calibrated to UN national totals"

    sel = in_basin & land
    out = {
        "mode": mode,
        "res_deg": RES,
        "years": YEARS,
        "lon0": round(float(xs[0]), 4), "lat0": round(float(ys[0]), 4),
        "nx": len(xs), "ny": len(ys),
        "cells": {
            "i": (np.nonzero(sel)[0]).tolist(),
            "country": [keys[c] for c in cid[sel]],
            "km2": np.round(cell_km2[sel], 1).tolist(),
            "river_km": np.round(d_river[sel], 1).tolist(),
            "road_km": np.round(d_road[sel], 1).tolist(),
            "town_km": np.round(d_town[sel], 1).tolist(),
        },
        "pop": {str(y): np.round(pop[y][sel]).astype(int).tolist() for y in YEARS},
        "summary": {},
    }
    for y in YEARS:
        s = {"basin_total": int(pop[y][sel].sum())}
        for i, k in enumerate(keys):
            s[k] = int(pop[y][sel & (cid == i)].sum())
        out["summary"][str(y)] = s
    with open(os.path.join(OUT, "population.json"), "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(mode)
    print("basin cells:", int(sel.sum()))
    for y in YEARS:
        print(y, f"{out['summary'][str(y)]['basin_total']/1e6:.1f} M in basin",
              {k: round(v / 1e6, 1) for k, v in out["summary"][str(y)].items() if k != "basin_total"})


if __name__ == "__main__":
    main()
