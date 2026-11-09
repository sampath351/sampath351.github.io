/* WRI India — Mumbai road crashes 2017–2020. Aggregated data only (see scripts/build_wri_public*.py).
   Analysis layers: fatalities by ward · fatal-crash density · fatal-crash locations (~35 m cells)
                    · all-crash density 2018–20 · fatal share of crashes by ward 2018–20
   Context layers:  suburban rail + stations · metro/monorail · express highways · major roads · park, rivers, airport */
(function () {
  const $ = (s) => document.querySelector(s);
  const DATA = "../data/wri/";
  const RAMP = ["#1b2530", "#3b2a3a", "#7a2f4a", "#c23b55", "#ef476f", "#ff8a3d", "#ffd166"];
  const RAMP_SHARE = ["#132a30", "#1d4a52", "#2c7a80", "#5ec8d8", "#c6f26b"];
  const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  const LABEL = {
    "v:ped": "Pedestrian fatalities", "v:tw": "Two-wheeler fatalities", "v:hv": "Heavy-vehicle fatalities", "v:cyc": "Cyclist fatalities",
    "ag:0_18": "Fatalities, under 18", "ag:18_35": "Fatalities, 18–35", "ag:35_60": "Fatalities, 35–60", "ag:60": "Fatalities, 60+"
  };
  const LAYERS = {
    wards: { t: "Fatalities per ward", years: [2017, 2018, 2019, 2020] },
    density: { t: "Fatal-crash density (relative)", years: [2017, 2018, 2019, 2020] },
    locations: { t: "Fatal-crash locations (~35 m cells)", years: [2017, 2018, 2019, 2020] },
    alldensity: { t: "All-crash density, 2018–20 (relative)", years: [2018, 2019, 2020] },
    share: { t: "Fatal share of all crashes, 2018–20", years: [2018, 2019, 2020] }
  };
  const state = { years: new Set([2017, 2018, 2019, 2020]), time: "all", who: null, view: "wards", ctx: { rail: true, metro: false, express: true, roads: false, green: true } };
  let A, map, popup, layers = {}, heatCv;

  // Basemap: OpenStreetMap standard tiles (no key), rendered as inverted greyscale to suit the dark theme.
  const style = {
    version: 8,
    sources: {
      base: { type: "raster", tileSize: 256, maxzoom: 19, tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#0a0d10" } },
      { id: "base", type: "raster", source: "base", paint: { "raster-saturation": -1, "raster-brightness-min": 0.9, "raster-brightness-max": 0.06, "raster-contrast": 0.15, "raster-opacity": 0.85 } }
    ]
  };

  const activeYears = () => LAYERS[state.view].years.filter((y) => state.years.has(y));
  const isAll = () => state.view === "alldensity" || state.view === "share";

  /* ---------- aggregate maths ---------- */
  const idx = (yi, pk, wi) => (yi * 2 + pk) * A.meta.who.length + wi;
  const whoIndex = (w) => A.meta.who.indexOf(w || "all");
  const timeOk = (pk) => !((state.time === "peak" && !pk) || (state.time === "off" && pk));
  function sumWard(ward, who, opts = {}) {
    const cell = A.wards[ward]; if (!cell) return { d: 0, n: 0 };
    const wi = whoIndex(who); let d = 0, n = 0;
    A.meta.years.forEach((y, yi) => {
      if (!state.years.has(y) || (opts.minYear && y < opts.minYear)) return;
      [0, 1].forEach((pk) => { if (!timeOk(pk) || (opts.pk != null && pk !== opts.pk)) return; d += cell.d[idx(yi, pk, wi)]; n += cell.n[idx(yi, pk, wi)]; });
    });
    return { d, n };
  }
  function sumAll(ward) { // all crashes 2018–20 → {n: all, f: fatal}
    const cell = A.all[ward]; if (!cell) return { n: 0, f: 0 }; let n = 0, f = 0;
    [2018, 2019, 2020].forEach((y) => { if (!state.years.has(y)) return; [0, 1].forEach((pk) => { if (!timeOk(pk)) return; const i = (y - 2018) * 2 + pk; n += cell.n[i]; f += cell.f[i]; }); });
    return { n, f };
  }

  function apply() {
    const wards = Object.keys(A.wards).filter((w) => w !== "_none");
    const metric = {}; let lab = [], max = 1;
    if (!isAll()) {
      let D = 0, N = 0, ped = 0, base = 0;
      Object.keys(A.wards).forEach((w) => {
        const s = sumWard(w, state.who); D += s.d; N += s.n;
        if (w !== "_none") metric[w] = s.d;
        if (!state.who) { ped += sumWard(w, "v:ped", { minYear: 2018 }).d; base += sumWard(w, null, { minYear: 2018 }).d; }
      });
      max = Math.max(1, ...Object.values(metric));
      lab = [[N.toLocaleString(), "Fatal crashes"], [D.toLocaleString(), state.who ? LABEL[state.who] : "Fatalities"], [base ? Math.round(ped / base * 100) + "%" : "—", "Pedestrian share*"]];
    } else {
      let n = 0, f = 0;
      Object.keys(A.all).forEach((w) => { const s = sumAll(w); n += s.n; f += s.f; if (w !== "_none") metric[w] = state.view === "share" ? (s.n >= 25 ? s.f / s.n : 0) : s.n; });
      max = Math.max(state.view === "share" ? .01 : 1, ...Object.values(metric));
      lab = [[n.toLocaleString(), "All crashes"], [f.toLocaleString(), "Fatal crashes"], [n ? (f / n * 100).toFixed(1) + "%" : "—", "Fatal share"]];
    }
    wards.forEach((name) => map.setFeatureState({ source: "wards", id: name }, { r: (metric[name] || 0) / max }));
    const fmt = (v) => state.view === "share" ? (v * 100).toFixed(1) + "%" : v;
    const top = Object.entries(metric).sort((a, b) => b[1] - a[1]);
    $("#readout").innerHTML = lab.map(([v, l]) => `<div><div class="v">${v}</div><div class="l">${l}</div></div>`).join("") +
      `<div><div class="v">${top.length && top[0][1] ? top[0][0] : "—"}</div><div class="l">${state.view === "share" ? "Highest fatal share" : "Highest ward"}</div></div>`;
    $("#bars").innerHTML = top.slice(0, 8).map(([k, v]) =>
      `<div class="bar-r" data-w="${k}" title="Zoom to ward ${k}"><span>${k}</span><span class="track"><span class="fill" style="width:${(v / (top[0][1] || 1) * 100).toFixed(1)}%"></span></span><span class="n">${fmt(v)}</span></div>`).join("");
    $("#legend-max").textContent = state.view === "share" ? (max * 100).toFixed(0) + "%" : max;
    $("#note-2017").hidden = !(state.view === "wards" && state.who && state.who.startsWith("v:") && state.years.has(2017));
    $("#note-who").hidden = !(state.who && state.view !== "wards");
    $("#note-all").hidden = !(isAll() && state.years.has(2017));
    $("#note-share").hidden = state.view !== "share";
    drawMonths(); drawLayers();
  }

  /* ---------- month profile ---------- */
  function drawMonths() {
    const src = isAll() ? A.months.all : A.months.fatal;
    const ys = activeYears().map(String).filter((y) => src[y]);
    const m = Array(12).fill(0); ys.forEach((y) => src[y].forEach((v, i) => (m[i] += v)));
    const mx = Math.max(1, ...m), tot = m.reduce((a, b) => a + b, 0);
    $("#months-t").textContent = (isAll() ? "All crashes" : "Fatal crashes") + " by month";
    $("#months").innerHTML = m.map((v, i) => `<div class="mo" title="${v} crashes"><i style="height:${(v / mx * 100).toFixed(1)}%"></i><span>${MONTHS[i]}</span></div>`).join("");
    const monsoon = m.slice(5, 9).reduce((a, b) => a + b, 0);
    $("#months-n").textContent = tot ? `Jun–Sep (monsoon): ${Math.round(monsoon / tot * 100)}% of ${tot.toLocaleString()} · time-of-day filter not applied` : "";
  }

  /* ---------- raster layers ---------- */
  async function loadLayers() {
    const { w, h } = A.meta.image;
    const tmp = document.createElement("canvas"); tmp.width = w; tmp.height = h;
    const tc = tmp.getContext("2d", { willReadFrequently: true });
    const names = [...A.meta.years.flatMap((y) => [0, 1].map((pk) => `${y}_${pk}`)), ...[2018, 2019, 2020].flatMap((y) => [0, 1].map((pk) => `all_${y}_${pk}`))];
    await Promise.all(names.map((nm) => new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        tc.clearRect(0, 0, w, h); tc.drawImage(img, 0, 0);
        const px = tc.getImageData(0, 0, w, h).data, dens = new Uint16Array(w * h), cnt = new Uint8Array(w * h);
        for (let i = 0, j = 0; i < px.length; i += 4, j++) { dens[j] = px[i] * 256 + px[i + 1]; cnt[j] = px[i + 2]; }
        layers[nm] = { dens, cnt }; res();
      };
      img.onerror = res; img.src = `${DATA}layers/${nm}.png`;
    })));
  }
  const HEAT = [[0, [0, 0, 0, 0]], [.12, [59, 42, 58, 120]], [.3, [194, 59, 85, 190]], [.55, [255, 138, 61, 225]], [1, [255, 209, 102, 245]]];
  const HEAT_ALL = [[0, [0, 0, 0, 0]], [.12, [19, 42, 48, 120]], [.3, [44, 122, 128, 185]], [.6, [94, 200, 216, 225]], [1, [198, 242, 107, 245]]];
  function ramp(stops, t) {
    for (let k = 1; k < stops.length; k++) if (t <= stops[k][0]) { const [a, ca] = stops[k - 1], [b, cb] = stops[k], f = (t - a) / (b - a); return ca.map((v, i) => v + (cb[i] - v) * f); }
    return stops[stops.length - 1][1];
  }
  const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
  function cellToLngLat(col, row) {
    const c = A.meta.image.coords, { w, h } = A.meta.image;
    const y0 = mercY(c[0][1]), y1 = mercY(c[2][1]), y = y0 + (y1 - y0) * row / h;
    return [c[0][0] + (c[1][0] - c[0][0]) * col / w, (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI];
  }
  function drawLayers() {
    if (!heatCv || !Object.keys(layers).length) return;
    const { w, h } = A.meta.image, n = w * h, all = isAll();
    const sum = new Float32Array(n), cnt = new Uint16Array(n);
    activeYears().forEach((y) => [0, 1].forEach((pk) => {
      if (!timeOk(pk)) return; const L = layers[(all ? "all_" : "") + y + "_" + pk]; if (!L) return;
      for (let i = 0; i < n; i++) { sum[i] += L.dens[i]; cnt[i] += L.cnt[i]; }
    }));
    let mx = 0; for (let i = 0; i < n; i++) if (sum[i] > mx) mx = sum[i];
    const hc = heatCv.getContext("2d"), img = hc.createImageData(w, h), stops = all ? HEAT_ALL : HEAT;
    for (let i = 0; i < n; i++) img.data.set(ramp(stops, Math.pow(sum[i] / (mx || 1), .6)), i * 4);
    hc.putImageData(img, 0, 0);
    const hs = map.getSource("heat"); if (hs) { hs.play(); setTimeout(() => hs.pause(), 120); }
    if (state.view === "locations") {
      const feats = [];
      for (let i = 0; i < n; i++) if (cnt[i]) { const [lon, lat] = cellToLngLat(i % w + .5, Math.floor(i / w) + .5); feats.push({ type: "Feature", properties: { c: cnt[i] }, geometry: { type: "Point", coordinates: [lon, lat] } }); }
      map.getSource("cells").setData({ type: "FeatureCollection", features: feats });
    }
  }

  /* ---------- map layers ---------- */
  function addLayers(wards, rail, roads, ctx) {
    heatCv = document.createElement("canvas"); heatCv.width = A.meta.image.w; heatCv.height = A.meta.image.h;
    map.addSource("wards", { type: "geojson", data: wards, promoteId: "name" });
    map.addSource("rail", { type: "geojson", data: rail });
    map.addSource("roads", { type: "geojson", data: roads });
    map.addSource("ctx", { type: "geojson", data: ctx });
    map.addSource("heat", { type: "canvas", canvas: heatCv, coordinates: A.meta.image.coords, animate: false });
    map.addSource("cells", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    const K = (k) => ["==", ["get", "k"], k];

    map.addLayer({ id: "c-park", type: "fill", source: "ctx", filter: K("park"), paint: { "fill-color": "#2c5a3a", "fill-opacity": .28 } });
    map.addLayer({ id: "c-river", type: "line", source: "ctx", filter: K("river"), paint: { "line-color": "#5ec8d8", "line-opacity": .45, "line-width": 1 } });
    map.addLayer({ id: "ward-fill", type: "fill", source: "wards", paint: {
      "fill-color": ["interpolate", ["linear"], ["coalesce", ["feature-state", "r"], 0], 0, RAMP[0], .15, RAMP[1], .3, RAMP[2], .5, RAMP[3], .7, RAMP[4], .85, RAMP[5], 1, RAMP[6]],
      "fill-opacity": ["interpolate", ["linear"], ["zoom"], 10, ["case", ["boolean", ["feature-state", "hover"], false], .85, .62], 13.5, ["case", ["boolean", ["feature-state", "hover"], false], .45, .25]] } });
    map.addLayer({ id: "heat", type: "raster", source: "heat", layout: { visibility: "none" }, paint: { "raster-opacity": .92, "raster-resampling": "linear", "raster-fade-duration": 0 } });
    map.addLayer({ id: "roads", type: "line", source: "roads", layout: { visibility: "none" }, paint: { "line-color": "#a9b6be", "line-opacity": .3, "line-width": ["interpolate", ["linear"], ["zoom"], 10, .5, 14, 1.6] } });
    map.addLayer({ id: "c-express", type: "line", source: "ctx", filter: K("expressway"), paint: { "line-color": "#e6ecef", "line-opacity": .75, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.6, 14, 4] } });
    map.addLayer({ id: "rail", type: "line", source: "rail", paint: { "line-color": "#a9b6be", "line-width": 1.2, "line-dasharray": [3, 2], "line-opacity": .6 } });
    map.addLayer({ id: "c-metro", type: "line", source: "ctx", filter: K("metro"), layout: { visibility: "none" }, paint: { "line-color": "#c6f26b", "line-width": 2, "line-opacity": .8 } });
    map.addLayer({ id: "ward-line", type: "line", source: "wards", paint: { "line-color": "#e6ecef", "line-opacity": .35, "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 2, .7] } });
    map.addLayer({ id: "dots", type: "circle", source: "cells", layout: { visibility: "none" }, paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, ["+", 1.6, ["*", .7, ["get", "c"]]], 15, ["+", 4.5, ["*", 1.6, ["get", "c"]]]],
      "circle-color": "#ffd166", "circle-opacity": .85, "circle-stroke-color": "#07090b", "circle-stroke-width": .6 } });
    map.addLayer({ id: "c-rail-stn", type: "circle", source: "ctx", filter: K("rail_stn"), minzoom: 11, paint: { "circle-radius": 2.4, "circle-color": "#07090b", "circle-stroke-color": "#e6ecef", "circle-stroke-width": 1.2 } });
    map.addLayer({ id: "c-metro-stn", type: "circle", source: "ctx", filter: K("metro_stn"), layout: { visibility: "none" }, paint: { "circle-radius": 2.6, "circle-color": "#07090b", "circle-stroke-color": "#c6f26b", "circle-stroke-width": 1.4 } });
    map.addLayer({ id: "c-airport", type: "circle", source: "ctx", filter: K("airport"), paint: { "circle-radius": 5, "circle-color": "rgba(94,200,216,.25)", "circle-stroke-color": "#5ec8d8", "circle-stroke-width": 1.2 } });
  }

  function setView() {
    const v = state.view, L = LAYERS[v];
    map.setLayoutProperty("ward-fill", "visibility", v === "wards" || v === "share" ? "visible" : "none");
    const r = v === "share" ? RAMP_SHARE : RAMP;
    map.setPaintProperty("ward-fill", "fill-color", ["interpolate", ["linear"], ["coalesce", ["feature-state", "r"], 0], ...r.flatMap((c, i) => [i / (r.length - 1), c])]);
    map.setLayoutProperty("heat", "visibility", v === "density" || v === "alldensity" ? "visible" : "none");
    map.setLayoutProperty("dots", "visibility", v === "locations" ? "visible" : "none");
    const vis = (id, on) => map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    vis("rail", state.ctx.rail); vis("c-rail-stn", state.ctx.rail);
    vis("c-metro", state.ctx.metro); vis("c-metro-stn", state.ctx.metro);
    vis("c-express", state.ctx.express); vis("roads", state.ctx.roads);
    vis("c-park", state.ctx.green); vis("c-river", state.ctx.green); vis("c-airport", state.ctx.green);
    $("#legend-t").textContent = L.t;
    const g = v === "share" ? `linear-gradient(90deg,${RAMP_SHARE.join(",")})` : v === "alldensity" ? "linear-gradient(90deg,#0a0d10,#1d4a52,#5ec8d8,#c6f26b)" : v === "density" ? "linear-gradient(90deg,#0a0d10,#3b2a3a,#c23b55,#ff8a3d,#ffd166)" : v === "locations" ? "#ffd166" : `linear-gradient(90deg,${RAMP.join(",")})`;
    $("#legend-ramp").style.background = g;
    $("#legend-min").textContent = v === "locations" ? "" : v.includes("density") ? "low" : "0";
    $("#legend-max").style.visibility = v === "wards" || v === "share" ? "visible" : "hidden";
    document.querySelectorAll("[data-year]").forEach((b) => { b.disabled = !L.years.includes(+b.dataset.year); });
    document.querySelectorAll("[data-who]").forEach((b) => { b.disabled = v !== "wards"; });
    document.querySelectorAll("[data-view]").forEach((b) => { const on = b.dataset.view === v; b.classList.toggle("on", on); b.setAttribute("aria-checked", on); });
    apply();
  }

  /* ---------- interaction ---------- */
  function wardPopup(name, lngLat) {
    let html;
    if (isAll()) {
      const s = sumAll(name);
      html = `<tr><td>All crashes</td><td>${s.n}</td></tr><tr><td>Fatal crashes</td><td>${s.f}</td></tr><tr><td>Fatal share</td><td>${s.n ? (s.f / s.n * 100).toFixed(1) : 0}%</td></tr>`;
    } else {
      const s = sumWard(name, state.who), pk = sumWard(name, state.who, { pk: 1 }), ped = state.who ? null : sumWard(name, "v:ped", { minYear: 2018 }).d;
      html = `<tr><td>Fatal crashes</td><td>${s.n}</td></tr><tr><td>${state.who ? LABEL[state.who] : "Fatalities"}</td><td>${s.d}</td></tr>
        <tr><td>Share in peak hours</td><td>${s.d ? Math.round(pk.d / s.d * 100) : 0}%</td></tr>${ped == null ? "" : `<tr><td>Pedestrian fatalities (2018–20)</td><td>${ped}</td></tr>`}`;
    }
    popup.setLngLat(lngLat).setHTML(`<div class="pop"><h6>Ward ${name}</h6><table>${html}</table></div>`).addTo(map);
  }
  function inside(pt, geom) {
    const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
    return polys.some((rings) => { let c = false; const ring = rings[0];
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c; }
      return c; });
  }
  function wire(wards) {
    document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => { state.view = b.dataset.view; setView(); }));
    document.querySelectorAll("[data-year]").forEach((b) => b.addEventListener("click", () => {
      const y = +b.dataset.year;
      if (state.years.has(y) && activeYears().length === 1 && LAYERS[state.view].years.includes(y)) return;
      state.years.has(y) ? state.years.delete(y) : state.years.add(y);
      b.classList.toggle("on", state.years.has(y)); b.setAttribute("aria-pressed", state.years.has(y)); apply();
    }));
    const group = (attr, key, toggleable) => document.querySelectorAll(`[${attr}]`).forEach((b) => b.addEventListener("click", () => {
      const val = b.getAttribute(attr); state[key] = toggleable && state[key] === val ? null : val;
      document.querySelectorAll(`[${attr}]`).forEach((x) => { const on = x.getAttribute(attr) === state[key]; x.classList.toggle("on", on); x.setAttribute("aria-pressed", on); });
      apply();
    }));
    group("data-time", "time"); group("data-who", "who", true);
    $("#who-clear").addEventListener("click", () => { state.who = null; document.querySelectorAll("[data-who]").forEach((x) => { x.classList.remove("on"); x.setAttribute("aria-pressed", false); }); apply(); });
    document.querySelectorAll("[data-ctx]").forEach((b) => b.addEventListener("click", () => { const k = b.dataset.ctx; state.ctx[k] = !state.ctx[k]; b.classList.toggle("on", state.ctx[k]); b.setAttribute("aria-pressed", state.ctx[k]); setView(); }));

    const bounds = {};
    wards.features.forEach((f) => { const b = new maplibregl.LngLatBounds(); (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates).flat(2).forEach((c) => b.extend(c)); bounds[f.properties.name] = b; });
    $("#bars").addEventListener("click", (e) => { const r = e.target.closest(".bar-r"); if (!r || !bounds[r.dataset.w]) return; map.fitBounds(bounds[r.dataset.w], { padding: 60, duration: 900 }); wardPopup(r.dataset.w, bounds[r.dataset.w].getCenter()); });
    let hovered = null;
    map.on("mousemove", "ward-fill", (e) => { const id = e.features[0].id; if (hovered === id) return; if (hovered) map.setFeatureState({ source: "wards", id: hovered }, { hover: false }); hovered = id; map.setFeatureState({ source: "wards", id }, { hover: true }); map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "ward-fill", () => { if (hovered) map.setFeatureState({ source: "wards", id: hovered }, { hover: false }); hovered = null; map.getCanvas().style.cursor = ""; });
    map.on("click", (e) => { const hit = wards.features.find((f) => inside([e.lngLat.lng, e.lngLat.lat], f.geometry)); if (hit) wardPopup(hit.properties.name, e.lngLat); });
    const hud = $("#map-hud");
    map.on("mousemove", (e) => { hud.textContent = `${e.lngLat.lat.toFixed(5)}° N  ${e.lngLat.lng.toFixed(5)}° E  ·  z${map.getZoom().toFixed(1)}`; });
  }

  /* ---------- boot ---------- */
  map = new maplibregl.Map({ container: "map", style, center: [72.875, 19.07], zoom: 10.4, minZoom: 9, maxZoom: 15.5,
    maxBounds: [[72.4, 18.7], [73.4, 19.5]], attributionControl: { compact: true }, cooperativeGestures: matchMedia("(max-width: 860px)").matches });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
  new ResizeObserver(() => map.resize()).observe(document.getElementById("map"));   // layout can shift after load (section rail)
  map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
  popup = new maplibregl.Popup({ closeButton: true, maxWidth: "280px" });

  map.on("load", async () => {
    const [agg, wards, rail, roads, ctx] = await Promise.all(["agg.json", "wards.geojson", "rail.geojson", "roads.geojson", "context.geojson"].map((n) => fetch(DATA + n).then((r) => r.json())));
    A = agg;
    addLayers(wards, rail, roads, ctx);
    const b = new maplibregl.LngLatBounds(); wards.features.forEach((f) => (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates).flat(2).forEach((p) => b.extend(p)));
    map.fitBounds(b, { padding: 30, duration: 0 });
    wire(wards); setView();
    await loadLayers(); drawLayers();
  });
})();
