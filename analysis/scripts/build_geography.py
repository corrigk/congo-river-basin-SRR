"""
Step 1: build the geographic base layers for the SRR page.

Inputs : Natural Earth 10m GeoJSON (raw/), geonamescache (pip)
Outputs: data/basin.geojson, data/rivers.geojson, data/lakes.geojson,
         data/roads.geojson, data/countries.geojson, data/towns.json

IMPORTANT LIMITATION
The basin outline built here is an APPROXIMATION: a concave hull around the
Congo river network, buffered and area-calibrated to the RFP's 3.7M km2.
If the repo already has a HydroSHEDS / HydroBASINS outline, use that instead:
pass --basin path/to/basin.geojson and this script will use it unchanged.
"""
import json, argparse, math, os
import numpy as np
from shapely.geometry import shape, mapping, MultiPoint, Point, box
from shapely.ops import unary_union, transform
from shapely import concave_hull
import pyproj, geonamescache

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "..", "raw")
OUT = os.path.join(HERE, "..", "data")

CONGO_RIVERS = {
    "Congo", "Lualaba", "Ubangi", "Uele", "Bomu", "Kasai", "Kwango", "Kwilu",
    "Sankuru", "Lukenie", "Lomami", "Aruwimi", "Ituri", "Tshuapa", "Busira",
    "Ruki", "Lokoro", "Fimi", "Sangha", "Kadéï", "Dja", "Alima", "Lobaye",
    "Lua", "Mongala", "Ebola", "Kotto", "Chinko", "Kibali", "Luapula",
    "Chambeshi", "Luvua", "Lufira", "Lukuga", "Rusizi", "Malagarasi", "Ugalla",
    "Gombe", "Igombe", "Inkisi",
}
CONGO_LAKES = {"Lake Tanganyika", "Lake Mweru", "Lake Kivu", "Lake Bangweulu",
               "Lake Mai-Ndombe", "Lac Mai-Ndombe", "Lake Tumba", "Lac Tumba",
               "Lake Upemba", "Lac Upemba", "Lake Mweru Wantipa"}
BASIN_ISO = ["COD", "COG", "CAF", "CMR", "AGO", "ZMB", "TZA", "BDI", "RWA", "GAB"]
TARGET_KM2 = 3.7e6
BBOX = box(8, -19, 41, 14)

eq_area = pyproj.Transformer.from_crs("EPSG:4326", "ESRI:102022", always_xy=True).transform  # Africa Albers


def load(name):
    with open(os.path.join(RAW, name)) as f:
        return json.load(f)["features"]


def area_km2(geom):
    return transform(eq_area, geom).area / 1e6


def round_geom(g, nd=3):
    """Round coordinates to keep files small (~100 m precision)."""
    def r(c):
        if isinstance(c[0], (list, tuple)):
            return [r(x) for x in c]
        return [round(c[0], nd), round(c[1], nd)]
    m = mapping(g)
    return {"type": m["type"], "coordinates": r(m["coordinates"])}


def fc(features):
    return {"type": "FeatureCollection", "features": features}


def write(name, obj):
    with open(os.path.join(OUT, name), "w") as f:
        json.dump(obj, f, separators=(",", ":"))
    print(f"wrote {name}: {os.path.getsize(os.path.join(OUT, name))/1e3:.0f} kB")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--basin", help="optional authoritative basin polygon (GeoJSON)")
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)

    rivers = [f for f in load("ne_10m_rivers_lake_centerlines.geojson")
              if f["geometry"] and f["properties"].get("name") in CONGO_RIVERS
              and shape(f["geometry"]).intersects(BBOX)]
    lakes = [f for f in load("ne_10m_lakes.geojson")
             if f["geometry"] and shape(f["geometry"]).intersects(BBOX)
             and (f["properties"].get("name") or "") in CONGO_LAKES]

    if a.basin:
        with open(a.basin) as f:
            gj = json.load(f)
        basin = unary_union([shape(x["geometry"]) for x in gj.get("features", [gj])])
        source = "user-supplied"
    else:
        import shapely
        pts = []
        for f in rivers + lakes:
            pts.extend(shapely.get_coordinates(shape(f["geometry"])).tolist())
        hull = concave_hull(MultiPoint(pts), ratio=0.25)
        # carve out the Nile side of the eastern divide (Semliki/Lake Edward-Albert, Kagera)
        nile = [shape(f["geometry"]) for f in load("ne_10m_rivers_lake_centerlines.geojson")
                if f["geometry"] and f["properties"].get("name") in {"Semliki", "Kagera", "Albert Nile", "Victoria Nile"}]
        nile += [shape(f["geometry"]) for f in load("ne_10m_lakes.geojson")
                 if f["geometry"] and (f["properties"].get("name") or "") in {"Lake Edward", "Lake Albert", "Lake Victoria", "Lake George"}]
        nile_zone = unary_union([g.buffer(0.45) for g in nile])
        # calibrate buffer so the area matches the RFP figure
        lo, hi = 0.0, 3.0
        for _ in range(30):
            mid = (lo + hi) / 2
            if area_km2(hull.buffer(mid, 24).difference(nile_zone)) < TARGET_KM2:
                lo = mid
            else:
                hi = mid
        basin = hull.buffer(mid, 24).difference(nile_zone)
        if basin.geom_type == "MultiPolygon":
            basin = max(basin.geoms, key=lambda g: g.area)
        basin = basin.simplify(0.05)
        source = f"approximation: concave hull of Natural Earth Congo river network, buffered {mid:.2f} deg"
    basin_area = area_km2(basin)
    print(f"basin area {basin_area/1e6:.2f} M km2 ({source})")
    write("basin.geojson", fc([{"type": "Feature", "geometry": round_geom(basin, 3),
                                "properties": {"name": "Congo River Basin", "area_km2": round(basin_area),
                                               "source": source,
                                               "replace_with": "HydroBASINS level 3 Congo polygon (hydrosheds.org) or the repo's existing outline"}}]))

    # rivers clipped to basin, simplified
    rv = []
    for f in rivers:
        g = shape(f["geometry"]).intersection(basin.buffer(0.2)).simplify(0.01)
        if not g.is_empty:
            rv.append({"type": "Feature", "geometry": round_geom(g, 3),
                       "properties": {"name": f["properties"]["name"],
                                      "rank": f["properties"].get("scalerank")}})
    write("rivers.geojson", fc(rv))
    write("lakes.geojson", fc([{"type": "Feature", "geometry": round_geom(shape(f["geometry"]).simplify(0.01), 3),
                                "properties": {"name": f["properties"]["name"]}} for f in lakes]))

    # roads: Natural Earth major roads intersecting the basin
    rd = []
    for f in load("ne_10m_roads.geojson"):
        if not f["geometry"] or f["properties"].get("continent") != "Africa":
            continue
        g = shape(f["geometry"])
        if not g.intersects(basin):
            continue
        g = g.intersection(basin).simplify(0.01)
        if g.is_empty:
            continue
        rd.append({"type": "Feature", "geometry": round_geom(g, 3),
                   "properties": {"type": f["properties"].get("type"), "rank": f["properties"].get("scalerank")}})
    write("roads.geojson", fc(rd))

    cs = []
    for f in load("ne_10m_admin_0_countries.geojson"):
        if f["properties"]["ADM0_A3"] in BASIN_ISO:
            g = shape(f["geometry"]).simplify(0.03)
            inb = area_km2(g.intersection(basin))
            cs.append({"type": "Feature", "geometry": round_geom(g, 3),
                       "properties": {"iso3": f["properties"]["ADM0_A3"], "name": f["properties"]["NAME"],
                                      "basin_area_km2": round(inb)}})
    write("countries.geojson", fc(cs))

    # towns: geonamescache (pop >= 15k) + Natural Earth places, inside the basin
    gc = geonamescache.GeonamesCache()
    iso2 = {"CD", "CG", "CF", "CM", "AO", "ZM", "TZ", "BI", "RW", "GA"}
    towns = {}
    for c in gc.get_cities().values():
        if c["countrycode"] in iso2:
            p = Point(c["longitude"], c["latitude"])
            if basin.contains(p):
                towns[(round(c["latitude"], 2), round(c["longitude"], 2))] = {
                    "name": c["name"], "cc": c["countrycode"], "lat": round(c["latitude"], 4),
                    "lon": round(c["longitude"], 4), "pop": int(c["population"]), "src": "GeoNames (via geonamescache)"}
    for f in load("ne_10m_populated_places.geojson"):
        p = f["properties"]
        if p["ISO_A2"] in iso2:
            pt = Point(p["LONGITUDE"], p["LATITUDE"])
            if not basin.contains(pt):
                continue
            near = [k for k in towns if abs(k[0]-p["LATITUDE"]) < 0.08 and abs(k[1]-p["LONGITUDE"]) < 0.08]
            if near:
                t = towns[near[0]]
                t["pop"] = max(t["pop"], int(p["POP_MAX"] or 0))
                t["capital"] = t.get("capital") or bool(p["ADM0CAP"])
            else:
                towns[(round(p["LATITUDE"], 2), round(p["LONGITUDE"], 2))] = {
                    "name": p["NAME"], "cc": p["ISO_A2"], "lat": round(p["LATITUDE"], 4),
                    "lon": round(p["LONGITUDE"], 4), "pop": int(p["POP_MAX"] or 0),
                    "capital": bool(p["ADM0CAP"]), "src": "Natural Earth"}
    tl = sorted(towns.values(), key=lambda t: -t["pop"])
    write("towns_raw.json", tl)
    print(len(tl), "towns in basin; top:", [(t["name"], t["pop"]) for t in tl[:12]])


if __name__ == "__main__":
    main()
