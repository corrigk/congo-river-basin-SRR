"""
Step 4: where do the main hub and the regional databases go?

Rule set (each is a stated design decision):
  1. Main hub = Kinshasa (fixed): largest urban area in the basin, national
     government and disaster agency seat, Tier III data centre, subsea-cable
     route via Muanda, Inga hydro grid.
  2. Up to 3 more database nodes (4 total). Choose the set that minimizes the
     population-weighted distance from every basin resident to their nearest
     node (p-median, 2041 population), subject to:
       - at least MIN_SEP_KM between any two nodes (no shared flood, power or
         conflict event takes out two at once)
       - not in, or within CONFLICT_BUFFER_KM of, a city under active armed-group
         control (Goma, Bukavu)
       - city of >= 400k people (staff, power, fibre, airport)
Outputs data/databases.json
"""
import json, os, itertools, math
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data")
MIN_SEP_KM = 500
CONFLICT_BUFFER_KM = 150
KM = 111.32

CANDIDATES = {  # name: (lat, lon, country, notes)
    "Kinshasa": (-4.325, 15.322, "DRC", "Main hub (fixed). UN 2025 urban area about 10.9M; Raxio Tier III data centre (1.5 MW, 2024); OADC data centre; WACS subsea cable lands at Muanda."),
    "Brazzaville": (-4.263, 15.283, "Rep. of Congo", "Capital across the river from Kinshasa; too close to be an independent backup."),
    "Bangui": (4.361, 18.555, "CAR", "CAR capital on the Ubangi; Starlink licensed in CAR (service from March 2026)."),
    "Lubumbashi": (-11.661, 27.479, "DRC", "About 2.8M; mining hub; Raxio has announced a Lubumbashi site; separate southern grid."),
    "Mbuji-Mayi": (-6.136, 23.590, "DRC", "About 3.6M (Kasai-Oriental urban area)."),
    "Kananga": (-5.896, 22.417, "DRC", "About 1.5M."),
    "Kisangani": (0.516, 25.191, "DRC", "About 0.9M; head of navigation on the middle Congo; central-north basin."),
    "Kolwezi": (-10.716, 25.472, "DRC", "Mining city near Lubumbashi."),
    "Tshikapa": (-6.416, 20.800, "DRC", "About 1.05M."),
    "Kikwit": (-5.041, 18.816, "DRC", "About 0.55M."),
    "Mbandaka": (0.048, 18.260, "DRC", "Equator, Cuvette Centrale; flood-exposed river city."),
    "Kalemie": (-5.947, 29.194, "DRC", "About 0.76M; Lake Tanganyika port."),
    "Bujumbura": (-3.382, 29.361, "Burundi", "Lake Tanganyika; different country."),
    "Goma": (-1.679, 29.222, "DRC", "EXCLUDED: under AFC/M23 control (2025-2026)."),
    "Bukavu": (-2.508, 28.861, "DRC", "EXCLUDED: under AFC/M23 control (2025-2026)."),
}
EXCLUDED = {"Goma", "Bukavu", "Brazzaville"}  # Brazzaville fails the separation rule from Kinshasa anyway


def gc_km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def main():
    P = json.load(open(os.path.join(OUT, "population.json")))
    idx = np.array(P["cells"]["i"])
    lon = P["lon0"] + (idx % P["nx"]) * P["res_deg"]
    lat = P["lat0"] + (idx // P["nx"]) * P["res_deg"]
    pop = np.array(P["pop"]["2041"], float)

    def dist_to(c):
        la, lo = CANDIDATES[c][:2]
        dx = (lon - lo) * np.cos(np.radians((lat + la) / 2)) * KM
        dy = (lat - la) * KM
        return np.hypot(dx, dy)

    D = {c: dist_to(c) for c in CANDIDATES}
    near_conflict = {c for c in CANDIDATES if any(gc_km(CANDIDATES[c][:2], CANDIDATES[x][:2]) < CONFLICT_BUFFER_KM
                                                  for x in ("Goma", "Bukavu"))}
    pool = [c for c in CANDIDATES if c not in EXCLUDED and c not in near_conflict and c != "Kinshasa"]
    print("excluded near conflict:", sorted(near_conflict - EXCLUDED))
    results = []
    for k in (1, 2, 3):
        for combo in itertools.combinations(pool, k):
            nodes = ("Kinshasa",) + combo
            seps = [gc_km(CANDIDATES[a][:2], CANDIDATES[b][:2]) for a, b in itertools.combinations(nodes, 2)]
            if min(seps) < MIN_SEP_KM:
                continue
            dmin = np.min(np.vstack([D[c] for c in nodes]), axis=0)
            mean = float((dmin * pop).sum() / pop.sum())
            within500 = float(pop[dmin <= 500].sum() / pop.sum() * 100)
            results.append({"nodes": list(nodes), "k": len(nodes), "mean_km": round(mean),
                            "pct_pop_within_500km": round(within500, 1), "min_sep_km": round(min(seps))})
    best = {}
    for r in results:
        if r["k"] not in best or r["mean_km"] < best[r["k"]]["mean_km"]:
            best[r["k"]] = r
    top4 = sorted([r for r in results if r["k"] == 4], key=lambda r: r["mean_km"])[:6]
    only_kin = float((D["Kinshasa"] * pop).sum() / pop.sum())

    table = []
    for c, (la, lo, ctry, note) in CANDIDATES.items():
        table.append({"name": c, "lat": la, "lon": lo, "country": ctry, "notes": note,
                      "km_from_kinshasa": round(gc_km((la, lo), CANDIDATES["Kinshasa"][:2])),
                      "excluded": c in EXCLUDED or c in near_conflict,
                      "pop_within_300km_2041_M": round(float(pop[D[c] <= 300].sum()) / 1e6, 1)})
    out = {"_method": __doc__.strip(), "min_sep_km": MIN_SEP_KM,
           "kinshasa_only_mean_km": round(only_kin),
           "best_by_count": best, "top_sets_of_4": top4, "candidates": table,
           "recommended": best[4]["nodes"],
           "roles": {
               "Kinshasa": "DB-1 main hub: decisions, COP, CAP authorization interface with national agencies, primary satellite gateway",
               "_regional": "DB-2..4 regional nodes: satellite gateway + edge database that receives data first, filters and forwards to the hub, holds a full replica, and can run the alert chain if the hub is cut off"}}
    with open(os.path.join(OUT, "databases.json"), "w") as f:
        json.dump(out, f, indent=1)
    print("Kinshasa only: mean distance", round(only_kin), "km")
    for k, r in sorted(best.items()):
        print(k, r)
    print("top sets of 4:")
    for r in top4:
        print("  ", r)


if __name__ == "__main__":
    main()
