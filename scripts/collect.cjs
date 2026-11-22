#!/usr/bin/env node
/**
 * Alioxis News — $0 collector (v1)
 * Pure Node 20, zero dependencies. Run on the CVM:
 *   node scripts/collect.cjs            # today (Asia/Taipei)
 *   COLLECT_DATE=2026-11-23 node scripts/collect.cjs
 *
 * Env (all optional; without keys it runs in degraded mode):
 *   GROQ_API_KEY  – Groq llama-3.1-8b-instant, Chinese summary + tags
 *   WEIR_API_KEY  – Weir X search supplement (docs.weirapp.io, verified 2026-11-23):
 *                     POST https://api.weirapp.io/v1/x/search, Bearer weir_live_...,
 *                     5 keywords x 20 posts/day ≈ 105 credits/day of 5,000/month free
 *
 * Output (matches build.js input schema exactly):
 *   data/<YYYY-MM-DD>/ai.json            – [{title, summary, url, source,
 *                                            source_handle, published_at, tags}]
 *   data/<YYYY-MM-DD>/v.json             – same schema, social / 大V items
 *   data/<YYYY-MM-DD>/_aihot_daily.json  – raw AIHOT daily payload
 *   data/<YYYY-MM-DD>/_wool_raw.json     – raw deals/index payloads (for /wool)
 * image is omitted on purpose: build.js falls back to keyword-gradient covers.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const TZ = "Asia/Taipei";

function todayStr() {
  const d = process.env.COLLECT_DATE
    ? new Date(process.env.COLLECT_DATE + "T12:00:00+08:00")
    : new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
  return parts; // YYYY-MM-DD
}
const DATE = todayStr();
const DAY_DIR = path.join(ROOT, "data", DATE);

const GROQ_KEY = process.env.GROQ_API_KEY || "";
const WEIR_KEY = process.env.WEIR_API_KEY || "";

// ---------------------------------------------------------------- sources
const RSS_FEEDS = [
  { url: "https://openai.com/news/rss.xml", source: "OpenAI", handle: "@OpenAI" },
  { url: "https://blog.google/rss/", source: "Google Blog", handle: "@Google" },
  { url: "https://huggingface.co/blog/feed.xml", source: "Hugging Face", handle: "@huggingface" },
  { url: "https://news.google.com/rss/search?q=artificial%20intelligence&hl=zh-CN&gl=CN&ceid=CN:zh-Hans", source: "Google News", handle: "" },
];
const HN_API = "https://hn.algolia.com/api/v1/search_by_date?tags=story&query=artificial%20intelligence&hitsPerPage=30";
const BLUESKY_ACCOUNTS = [
  { actor: "chinesewsj.bsky.social", source: "ChineseWSJ", handle: "@ChineseWSJ" },
  { actor: "testingcatalog.com", source: "TestingCatalog", handle: "@testingcatalog" },
];
const WOOL_SOURCES = [
  "https://raw.githubusercontent.com/RomeroYang/free-llm-api-deals/main/deals.json",
  "https://raw.githubusercontent.com/mvalentsev/awesome-free-ai-coding/main/index.json",
];

async function fetchText(url, timeoutMs = 30000, retries = 1) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), timeoutMs);
    try {
      const r = await fetch(url, { signal: c.signal, headers: { "User-Agent": "alioxis-news-collector/1.0" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) {
      if (attempt === retries) throw e;
      await new Promise((r) => setTimeout(r, 2000));
    } finally { clearTimeout(t); }
  }
}
async function fetchJson(url, timeoutMs = 20000) {
  return JSON.parse(await fetchText(url, timeoutMs));
}

function stripHtml(s) {
  return String(s || "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}
function parseRss(xml) {
  const items = [];
  const blocks = xml.match(/<(item|entry)>[\s\S]*?<\/(item|entry)>/g) || [];
  for (const b of blocks) {
    const tag = (n) => {
      const m = b.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)<\\/${n}>`));
      return m ? stripHtml(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")) : "";
    };
    const linkM = b.match(/<link[^>]*href="([^"]+)"/);
    const title = tag("title");
    const url = linkM ? linkM[1] : tag("link");
    const pub = tag("pubDate") || tag("published") || tag("updated");
    const desc = tag("description") || tag("summary") || tag("content");
    if (title && url) items.push({ title, url, published_at: pub, description: desc });
  }
  return items;
}
function normUrl(u) {
  try {
    const x = new URL(u);
    x.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((k) => x.searchParams.delete(k));
    return x.toString().replace(/\/$/, "");
  } catch { return u; }
}

// ---------------------------------------------------------------- Groq
async function groqSummarize(cands) {
  // cands: [{title, description, url, source}] -> [{title, summary, tags}]
  if (!GROQ_KEY) return null;
  const out = [];
  for (let i = 0; i < cands.length; i += 6) {
    const chunk = cands.slice(i, i + 6);
    const prompt = `你是中文科技新闻编辑。把下列英文科技新闻改写成中文日报条目，返回 JSON 数组，` +
      `每项 {"title": "中文标题（20字以内）", "summary": "中文摘要（120-180字，说明事实、数字与影响）", ` +
      `"tags": ["3-6个标签，中英文皆可"] }，顺序与输入一致，只返回 JSON，不要解释。\n` +
      chunk.map((c, j) => `${j + 1}. [${c.source}] ${c.title}\n${(c.description || "").slice(0, 600)}\n${c.url}`).join("\n\n");
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant", temperature: 0.3,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!r.ok) { console.error("Groq HTTP", r.status, await r.text().then((t) => t.slice(0, 200))); return null; }
    const j = await r.json();
    const text = j.choices?.[0]?.message?.content || "";
    const m = text.match(/\[[\s\S]*\]/);
    if (!m) { console.error("Groq: no JSON array in reply"); return null; }
    try { out.push(...JSON.parse(m[0])); } catch (e) { console.error("Groq JSON parse fail", e.message); return null; }
  }
  return out;
}
function degraded(c) {
  return {
    title: c.title.slice(0, 60),
    summary: (c.description || c.title).slice(0, 200),
    tags: [c.source],
  };
}

// ---------------------------------------------------------------- main
async function main() {
  const aiCands = [];
  const vCands = [];
  const seen = new Set();
  const pushAi = (c) => {
    const k = normUrl(c.url);
    if (!k || seen.has(k)) return;
    seen.add(k);
    aiCands.push(c);
  };

  // 1. AIHOT daily (raw passthrough). Today's daily may not be published yet
  // at 00:30 cron time, so fall back to yesterday's.
  let aihot = null;
  const aihotDates = [DATE];
  {
    const d = new Date(DATE + "T12:00:00+08:00");
    d.setDate(d.getDate() - 1);
    aihotDates.push(d.toISOString().slice(0, 10));
  }
  for (const dt of aihotDates) {
    try {
      aihot = await fetchJson(`https://aihot.news/api/v1/dailies/${dt}`);
      console.log(`AIHOT: ok for ${dt} (${Array.isArray(aihot?.items) ? aihot.items.length : "?"} items)`);
      break;
    } catch (e) { console.error(`AIHOT ${dt} fail:`, e.message); }
  }

  // 2. Vendor RSS + Google News RSS
  for (const f of RSS_FEEDS) {
    try {
      const items = parseRss(await fetchText(f.url));
      console.log(`RSS ${f.source}: ${items.length}`);
      for (const it of items.slice(0, 12)) {
        pushAi({ title: it.title, description: it.description, url: it.url,
                 source: f.source, handle: f.handle, published_at: it.published_at });
      }
    } catch (e) { console.error(`RSS ${f.source} fail:`, e.message); }
  }

  // 3. Hacker News Algolia (last 24h-ish, top by points)
  try {
    const hn = await fetchJson(HN_API);
    const hits = (hn.hits || []).filter((h) => h.url).sort((a, b) => (b.points || 0) - (a.points || 0)).slice(0, 8);
    console.log(`HN: ${hits.length}`);
    for (const h of hits) {
      pushAi({ title: h.title, description: "", url: h.url, source: "Hacker News",
               handle: "", published_at: h.created_at });
    }
  } catch (e) { console.error("HN fail:", e.message); }

  // 4. Bluesky author feeds -> v channel (social)
  for (const a of BLUESKY_ACCOUNTS) {
    try {
      const feed = await fetchJson(
        `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(a.actor)}&limit=15`);
      const posts = (feed.feed || []).slice(0, 8);
      console.log(`Bluesky ${a.actor}: ${posts.length}`);
      for (const p of posts) {
        const post = p.post?.record;
        if (!post?.text) continue;
        const uri = p.post?.uri || "";
        const rkey = uri.split("/").pop();
        vCands.push({
          title: post.text.slice(0, 80), description: post.text,
          url: `https://bsky.app/profile/${a.actor}/post/${rkey}`,
          source: a.source, handle: a.handle,
          published_at: post.createdAt || "",
        });
      }
    } catch (e) { console.error(`Bluesky ${a.actor} fail:`, e.message); }
  }

  // 5. Weir X search supplement (1 round/day, 5 keywords x 20 posts ≈ 105 credits
  //    of the 5,000/month free tier; failed calls cost nothing). Results go to
  //    the v channel as social leads, never straight to the front page.
  const WEIR_QUERIES = ["free credits", "羊毛", "限时免费", "OpenAI launch", "Anthropic launch"];
  if (WEIR_KEY) {
    const since = new Date(Date.now() - 86400000).toISOString().slice(0, 10) + "T00:00:00Z";
    const until = new Date().toISOString().slice(0, 10) + "T00:00:00Z";
    for (const q of WEIR_QUERIES) {
      try {
        const r = await fetch("https://api.weirapp.io/v1/x/search", {
          method: "POST",
          headers: { Authorization: `Bearer ${WEIR_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query: q, since, until, limit: 20 }),
        });
        if (!r.ok) { console.error(`Weir search "${q}" HTTP`, r.status); continue; }
        const j = await r.json();
        const posts = j.data || [];
        console.log(`Weir "${q}": ${posts.length}`);
        for (const p of posts) {
          if (!p.url || seen.has(normUrl(p.url))) continue;
          seen.add(normUrl(p.url));
          vCands.push({
            title: (p.text || "").slice(0, 80), description: p.text || "",
            url: p.url, source: "X via Weir", handle: "@" + (p.author?.username || ""),
            published_at: p.createdAt || "",
          });
        }
      } catch (e) { console.error(`Weir search "${q}" fail:`, e.message); }
      await new Promise((r) => setTimeout(r, 1500)); // search counts 2/min against the limit
    }
  } else {
    console.log("Weir: no key – skipped");
  }

  // 6. Wool raw payloads (for /wool v1, consumed later)
  const woolRaw = {};
  for (const u of WOOL_SOURCES) {
    try { woolRaw[u.split("/").pop()] = await fetchJson(u); console.log(`wool ${u.split("/").pop()}: ok`); }
    catch (e) { console.error("wool fail:", u, e.message); }
  }

  // 7. Rank + summarize. Cap each source at 3 in the first pass so vendor
  // blogs can't crowd out Google News / HN discovery, then fill the rest
  // by recency. (Without the cap, OpenAI + Google Blog alone filled all 15.)
  const tier = (s) => ({ "OpenAI": 0, "Anthropic": 0, "Google Blog": 0, "Hugging Face": 0 }[s] ?? 1);
  const sorted = [...aiCands].sort((a, b) => tier(a.source) - tier(b.source)
    || String(b.published_at || "").localeCompare(String(a.published_at || "")));
  const top = [];
  const perSource = {};
  for (const c of sorted) {
    if (top.length >= 15) break;
    if ((perSource[c.source] || 0) >= 3) continue;
    perSource[c.source] = (perSource[c.source] || 0) + 1;
    top.push(c);
  }
  if (top.length < 15) {
    const rest = sorted.filter((c) => !top.includes(c))
      .sort((a, b) => String(b.published_at || "").localeCompare(String(a.published_at || "")));
    for (const c of rest) { if (top.length >= 15) break; top.push(c); }
  }
  let sum = null;
  if (GROQ_KEY) {
    sum = await groqSummarize(top);
    console.log(`Groq: ${sum ? sum.length + " summarized" : "failed, falling back to degraded mode"}`);
  } else {
    console.log("Groq: no key – degraded mode (no Chinese summary, raw titles kept)");
  }
  const ai = top.map((c, i) => {
    const s = sum?.[i] || degraded(c);
    return {
      title: s.title || c.title,
      summary: s.summary || "",
      url: c.url,
      source: c.source,
      source_handle: c.handle || "",
      published_at: c.published_at || "",
      tags: s.tags || [c.source],
    };
  });
  const v = vCands.slice(0, 12).map((c) => ({
    title: c.title, summary: c.description.slice(0, 200), url: c.url,
    source: c.source, source_handle: c.handle || "",
    published_at: c.published_at || "", tags: [c.source],
  }));

  // 8. Write
  fs.mkdirSync(DAY_DIR, { recursive: true });
  fs.writeFileSync(path.join(DAY_DIR, "ai.json"), JSON.stringify(ai, null, 2), "utf8");
  fs.writeFileSync(path.join(DAY_DIR, "v.json"), JSON.stringify(v, null, 2), "utf8");
  if (aihot) fs.writeFileSync(path.join(DAY_DIR, "_aihot_daily.json"), JSON.stringify(aihot, null, 2), "utf8");
  if (Object.keys(woolRaw).length) {
    fs.writeFileSync(path.join(DAY_DIR, "_wool_raw.json"), JSON.stringify(woolRaw, null, 2), "utf8");
  }
  console.log(`Wrote ${DATE}: ai=${ai.length} v=${v.length} aihot=${aihot ? "yes" : "no"} wool=${Object.keys(woolRaw).length}`);
}

main().catch((e) => { console.error("collector failed:", e); process.exit(1); });
