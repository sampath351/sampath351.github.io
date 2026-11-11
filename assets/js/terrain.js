/* Real contour lines drawn from a small heightmap of the place a page is about.
   Heightmaps (assets/terrain/<name>.png, 192×108, 8-bit) + metadata in assets/terrain/terrain.json.
   Usage: <canvas data-terrain="vijayawada" data-root="assets/"></canvas> → Terrain.draw(canvas) */
window.Terrain = (function () {
  let metaP = null;
  const cache = {};
  function meta(root) { return metaP || (metaP = fetch(root + "terrain/terrain.json").then((r) => r.json())); }
  function heights(root, name, m) {
    if (cache[name]) return cache[name];
    return (cache[name] = new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
        const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, img.width, img.height).data, z = new Float32Array(img.width * img.height);
        for (let i = 0; i < z.length; i++) z[i] = m.min + (d[i * 4] / 255) * (m.max - m.min);
        res({ w: img.width, h: img.height, z });
      };
      img.onerror = rej; img.src = root + "terrain/" + name + ".png";
    }));
  }

  async function draw(cv, opts = {}) {
    const root = cv.dataset.root || "assets/", name = cv.dataset.terrain;
    const M = (await meta(root))[name]; if (!M) return;
    const G = await heights(root, name, M);
    const ctx = cv.getContext("2d"), dpr = Math.min(devicePixelRatio || 1, 2);
    const W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return;
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    // "cover" the canvas with the grid; the middle of the area sits right of centre, away from the text
    const s = Math.max(W / G.w, H / G.h), oy = (H - G.h * s) / 2;
    const ox = Math.min(0, Math.max(W - G.w * s, W * (opts.focus || .62) - G.w * s / 2));
    const at = (i, j) => G.z[j * G.w + i];
    const levels = []; for (let L = M.base; L < M.max; L += M.step) levels.push(L);
    const alpha = opts.alpha == null ? 1 : opts.alpha;
    levels.forEach((iso, n) => {
      const major = (iso - M.base) % M.major === 0, hi = n / Math.max(1, levels.length - 1);
      ctx.beginPath();
      for (let j = 0; j < G.h - 1; j++) for (let i = 0; i < G.w - 1; i++) {
        const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
        const k = (a > iso) * 8 + (b > iso) * 4 + (c > iso) * 2 + (d > iso);
        if (k === 0 || k === 15) continue;
        const x = ox + i * s, y = oy + j * s;
        const top = [x + s * (iso - a) / (b - a), y], right = [x + s, y + s * (iso - b) / (c - b)];
        const bot = [x + s * (iso - d) / (c - d), y + s], left = [x, y + s * (iso - a) / (d - a)];
        const seg = (P, Q) => { ctx.moveTo(P[0], P[1]); ctx.lineTo(Q[0], Q[1]); };
        switch (k) {
          case 1: case 14: seg(left, bot); break; case 2: case 13: seg(bot, right); break;
          case 3: case 12: seg(left, right); break; case 4: case 11: seg(top, right); break;
          case 5: seg(left, top); seg(bot, right); break; case 6: case 9: seg(top, bot); break;
          case 7: case 8: seg(left, top); break; case 10: seg(top, right); seg(left, bot); break;
        }
      }
      // same strength as the home-page backdrop, so the contours read clearly on the right of the hero
      ctx.strokeStyle = major ? `rgba(255,138,61,${(.42 + hi * .5) * alpha})` : `rgba(94,200,216,${(.24 + hi * .36) * alpha})`;
      ctx.lineWidth = major ? 1.15 : .75; ctx.lineJoin = "round"; ctx.stroke();
    });
    const cap = cv.parentElement.querySelector(".terrain-cap");
    if (cap && !cap.textContent) cap.textContent = `Contours: ${M.label} · ${M.step} m interval · ${M.src}`;
  }

  function auto() {
    document.querySelectorAll("canvas[data-terrain]").forEach((cv) => {
      const go = () => draw(cv).catch(() => {});
      go(); let t; addEventListener("resize", () => { clearTimeout(t); t = setTimeout(go, 150); });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", auto); else auto();
  return { draw };
})();
