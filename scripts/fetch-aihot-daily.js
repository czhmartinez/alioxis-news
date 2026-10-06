#!/usr/bin/env node
/**
 * Fetch AIHOT daily JSON into data/YYYY-MM-DD/_aihot_daily.json
 * Personal / non-commercial use; always preserves attribution.
 * Usage: node scripts/fetch-aihot-daily.js [YYYY-MM-DD]
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const UA = "alioxis-news/1.1 (+https://ainews.alioxis.com/; personal reader)";

function todayTaipei() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date()); // YYYY-MM-DD
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { "User-Agent": UA, Accept: "application/json" } },
      (res) => {
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${buf.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(buf));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(25000, () => {
      req.destroy(new Error("timeout"));
    });
  });
}


/** AIHOT API may return { report, schemaVersion } or a flat daily object. */
function unwrapDaily(payload) {
  if (!payload || typeof payload !== "object") return payload;
  if (
    payload.report &&
    typeof payload.report === "object" &&
    !Array.isArray(payload.report)
  ) {
    const daily = { ...payload.report };
    // Keep attribution / canonical from outer envelope if present and missing inside.
    if (payload.attribution && !daily.attribution) {
      daily.attribution = payload.attribution;
    }
    if (payload.canonical && !(daily.attribution && daily.attribution.canonical)) {
      daily.attribution = daily.attribution || {};
      if (!daily.attribution.canonical) daily.attribution.canonical = payload.canonical;
    }
    return daily;
  }
  return payload;
}

async function main() {
  const date = process.argv[2] || todayTaipei();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error("bad date:", date);
    process.exit(1);
  }
  const dayDir = path.join(DATA_DIR, date);
  fs.mkdirSync(dayDir, { recursive: true });

  const listUrl = `https://aihot.news/api/v1/dailies/${date}`;
  console.log("GET", listUrl);
  let daily;
  try {
    daily = await getJson(listUrl);
  } catch (e) {
    // fallback: latest from list
    console.warn("dated fetch failed:", e.message, "— trying list");
    const list = await getJson("https://aihot.news/api/v1/dailies?limit=5");
    const hit = (list.items || []).find((x) => x.date === date) || (list.items || [])[0];
    if (!hit) throw new Error("no dailies available");
    const d = hit.date;
    daily = await getJson(`https://aihot.news/api/v1/dailies/${d}`);
  }

  daily = unwrapDaily(daily);
  if (!daily || (!daily.date && !daily.lead && !(daily.sections && daily.sections.length))) {
    throw new Error("unexpected AIHOT daily shape (no date/lead/sections after unwrap)");
  }

  const out = path.join(dayDir, "_aihot_daily.json");
  fs.writeFileSync(out, JSON.stringify(daily, null, 2), "utf8");
  console.log("wrote", out);
  console.log(
    "lead:",
    (daily.lead && (daily.lead.title || daily.lead.leadTitle)) || "(none)"
  );
  if (daily.attribution) {
    console.log(
      "attribution:",
      daily.attribution.name || "",
      daily.attribution.url || daily.attribution.canonical || ""
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
