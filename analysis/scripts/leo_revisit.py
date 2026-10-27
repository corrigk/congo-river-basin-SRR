"""
Step 5: how many LEO satellites does S3-03 need?

Simple two-body propagation (circular orbits, J2 ignored, Earth rotation
included) of Walker-style constellations at 550 km. For sample points across
the basin we measure how long a sensor waits until a satellite is in view of
BOTH the sensor (min elevation, higher for under-canopy) AND at least one
gateway at a database node (min elevation 10 deg). That wait is the
dominant term in S3-03 (priority message to the COP <= 30 min / <= 5 min).

Outputs data/leo_revisit.json
"""
import json, os, math
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data")
RE, MU, WE = 6378.137, 398600.4418, 7.2921159e-5
ALT = 550.0
DT = 20.0          # s
T_SIM = 2 * 86400  # s
GATEWAYS = {"Kinshasa": (-4.325, 15.322), "Mbuji-Mayi": (-6.136, 23.59),
            "Kisangani": (0.516, 25.191), "Kalemie": (-5.947, 29.194)}


def ecef(lat, lon, r=RE):
    la, lo = np.radians(lat), np.radians(lon)
    return np.stack([r * np.cos(la) * np.cos(lo), r * np.cos(la) * np.sin(lo), r * np.sin(la)], -1)


def sat_ecef(inc, raan, M0, t):
    a = RE + ALT
    n = math.sqrt(MU / a ** 3)
    u = M0 + n * t
    i, O = math.radians(inc), raan
    x = a * (np.cos(O) * np.cos(u) - np.sin(O) * np.sin(u) * math.cos(i))
    y = a * (np.sin(O) * np.cos(u) + np.cos(O) * np.sin(u) * math.cos(i))
    z = a * (np.sin(u) * math.sin(i))
    th = WE * t
    return np.stack([x * np.cos(th) + y * np.sin(th), -x * np.sin(th) + y * np.cos(th), z], -1)


def visible(ground, sats, min_el):
    """ground (G,3), sats (S,T,3) -> bool (G,S,T)"""
    g = ground[:, None, None, :]
    d = sats[None] - g
    up = g / np.linalg.norm(g, axis=-1, keepdims=True)
    sin_el = (d * up).sum(-1) / np.linalg.norm(d, axis=-1)
    return sin_el >= math.sin(math.radians(min_el))


def walker(n_sats, planes, inc, f=1):
    per = n_sats // planes
    els = []
    for p in range(planes):
        raan = 2 * math.pi * p / planes
        for s in range(per):
            M0 = 2 * math.pi * s / per + 2 * math.pi * f * p / n_sats
            els.append((inc, raan, M0))
    return els


def waits(contact):
    """contact bool (T,) -> waiting time (min) from each time step to next contact"""
    T = len(contact)
    nxt = np.full(T, np.inf)
    last = np.inf
    for k in range(T - 1, -1, -1):
        if contact[k]:
            last = k
        nxt[k] = (last - k) * DT / 60 if last != np.inf else np.inf
    return nxt


def main():
    t = np.arange(0, T_SIM, DT)
    lats = np.arange(-12, 9.1, 3.0)
    lons = np.arange(13, 32.1, 3.0)
    pts = np.array([(a, b) for a in lats for b in lons])
    basin_pts = ecef(pts[:, 0], pts[:, 1])
    gw = ecef(np.array([v[0] for v in GATEWAYS.values()]), np.array([v[1] for v in GATEWAYS.values()]))
    configs = []
    for inc in (15, 30, 53, 97.6):
        for n, planes in ((4, 1), (6, 2), (8, 2), (12, 3), (18, 3), (24, 4), (36, 6)):
            configs.append((inc, n, planes))
    res = []
    for inc, n, planes in configs:
        els = walker(n, planes, inc)
        sats = np.stack([sat_ecef(i, O, M, t) for i, O, M in els])  # (S,T,3)
        gvis = visible(gw, sats, 10).any(0)                         # (S,T)
        row = {"inclination_deg": inc, "satellites": n, "planes": planes}
        for label, el in (("open_sky_20deg", 20), ("under_canopy_45deg", 45)):
            v = visible(basin_pts, sats, el)                        # (G,S,T)
            link = (v & gvis[None]).any(1)                          # (G,T)
            W = np.concatenate([waits(link[g])[: len(t) // 2] for g in range(len(pts))])
            W = W[np.isfinite(W)] if np.isfinite(W).any() else np.array([1e4])
            row[label] = {"mean_wait_min": round(float(W.mean()), 1),
                          "p95_wait_min": round(float(np.percentile(W, 95)), 1),
                          "max_wait_min": round(float(W.max()), 1),
                          "pct_time_in_contact": round(float(link.mean() * 100), 1)}
        res.append(row)
        print(inc, n, planes, row["open_sky_20deg"], row["under_canopy_45deg"])
    out = {"_method": __doc__.strip(), "altitude_km": ALT, "gateways": GATEWAYS, "results": res,
           "notes": ["Wait = time until a satellite sees the sensor and a gateway at the same time (near-bent-pipe). "
                     "Add on-board/ground processing (minutes) for end-to-end S3-03 latency.",
                     "45 deg minimum elevation stands in for under-canopy links: low-angle paths cross much more foliage.",
                     "Equatorial basin favours low inclination: 15-30 deg orbits spend far more time over 13S-9N than 53 deg or polar orbits."]}
    with open(os.path.join(OUT, "leo_revisit.json"), "w") as f:
        json.dump(out, f, indent=1)


if __name__ == "__main__":
    main()
