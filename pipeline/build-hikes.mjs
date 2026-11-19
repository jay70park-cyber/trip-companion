// Publishes the Hiking category (pipeline/hikes/mountains.json → <outDir>/hikes/index.json).
// Each mountain's Korean and English text is written by hand with sources. This script:
//  (1) routes the walk from the subway exit to the trailhead with TMAP (skipped when a bus ride is needed),
//  (2) translates the hand-written text into Japanese and Chinese (simplified / traditional) with Claude,
//      only for text that changed since the last run (cached by hash in the published file),
//  (3) writes hikes/index.json for the app.
import fs from "node:fs";
import path from "node:path";
import { fnv } from "./voice-lib.mjs";

const OUT = path.resolve(process.argv[2] || "out");
const DIR = path.join(OUT, "hikes");
const SRC = JSON.parse(fs.readFileSync(new URL("./hikes/mountains.json", import.meta.url), "utf8"));
const TMAP = process.env.TMAP_KEY || "";
const AI = process.env.ANTHROPIC_API_KEY || "";
const MODEL = process.env.AI_MODEL || "claude-haiku-5-5";
const TODAY = new Date().toISOString().slice(0, 10);
const LANGS = ["ja", "zhs", "zht"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let usd = 0;

async function walk(a, b) {
  if (!TMAP) return null;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch("https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1", {
        method: "POST", headers: { appKey: TMAP, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ startX: a.lng, startY: a.lat, endX: b.lng, endY: b.lat, startName: encodeURIComponent("A"), endName: encodeURIComponent("B"), reqCoordType: "WGS84GEO", resCoordType: "WGS84GEO" }),
      });
      const d = await res.json();
      const f = d?.features || [], p0 = f[0]?.properties, coords = [];
      for (const x of f) if (x.geometry?.type === "LineString") for (const c of x.geometry.coordinates) coords.push([+c[1].toFixed(6), +c[0].toFixed(6)]);
      await sleep(300);
      if (coords.length) return { path: coords, m: p0?.totalDistance ?? null, min: p0?.totalTime ? Math.round(p0.totalTime / 60) : null };
    } catch (e) { console.log(`  ! walk: ${e.message}`); await sleep(1500); }
  }
  return null;
}

async function translate(id, strings) {
  const keys = Object.keys(strings);
  const lang3 = { type: "object", properties: { ja: { type: "string" }, zhs: { type: "string" }, zht: { type: "string" } }, required: LANGS };
  const schema = { type: "object", properties: Object.fromEntries(keys.map((k) => [k, lang3])), required: keys };
  const prompt = `Translate these texts for a hiking guide app for foreign visitors to Korea into Japanese (ja), Simplified Chinese (zhs) and Traditional Chinese for Taiwan (zht).
Each item has the same text in Korean (ko) and English (en); use both, keep every fact, number and name, and keep the storytelling tone. Write place names the way guidebooks in that language usually do. Do not add anything.
${JSON.stringify(strings, null, 1)}`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "x-api-key": AI, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 16000, messages: [{ role: "user", content: prompt }], tools: [{ name: "submit", description: "Submit the translations.", input_schema: schema }], tool_choice: { type: "tool", name: "submit" } }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(`${id}: HTTP ${res.status} ${JSON.stringify(d).slice(0, 200)}`);
  const u = d.usage || {}; usd += ((u.input_tokens || 0) * 0.10 + (u.output_tokens || 0) * 0.50) / 1e6;
  const out = d.content?.find((c) => c.type === "tool_use")?.input;
  for (const k of keys) for (const l of LANGS) if (!out?.[k]?.[l]) throw new Error(`${id}: missing ${l} for ${k}`);
  return out;
}

fs.mkdirSync(DIR, { recursive: true });
const prevPath = path.join(DIR, "index.json");
const prev = fs.existsSync(prevPath) ? JSON.parse(fs.readFileSync(prevPath, "utf8")) : { mountains: [] };
const out = [];
for (const m of SRC.mountains) {
  console.log(`▶ ${m.id}`);
  const old = prev.mountains.find((x) => x.id === m.id);
  // text fields to translate: key → {ko, en}
  const fields = { name: m.name, intro: m.intro, time: m.time, season: m.season, "station.label": m.station.label, "trailhead.label": m.trailhead.label };
  if (m.notice) fields.notice = m.notice;
  if (m.transfer) fields.transfer = m.transfer;
  if (m.trailhead.text) fields["trailhead.text"] = m.trailhead.text;
  m.points.forEach((p, i) => { fields[`p${i}.name`] = p.name; fields[`p${i}.text`] = p.text; });
  const h = fnv(JSON.stringify(fields));
  let tr = old && old.h === h ? old.tr : null;
  if (!tr && AI) {
    try { tr = await translate(m.id, fields); console.log("  · translated"); }
    catch (e) { console.log(`  ! translation failed: ${e.message}`); tr = old?.tr || null; }
  }
  const full = (k) => ({ ...fields[k], ...(tr?.[k] || {}) });
  let leg = null;
  if (!m.transfer) {
    leg = (old && old.legKey === fnv(JSON.stringify([m.station, m.trailhead])) ? old.leg : null) || await walk(m.station, m.trailhead);
    console.log(`  · exit → trailhead: ${leg ? `${leg.m} m, ~${leg.min} min` : "no route — straight line"}`);
  }
  out.push({
    id: m.id, h, tr, legKey: fnv(JSON.stringify([m.station, m.trailhead])), leg,
    name: full("name"), heightM: m.heightM, difficulty: m.difficulty, upMin: m.upMin, shoes: m.shoes,
    time: full("time"), season: full("season"), intro: full("intro"),
    notice: m.notice ? full("notice") : null, transfer: m.transfer ? full("transfer") : null,
    station: { lat: m.station.lat, lng: m.station.lng, label: full("station.label") },
    trailhead: { lat: m.trailhead.lat, lng: m.trailhead.lng, label: full("trailhead.label"), text: m.trailhead.text ? full("trailhead.text") : null, sources: m.trailhead.sources || [] },
    points: m.points.map((p, i) => ({ n: i + 1, kind: p.kind, lat: p.lat, lng: p.lng, name: full(`p${i}.name`), text: full(`p${i}.text`), sources: p.sources || [] })),
    sources: m.sources || [],
  });
}
fs.writeFileSync(prevPath, JSON.stringify({ updated: TODAY, mountains: out }) + "\n");
console.log(`Done: ${out.length} mountains, translation cost ~$${usd.toFixed(3)}`);
