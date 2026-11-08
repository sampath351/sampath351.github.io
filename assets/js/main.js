/* Home page: renders content/site.json, draws the contour hero, runs the HUD. */
(async function () {
  const { esc, md, mdInline, fill, reveal } = window.C;
  const $ = (s, el = document) => el.querySelector(s);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let S;
  try { S = await C.load("content/site.json"); }
  catch (e) { document.body.insertAdjacentHTML("afterbegin", `<p style="padding:60px 20px;color:#ff8a3d;font-family:monospace">Content failed to load. If you opened this file directly, run a local server (see README).</p>`); return; }

  /* ---------------- render ---------------- */
  fill(S);
  const p = S.person;

  $("#glance").innerHTML = S.hero.glance.map((g) => `
    <a class="gl rv" href="${esc(g.link || "#")}">
      <span class="v">${esc(g.value)}</span>
      <span class="l">${esc(g.label)}</span>
      <span class="d">${esc(g.detail)}</span>
      <span class="ev">evidence →</span>
    </a>`).join("");

  const A = S.experience.anchor;
  $("#anchor").innerHTML = `
    <header class="a-head">
      <div><h3>${esc(A.org)}</h3><div class="a-org">${esc(A.orgNote)} · ${esc(A.place)}</div></div>
      <div class="a-period mono">${esc(A.period)}</div>
    </header>
    <ol class="ladder">${A.roles.map((r, i) => `<li><span class="step">${String(i + 1).padStart(2, "0")}</span><b>${esc(r.title)}</b><span class="mono">${esc(r.period)}</span></li>`).join("")}</ol>
    <p class="a-sum">${mdInline(A.summary)}</p>
    <div class="pillars">${A.pillars.map((pl) => `<div class="pillar"><h4>${esc(pl.title)}</h4><ul>${pl.points.map((x) => `<li>${mdInline(x)}</li>`).join("")}</ul></div>`).join("")}</div>
    ${A.link ? `<a class="a-link" href="${esc(A.link)}">${esc(A.linkLabel || "Read more")} →</a>` : ""}`;

  $("#roles").innerHTML = S.experience.others.filter((o) => !o.hidden).map((o) => `
    <div class="role-row rv">
      <span class="mono">${esc(o.period)}</span>
      <div><h4>${esc(o.role)}</h4><div class="r-org">${esc(o.org)} · ${esc(o.place)}</div></div>
      <div class="r-pts">${o.points.map((x) => `<p>${mdInline(x)}</p>`).join("")}${o.link ? `<a href="${esc(o.link)}" class="r-link">Case study →</a>` : ""}</div>
    </div>`).join("");
  const E = S.experience.education;
  $("#edu").innerHTML = `<span class="mono">EDUCATION · ${esc(E.period)}</span><h4>${esc(E.degree)}, ${esc(E.school)}</h4><p>${mdInline(E.note)}</p>${E.languages ? `<p class="langs"><span class="mono">LANGUAGES</span> ${esc(E.languages)}</p>` : ""}`;

  $("#work-list").innerHTML = S.work.items.map((w) => {
    const tag = w.status === "live" ? "a" : "div";
    return `<${tag} class="card rv ${w.status}" ${w.href && w.status === "live" ? `href="${esc(w.href)}"` : ""} data-id="${esc(w.id)}">
      <div class="ix">${esc(w.index)}</div>
      <div>
        <h3>${esc(w.title)}</h3>
        <div class="org">${esc(w.org)}</div>
        <p>${mdInline(w.summary)}</p>
        <div class="tags">${(w.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
        <span class="go">${w.status === "live" ? "Open case study" : "Case study in preparation"}</span>
      </div>
      <div class="thumb"><canvas></canvas><span class="badge ${w.status}">${w.status === "live" ? "interactive" : "in prep"}</span><span class="cap">${esc(w.coords)}</span></div>
    </${tag}>`;
  }).join("");

  const AP = S.approach;
  $("#approach-list").innerHTML = AP.items.map((a, i) => `
    <div class="ap rv"><span class="ap-n mono">${String(i + 1).padStart(2, "0")} · ${esc(a.tag)}</span><h4>${esc(a.title)}</h4><p>${mdInline(a.body)}</p></div>`).join("");
  $("#principle").innerHTML = `<span class="mono">${esc(AP.principleTitle)}</span><p class="pr">${mdInline(AP.principle)}</p><p class="pr-ex">${mdInline(AP.principleExample)} ${AP.principleLink ? `<a href="${esc(AP.principleLink)}">See it →</a>` : ""}</p>${AP.note ? `<p class="pr-note">${mdInline(AP.note)}</p>` : ""}`;

  const EV = S.evidence; let lastG = "";
  $("#matrix").innerHTML = `<thead><tr><th></th><th style="text-align:left">Skill</th>${EV.cols.map((c) => `<th>${esc(c.label)}</th>`).join("")}</tr></thead><tbody>${
    EV.rows.map((r) => { const g = r.group !== lastG ? r.group : ""; lastG = r.group;
      return `<tr><td class="g">${esc(g)}</td><th scope="row">${esc(r.skill)}</th>${EV.cols.map((c) => { const v = +r[c.key] || 0; return `<td>${v ? `<span class="m m${v}" title="${v === 2 ? "Core" : "Used"}"></span>` : ""}</td>`; }).join("")}</tr>`; }).join("")}</tbody>`;

  $("#lab-list").innerHTML = S.lab.items.map((l) => l.href
    ? `<a class="slot filled rv" href="${esc(l.href)}">${l.image ? `<img src="${esc(l.image)}" alt="">` : ""}<span class="t">${esc(l.title)}</span><span class="n">${esc(l.note)}</span></a>`
    : `<div class="slot rv"><span class="t">${esc(l.title)}</span><span class="n">${esc(l.note)}</span></div>`).join("");

  $("#ledger").innerHTML = S.academic.items.map((a) => `
    <div class="row rv"><span class="y">${esc(a.year)}</span><h4>${esc(a.title)}</h4><span class="tg ${/place/i.test(a.tag) ? "win" : ""}">${esc(a.tag)}</span><p>${mdInline(a.note)}</p></div>`).join("");

  $("#writing-list").innerHTML = S.writing.items.length
    ? `<div class="ledger">${S.writing.items.map((w) => `<a class="row" href="${esc(w.href)}"><span class="y">${esc(w.date)}</span><h4>${esc(w.title)}</h4><span class="tg"></span><p>${esc(w.note)}</p></a>`).join("")}</div>`
    : `<div class="empty">// first notes coming soon</div>`;

  const ph = S.personal.photos || [];
  $("#photos").innerHTML = (ph.length ? ph : Array(6).fill(null)).map((x, i) => x
    ? `<figure class="photo rv"><img loading="lazy" src="${esc(x.src)}" alt="${esc(x.caption)}"><span class="c">${esc(x.caption)}</span></figure>`
    : `<div class="photo ph rv">FRAME ${String(i + 1).padStart(2, "0")}</div>`).join("");

  const t = S.contact.title.split(" ");
  $("#contact-title").innerHTML = `${esc(t.slice(0, -1).join(" "))}<br><span>${esc(t.slice(-1)[0])}</span>`;
  const L = [
    ["Email", p.email, p.email ? "mailto:" + p.email : ""],
    ["LinkedIn", p.linkedin ? p.linkedin.replace(/https?:\/\/(www\.)?linkedin\.com\//, "") : "", p.linkedin],
    ["GitHub", p.github ? p.github.replace("https://", "") : "coming soon", p.github],
    ["CV", "Download PDF", p.cv],
    ["Portfolio", p.portfolioPdf ? "Download PDF" : "PDF in preparation", p.portfolioPdf]
  ];
  $("#links").innerHTML = L.map(([k, v, href]) => href
    ? `<a href="${esc(href)}" ${/^http/.test(href) ? 'target="_blank" rel="noopener"' : ""}><span>${esc(v)}</span><span class="k">${k} ↗</span></a>`
    : `<div class="na"><span>${esc(v)}</span><span class="k">${k}</span></div>`).join("");
  $("#year").textContent = new Date().getFullYear();

  /* ---------------- noise ---------------- */
  const perm = new Uint8Array(512);
  (function () { let s = 1337; const q = [...Array(256).keys()];
    for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [q[i], q[j]] = [q[j], q[i]]; }
    for (let i = 0; i < 512; i++) perm[i] = q[i & 255]; })();
  const fade = (x) => x * x * x * (x * (x * 6 - 15) + 10);
  const lerp = (a, b, x) => a + (b - a) * x;
  const hsh = (x, y, z) => perm[(perm[(perm[x & 255] + y) & 255] + z) & 255] / 255;
  function noise3(x, y, z) {
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
    const u = fade(x - X), v = fade(y - Y), w = fade(z - Z);
    return lerp(
      lerp(lerp(hsh(X, Y, Z), hsh(X + 1, Y, Z), u), lerp(hsh(X, Y + 1, Z), hsh(X + 1, Y + 1, Z), u), v),
      lerp(lerp(hsh(X, Y, Z + 1), hsh(X + 1, Y, Z + 1), u), lerp(hsh(X, Y + 1, Z + 1), hsh(X + 1, Y + 1, Z + 1), u), v), w);
  }
  const fbm = (x, y, z) => noise3(x, y, z) * .55 + noise3(x * 2.1, y * 2.1, z) * .3 + noise3(x * 4.3, y * 4.3, z) * .15;

  /* ---------------- contour hero (marching squares over fBm terrain) ---------------- */
  (function terrain() {
    const cv = $("#terrain"); if (!cv) return;
    const ctx = cv.getContext("2d");
    const CELL = 9, LEVELS = 22;
    let W, H, cols, rows, field, tt = 0, mouse = null, raf;
    function size() {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      W = cv.clientWidth; H = cv.clientHeight;
      cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(W / CELL) + 1; rows = Math.ceil(H / CELL) + 1;
      field = new Float32Array(cols * rows);
    }
    function sample(z) {
      const sc = 1 / 260;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        let v = fbm(i * CELL * sc, j * CELL * sc, z);
        if (mouse) { const dx = i * CELL - mouse.x, dy = j * CELL - mouse.y; v += .12 * Math.exp(-(dx * dx + dy * dy) / 14000); }
        field[j * cols + i] = v;
      }
    }
    function draw() {
      ctx.clearRect(0, 0, W, H);
      for (let L = 1; L < LEVELS; L++) {
        const iso = .18 + L * (.66 / LEVELS), major = L % 5 === 0;
        ctx.beginPath();
        for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
          const a = field[j * cols + i], b = field[j * cols + i + 1], c = field[(j + 1) * cols + i + 1], d = field[(j + 1) * cols + i];
          const k = (a > iso) * 8 + (b > iso) * 4 + (c > iso) * 2 + (d > iso);
          if (k === 0 || k === 15) continue;
          const x = i * CELL, y = j * CELL;
          const top = [x + CELL * (iso - a) / (b - a), y], right = [x + CELL, y + CELL * (iso - b) / (c - b)];
          const bot = [x + CELL * (iso - d) / (c - d), y + CELL], left = [x, y + CELL * (iso - a) / (d - a)];
          const seg = (P, Q) => { ctx.moveTo(P[0], P[1]); ctx.lineTo(Q[0], Q[1]); };
          switch (k) {
            case 1: case 14: seg(left, bot); break; case 2: case 13: seg(bot, right); break;
            case 3: case 12: seg(left, right); break; case 4: case 11: seg(top, right); break;
            case 5: seg(left, top); seg(bot, right); break; case 6: case 9: seg(top, bot); break;
            case 7: case 8: seg(left, top); break; case 10: seg(top, right); seg(left, bot); break;
          }
        }
        const hi = L / LEVELS;
        ctx.strokeStyle = major ? `rgba(255,138,61,${.38 + hi * .4})` : `rgba(94,200,216,${.10 + hi * .22})`;
        ctx.lineWidth = major ? 1.1 : .7; ctx.stroke();
      }
      ctx.fillStyle = "rgba(230,236,239,.45)";
      for (let j = 3; j < rows; j += 9) for (let i = 3 + (j % 2) * 4; i < cols; i += 9) { if (field[j * cols + i] > .6) ctx.fillRect(i * CELL - 1, j * CELL - 1, 2, 2); }
    }
    function frame() { tt += .0016; sample(tt); draw(); if (!reduce) raf = requestAnimationFrame(frame); }
    size(); frame();
    addEventListener("resize", () => { size(); if (reduce) frame(); });
    cv.parentElement.addEventListener("pointermove", (e) => { const r = cv.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top }; });
    cv.parentElement.addEventListener("pointerleave", () => { mouse = null; });
    new IntersectionObserver(([en]) => { if (reduce) return; cancelAnimationFrame(raf); if (en.isIntersecting) raf = requestAnimationFrame(frame); }).observe(cv);
    window.__terrainField = () => ({ field, cols, CELL });
  })();

  /* ---------------- HUD: cursor → lat/long ---------------- */
  (function hud() {
    const out = $("#hud-coord"); if (!out) return;
    const [lat0, lon0] = p.coords;
    const fmt = (v, P, N) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? P : N}`;
    const set = (lat, lon, el) => out.textContent = `${fmt(lat, "N", "S")}  ${fmt(lon, "E", "W")}${el != null ? `  ·  ${el} m` : ""}`;
    set(lat0, lon0);
    addEventListener("pointermove", (e) => {
      const lat = lat0 + (innerHeight / 2 - e.clientY) * 0.00018, lon = lon0 + (e.clientX - innerWidth / 2) * 0.00018;
      let el = null; const tf = window.__terrainField && window.__terrainField();
      if (tf && scrollY < innerHeight) { const v = tf.field[Math.round((e.clientY + scrollY) / tf.CELL) * tf.cols + Math.round(e.clientX / tf.CELL)]; if (v) el = Math.round(12 + v * 180); }
      set(lat, lon, el);
    }, { passive: true });
    const links = [...document.querySelectorAll(".hud nav a[href^='#']")];
    const io = new IntersectionObserver((ens) => ens.forEach((en) => { if (en.isIntersecting) links.forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#" + en.target.id)); }), { rootMargin: "-45% 0px -50% 0px" });
    links.forEach((a) => { const s = document.getElementById(a.getAttribute("href").slice(1)); if (s) io.observe(s); });
  })();

  /* ---------------- card thumbnails (procedural, no real data) ---------------- */
  document.querySelectorAll(".card").forEach((card) => {
    const cv = card.querySelector("canvas"), r = cv.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2); cv.width = r.width * dpr; cv.height = r.height * dpr;
    const c = cv.getContext("2d"); c.scale(dpr, dpr);
    const id = card.dataset.id;
    if (id === "wri") wriThumb(c, r.width, r.height); else if (id === "thesis") hazardThumb(c, r.width, r.height); else parcelThumb(c, r.width, r.height);
  });
  function wriThumb(c, W, H) {
    // drawn from the public, aggregated density layer — no point data
    const img = new Image(); img.src = "data/wri/layers/2018_0.png";
    img.onload = () => {
      const t = document.createElement("canvas"); t.width = img.width; t.height = img.height;
      const tc = t.getContext("2d"); tc.drawImage(img, 0, 0); const px = tc.getImageData(0, 0, t.width, t.height).data;
      const out = tc.createImageData(t.width, t.height); let mx = 0;
      for (let i = 0; i < px.length; i += 4) mx = Math.max(mx, px[i] * 256 + px[i + 1]);
      for (let i = 0; i < px.length; i += 4) { const v = Math.pow((px[i] * 256 + px[i + 1]) / mx, .55); out.data[i] = 255; out.data[i + 1] = 90 + 120 * v; out.data[i + 2] = 61 * v; out.data[i + 3] = 255 * Math.min(1, v * 1.4); }
      tc.putImageData(out, 0, 0);
      const s = Math.min(W / t.width, H / t.height) * .96; c.drawImage(t, (W - t.width * s) / 2, (H - t.height * s) / 2, t.width * s, t.height * s);
    };
  }
  function hazardThumb(c, W, H) {
    const img = c.createImageData(Math.ceil(W), Math.ceil(H)); const ramp = [[26, 152, 80], [166, 217, 106], [255, 209, 102], [255, 138, 61], [239, 71, 111]];
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
      const v = Math.min(.999, Math.max(0, fbm(x / 70, y / 70, 3.3) * 1.5 - .25)), k = v * 4, i = Math.floor(k), f = k - i;
      const a = ramp[i], b = ramp[Math.min(4, i + 1)], o = (y * img.width + x) * 4;
      img.data[o] = (a[0] + (b[0] - a[0]) * f) * .55; img.data[o + 1] = (a[1] + (b[1] - a[1]) * f) * .55; img.data[o + 2] = (a[2] + (b[2] - a[2]) * f) * .55; img.data[o + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  }
  function parcelThumb(c, W, H) {
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; const out = [];
    (function split(x, y, w, h, d) {
      if (d > 6 || (w * h < 900 && rnd() > .3)) { out.push([x, y, w, h]); return; }
      if (w > h) { const k = w * (.3 + rnd() * .4); split(x, y, k, h, d + 1); split(x + k, y, w - k, h, d + 1); }
      else { const k = h * (.3 + rnd() * .4); split(x, y, w, k, d + 1); split(x, y + k, w, h - k, d + 1); }
    })(6, 6, W - 12, H - 12, 0);
    out.forEach(([x, y, w, h]) => {
      const flag = rnd() < .06, done = rnd() < .55;
      c.fillStyle = flag ? "rgba(239,71,111,.55)" : done ? "rgba(94,200,216,.16)" : "rgba(255,255,255,.03)"; c.fillRect(x + 1.5, y + 1.5, w - 3, h - 3);
      c.strokeStyle = flag ? "#ef476f" : "rgba(94,200,216,.45)"; c.lineWidth = .8; c.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    });
  }

  reveal();
})();
