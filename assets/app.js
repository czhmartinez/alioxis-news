/**
 * Alioxis News — channels (streams + indexes), search/tag/author filters, digest view, theme, image fallback
 */
(function () {
  var VALID = { ai: 1, flash: 1, v: 1, digest: 1, topics: 1, creators: 1 };
  var ALIAS = { aihot: ["digest", "daily"], weekly: ["digest", "weekly"] }; // legacy ?tab= values
  var ITEM_SEL = ".story, .post, .letter-item, .wk-row, .topic-item, .person, .wire-row";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function currentTheme() {
    var t = document.documentElement.getAttribute("data-theme");
    if (t) return t;
    return window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function bindTheme() {
    var btn = document.getElementById("theme-toggle");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("ainews-theme", next); } catch (e) {}
    });
  }

  /* broken cover images collapse to a text-only layout */
  function dropImage(im) {
    var holder = im.closest(".story-media, .post-media, .letter-media");
    var item = im.closest(".story");
    if (holder) holder.remove();
    if (item) item.classList.add("no-media");
  }
  function bindImages() {
    document.addEventListener("error", function (ev) {
      if (ev.target && ev.target.tagName === "IMG") dropImage(ev.target);
    }, true);
    $$("img").forEach(function (im) { if (im.complete && im.naturalWidth === 0) dropImage(im); });
  }

  function setChanHeight() {
    var c = $(".channels");
    if (c) document.documentElement.style.setProperty("--chan-h", c.offsetHeight + "px");
  }

  /* routing: ?tab=…&view=daily|weekly */
  function readRoute() {
    var tab = "ai", view = "";
    try {
      var p = new URLSearchParams(location.search);
      var q = p.get("tab");
      view = p.get("view") || "";
      if (q && ALIAS[q]) { tab = ALIAS[q][0]; view = view || ALIAS[q][1]; }
      else if (q && VALID[q]) tab = q;
    } catch (e) {}
    if (tab === "ai") {
      var h = (location.hash || "").replace(/^#/, "");
      if (ALIAS[h]) { tab = ALIAS[h][0]; view = ALIAS[h][1]; } else if (VALID[h]) tab = h;
    }
    return { tab: tab, view: view === "weekly" ? "weekly" : view === "daily" ? "daily" : "" };
  }
  function writeRoute(tab, view, push) {
    try {
      var url = new URL(location.href);
      url.searchParams.set("tab", tab);
      if (tab === "digest" && view) url.searchParams.set("view", view); else url.searchParams.delete("view");
      url.hash = "";
      history[push ? "pushState" : "replaceState"]({}, "", url);
    } catch (e) {}
  }

  function heroCopy(tab, view, m) {
    var d = m.dataset, idx = d.isIndex === "1", lbl = d.dateLabel || "";
    if (tab === "digest") {
      return view === "weekly"
        ? ["简报 · 周报", "近七日回顾", "逐日回顾要闻与大V · " + (d.weeklyCount || 0) + " 天"]
        : ["简报 · 日报", idx ? "卡兹克日报" : d.date + " 日报", lbl + (d.hasDaily === "1" ? " · AIHOT 结构化日报" : " · 本日无日报")];
    }
    var map = {
      ai: [idx ? "今日" : "历史归档", idx ? "今日 AI 要闻" : d.date + " 要闻", lbl + " · 共 " + (d.aiCount || 0) + " 条"],
      flash: ["快讯", "快讯流", "近七日标题速览 · 按时间倒序 · " + (d.flashCount || 0) + " 条"],
      v: ["大V视野", idx ? "今日发声" : d.date + " 发声", lbl + " · " + (d.vCount || 0) + " 条观点"],
      topics: ["索引 · 专题", "按专题浏览", "近期标签聚合 · " + (d.topicsCount || 0) + " 个专题"],
      creators: ["索引 · 人物", "作者名册", "关注流作者 · " + (d.creatorsCount || 0) + " 位"]
    };
    return map[tab] || map.ai;
  }

  function applyFilters() {
    var panel = $(".tab-panel.active");
    if (!panel) return;
    var tab = panel.getAttribute("data-tab");
    var q = (($("#search-input") || {}).value || "").trim().toLowerCase();
    var chip = $(".filter-chip.active");
    var tag = chip ? (chip.getAttribute("data-tag") || "*") : "*";
    var tagged = tab === "ai" || tab === "v";
    var au = tab === "v" ? $(".voice-author.active", panel) : null;
    var author = au ? au.getAttribute("data-author") : "";
    var items = $$(ITEM_SEL, panel), shown = 0;
    items.forEach(function (el) {
      var hay = (el.getAttribute("data-search") || el.textContent || "").toLowerCase();
      var tags = "|" + (el.getAttribute("data-tags") || "").toLowerCase() + "|";
      var ok = (!q || hay.indexOf(q) >= 0) &&
        (!tagged || tag === "*" || tags.indexOf("|" + tag.toLowerCase() + "|") >= 0) &&
        (!author || el.getAttribute("data-author") === author);
      el.hidden = !ok;
      if (ok) shown++;
    });
    var active = !!q || (tagged && tag !== "*") || !!author;
    var front = $(".front", panel); if (front) front.classList.toggle("is-filtering", active);
    var boards = $(".boards", panel); if (boards) boards.classList.toggle("is-filtering", !!q);
    $$(".wire-day", panel).forEach(function (d) { d.hidden = !$$(".wire-row", d).some(function (r) { return !r.hidden; }); });
    var empty = $(".filter-empty"); if (empty) empty.hidden = shown > 0 || items.length === 0;
    var count = $("#filter-count"); if (count) count.textContent = items.length && active ? shown + " / " + items.length : "";
  }

  function renderChips(tab) {
    var tb = $("#reader-toolbar"), chips = tb && $(".filter-chips", tb);
    if (!chips) return;
    var tagged = tab === "ai" || tab === "v";
    chips.hidden = !tagged;
    if (!tagged) return;
    var src = tb.getAttribute(tab === "v" ? "data-v-tags" : "data-ai-tags") || "";
    var html = '<button type="button" class="chip filter-chip active" data-tag="*">全部</button>';
    src.split("|").filter(Boolean).forEach(function (t) {
      var esc = t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
      html += '<button type="button" class="chip filter-chip" data-tag="' + esc + '">' + esc + "</button>";
    });
    chips.innerHTML = html;
  }

  var curView = "daily";
  function applyView(view) {
    curView = view === "weekly" ? "weekly" : "daily";
    $$(".seg-btn").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-view") === curView); });
    $$(".digest-view").forEach(function (v) { v.hidden = v.getAttribute("data-view") !== curView; });
  }

  var lastTab = null, curTab = "ai";
  function applyTab(tab, view, opts) {
    tab = VALID[tab] ? tab : "ai";
    opts = opts || {};
    curTab = tab;
    var meta = $("#day-meta");
    if (tab === "digest") applyView(view || (meta && meta.dataset.hasDaily === "1" ? "daily" : "weekly"));
    document.body.setAttribute("data-channel", tab);
    $$(".tab-btn").forEach(function (b) {
      var on = b.getAttribute("data-tab") === tab;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
      if (on && opts.scrollNav !== false && b.scrollIntoView) { try { b.scrollIntoView({ block: "nearest", inline: "center" }); } catch (e) {} }
    });
    $$(".tab-panel").forEach(function (p) {
      var on = p.getAttribute("data-tab") === tab;
      p.hidden = !on;
      p.classList.toggle("active", on);
    });
    if (meta) {
      var c = heroCopy(tab, curView, meta);
      $("#hero-eyebrow").textContent = c[0];
      $("#hero-title").textContent = c[1];
      $("#hero-sub").textContent = c[2];
    }
    var dn = $(".dedupe-note"); if (dn) dn.hidden = tab !== "ai";
    var tb = $("#reader-toolbar"); if (tb) tb.hidden = tab === "digest";
    if (lastTab !== tab) {
      var s = $("#search-input"); if (s) s.value = "";
      $$(".voice-author.active").forEach(function (b) { b.classList.remove("active"); });
      renderChips(tab);
    }
    lastTab = tab;
    if (!opts.skipUrl) writeRoute(tab, curView, !!opts.push);
    applyFilters();
  }

  function bind() {
    bindTheme();
    bindImages();
    setChanHeight();
    window.addEventListener("resize", setChanHeight);
    if (!$(".tab-panel")) return; // archive page

    $$(".tab-btn").forEach(function (b) {
      b.addEventListener("click", function () { applyTab(b.getAttribute("data-tab"), "", { push: true }); });
    });
    // switching days keeps the current module
    $$(".date-link").forEach(function (a) {
      a.addEventListener("click", function (ev) {
        if (curTab === "ai") return;
        ev.preventDefault();
        var url = new URL(a.getAttribute("href"), location.href);
        url.searchParams.set("tab", curTab);
        if (curTab === "digest") url.searchParams.set("view", curView);
        location.href = url.pathname + url.search;
      });
    });
    var search = $("#search-input");
    if (search) { search.addEventListener("input", applyFilters); search.addEventListener("search", applyFilters); }
    var tb = $("#reader-toolbar");
    if (tb) {
      tb.addEventListener("click", function (ev) {
        var btn = ev.target.closest(".filter-chip");
        if (!btn) return;
        $$(".filter-chip", tb).forEach(function (c) { c.classList.toggle("active", c === btn); });
        applyFilters();
      });
    }
    // delegated: author rail, "all authors", digest segmented control, board expand
    document.addEventListener("click", function (ev) {
      var t = ev.target;
      var au = t.closest && t.closest(".voice-author");
      if (au) {
        var on = !au.classList.contains("active");
        $$(".voice-author").forEach(function (b) { b.classList.remove("active"); });
        if (on) au.classList.add("active");
        applyFilters();
        return;
      }
      var go = t.closest && t.closest("[data-goto]");
      if (go) { applyTab(go.getAttribute("data-goto"), "", { push: true }); return; }
      var seg = t.closest && t.closest(".seg-btn");
      if (seg) { applyTab("digest", seg.getAttribute("data-view"), { push: true, scrollNav: false }); return; }
      var more = t.closest && t.closest(".board-more");
      if (more) {
        var open = more.closest(".board").classList.toggle("is-open");
        more.textContent = open ? "收起" : "展开全部 " + more.getAttribute("data-more") + " 条";
      }
    });
    window.addEventListener("popstate", function () { var r = readRoute(); applyTab(r.tab, r.view, { skipUrl: true }); });
    var r0 = readRoute();
    applyTab(r0.tab, r0.view, { skipUrl: false, scrollNav: false });
    var active = $(".day-chip.active");
    if (active && active.scrollIntoView) { try { active.scrollIntoView({ block: "nearest", inline: "center" }); } catch (e) {} }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
