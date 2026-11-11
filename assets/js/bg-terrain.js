/* Home page backdrop: real contours of the Eastern Ghats (Kondapalli hills) north-west of Vijayawada.
   - The contours are drawn ONCE into a tall canvas layer inside a fixed frame (#bg-terrain), with the fade
     towards the middle baked into the pixels, so scrolling never repaints or re-masks anything.
   - Parallax without repainting: the layer is only moved with a GPU transform. Where the browser supports
     scroll-driven animations (CSS animation-timeline), the move runs on the compositor in lockstep with the
     page scroll; elsewhere a light rAF loop sets the same sub-pixel transform. Its south end (Vijayawada)
     arrives as the page reaches Contact.
   - Pointer response (as in the first version of the site): the ground swells gently under the cursor.
     Only a small disc of the layer is redrawn, in the layer's own coordinates, so it moves with the terrain.
   Heightmap: assets/terrain/eastern-ghats.png, 16-bit in R,G (metadata in terrain.json). */
(function () {
  const frame = document.getElementById("bg-terrain"); if (!frame) return;
  const root = frame.dataset.root || "assets/", name = frame.dataset.terrain || "eastern-ghats";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cssTimeline = window.CSS && CSS.supports && CSS.supports("animation-timeline: scroll()");
  const veil = document.createElement("div"); veil.className = "bg-veil"; frame.appendChild(veil);   // dims past the overview table
  const layer = document.createElement("canvas"); veil.appendChild(layer);
  const ctx = layer.getContext("2d");
  const base = document.createElement("canvas"), bctx = base.getContext("2d");   // pristine copy of the contours
  let M, G, s = 1, ox = 0, travel = 0, W = 0, H = 0, full = 0, k = 1, levels = [];
  let ptr = null, cur = null, amp = 0, raf = 0, dirty = null;
  const AMP = 60, SIG = 65, R = Math.round(SIG * 2.6);   // gentle swell: bump height (m), spread (px), redraw radius (px)
  const FOLLOW = .14, EASE = .08;                                   // how softly the swell trails the cursor and fades in/out

  function load() {
    return fetch(root + "terrain/terrain.json").then((r) => r.json()).then((meta) => {
      M = meta[name];
      return new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
          const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0);
          const d = x.getImageData(0, 0, img.width, img.height).data, z = new Float32Array(img.width * img.height);
          for (let i = 0; i < z.length; i++) {
            const q = M.enc === "rg16" ? (d[i * 4] * 256 + d[i * 4 + 1]) / 65535 : d[i * 4] / 255;
            z[i] = M.min + q * (M.max - M.min);
          }
          G = { w: img.width, h: img.height, z }; res();
        };
        img.onerror = rej; img.src = root + "terrain/" + name + ".png";
      });
    });
  }

  // marching squares over grid cells [i0,i1)×[j0,j1), in layer coordinates (CSS px)
  function contours(c, height, i0, i1, j0, j1) {
    levels.forEach((iso, n) => {
      const major = (iso - M.base) % M.major === 0, hi = n / Math.max(1, levels.length - 1);
      c.beginPath();
      for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
        const a = height(i, j), b = height(i + 1, j), cc = height(i + 1, j + 1), d = height(i, j + 1);
        const q = (a > iso) * 8 + (b > iso) * 4 + (cc > iso) * 2 + (d > iso);
        if (q === 0 || q === 15) continue;
        const x = ox + i * s, y = j * s;
        const top = [x + s * (iso - a) / (b - a), y], right = [x + s, y + s * (iso - b) / (cc - b)];
        const bot = [x + s * (iso - d) / (cc - d), y + s], left = [x, y + s * (iso - a) / (d - a)];
        const seg = (P, Q) => { c.moveTo(P[0], P[1]); c.lineTo(Q[0], Q[1]); };
        switch (q) {
          case 1: case 14: seg(left, bot); break; case 2: case 13: seg(bot, right); break;
          case 3: case 12: seg(left, right); break; case 4: case 11: seg(top, right); break;
          case 5: seg(left, top); seg(bot, right); break; case 6: case 9: seg(top, bot); break;
          case 7: case 8: seg(left, top); break; case 10: seg(top, right); seg(left, bot); break;
        }
      }
      c.strokeStyle = major ? `rgba(255,138,61,${.38 + hi * .5})` : `rgba(94,200,216,${.2 + hi * .34})`;
      c.lineWidth = major ? 1.05 : .65; c.lineJoin = "round"; c.stroke();
    });
  }
  const at = (i, j) => G.z[Math.min(G.h - 1, j) * G.w + Math.min(G.w - 1, i)];
  // fade towards the middle of the screen, baked into the pixels (it depends on x only, and the layer only moves in y)
  function fade(c, x, y, w, h) {
    const g = c.createLinearGradient(0, 0, W, 0);
    const stops = innerWidth <= 700 ? [[0, 0], [.1, 0], [.55, .5], [.9, 1], [1, 1]] : [[0, 0], [.32, 0], [.5, .35], [.66, .8], [.8, 1], [1, 1]];
    stops.forEach(([o, a]) => g.addColorStop(o, `rgba(0,0,0,${a})`));
    c.save(); c.globalCompositeOperation = "destination-in"; c.fillStyle = g; c.fillRect(x, y, w, h); c.restore();
  }

  function layout() {
    if (!innerWidth || !innerHeight) return false;
    W = innerWidth; H = innerHeight;
    // cover the right ~78% of the screen, and be tall enough to drift through the whole page
    s = Math.max((W * .78) / G.w, (H * 1.25) / G.h);
    ox = W - G.w * s; full = G.h * s; travel = Math.max(0, full - H);
    levels = []; for (let L = M.base; L < M.max; L += M.step) levels.push(L);
    k = Math.min(devicePixelRatio || 1, 2, Math.sqrt(8e6 / (W * full)));   // cap the layer at ~8 MP
    for (const c of [layer, base]) { c.width = Math.ceil(W * k); c.height = Math.ceil(full * k); }
    layer.style.width = W + "px"; layer.style.height = full + "px";
    bctx.setTransform(k, 0, 0, k, 0, 0); bctx.clearRect(0, 0, W, full);
    contours(bctx, at, Math.max(0, Math.floor(-ox / s)), G.w - 1, 0, G.h - 1);
    fade(bctx, 0, 0, W, full);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(base, 0, 0); dirty = null;
    frame.style.setProperty("--bg-travel", travel + "px");
    const cap = document.querySelector(".hero .terrain-cap");
    if (cap) cap.textContent = `Contours: ${M.label} · ${M.step} m interval · ${M.src}`;
    return true;
  }

  // current drift of the layer, same formula the CSS scroll timeline uses (linear in scroll progress)
  const offset = () => {
    if (reduce) return 0;
    const max = document.documentElement.scrollHeight - innerHeight;
    return max > 0 ? Math.min(1, Math.max(0, scrollY / max)) * travel : 0;
  };
  // fallback for browsers without scroll-driven animations: the same transform, and the same veil past the overview table
  const band = document.querySelector(".glance-band");
  function place() {
    if (cssTimeline) return;
    if (!reduce) layer.style.transform = `translate3d(0, ${-offset()}px, 0)`;
    if (band) { const r = band.getBoundingClientRect(); frame.style.setProperty("--veil", Math.min(1, Math.max(0, -r.top / (r.height * 2.6))).toFixed(3)); }
  }

  // pointer swell: restore the last disc from the pristine copy, then redraw a disc with the bump added
  function swell() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (dirty) { ctx.clearRect(dirty[0], dirty[1], dirty[2], dirty[3]); ctx.drawImage(base, dirty[0], dirty[1], dirty[2], dirty[3], dirty[0], dirty[1], dirty[2], dirty[3]); }
    dirty = null;
    if (!cur || amp < .5 || cur.x + R < W * (innerWidth <= 700 ? .1 : .32)) return;   // nothing visible on the faded side
    const px = cur.x, py = cur.y + offset();
    const i0 = Math.max(0, Math.floor((px - R - ox) / s)), i1 = Math.min(G.w - 1, Math.ceil((px + R - ox) / s));
    const j0 = Math.max(0, Math.floor((py - R) / s)), j1 = Math.min(G.h - 1, Math.ceil((py + R) / s));
    if (i1 <= i0 || j1 <= j0) return;
    const x0 = Math.max(0, Math.floor((px - R) * k) - 2), y0 = Math.max(0, Math.floor((py - R) * k) - 2);
    const x1 = Math.min(layer.width, Math.ceil((px + R) * k) + 2), y1 = Math.min(layer.height, Math.ceil((py + R) * k) + 2);
    dirty = [x0, y0, x1 - x0, y1 - y0];
    ctx.save(); ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.beginPath(); ctx.arc(px, py, R, 0, Math.PI * 2); ctx.clip();
    ctx.clearRect(px - R, py - R, R * 2, R * 2);
    // bumped heights for this disc, computed once per frame (not once per contour level)
    const g = 1 / (2 * SIG * SIG), nx = i1 - i0 + 1, hz = new Float32Array(nx * (j1 - j0 + 1));
    for (let j = j0; j <= j1; j++) { const dy = j * s - py; for (let i = i0; i <= i1; i++) { const dx = ox + i * s - px; hz[(j - j0) * nx + (i - i0)] = at(i, j) + amp * Math.exp(-(dx * dx + dy * dy) * g); } }
    contours(ctx, (i, j) => hz[(j - j0) * nx + (i - i0)], i0, i1, j0, j1);
    fade(ctx, px - R, py - R, R * 2, R * 2);
    ctx.restore();
  }

  const ask = () => { if (!raf) raf = requestAnimationFrame(tick); };
  function tick() {
    raf = 0;
    if (W !== innerWidth || H !== innerHeight) { if (!layout()) return; }
    place();
    const target = ptr ? AMP : 0;
    amp += (target - amp) * EASE;
    if (ptr) cur = cur ? { x: cur.x + (ptr.x - cur.x) * FOLLOW, y: cur.y + (ptr.y - cur.y) * FOLLOW } : { ...ptr };
    if (ptr || dirty) swell();
    const moving = ptr && cur && (Math.abs(ptr.x - cur.x) + Math.abs(ptr.y - cur.y) > .3);
    if (Math.abs(target - amp) > .3 || moving) ask();
  }

  load().then(() => {
    if (layout()) { place(); frame.classList.add("on"); }
    let t; addEventListener("resize", () => { clearTimeout(t); t = setTimeout(() => { if (layout()) { place(); ask(); } }, 150); });
    // the transform itself is CSS-driven where supported; JS only follows for the fallback and the swell
    addEventListener("scroll", () => { if (!cssTimeline || ptr) ask(); }, { passive: true });
    document.addEventListener("visibilitychange", () => { if (!document.hidden && W !== innerWidth) { if (layout()) place(); } });
    if (!reduce && matchMedia("(pointer: fine)").matches) {
      addEventListener("pointermove", (e) => { ptr = { x: e.clientX, y: e.clientY }; ask(); }, { passive: true });
      document.addEventListener("pointerleave", () => { ptr = null; ask(); });
    }
  }).catch(() => {});
})();
