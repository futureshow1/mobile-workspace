/* ============================================================
   KLIMAT — portal edukacyjny FutureShow · wspólna logika
   i18n · ładowanie danych · wykresy (canvas) · źródła · nawigacja
   ============================================================ */
window.KLIMAT = (function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  // ── i18n ──────────────────────────────────────────────────
  let lang = 'pl';
  try { lang = localStorage.getItem('lang') || 'pl'; } catch (e) {}
  document.documentElement.lang = lang;
  const pl = () => document.documentElement.lang === 'pl';
  const T = (p, e) => (pl() ? p : e);
  const renderers = [];
  function onRender(fn) { renderers.push(fn); }
  function toggleLang() {
    const h = document.documentElement;
    h.lang = h.lang === 'pl' ? 'en' : 'pl';
    try { localStorage.setItem('lang', h.lang); } catch (e) {}
    $$('.lang').forEach(b => b.textContent = h.lang === 'pl' ? 'EN' : 'PL');
    renderers.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  }

  // ── number formatting ────────────────────────────────────
  const loc = () => (pl() ? 'pl-PL' : 'en-GB');
  function fmt(v, d = 1, opts = {}) {
    if (v == null || isNaN(v)) return '—';
    const s = new Intl.NumberFormat(loc(), { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
    return (opts.sign && v > 0 ? '+' : '') + s;
  }
  const fmtInt = v => fmt(v, 0);
  function fmtBig(v, d = 1) { // 38598 Mt -> 38,6 Gt
    if (v == null) return '—';
    if (Math.abs(v) >= 1e6) return fmt(v / 1e6, d) + ' ' + T('mld', 'bn');
    if (Math.abs(v) >= 1e3) return fmt(v / 1e3, d) + ' ' + T('tys.', 'k');
    return fmt(v, d);
  }
  const MONTHS = { pl: ['styczeń','luty','marzec','kwiecień','maj','czerwiec','lipiec','sierpień','wrzesień','październik','listopad','grudzień'],
                   en: ['January','February','March','April','May','June','July','August','September','October','November','December'] };
  function monthLabel(ym) { const [y, m] = ym.split('-').map(Number); return `${MONTHS[pl() ? 'pl' : 'en'][m - 1]} ${y}`; }

  // ── data ─────────────────────────────────────────────────
  const cache = {};
  const FILES = { climate: 'data/climate-data.json', indicators: 'data/indicators.json', emissions: 'data/emissions.json', geo: 'data/countries.min.json' };
  function load(...names) {
    return Promise.all(names.map(n => cache[n] || (cache[n] = fetch(FILES[n]).then(r => { if (!r.ok) throw new Error(n + ' ' + r.status); return r.json(); }))))
      .then(arr => Object.fromEntries(names.map((n, i) => [n, arr[i]])));
  }
  // column-oriented series helper (emissions.json)
  function col(ser, key) { if (!ser || !ser[key]) return []; return ser.years.map((y, i) => [y, ser[key][i]]).filter(p => p[1] != null); }
  function obj2pts(o, filter) { return Object.keys(o).filter(k => !filter || filter(k)).sort().map(k => [k.length === 7 ? +k.slice(0, 4) + (+k.slice(5) - 0.5) / 12 : +k, o[k]]); }
  function last(o) { const k = Object.keys(o).sort().pop(); return [k, o[k]]; }
  function at(o, k) { return o[String(k)]; }
  function mean(arr) { const v = arr.filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }
  function smooth5(o, y) { let s = 0, n = 0; for (let k = y - 2; k <= y + 2; k++) { const v = o[String(k)]; if (v != null) { s += v; n++; } } return n >= 3 ? s / n : null; }

  // ── colour scale (diverging −2…+3) ───────────────────────
  const STOPS = [[-2, [29, 78, 216]], [-1, [96, 165, 250]], [0, [229, 231, 235]], [1, [251, 146, 60]], [2, [220, 38, 38]], [3, [127, 29, 29]]];
  function tcolor(v) {
    if (v == null || isNaN(v)) return '#2a3140';
    v = Math.max(-2, Math.min(3, v));
    for (let i = 0; i < STOPS.length - 1; i++) { const [a, ca] = STOPS[i], [b, cb] = STOPS[i + 1]; if (v <= b) { const t = (v - a) / (b - a); return `rgb(${ca.map((c, k) => Math.round(c + (cb[k] - c) * t)).join(',')})`; } }
    return 'rgb(127,29,29)';
  }
  function stripes(el, o, from, to) {
    let h = ''; for (let y = from; y <= to; y++) { const v = o[String(y)]; h += `<i style="background:${tcolor(v)}" title="${y}: ${v == null ? '—' : fmt(v, 2, { sign: true })}"></i>`; }
    el.innerHTML = h;
  }

  // ── charts ───────────────────────────────────────────────
  const C = { grid: 'rgba(255,255,255,.07)', axis: 'rgba(255,255,255,.18)', text: '#8b95a7', tip: null };
  const PALETTE = ['#63b3ff', '#fb923c', '#34d399', '#f472b6', '#a78bfa', '#fbbf24', '#ff5a3c', '#22d3ee', '#c084fc', '#86efac'];
  let tipEl;
  function tip() { if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tip'; document.body.appendChild(tipEl); } return tipEl; }
  function niceTicks(min, max, n = 5) {
    const span = max - min || 1, step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= n + 1) || mag * 10;
    const t = []; for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) t.push(+v.toFixed(10)); return t;
  }
  function chart(canvas, spec) {
    if (typeof canvas === 'string') canvas = $(canvas);
    if (!canvas) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1, W = canvas.clientWidth, H = canvas.clientHeight;
      if (!W) return;
      canvas.width = W * dpr; canvas.height = H * dpr;
      const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const type = spec.type || 'line';
      if (type === 'hbar') return drawHBar(ctx, W, H, spec);
      const series = spec.series.filter(s => s.points && s.points.length);
      const pad = { l: spec.padL || 52, r: spec.padR || 14, t: 16, b: 30 };
      const stacked = type === 'stacked';
      let xs = [], ys = [];
      if (stacked) { const acc = {}; series.forEach(s => s.points.forEach(([x, y]) => { acc[x] = (acc[x] || 0) + (y || 0); })); xs = Object.keys(acc).map(Number); ys = Object.values(acc).concat([0]); }
      else series.forEach(s => s.points.forEach(([x, y]) => { xs.push(x); ys.push(y); }));
      const xmin = spec.x?.min ?? Math.min(...xs), xmax = spec.x?.max ?? Math.max(...xs);
      let ymin = spec.y?.min ?? Math.min(...ys), ymax = spec.y?.max ?? Math.max(...ys);
      if (spec.y?.zero !== false && ymin > 0) ymin = 0;
      if (ymin === ymax) ymax = ymin + 1;
      const padY = (ymax - ymin) * 0.06; if (spec.y?.max == null) ymax += padY; if (spec.y?.min == null && !(spec.y?.zero !== false && ymin === 0)) ymin -= padY;
      const X = x => pad.l + (x - xmin) / (xmax - xmin) * (W - pad.l - pad.r);
      const Y = y => H - pad.b - (y - ymin) / (ymax - ymin) * (H - pad.t - pad.b);
      // bands (e.g. scenario ranges, eras)
      (spec.bands || []).forEach(b => { ctx.fillStyle = b.color || 'rgba(255,255,255,.04)'; if (b.x0 != null) ctx.fillRect(X(b.x0), pad.t, X(b.x1) - X(b.x0), H - pad.t - pad.b); else ctx.fillRect(pad.l, Y(b.y1), W - pad.l - pad.r, Y(b.y0) - Y(b.y1)); if (b.label) { ctx.fillStyle = C.text; ctx.font = '10px JetBrains Mono, monospace'; ctx.textAlign = 'left'; ctx.fillText(b.label, (b.x0 != null ? X(b.x0) : pad.l) + 4, (b.x0 != null ? pad.t + 10 : Y(b.y1) + 10)); } });
      // grid + y ticks
      ctx.font = '10.5px JetBrains Mono, monospace'; ctx.fillStyle = C.text; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      niceTicks(ymin, ymax, spec.y?.ticks || 5).forEach(v => { ctx.strokeStyle = v === 0 ? C.axis : C.grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pad.l, Y(v)); ctx.lineTo(W - pad.r, Y(v)); ctx.stroke(); ctx.fillText((spec.y?.fmt || (x => fmt(x, spec.y?.d ?? 0)))(v), pad.l - 6, Y(v)); });
      // x ticks
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const xt = spec.x?.ticks || niceTicks(xmin, xmax, Math.max(3, Math.floor(W / 90)));
      xt.forEach(v => { if (v < xmin || v > xmax) return; ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(X(v), pad.t); ctx.lineTo(X(v), H - pad.b); ctx.stroke(); ctx.fillText((spec.x?.fmt || (x => String(Math.round(x))))(v), X(v), H - pad.b + 6); });
      if (spec.y?.unit) { ctx.textAlign = 'left'; ctx.fillText(spec.y.unit, pad.l + 4, 2); }
      // series
      if (stacked) {
        const base = {}; series.forEach((s, i) => {
          const color = s.color || PALETTE[i % PALETTE.length]; ctx.beginPath();
          const pts = s.points.map(([x, y]) => { const b0 = base[x] || 0; base[x] = b0 + (y || 0); return [x, b0, base[x]]; });
          pts.forEach(([x, , y1], k) => k ? ctx.lineTo(X(x), Y(y1)) : ctx.moveTo(X(x), Y(y1)));
          pts.slice().reverse().forEach(([x, y0]) => ctx.lineTo(X(x), Y(y0))); ctx.closePath(); ctx.fillStyle = color; ctx.globalAlpha = .85; ctx.fill(); ctx.globalAlpha = 1;
        });
      } else series.forEach((s, i) => {
        const color = s.color || PALETTE[i % PALETTE.length];
        if (s.fill || type === 'area') { ctx.beginPath(); s.points.forEach(([x, y], k) => k ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))); ctx.lineTo(X(s.points[s.points.length - 1][0]), Y(Math.max(ymin, 0))); ctx.lineTo(X(s.points[0][0]), Y(Math.max(ymin, 0))); ctx.closePath(); const g = ctx.createLinearGradient(0, pad.t, 0, H - pad.b); g.addColorStop(0, color + '55'); g.addColorStop(1, color + '05'); ctx.fillStyle = g; ctx.fill(); }
        if (s.bars) { const bw = Math.max(1, (W - pad.l - pad.r) / (xmax - xmin + 1) * 0.8); s.points.forEach(([x, y]) => { ctx.fillStyle = s.colorFn ? s.colorFn(y) : color; ctx.fillRect(X(x) - bw / 2, Math.min(Y(y), Y(0)), bw, Math.abs(Y(y) - Y(0))); }); return; }
        ctx.strokeStyle = color; ctx.lineWidth = s.width || 2; ctx.setLineDash(s.dash || []); ctx.lineJoin = 'round'; ctx.beginPath();
        if (s.colorFn) { for (let k = 1; k < s.points.length; k++) { ctx.strokeStyle = s.colorFn(s.points[k][1]); ctx.beginPath(); ctx.moveTo(X(s.points[k - 1][0]), Y(s.points[k - 1][1])); ctx.lineTo(X(s.points[k][0]), Y(s.points[k][1])); ctx.stroke(); } }
        else { s.points.forEach(([x, y], k) => k ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))); ctx.stroke(); }
        ctx.setLineDash([]);
        if (s.dots) s.points.forEach(([x, y]) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(X(x), Y(y), s.dots === true ? 2.5 : s.dots, 0, Math.PI * 2); ctx.fill(); });
        if (s.endDot !== false && s.points.length) { const [x, y] = s.points[s.points.length - 1]; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(X(x), Y(y), 3.5, 0, Math.PI * 2); ctx.fill(); }
      });
      // marks (vertical annotations)
      (spec.marks || []).forEach(m => { ctx.strokeStyle = m.color || 'rgba(255,255,255,.35)'; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(X(m.x), pad.t); ctx.lineTo(X(m.x), H - pad.b); ctx.stroke(); ctx.setLineDash([]); if (m.label) { ctx.fillStyle = m.color || C.text; ctx.font = '10px JetBrains Mono, monospace'; ctx.textAlign = m.align || 'left'; ctx.textBaseline = 'top'; ctx.fillText(m.label, X(m.x) + (m.align === 'right' ? -4 : 4), pad.t + (m.dy || 0)); } });
      (spec.hlines || []).forEach(m => { ctx.strokeStyle = m.color || 'rgba(255,255,255,.35)'; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(pad.l, Y(m.y)); ctx.lineTo(W - pad.r, Y(m.y)); ctx.stroke(); ctx.setLineDash([]); if (m.label) { ctx.fillStyle = m.color || C.text; ctx.font = '10px JetBrains Mono, monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(m.label, W - pad.r - 2, Y(m.y) - 2); } });
      canvas._geo = { X, Y, xmin, xmax, pad, W, H, series, stacked };
    };
    draw();
    if (!canvas._ro) { canvas._ro = new ResizeObserver(() => draw()); canvas._ro.observe(canvas); }
    canvas._draw = draw;
    if (spec.hover !== false && !canvas._hover) {
      canvas._hover = true;
      canvas.addEventListener('mousemove', e => {
        const g = canvas._geo; if (!g) return; const r = canvas.getBoundingClientRect(); const mx = e.clientX - r.left;
        const xv = g.xmin + (mx - g.pad.l) / (g.W - g.pad.l - g.pad.r) * (g.xmax - g.xmin);
        const lines = []; let hx = null;
        g.series.forEach((s, i) => { let best = null; s.points.forEach(p => { if (best == null || Math.abs(p[0] - xv) < Math.abs(best[0] - xv)) best = p; }); if (best && Math.abs(best[0] - xv) <= (g.xmax - g.xmin) / 60) { hx = best[0]; lines.push(`<span style="color:${s.color || PALETTE[i % PALETTE.length]}">■</span> ${s.name || ''} <b>${(spec.tipFmt || (v => fmt(v, spec.y?.d ?? 2)))(best[1], s)}</b>`); } });
        const t = tip(); if (!lines.length) { t.style.display = 'none'; return; }
        t.innerHTML = `<div style="color:#8b95a7;margin-bottom:2px">${(spec.x?.tipFmt || (x => Number.isInteger(x) ? x : (Math.floor(x) + ' ' + MONTHS[pl() ? 'pl' : 'en'][Math.round((x % 1) * 12 - 0.5 + 0.5) % 12 | 0])))(hx)}</div>` + lines.join('<br>');
        t.style.display = 'block'; t.style.left = Math.min(window.innerWidth - t.offsetWidth - 10, e.clientX + 14) + 'px'; t.style.top = (e.clientY + 14) + 'px';
      });
      canvas.addEventListener('mouseleave', () => { if (tipEl) tipEl.style.display = 'none'; });
    }
    return canvas;
  }
  function drawHBar(ctx, W, H, spec) {
    const items = spec.items; const n = items.length; const padL = spec.padL || 140, padR = 70; const rowH = Math.min(30, (H - 10) / n); const max = spec.max || Math.max(...items.map(i => i.value));
    ctx.font = '12px Inter, sans-serif'; ctx.textBaseline = 'middle';
    items.forEach((it, i) => {
      const y = 6 + i * rowH; const w = Math.max(0, it.value / max * (W - padL - padR));
      ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(padL, y + 3, W - padL - padR, rowH - 6);
      ctx.fillStyle = it.color || PALETTE[0]; ctx.fillRect(padL, y + 3, w, rowH - 6);
      ctx.fillStyle = it.hl ? '#fff' : '#cfd6df'; ctx.textAlign = 'right'; ctx.fillText(it.label, padL - 10, y + rowH / 2);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.font = '11px JetBrains Mono, monospace'; ctx.fillText((spec.fmt || (v => fmt(v, 1)))(it.value), padL + w + 8, y + rowH / 2); ctx.font = '12px Inter, sans-serif';
    });
  }

  // ── sources registry + drawer ────────────────────────────
  const REFS = {
    'ipcc-ar6-wg1-spm': { name: 'IPCC AR6 WG I — Climate Change 2021: The Physical Science Basis. Summary for Policymakers', institution: 'Intergovernmental Panel on Climate Change (IPCC)', url: 'https://www.ipcc.ch/report/ar6/wg1/', doi: '10.1017/9781009157896.001', citation: 'IPCC, 2021: Summary for Policymakers. In: Climate Change 2021: The Physical Science Basis. Contribution of Working Group I to the Sixth Assessment Report. Cambridge University Press, pp. 3–32.', license: 'IPCC — cytowanie dozwolone' },
    'ipcc-ar6-wg1-ch7': { name: 'IPCC AR6 WG I — Chapter 7: The Earth’s Energy Budget, Climate Feedbacks and Climate Sensitivity', institution: 'IPCC', url: 'https://www.ipcc.ch/report/ar6/wg1/chapter/chapter-7/', doi: '10.1017/9781009157896.009', citation: 'Forster, P. et al., 2021: The Earth’s Energy Budget, Climate Feedbacks, and Climate Sensitivity. In: Climate Change 2021: The Physical Science Basis (Table 7.5, Table 7.8, Fig. 7.6).' },
    'ipcc-ar6-wg1-ch4': { name: 'IPCC AR6 WG I — Chapter 4: Future Global Climate: Scenario-based Projections', institution: 'IPCC', url: 'https://www.ipcc.ch/report/ar6/wg1/chapter/chapter-4/', doi: '10.1017/9781009157896.006', citation: 'Lee, J.-Y. et al., 2021. Table 4.5 (SSP warming 2081–2100); SPM Table SPM.1.' },
    'ipcc-ar6-syr': { name: 'IPCC AR6 Synthesis Report — Climate Change 2023', institution: 'IPCC', url: 'https://www.ipcc.ch/report/ar6/syr/', doi: '10.59327/IPCC/AR6-9789291691647', citation: 'IPCC, 2023: Climate Change 2023: Synthesis Report. Summary for Policymakers.' },
    'forster-2025': { name: 'Indicators of Global Climate Change 2024', institution: 'Forster, P.M. et al. — Earth System Science Data (aktualizacja wskaźników IPCC)', url: 'https://essd.copernicus.org/articles/17/2641/2025/', doi: '10.5194/essd-17-2641-2025', citation: 'Forster, P.M. et al. (2025): Indicators of Global Climate Change 2024: annual update of key indicators of the state of the climate system and human influence. ESSD 17, 2641–2680.' },
    'gcb-2025': { name: 'Global Carbon Budget 2025', institution: 'Global Carbon Project — Friedlingstein et al., Earth System Science Data', url: 'https://globalcarbonbudget.org/', doi: '10.5194/essd-2025-XXX', citation: 'Friedlingstein, P. et al. (2025): Global Carbon Budget 2025. Earth Syst. Sci. Data.' },
    'armstrong-mckay-2022': { name: 'Exceeding 1.5°C global warming could trigger multiple climate tipping points', institution: 'Armstrong McKay, D.I. et al. — Science 377, eabn7950', url: 'https://www.science.org/doi/10.1126/science.abn7950', doi: '10.1126/science.abn7950', citation: 'Armstrong McKay, D.I. et al. (2022). Science 377(6611), eabn7950.' },
    'wmo-2024': { name: 'State of the Global Climate 2024', institution: 'World Meteorological Organization (WMO-No. 1368)', url: 'https://wmo.int/publication-series/state-of-global-climate-2024', citation: 'WMO (2025): State of the Global Climate 2024. Geneva.' },
    'c3s-2024': { name: 'Global Climate Highlights 2024', institution: 'Copernicus Climate Change Service (C3S) / ECMWF', url: 'https://climate.copernicus.eu/global-climate-highlights-2024', citation: 'C3S (2025): Global Climate Highlights 2024 — 2024 pierwszym rokiem kalendarzowym powyżej 1,5 °C nad poziomem przedprzemysłowym (ERA5).' },
    'wwa-boris-2024': { name: 'Climate change and high exposure increased costs and disruption to lives and livelihoods from flooding associated with exceptionally heavy rainfall in Central Europe', institution: 'World Weather Attribution (Imperial College London, KNMI, IMGW i in.)', url: 'https://www.worldweatherattribution.org/climate-change-and-high-exposure-increased-costs-and-disruption-to-lives-and-livelihoods-from-flooding-associated-with-exceptionally-heavy-rainfall-in-central-europe/', citation: 'WWA (2024): szybka analiza atrybucji opadów niżu Boris, wrzesień 2024.' },
    'robock-2007': { name: 'Climatic consequences of regional nuclear conflicts', institution: 'Robock, A., Oman, L., Stenchikov, G.L. et al. — Atmos. Chem. Phys. 7, 2003–2012', url: 'https://acp.copernicus.org/articles/7/2003/2007/', doi: '10.5194/acp-7-2003-2007', citation: 'Robock, A. et al. (2007). Atmospheric Chemistry and Physics 7, 2003–2012.' },
    'ctbto': { name: 'Nuclear testing 1945–today', institution: 'Comprehensive Nuclear-Test-Ban Treaty Organization (CTBTO)', url: 'https://www.ctbto.org/our-mission/history-of-nuclear-testing', citation: 'CTBTO: ponad 2 000 prób jądrowych od 1945 r., w tym ok. 500 atmosferycznych do 1980 r.' },
    'levin-2010': { name: 'Observations and modelling of the global distribution and long-term trend of atmospheric 14CO2', institution: 'Levin, I. et al. — Tellus B 62, 26–46', url: 'https://doi.org/10.1111/j.1600-0889.2009.00446.x', doi: '10.1111/j.1600-0889.2009.00446.x', citation: 'Levin, I. et al. (2010). Tellus B 62(1), 26–46 — „bomb spike” radiowęgla po próbach atmosferycznych.' },
    'luthi-2008': { name: 'High-resolution carbon dioxide concentration record 650,000–800,000 years before present', institution: 'Lüthi, D. et al. — Nature 453, 379–382', url: 'https://www.nature.com/articles/nature06949', doi: '10.1038/nature06949', citation: 'Lüthi, D. et al. (2008). Nature 453, 379–382 (rdzeń lodowy EPICA Dome C).' },
    'soden-2002': { name: 'Global cooling after the eruption of Mount Pinatubo: a test of climate feedback by water vapor', institution: 'Soden, B.J. et al. — Science 296, 727–730', url: 'https://www.science.org/doi/10.1126/science.296.5568.727', doi: '10.1126/science.296.5568.727', citation: 'Soden, B.J. et al. (2002). Science 296, 727–730.' },
    'jenkins-2023': { name: 'Tonga eruption increases chance of temporary surface temperature anomaly above 1.5 °C', institution: 'Jenkins, S., Smith, C., Allen, M., Grainger, R. — Nature Climate Change 13, 127–129', url: 'https://www.nature.com/articles/s41558-022-01568-2', doi: '10.1038/s41558-022-01568-2', citation: 'Jenkins, S. et al. (2023). Nat. Clim. Chang. 13, 127–129.' },
    'imo-2020': { name: 'IMO 2020 — cutting sulphur oxide emissions', institution: 'International Maritime Organization', url: 'https://www.imo.org/en/MediaCentre/HotTopics/Pages/Sulphur-2020.aspx', citation: 'IMO (2020): limit siarki w paliwie żeglugowym 3,5 % → 0,5 % od 1 stycznia 2020.' },
    'sherwood-2020': { name: 'An assessment of Earth’s climate sensitivity using multiple lines of evidence', institution: 'Sherwood, S.C. et al. — Reviews of Geophysics 58', url: 'https://doi.org/10.1029/2019RG000678', doi: '10.1029/2019RG000678', citation: 'Sherwood, S.C. et al. (2020). Rev. Geophys. 58, e2019RG000678.' },
    'tyndall-arrhenius': { name: 'Historia: Tyndall (1859), Arrhenius (1896), Keeling (1958)', institution: 'Tyndall, J. — Phil. Mag. 1861; Arrhenius, S. — Phil. Mag. 41, 237–276 (1896); Keeling, C.D. — Tellus 12, 200–203 (1960)', url: 'https://www.rsc.org/images/Arrhenius1896_tcm18-173546.pdf', citation: 'Arrhenius, S. (1896): On the Influence of Carbonic Acid in the Air upon the Temperature of the Ground. Philosophical Magazine 41, 237–276.' },
    'wynes-2017': { name: 'The climate mitigation gap: education and government recommendations miss the most effective individual actions', institution: 'Wynes, S. & Nicholas, K.A. — Environmental Research Letters 12, 074024', url: 'https://iopscience.iop.org/article/10.1088/1748-9326/aa7541', doi: '10.1088/1748-9326/aa7541', citation: 'Wynes, S., Nicholas, K.A. (2017). Environ. Res. Lett. 12, 074024.' },
    'paris-2015': { name: 'Porozumienie paryskie (2015)', institution: 'UNFCCC', url: 'https://unfccc.int/process-and-meetings/the-paris-agreement', citation: 'UNFCCC (2015): Paris Agreement, art. 2.1(a): „well below 2 °C … pursuing efforts to limit … to 1.5 °C”.' },
    'trenberth-2003': { name: 'The changing character of precipitation', institution: 'Trenberth, K.E. et al. — Bull. Amer. Meteor. Soc. 84, 1205–1217', url: 'https://doi.org/10.1175/BAMS-84-9-1205', doi: '10.1175/BAMS-84-9-1205', citation: 'Trenberth, K.E. et al. (2003). BAMS 84, 1205–1217 — relacja Clausiusa–Clapeyrona ≈ 7 % więcej pary wodnej na 1 °C.' },
    'rantanen-2022': { name: 'The Arctic has warmed nearly four times faster than the globe since 1979', institution: 'Rantanen, M. et al. — Communications Earth & Environment 3, 168', url: 'https://www.nature.com/articles/s43247-022-00498-3', doi: '10.1038/s43247-022-00498-3', citation: 'Rantanen, M. et al. (2022). Commun. Earth Environ. 3, 168.' },
    'imgw-2024': { name: 'Klimat Polski 2024', institution: 'Instytut Meteorologii i Gospodarki Wodnej — PIB', url: 'https://www.imgw.pl/', citation: 'IMGW-PIB (2025): Klimat Polski 2024 — rok 2024 najcieplejszym w historii pomiarów w Polsce.' },
    'kobize': { name: 'Krajowy raport inwentaryzacyjny (emisje gazów cieplarnianych w Polsce)', institution: 'KOBiZE / Instytut Ochrony Środowiska — PIB', url: 'https://www.kobize.pl/', citation: 'KOBiZE (2025): Poland’s National Inventory Report.' },
  };
  const dyn = {}; // sources from data files' meta
  function addRefs(o) { Object.assign(REFS, o); }
  function registerMeta(meta, prefix) { (meta.sources || []).forEach(s => { dyn[s.id] = Object.assign({}, s, { fetched: meta.generated_utc, sha: s.sha256 || (meta.sha256 && meta.sha256[s.id]) }); }); }
  function sourceCard(id, hl) {
    const s = dyn[id] || REFS[id]; if (!s) return `<div class="scard"><h3>${id}</h3></div>`;
    const cad = s.cadence ? (pl() ? s.cadence.pl : s.cadence.en) : null;
    let h = `<div class="scard${hl ? ' hl' : ''}" id="src-${id}"><h3>${s.name}</h3><div class="inst">${s.institution || ''}</div><dl>`;
    if (s.coverage) h += `<dt>${T('Zakres', 'Coverage')}</dt><dd>${s.coverage}</dd>`;
    if (cad) h += `<dt>${T('Aktualizacja', 'Cadence')}</dt><dd class="txt">${cad}</dd>`;
    if (s.fetched) h += `<dt>${T('Pobrano', 'Fetched')}</dt><dd>${s.fetched.replace('T', ' ').replace('Z', ' UTC')}</dd>`;
    if (s.license) h += `<dt>${T('Licencja', 'License')}</dt><dd class="txt">${s.license}</dd>`;
    if (s.citation) h += `<dt>${T('Cytowanie', 'Citation')}</dt><dd class="txt">${s.citation}</dd>`;
    if (s.sha) h += `<dt>SHA-256</dt><dd>${s.sha}…</dd>`;
    h += `</dl><div class="links">`;
    if (s.url) h += `<a href="${s.url}" target="_blank" rel="noopener">${T('Strona źródła', 'Source page')} ↗</a>`;
    if (s.file) h += `<a href="${s.file}" target="_blank" rel="noopener">${T('Plik danych', 'Data file')} ↗</a>`;
    if (s.doi && !s.doi.includes('XXX')) h += `<a href="https://doi.org/${s.doi}" target="_blank" rel="noopener">DOI ↗</a>`;
    return h + `</div></div>`;
  }
  let drawerEl, dimEl;
  function ensureDrawer() {
    if (drawerEl) return;
    dimEl = document.createElement('div'); dimEl.className = 'dim'; dimEl.onclick = closeSources; document.body.appendChild(dimEl);
    drawerEl = document.createElement('aside'); drawerEl.className = 'drawer'; document.body.appendChild(drawerEl);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSources(); });
  }
  function openSources(id) {
    ensureDrawer();
    const ids = $$('[data-src]').map(e => e.dataset.src).flatMap(s => s.split(',')).filter((v, i, a) => a.indexOf(v) === i);
    const order = id ? [id].concat(ids.filter(x => x !== id)) : ids;
    drawerEl.innerHTML = `<div class="dh"><h2>${T('Źródła na tej stronie', 'Sources on this page')}</h2><button class="x" aria-label="close">✕</button></div><div class="db">${order.map(x => sourceCard(x, x === id)).join('')}<p class="muted" style="font-size:12px;margin-top:14px">${T('Dane liczbowe są generowane automatycznie ze wskazanych plików źródłowych. Pełna lista i metoda:', 'Numbers are generated automatically from the listed source files. Full list and method:')} <a href="zrodla.html">${T('Źródła i metoda', 'Sources & method')} →</a></p></div>`;
    $('.x', drawerEl).onclick = closeSources; drawerEl.classList.add('on'); dimEl.classList.add('on');
    if (id) { const el = $('#src-' + CSS.escape(id), drawerEl); if (el) el.scrollIntoView({ block: 'start' }); }
  }
  function closeSources() { if (drawerEl) { drawerEl.classList.remove('on'); dimEl.classList.remove('on'); } }
  function bindSources(root) { $$('[data-src]', root).forEach(el => { if (el._b) return; el._b = 1; el.classList.add('src'); el.addEventListener('click', e => { e.preventDefault(); openSources(el.dataset.src.split(',')[0]); }); }); }

  // ── navigation / chrome ──────────────────────────────────
  const CH = [
    { f: 'index.html', n: '', pl: 'Start', en: 'Home' },
    { f: '01-co-sie-dzieje.html', n: '01', pl: 'Co się dzieje', en: 'What is happening' },
    { f: '02-dlaczego.html', n: '02', pl: 'Dlaczego', en: 'Why' },
    { f: '03-gdzie.html', n: '03', pl: 'Gdzie', en: 'Where' },
    { f: '04-paliwa-kopalne.html', n: '04', pl: 'Paliwa kopalne', en: 'Fossil fuels' },
    { f: '05-energia.html', n: '05', pl: 'Energia', en: 'Energy' },
    { f: '06-inne-czynniki.html', n: '06', pl: 'Inne czynniki', en: 'Other factors' },
    { f: '07-wspolzaleznosci.html', n: '07', pl: 'Współzależności', en: 'Interdependencies' },
    { f: '08-co-dalej.html', n: '08', pl: 'Co dalej', en: 'What next' },
    { f: '09-sprawdz-sie.html', n: '09', pl: 'Sprawdź się', en: 'Test yourself' },
    { f: 'mapa.html', n: '', pl: 'Mapa', en: 'Map' },
    { f: 'slownik.html', n: '', pl: 'Słownik', en: 'Glossary' },
    { f: 'zrodla.html', n: '', pl: 'Źródła', en: 'Sources' },
  ];
  function here() { const f = location.pathname.split('/').pop() || 'index.html'; return f === '' ? 'index.html' : f; }
  function chrome() {
    const cur = here();
    const top = document.createElement('header'); top.className = 'top';
    top.innerHTML = `<div class="in"><a class="back" href="../index.html">← FutureShow</a><a class="brand" href="index.html"><span class="mark"></span>Klimat<small>${T('portal edukacyjny', 'education portal')}</small></a>
      <nav class="nav" id="nav">${CH.map(c => `<a href="${c.f}" class="${c.f === cur ? 'on' : ''}">${c.n ? `<b>${c.n}</b>` : ''}<span>${pl() ? c.pl : c.en}</span></a>`).join('')}</nav>
      <button class="menu-btn" aria-label="menu">☰</button><button class="lang">${pl() ? 'EN' : 'PL'}</button></div>`;
    document.body.prepend(top);
    const prog = document.createElement('div'); prog.className = 'progress'; document.body.appendChild(prog);
    $('.menu-btn', top).onclick = () => $('#nav').classList.toggle('open');
    $('.lang', top).onclick = toggleLang;
    window.addEventListener('scroll', () => { const h = document.documentElement; prog.style.width = (h.scrollTop / (h.scrollHeight - h.clientHeight) * 100 || 0) + '%'; }, { passive: true });
    // prev/next
    const i = CH.findIndex(c => c.f === cur), pn = $('#pn');
    if (pn && i > 0 && i <= 9) {
      const p = CH[i - 1], n = CH[i + 1];
      pn.innerHTML = `<a href="${p.f}"><small>← ${T('Poprzedni', 'Previous')}</small><b>${p.n ? p.n + ' · ' : ''}${pl() ? p.pl : p.en}</b></a>` + (n && n.n ? `<a class="next" href="${n.f}"><small>${T('Następny', 'Next')} →</small><b>${n.n} · ${pl() ? n.pl : n.en}</b></a>` : `<a class="next" href="index.html"><small>${T('Powrót', 'Back')}</small><b>${T('Start', 'Home')}</b></a>`);
    }
    // footer
    const f = document.createElement('footer');
    f.innerHTML = `<div class="in"><div><h5>Klimat · FutureShow</h5><p style="font-size:13px;color:var(--dim);margin:0">${T('Portal edukacyjny o zmianach klimatu. Każda liczba pochodzi z otwartych, cytowanych zbiorów danych naukowych i jest odświeżana automatycznie.', 'An education portal on climate change. Every number comes from open, cited scientific datasets and is refreshed automatically.')}</p><div class="stamp" id="stamp"></div></div>
      <div><h5>${T('Rozdziały', 'Chapters')}</h5><ul>${CH.filter(c => c.n).map(c => `<li><a href="${c.f}">${c.n} · ${pl() ? c.pl : c.en}</a></li>`).join('')}</ul></div>
      <div><h5>${T('Narzędzia', 'Tools')}</h5><ul><li><a href="mapa.html">${T('Mapa zmian klimatu', 'Climate change map')}</a></li><li><a href="slownik.html">${T('Słownik', 'Glossary')}</a></li><li><a href="zrodla.html">${T('Źródła i metoda', 'Sources & method')}</a></li><li><a href="data/indicators.json">${T('Dane (JSON)', 'Data (JSON)')}</a></li><li><a href="https://github.com/futureshow1/futureshow1.github.io/tree/main/klimat" target="_blank" rel="noopener">GitHub ↗</a></li></ul></div></div>`;
    document.body.appendChild(f);
    bindSources(document);
  }
  function stamp(metas) {
    const el = $('#stamp'); if (!el) return;
    const d = metas.map(m => m && m.generated_utc).filter(Boolean).sort().pop();
    if (d) el.textContent = T('Dane odświeżone: ', 'Data refreshed: ') + d.slice(0, 10) + ' UTC';
  }

  // re-render chrome texts on language change
  onRender(() => { const old = $('header.top'); const f = $('footer'); if (old) old.remove(); if (f) f.remove(); chrome(); });

  return { $, $$, pl, T, fmt, fmtInt, fmtBig, monthLabel, MONTHS, load, col, obj2pts, last, at, mean, smooth5, tcolor, stripes, chart, PALETTE, chrome, stamp, onRender, toggleLang, addRefs, registerMeta, openSources, closeSources, bindSources, REFS, CH, niceTicks };
})();
