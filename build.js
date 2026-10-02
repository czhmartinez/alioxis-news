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

function renderAihotCard(it, coverIndex, canonical, idx) {
  const href = escapeHtml(aihotItemHref(it, canonical));
  const aihotHref = escapeHtml(
    (it.attribution && it.attribution.canonical) || it.permalink || canonical
  );
  const title = escapeHtml(it.title || "无标题");
  const summary = escapeHtml(it.summary || "");
  const src = escapeHtml(it.sourceName || it.source || "");
  const cover = matchCover(it, coverIndex);
  const media = cover
    ? `<div class="aihot-card-media"><img src="${escapeHtml(cover)}" alt="" loading="lazy" decoding="async" /></div>`
    : `<div class="aihot-card-media"><div class="cover-fallback aihot-fallback" aria-hidden="true"><span>${escapeHtml(initials(it.title || "AI"))}</span></div></div>`;
  const delay = ((idx % 8) * 0.04).toFixed(2);

  return `
<article class="aihot-card mirror-card" style="--mirror-i:${idx}; --mirror-delay:${delay}s" data-search="${searchAttr([it.title, it.summary, it.sourceName])}">
  <div class="mirror-frame" aria-hidden="true"></div>
  <a class="aihot-card-link" href="${href}" target="_blank" rel="noopener noreferrer">
    ${media}
    <div class="aihot-card-body">
      <h3 class="aihot-card-title">${title}</h3>
      ${summary ? `<p class="aihot-card-sum">${summary}</p>` : ""}
      <div class="aihot-card-foot">
        <span class="aihot-card-src">${src || "来源"}</span>
        <span class="aihot-card-cta">原文 ↗</span>
      </div>
    </div>
  </a>
  ${
    aihotHref && aihotHref !== href
      ? `<a class="aihot-card-aihot" href="${aihotHref}" target="_blank" rel="noopener noreferrer">AIHOT</a>`
      : ""
  }
</article>`;
}

function renderAihotPanel(daily, coverIndex) {
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
  let cardIdx = 0;

  const leadCover = matchCover(
    { title: leadTitle, sourceUrl: canonical },
    coverIndex
  );
  const leadMedia = leadCover
    ? `<div class="aihot-lead-media"><img src="${escapeHtml(leadCover)}" alt="" loading="lazy" decoding="async" /></div>`
    : "";

  const sections = (daily.sections || [])
    .map((s) => {
      const label = escapeHtml(s.label || s.title || "分区");
      const items = (s.items || [])
        .map((it) => renderAihotCard(it, coverIndex, canonical, cardIdx++))
        .join("\n");
      return `<section class="aihot-section">
  <h2 class="aihot-section-label">${label}</h2>
  <div class="aihot-card-grid mirror-stack">${items}</div>
</section>`;
    })
    .join("\n");

  const flashes = (daily.flashes || [])
    .map((f) => {
      const href = escapeHtml(aihotItemHref(f, canonical));
      return `<li class="aihot-flash-row">
  <a href="${href}" target="_blank" rel="noopener noreferrer">
    <span class="flash-title">${escapeHtml(f.title || "")}</span>
    <span class="flash-src">${escapeHtml(f.sourceName || "")}</span>
  </a>
</li>`;
    })
    .join("\n");

  return `
<div class="aihot-daily mirror-stage">
  <header class="aihot-masthead mirror-card">
    <div class="mirror-frame" aria-hidden="true"></div>
    <p class="aihot-brand">AIHOT · 数字生命卡兹克</p>
    <div class="aihot-lead-layout">
      ${leadMedia}
      <div class="aihot-lead-copy">
        <h2 class="aihot-lead">${escapeHtml(leadTitle)}</h2>
        ${leadPara ? `<p class="aihot-lede">${escapeHtml(leadPara)}</p>` : ""}
        <div class="aihot-mast-actions">
          <span class="aihot-date">${date}</span>
          <a class="aihot-open" href="${escapeHtml(canonical)}" target="_blank" rel="noopener noreferrer">在 AIHOT 打开 ↗</a>
        </div>
      </div>
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

function buildFlash(days, limit = 48) {
  const items = [];
  const seen = new Set();
  for (const d of days.slice(0, 7)) {
    const rows = [
      ...(d.aiItems || []).map((it) => ({ ...it, channel: "ai", day: d.date })),
      ...(d.vItems || []).map((it) => ({ ...it, channel: "v", day: d.date })),
    ];
    for (const it of rows) {
      const k = normalizeTitle(it.title);
      if (k.length < 6 || seen.has(k)) continue;
      seen.add(k);
      items.push({
        title: it.title,
        source: it.source,
        url: it.url,
        day: it.day,
        channel: it.channel,
        tags: it.tags || [],
      });
      if (items.length >= limit) return items;
    }
  }
  return items;
}

function renderWeeklyPanel(weekly) {
  if (!weekly.length) {
    return `<div class="empty-state"><p>暂无周报数据</p></div>`;
  }
  const range = `${weekly[weekly.length - 1].date} → ${weekly[0].date}`;
  const daysHtml = weekly
    .map((d) => {
      const aiBits = (d.ai || [])
        .slice(0, 4)
        .map(
          (it) =>
            `<li><a href="${escapeHtml(it.url || "#")}" target="_blank" rel="noopener noreferrer">${escapeHtml(it.title || "")}</a><span class="wk-src">${escapeHtml(it.source || "")}</span></li>`
        )
        .join("");
      const vBits = (d.v || [])
        .slice(0, 3)
        .map(
          (it) =>
            `<li><a href="${escapeHtml(it.url || "#")}" target="_blank" rel="noopener noreferrer">${escapeHtml(it.title || "")}</a><span class="wk-src">${escapeHtml(it.source || "")}</span></li>`
        )
        .join("");
      return `<section class="wk-day" data-search="${searchAttr([d.date, d.label])}">
  <header class="wk-day-head">
    <h3>${escapeHtml(d.date)}</h3>
    <p>${escapeHtml(d.label)} · 杂志 ${d.ai.length} · 大V ${d.v.length}${d.aihot ? ` · AIHOT ${d.aihot}` : ""}</p>
  </header>
  <div class="wk-cols">
    <div class="wk-col">
      <h4>杂志精选</h4>
      <ul class="wk-list">${aiBits || "<li class=\"muted-note\">无</li>"}</ul>
    </div>
    <div class="wk-col wk-col-v">
      <h4>大V摘录</h4>
      <ul class="wk-list">${vBits || "<li class=\"muted-note\">无</li>"}</ul>
    </div>
  </div>
</section>`;
    })
    .join("\n");

  return `
<div class="weekly-panel">
  <header class="mod-hero mod-hero-weekly">
    <p class="mod-kicker">Weekly digest</p>
    <h2>近 7 日周报</h2>
    <p class="mod-sub">${escapeHtml(range)} · 按日回顾杂志与关注流</p>
  </header>
  <div class="wk-days">${daysHtml}</div>
</div>`;
}

function renderCreatorsPanel(creators) {
  if (!creators.length) {
    return `<div class="empty-state"><p>暂无创作者数据</p></div>`;
  }
  const cards = creators
    .map((c) => {
      const latest = c.latest || {};
      const latestUrl = escapeHtml(latest.url || "#");
      const tags = (c.topTags || [])
        .map((t) => `<span class="creator-tag">${escapeHtml(t)}</span>`)
        .join("");
      return `<article class="creator-card" data-search="${searchAttr([c.name, c.handle, ...(c.topTags || [])])}">
  <div class="creator-avatar" aria-hidden="true">${escapeHtml(initials(c.name))}</div>
  <div class="creator-body">
    <h3 class="creator-name">${escapeHtml(c.name)}</h3>
    ${c.handle ? `<p class="creator-handle">${escapeHtml(c.handle)}</p>` : ""}
    <p class="creator-stats">${c.count} 帖 · ${c.dayCount} 天</p>
    ${tags ? `<div class="creator-tags">${tags}</div>` : ""}
    ${
      latest.title
        ? `<a class="creator-latest" href="${latestUrl}" target="_blank" rel="noopener noreferrer"><span class="creator-latest-label">最新</span>${escapeHtml(latest.title)}</a>`
        : ""
    }
  </div>
</article>`;
    })
    .join("\n");

  return `
<div class="creators-panel">
  <header class="mod-hero mod-hero-creators">
    <p class="mod-kicker">Creators</p>
    <h2>人物 / 创作者</h2>
    <p class="mod-sub">关注流里出现过的作者目录 · 共 ${creators.length} 位</p>
  </header>
  <div class="creator-grid">${cards}</div>
</div>`;
}

function renderTopicsPanel(topics) {
  if (!topics.length) {
    return `<div class="empty-state"><p>暂无专题数据</p></div>`;
  }
  const boards = topics
    .map((b) => {
      const rows = b.items
        .map((it) => {
          const ch = it.channel === "v" ? "大V" : "杂志";
          return `<a class="topic-item" href="${escapeHtml(it.url || "#")}" target="_blank" rel="noopener noreferrer" data-search="${searchAttr([it.title, it.source, b.id])}">
  <span class="topic-item-title">${escapeHtml(it.title || "")}</span>
  <span class="topic-item-meta">${escapeHtml(it.day || "")} · ${ch} · ${escapeHtml(it.source || "")}</span>
</a>`;
        })
        .join("\n");
      return `<section class="topic-board" id="topic-${escapeHtml(b.id)}">
  <header class="topic-board-head">
    <h3>${escapeHtml(b.id)}</h3>
    <span class="topic-count">${b.count}</span>
  </header>
  <div class="topic-list">${rows}</div>
</section>`;
    })
    .join("\n");

  const nav = topics
    .map(
      (b) =>
        `<a class="topic-nav-chip" href="#topic-${escapeHtml(b.id)}">${escapeHtml(b.id)} <em>${b.count}</em></a>`
    )
    .join("");

  return `
<div class="topics-panel">
  <header class="mod-hero mod-hero-topics">
    <p class="mod-kicker">Topics</p>
    <h2>专题看板</h2>
    <p class="mod-sub">按标签聚合近两周杂志与大V</p>
  </header>
  <nav class="topic-nav" aria-label="专题">${nav}</nav>
  <div class="topic-boards">${boards}</div>
</div>`;
}

function renderFlashPanel(flashItems) {
  if (!flashItems.length) {
    return `<div class="empty-state"><p>暂无快讯</p></div>`;
  }
  const rows = flashItems
    .map((it) => {
      const ch = it.channel === "v" ? "大V" : "杂志";
      return `<a class="flash-scan-row" href="${escapeHtml(it.url || "#")}" target="_blank" rel="noopener noreferrer" data-search="${searchAttr([it.title, it.source, it.day])}" data-channel="${escapeHtml(it.channel)}">
  <span class="flash-scan-ch">${ch}</span>
  <span class="flash-scan-title">${escapeHtml(it.title || "")}</span>
  <span class="flash-scan-src">${escapeHtml(it.source || "")}</span>
  <time class="flash-scan-day">${escapeHtml(it.day || "")}</time>
</a>`;
    })
    .join("\n");

  return `
<div class="flash-panel">
  <header class="mod-hero mod-hero-flash">
    <p class="mod-kicker">Briefs</p>
    <h2>快讯扫描</h2>
    <p class="mod-sub">近 7 日标题速览 · ${flashItems.length} 条 · 去重</p>
  </header>
  <div class="flash-scan-list">${rows}</div>
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
    <input id="search-input" class="search-input" type="search" placeholder="搜索标题、摘要、来源…" autocomplete="off" enterkeyhint="search" />
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
  weekly,
  creators,
  topics,
  flashItems,
  coverIndex,
  depth,
  isIndex,
}) {
  const dateLabel = formatDateZh(activeDate);
  const emptyAi = `<div class="empty-state"><p>这一天还没有杂志条目${aiRawCount > (aiItems || []).length ? "（与 AIHOT 日报重复的已收束到「AIHOT 日报」频道）" : ""}。</p></div>`;
  const emptyV = `<div class="empty-state"><p>暂无关注流内容</p></div>`;
  const aiCards = aiItems.length ? aiItems.map(renderAiCard).join("\n") : emptyAi;
  const vCards = vItems.length ? vItems.map(renderVCard).join("\n") : emptyV;
  const aihotHtml = renderAihotPanel(aihotDaily, coverIndex || { byNorm: new Map(), byUrl: new Map() });
  const weeklyHtml = renderWeeklyPanel(weekly || []);
  const creatorsHtml = renderCreatorsPanel(creators || []);
  const topicsHtml = renderTopicsPanel(topics || []);
  const flashHtml = renderFlashPanel(flashItems || []);
  const dedupeNote =
    aihotDaily && aiRawCount > aiItems.length
      ? `<p class="dedupe-note">已与 AIHOT 日报去重 ${aiRawCount - aiItems.length} 条，完整精选见「AIHOT 日报」。</p>`
      : "";

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="description" content="Alioxis News — AI杂志 · 大V视野 · AIHOT日报 · 周报 · 人物 · 专题 · 快讯" />
  <meta name="theme-color" content="#0c0c0e" />
  <meta name="color-scheme" content="dark" />
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
        <span class="header-tagline">多频道个人日报</span>
      </div>
    </div>
  </header>

  <nav class="tab-bar" aria-label="内容频道" role="tablist">
    <div class="tab-bar-inner">
      <button type="button" class="tab-btn active" role="tab" aria-selected="true" data-tab="ai" id="tab-ai">AI新闻</button>
      <button type="button" class="tab-btn" role="tab" aria-selected="false" data-tab="v" id="tab-v">大V视野</button>
      <button type="button" class="tab-btn tab-btn-aihot" role="tab" aria-selected="false" data-tab="aihot" id="tab-aihot">AIHOT日报</button>
      <button type="button" class="tab-btn" role="tab" aria-selected="false" data-tab="weekly" id="tab-weekly">周报</button>
      <button type="button" class="tab-btn" role="tab" aria-selected="false" data-tab="creators" id="tab-creators">人物</button>
      <button type="button" class="tab-btn" role="tab" aria-selected="false" data-tab="topics" id="tab-topics">专题</button>
      <button type="button" class="tab-btn" role="tab" aria-selected="false" data-tab="flash" id="tab-flash">快讯</button>
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
        data-weekly-count="${(weekly || []).length}"
        data-creators-count="${(creators || []).length}"
        data-topics-count="${(topics || []).length}"
        data-flash-count="${(flashItems || []).length}"
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

      <section class="tab-panel" data-tab="weekly" role="tabpanel" aria-labelledby="tab-weekly" hidden>
        ${weeklyHtml}
      </section>

      <section class="tab-panel" data-tab="creators" role="tabpanel" aria-labelledby="tab-creators" hidden>
        ${creatorsHtml}
      </section>

      <section class="tab-panel" data-tab="topics" role="tabpanel" aria-labelledby="tab-topics" hidden>
        ${topicsHtml}
      </section>

      <section class="tab-panel" data-tab="flash" role="tabpanel" aria-labelledby="tab-flash" hidden>
        ${flashHtml}
      </section>
    </main>
  </div>

  <footer class="site-footer">
    <span>Alioxis News · 杂志 / 大V / AIHOT / 周报 / 人物 / 专题 / 快讯</span>
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
          const aihot = d.aihotDaily ? `<span class="arch-badge">AIHOT</span>` : "";
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
  <meta name="color-scheme" content="dark" />
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
