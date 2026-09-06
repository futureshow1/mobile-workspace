# Mapa zmian klimatu

Kartogram rocznych anomalii temperatury dla 239 krajów (1880 → bieżący rok) i globalna seria
NASA GISTEMP v4, względem średniej 1951–1980. PL/EN. Panel „Źródła danych" z pełną proweniencją.

## Pliki

- `index.html` — strona (Leaflet 1.9.4, bez build-stepu)
- `data/climate-data.json` — dane, generowane automatycznie przez `../scripts/build_climate_data.py`
- `data/countries.min.json` — granice Natural Earth 1:50m (id = ISO 3166-1 alpha-3, `name`, `name_pl`),
  generowane przez `../scripts/prepare_borders.py`

## Aktualizacja danych

Workflow `.github/workflows/climate-data.yml` uruchamia się 16. dnia każdego miesiąca (po aktualizacji
GISTEMP) i zatwierdza świeży `climate-data.json`. Można też uruchomić ręcznie: Actions → „Climate data
(NASA GISTEMP)" → Run workflow.

## Wdrożenie na futureshow.pl

Katalog `klimat/` jest zamiennikiem 1:1 dla `klimat/` w repo `futureshow1.github.io`.
Po podmianie warto zaktualizować kartę na stronie głównej (`stats`): `239 krajów`, `1880–2026`, `NASA GISTEMP v4`.
