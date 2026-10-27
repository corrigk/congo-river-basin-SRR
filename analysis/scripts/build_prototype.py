"""Inject the data files into prototypes/template.html -> prototypes/srr_prototype.html (one self-contained file)."""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(HERE, "..", "data")
P = os.path.join(HERE, "..", "prototypes")
load = lambda n: json.load(open(os.path.join(D, n)))
data = {
    "pop": load("population.json"), "st": load("stations.json"), "db": load("databases.json"),
    "fn": load("functions.json"), "cost": load("cost_model.json"), "countries": load("countries.geojson"),
    "basin": load("basin.geojson"), "rivers": load("rivers.geojson"), "lakes": load("lakes.geojson"),
    "roads": load("roads.geojson"), "pa": load("protected_areas.json"), "sn": load("sensors.json"),
    "infra": load("infrastructure.json"), "leo": load("leo_revisit.json"), "comms": load("comms_options.json"),
}
data["st"].pop("_method", None)
data["leo"].pop("_method", None)
html = open(os.path.join(P, "template.html")).read().replace("/*__DATA__*/null", json.dumps(data, separators=(",", ":")))
out = os.path.join(P, "srr_prototype.html")
open(out, "w").write(html)
print(f"{out}: {os.path.getsize(out)/1e6:.2f} MB")
