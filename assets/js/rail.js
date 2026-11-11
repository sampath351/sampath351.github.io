/* Section rail: one navigation pattern for the home page and every case study.
   Home: lists <section data-rail="Label"> blocks that are not hidden.
   Case study: "All work" link, then the map (if any) and each chapter.
   Wide screens: a slim rail of section numbers is always visible; hovering a number shows its title,
   and the current section's title runs vertically at the foot of the rail. The "Sections" button opens
   the full list (all screen sizes). */
(function () {
  const rail = document.getElementById("rail"); if (!rail) return;
  const btn = document.querySelector(".sec-btn");
  const isCase = !!document.getElementById("chapters");
  // back link follows the page's breadcrumb (Work or Lab)
  const back = () => { const a = document.querySelector(".crumb a"); return a && /lab/i.test(a.textContent) ? { href: a.getAttribute("href"), t: "Lab" } : { href: "../index.html#work", t: "All work" }; };
  let io;

  function items() {
    if (!isCase) {
      return [...document.querySelectorAll("main section[data-rail]")].filter((s) => !s.hidden).map((s) => ({ id: s.id, label: s.dataset.rail }));
    }
    const out = [{ id: "top", label: "Overview", n: "·" }];
    if (document.getElementById("explore")) out.push({ id: "explore", label: document.getElementById("explore").dataset.rail || "Interactive map", n: "◆" });
    document.querySelectorAll("#chapters .chapter").forEach((c) => {
      const l = c.querySelector(".lbl"); if (!c.id || !l) return;
      out.push({ id: c.id, label: l.childNodes[l.childNodes.length - 1].textContent.trim(), n: (l.querySelector("b") || {}).textContent });
    });
    return out;
  }

  function build() {
    const list = items(); if (!list.length) return;
    // keep the section numbers on the home page in step with what is actually shown
    if (!isCase) list.forEach((it, i) => { const b = document.querySelector(`#${it.id} .sec-head .no b`); if (b) b.textContent = String(i + 1).padStart(2, "0"); });
    const head = isCase
      ? `<a class="rail-back" href="${back().href}" title="${back().t}"><span class="arr">←</span><span class="t">${back().t}</span></a><div class="rail-t">${(document.querySelector(".crumb") || {}).lastChild ? document.querySelector(".crumb").lastChild.textContent.replace(/^\s*\/\s*/, "") : "Case study"}</div>`
      : `<div class="rail-t">On this page</div>`;
    rail.innerHTML = head + `<ol>${list.map((it, i) => `<li><a href="#${it.id}" data-id="${it.id}" aria-label="${it.label}"><span class="n">${it.n || String(i + 1).padStart(2, "0")}</span><span class="t">${it.label}</span></a></li>`).join("")}</ol><div class="rail-now" aria-hidden="true"></div>`;
    document.body.classList.add("has-rail");
    requestAnimationFrame(() => dispatchEvent(new Event("resize")));   // canvases re-measure after the layout shift
    spy(list);
  }

  function spy(list) {
    if (io) io.disconnect();
    const links = [...rail.querySelectorAll("a[data-id]")];
    const now = rail.querySelector(".rail-now");
    const set = (id) => {
      links.forEach((a) => a.classList.toggle("on", a.dataset.id === id));
      const it = list.find((x) => x.id === id); if (now && it) now.textContent = it.label;
    };
    io = new IntersectionObserver((ens) => ens.forEach((en) => { if (en.isIntersecting) set(en.target.id); }), { rootMargin: "-35% 0px -60% 0px" });
    list.forEach((it) => { const el = document.getElementById(it.id); if (el) io.observe(el); });
    set(list[0].id);
  }

  function close() { rail.classList.remove("open"); document.body.classList.remove("rail-open"); if (btn) btn.setAttribute("aria-expanded", "false"); }
  if (btn) btn.addEventListener("click", () => {
    const open = !rail.classList.contains("open");
    rail.classList.toggle("open", open); document.body.classList.toggle("rail-open", open); btn.setAttribute("aria-expanded", String(open));
  });
  rail.addEventListener("click", (e) => { if (e.target.closest("a")) close(); });
  addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  document.addEventListener("click", (e) => { if (rail.classList.contains("open") && !rail.contains(e.target) && e.target !== btn) close(); });

  document.addEventListener("content:ready", build);
  if (document.readyState !== "loading") build(); else document.addEventListener("DOMContentLoaded", build);
})();
