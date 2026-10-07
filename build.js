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

function aihotSourceName(it) {
  if (!it || typeof it !== "object") return "";
  if (typeof it.sourceName === "string" && it.sourceName) return it.sourceName;
  if (typeof it.source === "string" && it.source) return it.source;
  if (it.source && typeof it.source === "object") {
    if (typeof it.source.name === "string" && it.source.name) return it.source.name;
    if (typeof it.source.title === "string" && it.source.title) return it.source.title;
  }
  if (it.attribution && typeof it.attribution.name === "string" && it.attribution.name) {
    // Prefer original publisher over "AIHOT" attribution brand when possible
    if (it.attribution.name !== "AIHOT") return it.attribution.name;
  }
  return "";
}

function aihotOriginalUrl(it) {
  if (!it || typeof it !== "object") return "";
  const nested =
    (it.links && (it.links.original || it.links.url || it.links.href)) ||
    (it.attribution && it.attribution.original) ||
    "";
  const flat = it.sourceUrl || it.url || it.link || it.href || "";
  return String(nested || flat || "").trim();
}

function aihotPermalink(it) {
  if (!it || typeof it !== "object") return "";
  const nested =
    (it.links && (it.links.aihot || it.links.permalink || it.links.canonical)) ||
    (it.attribution && (it.attribution.canonical || it.attribution.url)) ||
    "";
  const flat = it.permalink || it.aihotUrl || "";
  return String(nested || flat || "").trim();
}

/** Flatten nested AIHOT item fields so cover match / render can use either shape. */
function normalizeAihotItem(it) {
  if (!it || typeof it !== "object") return it;
  const sourceName = aihotSourceName(it);
  const sourceUrl = aihotOriginalUrl(it);
  const permalink = aihotPermalink(it);
  return {
    ...it,
    sourceName: sourceName || it.sourceName,
    sourceUrl: sourceUrl || it.sourceUrl,
    url: sourceUrl || it.url,
    permalink: permalink || it.permalink,
    // Keep string source for searchAttr / escapeHtml callers that still read it.source
    source: sourceName || (typeof it.source === "string" ? it.source : sourceName),
  };
}

function normalizeAihotDaily(daily) {
  if (!daily || typeof daily !== "object") return daily;
  const out = { ...daily };
  if (Array.isArray(out.sections)) {
    out.sections = out.sections.map((s) => ({
      ...s,
      items: Array.isArray(s.items) ? s.items.map(normalizeAihotItem) : s.items,
    }));
  }
  if (Array.isArray(out.flashes)) {
    out.flashes = out.flashes.map(normalizeAihotItem);
  }
  return out;
}

function loadAihotDaily(dayDir) {
  const raw = readJson(path.join(dayDir, "_aihot_daily.json"));
  if (!raw || typeof raw !== "object") return null;
  // Accept wrapped API shape { report, schemaVersion } or flat daily.
  let daily = raw;
  if (
    raw.report &&
    typeof raw.report === "object" &&
    !Array.isArray(raw.report) &&
    !raw.lead &&
    !raw.sections
  ) {
    daily = { ...raw.report };
    if (raw.attribution && !daily.attribution) daily.attribution = raw.attribution;
  }
  return normalizeAihotDaily(daily);
}

function normalizeTitle(t) {
  let s = String(t || "")
    .toLowerCase()
    .replace(/[\s\u3000]+/g, "")
    .replace(/[“”"'‘’«»]/g, "");
  // Soft colon truncate: keep right side when it holds model/version/key tokens
  // (e.g. "… CVP：分防御…" or "Title: ModelName 2.1 …")
  const colon = s.search(/[：:]/);
  if (colon >= 0) {
    const left = s.slice(0, colon);
    const right = s.slice(colon + 1);
    const rightHasKey =
      /[a-z]{2,}\d|\d+\.\d+|claude|gpt|gemini|mistral|llama|banana|embedding|mythos|vicuna|deepseek/i.test(
        right
      ) || /[\u4e00-\u9fff]{4,}/.test(right);
    if (left.length >= 16 && !(rightHasKey && left.length < 28)) {
      s = left;
    } else if (left.length >= 8 && !rightHasKey) {
      s = left;
    } else {
      s = left + right;
    }
  }
  return s.slice(0, 56);
}

/** High-value entity / brand / model tokens — a single shared hit is strong signal. */
const ENTITY_TOKEN_RE =
  /^(anthropic|openai|google|deepmind|gemini|mistral|meta|microsoft|amazon|aws|apple|nvidia|xai|grok|claude|chatgpt|gpt|llama|vicuna|lmsys|deepseek|qwen|kimi|glm|banana|nanobanana|embeddinggemma|mythos|openrouter|huggingface|a16z|semianalysis|barclays|lambda|akamai|together|baseten|cursor|codex|alexa)$/;

/** Significant tokens for fuzzy cover matching (latin, versions, amounts, CJK ≥4). */
function significantTokens(t) {
  const s = String(t || "").toLowerCase();
  const out = [];
  const seen = new Set();
  const push = (tok) => {
    const x = String(tok || "")
      .replace(/[^a-z0-9.\u4e00-\u9fff]+/gi, "")
      .toLowerCase();
    if (x.length < 2) return;
    if (
      /^(the|and|for|with|from|https|http|www|com|org|html|blog|news|status|发布|正式|更新|停用|旧版|网页|文章|报道|据报|推出|开启|上线|公测|扩展|解读|两份|使用|用户|模型|参数)$/.test(
        x
      )
    )
      return;
    if (seen.has(x)) return;
    seen.add(x);
    out.push(x);
  };
  // Latin words / dotted versions (gpt-4, 2.1)
  for (const m of s.match(/[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*|\d+(?:\.\d+)+/gi) || []) {
    push(m);
  }
  // Plain integers ≥3 digits (5180, 4137, 800) and $-style amounts
  for (const m of s.match(/\d{3,}/g) || []) push(m);
  for (const m of s.match(/\$\d+(?:\.\d+)?[kmb]?/gi) || []) {
    push(m.replace(/[^a-z0-9]/gi, ""));
  }
  // Chinese amount phrases: 5180亿美元 / 800亿元 / 350亿
  for (const m of s.match(/\d+(?:\.\d+)?(?:多)?(?:亿|万)?(?:美元|美金|元|人民币)?/g) || []) {
    if (/\d/.test(m) && m.length >= 3) push(m.replace(/[^0-9.\u4e00-\u9fff]/g, ""));
  }
  // CJK: keep short runs whole; emit 4-char phrases + bigrams for longer runs
  for (const m of s.match(/[\u4e00-\u9fff]{2,}/g) || []) {
    if (m.length <= 8) push(m);
    if (m.length >= 4) {
      for (let i = 0; i + 4 <= Math.min(m.length, 20); i++) push(m.slice(i, i + 4));
    }
    if (m.length > 6) {
      for (let i = 0; i + 2 <= Math.min(m.length, 16); i += 2) push(m.slice(i, i + 2));
    }
  }
  return out;
}

function entityStem(tok) {
  let x = String(tok || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!x) return "";
  // Strip trailing version/size suffixes: llama13b → llama, gpt4 → gpt, claude4 → claude
  x = x.replace(/\d+(?:\.\d+)?[bmk]?$/i, "");
  // Compound product stems
  const stems = [
    "nanobanana",
    "banana",
    "anthropic",
    "openai",
    "openrouter",
    "deepseek",
    "deepmind",
    "embeddinggemma",
    "embedding",
    "llamaindex",
    "llamacpp",
    "llama",
    "vicuna",
    "mistral",
    "claude",
    "gemini",
    "chatgpt",
    "mythos",
    "lmsys",
    "huggingface",
    "semianalysis",
    "a16z",
    "nvidia",
    "microsoft",
    "google",
    "meta",
  ];
  for (const s of stems) {
    if (x === s || x.startsWith(s) || s.startsWith(x) && x.length >= 4) return s === "llamacpp" || s === "llamaindex" ? "llama" : s;
  }
  return x;
}

function isEntityToken(tok) {
  const x = String(tok || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!x || x.length < 3) return false;
  if (ENTITY_TOKEN_RE.test(x)) return true;
  const stem = entityStem(x);
  if (stem && ENTITY_TOKEN_RE.test(stem)) return true;
  if (/^(nano)?banana|claude|gemini|mistral|deepseek|embedding|mythos|vicuna|llama|openrouter|anthropic|openai|lmsys/.test(x))
    return true;
  return false;
}

function isAmountToken(tok) {
  return /\d{3,}/.test(tok) || /亿|万美元|美元|\$/.test(tok);
}

function titlesFuzzyMatch(a, b) {
  const ta = significantTokens(a);
  const tb = significantTokens(b);
  if (ta.length < 2 || tb.length < 2) return false;
  const setB = new Set(tb);
  const shared = ta.filter((t) => setB.has(t));
  let hit = shared.length;
  const entityHits = shared.filter(isEntityToken);
  const amountHits = shared.filter(isAmountToken);
  // Distinctive: shared company/model + another significant token (amount / phrase ≥4)
  if (entityHits.length >= 1) {
    const extra = shared.filter(
      (t) => !entityHits.includes(t) && (t.length >= 4 || isAmountToken(t) || isEntityToken(t))
    );
    if (extra.length >= 1) return true;
  }
  // Two+ shared CJK phrases of length ≥4
  if (shared.filter((t) => /[\u4e00-\u9fff]/.test(t) && t.length >= 4).length >= 2) return true;
  // Prefer distinctive multi-token overlap (e.g. nano + banana + 2.1)
  const need = Math.min(3, Math.max(2, Math.ceil(Math.min(ta.length, tb.length) * 0.4)));
  if (hit >= need) return true;
  // Phrase containment after stripping punctuation/spaces
  const compact = (x) =>
    String(x || "")
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
  const ca = compact(a);
  const cb = compact(b);
  if (ca.length >= 10 && cb.length >= 10) {
    for (const t of ta) {
      if (t.length >= 4 && cb.includes(t) && ca.includes(t)) {
        for (const t2 of ta) {
          if (t2 !== t && t2.length >= 2 && cb.includes(t2)) return true;
        }
      }
    }
  }
  return false;
}

/** Score overlap for best-of cover picking when exact/fuzzy fail. */
function titleOverlapScore(a, b) {
  const ta = significantTokens(a);
  const tb = significantTokens(b);
  if (!ta.length || !tb.length) return 0;
  const setB = new Set(tb);
  let score = 0;
  const shared = [];
  for (const t of ta) {
    if (!setB.has(t)) continue;
    shared.push(t);
    if (isEntityToken(t)) score += 5;
    else if (isAmountToken(t)) score += 3;
    else if (t.length >= 4) score += 2;
    else score += 1;
  }
  return score;
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

/** Normalize URL for cover index: trim slash, drop hash + common tracking query. */
function normalizeCoverUrl(u) {
  try {
    const raw = String(u || "").trim();
    if (!raw) return "";
    const noHash = raw.split("#")[0];
    let parsed;
    try {
      parsed = new URL(noHash);
    } catch {
      return noHash.replace(/\/$/, "");
    }
    // Drop tracking params but keep meaningful path
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "s", "ref"].forEach(
      (k) => parsed.searchParams.delete(k)
    );
    const q = parsed.searchParams.toString();
    const path = parsed.pathname.replace(/\/$/, "") || "";
    return `${parsed.protocol}//${parsed.host}${path}${q ? "?" + q : ""}`;
  } catch {
    return String(u || "").split("#")[0].replace(/\/$/, "");
  }
}

function coverUrlHostPath(u) {
  try {
    const parsed = new URL(String(u || "").trim());
    return `${parsed.host}${parsed.pathname.replace(/\/$/, "")}`.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Build title/url→image map from ALL days' ai.json (+ v.json).
 * Nearer days win when the same key appears (stable insert order).
 */
function buildCoverIndex(days, aroundDate) {
  const idx = days.findIndex((d) => d.date === aroundDate);
  // Sort days by distance from aroundDate so nearer covers are inserted first
  const ordered = days
    .map((d, i) => ({ d, dist: idx < 0 ? i : Math.abs(i - idx) }))
    .sort((a, b) => a.dist - b.dist || a.d.date.localeCompare(b.d.date))
    .map((x) => x.d);

  const byNorm = new Map();
  const byUrl = new Map();
  const byHostPath = new Map();
  const byTitle = new Map(); // normKey → original title (for fuzzy)
  const entries = []; // { title, image, url, date } for scored fallback

  for (const d of ordered) {
    for (const it of [...(d.aiRaw || d.aiItems || []), ...(d.vItems || [])]) {
      if (!it || !it.image) continue;
      const n = normalizeTitle(it.title);
      if (n.length >= 6 && !byNorm.has(n)) {
        byNorm.set(n, it.image);
        byTitle.set(n, it.title || "");
      }
      if (it.url) {
        const full = normalizeCoverUrl(it.url);
        const noHash = String(it.url).split("#")[0].replace(/\/$/, "");
        if (full && !byUrl.has(full)) byUrl.set(full, it.image);
        if (noHash && !byUrl.has(noHash)) byUrl.set(noHash, it.image);
        // also raw with trailing slash variants
        byUrl.set(String(it.url).replace(/\/$/, ""), it.image);
        const hp = coverUrlHostPath(it.url);
        if (hp && !byHostPath.has(hp)) byHostPath.set(hp, it.image);
      }
      entries.push({
        title: it.title || "",
        image: it.image,
        url: it.url || "",
        date: d.date,
      });
    }
  }
  return { byNorm, byUrl, byHostPath, byTitle, entries };
}

function matchCover(item, coverIndex) {
  if (!item || !coverIndex) return "";
  if (item.image) return item.image;
  if (item.cover) return item.cover;
  if (item.ogImage) return item.ogImage;

  const candidates = [
    aihotOriginalUrl(item),
    item.sourceUrl,
    item.url,
    item.link,
    item.links && item.links.original,
    item.attribution && item.attribution.url,
  ]
    .filter(Boolean)
    .map((u) => String(u).trim());

  for (const srcUrl of candidates) {
    const variants = [
      normalizeCoverUrl(srcUrl),
      srcUrl.replace(/\/$/, ""),
      srcUrl.split("#")[0].replace(/\/$/, ""),
    ].filter(Boolean);
    for (const v of variants) {
      if (coverIndex.byUrl.has(v)) return coverIndex.byUrl.get(v);
    }
    // Any indexed URL that shares host+path (ignore hash/query drift)
    const hp = coverUrlHostPath(srcUrl);
    if (hp && coverIndex.byHostPath && coverIndex.byHostPath.has(hp)) {
      return coverIndex.byHostPath.get(hp);
    }
    for (const [u, img] of coverIndex.byUrl) {
      if (coverUrlHostPath(u) && hp && coverUrlHostPath(u) === hp) return img;
      if (u.split("#")[0].replace(/\/$/, "") === srcUrl.split("#")[0].replace(/\/$/, "")) {
        return img;
      }
    }
  }

  const n = normalizeTitle(item.title);
  if (n.length >= 6) {
    if (coverIndex.byNorm.has(n)) return coverIndex.byNorm.get(n);
    // Prefix / containment — use longer slice so Chinese titles don't collide on first chars only
    for (const [k, img] of coverIndex.byNorm) {
      const a = n.slice(0, Math.min(18, n.length));
      const b = k.slice(0, Math.min(18, k.length));
      if (a.length >= 10 && (n.includes(b) || k.includes(a))) return img;
      if (n.includes(k.slice(0, 14)) || k.includes(n.slice(0, 14))) return img;
    }
  }

  // Fuzzy: significant token overlap (Nano Banana 2.1, company+amount, CJK ≥4)
  for (const [k, img] of coverIndex.byNorm) {
    const title = coverIndex.byTitle && coverIndex.byTitle.has(k) ? coverIndex.byTitle.get(k) : k;
    if (titlesFuzzyMatch(item.title, title)) return img;
  }

  // Scored best overlap across full index (≥2 significant / entity+extra)
  if (coverIndex.entries && coverIndex.entries.length) {
    let best = null;
    let bestScore = 0;
    for (const e of coverIndex.entries) {
      const sc = titleOverlapScore(item.title, e.title);
      if (sc > bestScore) {
        bestScore = sc;
        best = e;
      }
    }
    // entity(5)+something(≥2) or two strong phrases
    if (best && bestScore >= 7) return best.image;
  }

  // Last image resort: reuse a cover that shares the same entity/brand token
  // (deterministic pick among candidates) — prefer real GenerateImage art over letters
  const entityCover = matchEntityCover(item, coverIndex);
  if (entityCover) return entityCover;

  return "";
}

/** Deterministic cover reuse when titles share a known entity (Anthropic, Mistral, …). */
function matchEntityCover(item, coverIndex) {
  if (!item || !coverIndex || !coverIndex.entries) return "";
  const tokens = significantTokens(item.title).filter(isEntityToken);
  if (!tokens.length) return "";
  const want = new Set(tokens.map((t) => entityStem(t)).filter(Boolean));
  const pool = [];
  for (const e of coverIndex.entries) {
    const et = significantTokens(e.title).filter(isEntityToken);
    if (et.some((t) => want.has(entityStem(t)))) {
      pool.push(e);
    }
  }
  if (!pool.length) return "";
  // Stable pick from title hash so rebuilds don't flicker
  let h = 0;
  const s = String(item.title || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return pool[h % pool.length].image;
}

/** Keyword chips for styled gradient fallback (letter initials = absolute last resort). */
function coverKeywordChips(title) {
  const toks = significantTokens(title);
  const entities = toks.filter(isEntityToken);
  const amounts = toks.filter(isAmountToken);
  const cjk = toks.filter((t) => /[\u4e00-\u9fff]/.test(t) && t.length >= 4);
  const latin = toks.filter((t) => /^[a-z]/.test(t) && t.length >= 3 && !isEntityToken(t));
  const chips = [...entities, ...amounts.slice(0, 2), ...cjk.slice(0, 2), ...latin.slice(0, 2)];
  const seen = new Set();
  const out = [];
  for (const c of chips) {
    const k = c.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
    if (out.length >= 3) break;
  }
  if (!out.length) {
    const init = initials(title || "AI");
    if (init) out.push(init);
  }
  return out;
}

function renderAihotCoverMedia(item, coverIndex) {
  const cover = matchCover(item, coverIndex);
  if (cover) {
    return `<div class="aihot-card-media"><img src="${escapeHtml(cover)}" alt="" loading="lazy" decoding="async" /></div>`;
  }
  const chips = coverKeywordChips(item.title || "");
  const chipHtml = chips
    .map((c) => `<span class="aihot-kw">${escapeHtml(String(c).slice(0, 16))}</span>`)
    .join("");
  // Styled gradient with story keywords — avoid bare letter initials when possible
  return `<div class="aihot-card-media"><div class="cover-fallback aihot-fallback aihot-kw-fallback" aria-hidden="true"><div class="aihot-kw-row">${chipHtml}</div></div></div>`;
}

function aihotItemHref(it, fallback) {
  return (
    aihotOriginalUrl(it) ||
    aihotPermalink(it) ||
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
  const aihotHref = escapeHtml(aihotPermalink(it) || canonical);
  const title = escapeHtml(it.title || "无标题");
  const summary = escapeHtml(it.summary || "");
  const srcName = aihotSourceName(it);
  const src = escapeHtml(srcName);
  const media = renderAihotCoverMedia(it, coverIndex);
  const delay = ((idx % 8) * 0.04).toFixed(2);

  return `
<article class="aihot-card mirror-card" style="--mirror-i:${idx}; --mirror-delay:${delay}s" data-search="${searchAttr([it.title, it.summary, srcName])}">
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
    <span class="flash-src">${escapeHtml(aihotSourceName(f))}</span>
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
          byDay: new Map(),
        };
        map.set(key, c);
      }
      c.count++;
      c.days.add(d.date);
      c.byDay.set(d.date, (c.byDay.get(d.date) || 0) + 1);
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
      byDay: Object.fromEntries(c.byDay),
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
        published_at: it.published_at || "",
        channel: it.channel,
        tags: it.tags || [],
      });
      if (items.length >= limit) return items;
    }
  }
  return items;
}

function weekdayOf(label) {
  const parts = String(label || "").split("· ");
  return parts[1] || "";
}

function renderWeeklyPanel(weekly) {
  if (!weekly.length) {
    return `<div class="empty-state"><p>暂无周报数据</p></div>`;
  }
  const range = `${weekly[weekly.length - 1].date} → ${weekly[0].date}`;
  const totalAi = weekly.reduce((n, d) => n + (d.ai || []).length, 0);
  const totalV = weekly.reduce((n, d) => n + (d.v || []).length, 0);

  // 头条：最近三天里，每天杂志的第一条（沿用当日编辑顺序）
  const heads = [];
  for (const d of weekly) {
    if (heads.length >= 3) break;
    const it = (d.ai || [])[0];
    if (it) heads.push({ ...it, day: d.date });
  }
  const lead = heads[0];
  const subs = heads.slice(1);

  const leadHtml = lead
    ? `<a class="wk-lead" href="${escapeHtml(lead.url || "#")}" target="_blank" rel="noopener noreferrer" data-search="${searchAttr([lead.title, lead.summary, lead.source])}">
  ${lead.image ? `<div class="wk-lead-media"><img src="${escapeHtml(lead.image)}" alt="" loading="lazy" decoding="async" /></div>` : ""}
  <div class="wk-lead-body">
    <p class="wk-kicker">本周头条 · ${escapeHtml(lead.day)}</p>
    <h3>${escapeHtml(lead.title || "")}</h3>
    ${lead.summary ? `<p class="wk-lead-sum">${escapeHtml(lead.summary)}</p>` : ""}
    <span class="wk-lead-src">${escapeHtml(lead.source || "")} ↗</span>
  </div>
</a>`
    : "";

  const subsHtml = subs.length
    ? `<div class="wk-subleads">${subs
        .map(
          (it) => `<a class="wk-sublead" href="${escapeHtml(it.url || "#")}" target="_blank" rel="noopener noreferrer" data-search="${searchAttr([it.title, it.summary, it.source])}">
  <p class="wk-kicker">${escapeHtml(it.day)}</p>
  <h4>${escapeHtml(it.title || "")}</h4>
  <span class="wk-lead-src">${escapeHtml(it.source || "")} ↗</span>
</a>`
        )
        .join("")}</div>`
    : "";

  const item = (it, kind) =>
    `<li class="wk-item" data-kind="${kind}"><a href="${escapeHtml(it.url || "#")}" target="_blank" rel="noopener noreferrer">${escapeHtml(it.title || "")}</a><span class="wk-src">${kind === "v" ? "大V · " : ""}${escapeHtml(it.source || "")}</span></li>`;

  const logHtml = weekly
    .map((d) => {
      const rows = [
        ...(d.ai || []).slice(0, 4).map((it) => item(it, "ai")),
        ...(d.v || []).slice(0, 3).map((it) => item(it, "v")),
      ].join("");
      return `<section class="wk-day" data-search="${searchAttr([d.date, d.label, ...(d.ai || []).map((i) => i.title), ...(d.v || []).map((i) => i.title)])}">
  <div class="wk-day-mark">
    <span class="wk-day-num">${escapeHtml(d.date.slice(8))}</span>
    <span class="wk-day-wd">${escapeHtml(weekdayOf(d.label))}</span>
  </div>
  <div class="wk-day-main">
    <p class="wk-day-stat">杂志 ${(d.ai || []).length} · 大V ${(d.v || []).length}${d.aihot ? ` · AIHOT ${d.aihot}` : ""}</p>
    <ul class="wk-list">${rows || '<li class="muted-note">这一天没有收录</li>'}</ul>
  </div>
</section>`;
    })
    .join("\n");

  return `
<div class="weekly-panel">
  <header class="mod-hero mod-hero-weekly">
    <p class="mod-kicker">Weekly · 本周长文</p>
    <h2>一周回顾</h2>
    <p class="mod-sub">${escapeHtml(range)} · 杂志 ${totalAi} 条 · 大V ${totalV} 条，先读头条，再按日翻阅</p>
  </header>
  ${leadHtml}
  ${subsHtml}
  <div class="wk-log">${logHtml}</div>
</div>`;
}

function renderSpark(byDay, dates) {
  const counts = dates.map((dt) => (byDay && byDay[dt]) || 0);
  const max = Math.max(1, ...counts);
  return `<span class="spark" aria-hidden="true">${counts
    .map(
      (n) =>
        `<i class="spark-bar${n ? "" : " z"}" style="height:${n ? Math.round(18 + (n / max) * 82) : 10}%"></i>`
    )
    .join("")}</span>`;
}

function renderCreatorsPanel(creators, sparkDates) {
  if (!creators.length) {
    return `<div class="empty-state"><p>暂无创作者数据</p></div>`;
  }
  const dates = sparkDates || [];
  const cards = creators
    .map((c, i) => {
      const latest = c.latest || {};
      const latestUrl = escapeHtml(latest.url || "#");
      const tags = (c.topTags || [])
        .slice(0, 3)
        .map((t) => `<span class="creator-tag">${escapeHtml(t)}</span>`)
        .join("");
      return `<article class="creator-card${i < 3 ? " is-top" : ""}" data-search="${searchAttr([c.name, c.handle, ...(c.topTags || [])])}">
  <div class="creator-top">
    <div class="creator-avatar" aria-hidden="true">${escapeHtml(initials(c.name))}</div>
    <span class="creator-rank">#${i + 1}</span>
  </div>
  <h3 class="creator-name">${escapeHtml(c.name)}</h3>
  ${c.handle ? `<p class="creator-handle">${escapeHtml(c.handle)}</p>` : ""}
  <div class="creator-activity">
    ${renderSpark(c.byDay, dates)}
    <p class="creator-stats"><b>${c.count}</b> 帖 · ${c.dayCount} 天活跃</p>
  </div>
  ${tags ? `<div class="creator-tags">${tags}</div>` : ""}
  ${
    latest.title
      ? `<a class="creator-latest" href="${latestUrl}" target="_blank" rel="noopener noreferrer"><span class="creator-latest-label">最新</span>${escapeHtml(latest.title)}</a>`
      : ""
  }
</article>`;
    })
    .join("\n");

  return `
<div class="creators-panel">
  <header class="mod-hero mod-hero-creators">
    <p class="mod-kicker">Creators · 按人</p>
    <h2>创作者名片墙</h2>
    <p class="mod-sub">关注流里出现过的 ${creators.length} 位作者，按发帖量排序；柱状图是最近 ${dates.length || 14} 天的发帖节奏</p>
  </header>
  <div class="creator-grid">${cards}</div>
</div>`;
}

function renderTopicsPanel(topics) {
  if (!topics.length) {
    return `<div class="empty-state"><p>暂无专题数据</p></div>`;
  }
  const maxCount = Math.max(...topics.map((b) => b.count));
  const sorted = [...topics].sort((a, b) => b.count - a.count);

  const tiles = sorted
    .map((b, i) => {
      const ratio = b.count / maxCount;
      return `<button type="button" class="topic-tile${i === 0 ? " is-active" : ""}" data-topic="${escapeHtml(b.id)}" style="flex:${Math.max(1, b.count)} 1 ${Math.round(110 + ratio * 150)}px;--heat:${(0.12 + ratio * 0.5).toFixed(2)}">
  <span class="topic-tile-name">${escapeHtml(b.id)}</span>
  <span class="topic-tile-count">${b.count}</span>
</button>`;
    })
    .join("");

  const boards = sorted
    .map((b, i) => {
      const rows = b.items
        .map((it) => {
          const ch = it.channel === "v" ? "大V" : "杂志";
          return `<a class="topic-item" href="${escapeHtml(it.url || "#")}" target="_blank" rel="noopener noreferrer" data-search="${searchAttr([it.title, it.source, b.id])}">
  <span class="topic-item-title">${escapeHtml(it.title || "")}</span>
  <span class="topic-item-meta">${escapeHtml(it.day || "")} · ${ch} · ${escapeHtml(it.source || "")}</span>
</a>`;
        })
        .join("\n");
      return `<section class="topic-board${i === 0 ? " is-active" : ""}" id="topic-${escapeHtml(b.id)}" data-topic="${escapeHtml(b.id)}">
  <header class="topic-board-head">
    <h3>${escapeHtml(b.id)}</h3>
    <span class="topic-count">${b.count}</span>
  </header>
  <div class="topic-list">${rows}</div>
</section>`;
    })
    .join("\n");

  return `
<div class="topics-panel">
  <header class="mod-hero mod-hero-topics">
    <p class="mod-kicker">Topics · 按话题</p>
    <h2>话题地图</h2>
    <p class="mod-sub">近两周的杂志与大V按话题归类，方块越大越热；点一块展开明细</p>
  </header>
  <div class="topic-map" role="tablist" aria-label="话题">${tiles}</div>
  <div class="topic-boards">${boards}</div>
</div>`;
}

function renderFlashPanel(flashItems) {
  if (!flashItems.length) {
    return `<div class="empty-state"><p>暂无快讯</p></div>`;
  }
  const groups = [];
  const byDay = new Map();
  for (const it of flashItems) {
    if (!byDay.has(it.day)) {
      const g = { day: it.day, rows: [] };
      byDay.set(it.day, g);
      groups.push(g);
    }
    byDay.get(it.day).rows.push(it);
  }
  const stamp = (it) => String(it.published_at || "");
  const wire = groups
    .map((g) => {
      g.rows.sort((a, b) => stamp(b).localeCompare(stamp(a)));
      const rows = g.rows
        .map((it) => {
          const t = it.published_at ? String(it.published_at).slice(11, 16) : "--:--";
          return `<a class="wire-row" href="${escapeHtml(it.url || "#")}" target="_blank" rel="noopener noreferrer" data-search="${searchAttr([it.title, it.source, it.day])}" data-channel="${escapeHtml(it.channel)}">
  <time class="wire-time">${escapeHtml(t)}</time>
  <span class="wire-dot" title="${it.channel === "v" ? "大V" : "杂志"}"></span>
  <span class="wire-title">${escapeHtml(it.title || "")}</span>
  <span class="wire-src">${escapeHtml(it.source || "")}</span>
</a>`;
        })
        .join("\n");
      return `<section class="wire-day">
  <h3 class="wire-day-head"><span>${escapeHtml(g.day.slice(5).replace("-", "/"))}</span><em>${g.rows.length} 条</em></h3>
  ${rows}
</section>`;
    })
    .join("\n");

  return `
<div class="flash-panel">
  <header class="mod-hero mod-hero-flash">
    <p class="mod-kicker">Wire · 快讯流</p>
    <h2>快讯流</h2>
    <p class="mod-sub">近 7 日 ${flashItems.length} 条，去重，按时间倒序；青点为大V，灰点为杂志</p>
  </header>
  <div class="wire">${wire}</div>
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
  const aihotHtml = renderAihotPanel(aihotDaily, coverIndex || { byNorm: new Map(), byUrl: new Map(), byTitle: new Map() });
  const weeklyHtml = renderWeeklyPanel(weekly || []);
  const sparkDates = (days || []).slice(0, 14).map((d) => d.date).reverse();
  const creatorsHtml = renderCreatorsPanel(creators || [], sparkDates);
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
  <meta name="description" content="Alioxis News — 今日（AI新闻 · 大V视野 · AIHOT日报）· 回顾（本周长文 · 快讯流）· 发现（按人 · 按话题）" />
  <meta name="theme-color" content="#0c0c0e" />
  <meta name="color-scheme" content="dark" />
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&family=Noto+Serif+SC:wght@600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="${cssHref(depth)}" />
</head>
<body data-channel="ai" data-group="today">
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

  <nav class="tab-bar" aria-label="内容分区">
    <div class="tab-bar-inner group-bar" role="tablist" aria-label="分区">
      <button type="button" class="group-btn active" role="tab" aria-selected="true" data-group="today">今日<small>三个来源</small></button>
      <button type="button" class="group-btn" role="tab" aria-selected="false" data-group="review">回顾<small>往前看</small></button>
      <button type="button" class="group-btn" role="tab" aria-selected="false" data-group="explore">发现<small>换角度</small></button>
    </div>
    <div class="tab-bar-inner sub-bar" role="tablist" aria-label="频道">
      <button type="button" class="tab-btn active" role="tab" aria-selected="true" data-tab="ai" data-group="today" id="tab-ai">AI新闻</button>
      <button type="button" class="tab-btn" role="tab" aria-selected="false" data-tab="v" data-group="today" id="tab-v">大V视野</button>
      <button type="button" class="tab-btn tab-btn-aihot" role="tab" aria-selected="false" data-tab="aihot" data-group="today" id="tab-aihot">AIHOT日报</button>
      <button type="button" class="tab-btn" role="tab" aria-selected="false" data-tab="weekly" data-group="review" id="tab-weekly" hidden>本周长文</button>
      <button type="button" class="tab-btn" role="tab" aria-selected="false" data-tab="flash" data-group="review" id="tab-flash" hidden>快讯流</button>
      <button type="button" class="tab-btn" role="tab" aria-selected="false" data-tab="creators" data-group="explore" id="tab-creators" hidden>按人</button>
      <button type="button" class="tab-btn" role="tab" aria-selected="false" data-tab="topics" data-group="explore" id="tab-topics" hidden>按话题</button>
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
    <span>Alioxis News · 今日 / 回顾 / 发现</span>
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

function reportAihotCoverCoverage(days) {
  let total = 0;
  let withImg = 0;
  let entityReuse = 0;
  let kwFallback = 0;
  const misses = [];
  for (const day of days.slice(0, 5)) {
    if (!day.aihotDaily) continue;
    const coverIndex = buildCoverIndex(days, day.date);
    const items = [];
    for (const s of day.aihotDaily.sections || []) {
      for (const it of s.items || []) items.push(it);
    }
    for (const it of items) {
      total++;
      const cover = matchCover(it, coverIndex);
      if (cover) {
        withImg++;
        // Heuristic: entity-only reuse if fuzzy wouldn't have fired without entity pool
        // (logged lightly — real check is img vs kw)
      } else {
        kwFallback++;
        misses.push({ date: day.date, title: (it.title || "").slice(0, 60) });
      }
    }
  }
  console.log(
    `  AIHOT covers (≤5d): ${withImg}/${total} image · ${kwFallback} keyword-gradient (no letter initials)`
  );
  for (const m of misses.slice(0, 8)) {
    console.log(`    · kw-fallback ${m.date}: ${m.title}`);
  }
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
  reportAihotCoverCoverage(days);
}

main();
