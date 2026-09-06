#!/usr/bin/env python3
"""Build klimat/data/indicators.json — physical climate indicators from NOAA, NASA, NSIDC, NCEI.

Each dataset is fetched independently; a failure is recorded in meta.errors and does not stop the others.
Runs in GitHub Actions (open internet).
"""
import hashlib, io, json, os, re, urllib.request, datetime as dt

OUT = "klimat/data/indicators.json"
UA = {"User-Agent": "futureshow-klimat-pipeline/1.0 (+https://futureshow.pl/klimat/)"}
SRC = {
  "co2_mm":  "https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_mm_mlo.csv",
  "co2_ann": "https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_annmean_mlo.csv",
  "co2_gr":  "https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_gr_mlo.csv",
  "ch4_ann": "https://gml.noaa.gov/webdata/ccgg/trends/ch4/ch4_annmean_gl.csv",
  "ch4_mm":  "https://gml.noaa.gov/webdata/ccgg/trends/ch4/ch4_mm_gl.csv",
  "n2o_ann": "https://gml.noaa.gov/webdata/ccgg/trends/n2o/n2o_annmean_gl.csv",
  "zonal":   "https://data.giss.nasa.gov/gistemp/tabledata_v4/ZonAnn.Ts+dSST.csv",
  "sl_recon":"https://raw.githubusercontent.com/datasets/sea-level-rise/main/data/epa-sea-level.csv",
  "sl_sat":  "https://www.star.nesdis.noaa.gov/socd/lsa/SeaLevelRise/slr/slr_sla_gbl_free_txj1j2_90.csv",
  "ice_n09": "https://noaadata.apps.nsidc.org/NOAA/G02135/north/monthly/data/N_09_extent_v3.0.csv",
  "ice_n03": "https://noaadata.apps.nsidc.org/NOAA/G02135/north/monthly/data/N_03_extent_v3.0.csv",
  "ice_s02": "https://noaadata.apps.nsidc.org/NOAA/G02135/south/monthly/data/S_02_extent_v3.0.csv",
  "ohc":     "https://www.ncei.noaa.gov/data/oceans/woa/DATA_ANALYSIS/3M_HEAT_CONTENT/DATA/basin/yearly/h22-w0-2000m.dat",
  "oni":     "https://psl.noaa.gov/data/correlation/oni.data",
}
errors, shas = {}, {}

def fetch(key):
    url = SRC[key]
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300) as r:
        b = r.read()
    shas[key] = hashlib.sha256(b).hexdigest()[:16]
    print(f"fetched {key} ({len(b)/1e3:.0f} kB)", flush=True)
    return b.decode("utf-8", "replace")

def rows(txt, sep=","):
    for l in txt.splitlines():
        l = l.strip()
        if not l or l.startswith("#") or not re.match(r"^-?\d", l): continue
        yield [x.strip() for x in (l.split(sep) if sep else l.split())]

def guarded(key, fn):
    try:
        return fn()
    except Exception as e:
        errors[key] = f"{type(e).__name__}: {e}"
        print(f"!! {key}: {errors[key]}", flush=True)
        return None

def co2():
    ann = {r[0]: round(float(r[1]), 2) for r in rows(fetch("co2_ann"))}
    gr = {r[0]: round(float(r[1]), 2) for r in rows(fetch("co2_gr"))}
    mm = {}
    for r in rows(fetch("co2_mm")):
        y, m, v = int(r[0]), int(r[1]), float(r[3])
        if v > 0: mm[f"{y}-{m:02d}"] = round(v, 2)
    lm = max(mm)
    return {"annual": ann, "growth": gr, "monthly": mm, "latest": {"month": lm, "ppm": mm[lm]}, "preindustrial_ppm": 278}

def ch4():
    ann = {r[0]: round(float(r[1]), 1) for r in rows(fetch("ch4_ann"))}
    mm = {}
    for r in rows(fetch("ch4_mm")):
        y, m, v = int(r[0]), int(r[1]), float(r[3])
        if v > 0: mm[f"{y}-{m:02d}"] = round(v, 1)
    lm = max(mm)
    return {"annual": ann, "monthly": {k: v for k, v in mm.items() if k >= "2015-01"}, "latest": {"month": lm, "ppb": mm[lm]}, "preindustrial_ppb": 729}

def n2o():
    ann = {r[0]: round(float(r[1]), 1) for r in rows(fetch("n2o_ann"))}
    return {"annual": ann, "latest": {"year": max(ann), "ppb": ann[max(ann)]}, "preindustrial_ppb": 270}

def zonal():
    txt = fetch("zonal"); hdr = next(l for l in txt.splitlines() if l.startswith("Year")).split(",")
    want = {"Glob":"global","NHem":"nhem","SHem":"shem","64N-90N":"arctic","24S-24N":"tropics","90S-64S":"antarctic","44N-64N":"midlat_n"}
    out = {v: {} for v in want.values()}
    for r in rows(txt):
        y = r[0]
        for i, h in enumerate(hdr):
            if h in want and i < len(r) and r[i] not in ("***", ""):
                out[want[h]][y] = round(float(r[i]), 2)
    return out

def sea_level():
    rec = {}; sat_epa = {}
    for r in rows(fetch("sl_recon")):
        y = r[0][:4]
        if len(r) > 1 and r[1]: rec[y] = round(float(r[1]) * 25.4, 1)        # CSIRO, inches -> mm
        if len(r) > 4 and r[4]: sat_epa[y] = round(float(r[4]) * 25.4, 1)    # NOAA, inches -> mm
    base = sum(rec[y] for y in rec if 1880 <= int(y) <= 1900) / max(1, len([y for y in rec if 1880 <= int(y) <= 1900]))
    rec = {y: round(v - base, 1) for y, v in rec.items()}
    # align NOAA (EPA) satellite era to the reconstruction on the 1993-2013 overlap
    ov = [y for y in sat_epa if y in rec]
    if ov:
        off = sum(rec[y] - sat_epa[y] for y in ov) / len(ov)
        sat_epa = {y: round(v + off, 1) for y, v in sat_epa.items()}
    out = {"reconstruction_mm": rec, "satellite_annual_mm": sat_epa, "baseline": "1880–1900 = 0 (CSIRO), NOAA series aligned on 1993–2013"}
    def sat():
        txt = fetch("sl_sat"); pts = {}
        for r in rows(txt):
            vals = [float(x) for x in r[1:] if x not in ("", "nan")]
            if vals: pts[r[0]] = round(sum(vals) / len(vals), 1)
        # yearly means, aligned to satellite_annual_mm on overlap
        yr = {}
        for k, v in pts.items():
            yr.setdefault(k[:4], []).append(v)
        yr = {y: round(sum(v) / len(v), 1) for y, v in yr.items() if len(v) >= 6}
        ov = [y for y in yr if y in sat_epa]
        off = sum(sat_epa[y] - yr[y] for y in ov) / len(ov) if ov else 0
        return {y: round(v + off, 1) for y, v in yr.items()}
    s = guarded("sl_sat", sat)
    if s: out["satellite_noaa_star_mm"] = s
    return out

def sea_ice():
    out = {}
    for key, name in (("ice_n09", "arctic_september"), ("ice_n03", "arctic_march"), ("ice_s02", "antarctic_february")):
        def one(key=key):
            d = {}
            for r in rows(fetch(key)):
                if len(r) >= 5 and float(r[4]) > 0: d[r[0]] = round(float(r[4]), 2)
            return d
        v = guarded(key, one)
        if v: out[name] = v
    return out

def ohc():
    d = {}
    for r in rows(fetch("ohc"), sep=None):
        d[str(int(float(r[0])))] = round(float(r[1]), 2)   # 10^22 J, 0–2000 m, world
    return {"world_0_2000m_1e22J": d}

def oni():
    txt = fetch("oni"); d = {}
    for l in txt.splitlines()[1:]:
        p = l.split()
        if len(p) == 13 and p[0].isdigit():
            for m, v in enumerate(p[1:], 1):
                if float(v) > -90: d[f"{p[0]}-{m:02d}"] = round(float(v), 2)
    return {"monthly": {k: v for k, v in d.items() if k >= "1950-01"}}

def main():
    t0 = dt.datetime.now(dt.timezone.utc)
    out = {
        "co2": guarded("co2", co2), "ch4": guarded("ch4", ch4), "n2o": guarded("n2o", n2o),
        "temperature_zones": guarded("zonal", zonal), "sea_level": guarded("sea_level", sea_level),
        "sea_ice": guarded("sea_ice", sea_ice), "ocean_heat": guarded("ohc", ohc), "enso_oni": guarded("oni", oni),
    }
    out["meta"] = {
        "generated_utc": t0.strftime("%Y-%m-%dT%H:%M:%SZ"), "errors": errors, "sha256": shas,
        "sources": [
            {"id": "noaa-co2", "name": "Mauna Loa CO₂ record (monthly, annual mean, growth rate)", "institution": "NOAA Global Monitoring Laboratory / Scripps Institution of Oceanography",
             "url": "https://gml.noaa.gov/ccgg/trends/", "file": SRC["co2_mm"], "license": "Public domain (US Government work)",
             "cadence": {"pl": "miesięcznie (ok. 5 dnia)", "en": "monthly (~5th)"},
             "citation": "Lan, X., Tans, P. and K.W. Thoning: Trends in globally-averaged CO2 determined from NOAA Global Monitoring Laboratory measurements. doi:10.15138/9N0H-ZH07. Keeling, C.D. et al. (1976) Tellus 28, 538–551", "doi": "10.15138/9N0H-ZH07"},
            {"id": "noaa-ch4", "name": "Globally averaged marine surface CH₄ and N₂O", "institution": "NOAA Global Monitoring Laboratory",
             "url": "https://gml.noaa.gov/ccgg/trends_ch4/", "file": SRC["ch4_ann"], "license": "Public domain",
             "cadence": {"pl": "miesięcznie", "en": "monthly"}, "citation": "Lan, X., Thoning, K.W., and Dlugokencky, E.J.: Trends in globally-averaged CH4, N2O, and SF6. NOAA GML. doi:10.15138/P8XG-AA10", "doi": "10.15138/P8XG-AA10"},
            {"id": "gistemp-zonal", "name": "GISTEMP v4 — zonal annual means (Arctic 64°N–90°N, hemispheres, tropics)", "institution": "NASA GISS",
             "url": "https://data.giss.nasa.gov/gistemp/", "file": SRC["zonal"], "license": "Public domain", "cadence": {"pl": "miesięcznie", "en": "monthly"},
             "citation": "GISTEMP Team, 2026; Lenssen et al. (2019) doi:10.1029/2018JD029522", "doi": "10.1029/2018JD029522"},
            {"id": "sea-level", "name": "Global mean sea level — tide-gauge reconstruction (CSIRO) and satellite altimetry (NOAA)", "institution": "CSIRO (Church & White 2011) · NOAA Laboratory for Satellite Altimetry · US EPA Climate Indicators",
             "url": "https://www.epa.gov/climate-indicators/climate-change-indicators-sea-level", "file": SRC["sl_recon"], "license": "Public domain / CC BY",
             "cadence": {"pl": "rocznie (rekonstrukcja) · miesięcznie (satelity)", "en": "annual (reconstruction) · monthly (satellites)"},
             "citation": "Church, J.A. and N.J. White (2011): Sea-level rise from the late 19th to the early 21st century. Surv. Geophys. 32, 585–602, doi:10.1007/s10712-011-9119-1", "doi": "10.1007/s10712-011-9119-1"},
            {"id": "nsidc", "name": "Sea Ice Index v3 — monthly extent (Arctic September/March, Antarctic February)", "institution": "National Snow and Ice Data Center (NSIDC) / NOAA",
             "url": "https://nsidc.org/data/seaice_index", "file": SRC["ice_n09"], "license": "Public domain", "cadence": {"pl": "miesięcznie", "en": "monthly"},
             "citation": "Fetterer, F., K. Knowles, W.N. Meier, M. Savoie, A.K. Windnagel (2017, updated daily): Sea Ice Index, Version 3. NSIDC. doi:10.7265/N5K072F8", "doi": "10.7265/N5K072F8"},
            {"id": "ncei-ohc", "name": "Global ocean heat content 0–2000 m (annual)", "institution": "NOAA National Centers for Environmental Information",
             "url": "https://www.ncei.noaa.gov/access/global-ocean-heat-content/", "file": SRC["ohc"], "license": "Public domain", "cadence": {"pl": "kwartalnie", "en": "quarterly"},
             "citation": "Levitus, S. et al. (2012): World ocean heat content and thermosteric sea level change (0–2000 m), 1955–2010. Geophys. Res. Lett. 39, L10603, doi:10.1029/2012GL051106", "doi": "10.1029/2012GL051106"},
            {"id": "oni", "name": "Oceanic Niño Index (ONI) — El Niño / La Niña", "institution": "NOAA Climate Prediction Center / Physical Sciences Laboratory",
             "url": "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/ensostuff/ONI_v5.php", "file": SRC["oni"], "license": "Public domain", "cadence": {"pl": "miesięcznie", "en": "monthly"},
             "citation": "NOAA CPC: Oceanic Niño Index v5, 3-month running mean of ERSST.v5 SST anomalies in the Niño 3.4 region"},
        ],
    }
    with open(OUT, "w") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"wrote {OUT} ({os.path.getsize(OUT)/1e3:.0f} kB); errors: {errors or 'none'}")
    if out["co2"]: print("CO2 latest", out["co2"]["latest"], "annual", list(out["co2"]["annual"].items())[-2:])
    if out["temperature_zones"]: print("Arctic last", list(out["temperature_zones"]["arctic"].items())[-3:])
    if out["sea_ice"]: print("Sept ice last", list(out["sea_ice"].get("arctic_september", {}).items())[-3:])
    if out["ocean_heat"]: print("OHC last", list(out["ocean_heat"]["world_0_2000m_1e22J"].items())[-3:])

if __name__ == "__main__":
    main()
