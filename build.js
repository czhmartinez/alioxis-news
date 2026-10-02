#!/usr/bin/env node
/**
 * Alioxis News — static site generator
 * Data scheme:
 *   data/YYYY-MM-DD/ai.json  — AI新闻 (public digest)
 *   data/YYYY-MM-DD/v.json   — 大V视野 (X following timeline)
 *   data/YYYY-MM-DD/_aihot_daily.json — optional AIHOT 日报 (MIT-attributed strip)
 * Legacy: data/YYYY-MM-DD.json treated as AI新闻.
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
  if (!raw || typeof raw !== "object") return null;
  return raw;
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

      return { date, aiItems, vItems, aihotDaily };
    });
}

function formatDateZh(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  const dt = new Date(Date.UTC(y, m - 1, d));
  const w = weekdays[dt.getUTCDay()];
  return `${y}年${m}月${d}日 · 周${w}`;
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
  if (depth === 1) return `../${date}/`;
  return `../`.repeat(depth - 1) + `${date}/`;
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

function isAihotItem(item) {
  const blob = [
    item.source,
    item.source_handle,
    item.url,
    ...(Array.isArray(item.tags) ? item.tags : []),
  ]
    .join(" ")
    .toLowerCase();
  return blob.includes("aihot");
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
    ${items || "<li><span style=\"color:var(--text-dim);font-size:0.85rem\">暂无归档</span></li>"}
  </ul>
</aside>`;
}

function renderCard(item) {
  const title = escapeHtml(item.title || "无标题");
  const summary = escapeHtml(item.summary || "");
  const url = escapeHtml(item.url || "#");
  const source = escapeHtml(item.source || "未知来源");
  const handle = escapeHtml(item.source_handle || "");
  const tags = Array.isArray(item.tags) ? item.tags : [];
  const tagHtml = tags
    .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
    .join("");
  const avatar = initials(item.source);
  const media = item.image
    ? `<div class="card-media"><img src="${escapeHtml(item.image)}" alt="" loading="lazy" decoding="async" /></div>`
    : `<div class="card-media"><div class="cover-fallback" aria-hidden="true"><span>${escapeHtml(initials(item.title || item.source || "AI"))}</span></div></div>`;
  const searchBlob = escapeHtml(
    [item.title, item.summary, item.source, item.source_handle, ...tags]
      .filter(Boolean)
      .join(" ")
  );
  const tagsAttr = escapeHtml(tags.join("|"));
  const aihotBadge = isAihotItem(item)
    ? `<span class="aihot-badge" title="数据来源含 AIHOT">AIHOT</span>`
    : "";

  return `
<article class="card" data-search="${searchBlob}" data-tags="${tagsAttr}">
  <a class="card-link" href="${url}" target="_blank" rel="noopener noreferrer">
    ${media}
    <div class="card-body">
      ${tagHtml || aihotBadge ? `<div class="card-tags">${tagHtml}${aihotBadge}</div>` : ""}
      <h2 class="card-title">${title}</h2>
      ${summary ? `<p class="card-summary">${summary}</p>` : ""}
      <div class="card-footer">
        <div class="source-avatar" aria-hidden="true">${escapeHtml(avatar)}</div>
        <div class="source-info">
          <div class="source-name">来源 ${source}</div>
          ${handle ? `<div class="source-handle">${handle}</div>` : ""}
        </div>
        <span class="ext-hint">外链 ↗</span>
      </div>
    </div>
  </a>
</article>`;
}

function renderCards(items, emptyHtml) {
  if (!items.length) return emptyHtml;
  return items.map(renderCard).join("\n");
}

function renderAihotStrip(daily) {
  if (!daily) return "";
  const leadTitle =
    (daily.lead && (daily.lead.title || daily.lead.leadTitle)) ||
    daily.leadTitle ||
    "";
  const leadPara =
    (daily.lead && (daily.lead.leadParagraph || daily.lead.summary)) ||
    daily.leadParagraph ||
    "";
  const canonical =
    (daily.attribution && daily.attribution.canonical) ||
    (daily.attribution && daily.attribution.url) ||
    (daily.date ? `https://aihot.news/daily/${daily.date}` : "https://aihot.news/");
  const sections = Array.isArray(daily.sections) ? daily.sections : [];
  const flashes = Array.isArray(daily.flashes) ? daily.flashes : [];
  const sectionChips = sections
    .map((s) => {
      const label = s.label || s.title || s.name || "分区";
      const n = Array.isArray(s.items) ? s.items.length : 0;
      return `<span class="aihot-chip">${escapeHtml(label)} · ${n}</span>`;
    })
    .join("");
  const flashHtml = flashes
    .slice(0, 6)
    .map((f) => {
      const href = escapeHtml(f.permalink || f.sourceUrl || canonical);
      const t = escapeHtml(f.title || "");
      return `<li><a href="${href}" target="_blank" rel="noopener noreferrer">${t}</a></li>`;
    })
    .join("");

  if (!leadTitle && !sections.length) return "";

  return `
<section class="aihot-strip" id="aihot-strip" aria-label="AIHOT 今日日报">
  <div class="aihot-strip-head">
    <div>
      <p class="aihot-kicker">今日日报 · AIHOT</p>
      <h2 class="aihot-lead-title">${escapeHtml(leadTitle || "AIHOT 日报")}</h2>
      ${leadPara ? `<p class="aihot-lead-para">${escapeHtml(leadPara)}</p>` : ""}
    </div>
    <a class="aihot-cta" href="${escapeHtml(canonical)}" target="_blank" rel="noopener noreferrer">在 AIHOT 阅读 ↗</a>
  </div>
  ${sectionChips ? `<div class="aihot-chips">${sectionChips}</div>` : ""}
  ${flashHtml ? `<ul class="aihot-flashes">${flashHtml}</ul>` : ""}
  <p class="aihot-attr">数据来源：<a href="https://aihot.news/" target="_blank" rel="noopener noreferrer">AIHOT</a>（卡兹克开源框架 · 个人非商业引用）· 原文版权归原作者</p>
</section>`;
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

function renderPage({ title, days, activeDate, aiItems, vItems, aihotDaily, depth, isIndex }) {
  const dateLabel = formatDateZh(activeDate);
  const emptyAi = `<div class="empty-state"><p>这一天还没有收录内容。</p></div>`;
  const emptyV = `<div class="empty-state"><p>暂无关注流内容，登录 X 后将自动更新</p></div>`;
  const aiCards = renderCards(aiItems, emptyAi);
  const vCards = renderCards(vItems, emptyV);
  const aihotStrip = renderAihotStrip(aihotDaily);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="description" content="Alioxis News — AI 每日新闻与大V视野" />
  <meta name="theme-color" content="#0c0c0e" />
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;600;700&family=Noto+Serif+SC:wght@600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="${cssHref(depth)}" />
</head>
<body>
  <header class="site-header">
    <div class="header-inner">
      <a class="logo" href="${homeHref(depth)}">
        <span class="logo-mark">A</span>
        <span>Alioxis News</span>
      </a>
      <div class="header-meta">
        <button type="button" class="timeline-toggle" id="timeline-toggle" aria-expanded="false" aria-controls="timeline-panel">浏览日期</button>
        <a class="header-archive" href="${archiveHref(depth)}">归档</a>
        <span class="header-tagline">AI 每日摘要 · 大V视野</span>
      </div>
    </div>
  </header>

  <nav class="tab-bar" aria-label="内容频道" role="tablist">
    <div class="tab-bar-inner">
      <button type="button" class="tab-btn active" role="tab" aria-selected="true" data-tab="ai" id="tab-ai">AI新闻</button>
      <button type="button" class="tab-btn" role="tab" aria-selected="false" data-tab="v" id="tab-v">大V视野</button>
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
        data-is-index="${isIndex ? "1" : "0"}">
        <p class="eyebrow" id="hero-eyebrow">${isIndex ? "今日热点" : "历史归档"}</p>
        <h1 id="hero-title">${isIndex ? "今日热点" : escapeHtml(activeDate) + " 热点"}</h1>
        <p class="sub" id="hero-sub">${escapeHtml(dateLabel)} · 共 ${aiItems.length} 条</p>
      </header>

      ${aihotStrip}
      ${renderToolbar(aiItems, vItems)}

      <section class="tab-panel active" data-tab="ai" role="tabpanel" aria-labelledby="tab-ai" aria-label="AI新闻">
        <div class="card-grid">
          ${aiCards}
        </div>
      </section>

      <section class="tab-panel" data-tab="v" role="tabpanel" aria-labelledby="tab-v" aria-label="大V视野" hidden>
        <div class="card-grid">
          ${vCards}
        </div>
      </section>
    </main>
  </div>

  <footer class="site-footer">
    <span>Alioxis News · Flipboard 风格静态杂志</span>
    <span><a href="${archiveHref(depth)}">日期归档</a> · 致谢见 NOTICE · 数据不发明</span>
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
  const months = [...byMonth.entries()];
  const sections = months
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
  <span class="arch-counts">AI ${d.aiItems.length} · 大V ${d.vItems.length}${aihot}</span>
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
<body>
  <header class="site-header">
    <div class="header-inner">
      <a class="logo" href="../index.html">
        <span class="logo-mark">A</span>
        <span>Alioxis News</span>
      </a>
      <div class="header-meta"><span>日期归档 · ${days.length} 天</span></div>
    </div>
  </header>
  <main class="archive-main">
    <header class="day-hero">
      <p class="eyebrow">History</p>
      <h1>日期归档</h1>
      <p class="sub">按月份浏览历史日报 · 共 ${days.length} 天</p>
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
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
  }
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
    })),
  };
  fs.writeFileSync(
    path.join(DIST_DIR, "archive.json"),
    JSON.stringify(payload, null, 2),
    "utf8"
  );
}

function main() {
  cleanDist();
  copyAssets();

  const days = loadDays();
  if (days.length === 0) {
    console.warn("No data day folders found. Generating empty index.");
    const html = renderPage({
      title: "Alioxis News",
      days: [],
      activeDate: "1970-01-01",
      aiItems: [],
      vItems: [],
      aihotDaily: null,
      depth: 0,
      isIndex: true,
    });
    fs.writeFileSync(path.join(DIST_DIR, "index.html"), html, "utf8");
    console.log(`\nBuilt empty site → ${DIST_DIR}`);
    return;
  }

  const latest = days[0];

  const indexHtml = renderPage({
    title: `今日热点 · Alioxis News`,
    days,
    activeDate: latest.date,
    aiItems: latest.aiItems,
    vItems: latest.vItems,
    aihotDaily: latest.aihotDaily,
    depth: 0,
    isIndex: true,
  });
  fs.writeFileSync(path.join(DIST_DIR, "index.html"), indexHtml, "utf8");

  for (const day of days) {
    const dir = path.join(DIST_DIR, day.date);
    ensureDir(dir);
    const html = renderPage({
      title: `${day.date} · Alioxis News`,
      days,
      activeDate: day.date,
      aiItems: day.aiItems,
      vItems: day.vItems,
      aihotDaily: day.aihotDaily,
      depth: 1,
      isIndex: day.date === latest.date,
    });
    fs.writeFileSync(path.join(dir, "index.html"), html, "utf8");
    console.log(
      `  ✓ ${day.date}/ (AI ${day.aiItems.length} · 大V ${day.vItems.length}${day.aihotDaily ? " · AIHOT日报" : ""})`
    );
  }

  const archDir = path.join(DIST_DIR, "archive");
  ensureDir(archDir);
  fs.writeFileSync(path.join(archDir, "index.html"), renderArchivePage(days), "utf8");
  writeArchiveIndexJson(days);

  console.log(`\nBuilt ${days.length} day(s) + archive → ${DIST_DIR}`);
  console.log(`Open: ${path.join(DIST_DIR, "index.html")}`);
}

main();
