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

  function showClimateChange() {
    clearAll();
    map.flyTo([20, 0], 3, { duration: 1.2 });

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

  // ── 7. Hinton / Neural Network Atlas ──────────────────────
  // Geoffrey Hinton — career trajectory through neural network history
  const hintonJourney = [
    { ll: [52.2053, 0.1218],    year: '1970', place: 'Cambridge, UK',         role: 'BA Experimental Psychology', note: 'King\'s College. Abandons AI for psychology, then returns.' },
    { ll: [55.9533, -3.1883],   year: '1978', place: 'Edinburgh, UK',         role: 'PhD Artificial Intelligence', note: 'Thesis on relaxation nets. Supervised by Christopher Longuet-Higgins.' },
    { ll: [50.8659, -0.0865],   year: '1980', place: 'Sussex, UK',            role: 'Research Fellow',             note: 'Cognitive science with Philip Johnson-Laird.' },
    { ll: [32.8801, -117.2340], year: '1982', place: 'UC San Diego',          role: 'Visiting Scholar',            note: 'Joins Rumelhart and McClelland. Parallel Distributed Processing group.' },
    { ll: [40.4433, -79.9436],  year: '1982', place: 'Carnegie Mellon',       role: 'Assistant Professor',         note: 'Develops Boltzmann machines with Terry Sejnowski.' },
    { ll: [43.6629, -79.3957],  year: '1987', place: 'Toronto',               role: 'Professor, University of Toronto', note: 'Home base for 35+ years. Builds the dominant deep learning lab.' },
    { ll: [37.4220, -122.0841], year: '2013', place: 'Google Brain, CA',      role: 'VP & Engineering Fellow',      note: 'Acquired via DNNresearch after AlexNet. Half-time at Google.' },
    { ll: [43.6610, -79.3875],  year: '2023', place: 'Toronto',               role: 'Resigns from Google',          note: 'Warns publicly about existential AI risks.' },
    { ll: [59.3293, 18.0686],   year: '2024', place: 'Stockholm',              role: 'Nobel Prize in Physics',       note: 'Awarded with John Hopfield for foundational discoveries in machine learning.' },
  ];

  // Major neural network milestones / labs beyond Hinton
  const aiLabs = [
    { ll: [51.5279, -0.1224],   label: 'DeepMind',               year: '2010', note: 'London. Acquired by Google 2014. AlphaGo, AlphaFold.' },
    { ll: [37.7749, -122.4194], label: 'OpenAI',                 year: '2015', note: 'San Francisco. GPT series, ChatGPT.' },
    { ll: [42.3601, -71.0942],  label: 'MIT CSAIL',              year: '1959', note: 'Cambridge MA. Longest-running AI lab.' },
    { ll: [37.4275, -122.1697], label: 'Stanford AI Lab (SAIL)', year: '1963', note: 'Fei-Fei Li, ImageNet (2009).' },
    { ll: [48.8566, 2.3522],    label: 'Meta FAIR Paris',        year: '2015', note: 'Yann LeCun — Hinton\'s co-recipient of 2018 Turing Award.' },
    { ll: [40.0150, -105.2705], label: 'Anthropic',              year: '2021', note: 'San Francisco / Boulder. Claude, Constitutional AI.' },
    { ll: [40.0000, 116.3974],  label: 'Tsinghua AI',            year: '1978', note: 'Beijing. China\'s flagship AI research hub.' },
  ];

  function showHinton() {
    clearAll();
    map.flyTo([48, -20], 3, { duration: 1.3 });

    // --- Trajectory line (dashed "journey" line behind everything) ---
    const journeyPath = hintonJourney.map((s) => s.ll);
    const bgLine = L.polyline(journeyPath, {
      color: 'rgba(14, 14, 12, 0.2)',
      weight: 2,
      dashArray: '3 8',
      className: 'hinton-bg-line',
    }).addTo(map);
    layers.push(bgLine);

    // Animated tracer line
    const tracer = L.polyline([], {
      color: '#b8431e',
      weight: 3,
      className: 'glow-line',
    }).addTo(map);
    layers.push(tracer);

    // Moving dot
    const traceDot = L.circleMarker(journeyPath[0], {
      radius: 6,
      color: '#0e0e0c',
      fillColor: '#b8431e',
      fillOpacity: 1,
      weight: 2,
    }).addTo(map);
    layers.push(traceDot);

    // --- AI Labs (secondary layer, grey squares-ish) ---
    aiLabs.forEach((lab) => {
      const ring = L.circleMarker(lab.ll, {
        radius: 12,
        color: '#2b3a45',
        fillColor: 'rgba(43, 58, 69, 0.08)',
        weight: 1.5,
        className: 'ai-lab',
      })
        .bindPopup(`
          <div>
            <strong>${lab.label}</strong>
            <span style="font-family:'JetBrains Mono',monospace;font-size:0.7rem;color:#b8431e;letter-spacing:0.1em;">EST. ${lab.year}</span><br>
            <em>${lab.note}</em>
          </div>
        `)
        .addTo(map);
      layers.push(ring);

      const labLabel = L.marker(lab.ll, {
        icon: L.divIcon({
          className: 'ai-lab-label',
          html: `<span>${lab.label}</span>`,
          iconSize: [120, 16],
          iconAnchor: [60, -14],
        }),
      }).addTo(map);
      layers.push(labLabel);
    });

    // --- Animate the trajectory ---
    function interp(a, b, t) {
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }

    const totalSegs = journeyPath.length - 1;
    let progress = 0;
    const speed = 0.0025;
    let placedUntil = -1;

    function placeStop(i) {
      if (i < 0 || i > totalSegs) return;
      const stop = hintonJourney[i];
      const num = String(i + 1).padStart(2, '0');

      // Numbered marker
      const marker = L.circleMarker(stop.ll, {
        radius: 10,
        color: '#0e0e0c',
        fillColor: '#efeae0',
        fillOpacity: 1,
        weight: 2,
        className: 'hinton-marker',
      })
        .bindPopup(`
          <div>
            <strong>${stop.place}</strong>
            <span style="font-family:'JetBrains Mono',monospace;font-size:0.7rem;color:#b8431e;letter-spacing:0.1em;">${stop.year} &middot; ${num}/${String(hintonJourney.length).padStart(2,'0')}</span><br>
            <span style="font-weight:600;font-size:0.82rem;">${stop.role}</span><br>
            <em>${stop.note}</em>
          </div>
        `)
        .addTo(map);
      layers.push(marker);

      // Numbered label
      const labelHtml = `<span class="hinton-num">${num}</span><span class="hinton-year">${stop.year}</span><span class="hinton-place">${stop.place.split(',')[0]}</span>`;
      const labelMarker = L.marker(stop.ll, {
        icon: L.divIcon({
          className: 'hinton-label',
          html: labelHtml,
          iconSize: [140, 40],
          iconAnchor: [70, -14],
        }),
      }).addTo(map);
      layers.push(labelMarker);
    }

    // Place first stop immediately
    placeStop(0);
    placedUntil = 0;

    function step() {
      progress += speed;
      if (progress >= totalSegs) progress = totalSegs;

      const segIdx = Math.min(Math.floor(progress), totalSegs - 1);
      const t = progress - segIdx;
      const pos = interp(journeyPath[segIdx], journeyPath[segIdx + 1] || journeyPath[segIdx], t);

      // Build trail through segIdx and then to current pos
      const trail = journeyPath.slice(0, segIdx + 1).concat([pos]);
      tracer.setLatLngs(trail);
      traceDot.setLatLng(pos);

      // Place a stop when we cross into a new segment
      const currentStop = Math.ceil(progress);
      if (currentStop > placedUntil && currentStop <= totalSegs) {
        placeStop(currentStop);
        placedUntil = currentStop;
      }

      if (progress < totalSegs) {
        animationFrameId = requestAnimationFrame(step);
      }
    }
    animationFrameId = requestAnimationFrame(step);

    // --- Editorial byline / masthead card ---
    const bylineEl = document.createElement('div');
    bylineEl.id = 'hinton-byline';
    bylineEl.innerHTML = `
      <div class="byline-kicker">FEATURE &middot; 07</div>
      <div class="byline-title"><em>Geoffrey Hinton</em></div>
      <div class="byline-sub">The Godfather of Deep Learning</div>
      <div class="byline-rule"></div>
      <div class="byline-stats">
        <div><span class="stat-num">09</span><span class="stat-label">Stops</span></div>
        <div><span class="stat-num">54</span><span class="stat-label">Years</span></div>
        <div><span class="stat-num">01</span><span class="stat-label">Nobel</span></div>
      </div>
    `;
    document.getElementById('app').appendChild(bylineEl);

    setInfo(`
      <h3>A Cartography of Neural Nets</h3>
      <p>Follow <em>Geoffrey Hinton</em> &mdash; from Cambridge psychology to the 2024 Nobel &mdash; across nine stops that trace the deep learning revolution.</p>
      <p>Grey rings mark adjacent landmark AI laboratories. Click any point for detail.</p>
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
    const byline = document.getElementById('hinton-byline');
    if (byline) byline.remove();
  }

  // ── Controls ──────────────────────────────────────────────
  const actions = {
    markers: showAnimatedMarkers,
    route: showAnimatedRoute,
    heatpulse: showPulseZones,
    tour: showTour,
    weather: showWeatherLayer,
    climate: showClimateChange,
    hinton: showHinton,
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
