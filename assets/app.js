/**
 * Alioxis News — tabs, search, chips, mobile nav, mirror reveal
 */
(function () {
  var VALID = {
    ai: true,
    v: true,
    aihot: true,
    weekly: true,
    creators: true,
    topics: true,
    flash: true,
  };

  var GROUPS = {
    today: ["ai", "v", "aihot"],
    review: ["weekly", "flash"],
    explore: ["creators", "topics"],
  };
  var lastTab = {};

  function groupOf(tab) {
    for (var g in GROUPS) {
      if (GROUPS[g].indexOf(tab) >= 0) return g;
    }
    return "today";
  }

  var NO_TOOLBAR = { aihot: true, weekly: true, creators: true, topics: true, flash: true };

  function readTab() {
    try {
      var q = new URLSearchParams(window.location.search).get("tab");
      if (q && VALID[q]) return q;
    } catch (e) {}
    var h = (window.location.hash || "").replace(/^#/, "");
    if (h && VALID[h]) return h;
    return "ai";
  }

  function writeTab(tab, push) {
    try {
      var url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      url.hash = "";
      if (push) history.pushState({ tab: tab }, "", url);
      else history.replaceState({ tab: tab }, "", url);
    } catch (e) {
      try {
        var base =
          window.location.pathname +
          window.location.search
            .replace(/([?&])tab=[^&]*/g, "$1")
            .replace(/[?&]$/, "");
        var sep = base.indexOf("?") >= 0 ? "&" : "?";
        var next = base + sep + "tab=" + tab;
        if (push) history.pushState({ tab: tab }, "", next);
        else history.replaceState({ tab: tab }, "", next);
      } catch (e2) {}
    }
  }

  function activePanel() {
    return document.querySelector(".tab-panel.active");
  }

  function applyFilters() {
    var panel = activePanel();
    if (!panel) return;
    var tab = panel.getAttribute("data-tab") || "";
    if (NO_TOOLBAR[tab] && tab !== "flash" && tab !== "creators" && tab !== "weekly" && tab !== "topics") {
      var countEl0 = document.getElementById("filter-count");
      if (countEl0) countEl0.textContent = "";
      return;
    }
    var qEl = document.getElementById("search-input");
    var q = (qEl && qEl.value ? qEl.value : "").trim().toLowerCase();
    var chip = document.querySelector(".filter-chip.active");
    var tag = chip ? chip.getAttribute("data-tag") || "" : "";
    var cards = panel.querySelectorAll(
      ".card, .v-card, .aihot-card, .creator-card, .wk-lead, .wk-sublead, .wk-day, .topic-item, .wire-row"
    );
    var shown = 0;
    cards.forEach(function (card) {
      var hay = (card.getAttribute("data-search") || card.textContent || "").toLowerCase();
      var tags = (card.getAttribute("data-tags") || "").toLowerCase();
      var okQ = !q || hay.indexOf(q) >= 0;
      var okT =
        !tag ||
        tag === "*" ||
        ("|" + tags + "|").indexOf("|" + tag.toLowerCase() + "|") >= 0;
      // tag chips only apply to ai/v magazine cards
      if (tab !== "ai" && tab !== "v") okT = true;
      var show = okQ && okT;
      card.hidden = !show;
      card.style.display = show ? "" : "none";
      if (show) shown++;
    });
    panel.querySelectorAll(".wire-day").forEach(function (day) {
      var any = day.querySelector(".wire-row:not([hidden])");
      day.hidden = !any;
    });
    var topicsPanel = panel.querySelector(".topics-panel");
    if (topicsPanel) topicsPanel.classList.toggle("is-searching", !!q);
    var empty = document.querySelector(".filter-empty");
    if (empty) empty.hidden = shown > 0 || cards.length === 0 || NO_TOOLBAR[tab];
    var countEl = document.getElementById("filter-count");
    if (countEl) {
      countEl.textContent = cards.length ? "显示 " + shown + " / " + cards.length : "";
    }
  }

  function heroCopy(tab, meta) {
    var isIndex = meta.dataset.isIndex === "1";
    var dateLabel = meta.dataset.dateLabel || "";
    var map = {
      ai: {
        eyebrow: isIndex ? "今日热点" : "历史归档",
        title: isIndex ? "今日杂志" : meta.dataset.date + " 杂志",
        sub: dateLabel + " · 共 " + (meta.dataset.aiCount || 0) + " 条",
      },
      v: {
        eyebrow: "大V视野",
        title: isIndex ? "关注流精选" : meta.dataset.date + " 关注流",
        sub: dateLabel + " · 共 " + (meta.dataset.vCount || 0) + " 条",
      },
      aihot: {
        eyebrow: "AIHOT 日报",
        title: isIndex ? "卡兹克日报" : meta.dataset.date + " 日报",
        sub:
          dateLabel +
          (Number(meta.dataset.aihotCount || 0)
            ? " · AIHOT 结构化日报"
            : " · 本日无 AIHOT 日报"),
      },
      weekly: {
        eyebrow: "回顾 · 本周",
        title: "本周长文",
        sub: "头条加按日回顾 · " + (meta.dataset.weeklyCount || 0) + " 天",
      },
      flash: {
        eyebrow: "回顾 · 快讯",
        title: "快讯流",
        sub: "近七日去重，按时间倒序 · " + (meta.dataset.flashCount || 0) + " 条",
      },
      creators: {
        eyebrow: "发现 · 按人",
        title: "创作者名片墙",
        sub: "关注流作者与发帖节奏 · " + (meta.dataset.creatorsCount || 0) + " 位",
      },
      topics: {
        eyebrow: "发现 · 按话题",
        title: "话题地图",
        sub: "近两周热度分布 · " + (meta.dataset.topicsCount || 0) + " 个话题",
      },
    };
    return map[tab] || map.ai;
  }

  function applyTab(tab, opts) {
    tab = VALID[tab] ? tab : "ai";
    opts = opts || {};
    var group = groupOf(tab);
    lastTab[group] = tab;
    document.body.setAttribute("data-channel", tab);
    document.body.setAttribute("data-group", group);
    document.querySelectorAll(".group-btn").forEach(function (btn) {
      var on = btn.getAttribute("data-group") === group;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll(".tab-btn").forEach(function (btn) {
      var on = btn.getAttribute("data-tab") === tab;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
      btn.hidden = btn.getAttribute("data-group") !== group;
    });
    document.querySelectorAll(".tab-panel").forEach(function (panel) {
      var on = panel.getAttribute("data-tab") === tab;
      panel.hidden = !on;
      panel.classList.toggle("active", on);
    });
    var heroTitle = document.getElementById("hero-title");
    var heroSub = document.getElementById("hero-sub");
    var heroEyebrow = document.getElementById("hero-eyebrow");
    var meta = document.getElementById("day-meta");
    if (meta) {
      var copy = heroCopy(tab, meta);
      if (heroEyebrow) heroEyebrow.textContent = copy.eyebrow;
      if (heroTitle) heroTitle.textContent = copy.title;
      if (heroSub) heroSub.textContent = copy.sub;
    }
    var toolbar = document.getElementById("reader-toolbar");
    if (toolbar) {
      var hideToolbar = !!NO_TOOLBAR[tab];
      // keep a light search for flash/creators/topics/weekly
      var searchOnly = tab === "flash" || tab === "creators" || tab === "weekly" || tab === "topics";
      toolbar.hidden = hideToolbar && !searchOnly;
      toolbar.classList.toggle("toolbar-search-only", searchOnly);
      var chips = toolbar.querySelector(".filter-chips");
      if (chips) chips.hidden = hideToolbar;
      if (chips && (tab === "ai" || tab === "v")) {
        chips.hidden = false;
        var src =
          tab === "v"
            ? toolbar.getAttribute("data-v-tags") || ""
            : toolbar.getAttribute("data-ai-tags") || "";
        var cur = "";
        var active = chips.querySelector(".filter-chip.active");
        if (active) cur = active.getAttribute("data-tag") || "";
        chips.innerHTML =
          '<button type="button" class="filter-chip' +
          (!cur || cur === "*" ? " active" : "") +
          '" data-tag="*">全部</button>' +
          src
            .split("|")
            .filter(Boolean)
            .map(function (t) {
              var on = cur === t ? " active" : "";
              return (
                '<button type="button" class="filter-chip' +
                on +
                '" data-tag="' +
                t.replace(/"/g, "&quot;") +
                '">' +
                t +
                "</button>"
              );
            })
            .join("");
      }
    }
    if (!opts.skipUrl) writeTab(tab, !!opts.push);
    applyFilters();
    revealMirrors();
  }

  function revealMirrors() {
    var panel = activePanel();
    if (!panel) return;
    var nodes = panel.querySelectorAll(".mirror-card, .card, .v-card");
    if (!nodes.length) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      nodes.forEach(function (n) {
        n.classList.add("is-inview");
      });
      return;
    }
    if (!("IntersectionObserver" in window)) {
      nodes.forEach(function (n) {
        n.classList.add("is-inview");
      });
      return;
    }
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            en.target.classList.add("is-inview");
            io.unobserve(en.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );
    nodes.forEach(function (n) {
      n.classList.remove("is-inview");
      io.observe(n);
    });
  }

  function bind() {
    document.querySelectorAll(".group-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var g = btn.getAttribute("data-group");
        applyTab(lastTab[g] || GROUPS[g][0], { push: true });
      });
    });
    document.querySelectorAll(".topic-tile").forEach(function (tile) {
      tile.addEventListener("click", function () {
        var id = tile.getAttribute("data-topic");
        var root = tile.closest(".topics-panel");
        if (!root) return;
        root.querySelectorAll(".topic-tile").forEach(function (t) {
          t.classList.toggle("is-active", t === tile);
        });
        root.querySelectorAll(".topic-board").forEach(function (b) {
          b.classList.toggle("is-active", b.getAttribute("data-topic") === id);
        });
      });
    });
    document.querySelectorAll(".topics-panel").forEach(function (p) {
      p.classList.add("is-enhanced");
    });
    document.querySelectorAll(".tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        applyTab(btn.getAttribute("data-tab"), { push: true });
      });
    });
    document.querySelectorAll(".date-link").forEach(function (a) {
      a.addEventListener("click", function (ev) {
        var tab = readTab();
        if (tab === "ai") return;
        ev.preventDefault();
        var href = a.getAttribute("href") || "";
        try {
          var url = new URL(href, window.location.href);
          url.searchParams.set("tab", tab);
          url.hash = "";
          window.location.href = url.pathname + url.search;
        } catch (e) {
          var sep = href.indexOf("?") >= 0 ? "&" : "?";
          window.location.href = href + sep + "tab=" + tab;
        }
      });
    });
    var search = document.getElementById("search-input");
    if (search) {
      search.addEventListener("input", applyFilters);
      search.addEventListener("search", applyFilters);
    }
    var toolbar = document.getElementById("reader-toolbar");
    if (toolbar) {
      toolbar.addEventListener("click", function (ev) {
        var btn = ev.target.closest(".filter-chip");
        if (!btn) return;
        toolbar.querySelectorAll(".filter-chip").forEach(function (c) {
          c.classList.toggle("active", c === btn);
        });
        applyFilters();
      });
    }
    var toggle = document.getElementById("timeline-toggle");
    var timeline = document.querySelector(".timeline");
    if (toggle && timeline) {
      toggle.addEventListener("click", function () {
        var open = timeline.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
        toggle.textContent = open ? "收起日期" : "浏览日期";
      });
    }
    window.addEventListener("popstate", function () {
      applyTab(readTab(), { skipUrl: true });
    });
    applyTab(readTab(), { skipUrl: false });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
