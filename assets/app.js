/**
 * Alioxis News — tabs (ai / v / aihot), search, chips, mobile nav
 */
(function () {
  var VALID = { ai: true, v: true, aihot: true };

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
    if (!panel || panel.getAttribute("data-tab") === "aihot") {
      var countEl = document.getElementById("filter-count");
      if (countEl && panel && panel.getAttribute("data-tab") === "aihot") {
        countEl.textContent = "";
      }
      return;
    }
    var qEl = document.getElementById("search-input");
    var q = (qEl && qEl.value ? qEl.value : "").trim().toLowerCase();
    var chip = document.querySelector(".filter-chip.active");
    var tag = chip ? chip.getAttribute("data-tag") || "" : "";
    var cards = panel.querySelectorAll(".card, .v-card");
    var shown = 0;
    cards.forEach(function (card) {
      var hay = (card.getAttribute("data-search") || "").toLowerCase();
      var tags = (card.getAttribute("data-tags") || "").toLowerCase();
      var okQ = !q || hay.indexOf(q) >= 0;
      var okT =
        !tag ||
        tag === "*" ||
        ("|" + tags + "|").indexOf("|" + tag.toLowerCase() + "|") >= 0;
      var show = okQ && okT;
      card.hidden = !show;
      card.style.display = show ? "" : "none";
      if (show) shown++;
    });
    var empty = document.querySelector(".filter-empty");
    if (empty) empty.hidden = shown > 0 || cards.length === 0;
    var countEl = document.getElementById("filter-count");
    if (countEl) {
      countEl.textContent = cards.length ? "显示 " + shown + " / " + cards.length : "";
    }
  }

  function applyTab(tab, opts) {
    tab = VALID[tab] ? tab : "ai";
    opts = opts || {};
    document.body.setAttribute("data-channel", tab);
    document.querySelectorAll(".tab-btn").forEach(function (btn) {
      var on = btn.getAttribute("data-tab") === tab;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
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
      var isIndex = meta.dataset.isIndex === "1";
      var dateLabel = meta.dataset.dateLabel || "";
      var count =
        tab === "v"
          ? Number(meta.dataset.vCount || 0)
          : tab === "aihot"
            ? Number(meta.dataset.aihotCount || 0)
            : Number(meta.dataset.aiCount || 0);
      if (heroEyebrow) {
        heroEyebrow.textContent =
          tab === "v"
            ? "大V视野"
            : tab === "aihot"
              ? "AIHOT 日报"
              : isIndex
                ? "今日热点"
                : "历史归档";
      }
      if (heroTitle) {
        if (tab === "v") {
          heroTitle.textContent = isIndex ? "关注流精选" : meta.dataset.date + " 关注流";
        } else if (tab === "aihot") {
          heroTitle.textContent = isIndex ? "卡兹克日报" : meta.dataset.date + " 日报";
        } else {
          heroTitle.textContent = isIndex ? "今日杂志" : meta.dataset.date + " 杂志";
        }
      }
      if (heroSub) {
        heroSub.textContent =
          tab === "aihot"
            ? dateLabel + (count ? " · AIHOT 结构化日报" : " · 本日无 AIHOT 日报")
            : dateLabel + " · 共 " + count + " 条";
      }
    }
    var toolbar = document.getElementById("reader-toolbar");
    if (toolbar) {
      toolbar.hidden = tab === "aihot";
      var chips = toolbar.querySelector(".filter-chips");
      if (chips && tab !== "aihot") {
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
  }

  function bind() {
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
