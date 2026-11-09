/* Home page: renders content/site.json. Hero contours: terrain.js. Section rail: rail.js. */
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
    <div class="row rv"><span class="y">${esc(a.year)}</span><h4>${esc(a.title)}</h4><span class="tg ${/place|winner|award/i.test(a.tag) ? "win" : ""}">${esc(a.tag)}</span><p>${mdInline(a.note)}</p></div>`).join("");

  // Field notes only appear once there is at least one note
  const notes = (S.writing.items || []).filter((w) => w.title);
  $("#writing").hidden = !notes.length;
  $("#writing-list").innerHTML = notes.length ? `<div class="ledger">${notes.map((w) => `<a class="row" href="${esc(w.href)}"><span class="y">${esc(w.date)}</span><h4>${esc(w.title)}</h4><span class="tg"></span><p>${esc(w.note)}</p></a>`).join("")}</div>` : "";

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
  if (p.cv && $("#hud-cv")) $("#hud-cv").href = p.cv;
  document.dispatchEvent(new Event("content:ready"));

  /* hero contours: assets/js/terrain.js (real terrain of Vijayawada) */

  /* ---------------- card thumbnails ---------------- */
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
    // drawn from the public class layer of the thesis page: the 2022 combined hazard map of Aizawl district
    const img = new Image(); img.src = "data/aizawl/grid2.png";
    img.onload = () => {
      const t = document.createElement("canvas"); t.width = img.width; t.height = img.height;
      const tc = t.getContext("2d"); tc.drawImage(img, 0, 0); const px = tc.getImageData(0, 0, t.width, t.height).data;
      const out = tc.createImageData(t.width, t.height), pal = [[42, 85, 96], [63, 154, 140], [216, 197, 106], [255, 138, 61], [255, 61, 110]];
      for (let i = 0; i < px.length; i += 4) { const k = px[i] & 15; if (!k) continue; const col = pal[k - 1]; out.data[i] = col[0]; out.data[i + 1] = col[1]; out.data[i + 2] = col[2]; out.data[i + 3] = k >= 4 ? 255 : 150; }
      tc.putImageData(out, 0, 0);
      const s = Math.min(W / t.width, H / t.height) * .96; c.imageSmoothingEnabled = true; c.drawImage(t, (W - t.width * s) / 2, (H - t.height * s) / 2, t.width * s, t.height * s);
    };
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
