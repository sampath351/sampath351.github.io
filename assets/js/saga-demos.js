/* Planning Saga demos — all data is generated here; nothing comes from client work. */
window.SagaDemos = (function () {
  const $ = (s, el = document) => el.querySelector(s);
  const NS = "http://www.w3.org/2000/svg";
  const mk = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };

  /* =====================================================================
     1) Ten-stage pipeline on a fictional town
     ===================================================================== */
  const STAGES = [
    ["Capture", "Mapping", "Parcels are digitised in QGIS or imported from cadastral/OSM sources, neighbourhood by neighbourhood, following the city's preparation protocol."],
    ["Capture", "Mapping review", "A reviewer checks each neighbourhood against imagery and sources. Overlaps, gaps and missing parcels are flagged before anything moves on. This is the neighbourhood QA gate."],
    ["Geometry", "Geometric cleaning", "Scripted checks plus manual fixes resolve overlaps, snap vertices and add missing parcels. Every flag has to close."],
    ["Address", "Address extraction", "Parcel centroids are sent in batches to geocoding APIs and the responses are parsed into address components."],
    ["Address", "Address cleaning", "Components are standardised to local conventions. Only exceptions (missing numbers, ambiguous matches) are queued for a person."],
    ["Address", "Address merge", "Clean addresses are joined back onto parcels, and the reviewed exceptions are resolved and merged."],
    ["Quality", "Spatial cleaning", "A topology pass removes slivers and micro-polygons left over from digitising or the source data."],
    ["Quality", "Sampling", "A random sample is checked in full against the client criteria. This is the city QA gate: any failure sends that issue type back through the pipeline."],
    ["Quality", "Final clean", "Issues found in sampling are fixed across the whole city, not just in the sample."],
    ["Quality", "Final review", "Final sign-off against the client spec, export to GeoJSON, and a retrospective that feeds back into the procedures."]
  ];
  const STREETS = ["Lantern St", "Mill Rd", "Harbour Ave", "Cedar Ln", "Quarry Rd", "Orchard St", "Bell Ave", "Granary Ln", "Kite St", "Ferry Rd", "Juniper Ave", "Weir St"];

  function pipeline() {
    const svg = $("#pl-svg"); if (!svg) return;
    let seed = 42; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

    // --- generate town (local coords, rotated group) ---
    mk("path", { d: "M0 470 C120 430 160 520 260 500 S420 560 520 600 L0 600 Z", class: "pl-water" }, svg);
    const g = mk("g", { transform: "rotate(-5 450 300)" }, svg);
    const parcels = [], slivers = [];
    const bx0 = 70, by0 = 30, BW = 128, BH = 104, ST = 16, COLS = 6, ROWS = 4;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if ((r === 3 && c === 0) || (r === 3 && c === 1)) continue; // waterfront
      const x = bx0 + c * (BW + ST), y = by0 + r * (BH + ST);
      mk("rect", { x: x - 3, y: y - 3, width: BW + 6, height: BH + 6, class: "pl-block" }, g);
      const nb = (r < 2 ? 0 : 2) + (c < 3 ? 0 : 1);
      for (const half of [0, 1]) {
        let cx = x; const y0 = y + half * BH / 2, h = BH / 2;
        while (cx < x + BW - 6) {
          const w = Math.min(x + BW - cx, 14 + rnd() * 16);
          const clean = [[cx, y0], [cx + w, y0], [cx + w, y0 + h], [cx, y0 + h]];
          const err = rnd() < .05 ? "missing" : rnd() < .06 ? "overlap" : null;
          const jit = clean.map(([px, py]) => [px + (rnd() - .5) * (err === "overlap" ? 12 : 3.4), py + (rnd() - .5) * (err === "overlap" ? 12 : 3.4)]);
          const street = STREETS[(half ? r * 2 + 1 : r * 2) % STREETS.length];
          const a = rnd(); const addr = a < .85 ? "ok" : a < .955 ? "fixed" : "manual";
          parcels.push({ clean, jit, err, nb, addr, id: "P-" + String(parcels.length + 1).padStart(4, "0"), label: `${Math.floor(2 + rnd() * 180)} ${street}`, cx: cx + w / 2, cy: y0 + h / 2, sample: rnd() < .08, sIssue: false });
          cx += w;
        }
      }
      if (rnd() < .3) { const sx = x + rnd() * BW * .8, sy = y + (rnd() < .5 ? 0 : BH); slivers.push([[sx, sy - 1.5], [sx + 22, sy], [sx, sy + 1.5]]); }
    }
    parcels.filter((p) => p.sample).slice(0, 2).forEach((p) => (p.sIssue = true));
    const path = (pts) => "M" + pts.map((q) => q[0].toFixed(1) + " " + q[1].toFixed(1)).join("L") + "Z";

    parcels.forEach((p, i) => {
      p.el = mk("path", { d: path(p.jit), class: "pp", "data-i": i }, g);
      p.el.style.transitionDelay = (p.nb * 120 + (i % 30) * 6) + "ms";
      p.dot = mk("circle", { cx: p.cx, cy: p.cy, r: 2.6, class: "pd" }, g);
    });
    const sl = slivers.map((s) => mk("path", { d: path(s), class: "psl" }, g));
    const labels = ["N1", "N2", "N3", "N4"].map((n, k) => mk("text", { x: bx0 + (k % 2) * 3 * (BW + ST) + 6, y: by0 + (k > 1 ? 2 : 0) * (BH + ST) - 8, class: "pnb" }, g));
    labels.forEach((t, k) => (t.textContent = "NEIGHBOURHOOD " + (k + 1)));

    // --- stage logic ---
    let stage = 1, timer = null;
    const track = $("#pl-track");
    track.innerHTML = STAGES.map((s, i) => `<button role="tab" data-s="${i + 1}"><span>${String(i + 1).padStart(2, "0")}</span>${s[1]}</button>`).join("");
    track.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { stop(); set(+b.dataset.s); } });

    function set(s) {
      stage = s;
      const [phase, title, desc] = STAGES[s - 1];
      $("#pl-phase").textContent = `STAGE ${String(s).padStart(2, "0")} / 10 · ${phase.toUpperCase()}`;
      $("#pl-title").textContent = title; $("#pl-desc").textContent = desc;
      track.querySelectorAll("button").forEach((b) => { const n = +b.dataset.s; b.classList.toggle("on", n === s); b.classList.toggle("done", n < s); b.setAttribute("aria-selected", n === s); });

      let mapped = 0, flags = 0, addressed = 0, manual = 0;
      parcels.forEach((p) => {
        const cl = ["pp"];
        const missing = p.err === "missing" && s <= 2;
        if (missing) { cl.push(s === 2 ? "gap" : "hide"); } else mapped++;
        p.el.setAttribute("d", path(s <= 2 ? p.jit : p.clean));
        if (s === 2 && p.err) { cl.push("flag"); flags++; }
        if (s === 3 && p.err) cl.push("fixed");
        if (s >= 6 && s <= 7) cl.push("merged");
        if (s === 8 && p.sample) { cl.push(p.sIssue ? "flag" : "sample"); if (p.sIssue) flags++; }
        if (s === 9 && p.sIssue) cl.push("fixed");
        if (s >= 9) cl.push("merged");
        if (s === 10) cl.push("final");
        p.el.setAttribute("class", cl.join(" "));
        // address dots
        const st = s === 4 ? (p.addr === "ok" ? "ok" : "un") : s === 5 ? (p.addr === "manual" ? "man" : "ok") : "";
        p.dot.setAttribute("class", "pd " + (st ? "on " + st : ""));
        if (s >= 4) {
          if (s === 4 && p.addr === "ok") addressed++;
          if (s === 5 && p.addr !== "manual") addressed++;
          if (s >= 6) addressed++;
          if (s === 5 && p.addr === "manual") manual++;
        }
      });
      sl.forEach((e) => e.setAttribute("class", "psl " + (s <= 6 ? "" : s === 7 ? "hl" : "gone")));
      if (s === 7) flags = slivers.length;

      const total = parcels.length;
      const rows = [
        ["Parcels mapped", `${mapped} / ${total}`],
        ["Open flags", s === 4 || s === 6 || s === 10 ? "0" : s === 5 ? `${manual} → review` : String(flags)],
        ["Addressed", s < 4 ? "—" : Math.round(addressed / total * 100) + "%"],
        ["Export", s === 10 ? "GeoJSON ✓" : "—"]
      ];
      $("#pl-stats").innerHTML = rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("");
      const nbState = s < 2 ? "pending" : s === 2 ? "review" : "pass";
      const cityState = s < 8 ? "pending" : s === 8 ? "review" : s === 9 ? "fixing" : "pass";
      $("#pl-gates").innerHTML = `<span class="mono">QA GATES</span>` + ["N1", "N2", "N3", "N4"].map((n) => `<i class="gate ${nbState}">${n}</i>`).join("") + `<i class="gate city ${cityState}">CITY</i>`;
    }

    // tooltip
    const tip = $("#pl-tip");
    svg.addEventListener("pointermove", (e) => {
      const t = e.target.closest(".pp"); if (!t) { tip.hidden = true; return; }
      const p = parcels[+t.dataset.i]; const box = svg.getBoundingClientRect();
      const a = stage < 4 ? "address: pending" : stage === 4 && p.addr !== "ok" ? "address: unresolved" : stage === 5 && p.addr === "manual" ? "address: queued for review" : p.label;
      tip.innerHTML = `<b>${p.id}</b><span>${a}</span>${stage === 2 && p.err ? `<em>flag: ${p.err}</em>` : ""}${stage === 8 && p.sample ? `<em>${p.sIssue ? "sample: issue found" : "sample: pass"}</em>` : ""}`;
      tip.style.left = (e.clientX - box.left + 12) + "px"; tip.style.top = (e.clientY - box.top + 12) + "px"; tip.hidden = false;
    });
    svg.addEventListener("pointerleave", () => (tip.hidden = true));

    const btn = $("#pl-play");
    function stop() { clearInterval(timer); timer = null; btn.textContent = "▶ Play"; }
    btn.addEventListener("click", () => {
      if (timer) return stop();
      if (stage === 10) set(1);
      btn.textContent = "❚❚ Pause";
      timer = setInterval(() => { if (stage >= 10) return stop(); set(stage + 1); }, 2600);
    });
    set(1);
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
        stages: [st("MP", "Mapping", "MP to AM", 3.5), st("MR", "Mapping review", "MP to AM", 1), st("GC", "Geometric cleaning", "MP to AM", .08), st("AX", "Address extraction", "MP to AM", .25),
          st("ADC", "Address cleaning", "MP to AM", .12), st("AM", "Address merge", "MP to AM", .08), st("SC", "Spatial cleaning", "SC to SP", 3), st("SP", "Sampling", "SC to SP", 1.5),
          st("FC", "Final clean", "FC & FR", 1.5), st("GFR", "Global final review", "GFR", 1.5)],
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
          <label>Mapped, SC not started${num("done.mpDoneScNot", S.done.mpDoneScNot, 1)}</label>
          <label>SC done, FC not started${num("done.scDoneFcNot", S.done.scDoneFcNot, 1)}</label>
          <label>FC done${num("done.fcDone", S.done.fcDone, 1)}</label>
        </div>
        <h6 class="pz-h">Stage benchmarks · hours per 1,000 parcels</h6>
        <table class="pz-t"><tbody>${S.stages.map((s, i) => `<tr><td class="mono">${s.code}</td><td>${s.name}</td><td class="mono dim">${s.group}</td><td>${num(`stages.${i}.bench`, s.bench, .01, "70px")}</td></tr>`).join("")}</tbody></table>
        <div class="pz-f"><label>Global review capacity (h/week)${num("reviewerHrs", S.reviewerHrs, 1)}</label></div>`;

      box.querySelector('[data-pane="team"]').innerHTML = `
        <h6 class="pz-h">Weekly team capacity</h6>
        <table class="pz-t"><thead><tr><th>Person</th><th>h/day</th><th>days</th><th>FC h/wk</th><th></th></tr></thead><tbody>${S.team.map((m, i) => `<tr><td>${txt(`team.${i}.name`, m.name)}</td><td>${num(`team.${i}.hrsDay`, m.hrsDay, .5, "56px")}</td><td>${num(`team.${i}.days`, m.days, 1, "48px")}</td><td>${num(`team.${i}.fc`, m.fc, 1, "56px")}</td><td><button class="x" data-del="team.${i}" aria-label="Remove">×</button></td></tr>`).join("")}</tbody></table>
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
        <div class="pz-big"><span class="mono">PLANNING DATE · S2 · GLOBAL FINAL REVIEW</span><b>${ms.s2.gfr ? ms.s2.gfr.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}</b>
          <span>${out.prep.spare >= 0 ? `Prep fits: ${r1(out.prep.req)} h needed, ${r1(out.prep.available)} h available (${out.prep.weeks} wk)` : `<em>Prep shortfall: ${r1(-out.prep.spare)} h. Move the mapping start later or add prep capacity.</em>`}${ms.prepDone ? ` · prep done ${fmt(ms.prepDone)}` : ""}</span></div>
        <table class="pz-mt"><thead><tr><th>Milestone</th><th>S1 · no buffers</th><th class="s2">S2 · with buffers</th></tr></thead><tbody>
          ${row("Mapping → Sampling complete", ms.s1.sp, ms.s2.sp)}${row("Final clean complete", ms.s1.fc, ms.s2.fc)}${row("Global final review", ms.s1.gfr, ms.s2.gfr)}</tbody></table>`;
      $("#pz-req").innerHTML = [["MP → AM", out.req.mpToAm], ["SC → SP", out.req.scToSp], ["FC", out.req.fc], ["GFR", out.req.gfr], ["Team gross / wk", out.gross.mp], ["FC / wk", out.gross.fc]]
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
        <text x="${W - P.r - 4}" y="${Y(out.req.teamTillSp) - 5}" text-anchor="end" class="ct" fill="#ef476f">team hours to sampling · ${r1(out.req.teamTillSp)} h</text>
        <path d="${line("cum1")}" fill="none" stroke="#5ec8d8" stroke-width="2"/>
        <path d="${line("cum2")}" fill="none" stroke="#ff8a3d" stroke-width="2.2"/>
        ${wk.map((w, i) => i % Math.ceil(n / 8) === 0 ? `<text x="${X(i)}" y="${H - 8}" text-anchor="middle" class="ct">${fmt(w.week)}</text>` : "").join("")}
        <text x="${P.l - 6}" y="${Y(0)}" text-anchor="end" class="ct">0</text><text x="${P.l - 6}" y="${Y(maxY) + 8}" text-anchor="end" class="ct">${Math.round(maxY)}</text>
        <g class="ct"><rect x="${P.l + 8}" y="${P.t + 18}" width="10" height="3" fill="#5ec8d8"/><text x="${P.l + 22}" y="${P.t + 22}">S1</text><rect x="${P.l + 48}" y="${P.t + 18}" width="10" height="3" fill="#ff8a3d"/><text x="${P.l + 62}" y="${P.t + 22}">S2</text></g>`;

      $("#pz-weeks").innerHTML = `<table class="pz-t num"><thead><tr><th>Week</th><th>Phase</th><th>Gross</th><th>Must</th><th>Buffer</th><th>Net S1</th><th>Net S2</th><th>Σ S1</th><th>Σ S2</th></tr></thead><tbody>${
        out.weeks.map((w) => `<tr><td>${fmt(w.week)}</td><td>${w.phase === "Prep" ? `prep ${r1(w.prep)}h` : "MP→FC"}</td><td>${r1(w.gross)}</td><td>${r1(w.must)}</td><td>${r1(w.buffer)}</td><td>${r1(w.net1)}</td><td>${r1(w.net2)}</td><td>${r1(w.cum1)}</td><td>${r1(w.cum2)}</td></tr>`).join("")}</tbody></table>`;
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
