#!/usr/bin/env node
/**
 * Alioxis News — static site generator
 * Channels (distinct modules):
 *   ai    — Flipboard magazine digest (public sources)
 *   v     — 大V视野 social timeline (X following)
 *   aihot — AIHOT 日报 structured briefing (_aihot_daily.json)
 */
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DIST_DIR = path.join(ROOT, "dist");
const ASSETS_SRC = path.join(ROOT, "assets");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    console.error(`Invalid JSON: ${filePath}`, e.message);
    return null;
  }
}

function readJsonArray(filePath) {
  const parsed = readJson(filePath);
  return Array.isArray(parsed) ? parsed : [];
}

function loadAihotDaily(dayDir) {
  const raw = readJson(path.join(dayDir, "_aihot_daily.json"));
  return raw && typeof raw === "object" ? raw : null;
}

function normalizeTitle(t) {
  return String(t || "")
    .toLowerCase()
    .replace(/[\s\u3000]+/g, "")
    .replace(/[“”"'‘’«»]/g, "")
    .replace(/[：:].*$/, "")
    .slice(0, 28);
}

function aihotTitleKeys(daily) {
  const keys = new Set();
  if (!daily) return keys;
  const push = (t) => {
    const n = normalizeTitle(t);
    if (n.length >= 8) keys.add(n);
  };
  if (daily.lead && daily.lead.title) push(daily.lead.title);
  for (const s of daily.sections || []) {
    for (const it of s.items || []) push(it.title);
  }
  return keys;
}

function overlapsAihot(item, keys) {
  const n = normalizeTitle(item.title);
  if (n.length < 8) return false;
  for (const k of keys) {
    if (n.includes(k.slice(0, 14)) || k.includes(n.slice(0, 14))) return true;
  }
  return false;
}

function loadDays() {
  if (!fs.existsSync(DATA_DIR)) return [];
  const dates = new Set();
  for (const entry of fs.readdirSync(DATA_DIR, { withFileTypes: true })) {
    if (entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name)) {
      dates.add(entry.name);
    } else if (entry.isFile() && /^\d{4}-\d{2}-\d{2}\.json$/.test(entry.name)) {
      dates.add(entry.name.replace(/\.json$/, ""));
    }
  }
  return [...dates]
    .sort()
    .reverse()
    .map((date) => {
      const dayDir = path.join(DATA_DIR, date);
      let aiItems = [];
      let vItems = [];
      let aihotDaily = null;
      if (fs.existsSync(dayDir) && fs.statSync(dayDir).isDirectory()) {
        aiItems = readJsonArray(path.join(dayDir, "ai.json"));
        vItems = readJsonArray(path.join(dayDir, "v.json"));
        aihotDaily = loadAihotDaily(dayDir);
      }
      const legacy = path.join(DATA_DIR, `${date}.json`);
      if (aiItems.length === 0 && fs.existsSync(legacy)) {
        aiItems = readJsonArray(legacy);
      }
      const keys = aihotTitleKeys(aihotDaily);
      const aiDeduped = aihotDaily
        ? aiItems.filter((it) => !overlapsAihot(it, keys))
        : aiItems;
      return {
        date,
        aiItems: aiDeduped,
        aiRawCount: aiItems.length,
        vItems,
        aihotDaily,
        aihotItemCount: countAihotItems(aihotDaily),
      };
    });
}

function countAihotItems(daily) {
  if (!daily) return 0;
  let n = 0;
  for (const s of daily.sections || []) n += (s.items || []).length;
  n += (daily.flashes || []).length;
  return n;
}

function formatDateZh(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${y}年${m}月${d}日 · 周${weekdays[dt.getUTCDay()]}`;
}

function initials(name) {
  const s = String(name || "?").trim();
  if (!s) return "?";
  const latin = s.match(/[A-Za-z0-9]+/g);
  if (latin && latin.length) {
    return latin
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("");
  }
  return s.slice(0, 1);
}

function cssHref(depth) {
  return "../".repeat(depth) + "assets/styles.css";
}
function jsHref(depth) {
  return "../".repeat(depth) + "assets/app.js";
}
function homeHref(depth) {
  return depth === 0 ? "index.html" : "../".repeat(depth) + "index.html";
}
function archiveHref(depth) {
  return depth === 0 ? "archive/" : "../".repeat(depth) + "archive/";
}
function dayHref(date, depth) {
  if (depth === 0) return `${date}/`;
  return `../${date}/`;
}

function topTags(items, limit) {
  const freq = new Map();
  for (const item of items) {
    for (const t of Array.isArray(item.tags) ? item.tags : []) {
      const key = String(t).trim();
      if (!key) continue;
      freq.set(key, (freq.get(key) || 0) + 1);
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh"))
    .slice(0, limit)
    .map(([t]) => t);
}

function searchAttr(parts) {
  return escapeHtml(parts.filter(Boolean).join(" "));
}

function renderTimeline(days, activeDate, depth) {
  const items = days
    .map((d) => {
      const active = d.date === activeDate ? " active" : "";
      const label = d.date === days[0]?.date ? `${d.date} · 最新` : d.date;
      const count = d.aiItems.length;
      return `<li><a class="date-link${active}" href="${dayHref(d.date, depth)}" data-date="${escapeHtml(d.date)}"><span>${escapeHtml(label)}</span><span class="count">${count}</span></a></li>`;
    })
    .join("\n");
  return `
<aside class="timeline" aria-label="时间轴">
  <div class="timeline-head">
    <h2>时间轴</h2>
    <a class="archive-link" href="${archiveHref(depth)}">归档日历</a>
  </div>
  <ul class="date-list">
    ${items || "<li><span class=\"muted-note\">暂无归档</span></li>"}
  </ul>
</aside>`;
}

/** AI新闻 — Flipboard magazine card */
function renderAiCard(item) {
  const title = escapeHtml(item.title || "无标题");
  const summary = escapeHtml(item.summary || "");
  const url = escapeHtml(item.url || "#");
  const source = escapeHtml(item.source || "未知来源");
  const handle = escapeHtml(item.source_handle || "");
  const tags = Array.isArray(item.tags) ? item.tags : [];
  const tagHtml = tags
    .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
    .join("");
  const media = item.image
    ? `<div class="card-media"><img src="${escapeHtml(item.image)}" alt="" loading="lazy" decoding="async" /></div>`
    : `<div class="card-media"><div class="cover-fallback" aria-hidden="true"><span>${escapeHtml(initials(item.title || item.source || "AI"))}</span></div></div>`;

  return `
<article class="card" data-search="${searchAttr([item.title, item.summary, item.source, item.source_handle, ...tags])}" data-tags="${escapeHtml(tags.join("|"))}">
  <a class="card-link" href="${url}" target="_blank" rel="noopener noreferrer">
    ${media}
    <div class="card-body">
      ${tagHtml ? `<div class="card-tags">${tagHtml}</div>` : ""}
      <h2 class="card-title">${title}</h2>
      ${summary ? `<p class="card-summary">${summary}</p>` : ""}
      <div class="card-footer">
        <div class="source-avatar" aria-hidden="true">${escapeHtml(initials(item.source))}</div>
        <div class="source-info">
          <div class="source-name">${source}</div>
          ${handle ? `<div class="source-handle">${handle}</div>` : ""}
        </div>
        <span class="ext-hint">外链 ↗</span>
      </div>
    </div>
  </a>
</article>`;
}

/** 大V视野 — denser social timeline cards */
function renderVCard(item) {
  const title = escapeHtml(item.title || "无标题");
  const summary = escapeHtml(item.summary || "");
  const url = escapeHtml(item.url || "#");
  const source = escapeHtml(item.source || "未知");
  const handle = escapeHtml(item.source_handle || "");
  const tags = Array.isArray(item.tags) ? item.tags : [];
  const tagHtml = tags
    .slice(0, 4)
    .map((t) => `<span class="v-tag">${escapeHtml(t)}</span>`)
    .join("");
  const time = item.published_at
    ? escapeHtml(String(item.published_at).replace("T", " ").slice(0, 16))
    : "";
  const thumb = item.image
    ? `<div class="v-thumb"><img src="${escapeHtml(item.image)}" alt="" loading="lazy" decoding="async" /></div>`
    : "";

  return `
<article class="v-card" data-search="${searchAttr([item.title, item.summary, item.source, item.source_handle, ...tags])}" data-tags="${escapeHtml(tags.join("|"))}">
  <a class="v-card-link" href="${url}" target="_blank" rel="noopener noreferrer">
    <div class="v-avatar" aria-hidden="true">${escapeHtml(initials(item.source))}</div>
    <div class="v-main">
      <div class="v-meta">
        <span class="v-name">${source}</span>
        ${handle ? `<span class="v-handle">${handle}</span>` : ""}
        ${time ? `<time class="v-time">${time}</time>` : ""}
      </div>
      <h2 class="v-title">${title}</h2>
      ${summary ? `<p class="v-text">${summary}</p>` : ""}
      ${tagHtml ? `<div class="v-tags">${tagHtml}</div>` : ""}
      ${thumb}
      <span class="v-cta">查看原帖 ↗</span>
    </div>
  </a>
</article>`;
}

/** AIHOT 日报 — editorial briefing (sections + flashes) */
function renderAihotPanel(daily) {
  if (!daily) {
    return `<div class="empty-state aihot-empty">
      <p>本日没有本地 AIHOT 日报数据。</p>
      <p class="muted-note">可用 <code>node scripts/fetch-aihot-daily.js</code> 拉取，或前往 <a href="https://aihot.news/" target="_blank" rel="noopener noreferrer">aihot.news</a>。</p>
    </div>`;
  }
  const leadTitle =
    (daily.lead && (daily.lead.title || daily.lead.leadTitle)) ||
    daily.leadTitle ||
    "AIHOT 日报";
  const leadPara =
    (daily.lead && (daily.lead.leadParagraph || daily.lead.summary)) ||
    daily.leadParagraph ||
    "";
  const canonical =
    (daily.attribution && daily.attribution.canonical) ||
    (daily.attribution && daily.attribution.url) ||
    (daily.date ? `https://aihot.news/daily/${daily.date}` : "https://aihot.news/");
  const date = escapeHtml(daily.date || "");

  const sections = (daily.sections || [])
    .map((s) => {
      const label = escapeHtml(s.label || s.title || "分区");
      const items = (s.items || [])
        .map((it) => {
          const href = escapeHtml(it.permalink || it.sourceUrl || canonical);
          const src = escapeHtml(it.sourceName || "");
          const orig = it.sourceUrl
            ? ` · <a class="aihot-orig" href="${escapeHtml(it.sourceUrl)}" target="_blank" rel="noopener noreferrer">原文</a>`
            : "";
          return `<article class="aihot-item">
  <h3 class="aihot-item-title"><a href="${href}" target="_blank" rel="noopener noreferrer">${escapeHtml(it.title || "")}</a></h3>
  ${it.summary ? `<p class="aihot-item-sum">${escapeHtml(it.summary)}</p>` : ""}
  <div class="aihot-item-foot"><span>${src}</span>${orig}</div>
</article>`;
        })
        .join("\n");
      return `<section class="aihot-section">
  <h2 class="aihot-section-label">${label}</h2>
  <div class="aihot-section-items">${items}</div>
</section>`;
    })
    .join("\n");

  const flashes = (daily.flashes || [])
    .map((f) => {
      const href = escapeHtml(f.permalink || f.sourceUrl || canonical);
      return `<li><a href="${href}" target="_blank" rel="noopener noreferrer"><span class="flash-title">${escapeHtml(f.title || "")}</span><span class="flash-src">${escapeHtml(f.sourceName || "")}</span></a></li>`;
    })
    .join("\n");

  return `
<div class="aihot-daily">
  <header class="aihot-masthead">
    <p class="aihot-brand">AIHOT · 数字生命卡兹克</p>
    <h2 class="aihot-lead">${escapeHtml(leadTitle)}</h2>
    ${leadPara ? `<p class="aihot-lede">${escapeHtml(leadPara)}</p>` : ""}
    <div class="aihot-mast-actions">
      <span class="aihot-date">${date}</span>
      <a class="aihot-open" href="${escapeHtml(canonical)}" target="_blank" rel="noopener noreferrer">在 AIHOT 打开 ↗</a>
    </div>
  </header>
  <div class="aihot-body">
    ${sections}
    ${
      flashes
        ? `<section class="aihot-section aihot-flashes-sec">
      <h2 class="aihot-section-label">快讯</h2>
      <ul class="aihot-flash-list">${flashes}</ul>
    </section>`
        : ""
    }
  </div>
  <footer class="aihot-credit">
    数据来源：<a href="https://aihot.news/" target="_blank" rel="noopener noreferrer">AIHOT</a>
    （开源框架 MIT · 名字/Logo 保留）· 个人非商业引用 · 第三方原文版权归原作者 · 见 NOTICE
  </footer>
</div>`;
}

function renderToolbar(aiItems, vItems) {
  const aiTags = topTags(aiItems, 10);
  const vTags = topTags(vItems, 10);
  const chips = ['<button type="button" class="filter-chip active" data-tag="*">全部</button>']
    .concat(
      aiTags.map(
        (t) =>
          `<button type="button" class="filter-chip" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`
      )
    )
    .join("");
  return `
<div class="reader-toolbar" id="reader-toolbar"
  data-ai-tags="${escapeHtml(aiTags.join("|"))}"
  data-v-tags="${escapeHtml(vTags.join("|"))}">
  <div class="search-row">
    <label class="search-label" for="search-input">搜索</label>
    <input id="search-input" class="search-input" type="search" placeholder="标题 / 摘要 / 来源 / 标签" autocomplete="off" enterkeyhint="search" />
    <span class="filter-count" id="filter-count" aria-live="polite"></span>
  </div>
  <div class="filter-chips" role="group" aria-label="分类筛选">${chips}</div>
  <p class="filter-empty" hidden>没有匹配的条目，试试清空搜索或换标签。</p>
</div>`;
}

function renderPage({
  title,
  days,
  activeDate,
  aiItems,
  vItems,
  aihotDaily,
  aihotItemCount,
  aiRawCount,
  depth,
  isIndex,
}) {
  const dateLabel = formatDateZh(activeDate);
  const emptyAi = `<div class="empty-state"><p>这一天还没有杂志条目${aiRawCount > (aiItems || []).length ? "（与 AIHOT 日报重复的已收束到「AIHOT 日报」频道）" : ""}。</p></div>`;
  const emptyV = `<div class="empty-state"><p>暂无关注流内容</p></div>`;
  const aiCards = aiItems.length
    ? aiItems.map(renderAiCard).join("\n")
    : emptyAi;
  const vCards = vItems.length ? vItems.map(renderVCard).join("\n") : emptyV;
  const aihotHtml = renderAihotPanel(aihotDaily);
  const dedupeNote =
    aihotDaily && aiRawCount > aiItems.length
      ? `<p class="dedupe-note">已与 AIHOT 日报去重 ${aiRawCount - aiItems.length} 条，完整精选见「AIHOT 日报」。</p>`
      : "";

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="description" content="Alioxis News — AI杂志 · 大V视野 · AIHOT日报" />
  <meta name="theme-color" content="#0c0c0e" />
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&family=Noto+Serif+SC:wght@600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="${cssHref(depth)}" />
</head>
<body data-channel="ai">
  <header class="site-header">
    <div class="header-inner">
      <a class="logo" href="${homeHref(depth)}">
        <span class="logo-mark">A</span>
        <span>Alioxis News</span>
      </a>
      <div class="header-meta">
        <button type="button" class="timeline-toggle" id="timeline-toggle" aria-expanded="false" aria-controls="timeline-panel">浏览日期</button>
        <a class="header-archive" href="${archiveHref(depth)}">归档</a>
        <span class="header-tagline">三频道个人日报</span>
      </div>
    </div>
  </header>

  <nav class="tab-bar" aria-label="内容频道" role="tablist">
    <div class="tab-bar-inner">
      <button type="button" class="tab-btn active" role="tab" aria-selected="true" data-tab="ai" id="tab-ai">AI新闻</button>
      <button type="button" class="tab-btn" role="tab" aria-selected="false" data-tab="v" id="tab-v">大V视野</button>
      <button type="button" class="tab-btn tab-btn-aihot" role="tab" aria-selected="false" data-tab="aihot" id="tab-aihot">AIHOT日报</button>
    </div>
  </nav>

  <div class="layout">
    <div id="timeline-panel">${renderTimeline(days, activeDate, depth)}</div>
    <main class="main-panel">
      <header class="day-hero"
        id="day-meta"
        data-date="${escapeHtml(activeDate)}"
        data-date-label="${escapeHtml(dateLabel)}"
        data-ai-count="${aiItems.length}"
        data-v-count="${vItems.length}"
        data-aihot-count="${aihotItemCount || 0}"
        data-is-index="${isIndex ? "1" : "0"}">
        <p class="eyebrow" id="hero-eyebrow">${isIndex ? "今日热点" : "历史归档"}</p>
        <h1 id="hero-title">${isIndex ? "今日杂志" : escapeHtml(activeDate) + " 杂志"}</h1>
        <p class="sub" id="hero-sub">${escapeHtml(dateLabel)} · 共 ${aiItems.length} 条</p>
      </header>

      ${dedupeNote}
      ${renderToolbar(aiItems, vItems)}

      <section class="tab-panel active" data-tab="ai" role="tabpanel" aria-labelledby="tab-ai">
        <div class="card-grid">${aiCards}</div>
      </section>

      <section class="tab-panel" data-tab="v" role="tabpanel" aria-labelledby="tab-v" hidden>
        <div class="v-feed">${vCards}</div>
      </section>

      <section class="tab-panel" data-tab="aihot" role="tabpanel" aria-labelledby="tab-aihot" hidden>
        ${aihotHtml}
      </section>
    </main>
  </div>

  <footer class="site-footer">
    <span>Alioxis News · AI杂志 / 大V / AIHOT</span>
    <span><a href="${archiveHref(depth)}">日期归档</a> · <a href="https://github.com/czhmartinez/alioxis-news">GitHub</a> · NOTICE</span>
  </footer>
  <script src="${jsHref(depth)}" defer></script>
</body>
</html>
`;
}

function renderArchivePage(days) {
  const byMonth = new Map();
  for (const d of days) {
    const m = d.date.slice(0, 7);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m).push(d);
  }
  const sections = [...byMonth.entries()]
    .map(([month, list]) => {
      const cards = list
        .map((d) => {
          const label = formatDateZh(d.date);
          const aihot = d.aihotDaily
            ? `<span class="arch-badge">AIHOT</span>`
            : "";
          return `<a class="arch-day" href="../${escapeHtml(d.date)}/">
  <span class="arch-date">${escapeHtml(d.date)}</span>
  <span class="arch-meta">${escapeHtml(label)}</span>
  <span class="arch-counts">杂志 ${d.aiItems.length} · 大V ${d.vItems.length}${aihot}</span>
</a>`;
        })
        .join("\n");
      return `<section class="arch-month"><h2>${escapeHtml(month)}</h2><div class="arch-grid">${cards}</div></section>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#0c0c0e" />
  <title>日期归档 · Alioxis News</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;600;700&family=Noto+Serif+SC:wght@600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="../assets/styles.css" />
</head>
<body data-channel="archive">
  <header class="site-header">
    <div class="header-inner">
      <a class="logo" href="../index.html"><span class="logo-mark">A</span><span>Alioxis News</span></a>
      <div class="header-meta"><span>日期归档 · ${days.length} 天</span></div>
    </div>
  </header>
  <main class="archive-main">
    <header class="day-hero">
      <p class="eyebrow">History</p>
      <h1>日期归档</h1>
      <p class="sub">按月份浏览 · 共 ${days.length} 天</p>
    </header>
    ${sections || '<div class="empty-state"><p>暂无归档</p></div>'}
  </main>
  <footer class="site-footer">
    <span><a href="../index.html">返回今日</a></span>
    <span>Alioxis News</span>
  </footer>
</body>
</html>`;
}

function copyFileRecursive(src, dest) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    ensureDir(dest);
    for (const name of fs.readdirSync(src)) {
      copyFileRecursive(path.join(src, name), path.join(dest, name));
    }
  } else {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
  }
}

function copyAssets() {
  const dest = path.join(DIST_DIR, "assets");
  ensureDir(dest);
  if (!fs.existsSync(ASSETS_SRC)) return;
  for (const name of fs.readdirSync(ASSETS_SRC)) {
    copyFileRecursive(path.join(ASSETS_SRC, name), path.join(dest, name));
  }
}

function cleanDist() {
  if (fs.existsSync(DIST_DIR)) fs.rmSync(DIST_DIR, { recursive: true, force: true });
  ensureDir(DIST_DIR);
}

function writeArchiveIndexJson(days) {
  const payload = {
    generatedAt: new Date().toISOString(),
    count: days.length,
    days: days.map((d) => ({
      date: d.date,
      ai: d.aiItems.length,
      v: d.vItems.length,
      aihot: !!d.aihotDaily,
      aihotItems: d.aihotItemCount || 0,
    })),
  };
  fs.writeFileSync(path.join(DIST_DIR, "archive.json"), JSON.stringify(payload, null, 2), "utf8");
}

function main() {
  cleanDist();
  copyAssets();
  const days = loadDays();
  if (days.length === 0) {
    console.warn("No data day folders found.");
    fs.writeFileSync(
      path.join(DIST_DIR, "index.html"),
      renderPage({
        title: "Alioxis News",
        days: [],
        activeDate: "1970-01-01",
        aiItems: [],
        vItems: [],
        aihotDaily: null,
        aihotItemCount: 0,
        aiRawCount: 0,
        depth: 0,
        isIndex: true,
      }),
      "utf8"
    );
    return;
  }

  const latest = days[0];
  fs.writeFileSync(
    path.join(DIST_DIR, "index.html"),
    renderPage({
      title: `今日杂志 · Alioxis News`,
      days,
      activeDate: latest.date,
      aiItems: latest.aiItems,
      vItems: latest.vItems,
      aihotDaily: latest.aihotDaily,
      aihotItemCount: latest.aihotItemCount,
      aiRawCount: latest.aiRawCount,
      depth: 0,
      isIndex: true,
    }),
    "utf8"
  );

  for (const day of days) {
    const dir = path.join(DIST_DIR, day.date);
    ensureDir(dir);
    fs.writeFileSync(
      path.join(dir, "index.html"),
      renderPage({
        title: `${day.date} · Alioxis News`,
        days,
        activeDate: day.date,
        aiItems: day.aiItems,
        vItems: day.vItems,
        aihotDaily: day.aihotDaily,
        aihotItemCount: day.aihotItemCount,
        aiRawCount: day.aiRawCount,
        depth: 1,
        isIndex: day.date === latest.date,
      }),
      "utf8"
    );
    console.log(
      `  ✓ ${day.date}/ (杂志 ${day.aiItems.length}/${day.aiRawCount} · 大V ${day.vItems.length} · AIHOT ${day.aihotItemCount})`
    );
  }

  const archDir = path.join(DIST_DIR, "archive");
  ensureDir(archDir);
  fs.writeFileSync(path.join(archDir, "index.html"), renderArchivePage(days), "utf8");
  writeArchiveIndexJson(days);
  console.log(`\nBuilt ${days.length} day(s) + 3 channels → ${DIST_DIR}`);
}

main();
