/* Shared helpers: load JSON content, fill [data-c] text slots, render markdown, case-study pages. */
window.C = (function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const get = (obj, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
  const md = (s) => (window.marked ? window.marked.parse(String(s || ""), { gfm: true, breaks: false }) : esc(s));
  const mdInline = (s) => (window.marked ? window.marked.parseInline(String(s || "")) : esc(s));

  async function load(path) {
    const r = await fetch(path, { cache: "no-cache" });
    if (!r.ok) throw new Error("Could not load " + path);
    return r.json();
  }

  // <el data-c="hero.kicker"> gets the text of that field
  function fill(data, root = document) {
    root.querySelectorAll("[data-c]").forEach((el) => {
      const v = get(data, el.dataset.c);
      if (v == null || v === "") { el.hidden = true; return; }
      el.innerHTML = mdInline(v);
    });
  }

  function reveal() {
    const io = new IntersectionObserver((ens) => ens.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
    document.querySelectorAll(".rv:not(.in)").forEach((el) => io.observe(el));
  }


  /* ---------- visual blocks for project pages (all optional JSON fields) ---------- */
  // small explanatory diagrams for "lessons" cards (drawn, not maps)
  const DIAG = {
    gaps: () => { let r = ""; for (let y = 0; y < 6; y++) for (let x = 0; x < 12; x++) { const on = Math.abs(x - (y * 1.6 + 1)) < .9 || Math.abs(y - (5 - x * .45)) < .55; r += `<rect x="${6 + x * 17}" y="${6 + y * 13}" width="14" height="10" class="${on ? "d-on" : "d-off"}"/>`; } return r + `<text x="6" y="96" class="d-t">scored only along roads, streams, faults</text>`; },
    split: () => `<rect x="6" y="20" width="84" height="18" class="d-mix"/><text x="6" y="54" class="d-t">one index</text><text x="98" y="33" class="d-t d-a">→</text>
      <rect x="114" y="8" width="34" height="10" class="d-on"/><text x="154" y="17" class="d-t">hazard</text>
      <rect x="114" y="26" width="34" height="10" class="d-c"/><text x="154" y="35" class="d-t">exposure</text>
      <rect x="114" y="44" width="34" height="10" class="d-g"/><text x="154" y="53" class="d-t">vulnerability</text>`,
    triggers: () => `<rect x="6" y="18" width="200" height="18" class="d-off"/><rect x="6" y="18" width="${(200 * 325 / 402).toFixed(1)}" height="18" class="d-on"/>
      <text x="6" y="54" class="d-t">325 of 402 records: rainfall</text><text x="6" y="70" class="d-t d-a">0 list an earthquake</text>`,
    weights: () => [9, 8, 7, 6, 5, 4].map((w, i) => `<line x1="6" x2="150" y1="${10 + i * 13}" y2="${10 + i * 13}" class="d-ln"/><circle cx="${6 + w / 9 * 144}" cy="${10 + i * 13}" r="4" class="d-k"/>`).join("") + `<text x="160" y="44" class="d-t">expert-set</text><text x="160" y="58" class="d-t">weights</text>`
  };
  function visuals(c) {
    let h = "";
    if (c.stats && c.stats.length) h += `<div class="stats n${c.stats.length}">${c.stats.map((t) => `<div class="stt"><b>${esc(t.v)}</b><span>${mdInline(t.l)}</span>${t.s ? `<small>${mdInline(t.s)}</small>` : ""}</div>`).join("")}</div>`;
    if (c.bars && c.bars.items) {
      const mx = c.bars.max || Math.max(...c.bars.items.map((b) => b.value));
      h += `<figure class="bars">${c.bars.title ? `<figcaption>${mdInline(c.bars.title)}</figcaption>` : ""}${c.bars.items.map((b) => `<div class="bar ${b.hl ? "hl" : ""}"><span class="bl">${esc(b.label)}</span><span class="bt"><i style="width:${(b.value / mx * 100).toFixed(1)}%"></i></span><b>${esc(b.text || b.value)}</b></div>`).join("")}${c.bars.note ? `<p class="bnote">${mdInline(c.bars.note)}</p>` : ""}</figure>`;
    }
    if (c.cards && c.cards.length) h += `<div class="cards n${c.cards.length} ${esc(c.cardsStyle || "")}">${c.cards.map((k, i) => `<div class="fc">${k.big ? `<b class="big">${esc(k.big)}</b>` : `<span class="fcn">${String(i + 1).padStart(2, "0")}</span>`}<h5>${mdInline(k.title)}</h5>${k.text ? `<p>${mdInline(k.text)}</p>` : ""}</div>`).join("")}</div>`;
    if (c.lessons && c.lessons.length) h += `<div class="lessons">${c.lessons.map((l, i) => `<div class="ls"><svg viewBox="0 0 212 100" class="diag" aria-hidden="true">${DIAG[l.d] ? DIAG[l.d]() : ""}</svg><h5>${mdInline(l.title)}</h5><p>${mdInline(l.then)}</p><p class="now"><span>Now I'd</span>${mdInline(l.now)}</p></div>`).join("")}</div>`;
    return h;
  }
  function glance(d) {
    if (!d.glance || !d.glance.length) return "";
    return `<section class="cs-glance" aria-label="At a glance"><div class="wrap"><div class="gl-head"><span>At a glance</span><button type="button" class="chip" id="gl-play">▶ Play</button></div>
      <ol class="gl-steps">${d.glance.map((g, i) => `<li class="gls"><span class="gln">${String(i + 1).padStart(2, "0")} · ${esc(g.tag)}</span><b>${esc(g.big)}</b><p>${mdInline(g.text)}</p></li>`).join("")}</ol></div></section>`;
  }
  function glancePlay() {
    const btn = document.getElementById("gl-play"); if (!btn) return;
    const steps = [...document.querySelectorAll(".gls")]; let i = -1, t = null;
    const stop = () => { clearInterval(t); t = null; btn.textContent = "▶ Play"; steps.forEach((s) => s.classList.remove("cur")); };
    btn.addEventListener("click", () => {
      if (t) return stop();
      btn.textContent = "❚❚ Pause"; i = -1;
      const next = () => { i++; if (i >= steps.length) return stop(); steps.forEach((s, k) => s.classList.toggle("cur", k === i)); steps[i].scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" }); };
      next(); t = setInterval(next, 3200);
    });
  }

  /* ---------- case-study pages ---------- */
  // Renders content/work/<id>.json into #cs-hero and #chapters.
  // A chapter with "embed": "<element id>" moves that element (a map, demo…) into the chapter.
  async function caseStudy(path) {
    const d = await load(path);
    document.title = (d.title || "") + " — Sampath Kakarla";
    const hero = document.getElementById("cs-hero");
    const back = d.back && d.back.href ? d.back : { label: "Work", href: "../index.html#work" };   // Lab pages point back to the Lab
    hero.innerHTML = `<div class="crumb"><a href="${esc(back.href)}">← ${esc(back.label)}</a> / ${esc(d.crumb)}</div>
      <h1>${esc(d.title)}</h1><p class="sub">${mdInline(d.subtitle)}</p>
      <dl class="meta">${(d.meta || []).map((m) => `<div><dt>${esc(m.label)}</dt><dd>${mdInline(m.value)}</dd></div>`).join("")}</dl>`;
    const heroSec = hero.closest("section");
    if (heroSec && d.glance) { heroSec.insertAdjacentHTML("afterend", glance(d)); glancePlay(); }

    const ch = document.getElementById("chapters");
    (d.chapters || []).forEach((c, i) => {
      const art = document.createElement("article");
      art.className = "chapter"; if (c.id) art.id = c.id;
      art.innerHTML = `<div class="lbl"><b>${String(i + 1).padStart(2, "0")}</b>${esc(c.label)}</div>
        <div class="ch-body"><h3>${esc(c.heading)}</h3>${c.lead ? `<p class="lead">${mdInline(c.lead)}</p>` : ""}${md(c.body)}
        ${visuals(c)}
        ${c.embed ? `<div class="embed-slot"></div>` : ""}
        ${c.steps && c.steps.length ? `<div class="pipe">${c.steps.map((s) => `<div class="st ${s.highlight ? "new" : ""}"><h6>${esc(s.title)}</h6><p>${esc(s.text)}</p></div>`).join("")}</div>` : ""}
        ${c.compare && c.compare.length ? `<div class="cmp">${c.compare.map((r) => `<div class="cmp-row"><div class="cmp-h"><span class="mono">${esc(r.group)}</span><b>${esc(r.step)}</b></div><div class="cmp-b"><span class="mono">Before</span>${mdInline(r.before)}</div><i class="cmp-x" aria-hidden="true">→</i><div class="cmp-a"><span class="mono">After</span>${mdInline(r.after)}</div></div>`).join("")}</div>` : ""}
        ${c.code ? `<pre class="code"><span class="fn">${esc(c.codeLabel || "")}</span>${esc(c.code)}</pre>` : ""}
        ${c.bodyAfter ? md(c.bodyAfter) : ""}
        ${c.note && c.note.body ? `<div class="honest"><b>${esc(c.note.title)}</b>${mdInline(c.note.body)}</div>` : ""}
        ${c.figures && c.figures.length ? `<div class="figs ${esc(c.figLayout || "")}">${c.figures.map((f) => `<figure><img src="${esc(f.src)}" alt="${esc(f.alt || f.caption)}" loading="lazy"><figcaption>${esc(f.caption)}</figcaption></figure>`).join("")}</div>` : ""}
        ${c.more ? `<details class="more"><summary>More detail</summary><div class="more-b">${md(c.more)}</div></details>` : ""}
        </div>`;
      ch.appendChild(art);
      if (c.embed) {
        const el = document.getElementById(c.embed);
        if (el) { art.querySelector(".embed-slot").replaceWith(el); el.hidden = false; }
      }
    });
    if (d.next) document.getElementById("next").innerHTML = `<a href="${esc(back.href)}">← ${d.back ? esc(back.label) : "All work"}</a>${d.next.href ? `<a href="${esc(d.next.href)}">${esc(d.next.label)} →</a>` : `<span style="color:var(--t-3)">${esc(d.next.label)}</span>`}`;

    // lightbox for figures
    const lb = document.getElementById("lb");
    if (lb) {
      document.querySelectorAll(".figs img").forEach((im) => im.addEventListener("click", () => { lb.querySelector("img").src = im.src; lb.classList.add("on"); }));
      lb.addEventListener("click", () => lb.classList.remove("on"));
      addEventListener("keydown", (e) => { if (e.key === "Escape") lb.classList.remove("on"); });
    }
    const y = document.getElementById("year"); if (y) y.textContent = new Date().getFullYear();
    if (location.hash) { const t = document.querySelector(location.hash); if (t) setTimeout(() => t.scrollIntoView(), 50); }
    document.dispatchEvent(new Event("content:ready"));
    return d;
  }

  return { esc, get, md, mdInline, load, fill, reveal, caseStudy };
})();
