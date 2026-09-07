#!/usr/bin/env python3
"""Build klimat/data/climate-data.json from NASA GISTEMP v4.

Global series : GLB.Ts+dSST.csv (land-ocean, monthly + annual J-D), 1880 -> latest month.
Country series: gistemp1200_GHCNv4_ERSSTv5.nc (2x2 deg gridded anomalies, 1200 km smoothing),
                area-weighted over each national polygon in klimat/data/countries.min.json.
All anomalies are relative to the 1951-1980 mean (GISTEMP's native baseline).

Runs in GitHub Actions (needs open internet). Deterministic given the same source files.
"""
import gzip, hashlib, io, json, os, sys, urllib.request, datetime as dt
import numpy as np
import netCDF4
from shapely.geometry import shape, box
from shapely import STRtree

GLB_URL  = "https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv"
GRID_URL = "https://data.giss.nasa.gov/pub/gistemp/gistemp1200_GHCNv4_ERSSTv5.nc.gz"
GEO_PATH = "klimat/data/countries.min.json"
OUT_PATH = "klimat/data/climate-data.json"
MIN_MONTHS_FULL_YEAR = 9      # annual mean needs >= 9 valid months
MIN_COVERAGE = 0.5            # monthly country mean needs >= 50% of weighted area with data
UA = {"User-Agent": "futureshow-klimat-pipeline/1.0 (+https://futureshow.pl/klimat/)"}

def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=600) as r:
        data = r.read()
    print(f"fetched {url} ({len(data)/1e6:.1f} MB)", flush=True)
    return data

def sha(b): return hashlib.sha256(b).hexdigest()[:16]

def parse_global(csv_bytes):
    lines = csv_bytes.decode("utf-8").splitlines()
    hdr_i = next(i for i, l in enumerate(lines) if l.startswith("Year"))
    cols = lines[hdr_i].split(",")
    annual, monthly = {}, {}
    for l in lines[hdr_i + 1:]:
        if not l or not l[0].isdigit(): continue
        parts = l.split(",")
        y = int(parts[0])
        row = dict(zip(cols, parts))
        for mi, m in enumerate(["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"], 1):
            v = row.get(m, "***")
            if v not in ("***", "", None):
                monthly[f"{y}-{mi:02d}"] = round(float(v), 2)
        v = row.get("J-D", "***")
        if v not in ("***", "", None):
            annual[str(y)] = round(float(v), 2)
    return annual, monthly

def main():
    t0 = dt.datetime.now(dt.timezone.utc)
    glb_raw = fetch(GLB_URL)
    g_annual, g_monthly = parse_global(glb_raw)
    last_month = max(g_monthly)
    print("global annual", min(g_annual), "->", max(g_annual), "| last month", last_month)

    grid_gz = fetch(GRID_URL)
    nc = netCDF4.Dataset("inmem.nc", memory=gzip.decompress(grid_gz))
    lat = nc["lat"][:].astype(float); lon = nc["lon"][:].astype(float)
    tvar = nc["time"]; times = netCDF4.num2date(tvar[:], tvar.units, only_use_cftime_datetimes=False)
    ta = nc["tempanomaly"][:]                      # masked array (time, lat, lon)
    T, NLAT, NLON = ta.shape
    print("grid", ta.shape, "from", times[0].strftime("%Y-%m"), "to", times[-1].strftime("%Y-%m"))
    dlat = abs(lat[1]-lat[0]); dlon = abs(lon[1]-lon[0])

    # cell polygons + spatial index
    cells, cell_ij, cell_w = [], [], []
    for i, la in enumerate(lat):
        for j, lo in enumerate(lon):
            cells.append(box(lo-dlon/2, la-dlat/2, lo+dlon/2, la+dlat/2))
            cell_ij.append((i, j)); cell_w.append(np.cos(np.radians(la)))
    tree = STRtree(cells)
    cell_w = np.array(cell_w)

    geo = json.load(open(GEO_PATH))
    data = ta.filled(np.nan).reshape(T, -1)     # (T, NLAT*NLON)
    years = np.array([t.year for t in times]); months = np.array([t.month for t in times])
    y_min, y_max = int(years.min()), int(years.max())

    countries = {}
    for f in geo["features"]:
        code = f["id"]; geom = shape(f["geometry"])
        idx = tree.query(geom, predicate="intersects")
        if len(idx) == 0:
            continue
        w = np.array([cells[k].intersection(geom).area * cell_w[k] for k in idx])
        flat = np.array([cell_ij[k][0]*NLON + cell_ij[k][1] for k in idx])
        keep = w > 0
        w, flat = w[keep], flat[keep]
        if w.sum() == 0:
            continue
        vals = data[:, flat]                                   # (T, ncells)
        valid = ~np.isnan(vals)
        cov = (valid * w).sum(1) / w.sum()
        mon = np.where(cov >= MIN_COVERAGE, np.nansum(np.where(valid, vals, 0) * w, 1) / np.maximum((valid * w).sum(1), 1e-9), np.nan)
        anom, ytd = {}, None
        for y in range(y_min, y_max + 1):
            sel = years == y
            m = mon[sel]; n = int(np.sum(~np.isnan(m)))
            if y == y_max and months[sel].max() < 12:
                if n >= 1:
                    ytd = {"year": y, "months": n, "anom": round(float(np.nanmean(m)), 2)}
                continue
            if n >= MIN_MONTHS_FULL_YEAR:
                anom[str(y)] = round(float(np.nanmean(m)), 2)
        countries[code] = {"anom": anom, "cells": int(len(flat))}
        if ytd: countries[code]["ytd"] = ytd

    # global YTD for the partial year
    cur_y = int(last_month[:4]); cur_months = [v for k, v in g_monthly.items() if k.startswith(str(cur_y))]
    g_ytd = {"year": cur_y, "months": len(cur_months), "anom": round(float(np.mean(cur_months)), 2)} if str(cur_y) not in g_annual else None

    full_years = sorted({int(y) for c in countries.values() for y in c["anom"]})
    out = {
        "meta": {
            "title": "Mapa zmian klimatu",
            "generated_utc": t0.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "baseline": "1951-1980",
            "countries": len(countries),
            "country_years": [full_years[0], full_years[-1]],
            "global_years": [int(min(g_annual)), int(max(g_annual))],
            "latest_month": last_month,
            "method": {
                "pl": "Anomalia kraju = średnia ważona powierzchnią komórek siatki NASA GISTEMP (2°×2°, wygładzanie 1200 km) przeciętych granicą państwa; waga = pole przecięcia × cos(szerokości). Średnia roczna wymaga ≥9 ważnych miesięcy; miesiąc wymaga pokrycia ≥50% powierzchni. Anomalie względem średniej 1951–1980.",
                "en": "Country anomaly = area-weighted mean of NASA GISTEMP grid cells (2°×2°, 1200 km smoothing) intersecting the national boundary; weight = intersection area × cos(latitude). Annual mean requires ≥9 valid months; a month requires ≥50% area coverage. Anomalies relative to the 1951–1980 mean."
            },
            "sources": [
                {"id": "gistemp-global", "name": "GISTEMP v4 — Global Land-Ocean Temperature Index",
                 "institution": "NASA Goddard Institute for Space Studies (GISS)",
                 "url": "https://data.giss.nasa.gov/gistemp/", "file": GLB_URL,
                 "cadence": {"pl": "miesięcznie (ok. 10–15 dnia)", "en": "monthly (~10th–15th)"},
                 "coverage": f"1880-01 → {last_month}", "license": "Public domain (US Government work)",
                 "citation": "GISTEMP Team, 2026: GISS Surface Temperature Analysis (GISTEMP), version 4. NASA GISS. Lenssen et al. (2019), J. Geophys. Res. Atmos., 124, 6307–6326, doi:10.1029/2018JD029522",
                 "doi": "10.1029/2018JD029522", "sha256": sha(glb_raw)},
                {"id": "gistemp-grid", "name": "GISTEMP v4 — gridded anomalies, 1200 km smoothing (GHCNv4 + ERSSTv5)",
                 "institution": "NASA GISS", "url": "https://data.giss.nasa.gov/gistemp/", "file": GRID_URL,
                 "cadence": {"pl": "miesięcznie", "en": "monthly"},
                 "coverage": f"{times[0].strftime('%Y-%m')} → {times[-1].strftime('%Y-%m')}",
                 "license": "Public domain (US Government work)",
                 "citation": "Hansen, J., R. Ruedy, M. Sato, K. Lo (2010): Global surface temperature change. Rev. Geophys. 48, RG4004, doi:10.1029/2010RG000345",
                 "doi": "10.1029/2010RG000345", "sha256": sha(grid_gz)},
                {"id": "natural-earth", "name": "Natural Earth 1:50m Admin 0 – Countries (v5.1.1)",
                 "institution": "Natural Earth / North American Cartographic Information Society",
                 "url": "https://www.naturalearthdata.com/downloads/50m-cultural-vectors/",
                 "file": "https://github.com/nvkelso/natural-earth-vector", "license": "Public domain",
                 "citation": "Made with Natural Earth. Free vector and raster map data @ naturalearthdata.com"},
            ],
            "pipeline": "https://github.com/futureshow1/mobile-workspace/blob/claude/virtual-animated-maps-DT130/scripts/build_climate_data.py",
        },
        "global": g_annual,
        "global_monthly": {k: v for k, v in g_monthly.items() if k >= f"{cur_y-4}-01"},
        "global_ytd": g_ytd,
        "countries": countries,
    }
    with open(OUT_PATH, "w") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"wrote {OUT_PATH}: {len(countries)} countries, years {full_years[0]}–{full_years[-1]}, latest month {last_month}, size {os.path.getsize(OUT_PATH)/1e3:.0f} kB")
    print("POL:", {y: countries['POL']['anom'].get(y) for y in ('1901','2000','2020','2022','2023','2024','2025')}, countries['POL'].get('ytd'))

if __name__ == "__main__":
    main()
