/* Lab 01 · Address-order checker, central Helsinki (OpenStreetMap extract, April 2019).
   Data: data/lab/address-order/ built by lab/address_order.py (see the notebook).
     addresses.geojson  one point per address: a = address, f = first flag (or ok / unchecked),
                        why = reasons, as = how it was written, t = other places a duplicate sits
     streets.geojson    the streets the addresses were checked against
     base.geojson       building outlines (k = b) and highway lines (k = major / minor), same extract
   No basemap tiles: everything on the map comes from the same 2019 snapshot the checks ran on. */
(function () {
  const $ = (s) => document.querySelector(s);
  const DATA = "../data/lab/address-order/";
  const KINDS = [
    { k: "text", name: "Text", c: "#5ec8d8", d: "name or number written differently" },
    { k: "far", name: "Far", c: "#ef476f", d: "over 120 m from its street" },
    { k: "dup", name: "Duplicate", c: "#ff8a3d", d: "on buildings over 25 m apart" },
    { k: "side", name: "Side", c: "#ffd166", d: "odd / even on the wrong side" },
    { k: "sequence", name: "Sequence", c: "#b39dfa", d: "out of running order" },
    { k: "ok", name: "No flag", c: "#6d7c86", d: "passed every check that applies" },
    { k: "unchecked", name: "Unchecked", c: "#46535c", d: "street not in the extract" }
  ];
  const COL = Object.fromEntries(KINDS.map((x) => [x.k, x.c]));
  const shown = new Set(KINDS.map((x) => x.k));
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let map, AD, picked = null, tags = [];

  const load = (f) => fetch(DATA + f).then((r) => r.json());
  Promise.all([load("addresses.geojson"), load("streets.geojson"), load("base.geojson")]).then(([ad, st, base]) => {
    AD = ad;
    ad.features.forEach((f, i) => { f.id = i; f.properties.i = i; });
    hero(base, ad);
    side(ad);
    build(ad, st, base);
  }).catch(() => { const h = $("#map-hud"); if (h) h.textContent = "map data could not be loaded"; });

  /* ---------- hero: the same streets and flags, drawn faint behind the title ---------- */
  function hero(base, ad) {
    const cv = $("#ao-hero"); if (!cv) return;
    const draw = () => {
      const W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return;
      const k = Math.min(devicePixelRatio || 1, 2); cv.width = W * k; cv.height = H * k;
      const x = cv.getContext("2d"); x.setTransform(k, 0, 0, k, 0, 0); x.clearRect(0, 0, W, H);
      const B = [24.9352, 60.1642, 24.9534, 60.179], ky = 1 / Math.cos(60.17 * Math.PI / 180);
      const s = Math.max((W * .62) / (B[2] - B[0]), (H * 1.15) / ((B[3] - B[1]) * ky));
      const ox = W - (B[2] - B[0]) * s, oy = H / 2 + ((B[3] + B[1]) / 2) * ky * s;
      const P = (c) => [ox + (c[0] - B[0]) * s, oy - c[1] * ky * s];
      base.features.forEach((f) => {
        if (f.properties.k === "b") return;
        x.beginPath(); f.geometry.coordinates.forEach((c, i) => { const p = P(c); i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]); });
        x.strokeStyle = f.properties.k === "major" ? "rgba(94,200,216,.34)" : "rgba(94,200,216,.16)"; x.lineWidth = f.properties.k === "major" ? 1.3 : .7; x.stroke();
      });
      ad.features.forEach((f) => {
        const p = P(f.geometry.coordinates), fl = f.properties.f !== "ok" && f.properties.f !== "unchecked";
        x.beginPath(); x.arc(p[0], p[1], fl ? 3.2 : 1.3, 0, 7); x.fillStyle = fl ? COL[f.properties.f] : "rgba(169,182,190,.35)"; x.fill();
      });
    };
    draw(); let t; addEventListener("resize", () => { clearTimeout(t); t = setTimeout(draw, 150); });
  }

  /* ---------- side panel ---------- */
  function side(ad) {
    const n = {}; ad.features.forEach((f) => { n[f.properties.f] = (n[f.properties.f] || 0) + 1; });
    $("#ao-kinds").innerHTML = KINDS.map((x) => `<button class="lyr on" data-k="${x.k}" aria-pressed="true"><i style="background:${x.c}"></i>${x.name} <b class="ao-n">${n[x.k] || 0}</b><small>${x.d}</small></button>`).join("");
    $("#ao-kinds").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      const k = b.dataset.k, on = !shown.has(k);
      on ? shown.add(k) : shown.delete(k);
      b.classList.toggle("on", on); b.setAttribute("aria-pressed", on);
      filter();
    });
    const flagged = ad.features.filter((f) => !["ok", "unchecked"].includes(f.properties.f));
    $("#ao-list").innerHTML = KINDS.filter((x) => n[x.k] && !["ok", "unchecked"].includes(x.k)).map((x) =>
      `<div class="ao-grp"><span class="ao-gh" style="--c:${x.c}">${x.name}</span>${flagged.filter((f) => f.properties.f === x.k)
        .sort((a, b) => a.properties.a.localeCompare(b.properties.a, "fi", { numeric: true }))
        .map((f) => `<button type="button" data-i="${f.properties.i}">${esc(f.properties.a)}</button>`).join("")}</div>`).join("");
    $("#ao-list").addEventListener("click", (e) => { const b = e.target.closest("button[data-i]"); if (b) pick(+b.dataset.i, true); });
  }

  /* ---------- map ---------- */
  function build(ad, st, base) {
    if (!window.maplibregl) return;
    const twins = { type: "FeatureCollection", features: [] };
    ad.features.forEach((f) => (f.properties.t || []).forEach((t) => {
      twins.features.push({ type: "Feature", properties: { i: f.properties.i, f: f.properties.f }, geometry: { type: "LineString", coordinates: [f.geometry.coordinates, t] } });
      twins.features.push({ type: "Feature", properties: { i: f.properties.i, f: f.properties.f, twin: 1 }, geometry: { type: "Point", coordinates: t } });
    }));
    map = new maplibregl.Map({
      container: "map", attributionControl: false, dragRotate: false, pitchWithRotate: false,
      bounds: [[24.9352, 60.1642], [24.9534, 60.179]], fitBoundsOptions: { padding: 30 }, maxZoom: 19, minZoom: 12,
      style: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#0a0d10" } }] }
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · 2019 extract' }));
    map.touchZoomRotate.disableRotation();
    map.on("load", () => {
      map.addSource("base", { type: "geojson", data: base });
      map.addSource("st", { type: "geojson", data: st });
      map.addSource("ad", { type: "geojson", data: ad });
      map.addSource("tw", { type: "geojson", data: twins });
      map.addLayer({ id: "bld", type: "fill", source: "base", filter: ["==", ["get", "k"], "b"], paint: { "fill-color": "#121920", "fill-outline-color": "#1f2a33" } });
      map.addLayer({ id: "rd", type: "line", source: "base", filter: ["!=", ["get", "k"], "b"], paint: { "line-color": ["match", ["get", "k"], "major", "#34434f", "#232e37"], "line-width": ["interpolate", ["linear"], ["zoom"], 13, ["match", ["get", "k"], "major", 1.4, .6], 17, ["match", ["get", "k"], "major", 5, 2.4]] } });
      map.addLayer({ id: "st", type: "line", source: "st", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": "#2f5560", "line-width": ["interpolate", ["linear"], ["zoom"], 13, .8, 17, 3] } });
      map.addLayer({ id: "st-ml", type: "line", source: "st", filter: ["==", ["geometry-type"], "MultiLineString"], paint: { "line-color": "#2f5560", "line-width": ["interpolate", ["linear"], ["zoom"], 13, .8, 17, 3] } });
      map.addLayer({ id: "st-hi", type: "line", source: "st", filter: ["==", ["get", "name"], ""], paint: { "line-color": "#5ec8d8", "line-width": ["interpolate", ["linear"], ["zoom"], 13, 1.6, 17, 5], "line-opacity": .7 } });
      map.addLayer({ id: "tw-l", type: "line", source: "tw", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": "#ff8a3d", "line-width": 1.4, "line-dasharray": [2, 2], "line-opacity": .85 } });
      map.addLayer({ id: "tw-p", type: "circle", source: "tw", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 5, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#ff8a3d", "circle-stroke-width": 1.6 } });
      map.addLayer({ id: "ad-base", type: "circle", source: "ad", filter: ["in", ["get", "f"], ["literal", ["ok", "unchecked"]]], paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 1.6, 17, 4.5],
        "circle-color": ["match", ["get", "f"], "unchecked", "rgba(0,0,0,0)", "#6d7c86"],
        "circle-stroke-color": "#6d7c86", "circle-stroke-width": ["match", ["get", "f"], "unchecked", 1.2, 0] } });
      map.addLayer({ id: "ad-flag", type: "circle", source: "ad", filter: ["!", ["in", ["get", "f"], ["literal", ["ok", "unchecked"]]]], paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 4, 17, 8],
        "circle-color": ["match", ["get", "f"], ...KINDS.flatMap((x) => [x.k, x.c]), "#fff"],
        "circle-stroke-color": "#07090b", "circle-stroke-width": 1.2 } });
      map.addLayer({ id: "ad-pick", type: "circle", source: "ad", filter: ["==", ["get", "i"], -1], paint: { "circle-radius": 13, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#e6ecef", "circle-stroke-width": 2 } });

      const hud = $("#map-hud");
      ["ad-flag", "ad-base"].forEach((id) => {
        map.on("mousemove", id, (e) => {
          map.getCanvas().style.cursor = "pointer";
          const p = e.features[0].properties;
          hud.textContent = `${p.a} · ${KINDS.find((x) => x.k === p.f).name.toLowerCase()}`;
        });
        map.on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; hud.textContent = "hover or tap an address"; });
      });
      map.on("click", (e) => {
        const hit = map.queryRenderedFeatures([[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]], { layers: ["ad-flag", "ad-base"] });
        if (hit.length) pick(hit[0].properties.i, false); else pick(null);
      });
      filter();
    });
  }

  function filter() {
    if (!map || !map.getLayer("ad-flag")) return;
    const ks = ["literal", [...shown]];
    map.setFilter("ad-flag", ["all", ["!", ["in", ["get", "f"], ["literal", ["ok", "unchecked"]]]], ["in", ["get", "f"], ks]]);
    map.setFilter("ad-base", ["all", ["in", ["get", "f"], ["literal", ["ok", "unchecked"]]], ["in", ["get", "f"], ks]]);
    const tw = shown.has("dup") ? null : ["==", 1, 0];
    map.setFilter("tw-l", tw || ["==", ["geometry-type"], "LineString"]);
    map.setFilter("tw-p", tw || ["==", ["geometry-type"], "Point"]);
  }

  function pick(i, fly) {
    picked = i;
    document.querySelectorAll("#ao-list button").forEach((b) => b.classList.toggle("on", +b.dataset.i === i));
    const box = $("#ao-pick");
    if (i == null) {
      if (map && map.getLayer("ad-pick")) { map.setFilter("ad-pick", ["==", ["get", "i"], -1]); map.setFilter("st-hi", ["==", ["get", "name"], ""]); }
      tags.forEach((m) => m.remove()); tags = [];
      box.innerHTML = `<p class="note">Click an address on the map, or one in the list below, to see why it was flagged.</p>`;
      return;
    }
    const f = AD.features[i], p = f.properties, K = KINDS.find((x) => x.k === p.f);
    const street = p.a.replace(/\s+\d.*$/, "");
    const why = (p.why || []).map((w) => { const [k, ...r] = w.split(": "); const kk = KINDS.find((x) => x.k === k); return `<li><b style="color:${kk ? kk.c : "inherit"}">${kk ? kk.name : esc(k)}</b> ${esc(r.join(": "))}</li>`; }).join("");
    box.innerHTML = `<div class="ao-card" style="--c:${K.c}"><span class="mono">${K.name}</span><h4>${esc(p.a)}</h4>
      ${why ? `<ul>${why}</ul>` : `<p class="note">${p.f === "unchecked" ? "Its street isn't in this extract, so nothing could be checked." : "No flag: it passed every check that applies to it."}</p>`}
      ${p.as ? `<p class="note">Written as: ${p.as.map((s) => `<i>${esc(s)}</i>`).join(", ")}</p>` : ""}
      ${p.t ? `<p class="note">Dashed lines lead to the other place${p.t.length > 1 ? "s" : ""} it is tagged.</p>` : ""}</div>`;
    if (map && map.getLayer("ad-pick")) {
      map.setFilter("ad-pick", ["==", ["get", "i"], i]);
      map.setFilter("st-hi", ["==", ["get", "name"], street]);
      // house numbers along the picked street, so side and order can be read off the map
      tags.forEach((m) => m.remove()); tags = [];
      AD.features.filter((g) => g.properties.a.startsWith(street + " ") && /^\d/.test(g.properties.a.slice(street.length + 1))).slice(0, 120).forEach((g) => {
        const el = document.createElement("span"); el.className = "ao-hn" + (g.properties.i === i ? " on" : "");
        el.textContent = g.properties.a.slice(street.length + 1);
        tags.push(new maplibregl.Marker({ element: el, anchor: "bottom", offset: [0, -7] }).setLngLat(g.geometry.coordinates).addTo(map));
      });
      if (fly) {
        const pts = [f.geometry.coordinates, ...(p.t || [])];
        if (pts.length > 1) map.fitBounds(pts.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(pts[0], pts[0])), { padding: 90, maxZoom: 17.5 });
        else map.flyTo({ center: pts[0], zoom: Math.max(map.getZoom(), 17) });
        if (innerWidth <= 860) document.getElementById("map").scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }
})();
