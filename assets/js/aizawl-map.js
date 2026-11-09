/* Aizawl district — earthquake-triggered landslide hazard (B.Plan dissertation, 2022), rebuilt as a live model.
   Data: class layers packed in PNGs on a 100 m Web-Mercator grid (see scripts/build_aizawl_*.py).
   Landslide index = Σ wᵢ·scoreᵢ / Σ wᵢ (0–9). Combined = ceil(a·LS + (1−a)·EQ) on 1–5, where
   LS = clamp(round(index) − 3, 1, 5) and unscored cells count as LS 1 — the 2022 overlay recipe. */
(function () {
  const $ = (s) => document.querySelector(s);
  const DATA = "../data/aizawl/";
  const PAL = [[42, 85, 96], [63, 154, 140], [216, 197, 106], [255, 138, 61], [255, 61, 110]];
  const HEX = PAL.map((c) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join(""));
  const CL5 = ["Very low", "Low", "Moderate", "High", "Very high"];
  const STRUCT = 1;
  let M, map, popup, ctx, grid = {}, slideCells = [], model = {}, cv, tehBounds = {}, fly = {}, labels = [];
  const state = { view: "combined", ind: 0, w: [], gap: "2022", mix: 50, ov: { slides: true, quakes: false, fac: false, sites: false, roads: true, faults: false, admin: true, terrain: true } };

  const style = {
    version: 8,
    sources: { base: { type: "raster", tileSize: 256, maxzoom: 19, tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' } },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#0a0d10" } },
      { id: "base", type: "raster", source: "base", paint: { "raster-saturation": -1, "raster-brightness-min": 0.9, "raster-brightness-max": 0.06, "raster-contrast": 0.15, "raster-opacity": 0.85 } }
    ]
  };

  /* ---------- grid decoding ---------- */
  function decode(url, w, h) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0); res(x.getImageData(0, 0, w, h).data); };
      img.onerror = rej; img.src = url;
    });
  }
  async function loadGrid() {
    const { w, h } = M.grid, n = w * h;
    const [a, b] = await Promise.all([decode(DATA + "grid.png", w, h), decode(DATA + "grid2.png", w, h)]);
    grid.sc = M.indicators.map(() => new Uint8Array(n));
    grid.inside = new Uint8Array(n); grid.eq = new Uint8Array(n); grid.cb = new Uint8Array(n); grid.tid = new Uint8Array(n); grid.mun = new Uint8Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      if (a[p + 3] < 128) continue;
      grid.inside[i] = 1;
      M.indicators.forEach((d, j) => { const v = a[p + d.ch]; grid.sc[j][i] = d.hi ? v >> 4 : v & 15; });
      grid.eq[i] = b[p] >> 4; grid.cb[i] = b[p] & 15; grid.tid[i] = b[p + 1] >> 4; grid.mun[i] = b[p + 1] & 15;
    }
    grid.n = n; grid.nIn = grid.inside.reduce((s, v) => s + v, 0);
  }

  /* ---------- geometry helpers ---------- */
  const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
  function cellOf(lng, lat) {
    const c = M.grid.coords, { w, h } = M.grid;
    const col = Math.floor((lng - c[0][0]) / (c[1][0] - c[0][0]) * w);
    const row = Math.floor((mercY(c[0][1]) - mercY(lat)) / (mercY(c[0][1]) - mercY(c[2][1])) * h);
    return col < 0 || row < 0 || col >= w || row >= h ? -1 : row * w + col;
  }
  function boundsOf(geom) {
    const b = new maplibregl.LngLatBounds();
    (geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates).flat(2).forEach((p) => b.extend(p));
    return b;
  }

  /* ---------- the model ---------- */
  function compute() {
    const { n } = grid, W = state.w, S = W.reduce((s, v) => s + v, 0), a = state.mix / 100;
    const lhi = model.lhi || (model.lhi = new Float32Array(n)), comb = model.comb || (model.comb = new Uint8Array(n));
    for (let i = 0; i < n; i++) {
      if (!grid.inside[i]) { lhi[i] = NaN; comb[i] = 0; continue; }
      let s = 0, bad = S === 0;
      for (let j = 0; j < 6 && !bad; j++) {
        if (!W[j]) continue;
        const v = grid.sc[j][i];
        if (v === 15) { if (j === STRUCT && state.gap === "zero") continue; bad = true; } else s += W[j] * v;
      }
      const L = bad ? NaN : s / S; lhi[i] = L;
      const ls = Number.isNaN(L) ? 1 : Math.min(5, Math.max(1, Math.round(L) - 3));
      comb[i] = grid.eq[i] ? Math.ceil(a * ls + (1 - a) * grid.eq[i] - 1e-9) : 0;
    }
  }
  const lhiClass = (v) => (Number.isNaN(v) ? 0 : v >= M.lhiThresholds[1] ? 3 : v >= M.lhiThresholds[0] ? 2 : 1);
  // class (1..k, 0 = no value) of cell i in the current view
  function classAt(i) {
    switch (state.view) {
      case "combined": return model.comb[i];
      case "lhi": return lhiClass(model.lhi[i]);
      case "eq": return grid.eq[i];
      case "orig": return grid.cb[i];
      default: return 0;
    }
  }
  const isHigh = (c) => (state.view === "lhi" ? c === 3 : c >= 4);

  /* ---------- drawing ---------- */
  function ramp(t) {
    t = Math.min(1, Math.max(0, t)) * 4; const k = Math.min(3, Math.floor(t)), f = t - k;
    return PAL[k].map((v, i) => v + (PAL[k + 1][i] - v) * f);
  }
  function draw() {
    const { w, h } = M.grid, x = cv.getContext("2d"), img = x.createImageData(w, h), d = img.data;
    const ind = state.ind;
    for (let i = 0, p = 0; i < grid.n; i++, p += 4) {
      if (!grid.inside[i]) continue;
      let col = null, al = 235;
      if (state.view === "lhi") { const v = model.lhi[i]; if (Number.isNaN(v)) { col = [70, 78, 86]; al = 70; } else col = ramp((v - 3) / 5); }
      else if (state.view === "ind") { const v = grid.sc[ind][i]; if (v === 15) { col = [70, 78, 86]; al = 60; } else col = ramp(v / 9); }
      else { const c = classAt(i); if (c) col = PAL[c - 1]; }
      if (!col) continue;
      d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = al;
    }
    x.putImageData(img, 0, 0);
    const s = map.getSource("model"); if (s) { s.play(); setTimeout(() => s.pause(), 80); }
  }

  /* ---------- statistics & side panel ---------- */
  function stats() {
    const v = state.view, k = v === "lhi" ? 3 : 5;
    const area = new Array(k + 1).fill(0), teh = {}, tehN = {};
    let high = 0;
    if (v !== "ind") {
      for (let i = 0; i < grid.n; i++) {
        if (!grid.inside[i]) continue;
        const c = classAt(i); area[c]++;
        const t = grid.tid[i]; if (t) { tehN[t] = (tehN[t] || 0) + 1; if (isHigh(c)) teh[t] = (teh[t] || 0) + 1; }
        if (isHigh(c)) high++;
      }
    }
    return { area, teh, tehN, high, k };
  }
  function panel() {
    const v = state.view, ind = M.indicators[state.ind];
    // stacked share bar
    let parts = [];
    if (v === "ind") {
      const cnt = {}; for (let i = 0; i < grid.n; i++) if (grid.inside[i]) { const s = grid.sc[state.ind][i]; cnt[s] = (cnt[s] || 0) + 1; }
      parts = Object.keys(cnt).map(Number).sort((a, b) => (a === 15) - (b === 15) || a - b).map((s) => ({ c: s === 15 ? "#3a434b" : rgb(ramp(s / 9)), l: ind.cls[s] || "score " + s, p: cnt[s] / grid.nIn }));
    }
    const S = v === "ind" ? null : stats();
    if (S) {
      const labs = v === "lhi" ? ["Low", "Moderate", "High"] : CL5, cols = v === "lhi" ? [HEX[1], HEX[2], HEX[4]] : HEX;
      parts = labs.map((l, i) => ({ c: cols[i], l, p: S.area[i + 1] / grid.nIn }));
      if (S.area[0] / grid.nIn > 0.001) parts.push({ c: "#3a434b", l: v === "lhi" ? "Unscored" : "No data", p: S.area[0] / grid.nIn });
    }
    $("#share-t").textContent = v === "ind" ? `${ind.n}: share of district` : "Share of district";
    $("#stack").innerHTML = parts.map((q) => `<i style="width:${(q.p * 100).toFixed(2)}%;background:${q.c}" title="${q.l}: ${(q.p * 100).toFixed(1)}%"></i>`).join("");
    $("#stack-l").innerHTML = parts.map((q) => `<span><b style="background:${q.c}"></b>${q.l} <em>${pct(q.p)}</em></span>`).join("");

    $("#ctl-inv").hidden = $("#ctl-teh").hidden = v === "ind";
    if (S) {
      const hiLab = v === "lhi" ? "High" : "High + very high";
      let hits = 0, scored = 0;
      slideCells.forEach((i) => { const c = classAt(i); if (c) scored++; if (isHigh(c)) hits++; });
      const aShare = S.high / grid.nIn, pShare = hits / slideCells.length;
      $("#readout").innerHTML = [
        [pct(aShare), `of district rated ${hiLab.toLowerCase()}`], [pct(pShare), "of inventoried landslides"],
        [aShare ? (pShare / aShare).toFixed(1) + "×" : "—", "landslides vs area"], [v === "lhi" ? pct(scored / slideCells.length) : String(hits), v === "lhi" ? "landslides in scored cells" : "landslides in those cells"]
      ].map(([a, b]) => `<div><div class="v">${a}</div><div class="l">${b}</div></div>`).join("");
      $("#inv-note").textContent = v === "eq" ? "The earthquake layer is fixed; this tests how well it lines up with rainfall-triggered landslides." : "Inventory records are rainfall-triggered; none lists an earthquake as the trigger.";
      $("#teh-t").firstChild.textContent = (v === "lhi" ? "Tehsils, high landslide index " : "Tehsils, high + very high ");
      const rows = M.tehsils.map((name, i) => [name, (S.teh[i + 1] || 0) / (S.tehN[i + 1] || 1), i + 1]).sort((a, b) => b[1] - a[1]);
      const mx = rows[0][1] || 1;
      $("#bars").innerHTML = rows.map(([nm, s, id], r) => `<div class="bar-r${r === 0 ? " top" : ""}" data-t="${id}" title="Zoom to ${nm}"><span>${nm}</span><span class="track"><span class="fill" style="width:${(s / mx * 100).toFixed(1)}%"></span></span><span class="n">${(s * 100).toFixed(1)}%</span></div>`).join("");
    }
    // gap note
    let un = 0; for (let i = 0; i < grid.n; i++) if (grid.inside[i] && Number.isNaN(model.lhi[i])) un++;
    $("#gap-note").textContent = state.gap === "2022"
      ? `${pct(un / grid.nIn)} of the district has no landslide score, because structure was only mapped along features. In the combined layer these cells count as the lowest landslide class, as they did in 2022.`
      : "Away from mapped roads, streams and faults, structure adds nothing, so every cell gets a landslide score.";
    legend();
  }
  const pct = (p) => (p * 100 >= 10 ? Math.round(p * 100) : (p * 100).toFixed(1)) + "%";
  const rgb = (c) => `rgb(${c.map(Math.round).join(",")})`;

  function legend() {
    const v = state.view, L = $("#legend");
    const T = { combined: "Combined hazard, live", lhi: "Landslide index (0–9), live", eq: "Earthquake index, 2022", orig: "Combined hazard, as submitted in 2022", ind: M.indicators[state.ind].n + " — class score" };
    let body;
    if (v === "lhi") body = `<div class="ramp" style="background:linear-gradient(90deg,${HEX.join(",")})"></div><div class="ends"><span>≤3</span><span>low · 4 · moderate · 6.5 · high</span><span>8+</span></div>${state.gap === "2022" ? `<div class="sw"><b style="background:#3a434b"></b>no score (no mapped structure)</div>` : ""}`;
    else if (v === "ind") { const d = M.indicators[state.ind]; body = Object.keys(d.cls).map(Number).sort((a, b) => (a === 15) - (b === 15) || a - b).map((s) => `<div class="sw"><b style="background:${s === 15 ? "#3a434b" : rgb(ramp(s / 9))}"></b>${d.cls[s]}${s === 15 ? "" : ` <em>${s}</em>`}</div>`).join(""); }
    else body = CL5.map((l, i) => `<div class="sw"><b style="background:${HEX[i]}"></b>${l}</div>`).join("");
    L.innerHTML = `<div>${T[v]}</div>${body}`;
  }

  function controls() {
    const v = state.view, live = v === "combined" || v === "lhi";
    $("#ctl-weights").classList.toggle("off", !live); $("#ctl-gap").classList.toggle("off", !live); $("#ctl-mix").classList.toggle("off", v !== "combined");
    document.querySelectorAll("#ctl-weights input, #ctl-gap button, #reset").forEach((e) => (e.disabled = !live));
    $("#mix").disabled = v !== "combined";
    $("#ind-chips").hidden = v !== "ind";
    document.querySelectorAll("[data-view]").forEach((b) => { const on = b.dataset.view === v; b.classList.toggle("on", on); b.setAttribute("aria-checked", on); });
    document.querySelectorAll("[data-ind]").forEach((b) => { const on = +b.dataset.ind === state.ind; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
    document.querySelectorAll("[data-gap]").forEach((b) => { const on = b.dataset.gap === state.gap; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
    const S = state.w.reduce((s, x) => s + x, 0) || 1;
    state.w.forEach((wv, j) => { const r = document.getElementById("w" + j); r.value = wv; r.parentNode.querySelector(".wv").textContent = wv; r.parentNode.querySelector(".ws").textContent = Math.round(wv / S * 100) + "%"; });
    $("#mix-v").textContent = `landslide ${state.mix} · earthquake ${100 - state.mix}`;
  }

  let pending = false;
  function update(recompute = true) {
    if (pending) return; pending = true;
    requestAnimationFrame(() => { pending = false; if (recompute) compute(); controls(); draw(); panel(); });
  }

  /* ---------- overlays ---------- */
  function icon(kind) {
    const s = 44, c = document.createElement("canvas"); c.width = c.height = s; const x = c.getContext("2d");
    x.lineJoin = "round";
    if (kind === "parking") {
      x.beginPath(); for (let k = 0; k < 10; k++) { const r = k % 2 ? 8 : 18, a = -Math.PI / 2 + k * Math.PI / 5; x.lineTo(s / 2 + r * Math.cos(a), s / 2 + r * Math.sin(a)); }
      x.closePath(); x.fillStyle = "#e9edf0"; x.fill(); x.lineWidth = 4; x.strokeStyle = "#2e6fd8"; x.stroke();
    } else {
      const big = kind === "major", r = big ? 19 : 14;
      x.beginPath(); x.moveTo(s / 2, s / 2 - r); x.lineTo(s / 2 + r * .95, s / 2 + r * .7); x.lineTo(s / 2 - r * .95, s / 2 + r * .7); x.closePath();
      x.fillStyle = big ? "#ffbf00" : "#ff2a2a"; x.fill(); x.lineWidth = 3.5; x.strokeStyle = big ? "#ff2a2a" : "#07090b"; x.stroke();
    }
    return { width: s, height: s, data: x.getImageData(0, 0, s, s).data };
  }
  function addLayers() {
    cv = document.createElement("canvas"); cv.width = M.grid.w; cv.height = M.grid.h;
    map.addSource("terrain", { type: "image", url: DATA + "terrain.png", coordinates: M.terrain.coords });
    map.addSource("model", { type: "canvas", canvas: cv, coordinates: M.grid.coords, animate: false });
    map.addSource("ctx", { type: "geojson", data: ctx });
    ["parking", "shelter", "major"].forEach((k) => map.addImage("site-" + k, icon(k), { pixelRatio: 2 }));
    const K = (k) => ["==", ["get", "k"], k];
    map.addLayer({ id: "model", type: "raster", source: "model", paint: { "raster-opacity": .9, "raster-resampling": "nearest", "raster-fade-duration": 0 } });
    map.addLayer({ id: "terrain", type: "raster", source: "terrain", paint: { "raster-opacity": .85, "raster-fade-duration": 0 } });   // hillshade as shadow only, over the colours
    map.addLayer({ id: "roads", type: "line", source: "ctx", filter: K("road"), paint: { "line-color": "#e6ecef", "line-opacity": ["match", ["get", "c"], ["trunk", "primary"], .7, .38], "line-width": ["interpolate", ["linear"], ["zoom"], 9, ["match", ["get", "c"], ["trunk", "primary"], 1.3, .6], 14, ["match", ["get", "c"], ["trunk", "primary"], 3.2, 1.6]] } });
    map.addLayer({ id: "faults", type: "line", source: "ctx", filter: K("fault"), layout: { visibility: "none" }, paint: { "line-color": "#ff3d6e", "line-width": 2, "line-dasharray": [4, 2] } });
    map.addLayer({ id: "tehsil", type: "line", source: "ctx", filter: K("tehsil"), paint: { "line-color": "#e6ecef", "line-opacity": .55, "line-width": 1, "line-dasharray": [3, 2] } });
    map.addLayer({ id: "muni", type: "line", source: "ctx", filter: K("municipal"), paint: { "line-color": "#5ec8d8", "line-width": 1.8, "line-opacity": .9 } });
    map.addLayer({ id: "district", type: "line", source: "ctx", filter: K("district"), paint: { "line-color": "#e6ecef", "line-width": 1.6, "line-opacity": .8 } });
    map.addLayer({ id: "quakes", type: "circle", source: "ctx", filter: K("quake"), layout: { visibility: "none" }, paint: { "circle-radius": ["interpolate", ["linear"], ["get", "m"], 3.5, 4, 5, 9, 7, 20], "circle-color": "rgba(255,61,110,.12)", "circle-stroke-color": "#ff3d6e", "circle-stroke-width": 1.4 } });
    map.addLayer({ id: "slides", type: "circle", source: "ctx", filter: K("slide"), paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 2.2, 14, 5], "circle-color": "#ffd166", "circle-stroke-color": "#07090b", "circle-stroke-width": .8, "circle-opacity": .95 } });
    map.addLayer({ id: "fac", type: "circle", source: "ctx", filter: K("fac"), layout: { visibility: "none" }, paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, ["match", ["get", "c"], "hospital", 3.6, 2.4], 15, ["match", ["get", "c"], "hospital", 7, 5]], "circle-color": ["match", ["get", "c"], "hospital", "#5ec8d8", "comms", "#c6f26b", "school", "#b79cff", "community", "#b79cff", "#e6ecef"], "circle-stroke-color": "#07090b", "circle-stroke-width": 1 } });
    map.addLayer({ id: "sites", type: "symbol", source: "ctx", filter: K("site"), layout: { visibility: "none", "icon-image": ["concat", "site-", ["get", "c"]], "icon-allow-overlap": true, "icon-size": ["interpolate", ["linear"], ["zoom"], 9, .7, 13, 1.1] } });
    // tehsil names as HTML markers (no glyph server needed)
    ctx.features.filter((f) => f.properties.k === "tehsil_lbl").forEach((f) => {
      const el = document.createElement("div"); el.className = "tlbl"; el.textContent = f.properties.name;
      labels.push(new maplibregl.Marker({ element: el }).setLngLat(f.geometry.coordinates).addTo(map));
    });
  }
  function overlays() {
    const vis = (id, on) => map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    const o = state.ov;
    vis("slides", o.slides); vis("quakes", o.quakes); vis("fac", o.fac); vis("sites", o.sites); vis("roads", o.roads); vis("faults", o.faults);
    vis("tehsil", o.admin); vis("muni", o.admin); vis("terrain", o.terrain);
    labels.forEach((m) => (m.getElement().style.display = o.admin ? "" : "none"));
    document.querySelectorAll("[data-ov]").forEach((b) => { const on = !!o[b.dataset.ov]; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
  }

  /* ---------- probe (hover / tap) ---------- */
  function probe(e) {
    const i = cellOf(e.lngLat.lng, e.lngLat.lat), P = $("#probe");
    $("#map-hud").textContent = `${e.lngLat.lat.toFixed(4)}° N  ${e.lngLat.lng.toFixed(4)}° E  ·  z${map.getZoom().toFixed(1)}`;
    if (i < 0 || !grid.inside || !grid.inside[i]) { P.hidden = true; return; }
    const L = model.lhi[i], lc = lhiClass(L);
    const rows = M.indicators.map((d, j) => { const s = grid.sc[j][i]; return `<tr><td>${d.n}</td><td>${d.cls[s] || "—"}</td><td>${s === 15 ? "·" : s} × ${state.w[j]}</td></tr>`; }).join("");
    P.innerHTML = `<h6>${M.tehsils[grid.tid[i] - 1] || "Aizawl district"}${grid.mun[i] ? " · Aizawl city" : ""}</h6>
      <table class="sum"><tr><td>Combined</td><td>${CL5[model.comb[i] - 1] || "—"}</td></tr>
      <tr><td>Landslide index</td><td>${Number.isNaN(L) ? "unscored" : L.toFixed(1) + " · " + ["", "low", "moderate", "high"][lc]}</td></tr>
      <tr><td>Earthquake index</td><td>${CL5[grid.eq[i] - 1] || "—"}</td></tr>
      <tr><td>As submitted, 2022</td><td>${CL5[grid.cb[i] - 1] || "—"}</td></tr></table>
      <table class="ind"><tr><th>Indicator</th><th>Class</th><th>score × w</th></tr>${rows}</table>`;
    P.hidden = false;
  }

  /* ---------- wiring ---------- */
  function wire() {
    $("#sliders").innerHTML = M.indicators.map((d, j) => `<label class="sl"><span>${d.n}</span><input type="range" min="0" max="10" step="1" id="w${j}" value="${d.w}" aria-label="${d.n} weight"><b class="wv">${d.w}</b><em class="ws"></em></label>`).join("");
    $("#ind-chips").innerHTML = M.indicators.map((d, j) => `<button class="chip" data-ind="${j}" aria-pressed="false">${d.n}</button>`).join("");
    M.indicators.forEach((d, j) => document.getElementById("w" + j).addEventListener("input", (e) => { state.w[j] = +e.target.value; update(); }));
    $("#reset").addEventListener("click", () => { state.w = M.indicators.map((d) => d.w); state.gap = "2022"; state.mix = 50; $("#mix").value = 50; update(); });
    $("#mix").addEventListener("input", (e) => { state.mix = +e.target.value; update(); });
    document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => { state.view = b.dataset.view; update(false); }));
    $("#ind-chips").addEventListener("click", (e) => { const b = e.target.closest("[data-ind]"); if (!b) return; state.ind = +b.dataset.ind; update(false); });
    document.querySelectorAll("[data-gap]").forEach((b) => b.addEventListener("click", () => { state.gap = b.dataset.gap; update(); }));
    document.querySelectorAll("[data-ov]").forEach((b) => b.addEventListener("click", () => { const k = b.dataset.ov; state.ov[k] = !state.ov[k]; overlays(); }));
    $("#bars").addEventListener("click", (e) => { const r = e.target.closest(".bar-r"); if (r && tehBounds[r.dataset.t]) map.fitBounds(tehBounds[r.dataset.t], { padding: 40, duration: 900 }); });
    map.on("mousemove", probe);
    map.on("mouseout", () => { $("#probe").hidden = true; });
    map.on("click", (e) => {
      const f = map.queryRenderedFeatures(e.point, { layers: ["sites", "fac", "slides", "quakes"].filter((id) => map.getLayoutProperty(id, "visibility") !== "none") })[0];
      probe(e);
      if (!f) return;
      const p = f.properties, k = p.k;
      const html = k === "slide" ? `<h6>Landslide</h6><table><tr><td>Recorded</td><td>${p.yr || "—"}</td></tr><tr><td>Activity</td><td>${p.act || "—"}</td></tr><tr><td>Trigger</td><td>${p.rain ? "rainfall" : "not recorded / other"}</td></tr></table>`
        : k === "quake" ? `<h6>Earthquake</h6><table><tr><td>Magnitude</td><td>${p.m}</td></tr><tr><td>Year</td><td>${p.yr}</td></tr></table>`
        : k === "fac" ? `<h6>${p.n || { govt: "Government office", comms: "Communication centre", school: "School", community: "Community building", hospital: "Hospital" }[p.c]}</h6><table><tr><td>Type</td><td>${p.c}</td></tr></table>`
        : `<h6>${{ major: "Major evacuation shelter", shelter: "Evacuation shelter", parking: "Refugee parking" }[p.c]}</h6><table><tr><td>Capacity</td><td>${{ major: "400", shelter: "100", parking: "—" }[p.c]}</td></tr><tr><td>Source</td><td>2022 proposal, indicative</td></tr></table>`;
      popup.setLngLat(f.geometry.coordinates).setHTML(`<div class="pop">${html}</div>`).addTo(map);
    });
    ["sites", "fac", "slides", "quakes"].forEach((id) => { map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer")); map.on("mouseleave", id, () => (map.getCanvas().style.cursor = "")); });

    // "Show on map" buttons inside the chapters
    document.addEventListener("click", (e) => {
      const b = e.target.closest("[data-jump]"); if (!b) return;
      const d = b.dataset;
      if (d.view) state.view = d.view;
      if (d.ind) state.ind = +d.ind;
      if (d.gap) state.gap = d.gap;
      if (d.reset) { state.w = M.indicators.map((x) => x.w); state.mix = 50; $("#mix").value = 50; }
      (d.on || "").split(",").filter(Boolean).forEach((k) => (state.ov[k] = true));
      (d.off || "").split(",").filter(Boolean).forEach((k) => (state.ov[k] = false));
      overlays(); update();
      document.getElementById("explore").scrollIntoView({ behavior: "smooth", block: "start" });
      if (d.fly && fly[d.fly]) setTimeout(() => map.fitBounds(fly[d.fly], { padding: 40, duration: 1100 }), 450);
    });
  }

  /* ---------- boot ---------- */
  map = new maplibregl.Map({ container: "map", style, center: [92.92, 23.86], zoom: 8.6, minZoom: 7.5, maxZoom: 15,
    maxBounds: [[91.9, 22.9], [93.9, 24.9]], attributionControl: { compact: true }, cooperativeGestures: matchMedia("(max-width: 860px)").matches });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
  new ResizeObserver(() => map.resize()).observe(document.getElementById("map"));   // layout can shift after load (section rail)
  map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
  popup = new maplibregl.Popup({ closeButton: true, maxWidth: "260px" });

  map.on("load", async () => {
    [M, ctx] = await Promise.all([fetch(DATA + "meta.json").then((r) => r.json()), fetch(DATA + "context.geojson").then((r) => r.json())]);
    state.w = M.indicators.map((d) => d.w);
    ctx.features.forEach((f) => {
      const p = f.properties;
      if (p.k === "tehsil") tehBounds[p.id] = boundsOf(f.geometry);
      if (p.k === "district") fly.district = boundsOf(f.geometry);
      if (p.k === "municipal") fly.city = boundsOf(f.geometry);
    });
    fly.tlangnuam = tehBounds[M.tehsils.indexOf("Tlangnuam") + 1];
    map.fitBounds(fly.district, { padding: 24, duration: 0 });
    addLayers(); wire(); overlays(); controls(); legend();
    await loadGrid();
    ctx.features.forEach((f) => { if (f.properties.k === "slide") { const i = cellOf(...f.geometry.coordinates); if (i >= 0 && grid.inside[i]) slideCells.push(i); } });
    update();
    window.AizawlModel = { state, grid, model, stats, compute, slideCells, M };   // for checking in the console
  });
})();
