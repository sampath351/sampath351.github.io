/* Planning Saga demos — all data is generated here; nothing comes from client work. */
window.SagaDemos = (function () {
  const $ = (s, el = document) => el.querySelector(s);
  const NS = "http://www.w3.org/2000/svg";
  const mk = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };

  /* =====================================================================
     1) Workflow in four groups, on real delivered geometry
        Geometry only: location, addresses and attributes removed (built privately).
        Flags and address states shown here are illustrative, not the city's.
     ===================================================================== */
  const STEPS = [
    ["Source", "Starting data", "For this city the client preferred third-party parcel data, so that was the starting point; elsewhere parcels were digitised from scratch. Either way, the raw shapes don't meet the mapping criteria yet."],
    ["Spatial", "Mapping, review, geometry", "Parcels are reshaped or redrawn in QGIS to the mapping criteria. A reviewer flags whatever still breaks them, and scripted geometry checks clear overlaps and gaps. First neighbourhood check."],
    ["Textual", "Addresses", "Every parcel gets an address through a geocoding API, then cleaned and standardised automatically. Only the exceptions reach a person."],
    ["Spatial + textual", "Addresses on the map", "Addresses are checked against the map: numbering must run consistently along each street and no address can repeat. A landing check confirms each one resolves to its own parcel."],
    ["Quality", "Final clean, final review", "Each neighbourhood is final-cleaned as a finished product. A manager-level review then signs off the whole city, and it ships as GeoJSON to the client's schema."]
  ];

  async function pipeline() {
    const svg = $("#pl-svg"); if (!svg) return;
    let D;
    try { D = await fetch("../data/saga/sample.json").then((r) => r.json()); } catch (e) { return; }
    svg.setAttribute("viewBox", `0 0 ${D.w} ${D.h}`);
    // grey aerial backdrop (public-domain imagery), cropped and rotated to the same frame as the parcels
    mk("image", { href: "../assets/img/saga/demo-bg.webp", x: 0, y: 0, width: D.w, height: D.h, preserveAspectRatio: "none", class: "pl-bg" }, svg);
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

    const gRaw = mk("g", { class: "pl-raw" }, svg), gMap = mk("g", {}, svg), gFin = mk("g", {}, svg), gDot = mk("g", {}, svg);
    const raw = D.raw.map((d) => mk("path", { d, class: "pr" }, gRaw));
    const mapped = D.mapped.map(([d, nb, cx, cy], i) => {
      const r = rnd();
      return { el: mk("path", { d, class: "pp", "data-i": i }, gMap), nb, cx, cy, id: "P-" + String(i + 1).padStart(4, "0"),
        geo: r < .03, addr: r < .03 ? "ok" : rnd() < .06 ? "un" : "ok", seq: rnd() < .025 };
    });
    const fin = D.final.map(([d]) => mk("path", { d, class: "pp final" }, gFin));
    mapped.forEach((p) => (p.dot = mk("circle", { cx: p.cx, cy: p.cy, r: 1.7, class: "pd" }, gDot)));
    const NB = Array.from({ length: D.nh }, (_, k) => "N" + (k + 1));

    let step = 0, timer = null;
    const track = $("#pl-track");
    track.style.gridTemplateColumns = `repeat(${STEPS.length}, 1fr)`;
    track.innerHTML = STEPS.map((s, i) => `<button role="tab" data-s="${i}"><span>${String(i).padStart(2, "0")}</span>${s[0]}</button>`).join("");
    track.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { stop(); set(+b.dataset.s); } });

    function set(s) {
      step = s;
      const [group, title, desc] = STEPS[s];
      $("#pl-phase").textContent = s === 0 ? "BEFORE THE WORKFLOW" : `GROUP ${s} / 4 · ${group.toUpperCase()}`;
      $("#pl-title").textContent = title; $("#pl-desc").textContent = desc;
      track.querySelectorAll("button").forEach((b) => { const n = +b.dataset.s; b.classList.toggle("on", n === s); b.classList.toggle("done", n < s); b.setAttribute("aria-selected", n === s); });
      gRaw.style.opacity = s === 0 ? 1 : s === 1 ? .35 : 0;
      gMap.style.opacity = s >= 1 && s <= 3 ? 1 : 0;
      gFin.style.opacity = s === 4 ? 1 : 0;
      let flags = 0, addressed = 0;
      mapped.forEach((p) => {
        const cl = ["pp"];
        if (s === 1 && p.geo) { cl.push("fixed"); flags++; }
        if (s === 2 && p.addr === "un") { cl.push("flag"); flags++; }
        if (s === 3 && p.seq) { cl.push("flag"); flags++; }
        if (s >= 2) cl.push("merged");
        p.el.setAttribute("class", cl.join(" "));
        const st = s === 2 ? p.addr : s === 3 ? "ok" : "";
        p.dot.setAttribute("class", "pd " + (st ? "on " + st : ""));
        if (s === 2 && p.addr === "ok") addressed++;
      });
      if (s >= 3) addressed = mapped.length;
      const total = s === 0 ? raw.length : s === 4 ? fin.length : mapped.length;
      const rows = [
        ["Parcels in view", String(total)],
        ["Flags (illustrative)", s === 0 || s === 4 ? "—" : String(flags) + (s === 1 ? " fixed" : " to review")],
        ["Addressed", s < 2 ? "—" : Math.round(addressed / mapped.length * 100) + "%"],
        ["Export", s === 4 ? "GeoJSON ✓" : "—"]
      ];
      $("#pl-stats").innerHTML = rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("");
      const g1 = s < 1 ? "pending" : "pass", g2 = s < 4 ? "pending" : "pass";
      $("#pl-gates").innerHTML = `<span class="mono">CHECKS</span>` +
        NB.map((n) => `<i class="gate ${g1}" title="Mapping review">${n} · review</i>`).join("") +
        NB.map((n) => `<i class="gate ${g2}" title="Final clean">${n} · final clean</i>`).join("") +
        `<i class="gate city ${g2}" title="Final review">City · final review</i>`;
    }

    const tip = $("#pl-tip");
    svg.addEventListener("pointermove", (e) => {
      const t = e.target.closest(".pp[data-i]"); if (!t || step === 0 || step === 4) { tip.hidden = true; return; }
      const p = mapped[+t.dataset.i]; const box = svg.getBoundingClientRect();
      const a = step < 2 ? "address: pending" : step === 2 && p.addr === "un" ? "address: exception, to review" : step === 3 && p.seq ? "flag: breaks street sequence" : "address: assigned";
      tip.innerHTML = `<b>${p.id} · ${NB[p.nb] || ""}</b><span>${a}</span>`;
      tip.style.left = (e.clientX - box.left + 12) + "px"; tip.style.top = (e.clientY - box.top + 12) + "px"; tip.hidden = false;
    });
    svg.addEventListener("pointerleave", () => (tip.hidden = true));

    const btn = $("#pl-play"), last = STEPS.length - 1;
    function stop() { clearInterval(timer); timer = null; btn.textContent = "▶ Play"; }
    btn.addEventListener("click", () => {
      if (timer) return stop();
      if (step === last) set(0);
      btn.textContent = "❚❚ Pause";
      timer = setInterval(() => { if (step >= last) return stop(); set(step + 1); }, 3200);
    });
    set(0);
  }

  /* =====================================================================
     2) Capacity & deadline planner (recreation of the capacity & deadline model)
     ===================================================================== */
  function planner() {
    const box = $("#planner-demo"); if (!box || !window.PlannerModel) return;
    const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
    const fmt = (d) => d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "beyond horizon";
    const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const r1 = (v) => (Math.round(v * 10) / 10).toLocaleString();

    function defaults() {
      const start = PlannerModel.monday(new Date(Date.now() + 7 * 864e5));
      const plus = (n) => iso(new Date(start.getTime() + n * 864e5));
      // first national holiday (26 Jan, 15 Aug, 2 Oct, 25 Dec) on a weekday within ~4 months → a one-week Must rule
      let hol = null;
      for (let y = start.getFullYear(); y <= start.getFullYear() + 1 && !hol; y++)
        for (const md of ["01-26", "08-15", "10-02", "12-25"]) { const d = new Date(`${y}-${md}T12:00:00`); if (d > start && d - start < 120 * 864e5 && d.getDay() % 6 !== 0) { hol = d; break; } }
      const st = (code, name, group, bench) => ({ code, name, group, bench, base: 1000 });
      return {
        target: 40000, done: { mpDoneScNot: 0, scDoneFcNot: 0, fcDone: 0 }, cityStart: plus(0), mpStart: plus(14), nhCount: 50, reviewerHrs: 60, horizon: 52,
        // Benchmarks shown as the four public workflow groups. Textual is one automated run with a fixed time per city.
        stages: [st("SP1", "Spatial", "MP to AM", 4.58), { ...st("TX", "Textual (automated run)", "MP to AM", .25), fixed: true }, st("ST", "Spatial + textual", "SC to SP", 4.5),
          st("FC", "Final clean (per neighbourhood)", "FC & FR", 1.5), st("FR", "Final review (whole city)", "GFR", 1.5)],
        team: [{ name: "Associate 1", hrsDay: 7, days: 5, fc: 0 }, { name: "Associate 2", hrsDay: 7, days: 5, fc: 0 }, { name: "Senior associate", hrsDay: 7, days: 5, fc: 15 },
          { name: "Associate 3", hrsDay: 7, days: 5, fc: 15 }, { name: "New joinee", hrsDay: 7, days: 5, fc: 0 }],
        prep: [{ task: "City preparation", hours: 32, hrsDay: 4, days: 5 }, { task: "Pricing & landmarks", hours: 5, hrsDay: 1, days: 5 },
          { task: "Boundary cleaning (0.75 h × NH)", perNH: .75, hrsDay: 7, days: 5 }, { task: "Pilot neighbourhoods", hours: 26, hrsDay: 2, days: 5 }],
        rules: [
          { type: "Must", applies: "MP", stream: "Client support", who: "TEAM", value: 8, unit: "hr/week", start: plus(0), end: plus(14) },
          { type: "Must", applies: "MP", stream: "Onboarding ramp-up", who: "New joinee", value: 5, unit: "hr/day", start: plus(0), end: plus(35) },
          { type: "Must", applies: "MP", stream: "Admin & finance", who: "Associate 2", value: 5, unit: "hr/day", start: plus(0), end: "" },
          { type: "Must", applies: "MP", stream: "Management", who: "Senior associate", value: 1, unit: "hr/day", start: plus(0), end: "" },
          ...(hol ? [{ type: "Must", applies: "ALL", stream: "Public holiday " + hol.toLocaleDateString("en-GB", { day: "numeric", month: "short" }), who: "TEAM", value: 35, unit: "hr/week", start: iso(PlannerModel.monday(hol)), end: iso(PlannerModel.monday(hol)) }] : []),
          { type: "Buffer", applies: "MP", stream: "Unplanned leave", who: "TEAM", value: 60, unit: "hr/month", start: plus(0), end: "" },
          { type: "Buffer", applies: "MP", stream: "Side project (farms)", who: "Senior associate", value: 5, unit: "hr/week", start: plus(0), end: "" },
          { type: "Buffer", applies: "MP", stream: "Side project (one-person cities)", who: "Associate 3", value: 2, unit: "hr/week", start: plus(0), end: "" }
        ]
      };
    }
    let S = defaults();

    const num = (path, v, step = "any", w = "") => `<input type="number" step="${step}" data-k="${path}" value="${v}" ${w ? `style="width:${w}"` : ""}>`;
    const sel = (path, v, opts) => `<select data-k="${path}">${opts.map((o) => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
    const txt = (path, v) => `<input type="text" data-k="${path}" value="${esc(v)}">`;
    const date = (path, v) => `<input type="date" data-k="${path}" value="${v || ""}">`;

    function renderInputs() {
      box.querySelector('[data-pane="scope"]').innerHTML = `
        <div class="pz-f">
          <label>Target parcels (full city)${num("target", S.target, 100)}</label>
          <label>Neighbourhoods (NH)${num("nhCount", S.nhCount, 1)}</label>
          <label>City start week${date("cityStart", S.cityStart)}</label>
          <label>Mapping start week${date("mpStart", S.mpStart)}</label>
        </div>
        <h6 class="pz-h">Already done (status counts)</h6>
        <div class="pz-f three">
          <label>Spatial &amp; textual done${num("done.mpDoneScNot", S.done.mpDoneScNot, 1)}</label>
          <label>Spatial + textual done${num("done.scDoneFcNot", S.done.scDoneFcNot, 1)}</label>
          <label>Final clean done${num("done.fcDone", S.done.fcDone, 1)}</label>
        </div>
        <h6 class="pz-h">Benchmarks · hours</h6>
        <table class="pz-t"><tbody>${S.stages.map((s, i) => `<tr><td>${s.name}</td><td>${num(`stages.${i}.bench`, s.bench, .01, "70px")}</td><td class="dim">${s.fixed ? "h per city" : "h / 1,000"}</td></tr>`).join("")}</tbody></table>
        <div class="pz-f"><label>Global review capacity (h/week)${num("reviewerHrs", S.reviewerHrs, 1)}</label></div>`;

      box.querySelector('[data-pane="team"]').innerHTML = `
        <h6 class="pz-h">Weekly team capacity</h6>
        <table class="pz-t"><thead><tr><th>Person</th><th>h/day</th><th>days</th><th>Final clean h/wk</th><th></th></tr></thead><tbody>${S.team.map((m, i) => `<tr><td>${txt(`team.${i}.name`, m.name)}</td><td>${num(`team.${i}.hrsDay`, m.hrsDay, .5, "56px")}</td><td>${num(`team.${i}.days`, m.days, 1, "48px")}</td><td>${num(`team.${i}.fc`, m.fc, 1, "56px")}</td><td><button class="x" data-del="team.${i}" aria-label="Remove">×</button></td></tr>`).join("")}</tbody></table>
        <button class="chip" data-add="team">+ person</button>
        <h6 class="pz-h">City prep workload</h6>
        <table class="pz-t"><thead><tr><th>Task</th><th>hours</th><th>h/day</th><th>days</th></tr></thead><tbody>${S.prep.map((p, i) => `<tr><td>${esc(p.task)}</td><td>${p.perNH ? `<span class="mono dim">${r1(p.perNH * S.nhCount)}</span>` : num(`prep.${i}.hours`, p.hours, 1, "56px")}</td><td>${num(`prep.${i}.hrsDay`, p.hrsDay, .5, "52px")}</td><td>${num(`prep.${i}.days`, p.days, 1, "44px")}</td></tr>`).join("")}</tbody></table>`;

      const who = ["TEAM", ...S.team.map((m) => m.name)];
      box.querySelector('[data-pane="rules"]').innerHTML = `
        <p class="note">Deductions applied week by week. <b>Must</b> = unavoidable; <b>Buffer</b> = conservative allowance. S1 ignores buffers; S2 includes them and is the planning date.</p>
        <div class="pz-rules">${S.rules.map((r, i) => `<div class="pz-rule ${r.type.toLowerCase()}">
          <div class="rr1">${sel(`rules.${i}.type`, r.type, ["Must", "Buffer", "Inapplicable"])}${sel(`rules.${i}.applies`, r.applies, ["MP", "FC", "ALL"])}${txt(`rules.${i}.stream`, r.stream)}<button class="x" data-del="rules.${i}" aria-label="Remove">×</button></div>
          <div class="rr2">${sel(`rules.${i}.who`, r.who, who.includes(r.who) ? who : [r.who, ...who])}${num(`rules.${i}.value`, r.value, .5, "64px")}${sel(`rules.${i}.unit`, r.unit, ["hr/day", "hr/week", "hr/month"])}</div>
          <div class="rr3"><span class="mono dim">from</span>${date(`rules.${i}.start`, r.start)}<span class="mono dim">to</span>${date(`rules.${i}.end`, r.end)}</div>
        </div>`).join("")}</div>
        <button class="chip" data-add="rules">+ rule</button>`;
    }

    function setPath(path, raw, type) {
      const keys = path.split("."); let o = S;
      for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
      o[keys.at(-1)] = type === "number" ? (raw === "" ? 0 : +raw) : raw;
    }

    function compute() {
      const out = PlannerModel.run(S), ms = out.ms;
      const row = (k, a, b) => `<tr><td>${k}</td><td>${fmt(a)}</td><td class="s2">${fmt(b)}</td></tr>`;
      $("#pz-ms").innerHTML = `
        <div class="pz-big"><span class="mono">PLANNING DATE · S2 · FINAL REVIEW DONE</span><b>${ms.s2.gfr ? ms.s2.gfr.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}</b>
          <span>${out.prep.spare >= 0 ? `Prep fits: ${r1(out.prep.req)} h needed, ${r1(out.prep.available)} h available (${out.prep.weeks} wk)` : `<em>Prep shortfall: ${r1(-out.prep.spare)} h. Move the mapping start later or add prep capacity.</em>`}${ms.prepDone ? ` · prep done ${fmt(ms.prepDone)}` : ""}</span></div>
        <table class="pz-mt"><thead><tr><th>Milestone</th><th>S1 · no buffers</th><th class="s2">S2 · with buffers</th></tr></thead><tbody>
          ${row("Spatial + textual complete", ms.s1.sp, ms.s2.sp)}${row("Final clean complete", ms.s1.fc, ms.s2.fc)}${row("Final review complete", ms.s1.gfr, ms.s2.gfr)}</tbody></table>`;
      $("#pz-req").innerHTML = [["Spatial & textual", out.req.mpToAm], ["Spatial + textual", out.req.scToSp], ["Final clean", out.req.fc], ["Final review", out.req.gfr], ["Team gross / wk", out.gross.mp], ["Final clean / wk", out.gross.fc]]
        .map(([k, v]) => `<div><span>${k}</span><b>${r1(v)} h</b></div>`).join("");

      // chart: cumulative team hours S1/S2 vs requirement
      const W = 600, H = 220, P = { l: 40, r: 28, t: 12, b: 26 };
      const wk = out.weeks, n = Math.max(2, wk.length), maxY = Math.max(out.req.teamTillSp * 1.15, wk.at(-1).cum1);
      const X = (i) => P.l + (W - P.l - P.r) * i / (n - 1), Y = (v) => H - P.b - (H - P.t - P.b) * v / maxY;
      const line = (k) => wk.map((w, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(w[k]).toFixed(1)}`).join("");
      const mpI = wk.findIndex((w) => w.phase !== "Prep");
      $("#pz-chart").innerHTML = `
        ${mpI > 0 ? `<rect x="${X(0)}" y="${P.t}" width="${X(mpI) - X(0)}" height="${H - P.t - P.b}" fill="rgba(255,255,255,.035)"/><text x="${X(0) + 4}" y="${H - P.b - 6}" class="ct">prep</text>` : ""}
        <line x1="${P.l}" x2="${W - P.r}" y1="${Y(out.req.teamTillSp)}" y2="${Y(out.req.teamTillSp)}" stroke="#ef476f" stroke-dasharray="4 3"/>
        <text x="${W - P.r - 4}" y="${Y(out.req.teamTillSp) - 5}" text-anchor="end" class="ct" fill="#ef476f">team hours to spatial + textual · ${r1(out.req.teamTillSp)} h</text>
        <path d="${line("cum1")}" fill="none" stroke="#5ec8d8" stroke-width="2"/>
        <path d="${line("cum2")}" fill="none" stroke="#ff8a3d" stroke-width="2.2"/>
        ${wk.map((w, i) => i % Math.ceil(n / 8) === 0 ? `<text x="${X(i)}" y="${H - 8}" text-anchor="middle" class="ct">${fmt(w.week)}</text>` : "").join("")}
        <text x="${P.l - 6}" y="${Y(0)}" text-anchor="end" class="ct">0</text><text x="${P.l - 6}" y="${Y(maxY) + 8}" text-anchor="end" class="ct">${Math.round(maxY)}</text>
        <g class="ct"><rect x="${P.l + 8}" y="${P.t + 18}" width="10" height="3" fill="#5ec8d8"/><text x="${P.l + 22}" y="${P.t + 22}">S1</text><rect x="${P.l + 48}" y="${P.t + 18}" width="10" height="3" fill="#ff8a3d"/><text x="${P.l + 62}" y="${P.t + 22}">S2</text></g>`;

      $("#pz-weeks").innerHTML = `<table class="pz-t num"><thead><tr><th>Week</th><th>Phase</th><th>Gross</th><th>Must</th><th>Buffer</th><th>Net S1</th><th>Net S2</th><th>Σ S1</th><th>Σ S2</th></tr></thead><tbody>${
        out.weeks.map((w) => `<tr><td>${fmt(w.week)}</td><td>${w.phase === "Prep" ? `prep ${r1(w.prep)}h` : "production"}</td><td>${r1(w.gross)}</td><td>${r1(w.must)}</td><td>${r1(w.buffer)}</td><td>${r1(w.net1)}</td><td>${r1(w.net2)}</td><td>${r1(w.cum1)}</td><td>${r1(w.cum2)}</td></tr>`).join("")}</tbody></table>`;
    }

    box.addEventListener("input", (e) => { const k = e.target.dataset.k; if (!k) return; setPath(k, e.target.value, e.target.type); compute(); });
    // structural edits (names, NH count, rule type) re-render the input panes on commit
    box.addEventListener("change", (e) => { const k = e.target.dataset.k; if (k && /^(team\.\d+\.name|nhCount|rules\.\d+\.type)$/.test(k)) { renderInputs(); compute(); } });
    box.addEventListener("click", (e) => {
      const t = e.target.closest("[data-tab],[data-add],[data-del],#pz-reset"); if (!t) return;
      if (t.dataset.tab) { box.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("on", b === t)); box.querySelectorAll("[data-pane]").forEach((p) => (p.hidden = p.dataset.pane !== t.dataset.tab)); return; }
      if (t.id === "pz-reset") S = defaults();
      if (t.dataset.add === "team") S.team.push({ name: "Person " + (S.team.length + 1), hrsDay: 7, days: 5, fc: 0 });
      if (t.dataset.add === "rules") S.rules.push({ type: "Must", applies: "MP", stream: "New rule", who: "TEAM", value: 1, unit: "hr/week", start: S.cityStart, end: "" });
      if (t.dataset.del) { const [k, i] = t.dataset.del.split("."); S[k].splice(+i, 1); }
      renderInputs(); compute();
    });
    renderInputs(); compute();
  }

  return { init() { pipeline(); planner(); } };
})();
