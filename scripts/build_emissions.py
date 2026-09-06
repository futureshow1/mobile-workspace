#!/usr/bin/env python3
"""Build klimat/data/emissions.json from Our World in Data (GitHub-hosted CSVs).

- owid/co2-data   : Global Carbon Budget (fossil CO2 by fuel, land-use change, cumulative,
                    per capita, shares) + Jones et al. (warming contributions) + GHG totals
- owid/energy-data: Energy Institute Statistical Review + Ember (electricity mix, shares)
Both CC BY 4.0. Runs anywhere with internet access to raw.githubusercontent.com.
"""
import csv, hashlib, io, json, os, urllib.request, datetime as dt

CO2_URL = "https://raw.githubusercontent.com/owid/co2-data/master/owid-co2-data.csv"
ENE_URL = "https://raw.githubusercontent.com/owid/energy-data/master/owid-energy-data.csv"
OUT = "klimat/data/emissions.json"
UA = {"User-Agent": "futureshow-klimat-pipeline/1.0 (+https://futureshow.pl/klimat/)"}

# countries kept with full time series (ISO3); everything else only in the "latest" table
FOCUS = ["POL","DEU","FRA","GBR","ITA","ESP","SWE","DNK","NOR","CZE","UKR","RUS","USA","CAN","MEX","BRA","ARG",
         "CHN","IND","JPN","KOR","IDN","VNM","IRN","SAU","ARE","TUR","EGY","NGA","ZAF","AUS","QAT","KAZ","PAK","BGD"]
AGG = {"World":"WLD","European Union (27)":"EU27","Africa":"AFR","Asia":"ASI","Europe":"EUR","North America":"NAM",
       "South America":"SAM","Oceania":"OCE","High-income countries":"HIC","Low-income countries":"LIC",
       "Upper-middle-income countries":"UMC","Lower-middle-income countries":"LMC"}

def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=600) as r:
        b = r.read()
    print(f"fetched {url} ({len(b)/1e6:.1f} MB)", flush=True)
    return b

def num(x):
    try:
        return float(x) if x not in ("", None) else None
    except ValueError:
        return None

def rnd(x, d=3):
    return None if x is None else round(x, d)

def series(rows, cols, y0, d=1):
    """Column-oriented: {"y0": first year, "years": [...], "<col>": [values aligned to years]}"""
    rows = [r for r in rows if int(r["year"]) >= y0]
    rows.sort(key=lambda r: int(r["year"]))
    if not rows: return None
    years = [int(r["year"]) for r in rows]
    out = {"years": years}
    for c in cols:
        vals = [rnd(num(r.get(c)), d) for r in rows]
        if any(v is not None for v in vals):
            out[c] = vals
    return out

def main():
    t0 = dt.datetime.now(dt.timezone.utc)
    co2_raw = fetch(CO2_URL); ene_raw = fetch(ENE_URL)
    co2 = list(csv.DictReader(io.StringIO(co2_raw.decode("utf-8"))))
    ene = list(csv.DictReader(io.StringIO(ene_raw.decode("utf-8"))))

    def code(r):
        return r.get("iso_code") or AGG.get(r["country"])
    by_c = {}
    for r in co2:
        c = code(r)
        if c: by_c.setdefault(c, []).append(r)
    by_e = {}
    for r in ene:
        c = code(r)
        if c: by_e.setdefault(c, []).append(r)
    names = {code(r): r["country"] for r in co2 if code(r)}

    CO2_COLS = ["co2","coal_co2","oil_co2","gas_co2","cement_co2","flaring_co2","other_industry_co2",
                "land_use_change_co2","co2_including_luc","cumulative_co2","co2_per_capita","share_global_co2",
                "share_global_cumulative_co2","consumption_co2","methane","nitrous_oxide","total_ghg",
                "temperature_change_from_ghg","population"]
    ENE_COLS = ["electricity_generation","coal_electricity","gas_electricity","oil_electricity","nuclear_electricity",
                "hydro_electricity","solar_electricity","wind_electricity","biofuel_electricity",
                "other_renewable_exc_biofuel_electricity","fossil_share_elec","low_carbon_share_elec",
                "renewables_share_elec","coal_share_elec","solar_share_elec","wind_share_elec",
                "primary_energy_consumption","fossil_share_energy","low_carbon_share_energy","energy_per_capita","per_capita_electricity"]

    CO2_SLIM = ["co2","coal_co2","oil_co2","gas_co2","cement_co2","land_use_change_co2","cumulative_co2",
                "co2_per_capita","share_global_co2","consumption_co2","total_ghg","temperature_change_from_ghg","population"]
    ENE_FOCUS = {"WLD","EU27","POL","DEU","FRA","GBR","DNK","ESP","ITA","CZE","USA","CHN","IND","JPN","BRA","AUS","NOR","SWE"}
    keep = set(FOCUS) | set(AGG.values())
    countries = {}
    for c in keep:
        if c in by_c or c in by_e:
            full = c in ("WLD", "EU27")
            countries[c] = {"name": names.get(c) or next((r["country"] for r in by_e.get(c, [])), c),
                            "co2": series(by_c.get(c, []), CO2_COLS if full else CO2_SLIM, 1750 if full else 1900,
                                          d=3 if full else 2),
                            "energy": series(by_e.get(c, []), ENE_COLS, 1985, d=1) if c in ENE_FOCUS else None}

    # latest-year table for every country with an ISO code
    last_co2 = max(int(r["year"]) for r in by_c["WLD"] if num(r.get("co2")) is not None)
    last_ene = max(int(r["year"]) for r in by_e["WLD"] if num(r.get("electricity_generation")) is not None)
    latest = {}
    for c, rows in by_c.items():
        if len(c) != 3 or c in AGG.values(): continue
        r = next((x for x in rows if int(x["year"]) == last_co2), None)
        if not r: continue
        latest[c] = {"name": r["country"], "co2": rnd(num(r.get("co2"))), "co2_per_capita": rnd(num(r.get("co2_per_capita"))),
                     "cumulative_co2": rnd(num(r.get("cumulative_co2")), 1), "share_global_co2": rnd(num(r.get("share_global_co2"))),
                     "share_global_cumulative_co2": rnd(num(r.get("share_global_cumulative_co2"))),
                     "temperature_change_from_ghg": rnd(num(r.get("temperature_change_from_ghg")), 4),
                     "population": rnd(num(r.get("population")), 0)}
    for c, rows in by_e.items():
        if c not in latest: continue
        r = next((x for x in rows if int(x["year"]) == last_ene), None)
        if r:
            latest[c].update({"low_carbon_share_elec": rnd(num(r.get("low_carbon_share_elec")), 1),
                              "coal_share_elec": rnd(num(r.get("coal_share_elec")), 1),
                              "solar_wind_share_elec": rnd((num(r.get("solar_share_elec")) or 0) + (num(r.get("wind_share_elec")) or 0), 1),
                              "electricity_generation": rnd(num(r.get("electricity_generation")), 1)})

    out = {
        "meta": {
            "generated_utc": t0.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "co2_latest_year": last_co2, "energy_latest_year": last_ene,
            "units": {"co2": "Mt CO2 / rok", "cumulative_co2": "Mt CO2 od 1750", "co2_per_capita": "t CO2 / os.",
                      "methane": "Mt CO2e / rok (GWP100)", "total_ghg": "Mt CO2e / rok", "electricity": "TWh",
                      "primary_energy_consumption": "TWh", "shares": "%"},
            "sources": [
                {"id": "owid-co2", "name": "Our World in Data — CO₂ and Greenhouse Gas Emissions dataset",
                 "institution": "Our World in Data (Global Change Data Lab), na podstawie Global Carbon Project (Global Carbon Budget 2025) i Jones et al. (2024)",
                 "url": "https://github.com/owid/co2-data", "file": CO2_URL, "license": "CC BY 4.0",
                 "cadence": {"pl": "rocznie (Global Carbon Budget, listopad)", "en": "annually (Global Carbon Budget, November)"},
                 "coverage": f"1750 → {last_co2}",
                 "citation": "Friedlingstein, P. et al. (2025): Global Carbon Budget 2025. Earth System Science Data. Jones, M.W. et al. (2023): National contributions to climate change due to historical emissions of carbon dioxide, methane and nitrous oxide. Scientific Data 10, 155, doi:10.1038/s41597-023-02041-1",
                 "doi": "10.1038/s41597-023-02041-1", "sha256": hashlib.sha256(co2_raw).hexdigest()[:16]},
                {"id": "owid-energy", "name": "Our World in Data — Energy dataset",
                 "institution": "Our World in Data, na podstawie Energy Institute Statistical Review of World Energy 2025 i Ember Yearly Electricity Data",
                 "url": "https://github.com/owid/energy-data", "file": ENE_URL, "license": "CC BY 4.0",
                 "cadence": {"pl": "rocznie (czerwiec–lipiec)", "en": "annually (June–July)"},
                 "coverage": f"1900 → {last_ene}",
                 "citation": "Energy Institute (2025): Statistical Review of World Energy. Ember (2025): Yearly Electricity Data. Via Our World in Data.",
                 "sha256": hashlib.sha256(ene_raw).hexdigest()[:16]},
            ],
        },
        "countries": countries,
        "latest": latest,
    }
    with open(OUT, "w") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    w = countries["WLD"]
    print(f"wrote {OUT}: {len(countries)} series, {len(latest)} in latest table, {os.path.getsize(OUT)/1e3:.0f} kB")
    i = w["co2"]["years"].index(last_co2); j = w["energy"]["years"].index(last_ene)
    print("World", last_co2, {k: w["co2"][k][i] for k in ("co2","coal_co2","oil_co2","gas_co2","cumulative_co2","total_ghg")})
    print("World elec", last_ene, {k: w["energy"][k][j] for k in ("electricity_generation","solar_electricity","wind_electricity","coal_electricity","low_carbon_share_elec")})
    pe = countries["POL"]["energy"]; k = pe["years"].index(last_ene)
    print("POL", last_ene, {c: pe[c][k] for c in ("coal_share_elec","renewables_share_elec")})

if __name__ == "__main__":
    main()
