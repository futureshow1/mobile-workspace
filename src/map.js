// ============================================================
// Virtual Animated Maps — main application logic
// ============================================================

(function () {
  'use strict';

  // ── Map initialisation ────────────────────────────────────
  const map = L.map('map', {
    center: [20, 0],
    zoom: 3,
    zoomControl: true,
    preferCanvas: true,
  });

  // Editorial / industrial basemap — muted cream Stamen Toner-lite feel
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &middot; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map);

  // Label overlay in a second layer so the typography reads like print
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 19,
    pane: 'shadowPane',
  }).addTo(map);

  // ── State ─────────────────────────────────────────────────
  const layers = [];          // all dynamic layers so we can clear them
  let animationFrameId = null;
  let tourTimeout = null;

  // ── Utility helpers ───────────────────────────────────────
  function clearAll() {
    layers.forEach((l) => {
      if (map.hasLayer(l)) map.removeLayer(l);
    });
    layers.length = 0;
    if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
    if (tourTimeout) { clearTimeout(tourTimeout); tourTimeout = null; }
  }

  function setInfo(html) {
    document.getElementById('info-content').innerHTML = html;
  }

  // ── 1. Animated Markers (bounce + pulse) ──────────────────
  const cities = [
    { name: 'New York',    ll: [40.7128, -74.0060],  pop: '8.3M' },
    { name: 'London',      ll: [51.5074, -0.1278],   pop: '8.9M' },
    { name: 'Tokyo',       ll: [35.6762, 139.6503],   pop: '13.9M' },
    { name: 'Sydney',      ll: [-33.8688, 151.2093],  pop: '5.3M' },
    { name: 'São Paulo',   ll: [-23.5505, -46.6333],  pop: '12.3M' },
    { name: 'Cairo',       ll: [30.0444, 31.2357],    pop: '9.5M' },
    { name: 'Mumbai',      ll: [19.0760, 72.8777],    pop: '20.4M' },
    { name: 'Paris',       ll: [48.8566, 2.3522],     pop: '2.1M' },
    { name: 'Cape Town',   ll: [-33.9249, 18.4241],   pop: '4.6M' },
    { name: 'Los Angeles', ll: [34.0522, -118.2437],  pop: '3.9M' },
  ];

  function showAnimatedMarkers() {
    clearAll();
    map.flyTo([20, 0], 3, { duration: 1.2 });

    cities.forEach((city, i) => {
      // Pulsing circle underneath
      const pulse = L.circleMarker(city.ll, {
        radius: 6,
        color: '#00e5ff',
        fillColor: '#00e5ff',
        fillOpacity: 0.5,
        weight: 2,
        className: 'pulse-marker',
      }).addTo(map);
      layers.push(pulse);

      // Animated drop-in marker (delayed per city)
      setTimeout(() => {
        const marker = L.circleMarker(city.ll, {
          radius: 8,
          color: '#ff4081',
          fillColor: '#ff4081',
          fillOpacity: 0.9,
          weight: 0,
          className: 'bounce-marker',
        })
          .bindPopup(`<strong>${city.name}</strong><br>Population: ${city.pop}`)
          .addTo(map);
        layers.push(marker);
      }, i * 200);
    });

    setInfo(`
      <h3>Animated Markers</h3>
      <p>10 world cities appear with <em>bounce</em> and <em>pulse</em> animations.
      Click any marker for details.</p>
    `);
  }

  // ── 2. Animated Route ─────────────────────────────────────
  const routeCoords = [
    [48.8566, 2.3522],    // Paris
    [41.9028, 12.4964],   // Rome
    [37.9838, 23.7275],   // Athens
    [41.0082, 28.9784],   // Istanbul
    [30.0444, 31.2357],   // Cairo
    [25.2048, 55.2708],   // Dubai
    [19.0760, 72.8777],   // Mumbai
    [13.7563, 100.5018],  // Bangkok
    [35.6762, 139.6503],  // Tokyo
  ];

  function showAnimatedRoute() {
    clearAll();
    map.flyTo([30, 40], 3, { duration: 1.2 });

    const fullLine = L.polyline(routeCoords, {
      color: 'rgba(255,255,255,0.15)',
      weight: 2,
      dashArray: '5 10',
    }).addTo(map);
    layers.push(fullLine);

    // Animated tracer
    let progress = 0;
    const drawn = [];
    const trailLine = L.polyline([], { color: '#76ff03', weight: 3, className: 'glow-line' }).addTo(map);
    layers.push(trailLine);

    // Place a moving dot
    const dot = L.circleMarker(routeCoords[0], {
      radius: 6,
      color: '#ffea00',
      fillColor: '#ffea00',
      fillOpacity: 1,
      weight: 0,
    }).addTo(map);
    layers.push(dot);

    // Place city labels
    const routeNames = ['Paris', 'Rome', 'Athens', 'Istanbul', 'Cairo', 'Dubai', 'Mumbai', 'Bangkok', 'Tokyo'];
    routeCoords.forEach((ll, i) => {
      const m = L.marker(ll, {
        icon: L.divIcon({
          className: 'route-label',
          html: `<span>${routeNames[i]}</span>`,
          iconSize: [80, 20],
          iconAnchor: [40, -8],
        }),
      }).addTo(map);
      layers.push(m);
    });

    function interpolate(a, b, t) {
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }

    const totalSegments = routeCoords.length - 1;
    const speed = 0.003;

    function step() {
      progress += speed;
      if (progress >= totalSegments) { progress = totalSegments; }

      const segIdx = Math.min(Math.floor(progress), totalSegments - 1);
      const t = progress - segIdx;
      const pos = interpolate(routeCoords[segIdx], routeCoords[segIdx + 1] || routeCoords[segIdx], t);

      // Build trail
      const trail = routeCoords.slice(0, segIdx + 1).concat([pos]);
      trailLine.setLatLngs(trail);
      dot.setLatLng(pos);

      if (progress < totalSegments) {
        animationFrameId = requestAnimationFrame(step);
      }
    }

    animationFrameId = requestAnimationFrame(step);

    setInfo(`
      <h3>Animated Route</h3>
      <p>Watch a glowing tracer travel from <strong>Paris</strong> to <strong>Tokyo</strong>
      across 9 cities.</p>
    `);
  }

  // ── 3. Pulse Zones (heatmap-like rings) ───────────────────
  const hotspots = [
    { ll: [37.7749, -122.4194], label: 'San Francisco', intensity: 40 },
    { ll: [51.5074, -0.1278],   label: 'London',        intensity: 55 },
    { ll: [35.6762, 139.6503],  label: 'Tokyo',         intensity: 60 },
    { ll: [1.3521, 103.8198],   label: 'Singapore',     intensity: 35 },
    { ll: [-33.8688, 151.2093], label: 'Sydney',         intensity: 30 },
    { ll: [55.7558, 37.6173],   label: 'Moscow',         intensity: 45 },
    { ll: [22.3193, 114.1694],  label: 'Hong Kong',      intensity: 50 },
  ];

  function showPulseZones() {
    clearAll();
    map.flyTo([20, 20], 3, { duration: 1.2 });

    hotspots.forEach((hs) => {
      // Outer expanding ring
      for (let r = 0; r < 3; r++) {
        const ring = L.circleMarker(hs.ll, {
          radius: hs.intensity * 0.4 + r * 12,
          color: `hsl(${180 + r * 40}, 100%, 60%)`,
          fillColor: `hsl(${180 + r * 40}, 100%, 60%)`,
          fillOpacity: 0.08,
          weight: 1.5,
          className: `heat-ring heat-ring-${r}`,
        })
          .bindPopup(`<strong>${hs.label}</strong><br>Activity index: ${hs.intensity}`)
          .addTo(map);
        layers.push(ring);
      }
      // Center dot
      const center = L.circleMarker(hs.ll, {
        radius: 5,
        color: '#fff',
        fillColor: '#ff4081',
        fillOpacity: 1,
        weight: 2,
      }).addTo(map);
      layers.push(center);
    });

    setInfo(`
      <h3>Pulse Zones</h3>
      <p>Animated concentric rings show activity intensity at global tech hubs.
      Click a zone for details.</p>
    `);
  }

  // ── 4. Fly Tour ───────────────────────────────────────────
  const tourStops = [
    { ll: [48.8566, 2.3522],   zoom: 12, name: 'Paris',      desc: 'The City of Light' },
    { ll: [40.7128, -74.0060], zoom: 12, name: 'New York',   desc: 'The Big Apple' },
    { ll: [35.6762, 139.6503], zoom: 12, name: 'Tokyo',      desc: 'The Future City' },
    { ll: [-22.9068, -43.1729],zoom: 12, name: 'Rio de Janeiro', desc: 'Cidade Maravilhosa' },
    { ll: [-33.8688, 151.2093],zoom: 12, name: 'Sydney',     desc: 'Harbour City' },
    { ll: [25.2048, 55.2708],  zoom: 12, name: 'Dubai',      desc: 'City of Gold' },
  ];

  function showTour() {
    clearAll();
    let idx = 0;

    function flyNext() {
      if (idx >= tourStops.length) {
        map.flyTo([20, 0], 3, { duration: 2 });
        setInfo('<h3>Tour Complete!</h3><p>Click <strong>Fly Tour</strong> to replay.</p>');
        return;
      }
      const stop = tourStops[idx];
      map.flyTo(stop.ll, stop.zoom, { duration: 2.5 });
      setInfo(`
        <h3>${stop.name}</h3>
        <p>${stop.desc}</p>
        <p class="tour-progress">Stop ${idx + 1} of ${tourStops.length}</p>
      `);

      // Drop a marker at each stop
      const m = L.circleMarker(stop.ll, {
        radius: 10,
        color: '#ffea00',
        fillColor: '#ffea00',
        fillOpacity: 0.8,
        weight: 0,
        className: 'bounce-marker',
      })
        .bindPopup(`<strong>${stop.name}</strong><br>${stop.desc}`)
        .addTo(map);
      layers.push(m);

      idx++;
      tourTimeout = setTimeout(flyNext, 4000);
    }

    flyNext();
  }

  // ── 5. Animated Weather Layer ─────────────────────────────
  function showWeatherLayer() {
    clearAll();
    map.flyTo([30, 0], 3, { duration: 1.2 });

    // Simulate moving weather fronts with animated polylines
    const fronts = [
      { coords: [[50, -30], [55, -10], [52, 10], [48, 25]], color: '#42a5f5', label: 'Cold Front' },
      { coords: [[20, -90], [25, -75], [22, -60], [18, -45]], color: '#ef5350', label: 'Warm Front' },
      { coords: [[35, 100], [38, 115], [33, 130], [30, 145]], color: '#ab47bc', label: 'Occluded Front' },
    ];

    fronts.forEach((front) => {
      const line = L.polyline(front.coords, {
        color: front.color,
        weight: 4,
        opacity: 0.8,
        dashArray: '10 6',
        className: 'weather-front',
      }).addTo(map);
      layers.push(line);

      // Label at midpoint
      const mid = front.coords[Math.floor(front.coords.length / 2)];
      const label = L.marker(mid, {
        icon: L.divIcon({
          className: 'weather-label',
          html: `<span style="color:${front.color}">${front.label}</span>`,
          iconSize: [100, 20],
          iconAnchor: [50, -10],
        }),
      }).addTo(map);
      layers.push(label);
    });

    // Cloud clusters (animated circles)
    const clouds = [
      [45, -20], [50, 5], [40, 30], [25, -70], [15, -50],
      [35, 110], [30, 125], [55, 60], [10, 80], [42, -100],
    ];

    clouds.forEach((ll, i) => {
      const size = 15 + Math.random() * 25;
      const cloud = L.circleMarker(ll, {
        radius: size,
        color: 'rgba(200,200,255,0.3)',
        fillColor: 'rgba(200,200,255,0.15)',
        fillOpacity: 1,
        weight: 1,
        className: `cloud cloud-${i % 3}`,
      }).addTo(map);
      layers.push(cloud);
    });

    // Animate cloud drift
    let tick = 0;
    function animateClouds() {
      tick++;
      clouds.forEach((ll, i) => {
        const offset = Math.sin(tick * 0.01 + i) * 0.05;
        const c = layers.find((l) => l instanceof L.CircleMarker && l.getLatLng().lat.toFixed(0) === ll[0].toFixed(0));
        if (c) c.setLatLng([ll[0] + offset, ll[1] + tick * 0.005]);
      });
      animationFrameId = requestAnimationFrame(animateClouds);
    }
    animationFrameId = requestAnimationFrame(animateClouds);

    setInfo(`
      <h3>Weather Layer</h3>
      <p>Simulated weather fronts with drifting cloud formations.
      Watch the clouds slowly migrate across the globe.</p>
    `);
  }

  // ── 6. Climate Change Map ──────────────────────────────────
  const climateData = [
    // Temperature anomaly regions (based on real trends)
    { ll: [71, 25],   label: 'Arctic (Svalbard)',    tempRise: '+4.2°C', risk: 'extreme', desc: 'Fastest warming region on Earth. Ice loss accelerating.' },
    { ll: [64, -51],  label: 'Greenland',            tempRise: '+3.1°C', risk: 'extreme', desc: 'Ice sheet losing 270B tonnes/year. Major sea level contributor.' },
    { ll: [-75, 0],   label: 'Antarctica',           tempRise: '+2.5°C', risk: 'extreme', desc: 'West Antarctic ice sheet in irreversible decline.' },
    { ll: [35, 55],   label: 'Middle East',          tempRise: '+2.1°C', risk: 'high',    desc: 'Extreme heat waves. Parts becoming uninhabitable by 2050.' },
    { ll: [25, 78],   label: 'South Asia',           tempRise: '+1.8°C', risk: 'high',    desc: 'Monsoon disruption. 800M people at risk from flooding.' },
    { ll: [0, 25],    label: 'Sub-Saharan Africa',   tempRise: '+1.6°C', risk: 'high',    desc: 'Drought & crop failure threatening food security.' },
    { ll: [-3, -60],  label: 'Amazon Rainforest',    tempRise: '+1.5°C', risk: 'high',    desc: 'Approaching tipping point. Carbon sink turning to source.' },
    { ll: [-25, 135], label: 'Australia',             tempRise: '+1.4°C', risk: 'medium',  desc: 'Record bushfires. Great Barrier Reef mass bleaching.' },
    { ll: [40, -100], label: 'Central US',            tempRise: '+1.3°C', risk: 'medium',  desc: 'Tornado alley shifting. Extreme weather intensifying.' },
    { ll: [48, 10],   label: 'Western Europe',        tempRise: '+1.5°C', risk: 'medium',  desc: 'Heat records broken yearly. Alpine glaciers vanishing.' },
  ];

  const seaLevelCities = [
    { ll: [22.3, 114.2],  label: 'Hong Kong',      rise: '0.6m', pop: '7.5M at risk' },
    { ll: [23.8, 90.4],   label: 'Dhaka',           rise: '1.0m', pop: '21M at risk' },
    { ll: [31.2, 121.5],  label: 'Shanghai',        rise: '0.8m', pop: '24M at risk' },
    { ll: [40.7, -74.0],  label: 'New York',        rise: '0.7m', pop: '8.3M at risk' },
    { ll: [13.7, 100.5],  label: 'Bangkok',         rise: '1.0m', pop: '10M at risk' },
    { ll: [-6.2, 106.8],  label: 'Jakarta',         rise: '1.2m', pop: '10M at risk' },
    { ll: [25.0, 55.3],   label: 'Dubai',           rise: '0.5m', pop: '3.4M at risk' },
    { ll: [51.5, -0.1],   label: 'London',          rise: '0.6m', pop: '9M at risk' },
    { ll: [28.6, 77.2],   label: 'Delhi',           rise: '0.4m', pop: '32M at risk' },
    { ll: [-22.9, -43.2], label: 'Rio de Janeiro',  rise: '0.7m', pop: '6.7M at risk' },
  ];

  const co2Emitters = [
    { ll: [35, 105],  label: 'China',         co2: '10.7 Gt', pct: '30%', size: 55 },
    { ll: [40, -100], label: 'United States',  co2: '5.0 Gt',  pct: '14%', size: 40 },
    { ll: [22, 78],   label: 'India',          co2: '2.7 Gt',  pct: '7%',  size: 30 },
    { ll: [55, 40],   label: 'Russia',         co2: '1.8 Gt',  pct: '5%',  size: 25 },
    { ll: [36, 140],  label: 'Japan',          co2: '1.1 Gt',  pct: '3%',  size: 20 },
    { ll: [51, 10],   label: 'Germany',        co2: '0.7 Gt',  pct: '2%',  size: 16 },
    { ll: [25, 45],   label: 'Saudi Arabia',   co2: '0.6 Gt',  pct: '2%',  size: 15 },
    { ll: [-15, -50], label: 'Brazil',         co2: '0.5 Gt',  pct: '1.3%', size: 14 },
  ];

  function riskColor(risk) {
    if (risk === 'extreme') return '#ff1744';
    if (risk === 'high') return '#ff9100';
    return '#ffea00';
  }

  function openClimateIntro() {
    const overlay = document.createElement('div');
    overlay.id = 'climate-intro';
    overlay.innerHTML = `
      <div class="intro-card">
        <button class="intro-close" aria-label="Close">&times;</button>
        <div class="intro-kicker">DISPATCH N&deg; 06 &middot; FEATURE</div>
        <h2 class="intro-title"><em>A Quiet</em><br>Catastrophe</h2>
        <div class="intro-sub">What this map is. How it works. Why it matters.</div>
        <div class="intro-rule"></div>

        <div class="intro-body">
          <p><strong>THE BRIEF &mdash;</strong> Earth has warmed roughly
          <span class="hl">+1.2&deg;C</span> since the 19th century. That number
          sounds small. It isn't. Every tenth of a degree rewrites coastlines,
          harvest seasons, and habitability for hundreds of millions of people.
          This map makes that quiet catastrophe legible.</p>

          <p><strong>HOW TO READ IT &mdash;</strong> Three overlapping layers
          of data, each drawn from public climate science:</p>

          <div class="intro-legend">
            <div class="legend-row">
              <span class="legend-dot red"></span>
              <div>
                <div class="legend-name">Temperature anomalies</div>
                <div class="legend-desc">Ten hotspots where warming exceeds the global average. Pulsing rings encode risk tier &mdash; <em>extreme / high / medium</em>. Arctic leads at +4.2&deg;C.</div>
              </div>
            </div>
            <div class="legend-row">
              <span class="legend-dot blue"></span>
              <div>
                <div class="legend-name">Sea-level exposure</div>
                <div class="legend-desc">Ten coastal megacities ranked by population at risk under a 0.5&ndash;1.2 m rise by 2100. Jakarta and Dhaka lead.</div>
              </div>
            </div>
            <div class="legend-row">
              <span class="legend-dot dark"></span>
              <div>
                <div class="legend-name">CO&#8322; emissions</div>
                <div class="legend-desc">Bubble size is annual output. Eight countries emit two-thirds of the total. China alone is 30%.</div>
              </div>
            </div>
            <div class="legend-row">
              <span class="legend-dot ticker"></span>
              <div>
                <div class="legend-name">The ticker (top-right)</div>
                <div class="legend-desc">A running counter of projected global temperature anomaly from 2024 forward &mdash; the number you do not want to watch climb.</div>
              </div>
            </div>
          </div>

          <p class="intro-enigma">
            <span class="enigma-mark">&para;</span>
            <em>The enigma.</em> Climate change is not one thing. It is thousands
            of slow, linked feedback loops &mdash; ice that reflects sunlight until
            it doesn't, forests that absorb carbon until they exhale it, permafrost
            that stays locked until it unlocks. Each pulse on this map is a system
            whose tipping point we can calculate but cannot quite predict. You are
            looking at the <strong>present</strong>, animated with the
            <strong>future</strong>.
          </p>

          <div class="intro-meta">
            <div><span class="meta-k">Sources</span><span class="meta-v">NASA GISS, IPCC AR6, Climate Central</span></div>
            <div><span class="meta-k">Scale</span><span class="meta-v">1 : world</span></div>
            <div><span class="meta-k">Year</span><span class="meta-v">2024 &rarr; 2100</span></div>
          </div>
        </div>

        <button class="intro-enter">Enter the map &rarr;</button>
      </div>
    `;
    document.getElementById('app').appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('.intro-close').addEventListener('click', close);
    overlay.querySelector('.intro-enter').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
  }

  function showClimateChange() {
    clearAll();
    map.flyTo([20, 0], 3, { duration: 1.2 });
    openClimateIntro();

    // --- Temperature anomaly zones ---
    climateData.forEach((zone, i) => {
      const color = riskColor(zone.risk);
      const baseRadius = zone.risk === 'extreme' ? 45 : zone.risk === 'high' ? 35 : 28;

      // Animated warming rings
      for (let r = 0; r < 3; r++) {
        const ring = L.circleMarker(zone.ll, {
          radius: baseRadius + r * 10,
          color: color,
          fillColor: color,
          fillOpacity: 0.04 + (0.03 * (3 - r)),
          weight: 1,
          className: `climate-ring climate-ring-${r}`,
        }).addTo(map);
        layers.push(ring);
      }

      // Center marker
      const marker = L.circleMarker(zone.ll, {
        radius: 7,
        color: '#fff',
        fillColor: color,
        fillOpacity: 1,
        weight: 2,
        className: 'bounce-marker',
      })
        .bindPopup(`
          <div class="climate-popup">
            <strong>${zone.label}</strong><br>
            <span style="color:${color}; font-size: 1.1em; font-weight: bold;">${zone.tempRise}</span> above pre-industrial<br>
            <span style="color:${color}">Risk: ${zone.risk.toUpperCase()}</span><br>
            <em>${zone.desc}</em>
          </div>
        `)
        .addTo(map);
      layers.push(marker);

      // Temperature label
      setTimeout(() => {
        const label = L.marker(zone.ll, {
          icon: L.divIcon({
            className: 'climate-label',
            html: `<span style="color:${color}">${zone.tempRise}</span>`,
            iconSize: [50, 16],
            iconAnchor: [25, -12],
          }),
        }).addTo(map);
        layers.push(label);
      }, i * 150);
    });

    // --- Sea level rise markers (blue) ---
    seaLevelCities.forEach((city, i) => {
      setTimeout(() => {
        // Rising water animation ring
        const water = L.circleMarker(city.ll, {
          radius: 12,
          color: '#00b0ff',
          fillColor: '#0091ea',
          fillOpacity: 0.25,
          weight: 2,
          className: 'sea-level-ring',
        })
          .bindPopup(`
            <div class="climate-popup">
              <strong>${city.label}</strong><br>
              Projected sea rise: <span style="color:#00b0ff; font-weight:bold">${city.rise}</span> by 2100<br>
              <span style="color:#ff9100">${city.pop}</span>
            </div>
          `)
          .addTo(map);
        layers.push(water);
      }, i * 100);
    });

    // --- CO2 emission bubbles ---
    co2Emitters.forEach((emitter) => {
      const bubble = L.circleMarker(emitter.ll, {
        radius: emitter.size,
        color: 'rgba(255, 255, 255, 0.2)',
        fillColor: '#b71c1c',
        fillOpacity: 0.15,
        weight: 1,
        className: 'co2-bubble',
      })
        .bindPopup(`
          <div class="climate-popup">
            <strong>${emitter.label}</strong><br>
            CO2 emissions: <span style="color:#ef5350; font-weight:bold">${emitter.co2}/year</span><br>
            Global share: ${emitter.pct}
          </div>
        `)
        .addTo(map);
      layers.push(bubble);
    });

    // --- Animated rising temperature ticker ---
    let temp = 1.1;
    const tickerEl = document.createElement('div');
    tickerEl.id = 'climate-ticker';
    tickerEl.innerHTML = `<div class="ticker-label">Global Temp Anomaly</div><div class="ticker-value">+${temp.toFixed(1)}°C</div><div class="ticker-bar"><div class="ticker-fill" style="width:${(temp / 3) * 100}%"></div></div><div class="ticker-year">2024</div>`;
    document.getElementById('app').appendChild(tickerEl);
    layers._ticker = tickerEl;

    let year = 2024;
    function animateTicker() {
      temp += 0.002;
      year = 2024 + Math.floor((temp - 1.1) / 0.015);
      if (year > 2100) year = 2100;
      if (temp > 2.8) temp = 2.8;

      const fillPct = Math.min((temp / 3) * 100, 100);
      const hue = Math.max(0, 60 - (temp - 1.0) * 40);
      tickerEl.innerHTML = `
        <div class="ticker-label">Global Temp Anomaly</div>
        <div class="ticker-value" style="color: hsl(${hue}, 100%, 55%)">+${temp.toFixed(1)}°C</div>
        <div class="ticker-bar"><div class="ticker-fill" style="width:${fillPct}%; background: hsl(${hue}, 100%, 45%)"></div></div>
        <div class="ticker-year">${year}</div>
      `;

      if (temp < 2.8) {
        animationFrameId = requestAnimationFrame(animateTicker);
      }
    }
    animationFrameId = requestAnimationFrame(animateTicker);

    setInfo(`
      <h3>Climate Change Map</h3>
      <p><span style="color:#ff1744">Red zones</span> = temperature anomalies<br>
      <span style="color:#00b0ff">Blue markers</span> = sea level rise risk cities<br>
      <span style="color:#b71c1c">Dark bubbles</span> = CO2 emission by country</p>
      <p>Click any marker for detailed data.</p>
    `);
  }

  // Override clearAll to also remove ticker
  const originalClearAll = clearAll;
  function clearAllWithTicker() {
    originalClearAll();
    const ticker = document.getElementById('climate-ticker');
    if (ticker) ticker.remove();
  }

  // Reassign clearAll reference
  function clearAll() {
    layers.forEach((l) => {
      if (map.hasLayer(l)) map.removeLayer(l);
    });
    layers.length = 0;
    if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
    if (tourTimeout) { clearTimeout(tourTimeout); tourTimeout = null; }
    const ticker = document.getElementById('climate-ticker');
    if (ticker) ticker.remove();
  }

  // ── Controls ──────────────────────────────────────────────
  const actions = {
    markers: showAnimatedMarkers,
    route: showAnimatedRoute,
    heatpulse: showPulseZones,
    tour: showTour,
    weather: showWeatherLayer,
    climate: showClimateChange,
    reset() {
      clearAll();
      map.flyTo([20, 0], 3, { duration: 1 });
      setInfo('<p>Select a feature above to explore animated map capabilities.</p>');
    },
  };

  document.getElementById('controls').addEventListener('click', (e) => {
    const btn = e.target.closest('.ctrl-btn');
    if (!btn) return;
    const action = btn.dataset.action;
    if (!actions[action]) return;

    // Toggle active state
    document.querySelectorAll('.ctrl-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    actions[action]();
  });

  // ── Kick off with animated markers ────────────────────────
  showAnimatedMarkers();
})();
