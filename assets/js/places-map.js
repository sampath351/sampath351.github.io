/* Map of where the photographs were taken (Photography page).
   Outline: India (India's official boundary, from Natural Earth's India-view file) with Nepal, Bhutan, Bangladesh
   and Sri Lanka. Points: site.json → personal.places (name, lat, lon), edited in the admin.
   Two modes:
   - "backdrop": a dim, zoomed-in map filling the screen behind the page (cropped at the edges, like the contour
     backdrop on the other pages). When the place changes, the camera glides so that place sits at the focus point
     on the right, and a live point pops in there. While you scroll, the map drifts slowly, as the contours do.
   - "mini": a small locator (used on phones, where the photos need the full width).
   Usage: const m = await PlacesMap(el, url, places, { mode, onPick }); m.set("Nepal", "readout html") */
window.PlacesMap = async function (el, url, places, opts = {}) {
  const mode = opts.mode || "mini", onPick = opts.onPick;
  const G = await (window.__pmGeo || (window.__pmGeo = fetch(url).then((r) => r.json())));
  const [, , W, H] = G.viewBox, P = G.proj;
  const xy = (p) => [(p.lon - P.lon0) * P.kx, (P.lat1 - p.lat) * P.ky];
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pts = places.filter((p) => p && p.lat !== "" && p.lon !== "" && isFinite(+p.lat) && isFinite(+p.lon)).map((p) => ({ ...p, lat: +p.lat, lon: +p.lon }));
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const svgHTML = `<svg viewBox="0 0 ${W} ${H}" ${mode === "mini" ? 'preserveAspectRatio="xMidYMid meet"' : ""} role="img" aria-label="Map of where the photographs were taken">
      <g class="pm-land">${G.shapes.map((s) => `<path class="pm-${s.id.toLowerCase()}" d="${s.d}"/>`).join("")}</g>
      <g class="pm-cross" opacity="0"><line class="pm-h" x1="-2000" x2="${W + 2000}"/><line class="pm-v" y1="-2000" y2="${H + 2000}"/></g>
      <g class="pm-dots">${pts.map((p) => { const [x, y] = xy(p); return `<g class="pm-dot" data-p="${esc(p.name)}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"${mode === "mini" ? ` tabindex="0" role="button" aria-label="${esc(p.name)}"` : ""}><g class="pm-s"><circle class="pm-hit" r="12"/><circle class="pm-core" r="3.5"/></g></g>`; }).join("")}</g>
      <g class="pm-live" opacity="0"><g class="pm-s"><circle class="pm-ring r1" r="5"/><circle class="pm-ring r2" r="5"/><circle class="pm-pin" r="5"/></g><text class="pm-label" x="16" y="6"></text></g>
    </svg>`;
  el.classList.add("pm-" + mode);
  el.innerHTML = mode === "backdrop" ? `<div class="pm-cam"><div class="pm-drift">${svgHTML}</div></div><div class="pm-read" aria-live="polite"></div>` : svgHTML;
  const svg = el.querySelector("svg"), live = svg.querySelector(".pm-live"), cross = svg.querySelector(".pm-cross"), read = el.querySelector(".pm-read");
  if (onPick && mode === "mini") {
    el.addEventListener("click", (e) => { const d = e.target.closest(".pm-dot"); if (d) onPick(d.dataset.p); });
    el.addEventListener("keydown", (e) => { const d = e.target.closest(".pm-dot"); if (d && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onPick(d.dataset.p); } });
  }

  /* ---------- backdrop camera ---------- */
  let s = 1, cur, curP = null;
  const cam = el.querySelector(".pm-cam"), drift = el.querySelector(".pm-drift");
  function size() {
    if (mode !== "backdrop") return;
    const vw = innerWidth, vh = innerHeight;
    s = Math.max((vh * 2.3) / H, (vw * 1.25) / W);              // zoomed in: India is much bigger than the screen
    svg.style.width = W * s + "px"; svg.style.height = H * s + "px";
    svg.style.setProperty("--u", (1 / s).toFixed(5));          // keeps markers and labels a fixed size on screen
    const lab = svg.querySelector(".pm-label"); lab.setAttribute("x", (16 / s).toFixed(2)); lab.setAttribute("y", (5 / s).toFixed(2));
    aim(true);
  }
  function aim(instant) {
    if (mode !== "backdrop") return;
    const phone = innerWidth <= 1000;
    const fx = innerWidth * (phone ? .66 : .74), fy = innerHeight * (phone ? .34 : .46);   // where the place settles on screen
    const [x, y] = curP ? xy(curP) : [W * .5, H * .45];
    if (instant || reduce) { cam.style.transition = "none"; requestAnimationFrame(() => (cam.style.transition = "")); }
    cam.style.transform = `translate3d(${(fx - x * s).toFixed(1)}px, ${(fy - y * s).toFixed(1)}px, 0)`;
  }
  // slow drift with the page scroll, like the contours on the other pages
  let raf = 0;
  const onScroll = () => { if (raf || reduce) return; raf = requestAnimationFrame(() => { raf = 0; drift.style.transform = `translate3d(0, ${(-scrollY * .05).toFixed(1)}px, 0)`; }); };
  if (mode === "backdrop") {
    size(); addEventListener("scroll", onScroll, { passive: true }); onScroll();
    let t; addEventListener("resize", () => { clearTimeout(t); t = setTimeout(size, 150); });
  }

  function set(name, info) {
    if (read) read.innerHTML = info || "";
    if (name === cur) return; cur = name;
    svg.querySelectorAll(".pm-dot").forEach((d) => d.classList.toggle("on", d.dataset.p === name));
    const p = pts.find((q) => q.name === name);
    if (!p) { live.setAttribute("opacity", 0); cross.setAttribute("opacity", 0); return; }
    curP = p;
    const [x, y] = xy(p);
    live.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    const lab = live.querySelector(".pm-label"); lab.textContent = p.name;
    cross.querySelector(".pm-h").setAttribute("y1", y); cross.querySelector(".pm-h").setAttribute("y2", y);
    cross.querySelector(".pm-v").setAttribute("x1", x); cross.querySelector(".pm-v").setAttribute("x2", x);
    cross.setAttribute("opacity", 1); live.setAttribute("opacity", 1);
    live.classList.remove("pop"); void live.getBoundingClientRect(); live.classList.add("pop");   // the point pops in
    aim(false);
  }
  return { set, has: (n) => pts.some((p) => p.name === n) };
};
