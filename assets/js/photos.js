/* Photographs: shared by the home page (a few picked photos) and photography.html (all of them).
   Content: content/site.json → personal.photos, edited in the admin (Home page → Personal).
     per photo: show (Photography page), home (home page), caption, place (also the filter chips), year, feature
   Rows arrange themselves: for the photos that are on, the row breaks are chosen so every row comes out as close
   as possible to a target height (a small dynamic-programming search, recomputed on resize). Every photo keeps
   its own aspect ratio; nothing is cropped. A featured photo gets a row of its own, capped at screen height.
   Click a photo for a full-screen view with caption and arrows (keyboard ← → Esc, swipe on phones). */
window.Photos = (function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const sub = (x) => [x.place, x.year].filter(Boolean).join(" · ");
  const GAP = 8;

  // aspect ratios: from width/height if given, otherwise read from the image
  const sizeOf = (x) => x.w && x.h ? Promise.resolve(x.w / x.h) : new Promise((res) => {
    const im = new Image(); im.onload = () => res(im.naturalWidth / im.naturalHeight || 1.5); im.onerror = () => res(1.5); im.src = x.src;
  });
  async function prepare(list) { const ars = await Promise.all(list.map(sizeOf)); return list.map((x, i) => ({ ...x, ar: ars[i] })); }

  // best row breaks for one run of photos (no featured ones inside)
  function partition(items, W, T) {
    const n = items.length, best = new Array(n + 1).fill(Infinity), from = new Array(n + 1).fill(0); best[0] = 0;
    for (let j = 1; j <= n; j++) {
      let sum = 0;
      for (let i = j - 1; i >= 0 && j - i <= 6; i--) {
        sum += items[i].ar;
        const h = (W - GAP * (j - i - 1)) / sum;
        // the last row may stay shorter than the target (it is not stretched), other rows aim at T
        const cost = j === n && h > T ? 0 : Math.pow(h - T, 2) + (j - i === 1 ? T * T * .15 : 0);
        if (best[i] + cost < best[j]) { best[j] = best[i] + cost; from[j] = i; }
      }
    }
    const rows = []; for (let j = n; j > 0; j = from[j]) rows.unshift(items.slice(from[j], j));
    return rows;
  }

  function frame(x, i) {
    return `<figure class="photo rv" style="--ar:${x.ar.toFixed(4)}" data-i="${i}" tabindex="0" role="button" aria-label="${esc(x.caption || "Open photograph")}">` +
      `<img loading="lazy" decoding="async" src="${esc(x.src)}" alt="${esc(x.caption || "Photograph by Sampath Kakarla")}"${x.w ? ` width="${x.w}" height="${x.h}"` : ""}>` +
      (x.caption || sub(x) ? `<figcaption class="c">${x.caption ? `<span>${esc(x.caption)}</span>` : ""}${sub(x) ? `<small>${esc(sub(x))}</small>` : ""}</figcaption>` : "") + `</figure>`;
  }

  // render into box; opts: layout "rows" | "mosaic" | "strip", size "s" | "m" | "l"
  function render(box, items, opts = {}) {
    const layout = opts.layout || "rows";
    box.className = "photos lay-" + layout;
    const draw = () => {
      if (layout !== "rows") { box.innerHTML = items.map(frame).join(""); return; }
      const W = box.clientWidth || 1000, phone = innerWidth <= 620;
      const div = { s: 5, m: 4, l: 3 }[opts.size || "m"] || 4;
      const T = Math.max(phone ? 140 : 200, Math.min(phone ? 230 : 420, W / (phone ? 2.4 : div)));
      const rows = []; let run = [];
      items.forEach((x, i) => {
        x._i = i;
        if (x.feature) { if (run.length) rows.push(...partition(run, W, T)); run = []; rows.push([x]); }
        else run.push(x);
      });
      if (run.length) rows.push(...partition(run, W, T));
      box.innerHTML = rows.map((r) => {
        const sum = r.reduce((t, x) => t + x.ar, 0), h = (W - GAP * (r.length - 1)) / sum;
        const solo = r.length === 1 && r[0].feature, short = !solo && h > T * 1.15;   // an underfilled last row keeps the target height
        return `<div class="ph-row${solo ? " solo" : ""}${short ? " short" : ""}" style="--h:${Math.round(T)}px">${r.map((x) => frame(x, x._i)).join("")}</div>`;
      }).join("");
    };
    draw();
    let last = box.clientWidth, t;
    if (!box._ro) {
      box._ro = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(() => { if (Math.abs(box.clientWidth - last) > 8) { last = box.clientWidth; box._draw(); box.querySelectorAll(".rv").forEach((e) => e.classList.add("in")); } }, 120); });
      box._ro.observe(box);
      box.addEventListener("click", (e) => { const f = e.target.closest(".photo[data-i]"); if (f) open(box._items, +f.dataset.i); });
      box.addEventListener("keydown", (e) => { const f = e.target.closest(".photo[data-i]"); if (f && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(box._items, +f.dataset.i); } });
    }
    box._draw = draw; box._items = items;
  }

  /* ---------- full-screen viewer ---------- */
  let lb, cur = 0, list = [];
  function build() {
    lb = document.createElement("div"); lb.className = "pv"; lb.setAttribute("role", "dialog"); lb.setAttribute("aria-modal", "true"); lb.setAttribute("aria-label", "Photograph");
    lb.innerHTML = `<button class="pv-x" type="button" aria-label="Close">×</button><button class="pv-p" type="button" aria-label="Previous">‹</button>
      <figure><img alt=""><figcaption><span class="pv-c"></span><small class="pv-s"></small><em class="pv-n"></em></figcaption></figure><button class="pv-n2" type="button" aria-label="Next">›</button>`;
    document.body.appendChild(lb);
    lb.querySelector(".pv-x").onclick = close; lb.querySelector(".pv-p").onclick = () => step(-1); lb.querySelector(".pv-n2").onclick = () => step(1);
    lb.addEventListener("click", (e) => { if (e.target === lb) close(); });
    addEventListener("keydown", (e) => { if (!lb.classList.contains("on")) return; if (e.key === "Escape") close(); if (e.key === "ArrowLeft") step(-1); if (e.key === "ArrowRight") step(1); });
    let x0 = null; lb.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener("touchend", (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1); x0 = null; });
  }
  function show() {
    const x = list[cur]; const img = lb.querySelector("img");
    img.src = x.src; img.alt = x.caption || "Photograph by Sampath Kakarla";
    lb.querySelector(".pv-c").textContent = x.caption || ""; lb.querySelector(".pv-s").textContent = sub(x);
    lb.querySelector(".pv-n").textContent = `${cur + 1} / ${list.length}`;
    [list[cur + 1], list[cur - 1]].forEach((y) => { if (y) { const p = new Image(); p.src = y.src; } });
  }
  function open(items, i) { if (!lb) build(); list = items; cur = i; show(); lb.classList.add("on"); document.documentElement.style.overflow = "hidden"; lb.querySelector(".pv-x").focus(); }
  function close() { lb.classList.remove("on"); document.documentElement.style.overflow = ""; }
  function step(d) { cur = (cur + d + list.length) % list.length; show(); }

  return { prepare, render, sub };
})();
