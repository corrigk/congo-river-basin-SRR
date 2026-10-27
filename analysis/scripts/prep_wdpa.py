"""
Step 0 (optional): protected-area polygons from the WDPA for the 10 basin countries.

Input : raw/wdpa/WDPA_WDOECM_<Mon><YYYY>_Public_<ISO3>_shp.zip   (per-country downloads from
        protectedplanet.net; each holds shp_0/1/2.zip shards with polygons and points)
Output: raw/wdpa/protected_areas_wdpa.geojson   (read by build_sensors_comms_budget.py)

Kept: nationally designated, designated / inscribed / established, terrestrial or mixed
protected areas (not OECMs), clipped to the basin, at least MIN_KM2 inside it, simplified.
International designations (Ramsar, World Heritage, MAB) are dropped because they overlap the
national parks and reserves they contain.

Licence: WDPA terms of use (non-commercial). Cite as
  UNEP-WCMC and IUCN (<year>), Protected Planet: The World Database on Protected Areas (WDPA)
  and World Database on OECMs (WDOECM) [Online], <Month Year>, Cambridge, UK: UNEP-WCMC and IUCN.
  Available at: www.protectedplanet.net.
"""
import glob, io, json, os, re, zipfile
import shapefile  # pyshp
import pyproj
from shapely.geometry import shape, mapping
from shapely.ops import transform, unary_union  # transform is deprecated in shapely 2.2 but still correct

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "..", "raw", "wdpa")
OUT = os.path.join(RAW, "protected_areas_wdpa.geojson")
MIN_KM2 = 100
STATUS_OK = {"Designated", "Inscribed", "Established"}
eq_area = pyproj.Transformer.from_crs("EPSG:4326", "ESRI:102022", always_xy=True).transform


def area_km2(g):
    return transform(eq_area, g).area / 1e6


def polygon_shards(zpath):
    """Yield pyshp readers for the polygon layers inside a per-country WDPA zip."""
    outer = zipfile.ZipFile(zpath)
    for inner_name in [n for n in outer.namelist() if re.search(r"_shp_\d\.zip$", n)]:
        inner = zipfile.ZipFile(io.BytesIO(outer.read(inner_name)))
        stems = {n[:-4] for n in inner.namelist() if n.endswith(".shp") and "polygons" in n.lower()}
        for s in stems:
            yield shapefile.Reader(shp=io.BytesIO(inner.read(s + ".shp")), shx=io.BytesIO(inner.read(s + ".shx")),
                                   dbf=io.BytesIO(inner.read(s + ".dbf")), encoding="utf-8")


def main():
    basin_fc = json.load(open(os.path.join(HERE, "..", "data", "basin.geojson")))
    basin = unary_union([shape(f["geometry"]) for f in basin_fc["features"]])
    zips = sorted(glob.glob(os.path.join(RAW, "WDPA_WDOECM_*_Public_*_shp.zip")))
    if not zips:
        raise SystemExit(f"No WDPA zips in {RAW}")
    release = re.search(r"WDPA_WDOECM_(\w+?)_Public", os.path.basename(zips[0])).group(1)
    feats, seen = [], set()
    for z in zips:
        for r in polygon_shards(z):
            f = [x[0] for x in r.fields[1:]]
            for sr in r.iterShapeRecords():
                a = dict(zip(f, sr.record))
                # Field names follow the WDPA/WDOECM manual v1.6 (2025-): SITE_ID, SITE_TYPE, REALM.
                if a.get("SITE_TYPE") != "PA" or a.get("STATUS") not in STATUS_OK:
                    continue
                if a.get("DESIG_TYPE") != "National" or a.get("REALM") == "Marine":
                    continue
                if a["SITE_ID"] in seen:
                    continue
                g = shape(sr.shape.__geo_interface__)
                if not g.is_valid:
                    g = g.buffer(0)
                if not g.intersects(basin):
                    continue
                g = g.intersection(basin)
                km2 = area_km2(g)
                if km2 < MIN_KM2:
                    continue
                seen.add(a["SITE_ID"])
                c = g.representative_point()
                feats.append({"type": "Feature",
                              "geometry": mapping(g.simplify(0.02, preserve_topology=True)),
                              "properties": {"name": a.get("NAME_ENG") or a["NAME"], "country": a["ISO3"], "desig": a["DESIG_ENG"],
                                             "iucn": a["IUCN_CAT"], "status_yr": a.get("STATUS_YR"),
                                             "wdpaid": a["SITE_ID"], "area_km2_in_basin": round(km2),
                                             "lat": round(c.y, 3), "lon": round(c.x, 3)}})
    feats.sort(key=lambda x: -x["properties"]["area_km2_in_basin"])
    out = {"type": "FeatureCollection", "release": release, "features": feats}
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, separators=(",", ":"))
    tot = sum(x["properties"]["area_km2_in_basin"] for x in feats)
    print(f"WDPA {release}: {len(feats)} protected areas >= {MIN_KM2} km2 in the basin, {tot/1e3:.0f}k km2 "
          f"({tot/area_km2(basin)*100:.1f}% of basin); {os.path.getsize(OUT)/1e3:.0f} kB")
    for x in feats[:8]:
        p = x["properties"]
        print(f"  {p['name']} ({p['country']}, {p['desig']}): {p['area_km2_in_basin']:,} km2")


if __name__ == "__main__":
    main()
