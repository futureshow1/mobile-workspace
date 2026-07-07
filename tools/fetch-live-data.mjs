#!/usr/bin/env node
/**
 * fetch-live-data.mjs — builds the open-data snapshot embedded in
 * poland-security-maps.html.
 *
 * Tries every source and records per-source status, so the page can show
 * exactly what is real, how fresh it is, and what was blocked by the
 * network it ran on. Re-run on a less restricted machine to fill in the
 * live feeds (DeepState, adsb.lol, UCDP, gpsjam, NASA FIRMS live API).
 *
 * Usage:  node tools/fetch-live-data.mjs
 * Env:    FIRMS_MAP_KEY  (optional) NASA FIRMS API key for the live area API
 */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = join(ROOT, 'poland-security-maps.html');
const OUT = join(ROOT, 'data', 'snapshot.json');
const TODAY = new Date().toISOString().slice(0, 10);

async function get(url, { timeout = 30000, binary = false } = {}) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeout), redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return binary ? Buffer.from(await res.arrayBuffer()) : await res.text();
}

const r2 = (n) => Math.round(n * 100) / 100;

function parseCsv(text) {
  // minimal CSV parser handling quoted fields
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/* ---------- tar extraction (for the world-atlas npm tarball) ---------- */
function tarFind(buf, wanted) {
  let off = 0;
  while (off + 512 <= buf.length) {
    const name = buf.toString('utf8', off, off + 100).replace(/\0.*$/, '');
    const size = parseInt(buf.toString('utf8', off + 124, off + 136).trim(), 8) || 0;
    if (name === wanted) return buf.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error(`${wanted} not in tarball`);
}

/* ---------- TopoJSON decoding (no deps) ---------- */
function decodeTopo(topo, objectName) {
  const { scale, translate } = topo.transform;
  const arcs = topo.arcs.map(arc => {
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => {
      x += dx; y += dy;
      return [r2(x * scale[0] + translate[0]), r2(y * scale[1] + translate[1])];
    });
  });
  const ring = (arcIdxs) => {
    const pts = [];
    for (const i of arcIdxs) {
      const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
      // skip duplicated join point
      for (let j = pts.length ? 1 : 0; j < a.length; j++) pts.push(a[j]);
    }
    return pts;
  };
  const out = [];
  for (const g of topo.objects[objectName].geometries) {
    const name = (g.properties && g.properties.name) || g.id || '?';
    const polys = g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : [];
    const rings = polys.map(p => ring(p[0])); // outer rings only
    out.push({ name, rings });
  }
  return out;
}

function ringArea(pts) { // rough degrees² area for filtering specks
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a / 2);
}

function thin(pts, keepEvery) {
  if (pts.length <= 24 || keepEvery <= 1) return pts;
  const out = pts.filter((_, i) => i % keepEvery === 0);
  if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
  return out;
}

/* =================== sources =================== */
const sources = {};

sources.world = async () => {
  const tgz = await get('https://registry.npmjs.org/world-atlas/-/world-atlas-2.0.2.tgz', { binary: true, timeout: 120000 });
  const json = JSON.parse(tarFind(gunzipSync(tgz), 'package/countries-110m.json').toString('utf8'));
  const countries = decodeTopo(json, 'countries');
  const out = [];
  for (const c of countries) {
    const rings = c.rings
      .filter(r => ringArea(r) > 0.5)                    // drop specks
      .map(r => thin(r, r.length > 400 ? 3 : r.length > 150 ? 2 : 1));
    if (rings.length) out.push({ n: c.name, r: rings });
  }
  return {
    status: 'ok', asOf: '2.0.2 (Natural Earth 110m)',
    attribution: 'Natural Earth via world-atlas (npm), public domain',
    data: out,
  };
};

sources.events = async () => {
  // Bellingcat / Centre for Information Resilience "Eyes on Russia" events,
  // mirrored with geocoding at github.com/mauforonda/ukraine
  const csv = parseCsv(await get('https://raw.githubusercontent.com/mauforonda/ukraine/master/events.csv', { timeout: 120000 }));
  const h = csv[0], col = (n) => h.indexOf(n);
  const iDate = col('date'), iLat = col('lat'), iLon = col('lon'), iGrp = col('event_group');
  const t0 = Date.parse('2022-01-03'); // Monday of week 0
  const groups = new Map();
  const pts = []; let last = '';
  for (const r of csv.slice(1)) {
    const lat = +r[iLat], lon = +r[iLon], d = Date.parse(r[iDate]);
    if (!isFinite(lat) || !isFinite(lon) || !isFinite(d)) continue;
    const g = (r[iGrp] || 'Other').trim();
    if (!groups.has(g)) groups.set(g, groups.size);
    pts.push([r2(lon), r2(lat), Math.max(0, Math.floor((d - t0) / 6048e5)), groups.get(g)]);
    if (r[iDate] > last) last = r[iDate];
  }
  return {
    status: 'ok', asOf: `events through ${last}`,
    attribution: 'Centre for Information Resilience / Bellingcat "Eyes on Russia" (geocoded mirror: github.com/mauforonda/ukraine)',
    data: { week0: '2022-01-03', groups: [...groups.keys()], pts },
  };
};

sources.units = async () => {
  // ISW-derived unit HQ positions behind uawardata.com (updates ended Sep 2022)
  const gj = JSON.parse(await get('https://raw.githubusercontent.com/simonhuwiler/uawardata/master/data/geojson/units_current.geojson', { timeout: 60000 }));
  let asOf = '';
  const data = gj.features.map(f => {
    const p = f.properties, [lon, lat] = f.geometry.coordinates;
    if (p.date > asOf) asOf = p.date;
    return [r2(lon), r2(lat), p.country === 'ru' ? 1 : 0, `${p.unit || ''}`.slice(0, 40), `${p.type || ''}`.slice(0, 24)];
  });
  return {
    status: 'ok', asOf,
    attribution: 'uawardata.com (Henry Schlottman), ISW-based unit tracking — project updates ended Sep 2022',
    data,
  };
};

sources.milex = async () => {
  // SIPRI Milex, CSV mirror (1949–2021). SIPRI's current release (sipri.org) is
  // fetched by the refresh run when the network allows it.
  const csv = parseCsv(await get('https://raw.githubusercontent.com/Nathan-States/SIPRI-Dashboard/main/sipri-dashboard/sipri-military-expenditure.csv', { timeout: 120000 }));
  const gdp = {}, usd2021 = {};
  let maxY = 0;
  for (const [country, year, metric, amount] of csv.slice(1)) {
    if (!country || amount === 'NA' || amount === '' || amount == null) continue;
    const y = +year, v = +amount;
    if (!isFinite(y) || !isFinite(v)) continue;
    if (metric === 'GDP Percent') {
      (gdp[country] ||= {})[y] = r2(v); // mirror stores share of GDP already in percent
      if (y > maxY) maxY = y;
    } else if (metric === 'USD Constant' && y === 2021) usd2021[country] = Math.round(v);
  }
  // compact: {country: [firstYear, [vals…]]}
  const series = {};
  for (const [c, m] of Object.entries(gdp)) {
    const ys = Object.keys(m).map(Number).sort((a, b) => a - b);
    if (!ys.length) continue;
    const arr = [];
    for (let y = ys[0]; y <= ys[ys.length - 1]; y++) arr.push(m[y] ?? null);
    series[c] = [ys[0], arr];
  }
  const top = Object.entries(usd2021).sort((a, b) => b[1] - a[1]).slice(0, 15);
  return {
    status: 'ok', asOf: `annual data through ${maxY}`,
    attribution: 'SIPRI Military Expenditure Database (CSV mirror: github.com/Nathan-States/SIPRI-Dashboard)',
    data: { metric: 'share of GDP (%)', maxYear: maxY, series, top2021: top },
  };
};

sources.firms = async () => {
  // NASA FIRMS thermal anomalies over Ukraine — daily mirror in
  // github.com/leedrake5/Russia-Ukraine; sampled ~monthly, gridded to 0.25°.
  const months = [];
  const start = new Date('2022-03-01');
  const end = new Date(); end.setDate(1);
  const jobs = [];
  for (let d = new Date(start); d <= end; d.setMonth(d.getMonth() + 1)) {
    const ym = d.toISOString().slice(0, 7);
    jobs.push((async () => {
      for (const day of ['01', '02', '03']) {
        try {
          const csv = parseCsv(await get(`https://raw.githubusercontent.com/leedrake5/Russia-Ukraine/main/data/FIRMS/${ym}-${day}.csv`, { timeout: 30000 }));
          const h = csv[0], iLat = h.indexOf('latitude'), iLon = h.indexOf('longitude');
          if (iLat < 0) return;
          const grid = new Map();
          for (const r of csv.slice(1)) {
            const lat = +r[iLat], lon = +r[iLon];
            if (!isFinite(lat) || !isFinite(lon)) continue;
            const k = `${Math.round(lon * 4)}_${Math.round(lat * 4)}`;
            grid.set(k, (grid.get(k) || 0) + 1);
          }
          const cells = [...grid.entries()]
            .sort((a, b) => b[1] - a[1]).slice(0, 250)
            .map(([k, n]) => { const [x, y] = k.split('_').map(Number); return [r2(x / 4), r2(y / 4), n]; });
          months.push({ m: ym, cells });
          return;
        } catch { /* try next day */ }
      }
    })());
  }
  await Promise.all(jobs);
  months.sort((a, b) => a.m.localeCompare(b.m));
  if (!months.length) throw new Error('no FIRMS mirror days reachable');
  return {
    status: 'ok', asOf: `monthly samples ${months[0].m} → ${months[months.length - 1].m}`,
    attribution: 'NASA FIRMS (VIIRS active fire), daily mirror: github.com/leedrake5/Russia-Ukraine — one day sampled per month',
    data: months,
  };
};

/* ---- live feeds: attempted, expected to be blocked on restricted networks ---- */
const liveAttempt = (name, url, note, transform) => async () => {
  try {
    const body = await get(url, { timeout: 12000 });
    const data = transform ? transform(body) : JSON.parse(body);
    return { status: 'ok', asOf: new Date().toISOString(), attribution: note, data };
  } catch (e) {
    return { status: 'blocked', asOf: null, attribution: note, note: `unreachable from this network (${e.message.slice(0, 60)})`, data: null };
  }
};

sources.adsb_mil = liveAttempt('adsb_mil', 'https://api.adsb.lol/v2/mil',
  'adsb.lol — military-registered aircraft currently broadcasting ADS-B (ODbL)',
  (b) => {
    const j = JSON.parse(b);
    return (j.ac || []).filter(a => isFinite(a.lat) && isFinite(a.lon))
      .map(a => [r2(a.lon), r2(a.lat), a.t || '', a.flight?.trim() || a.r || '']).slice(0, 800);
  });

sources.deepstate = liveAttempt('deepstate', 'https://deepstatemap.live/api/history/last',
  'DeepStateMAP — Ukraine frontline geometry (deepstatemap.live)',
  (b) => { const j = JSON.parse(b); return j; });

sources.ucdp = liveAttempt('ucdp', 'https://ucdpapi.pcr.uu.se/api/gedevents/24.1?pagesize=1000&StartDate=2024-01-01',
  'UCDP Georeferenced Event Dataset API (Uppsala University)',
  (b) => JSON.parse(b).Result?.map(e => [r2(+e.longitude), r2(+e.latitude), e.date_start?.slice(0, 10), e.best || 0]) || []);

sources.gpsjam = liveAttempt('gpsjam', `https://gpsjam.org/data/${TODAY}-h3_4.csv`,
  'gpsjam.org — daily GPS-interference aggregates from ADS-B (John Wiseman)',
  (b) => parseCsv(b).slice(1, 2000));

sources.firms_live = process.env.FIRMS_MAP_KEY
  ? liveAttempt('firms_live', `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${process.env.FIRMS_MAP_KEY}/VIIRS_SNPP_NRT/world/1`,
      'NASA FIRMS live area API (requires free MAP_KEY)', (b) => parseCsv(b).slice(1, 5000))
  : async () => ({ status: 'blocked', asOf: null, attribution: 'NASA FIRMS live area API', note: 'set FIRMS_MAP_KEY env var (free key from firms.modaps.eosdis.nasa.gov) and re-run', data: null });

/* =================== main =================== */
const manifest = { generated: new Date().toISOString(), sources: {} };
for (const [name, fn] of Object.entries(sources)) {
  process.stdout.write(`fetching ${name} … `);
  try {
    const res = await fn();
    manifest.sources[name] = res;
    const size = JSON.stringify(res.data ?? '').length;
    console.log(`${res.status}${res.asOf ? ` (${res.asOf})` : ''} ${(size / 1024).toFixed(0)}KB`);
  } catch (e) {
    manifest.sources[name] = { status: 'error', asOf: null, note: e.message.slice(0, 120), data: null };
    console.log(`error: ${e.message.slice(0, 80)}`);
  }
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(manifest));
console.log(`wrote ${OUT} (${(JSON.stringify(manifest).length / 1024).toFixed(0)}KB)`);

// inject into the page between the livedata script tags
const html = readFileSync(HTML, 'utf8');
const re = /(<script type="application\/json" id="livedata">)[\s\S]*?(<\/script>)/;
if (re.test(html)) {
  const payload = JSON.stringify(manifest).replace(/<\//g, '<\\/');
  writeFileSync(HTML, html.replace(re, `$1\n${payload}\n$2`));
  console.log(`injected snapshot into ${HTML}`);
} else {
  console.log('NOTE: no <script id="livedata"> block in the HTML yet — snapshot written to data/ only');
}
