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

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
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

  // ── Controls ──────────────────────────────────────────────
  const actions = {
    markers: showAnimatedMarkers,
    route: showAnimatedRoute,
    heatpulse: showPulseZones,
    tour: showTour,
    weather: showWeatherLayer,
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
