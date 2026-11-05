// Builds automatic walking courses and writes them as JSON files.
//
//   node pipeline/build-courses.mjs <outDir>
//
// Keys (environment variables; any that are missing switch that step off):
//   TOURAPI_KEY          data.go.kr key (Decoding)          → official places, descriptions, Odii audio
//   TMAP_KEY             SK open API appKey                 → walking paths between stops
//   ANTHROPIC_API_KEY    AI with web search: trending places (with sources), commentary, fact check, translation
//   AI_MODEL             optional, defaults to claude-haiku-5-5
//   ONLY_ZONES           optional, comma-separated zone ids
//
// Output: <outDir>/courses/index.json and <outDir>/courses/<zone>.json
// If a zone fails or does not pass validation, its previous file is kept.

import fs from "node:fs";
import path from "node:path";
import { ZONES, LANGS, KTO_SERVICE, KTO_TYPES, ODII_LANG } from "./zones.mjs";
import * as L from "./lib.mjs";

const OUT = path.resolve(process.argv[2] || "out");
const DIR = path.join(OUT, "courses");
const env = (k) => (process.env[k] || "").replace(/[^\x21-\x7E]/g, "");
const KEY = {
  tour: env("TOURAPI_KEY"), tmap: env("TMAP_KEY"),
  ai: env("ANTHROPIC_API_KEY"), model: env("AI_MODEL") || "claude-haiku-5-5",
};
const NOW = new Date();
const TODAY = NOW.toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

/* ---------------- network helpers ---------------- */
async function http(url, opt = {}, tries = 2) {
  for (let i = 0; i < tries; i++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), opt.timeout || 25000);
    try {
      const res = await fetch(url, { ...opt, signal: ctl.signal });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 160)}`);
      return text;
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(1500);
    } finally { clearTimeout(timer); }
  }
}

async function kto(service, op, params) {
  const enc = KEY.tour.includes("%") ? KEY.tour : encodeURIComponent(KEY.tour);
  const qs = new URLSearchParams({ MobileOS: "ETC", MobileApp: "KTripCompanion", _type: "json", ...params });
  const text = await http(`https://apis.data.go.kr/B551011/${service}/${op}?serviceKey=${enc}&${qs}`);
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`${service}/${op}: ${text.slice(0, 160)}`); }
  const h = data.response && data.response.header;
  if (!h || h.resultCode !== "0000") throw new Error(`${service}/${op}: ${(h && h.resultMsg) || text.slice(0, 160)}`);
  const it = data.response.body && data.response.body.items && data.response.body.items.item;
  await sleep(120);
  return !it ? [] : Array.isArray(it) ? it : [it];
}

const ktoCache = new Map();
async function ktoNear(lang, center, radiusM) {
  const key = `${lang}|${center.lat}|${center.lng}|${radiusM}`;
  if (ktoCache.has(key)) return ktoCache.get(key);
  const types = lang === "ko" ? KTO_TYPES.ko : KTO_TYPES.foreign;
  let all = [];
  for (const t of types) {
    const items = await kto(KTO_SERVICE[lang], "locationBasedList2", {
      mapX: String(center.lng), mapY: String(center.lat), radius: String(radiusM),
      contentTypeId: t, arrange: "E", numOfRows: "40", pageNo: "1",
    }).catch((e) => { log(`  ! ${lang} list: ${e.message}`); return []; });
    all = all.concat(items);
  }
  const out = all
    .map((x) => ({ ...x, lat: +x.mapy, lng: +x.mapx }))
    .filter((x) => isFinite(x.lat) && isFinite(x.lng));
  ktoCache.set(key, out);
  return out;
}

async function ktoOverview(lang, contentid) {
  const items = await kto(KTO_SERVICE[lang], "detailCommon2", { contentId: String(contentid) }).catch(() => []);
  return (items[0] && items[0].overview) || "";
}

async function odiiNear(lang, at, radiusM = 120) {
  const code = ODII_LANG[lang];
  if (!code) return [];
  const items = await kto("Odii", "storyLocationBasedList", {
    langCode: code, mapX: String(at.lng), mapY: String(at.lat), radius: String(radiusM), numOfRows: "10", pageNo: "1",
  }).catch(() => []);
  return items.map((x) => ({
    title: x.audioTitle || x.title || "",
    url: String(x.audioUrl || "").replace(/^http:/, "https:"),
    script: L.stripTags(x.script || ""),
    lat: +(x.mapY ?? x.mapy), lng: +(x.mapX ?? x.mapx),
  }));
}

// TMAP place search: confirms a place exists and gives its position (free daily quota on the TMAP plan).
async function tmapPoi(keyword, near, radiusKm = 2) {
  if (!KEY.tmap) return [];
  const qs = new URLSearchParams({
    version: "1", searchKeyword: keyword, searchType: "all", page: "1", count: "5",
    reqCoordType: "WGS84GEO", resCoordType: "WGS84GEO", searchtypCd: "A",
    centerLon: String(near.lng), centerLat: String(near.lat), radius: String(radiusKm),
  });
  try {
    const text = await http(`https://apis.openapi.sk.com/tmap/pois?${qs}`, { headers: { appKey: KEY.tmap, Accept: "application/json" } });
    await sleep(200);
    if (!text.trim()) return [];
    const pois = JSON.parse(text)?.searchPoiInfo?.pois?.poi || [];
    return pois.map((p) => ({
      name: p.name || "", lat: +(p.noorLat || p.frontLat), lng: +(p.noorLon || p.frontLon),
      category: [p.upperBizName, p.middleBizName, p.lowerBizName, p.detailBizName].filter(Boolean).join(">"),
      address: p.newAddressList?.newAddress?.[0]?.fullAddressRoad || [p.upperAddrName, p.middleAddrName, p.lowerAddrName].filter(Boolean).join(" "),
    })).filter((p) => isFinite(p.lat) && isFinite(p.lng));
  } catch (e) { log(`  ! place search ${keyword}: ${e.message}`); return []; }
}

async function walkLeg(a, b) {
  if (!KEY.tmap) return null;
  try {
    const text = await http("https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1", {
      method: "POST",
      headers: { appKey: KEY.tmap, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        startX: a.lng, startY: a.lat, endX: b.lng, endY: b.lat,
        startName: encodeURIComponent("A"), endName: encodeURIComponent("B"),
        reqCoordType: "WGS84GEO", resCoordType: "WGS84GEO",
      }),
    });
    const d = JSON.parse(text);
    const f = d.features || [];
    const p0 = f[0] && f[0].properties;
    const coords = [];
    for (const x of f) if (x.geometry && x.geometry.type === "LineString") for (const c of x.geometry.coordinates) coords.push([+c[1].toFixed(6), +c[0].toFixed(6)]);
    await sleep(250);
    return { coords, distance: p0 ? p0.totalDistance : null, time: p0 ? p0.totalTime : null };
  } catch (e) { log(`  ! walk leg: ${e.message}`); return null; }
}

// Calls the model. With `schema`, the answer comes back through a forced "submit" tool, so it is always valid JSON.
// With `webSearch`, the model may search the web first; the reply is free text plus citations.
async function ai(prompt, maxTokens = 4000, { webSearch = 0, schema = null } = {}) {
  const body = { model: KEY.model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] };
  if (webSearch) body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: webSearch, user_location: { type: "approximate", country: "KR", timezone: "Asia/Seoul" } }];
  else if (schema) { body.tools = [{ name: "submit", description: "Submit the result.", input_schema: schema }]; body.tool_choice = { type: "tool", name: "submit" }; }
  const citations = [], results = [];
  let text = "", submitted = null;
  for (let turn = 0; turn < 4; turn++) {
    const raw = await http("https://api.anthropic.com/v1/messages", {
      method: "POST", timeout: 240000,
      headers: { "x-api-key": KEY.ai, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = JSON.parse(raw);
    for (const c of data.content || []) {
      if (c.type === "text") { text += c.text; for (const ci of c.citations || []) citations.push({ url: ci.url, title: ci.title, cited: ci.cited_text }); }
      if (c.type === "tool_use" && c.name === "submit") submitted = c.input;
      if (c.type === "web_search_tool_result" && Array.isArray(c.content)) for (const r of c.content) if (r.url) results.push({ url: r.url, title: r.title, age: r.page_age || "" });
    }
    if (data.stop_reason !== "pause_turn") break;
    body.messages = [...body.messages, { role: "assistant", content: data.content }];  // let a long search finish
  }
  if (schema && !webSearch) { if (!submitted) throw new Error("model did not return a result"); return submitted; }
  if (webSearch) return { text, citations, results };
  return L.parseJson(text);
}

const S = {
  str: { type: "string" }, int: { type: "integer" },
  langs4: { type: "object", properties: { ko: { type: "string" }, ja: { type: "string" }, zhs: { type: "string" }, zht: { type: "string" } }, required: ["ko", "ja", "zhs", "zht"] },
};
const SCHEMA = {
  places: { type: "object", required: ["places"], properties: { places: { type: "array", items: { type: "object", required: ["name", "sources"], properties: {
    name: S.str, category: S.str, why: S.str,
    sources: { type: "array", items: { type: "object", required: ["url"], properties: { url: S.str, title: S.str } } } } } } } },
  draft: { type: "object", required: ["intro", "stops"], properties: { intro: S.str, stops: { type: "array", items: { type: "object", required: ["n", "name_en", "text_en"], properties: { n: S.int, name_en: S.str, text_en: S.str } } } } },
  checked: { type: "object", required: ["intro", "stops"], properties: { intro: S.str, stops: { type: "array", items: { type: "object", required: ["n", "text_en"], properties: { n: S.int, text_en: S.str } } } } },
  translated: { type: "object", required: ["intro", "stops"], properties: { intro: S.langs4, stops: { type: "array", items: { type: "object", required: ["n", "name", "text"], properties: { n: S.int, name: S.langs4, text: S.langs4 } } } } },
};

/* ---------------- step 1: trending places from a web search (AI web search tool + TMAP place check) ---------------- */
async function hotCandidates(z) {
  if (!KEY.ai || !KEY.tmap) { log("  · trending places skipped (needs AI + TMAP keys)"); return []; }
  const since = new Date(NOW.getTime() - 90 * 86400000).toISOString().slice(0, 10);
  let found;
  try {
    found = await ai(
`Search the web (Korean blogs, news, travel and magazine sites) for places in or right around ${z.name.ko} (${z.name.en}), Korea, that visitors have been recommending recently (pages dated after ${since}).
Try several searches, for example: ${z.queries.join(", ")}.
Write a list of up to 15 specific named places worth walking to (cafés, restaurants, streets, shops, galleries, pop-up stores, landmarks). For each place give its Korean name and every page you found that recommends it.
Skip bars, pubs, clubs, hotels, motels, clinics, places outside ${z.name.ko}, and pages marked as sponsored (협찬, 체험단, 원고료, 광고).`,
      6000, { webSearch: 6 });
  } catch (e) { log(`  ! web search: ${e.message}`); return []; }
  log(`  · web search: ${found.results.length} pages, ${found.citations.length} citations`);

  const pages = [...new Map([...found.results, ...found.citations].map((r) => [r.url, r])).values()];
  let res;
  try {
    res = await ai(
`Turn these research notes into a list of places. Use only places named in the notes.
For each place list ALL pages from PAGES that mention or recommend it (use their exact URLs). Do not invent URLs.
"why" is one short English sentence that only repeats what the notes say about the place.

NOTES
${found.text}

PAGES
${pages.map((r) => `- ${r.url} | ${r.title || ""}${r.cited ? " | " + r.cited : ""}`).join("\n")}`,
      4000, { schema: SCHEMA.places });
  } catch (e) { log(`  ! place list: ${e.message}`); return []; }

  const cites = found.citations;
  const known = new Set(pages.map((r) => r.url));
  const sourceKey = (u) => { try { const x = new URL(u); return x.host + "/" + (x.pathname.split("/")[1] || ""); } catch { return u; } };
  const places = (res.places || []).filter((p) => p && p.name && Array.isArray(p.sources))
    .map((p) => {
      const extra = cites.filter((c) => c.cited && c.cited.includes(p.name)).map((c) => ({ url: c.url, title: c.title }));
      const all = [...p.sources, ...extra].filter((x) => known.has(x.url));  // only pages the search really returned
      return { ...p, sources: [...new Map(all.map((x) => [x.url, x])).values()] };
    })
    .filter((p) => new Set(p.sources.map((x) => sourceKey(x.url))).size >= 2);
  log(`  · ${(res.places || []).length} places named, ${places.length} with 2+ independent sources`);

  const out = [];
  for (const p of places) {
    const pois = await tmapPoi(`${p.name}`, z.start, Math.ceil((z.radiusM + 300) / 1000));
    const want = p.name.replace(/\s/g, "");
    const hit = pois.find((x) => { const n = x.name.replace(/\s/g, ""); return n.includes(want) || want.includes(n); });
    if (!hit || L.meters(z.start, hit) > z.radiusM + 300) continue;
    if (!L.allowedCategory(hit.category)) continue;
    const quoted = cites.filter((c) => p.sources.some((x) => x.url === c.url)).map((c) => c.cited).filter(Boolean).slice(0, 4);
    out.push({
      kind: "hot", lat: hit.lat, lng: hit.lng, nameKo: hit.name, category: hit.category || p.category, address: hit.address,
      sources: p.sources.slice(0, 4).map((x) => ({ label: x.title || x.url, url: x.url })),
      blog: [p.why, ...quoted].filter(Boolean),
    });
  }
  log(`  · ${out.length} trending places confirmed on the map`);
  return out;
}

/* ---------------- step 2: official places ---------------- */
async function officialCandidates(z) {
  if (!KEY.tour) return [];
  const en = await ktoNear("en", z.start, z.radiusM);
  return en
    .filter((x) => x.title && L.isSight(x.title))
    .map((x) => ({ kind: "official", lat: x.lat, lng: x.lng, nameEn: L.stripKoParen(x.title), enId: x.contentid, image: (x.firstimage || "").replace(/^http:/, "https:"), dist: +x.dist || L.meters(z.start, x) }))
    .sort((a, b) => (b.image ? 1 : 0) - (a.image ? 1 : 0) || a.dist - b.dist);
}

/* ---------------- step 3: names, descriptions and audio per stop ---------------- */
async function enrichOfficial(z, stop) {
  stop.name = {}; stop.official = {};
  for (const l of LANGS) {
    const list = await ktoNear(l, z.start, z.radiusM);
    const near = list.map((x) => ({ x, d: L.meters(stop, x) })).filter((o) => o.d < 80).sort((a, b) => a.d - b.d)[0];
    if (!near) continue;
    stop.name[l] = l === "ko" ? String(near.x.title || "") : L.stripKoParen(near.x.title);
    stop.official[l] = await ktoOverview(l, near.x.contentid);
    if (l === "ko") stop.nameKo = near.x.title;
  }
}

async function enrichAudio(stop) {
  stop.audio = {}; stop.scripts = {};
  if (!KEY.tour) return;
  for (const l of ["en", "ko", "ja"]) {
    const items = await odiiNear(l, stop, 80);
    const a = items.find((x) => x.url) || items[0];
    if (!a) continue;
    if (a.url) stop.audio[l] = { url: a.url, title: a.title };
    if (a.script) stop.scripts[l] = a.script.slice(0, 1200);
  }
}

/* ---------------- step 4: commentary (AI with fact check, or official text) ---------------- */
function sourcesFor(s) {
  const parts = [];
  if (s.nameKo) parts.push(`Korean name: ${s.nameKo}`);
  if (s.nameEn) parts.push(`English name: ${s.nameEn}`);
  if (s.category) parts.push(`Category: ${s.category}`);
  for (const l of ["en", "ko"]) if (s.official && s.official[l]) parts.push(`Official description (${l}): ${L.firstSentences(s.official[l], 6)}`);
  for (const l of ["en", "ko"]) if (s.scripts && s.scripts[l]) parts.push(`Audio guide script (${l}): ${s.scripts[l].slice(0, 700)}`);
  if (s.blog && s.blog.length) parts.push(`Recent web mentions: ${s.blog.map((b) => `"${b}"`).join(" | ")}`);
  return parts.join("\n");
}

async function writeCommentary(z, stops) {
  const block = stops.map((s) => `### STOP ${s.n}\n${sourcesFor(s)}`).join("\n\n");
  const gen = await ai(
`You write a self-guided walking tour of ${z.name.en} (${z.name.ko}), Korea, for foreign visitors.
For each stop write 2–4 short sentences (max 70 words) in plain English.
Use ONLY facts found in that stop's SOURCES. Do not invent history, dates, prices, opening hours, menus or rankings.
For places known only from visitor posts, say what kind of place it is and what visitors mention, e.g. "Visitors often mention…".
Also give an English display name: the official English name if given, otherwise the Korean name romanized followed by the type, e.g. "Cafe Layered (café)".
Write a 2-sentence intro for the whole walk using only the sources.
Submit the intro and one entry per stop.

${block}`, 6000, { schema: SCHEMA.draft });

  const draft = gen.stops.map((g) => `### STOP ${g.n}\nTEXT: ${g.text_en}\nSOURCES:\n${sourcesFor(stops.find((s) => s.n === g.n) || {})}`).join("\n\n");
  const checked = await ai(
`Fact-check this walking tour. For each stop, delete every sentence in TEXT that makes a claim not supported by that stop's SOURCES (paraphrase is fine; general wording like "a popular spot" is fine only if the sources say visitors recommend it).
If nothing remains, write one sentence that only states what kind of place it is according to the sources.
Also check the INTRO against all sources in the same way.
Submit the corrected intro and one entry per stop.

INTRO: ${gen.intro}

${draft}`, 6000, { schema: SCHEMA.checked });

  const en = new Map(checked.stops.map((x) => [x.n, x.text_en]));
  const names = new Map(gen.stops.map((x) => [x.n, x.name_en]));
  const tr = await ai(
`Translate this walking tour into Korean (ko), Japanese (ja), Simplified Chinese (zhs) and Traditional Chinese (zht).
Translate faithfully. Do not add or remove information.
For the Korean place name, use KO_NAME exactly when it is given.
Submit the intro and one entry per stop, each with name and text in ko, ja, zhs and zht.

INTRO: ${checked.intro}

${stops.map((s) => `### STOP ${s.n}\nNAME: ${names.get(s.n) || s.nameEn || s.nameKo}\nKO_NAME: ${s.nameKo || ""}\nTEXT: ${en.get(s.n) || ""}`).join("\n\n")}`, 12000, { schema: SCHEMA.translated });

  const intro = { en: checked.intro, ...tr.intro };
  for (const s of stops) {
    const t = tr.stops.find((x) => x.n === s.n) || { name: {}, text: {} };
    s.name = { ...(s.name || {}), en: s.name?.en || names.get(s.n) || s.nameEn };
    for (const l of ["ko", "ja", "zhs", "zht"]) s.name[l] = s.name[l] || t.name[l] || s.nameKo || s.name.en;
    if (s.nameKo) s.name.ko = s.nameKo;
    s.text = { en: en.get(s.n) || "", ko: t.text.ko, ja: t.text.ja, zhs: t.text.zhs, zht: t.text.zht };
  }
  return intro;
}

function officialCommentary(z, stops) {
  for (const s of stops) {
    s.name = s.name || {};
    s.text = {};
    for (const l of LANGS) {
      s.name[l] = s.name[l] || s.name.en || s.nameEn || s.nameKo;
      s.text[l] = L.firstSentences(s.official?.[l], 3) || L.firstSentences(s.official?.en, 3);
    }
  }
  return null;
}

/* ---------------- step 5: assemble one zone ---------------- */
async function buildZone(z) {
  log(`\n▶ ${z.id} (${z.type})`);
  const official = await officialCandidates(z);
  log(`  · ${official.length} official places within ${z.radiusM} m`);
  const hot = await hotCandidates(z);

  // mix: trending areas lead with trending places; heritage areas lead with official sites
  const wantHot = z.type === "hot" ? 6 : 2;
  const wantOfficial = z.type === "hot" ? 3 : 8;
  let cands = L.dedupe([...official.slice(0, wantOfficial), ...hot.slice(0, wantHot), ...official.slice(wantOfficial, wantOfficial + 4)], 40);
  const fit = L.fitWalk(z.start, cands, { maxLeg: 900, maxTotal: 3000, minStops: 4, maxStops: z.type === "hot" ? 8 : 9 });
  if (!fit) throw new Error("could not fit a walkable course");
  const stops = fit.stops.map((s, i) => ({ ...s, n: i + 1 }));
  log(`  · ${stops.length} stops, ~${fit.straightM} m straight-line`);

  for (const s of stops) {
    if (s.kind === "official") { await enrichOfficial(z, s); await enrichAudio(s); }
    else { s.name = { ko: s.nameKo }; s.audio = {}; s.scripts = {}; }  // audio stories are about heritage sites, not shops
  }

  let intro = null;
  if (KEY.ai) {
    try { intro = await writeCommentary(z, stops); }
    catch (e) { log(`  ! AI commentary failed, using official text: ${e.message}`); }
  }
  if (!intro) {
    // without AI, only official places have trustworthy text
    const kept = stops.filter((s) => s.kind === "official");
    stops.length = 0; kept.forEach((s, i) => stops.push({ ...s, n: i + 1 }));
    officialCommentary(z, stops);
  }

  // walking path
  const legs = [];
  let path = [[z.start.lat, z.start.lng]], walkM = 0, walkS = 0;
  for (let i = 0; i < stops.length; i++) {
    const a = i ? stops[i - 1] : z.start, b = stops[i];
    const leg = await walkLeg(a, b);
    const d = leg && leg.distance != null ? leg.distance : Math.round(L.meters(a, b) * 1.3);
    walkM += d; walkS += leg && leg.time != null ? leg.time : d / 1.2;
    legs.push(Math.round(d));
    path = path.concat(leg && leg.coords.length ? leg.coords : [[b.lat, b.lng]]);
  }

  const course = {
    id: z.id, type: z.type, updated: TODAY,
    name: z.name, start: z.start, intro,
    distanceM: Math.round(walkM), durationMin: Math.round(walkS / 60 + stops.length * 8),
    generator: { ai: !!intro, model: intro ? KEY.model : null },
    stops: stops.map((s) => ({
      n: s.n, kind: s.kind, lat: +s.lat.toFixed(6), lng: +s.lng.toFixed(6),
      category: s.category || null, image: s.image || null,
      name: s.name, text: s.text, audio: s.audio || {},
      sources: (s.sources || []).slice(0, 4),
      legM: legs[s.n - 1],
    })),
    path,
  };
  const problems = L.validateCourse(course, LANGS);
  if (problems.length) throw new Error("validation: " + problems.slice(0, 5).join("; "));
  return course;
}

/* ---------------- main ---------------- */
async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  const prevIndexPath = path.join(DIR, "index.json");
  const prev = fs.existsSync(prevIndexPath) ? JSON.parse(fs.readFileSync(prevIndexPath, "utf8")) : { zones: [] };
  if (!KEY.tour) { log("TOURAPI_KEY is missing — nothing to build."); process.exitCode = 1; return; }

  const only = env("ONLY_ZONES").split(",").filter(Boolean);
  const zones = ZONES.filter((z) => !only.length || only.includes(z.id));
  const index = { updated: TODAY, zones: prev.zones.filter((p) => !zones.some((z) => z.id === p.id)) };
  let built = 0;
  for (const z of zones) {
    try {
      const c = await buildZone(z);
      fs.writeFileSync(path.join(DIR, `${z.id}.json`), JSON.stringify(c));
      index.zones.push({ id: c.id, type: c.type, name: c.name, start: c.start, stops: c.stops.length, distanceM: c.distanceM, durationMin: c.durationMin, updated: c.updated, ai: c.generator.ai });
      built++;
      log(`  ✓ ${c.stops.length} stops, ${c.distanceM} m, ~${c.durationMin} min`);
    } catch (e) {
      log(`  ✗ ${z.id}: ${e.message} — keeping last month's course if there is one`);
      const old = prev.zones.find((p) => p.id === z.id);
      if (old) index.zones.push(old);
    }
  }
  index.zones.sort((a, b) => ZONES.findIndex((z) => z.id === a.id) - ZONES.findIndex((z) => z.id === b.id));
  fs.writeFileSync(prevIndexPath, JSON.stringify(index, null, 1));
  log(`\nDone: ${built}/${zones.length} zones rebuilt, ${index.zones.length} courses published.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
