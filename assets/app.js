(() => {
  "use strict";

  const DATA_URL = "data/jobs.json";
  const STORE_KEY = "flutter-jobs:status:v1";
  const MODE_LABEL = { remote: "Remote", hybrid: "Hybrid", onsite: "Onsite" };

  const state = { data: null, q: "", mode: "all", status: "active", marks: loadMarks() };
  const $ = (s) => document.querySelector(s);

  // ---------- storage (per-viewer convenience only) ----------
  function loadMarks() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
  }
  function saveMarks() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state.marks)); } catch { /* ignore */ }
  }
  const keyOf = (job) => job.id || job.url;
  const statusOf = (job) => state.marks[keyOf(job)] || "active";
  function setMark(job, value) {
    const k = keyOf(job);
    if (!value || state.marks[k] === value) delete state.marks[k];
    else state.marks[k] = value;
    saveMarks();
    render();
  }

  // ---------- formatting ----------
  const dayFmt = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { weekday: "long", day: "numeric", month: "long" });
  const rtf = new Intl.RelativeTimeFormat("ar-EG-u-nu-latn", { numeric: "auto" });
  function parseDay(d) { return new Date(d + (d.length === 10 ? "T12:00:00" : "")); }
  function relative(iso) {
    const diff = (new Date(iso) - Date.now()) / 1000;
    const units = [["day", 86400], ["hour", 3600], ["minute", 60]];
    for (const [u, s] of units) if (Math.abs(diff) >= s || u === "minute") return rtf.format(Math.round(diff / s), u);
  }
  function el(tag, attrs = {}, text) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text != null) n.textContent = text;
    return n;
  }

  // ---------- filtering ----------
  function matches(job) {
    if (statusOf(job) !== state.status) return false;
    if (state.mode !== "all" && (job.work_mode || "").toLowerCase() !== state.mode) return false;
    if (!state.q) return true;
    const hay = [job.title, job.company, job.location, job.seniority, job.source, job.why_fit]
      .filter(Boolean).join(" ").toLowerCase();
    return state.q.split(/\s+/).every((t) => hay.includes(t));
  }

  // ---------- rendering ----------
  function jobCard(job) {
    const node = $("#jobTpl").content.firstElementChild.cloneNode(true);
    const st = statusOf(job);
    node.querySelector(".job__title").textContent = job.title || "Flutter Developer";
    node.querySelector(".job__company").textContent = job.company || "";
    if (job.top) { node.classList.add("is-top"); node.querySelector(".badge--top").hidden = false; }
    if (st === "applied") node.classList.add("is-applied");

    const meta = node.querySelector(".job__meta");
    const mode = (job.work_mode || "").toLowerCase();
    if (mode) meta.append(el("li", { class: "mode-" + mode }, MODE_LABEL[mode] || job.work_mode));
    if (job.location) meta.append(el("li", { dir: "auto" }, job.location));
    if (job.seniority) meta.append(el("li", { dir: "auto" }, job.seniority));
    if (job.salary) meta.append(el("li", { dir: "auto" }, job.salary));
    if (job.posted_at) meta.append(el("li", {}, "نُشرت " + relative(job.posted_at)));
    if (job.source) meta.append(el("li", { dir: "ltr" }, job.source));

    const why = node.querySelector(".job__why");
    if (job.why_fit) why.textContent = job.why_fit; else why.remove();

    const apply = node.querySelector(".job__apply");
    if (job.url) apply.href = job.url; else apply.remove();

    const markBtn = node.querySelector(".job__mark");
    markBtn.textContent = st === "applied" ? "قدّمت ✓" : "علّم إني قدّمت";
    markBtn.addEventListener("click", () => setMark(job, "applied"));

    const hideBtn = node.querySelector(".job__hide");
    hideBtn.textContent = st === "hidden" ? "إظهار" : "إخفاء";
    hideBtn.addEventListener("click", () => setMark(job, "hidden"));
    return node;
  }

  function list(jobs) {
    const wrap = el("div", { class: "list" });
    const sorted = [...jobs].sort((a, b) => (b.top === true) - (a.top === true));
    sorted.forEach((j) => wrap.append(jobCard(j)));
    return wrap;
  }

  function renderHeader(data) {
    const box = $("#updated");
    box.textContent = "";
    if (!data.updated_at) return;
    const stale = Date.now() - new Date(data.updated_at) > 3 * 86400e3;
    box.append(el("span", { class: "dot" + (stale ? " dot--stale" : "") }), el("span", {}, "آخر تحديث " + relative(data.updated_at)));
  }

  function renderStats(runs) {
    const all = runs.flatMap((r) => r.jobs || []);
    const latest = runs[0]?.jobs || [];
    const applied = all.filter((j) => statusOf(j) === "applied").length;
    const remote = all.filter((j) => (j.work_mode || "").toLowerCase() === "remote").length;
    const box = $("#stats");
    box.textContent = "";
    [[latest.length, "في آخر تقرير"], [all.length, "في الأرشيف"], [remote, "Remote"], [applied, "قدّمت فيها"]]
      .forEach(([n, label]) => {
        const s = el("div", { class: "stat" });
        s.append(el("b", {}, n.toLocaleString("en")), el("span", {}, label));
        box.append(s);
      });
  }

  function render() {
    const runs = state.data?.runs || [];
    renderHeader(state.data || {});
    renderStats(runs);

    const latestBox = $("#latest");
    const archiveBox = $("#archive");
    latestBox.textContent = archiveBox.textContent = "";
    let shown = 0;

    if (runs.length) {
      const [first, ...rest] = runs;
      const jobs = (first.jobs || []).filter(matches);
      shown += jobs.length;
      const head = el("div", { class: "section-head" });
      head.append(el("h2", { id: "latestTitle" }, "آخر تقرير"), el("span", { class: "muted" }, dayFmt.format(parseDay(first.date))));
      latestBox.append(head);
      if (first.summary && state.status === "active" && !state.q && state.mode === "all") {
        latestBox.append(el("p", { class: "summary" }, first.summary));
      }
      if (jobs.length) latestBox.append(list(jobs));
      else latestBox.append(el("p", { class: "muted" }, "مفيش وظايف تطابق الفلتر في آخر تقرير."));

      const days = rest.map((r) => ({ r, jobs: (r.jobs || []).filter(matches) })).filter((d) => d.jobs.length);
      if (days.length) {
        const ah = el("div", { class: "section-head" });
        ah.append(el("h2", { id: "archiveTitle" }, "الأرشيف"));
        archiveBox.append(ah);
        const filtering = !!state.q || state.mode !== "all" || state.status !== "active";
        days.forEach(({ r, jobs }, i) => {
          shown += jobs.length;
          const d = el("details", { class: "day" });
          if (filtering || i === 0) d.open = true;
          const s = el("summary");
          const t = el("span", {}, dayFmt.format(parseDay(r.date)));
          t.append(el("span", { class: "count" }, "(" + jobs.length + " وظايف)"));
          s.append(t);
          d.append(s, list(jobs));
          archiveBox.append(d);
        });
      }
    }

    const empty = $("#empty");
    if (!runs.length) {
      empty.hidden = false;
      empty.textContent = "لسه مفيش تقارير — أول بحث هيتنزل هنا أوتوماتيك.";
      latestBox.textContent = "";
    } else {
      empty.hidden = shown > 0 || runs[0]?.jobs?.length === 0;
      if (!empty.hidden) empty.textContent = "مفيش نتايج.";
    }
  }

  // ---------- wiring ----------
  function bindChips(id, attr, key) {
    $(id).addEventListener("click", (e) => {
      const b = e.target.closest("[data-" + attr + "]");
      if (!b) return;
      state[key] = b.dataset[attr];
      $(id).querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-on", c === b));
      render();
    });
  }
  bindChips("#modeChips", "mode", "mode");
  bindChips("#statusChips", "status", "status");
  let t;
  $("#q").addEventListener("input", (e) => {
    clearTimeout(t);
    t = setTimeout(() => { state.q = e.target.value.trim().toLowerCase(); render(); }, 120);
  });

  fetch(DATA_URL + "?v=" + Date.now(), { cache: "no-store" })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((data) => {
      data.runs = (data.runs || []).sort((a, b) => (a.date < b.date ? 1 : -1));
      state.data = data;
      render();
    })
    .catch(() => {
      const e = $("#empty");
      e.hidden = false;
      e.textContent = "مقدرتش أحمّل البيانات. جرّب تعمل refresh.";
    });
})();
