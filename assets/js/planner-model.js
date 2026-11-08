/* Capacity & deadline model — a faithful recreation of the Planning Saga timeline workbook (V6),
   with people, cities and client details removed. Pure function: inputs in, weekly table + milestones out.
   Sections mirror the workbook:
     I   scope, status-based remaining counts, stage benchmarks (hrs per 1,000 parcels), city prep
     II  weekly team capacity, final-clean (FC) allocation
     III rule-based deductions: Must / Buffer × MP / FC / ALL × person or TEAM × hr/day | hr/week | hr/month, optional week window
     IV  weekly summary, two scenarios: S1 = gross − must, S2 = gross − must − buffer */
(function (root) {
  const DAY = 864e5;
  const monday = (d) => { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const addDays = (d, n) => new Date(d.getTime() + n * DAY);

  function run(inp) {
    const T = inp.target;
    const done = inp.done || { mpDoneScNot: 0, scDoneFcNot: 0, fcDone: 0 };
    const remaining = {
      "MP to AM": T - (done.mpDoneScNot + done.scDoneFcNot + done.fcDone),
      "SC to SP": T - done.scDoneFcNot,
      "FC & FR": T - done.fcDone,
      "GFR": T
    };
    // stage hours = ROUNDUP(remaining / base) × benchmark
    const stages = inp.stages.map((s) => ({ ...s, hours: Math.ceil(Math.max(0, remaining[s.group]) / (s.base || 1000)) * s.bench }));
    const byGroup = (g) => stages.filter((s) => s.group === g).reduce((a, s) => a + s.hours, 0);
    const req = { mpToAm: byGroup("MP to AM"), scToSp: byGroup("SC to SP"), fc: byGroup("FC & FR"), gfr: byGroup("GFR") };
    req.teamTillSp = req.mpToAm + req.scToSp;

    const cityStart = monday(inp.cityStart), mpStart = monday(inp.mpStart);
    const prepWeeks = Math.max(0, Math.round((mpStart - cityStart) / (7 * DAY)));
    const prepReq = inp.prep.reduce((a, p) => a + (p.perNH ? p.perNH * inp.nhCount : p.hours), 0);
    const prepWeekly = inp.prep.reduce((a, p) => a + p.hrsDay * p.days, 0);

    const team = inp.team.map((m) => ({ ...m, weekly: m.hrsDay * m.days, mp: Math.max(0, m.hrsDay * m.days - (m.fc || 0)) }));
    const grossMP = team.reduce((a, m) => a + m.mp, 0), grossFC = team.reduce((a, m) => a + (m.fc || 0), 0);
    const daysOf = (who) => who === "TEAM" ? 5 : ((team.find((m) => m.name === who) || {}).days || 0);

    function ruleHours(r, wk) {
      if (r.type !== "Must" && r.type !== "Buffer") return 0;
      if (r.start && wk < monday(r.start)) return 0;
      if (r.end && wk > monday(r.end)) return 0;
      if (r.unit === "hr/day") return r.value * daysOf(r.who);
      if (r.unit === "hr/week") return r.value;
      if (r.unit === "hr/month") return r.value * 12 / 52;
      return 0;
    }

    const weeks = []; let cPrep = 0, c1 = 0, c2 = 0, f1 = 0, f2 = 0;
    const ms = { s1: {}, s2: {} };
    for (let i = 0; i < (inp.horizon || 52); i++) {
      const wk = addDays(cityStart, 7 * i), active = wk >= mpStart;
      const d = { mustMP: 0, bufMP: 0, mustFC: 0, bufFC: 0 };
      inp.rules.forEach((r) => {
        const h = ruleHours(r, wk); if (!h) return;
        const k = r.type === "Must" ? "must" : "buf";
        if (r.applies === "MP" || r.applies === "ALL") d[k + "MP"] += h;
        if (r.applies === "FC" || r.applies === "ALL") d[k + "FC"] += h;
      });
      const prep = wk < mpStart ? prepWeekly : 0; cPrep += prep;
      const gMP = active ? grossMP : 0, gFC = active ? grossFC : 0;
      const n1 = active ? Math.max(0, gMP - d.mustMP) : 0, n2 = active ? Math.max(0, gMP - d.mustMP - d.bufMP) : 0;
      const fc1 = active ? Math.max(0, gFC - d.mustFC) : 0, fc2 = active ? Math.max(0, gFC - d.mustFC - d.bufFC) : 0;
      c1 += n1; c2 += n2; f1 += fc1; f2 += fc2;
      const row = { week: wk, phase: active ? "MP to FC" : "Prep", prep, cumPrep: cPrep, gross: gMP, must: d.mustMP, buffer: d.bufMP, net1: n1, net2: n2, cum1: c1, cum2: c2, fcCum1: f1, fcCum2: f2 };
      weeks.push(row);
      const fri = addDays(wk, 4);
      if (!ms.prepDone && cPrep >= prepReq && prepReq > 0) ms.prepDone = fri;
      [["s1", c1, f1], ["s2", c2, f2]].forEach(([s, c, f]) => {
        const M = ms[s];
        if (!M.sp && c >= req.teamTillSp) M.sp = fri;
        if (!M.fcStream && f >= req.fc) M.fcStream = fri;
        if (M.sp && M.fcStream && !M.fc) M.fc = M.sp > M.fcStream ? M.sp : M.fcStream;
      });
      if (ms.s1.fc && ms.s2.fc && i > 3) break;
    }
    const gfrWeeks = Math.max(1, Math.ceil(req.gfr / (inp.reviewerHrs || 60)));
    ["s1", "s2"].forEach((s) => { if (ms[s].fc) ms[s].gfr = addDays(ms[s].fc, 7 * gfrWeeks); });
    return {
      remaining, stages, req, prep: { req: prepReq, weekly: prepWeekly, weeks: prepWeeks, available: prepWeekly * prepWeeks, spare: prepWeekly * prepWeeks - prepReq },
      gross: { mp: grossMP, fc: grossFC }, mpStart, weeks, ms, gfrWeeks
    };
  }

  root.PlannerModel = { run, monday };
  if (typeof module !== "undefined") module.exports = root.PlannerModel;
})(typeof window !== "undefined" ? window : globalThis);
