# Mobile Workspace

Private workspace for mobile Claude Code sessions.

## Contents

- `poland-security-maps.html` — "The Unseen Front": animated maps of Poland's security
  situation. Four modeled Baltic layers (GPS interference time-lapse, the 2004→2026 energy
  pivot, military mobility friction, shadow fleet over undersea infrastructure) plus three
  open-data views (global SIPRI expenditure choropleth 1949→2021, a Ukraine replay from
  real satellite/OSINT sources, and a live-feed status board). Self-contained page — canvas
  animation, zero runtime network requests; real data is embedded as a snapshot.
- `tools/fetch-live-data.mjs` — rebuilds the embedded snapshot. Run `node tools/fetch-live-data.mjs`
  to refresh; it writes `data/snapshot.json` and re-injects it into the HTML.
- `data/snapshot.json` — the latest snapshot (also embedded in the page).

## Data sources

| Source | What | Status in current snapshot |
|---|---|---|
| Natural Earth (world-atlas 2.0.2, npm) | world geometry | real |
| SIPRI Military Expenditure (GitHub CSV mirror) | % GDP by country, 1949–2021 | real |
| CIR / Bellingcat "Eyes on Russia" (geocoded mirror) | verified Ukraine incidents, Jan 2022 – Feb 2024 | real |
| NASA FIRMS (daily mirror in leedrake5/Russia-Ukraine) | satellite fire detections, monthly samples 2022-03 → current | real |
| ISW via uawardata.com | unit HQ positions (project ended Sep 2022) | real, historical |
| adsb.lol `/v2/mil` | military aircraft currently broadcasting | blocked in build sandbox |
| DeepStateMAP API | Ukraine frontline geometry | blocked in build sandbox |
| UCDP GED API | global conflict events | blocked in build sandbox |
| gpsjam.org daily aggregates | real GPS-interference data | blocked in build sandbox |
| NASA FIRMS live area API | global thermal anomalies | needs free `FIRMS_MAP_KEY` env var |

The four Baltic layers are deliberately **modeled** (hand-built, realistic but illustrative) and
labeled as such in the page. Blocked feeds fill in automatically when the fetch script runs on an
unrestricted network. ACLED integration would need a free research key from acleddata.com.
