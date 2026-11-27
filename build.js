#!/usr/bin/env node
/**
 * Alioxis News — static site generator
 * Channels:
 *   ai / v / aihot / weekly / creators / topics / flash
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

function countAihotItems(daily) {
  if (!daily) return 0;
  let n = 0;
  for (const s of daily.sections || []) n += (s.items || []).length;
  n += (daily.flashes || []).length;
  return n;
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
        aiRaw: aiItems,
        aiRawCount: aiItems.length,
        vItems,
        aihotDaily,
        aihotItemCount: countAihotItems(aihotDaily),
      };
    });
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
  return Array.from(s)[0] || "?";
}

function cssHref(depth) {
  return "../".repeat(depth) + "assets/styles.css?v=20261106r2";
}
function jsHref(depth) {
  return "../".repeat(depth) + "assets/app.js?v=20261106r2";
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

/** Build title→image map from nearby days' ai.json (+ v.json) for AIHOT covers */
function buildCoverIndex(days, aroundDate) {
  const idx = days.findIndex((d) => d.date === aroundDate);
  const window =
    idx < 0
      ? days.slice(0, 5)
      : days.slice(Math.max(0, idx - 1), Math.min(days.length, idx + 4));
  const byNorm = new Map();
  const byUrl = new Map();
  for (const d of window) {
    for (const it of [...(d.aiRaw || d.aiItems || []), ...(d.vItems || [])]) {
      if (!it || !it.image) continue;
      const n = normalizeTitle(it.title);
      if (n.length >= 8 && !byNorm.has(n)) byNorm.set(n, it.image);
      if (it.url) byUrl.set(String(it.url).replace(/\/$/, ""), it.image);
    }
  }
  return { byNorm, byUrl };
}

function matchCover(item, coverIndex) {
  if (!item) return "";
  if (item.image) return item.image;
  if (item.cover) return item.cover;
  if (item.ogImage) return item.ogImage;
  const srcUrl = (item.sourceUrl || item.url || "").replace(/\/$/, "");
  if (srcUrl && coverIndex.byUrl.has(srcUrl)) return coverIndex.byUrl.get(srcUrl);
  const n = normalizeTitle(item.title);
  if (n.length < 8) return "";
  if (coverIndex.byNorm.has(n)) return coverIndex.byNorm.get(n);
  for (const [k, img] of coverIndex.byNorm) {
    if (n.includes(k.slice(0, 12)) || k.includes(n.slice(0, 12))) return img;
  }
  return "";
}

function aihotItemHref(it, fallback) {
  return (
    it.sourceUrl ||
    it.url ||
    it.link ||
    (it.attribution && (it.attribution.canonical || it.attribution.url)) ||
    it.permalink ||
    fallback ||
    "#"
  );
}

/* —— Aggregates for extra modules —— */
function buildWeekly(days, endDate, windowDays = 7) {
  const idx = days.findIndex((d) => d.date === endDate);
  const start = idx < 0 ? 0 : idx;
  return days.slice(start, start + windowDays).map((d) => ({
    date: d.date,
    label: formatDateZh(d.date),
    ai: d.aiItems,
    v: d.vItems,
    aihot: d.aihotItemCount || 0,
  }));
}

function buildCreators(days) {
  const map = new Map();
  for (const d of days) {
    for (const it of d.vItems || []) {
      const key = String(it.source_handle || it.source || "")
        .trim()
        .toLowerCase();
      if (!key) continue;
      let c = map.get(key);
      if (!c) {
        c = {
          name: it.source || it.source_handle || key,
          handle: it.source_handle || "",
          count: 0,
          tags: new Map(),
          latest: null,
          days: new Set(),
        };
        map.set(key, c);
      }
      c.count++;
      c.days.add(d.date);
      for (const t of it.tags || []) {
        const tk = String(t).trim();
        if (tk) c.tags.set(tk, (c.tags.get(tk) || 0) + 1);
      }
      const stamp = it.published_at || d.date;
      if (!c.latest || stamp > (c.latest.published_at || c.latest.day || "")) {
        c.latest = { ...it, day: d.date, published_at: stamp };
      }
    }
  }
  return [...map.values()]
    .map((c) => ({
      name: c.name,
      handle: c.handle,
      count: c.count,
      dayCount: c.days.size,
      topTags: [...c.tags.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([t]) => t),
      latest: c.latest,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh"));
}

const TOPIC_BOARD = [
  { id: "模型", match: ["模型", "GPT", "Claude", "Gemini", "LLM", "Astra", "DeepSeek"] },
  { id: "安全", match: ["安全", "AI安全", "对齐", "红队", "越狱"] },
  { id: "开源", match: ["开源", "Open-Source", "开源模型"] },
  { id: "智能体", match: ["智能体", "Agent", "Agents", "代理"] },
  { id: "基础设施", match: ["基础设施", "推理", "GPU", "集群", "API"] },
];

function buildTopics(days, dayLimit = 14) {
  const boards = TOPIC_BOARD.map((b) => ({
    id: b.id,
    match: b.match.map((m) => m.toLowerCase()),
    items: [],
  }));
  const seen = new Set();
  for (const d of days.slice(0, dayLimit)) {
    for (const [channel, list] of [
      ["ai", d.aiItems || []],
      ["v", d.vItems || []],
    ]) {
      for (const it of list) {
        const tags = (it.tags || []).map((t) => String(t).toLowerCase());
        const hay = `${it.title || ""} ${(it.tags || []).join(" ")}`.toLowerCase();
        for (const board of boards) {
          const hit = board.match.some(
            (m) => tags.some((t) => t.includes(m) || m.includes(t)) || hay.includes(m.toLowerCase())
          );
          if (!hit) continue;
          const key = `${board.id}|${normalizeTitle(it.title)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          board.items.push({ ...it, day: d.date, channel });
          break;
        }
      }
    }
  }
  return boards
    .map((b) => ({ id: b.id, count: b.items.length, items: b.items.slice(0, 12) }))
    .filter((b) => b.count > 0);
}

function buildFlash(days, limit = 60) {
  limit = Math.max(limit, 60);
  const items = [];
  const seen = new Set();
  for (const d of days.slice(0, 7)) {
    const rows = [
      ...(d.aiRaw || d.aiItems || []).map((it) => ({ ...it, channel: "ai", day: d.date })),
      ...(d.vItems || []).map((it) => ({ ...it, channel: "v", day: d.date })),
    ];
    for (const it of rows) {
      const k = normalizeTitle(it.title);
      if (k.length < 6 || seen.has(k)) continue;
      seen.add(k);
      items.push({ title: it.title, source: it.source, url: it.url, day: it.day, channel: it.channel, stamp: it.published_at || "" });
      if (items.length >= limit) return items;
    }
  }
  return items;
}

/* ───────────────────────── Render layer (editorial redesign) ───────────────────────── */

/** "/assets/x.jpg" → relative to the current page depth so dist works under any base path */
function assetUrl(p, depth) {
  const s = String(p || "");
  if (!s) return "";
  if (/^(https?:)?\/\//.test(s) || s.startsWith("data:")) return s;
  return "../".repeat(depth || 0) + s.replace(/^\//, "");
}

function hhmm(iso) {
  const m = String(iso || "").match(/T(\d{2}:\d{2})/);
  return m ? m[1] : "";
}

function img(src, depth, cls = "") {
  return `<img${cls ? ` class="${cls}"` : ""} src="${escapeHtml(assetUrl(src, depth))}" alt="" loading="lazy" decoding="async" />`;
}

const THEME_BOOT = `(function(){try{var t=localStorage.getItem("ainews-theme");if(t)document.documentElement.setAttribute("data-theme",t)}catch(e){}})();`;

function renderHead(title, depth, desc) {
  return `<meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="description" content="${escapeHtml(desc || "Alioxis News — 每日 AI 要闻、大V观点、AIHOT 日报")}" />
  <meta name="color-scheme" content="light dark" />
  <meta name="theme-color" content="#f7f5f0" media="(prefers-color-scheme: light)" />
  <meta name="theme-color" content="#121212" media="(prefers-color-scheme: dark)" />
  <title>${escapeHtml(title)}</title>
  <script>${THEME_BOOT}</script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@600;700;900&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="${cssHref(depth)}" />`;
}

function renderDayBar(days, activeDate, depth) {
  const i = Math.max(0, days.findIndex((d) => d.date === activeDate));
  const start = Math.max(0, Math.min(i - 4, days.length - 10));
  const wk = ["日", "一", "二", "三", "四", "五", "六"];
  const chips = days
    .slice(start, start + 10)
    .map((d) => {
      const [y, m, dd] = d.date.split("-").map(Number);
      const w = wk[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()];
      const on = d.date === activeDate ? " active" : "";
      const latest = d.date === days[0].date ? " is-latest" : "";
      return `<a class="day-chip date-link${on}${latest}" href="${dayHref(d.date, depth)}" data-date="${escapeHtml(d.date)}" ${on ? 'aria-current="date"' : ""}><b>${m}/${dd}</b><span>周${w}</span></a>`;
    })
    .join("");
  const newer = days[i - 1];
  const older = days[i + 1];
  const step = (d, label, cls) =>
    d
      ? `<a class="day-step date-link ${cls}" href="${dayHref(d.date, depth)}" data-date="${escapeHtml(d.date)}" rel="${cls === "prev" ? "prev" : "next"}">${label}</a>`
      : `<span class="day-step is-off ${cls}">${label}</span>`;
  return `<nav class="daybar" aria-label="按日期浏览">
    ${step(older, "‹ 前一天", "prev")}
    <div class="day-chips">${chips}</div>
    ${step(newer, "后一天 ›", "next")}
  </nav>`;
}

/* —— 要闻 —— */
function renderStory(item, depth) {
  const tags = (Array.isArray(item.tags) ? item.tags : []).slice(0, 3);
  const time = hhmm(item.published_at);
  const media = item.image ? `<div class="story-media">${img(item.image, depth)}</div>` : "";
  return `
<article class="story${item.image ? "" : " no-media"}" data-search="${searchAttr([item.title, item.summary, item.source, item.source_handle, ...(item.tags || [])])}" data-tags="${escapeHtml((item.tags || []).join("|"))}">
  <a class="story-link" href="${escapeHtml(item.url || "#")}" target="_blank" rel="noopener noreferrer">
    ${media}
    <div class="story-body">
      <p class="kicker"><span class="kicker-src">${escapeHtml(item.source || "未知来源")}</span>${time ? `<time>${time}</time>` : ""}</p>
      <h2 class="story-title">${escapeHtml(item.title || "无标题")}</h2>
      ${item.summary ? `<p class="story-sum">${escapeHtml(item.summary)}</p>` : ""}
      ${tags.length ? `<p class="story-tags">${tags.map((t) => `<span>${escapeHtml(t)}</span>`).join("")}</p>` : ""}
    </div>
  </a>
</article>`;
}

function renderToolbar(aiItems, vItems) {
  const aiTags = topTags(aiItems, 10);
  const vTags = topTags(vItems, 10);
  return `
<div class="toolbar" id="reader-toolbar" data-ai-tags="${escapeHtml(aiTags.join("|"))}" data-v-tags="${escapeHtml(vTags.join("|"))}">
  <div class="search-row">
    <input id="search-input" class="search-input" type="search" placeholder="搜索标题、摘要、来源…" aria-label="搜索" autocomplete="off" enterkeyhint="search" />
    <span class="filter-count" id="filter-count" aria-live="polite"></span>
  </div>
  <div class="chip-row filter-chips" role="group" aria-label="分类筛选">
    <button type="button" class="chip filter-chip active" data-tag="*">全部</button>${aiTags
      .map((t) => `<button type="button" class="chip filter-chip" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`)
      .join("")}
  </div>
  <p class="filter-empty" hidden>没有匹配的条目，试试清空搜索或换个标签。</p>
</div>`;
}

/* ───────────── Information architecture ─────────────
   Streams  (parallel: four kinds of content, each with its own form)
     要闻  → magazine front page          快讯 → wire / timeline
     大V   → voices feed + author rail    简报 → newsletter column (日报 / 周报)
   Indexes  (parallel: ways into the whole corpus)
     专题 → topic boards     人物 → roster     归档 → by date
*/
const STREAMS = [["ai", "要闻"], ["flash", "快讯"], ["v", "大V视野"], ["digest", "简报"]];
const INDEXES = [["topics", "专题"], ["creators", "人物"]];

function shortDay(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const w = "日一二三四五六"[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return { md: `${m}/${d}`, label: `${m}月${d}日 周${w}`, wk: `周${w}` };
}
function authorKey(it) {
  return String(it.source_handle || it.source || "").trim().toLowerCase();
}

function renderMasthead(depth, dateLabel) {
  return `<header class="masthead">
    <div class="mast-bar">
      <span class="mast-date">${escapeHtml(dateLabel)}</span>
      <span class="mast-tools">
        <button type="button" class="icon-btn" id="theme-toggle" aria-label="切换明暗主题" title="切换明暗主题"><span aria-hidden="true">◐</span></button>
      </span>
    </div>
    <a class="wordmark" href="${homeHref(depth)}">Alioxis<em>News</em></a>
    <p class="tagline">每日 AI 要闻 · 大V观点 · 日报精选</p>
  </header>`;
}

/* —— 大V：观点流 + 作者栏 —— */
function renderPost(item, depth) {
  const tags = (Array.isArray(item.tags) ? item.tags : []).slice(0, 4);
  const time = item.published_at ? String(item.published_at).replace("T", " ").slice(5, 16) : "";
  return `
<article class="post" data-author="${escapeHtml(authorKey(item))}" data-search="${searchAttr([item.title, item.summary, item.source, item.source_handle, ...(item.tags || [])])}" data-tags="${escapeHtml((item.tags || []).join("|"))}">
  <a class="post-link" href="${escapeHtml(item.url || "#")}" target="_blank" rel="noopener noreferrer">
    <span class="avatar" aria-hidden="true">${escapeHtml(initials(item.source))}</span>
    <div class="post-main">
      <p class="post-meta"><strong>${escapeHtml(item.source || "未知")}</strong>${item.source_handle ? `<span>${escapeHtml(item.source_handle)}</span>` : ""}${time ? `<time>${escapeHtml(time)}</time>` : ""}</p>
      <h2 class="post-title">${escapeHtml(item.title || "无标题")}</h2>
      ${item.summary ? `<p class="post-text">${escapeHtml(item.summary)}</p>` : ""}
      ${item.image ? `<div class="post-media">${img(item.image, depth)}</div>` : ""}
      ${tags.length ? `<p class="story-tags">${tags.map((t) => `<span>${escapeHtml(t)}</span>`).join("")}</p>` : ""}
    </div>
  </a>
</article>`;
}

function renderVoices(vItems, depth) {
  if (!vItems.length) return `<div class="empty-state"><p>暂无关注流内容</p></div>`;
  const map = new Map();
  for (const it of vItems) {
    const k = authorKey(it);
    if (!k) continue;
    const a = map.get(k) || { key: k, name: it.source || it.source_handle || k, n: 0 };
    a.n++;
    map.set(k, a);
  }
  const authors = [...map.values()].sort((a, b) => b.n - a.n);
  const rail = authors
    .map((a) => `<button type="button" class="voice-author" data-author="${escapeHtml(a.key)}"><span class="avatar" aria-hidden="true">${escapeHtml(initials(a.name))}</span><span class="va-name">${escapeHtml(a.name)}</span><span class="va-n">${a.n}</span></button>`)
    .join("");
  return `<div class="voices">
  <aside class="voice-rail" aria-label="本日发声者">
    <p class="rail-title">本日发声 · ${authors.length} 位</p>
    <div class="rail-list">${rail}</div>
    <button type="button" class="rail-more" data-goto="creators">全部作者 →</button>
  </aside>
  <div class="post-list">${vItems.map((it) => renderPost(it, depth)).join("\n")}</div>
</div>`;
}

/* —— 简报：像一封订阅邮件 —— */
const ZH_NUM = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

function renderLetterItem(it, canonical, n) {
  return `
<article class="letter-item" data-search="${searchAttr([it.title, it.summary, it.sourceName])}">
  <a href="${escapeHtml(aihotItemHref(it, canonical))}" target="_blank" rel="noopener noreferrer">
    <span class="li-n">${String(n).padStart(2, "0")}</span>
    <div>
      <h3>${escapeHtml(it.title || "无标题")}</h3>
      ${it.summary ? `<p>${escapeHtml(it.summary)}</p>` : ""}
      <p class="kicker"><span class="kicker-src">${escapeHtml(it.sourceName || it.source || "来源")}</span><span class="cta">原文 ↗</span></p>
    </div>
  </a>
</article>`;
}

function renderDailyView(daily, coverIndex, depth) {
  if (!daily) {
    return `<div class="empty-state"><p>本日没有 AIHOT 日报。</p><p class="muted-note">可切换到「周报」回顾近七日，或运行 <code>node scripts/fetch-aihot-daily.js</code> 拉取。</p></div>`;
  }
  const lead = daily.lead || {};
  const leadTitle = lead.title || lead.leadTitle || daily.leadTitle || "AIHOT 日报";
  const leadPara = lead.leadParagraph || lead.summary || daily.leadParagraph || "";
  const canonical =
    (daily.attribution && (daily.attribution.canonical || daily.attribution.url)) ||
    (daily.date ? `https://aihot.news/daily/${daily.date}` : "https://aihot.news/");
  const leadCover = matchCover({ title: leadTitle, sourceUrl: canonical }, coverIndex);
  let n = 0;
  const sections = (daily.sections || [])
    .map((s, i) => {
      const items = (s.items || []).map((it) => renderLetterItem(it, canonical, ++n)).join("\n");
      return `<section class="letter-section">
  <h2><b>${ZH_NUM[i] || i + 1}、</b>${escapeHtml(s.label || s.title || "分区")}</h2>
  ${items}
</section>`;
    })
    .join("\n");
  const flashes = (daily.flashes || [])
    .map((f) => `<li><a href="${escapeHtml(aihotItemHref(f, canonical))}" target="_blank" rel="noopener noreferrer"><span>${escapeHtml(f.title || "")}</span><em>${escapeHtml(f.sourceName || "")}</em></a></li>`)
    .join("\n");
  const fi = (daily.sections || []).length;
  return `
<header class="letter-head">
  <p class="eyebrow">AIHOT · 数字生命卡兹克 · ${escapeHtml(daily.date || "")}</p>
  <h2>${escapeHtml(leadTitle)}</h2>
  ${leadCover ? `<div class="letter-media">${img(leadCover, depth)}</div>` : ""}
  ${leadPara ? `<p class="lede">${escapeHtml(leadPara)}</p>` : ""}
</header>
${sections}
${flashes ? `<section class="letter-section"><h2><b>${ZH_NUM[fi] || fi + 1}、</b>快讯</h2><ul class="brief-list">${flashes}</ul></section>` : ""}
<p class="credit">数据来源：<a href="${escapeHtml(canonical)}" target="_blank" rel="noopener noreferrer">AIHOT</a>（开源框架 MIT）· 个人非商业引用 · 第三方原文版权归原作者 · 见 NOTICE</p>`;
}

function renderWeeklyView(weekly) {
  if (!weekly.length) return `<div class="empty-state"><p>暂无周报数据</p></div>`;
  const li = (it) => `<li><a href="${escapeHtml(it.url || "#")}" target="_blank" rel="noopener noreferrer">${escapeHtml(it.title || "")}</a><span>${escapeHtml(it.source || "")}</span></li>`;
  const rows = weekly
    .map((d) => {
      const s = shortDay(d.date);
      return `<section class="wk-row" data-search="${searchAttr([d.date, d.label])}">
  <div class="wk-date"><b>${s.md}</b><span>${s.wk}</span></div>
  <div class="wk-body">
    <h4>要闻 · ${d.ai.length}</h4><ul>${d.ai.slice(0, 4).map(li).join("") || '<li class="muted-note">无</li>'}</ul>
    <h4>大V · ${d.v.length}</h4><ul>${d.v.slice(0, 3).map(li).join("") || '<li class="muted-note">无</li>'}</ul>
  </div>
</section>`;
    })
    .join("\n");
  const range = `${shortDay(weekly[weekly.length - 1].date).md} – ${shortDay(weekly[0].date).md}`;
  return `<header class="letter-head"><p class="eyebrow">Week in review · ${escapeHtml(range)}</p><h2>近七日回顾</h2></header>${rows}`;
}

function renderDigestPanel(daily, weekly, coverIndex, depth) {
  return `<div class="seg-wrap"><div class="seg" role="group" aria-label="简报类型">
    <button type="button" class="seg-btn active" data-view="daily">日报</button>
    <button type="button" class="seg-btn" data-view="weekly">周报</button>
  </div></div>
  <div class="letter">
    <div class="digest-view" data-view="daily">${renderDailyView(daily, coverIndex, depth)}</div>
    <div class="digest-view" data-view="weekly" hidden>${renderWeeklyView(weekly)}</div>
  </div>`;
}

/* —— 专题：分栏看板 —— */
function renderTopicsPanel(topics) {
  if (!topics.length) return `<div class="empty-state"><p>暂无专题数据</p></div>`;
  const boards = topics
    .map((b) => {
      const rows = b.items
        .map((it, i) => `<a class="topic-item${i >= 5 ? " is-extra" : ""}" href="${escapeHtml(it.url || "#")}" target="_blank" rel="noopener noreferrer" data-search="${searchAttr([it.title, it.source, b.id])}">
  <span class="ti-title">${escapeHtml(it.title || "")}</span>
  <em>${escapeHtml(shortDay(it.day).md)} · ${it.channel === "v" ? "大V" : "要闻"} · ${escapeHtml(it.source || "")}</em>
</a>`)
        .join("\n");
      return `<section class="board">
  <header><h2>${escapeHtml(b.id)}</h2><span class="board-n">${b.count} 条</span></header>
  <div class="board-list">${rows}</div>
  ${b.items.length > 5 ? `<button type="button" class="board-more" data-more="${b.items.length}">展开全部 ${b.items.length} 条</button>` : ""}
</section>`;
    })
    .join("\n");
  return `<div class="boards">${boards}</div>`;
}

/* —— 人物：名册 —— */
function renderCreatorsPanel(creators) {
  if (!creators.length) return `<div class="empty-state"><p>暂无创作者数据</p></div>`;
  const max = Math.max(...creators.map((c) => c.count), 1);
  const cards = creators
    .map((c) => {
      const l = c.latest || {};
      return `<article class="person" data-search="${searchAttr([c.name, c.handle, ...(c.topTags || [])])}">
  <div class="person-head">
    <span class="avatar avatar-lg" aria-hidden="true">${escapeHtml(initials(c.name))}</span>
    <div><h3>${escapeHtml(c.name)}</h3>${c.handle ? `<p class="handle">${escapeHtml(c.handle)}</p>` : ""}</div>
  </div>
  <div class="person-bar" aria-hidden="true"><i style="width:${Math.max(6, Math.round((c.count / max) * 100))}%"></i></div>
  <p class="creator-stats">${c.count} 帖 · 活跃 ${c.dayCount} 天</p>
  ${(c.topTags || []).length ? `<p class="story-tags">${c.topTags.map((t) => `<span>${escapeHtml(t)}</span>`).join("")}</p>` : ""}
  ${l.title ? `<a class="person-latest" href="${escapeHtml(l.url || "#")}" target="_blank" rel="noopener noreferrer"><b>最新</b>${escapeHtml(l.title)}</a>` : ""}
</article>`;
    })
    .join("\n");
  return `<div class="roster">${cards}</div>`;
}

/* —— 快讯：按时间倒序的电讯流 —— */
function renderFlashPanel(items) {
  if (!items.length) return `<div class="empty-state"><p>暂无快讯</p></div>`;
  // group by the real publish date so times descend cleanly inside each group
  const byDay = new Map();
  for (const it of items) {
    const key = /^\d{4}-\d{2}-\d{2}/.test(it.stamp || "") ? it.stamp.slice(0, 10) : it.day;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(it);
  }
  const days = [...byDay.entries()]
    .sort((x, y) => y[0].localeCompare(x[0]))
    .map(([day, rows]) => {
      rows.sort((a, b) => String(b.stamp || "").localeCompare(String(a.stamp || "")));
      const lis = rows
        .map((it) => `<li class="wire-row" data-search="${searchAttr([it.title, it.source, it.day])}">
  <time>${escapeHtml(hhmm(it.stamp) || "—")}</time>
  <div class="wire-main"><a class="wire-title" href="${escapeHtml(it.url || "#")}" target="_blank" rel="noopener noreferrer">${escapeHtml(it.title || "")}</a><em>${it.channel === "v" ? "大V · " : ""}${escapeHtml(it.source || "")}</em></div>
</li>`)
        .join("\n");
      return `<section class="wire-day"><h2 class="wire-day-head">${escapeHtml(shortDay(day).label)}<em>${rows.length} 条</em></h2><ol class="wire-list">${lis}</ol></section>`;
    })
    .join("\n");
  return `<div class="wire">${days}</div>`;
}

function renderPage({
  title, days, activeDate, aiItems, vItems, aihotDaily, aihotItemCount, aiRawCount,
  weekly, creators, topics, flashItems, coverIndex, depth, isIndex,
}) {
  const dateLabel = formatDateZh(activeDate);
  const ci = coverIndex || { byNorm: new Map(), byUrl: new Map() };
  const empty = (msg) => `<div class="empty-state"><p>${msg}</p></div>`;
  const aiHtml = aiItems.length
    ? aiItems.map((it) => renderStory(it, depth)).join("\n")
    : empty(`这一天还没有要闻条目${aiRawCount > aiItems.length ? "（与 AIHOT 日报重复的已收束到「简报」）" : ""}。`);
  const dedupe =
    aihotDaily && aiRawCount > aiItems.length
      ? `<p class="dedupe-note">已与 AIHOT 日报去重 ${aiRawCount - aiItems.length} 条，完整精选见「简报」。</p>`
      : "";
  const mkTab = ([id, label], cls = "") =>
    `<button type="button" class="tab-btn${cls}${id === "ai" ? " active" : ""}" role="tab" aria-selected="${id === "ai"}" data-tab="${id}" id="tab-${id}">${label}</button>`;
  const panel = (id, inner) =>
    `<section class="tab-panel${id === "ai" ? " active" : ""}" data-tab="${id}" role="tabpanel" aria-labelledby="tab-${id}"${id === "ai" ? "" : " hidden"}>${inner}</section>`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  ${renderHead(title, depth)}
</head>
<body data-channel="ai">
  ${renderMasthead(depth, dateLabel)}
  <nav class="channels" aria-label="内容频道" role="tablist">
    <div class="channels-inner">
      ${STREAMS.map((t) => mkTab(t)).join("\n      ")}
      <span class="ch-sep" aria-hidden="true"></span>
      <span class="ch-label">索引</span>
      ${INDEXES.map((t) => mkTab(t, " tab-idx")).join("\n      ")}
      <a class="tab-link" href="${archiveHref(depth)}">归档</a>
    </div>
  </nav>
  ${renderDayBar(days, activeDate, depth)}

  <main class="page">
    <header class="page-head" id="day-meta"
      data-date="${escapeHtml(activeDate)}" data-date-label="${escapeHtml(dateLabel)}"
      data-ai-count="${aiItems.length}" data-v-count="${vItems.length}" data-aihot-count="${aihotItemCount || 0}"
      data-weekly-count="${(weekly || []).length}" data-creators-count="${(creators || []).length}"
      data-topics-count="${(topics || []).length}" data-flash-count="${(flashItems || []).length}"
      data-has-daily="${aihotDaily ? "1" : "0"}" data-is-index="${isIndex ? "1" : "0"}">
      <p class="eyebrow" id="hero-eyebrow">${isIndex ? "今日" : "历史归档"}</p>
      <h1 id="hero-title">${isIndex ? "今日 AI 要闻" : escapeHtml(activeDate) + " 要闻"}</h1>
      <p class="sub" id="hero-sub">${escapeHtml(dateLabel)} · 共 ${aiItems.length} 条</p>
    </header>
    ${dedupe}
    ${renderToolbar(aiItems, vItems)}

    ${panel("ai", `<div class="front">${aiHtml}</div>`)}
    ${panel("flash", renderFlashPanel(flashItems || []))}
    ${panel("v", renderVoices(vItems, depth))}
    ${panel("digest", renderDigestPanel(aihotDaily, weekly || [], ci, depth))}
    ${panel("topics", renderTopicsPanel(topics || []))}
    ${panel("creators", renderCreatorsPanel(creators || []))}
  </main>

  <footer class="site-footer">
    <span>Alioxis News</span>
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
      const rows = list
        .map(
          (d) => `<a class="arch-row" href="../${escapeHtml(d.date)}/">
  <b>${escapeHtml(d.date.slice(5))}</b>
  <span>${escapeHtml(formatDateZh(d.date).split(" · ")[1])}</span>
  <em>要闻 ${d.aiItems.length} · 大V ${d.vItems.length}${d.aihotDaily ? " · AIHOT" : ""}</em>
</a>`
        )
        .join("\n");
      return `<section class="arch-month"><h2 class="section-label">${escapeHtml(month.replace("-", " 年 "))} 月</h2><div class="arch-list">${rows}</div></section>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  ${renderHead("日期归档 · Alioxis News", 1)}
</head>
<body data-channel="archive">
  ${renderMasthead(1, `日期归档 · ${days.length} 天`)}
  <main class="page">
    <header class="page-head">
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
  <script src="../assets/app.js" defer></script>
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

function pagePayload(day, days, depth, isIndex, aggregates) {
  const coverIndex = buildCoverIndex(days, day.date);
  return {
    title: isIndex ? `今日杂志 · Alioxis News` : `${day.date} · Alioxis News`,
    days,
    activeDate: day.date,
    aiItems: day.aiItems,
    vItems: day.vItems,
    aihotDaily: day.aihotDaily,
    aihotItemCount: day.aihotItemCount,
    aiRawCount: day.aiRawCount,
    weekly: aggregates.weekly,
    creators: aggregates.creators,
    topics: aggregates.topics,
    flashItems: aggregates.flashItems,
    coverIndex,
    depth,
    isIndex,
  };
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
        weekly: [],
        creators: [],
        topics: [],
        flashItems: [],
        coverIndex: { byNorm: new Map(), byUrl: new Map() },
        depth: 0,
        isIndex: true,
      }),
      "utf8"
    );
    return;
  }

  const latest = days[0];
  const aggregates = {
    weekly: buildWeekly(days, latest.date, 7),
    creators: buildCreators(days),
    topics: buildTopics(days, 14),
    flashItems: buildFlash(days, 48),
  };

  fs.writeFileSync(
    path.join(DIST_DIR, "index.html"),
    renderPage(pagePayload(latest, days, 0, true, aggregates)),
    "utf8"
  );

  for (const day of days) {
    const dir = path.join(DIST_DIR, day.date);
    ensureDir(dir);
    const dayAgg = {
      weekly: buildWeekly(days, day.date, 7),
      creators: aggregates.creators,
      topics: aggregates.topics,
      flashItems: buildFlash(
        days.slice(days.findIndex((d) => d.date === day.date)),
        48
      ),
    };
    fs.writeFileSync(
      path.join(dir, "index.html"),
      renderPage(pagePayload(day, days, 1, day.date === latest.date, dayAgg)),
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
  console.log(
    `\nBuilt ${days.length} day(s) · channels ai/v/aihot/weekly/creators/topics/flash → ${DIST_DIR}`
  );
  console.log(
    `  weekly ${aggregates.weekly.length}d · creators ${aggregates.creators.length} · topics ${aggregates.topics.length} · flash ${aggregates.flashItems.length}`
  );
}

main();
