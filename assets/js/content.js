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

  /* ---------- case-study pages ---------- */
  // Renders content/work/<id>.json into #cs-hero and #chapters.
  // A chapter with "embed": "<element id>" moves that element (a map, demo…) into the chapter.
  async function caseStudy(path) {
    const d = await load(path);
    document.title = (d.title || "") + " — Sampath Kakarla";
    const hero = document.getElementById("cs-hero");
    hero.innerHTML = `<div class="crumb"><a href="../index.html#work">← Work</a> / ${esc(d.crumb)}</div>
      <h1>${esc(d.title)}</h1><p class="sub">${mdInline(d.subtitle)}</p>
      <dl class="meta">${(d.meta || []).map((m) => `<div><dt>${esc(m.label)}</dt><dd>${mdInline(m.value)}</dd></div>`).join("")}</dl>`;

    const ch = document.getElementById("chapters");
    (d.chapters || []).forEach((c, i) => {
      const art = document.createElement("article");
      art.className = "chapter"; if (c.id) art.id = c.id;
      art.innerHTML = `<div class="lbl"><b>${String(i + 1).padStart(2, "0")}</b>${esc(c.label)}</div>
        <div class="ch-body"><h3>${esc(c.heading)}</h3>${md(c.body)}
        ${c.embed ? `<div class="embed-slot"></div>` : ""}
        ${c.steps && c.steps.length ? `<div class="pipe">${c.steps.map((s) => `<div class="st ${s.highlight ? "new" : ""}"><h6>${esc(s.title)}</h6><p>${esc(s.text)}</p></div>`).join("")}</div>` : ""}
        ${c.code ? `<pre class="code"><span class="fn">${esc(c.codeLabel || "")}</span>${esc(c.code)}</pre>` : ""}
        ${c.bodyAfter ? md(c.bodyAfter) : ""}
        ${c.note && c.note.body ? `<div class="honest"><b>${esc(c.note.title)}</b>${mdInline(c.note.body)}</div>` : ""}
        ${c.figures && c.figures.length ? `<div class="figs">${c.figures.map((f) => `<figure><img src="${esc(f.src)}" alt="${esc(f.alt || f.caption)}" loading="lazy"><figcaption>${esc(f.caption)}</figcaption></figure>`).join("")}</div>` : ""}
        </div>`;
      ch.appendChild(art);
      if (c.embed) {
        const el = document.getElementById(c.embed);
        if (el) { art.querySelector(".embed-slot").replaceWith(el); el.hidden = false; }
      }
    });
    if (d.next) document.getElementById("next").innerHTML = `<a href="../index.html#work">← All work</a>${d.next.href ? `<a href="${esc(d.next.href)}">${esc(d.next.label)} →</a>` : `<span style="color:var(--t-3)">${esc(d.next.label)}</span>`}`;

    // lightbox for figures
    const lb = document.getElementById("lb");
    if (lb) {
      document.querySelectorAll(".figs img").forEach((im) => im.addEventListener("click", () => { lb.querySelector("img").src = im.src; lb.classList.add("on"); }));
      lb.addEventListener("click", () => lb.classList.remove("on"));
      addEventListener("keydown", (e) => { if (e.key === "Escape") lb.classList.remove("on"); });
    }
    const y = document.getElementById("year"); if (y) y.textContent = new Date().getFullYear();
    if (location.hash) { const t = document.querySelector(location.hash); if (t) setTimeout(() => t.scrollIntoView(), 50); }
    return d;
  }

  return { esc, get, md, mdInline, load, fill, reveal, caseStudy };
})();
