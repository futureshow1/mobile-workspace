#!/usr/bin/env python3
"""Build klimat/data/countries.min.json from Natural Earth 1:50m admin-0 countries.

Source: Natural Earth (public domain), GeoJSON mirror on GitHub
  https://github.com/nvkelso/natural-earth-vector
Output: FeatureCollection with id = ISO 3166-1 alpha-3 (ISO_A3_EH, else ADM0_A3),
        properties {name, name_pl}, geometry simplified to keep the file small.
"""
import json, sys, urllib.request
from shapely.geometry import shape, mapping
from shapely import set_precision, union_all

SRC = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson"
OUT = "klimat/data/countries.min.json"
TOL = 0.04     # degrees; ~4 km — keeps small islands, halves the file
SKIP = {"ATA"}  # Antarctica: no national temperature series of interest

def iso(p):
    for k in ("ISO_A3_EH", "ISO_A3", "ADM0_A3"):
        v = p.get(k)
        if v and v != "-99":
            return v
    return None

def main():
    src = sys.argv[1] if len(sys.argv) > 1 else SRC
    if src.startswith("http"):
        with urllib.request.urlopen(src, timeout=120) as r:
            g = json.load(r)
    else:
        g = json.load(open(src))
    by_id = {}   # dependent territories sharing an ISO code (e.g. Ashmore -> AUS) are merged
    for f in g["features"]:
        p = f["properties"]
        code = iso(p)
        if not code or code in SKIP:
            continue
        geom = shape(f["geometry"])
        if code in by_id:
            by_id[code]["geoms"].append(geom)
            continue
        by_id[code] = {"geoms": [geom], "name": p.get("NAME_EN") or p["NAME"], "name_pl": p.get("NAME_PL") or p["NAME"]}
    feats = []
    for code, e in by_id.items():
        geom = union_all(e["geoms"]).simplify(TOL, preserve_topology=True)
        geom = set_precision(geom, 0.001)
        if geom.is_empty:
            continue
        feats.append({"type": "Feature", "id": code,
                      "properties": {"name": e["name"], "name_pl": e["name_pl"]},
                      "geometry": mapping(geom)})
    feats.sort(key=lambda x: x["id"])
    out = {"type": "FeatureCollection", "features": feats}
    with open(OUT, "w") as fh:
        json.dump(out, fh, separators=(",", ":"))
    print(f"wrote {OUT}: {len(feats)} countries")

if __name__ == "__main__":
    main()
