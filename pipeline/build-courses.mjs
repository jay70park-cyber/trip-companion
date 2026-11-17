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
async function http(url, opt = {}, tries = 3) {
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
      await sleep(3000 * (i + 1));
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

const walkCache = new Map();
async function walkLeg(a, b) {
  const k = `${a.lat},${a.lng}>${b.lat},${b.lng}`;
  if (!walkCache.has(k)) walkCache.set(k, walkLegRaw(a, b));
  return walkCache.get(k);
}
async function walkLegRaw(a, b) {
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
// what this run spent on the Claude API (Haiku 5.5: $0.10 / $0.50 per million tokens up to 100K-token prompts, 5x above; web search $10 per 1,000)
const USAGE = { calls: 0, inTok: 0, outTok: 0, searches: 0, usd: 0 };
function addUsage(u) {
  if (!u) return;
  const inTok = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
  const big = inTok > 100000 ? 5 : 1;
  const searches = u.server_tool_use?.web_search_requests || 0;
  USAGE.calls++; USAGE.inTok += inTok; USAGE.outTok += u.output_tokens || 0; USAGE.searches += searches;
  USAGE.usd += (inTok * 0.10 + (u.output_tokens || 0) * 0.50) * big / 1e6 + searches * 0.01;
}

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
    addUsage(data.usage);
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
  draft: { type: "object", required: ["intro", "stops"], properties: { intro: S.str, stops: { type: "array", items: { type: "object", required: ["n", "name_en", "text_en", "consistent"], properties: { n: S.int, name_en: S.str, text_en: S.str, consistent: { type: "boolean", description: "false if the sources for this stop describe different places (e.g. the English and Korean names/descriptions are about two different things)" }, is_sight: { type: "boolean", description: "true only if a tourist would walk there to look around, eat, shop or take photos; false for companies, agencies, clinics, offices, hotels" }, duplicate_of: { type: "integer", description: "number of an earlier stop that is the same place, or 0" } } } } } },
  checked: { type: "object", required: ["intro", "stops"], properties: { intro: S.str, stops: { type: "array", items: { type: "object", required: ["n", "text_en"], properties: { n: S.int, text_en: S.str } } } } },
  translated: { type: "object", required: ["intro", "stops"], properties: { intro: S.langs4, stops: { type: "array", items: { type: "object", required: ["n", "name", "text"], properties: { n: S.int, name: S.langs4, text: S.langs4 } } } } },
};

/* ---------------- step 1: trending places from a web search (AI web search tool + TMAP place check) ---------------- */
// landmarks: true looks for the area's main sights (used where KTO's location list is thin), not recent trends
async function hotCandidates(z, { landmarks = false } = {}) {
  if (!KEY.ai || !KEY.tmap) { log("  · trending places skipped (needs AI + TMAP keys)"); return []; }
  const since = new Date(NOW.getTime() - 90 * 86400000).toISOString().slice(0, 10);
  const ask = landmarks
? `Search the web (official tourism sites, Korean travel guides, news and blogs) for the main sights a visitor walks between in ${z.name.ko} (${z.name.en}), Korea, within about ${Math.round(z.radiusM / 100) / 10} km of ${z.start.label.ko}.
Try several searches, for example: ${z.name.ko} 도보 여행 코스, ${z.name.ko} 가볼만한 명소, ${z.start.label.ko} 주변 관광지.
Write a list of up to 15 specific named sights (historic sites, palaces, temples, museums, galleries, parks, viewpoints, markets, famous streets). For each give its Korean name and every page you found that describes it.
Skip restaurants, cafés, shops, bars, hotels, clinics, places outside the area, and pages marked as sponsored (협찬, 체험단, 원고료, 광고).`
: `Search the web (Korean blogs, news, travel and magazine sites) for places in or right around ${z.name.ko} (${z.name.en}), Korea, that visitors have been recommending recently (pages dated after ${since}).
Try several searches, for example: ${z.queries.join(", ")}.
Write a list of up to 15 specific named places worth walking to (cafés, restaurants, streets, shops, galleries, pop-up stores, landmarks). For each place give its Korean name and every page you found that recommends it.
Skip bars, pubs, clubs, hotels, motels, clinics, places outside ${z.name.ko}, and pages marked as sponsored (협찬, 체험단, 원고료, 광고).`;
  let found;
  try {
    found = await ai(ask, 6000, { webSearch: 5 });
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
      const core = coreName(p.name);
      const extra = [...cites.filter((c) => c.cited && coreName(c.cited).includes(core)), ...found.results.filter((r) => r.title && coreName(r.title).includes(core))].map((c) => ({ url: c.url, title: c.title }));
      const all = [...p.sources, ...extra].filter((x) => known.has(x.url));  // only pages the search really returned
      return { ...p, sources: [...new Map(all.map((x) => [x.url, x])).values()] };
    })
    .filter((p) => new Set(p.sources.map((x) => sourceKey(x.url))).size >= 2);
  log(`  · ${(res.places || []).length} places named, ${places.length} with 2+ independent sources`);

  const out = [];
  for (const p of places) {
    const pois = await tmapPoi(`${p.name}`, z.start, Math.ceil((z.radiusM + 300) / 1000));
    const want = coreName(p.name);
    const hit = pois.find((x) => { const n = coreName(x.name); return want.length >= 2 && (n.includes(want) || want.includes(n)); });
    let pos = hit;
    if (!pos) {
      const kw = await kto("KorService2", "searchKeyword2", { keyword: p.name.replace(/\(.*?\)/g, "").trim(), numOfRows: "10", pageNo: "1", arrange: "A" }).catch(() => []);
      const k = kw.map((x) => ({ name: x.title, lat: +x.mapy, lng: +x.mapx, category: "" })).find((x) => isFinite(x.lat) && L.meters(z.start, x) <= z.radiusM + 300 && (coreName(x.name).includes(want) || want.includes(coreName(x.name))));
      if (k) pos = k;
    }
    if (!pos) { log(`    - ${p.name}: not found on TMAP or KTO`); continue; }
    const hitP = pos;
    if (L.meters(z.start, hitP) > z.radiusM + 300) { log(`    - ${p.name}: too far (${Math.round(L.meters(z.start, hitP))} m)`); continue; }
    if (!L.allowedCategory(hitP.category)) { log(`    - ${p.name}: category ${hitP.category}`); continue; }
    const quoted = cites.filter((c) => p.sources.some((x) => x.url === c.url)).map((c) => c.cited).filter(Boolean).slice(0, 4);
    out.push({
      kind: landmarks ? "landmark" : "hot", lat: hitP.lat, lng: hitP.lng, nameKo: hitP.name, category: hitP.category || p.category, address: hitP.address || "",
      sources: p.sources.slice(0, 4).map((x) => ({ label: x.title || x.url, url: x.url })),
      blog: [p.why, ...quoted].filter(Boolean),
    });
  }
  log(`  · ${out.length} ${landmarks ? "sights" : "trending places"} confirmed on the map`);
  return out;
}

// "카페 레이어드 연남점" → "레이어드연남" style core for loose name matching
function coreName(t) {
  return String(t || "").replace(/<[^>]+>/g, "").replace(/\(.*?\)|（.*?）|\[.*?\]/g, "")
    .replace(/카페|cafe|본점|직영점|지점|매장|스토어|store|팝업스토어|팝업/gi, "").replace(/[^0-9a-z가-힣]/gi, "").replace(/점$/, "").toLowerCase();
}

/* ---------------- step 2: official places ---------------- */
// English KTO entries first; outside Seoul the English list is thin, so Korean entries that have no English twin
// (nothing within 30 m) are added too — the AI writes their English names and the translations.
async function officialCandidates(z) {
  if (!KEY.tour) return [];
  const en = (await ktoNear("en", z.start, z.radiusM)).filter((x) => x.title && L.isSight(x.title));
  const ko = (await ktoNear("ko", z.start, z.radiusM)).filter((x) => x.title && L.isSight(x.title) && !en.some((e) => L.meters(e, x) < 30));
  const out = [
    ...en.map((x) => ({ kind: "official", lat: x.lat, lng: x.lng, nameEn: L.stripKoParen(x.title), enId: x.contentid, image: (x.firstimage || "").replace(/^http:/, "https:"), dist: +x.dist || L.meters(z.start, x) })),
    ...ko.map((x) => ({ kind: "official", lat: x.lat, lng: x.lng, nameKo: x.title, koOnly: true, image: (x.firstimage || "").replace(/^http:/, "https:"), dist: +x.dist || L.meters(z.start, x) })),
  ];
  if (ko.length) log(`  · ${en.length} English + ${ko.length} Korean-only official places`);
  // English-listed and photographed places first, then by distance
  return out.sort((a, b) => (a.koOnly ? 1 : 0) - (b.koOnly ? 1 : 0) || (b.image ? 1 : 0) - (a.image ? 1 : 0) || a.dist - b.dist);
}

/* ---------------- step 3: names, descriptions and audio per stop ---------------- */
async function enrichOfficial(z, stop) {
  stop.name = {}; stop.official = {};
  for (const l of LANGS) {
    const list = await ktoNear(l, z.start, z.radiusM);
    const near = list.map((x) => ({ x, d: L.meters(stop, x) })).filter((o) => o.d < 30).sort((a, b) => a.d - b.d)[0];
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
    const items = (await odiiNear(l, stop, 80)).filter((x) => !isFinite(x.lat) || L.meters(stop, x) <= 35);
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

async function writeCommentary(z, stops, { minKeep = 4 } = {}) {
  const block = stops.map((s) => `### STOP ${s.n}\n${sourcesFor(s)}`).join("\n\n");
  const gen = await ai(
`You write a self-guided walking tour of ${z.name.en} (${z.name.ko}), Korea, for foreign visitors.
For each stop write 2–4 short sentences (max 70 words) in plain English.
Use ONLY facts found in that stop's SOURCES. Do not invent history, dates, prices, opening hours, menus or rankings.
For places known only from visitor posts, say what kind of place it is and what visitors mention, e.g. "Visitors often mention…".
Also give an English display name: the official English name if given, otherwise the Korean name romanized followed by the type, e.g. "Cafe Layered (café)".
Set "is_sight" to false for anything a visitor would not walk to as a sight, café, restaurant, shop or photo spot (companies, medical or travel agencies, clinics, offices, hotels).
Set "duplicate_of" to the number of an earlier stop when two stops are the same place under different names (for example "Hwaseong Haenggung" and "Temporary Palace at Hwaseong Fortress"); otherwise 0.
Set "consistent" to false when a stop's sources describe two different places (for example the English name and the Korean name are different landmarks).
Write a 2-sentence intro for the whole walk using only the sources.
Submit the intro and one entry per stop.

${block}`, 6000, { schema: SCHEMA.draft });

  const bad = new Set(gen.stops.filter((g) => g.consistent === false || g.is_sight === false || (g.duplicate_of && g.duplicate_of !== g.n)).map((g) => g.n));
  if (bad.size) {
    log(`  · dropped ${bad.size} stop(s): ${gen.stops.filter((g) => bad.has(g.n)).map((g) => `${g.name_en} (${g.consistent === false ? "conflicting" : g.is_sight === false ? "not a sight" : "duplicate"})`).join(", ")}`);
    const keep = stops.filter((s) => !bad.has(s.n));
    if (keep.length < minKeep) throw new Error("too few stops after dropping unsuitable ones");
    const renum = new Map(keep.map((s, i) => [s.n, i + 1]));
    gen.stops = gen.stops.filter((g) => !bad.has(g.n)).map((g) => ({ ...g, n: renum.get(g.n) }));
    stops.length = 0; keep.forEach((s, i) => stops.push({ ...s, n: i + 1 }));
    if (!stops.length) return null;
  }
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
    else if (s.name.ko) s.name.ko = s.name.ko.replace(/\s*\([^)]*\)\s*$/, "");
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
async function buildZone(z, prev) {
  log(`\n▶ ${z.id} (${z.type})`);
  const official = await officialCandidates(z);
  log(`  · ${official.length} official places within ${z.radiusM} m`);
  const hot = await hotCandidates(z);
  // KTO's location list is thin outside Seoul: find the area's main sights on the web and treat them like official sites
  // the list of main sights rarely changes, so a web search for it is reused for six months
  let landmarkCache = null;
  if (official.length < 6) {
    const c = prev?.cache;
    let marks;
    if (c?.landmarks && c.landmarksAt && daysSince(c.landmarksAt) < 180) {
      marks = c.landmarks; landmarkCache = c;
      log(`  · only ${official.length} official sites — reusing the main-sights list from ${c.landmarksAt}`);
    } else {
      log(`  · only ${official.length} official sites — searching the web for the main sights`);
      marks = await hotCandidates(z, { landmarks: true });
      landmarkCache = { landmarks: marks, landmarksAt: TODAY };
    }
    const fresh = marks.filter((m) => !official.some((o) => L.meters(o, m) < 60));
    official.push(...fresh.map((m) => ({ ...m })));
  }

  // a trending place that is already an official site (e.g. the palace itself) is not added twice
  const koList = await ktoNear("ko", z.start, z.radiusM);
  const norm = (t) => String(t || "").replace(/\s|\(.*?\)|（.*?）/g, "");
  for (let i = hot.length - 1; i >= 0; i--) {
    const h = hot[i], hn = norm(h.nameKo);
    if (koList.some((k) => L.meters(h, k) < 250 && hn.length >= 2 && (norm(k.title).includes(hn) || hn.includes(norm(k.title))))) hot.splice(i, 1);
  }

  // mix: trending areas lead with trending places; heritage areas lead with official sites
  const wantHot = z.type === "hot" ? 6 : 2;
  const wantOfficial = z.type === "hot" ? 3 : 8;
  let cands = L.dedupe([...official.slice(0, wantOfficial), ...hot.slice(0, wantHot), ...official.slice(wantOfficial, wantOfficial + 4)], 40);
  const fit = L.fitWalk(z.start, cands, { maxLeg: 900, maxTotal: 3200, minStops: 4, maxStops: z.type === "hot" ? 9 : 10 });
  if (!fit) throw new Error("could not fit a walkable course");
  let stops = fit.stops.map((s, i) => ({ ...s, n: i + 1 }));
  log(`  · ${stops.length} stops, ~${fit.straightM} m straight-line`);

  // real walking check: water, rail lines or hills can make a short hop a long detour (e.g. a lighthouse across a harbour)
  for (let guard = 0; guard < 6; guard++) {
    let worst = -1, worstRatio = 0, total = 0;
    for (let i = 0; i < stops.length; i++) {
      const a = i ? stops[i - 1] : z.start, b = stops[i];
      const leg = await walkLeg(a, b);
      const d = leg && leg.distance != null ? leg.distance : L.meters(a, b) * 1.3;
      total += d;
      const ratio = d / Math.max(150, L.meters(a, b));
      if (d > 1300 && ratio > worstRatio) { worst = i; worstRatio = ratio; }
    }
    if (worst < 0 && total <= 5500) break;
    if (worst < 0) worst = stops.length - 1;   // too long overall: drop the last stop
    log(`  · dropped "${stops[worst].nameEn || stops[worst].nameKo}" — real walk too long (${Math.round(total)} m in all)`);
    stops.splice(worst, 1);
    if (stops.length < 4) throw new Error("could not fit a walkable course (real walking distance)");
    stops = stops.map((s, i) => ({ ...s, n: i + 1 }));
  }

  for (const s of stops) {
    if (s.kind === "official" || s.kind === "landmark") {
      const ko = s.nameKo;
      await enrichOfficial(z, s); await enrichAudio(s);
      if (ko) { s.nameKo = s.nameKo || ko; s.name.ko = s.name.ko || ko; }
    }
    else { s.name = { ko: s.nameKo }; s.audio = {}; s.scripts = {}; }  // audio stories are about heritage sites, not shops
  }

  // reuse last time's checked text for stops that are still on the course; only new stops go to the AI
  const reuse = (s) => (prev?.generator?.ai ? prev.stops : []).find((p) => L.meters(p, s) < 40 && p.text?.en && p.name?.en);
  let intro = null;
  const fresh = stops.filter((s) => !reuse(s));
  for (const s of stops) {
    const p = reuse(s);
    if (p) { s.name = p.name; s.text = p.text; s.sources = s.sources?.length ? s.sources : p.sources; s.reused = true; }
  }
  if (!fresh.length && prev?.intro) {
    intro = prev.intro;
    log(`  · all ${stops.length} stops unchanged — reusing last time's commentary (no AI)`);
  } else if (KEY.ai) {
    try {
      if (fresh.length < stops.length) log(`  · ${stops.length - fresh.length} stops reused, writing ${fresh.length} new`);
      const batch = fresh.map((s, i) => ({ ...s, n: i + 1, origN: s.n }));
      const newIntro = await writeCommentary(z, batch, { minKeep: fresh.length === stops.length ? 4 : 0 });
      const done = new Map(batch.map((b) => [b.origN, b]));
      for (let i = stops.length - 1; i >= 0; i--) {
        const s = stops[i];
        if (s.reused) continue;
        const b = done.get(s.n);
        if (!b) { stops.splice(i, 1); continue; }   // dropped by the AI (not a sight, duplicate…)
        s.name = b.name; s.text = b.text;
      }
      stops.forEach((s, i) => { s.n = i + 1; });
      if (stops.length < 4) throw new Error("too few stops after dropping unsuitable ones");
      intro = prev?.intro && fresh.length < stops.length / 2 ? prev.intro : newIntro || prev?.intro || null;
    }
    catch (e) { log(`  ! AI commentary failed, using official text: ${e.message}`); intro = null; }
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
    ...(landmarkCache ? { cache: landmarkCache } : {}),
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

/* ---------------- what to rebuild ---------------- */
const daysSince = (d) => (NOW - new Date(d + "T00:00:00Z")) / 86400000;
// Trending areas change every month; heritage areas get a full rebuild every quarter.
// In between, a free check (TMAP place search) looks for cafés or shops on the course that have closed.
async function isDue(z, prevCourse) {
  if (z.type === "hot") return true;
  const age = daysSince(prevCourse.updated || "2000-01-01");
  if (age >= 85) return true;
  for (const s of prevCourse.stops.filter((x) => x.kind === "hot")) {
    const name = s.name?.ko || "";
    const pois = await tmapPoi(name, s, 1);
    const want = coreName(name);
    const still = pois.some((p) => L.meters(p, s) < 120 && (coreName(p.name).includes(want) || want.includes(coreName(p.name))));
    if (!still) { log(`\n▶ ${z.id}: "${name}" not found on the map any more — rebuilding`); return true; }
  }
  log(`\n▶ ${z.id}: unchanged (heritage; full check after ${Math.ceil(85 - age)} more days)`);
  return false;
}

/* ---------------- main ---------------- */
async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  const prevIndexPath = path.join(DIR, "index.json");
  const prev = fs.existsSync(prevIndexPath) ? JSON.parse(fs.readFileSync(prevIndexPath, "utf8")) : { zones: [] };
  if (!KEY.tour) { log("TOURAPI_KEY is missing — nothing to build."); process.exitCode = 1; return; }

  const only = env("ONLY_ZONES").split(",").filter(Boolean);
  // a manual run for named zones rebuilds them, unless "rebuild" is unchecked (then the normal monthly due-check runs)
  const force = env("REBUILD") === "true" || (!!only.length && env("REBUILD") !== "false");
  const zones = ZONES.filter((z) => !only.length || only.includes(z.id));
  const index = { updated: TODAY, zones: prev.zones.filter((p) => !zones.some((z) => z.id === p.id)) };
  let built = 0;
  for (const z of zones) {
    const prevPath = path.join(DIR, `${z.id}.json`);
    const prevCourse = fs.existsSync(prevPath) ? JSON.parse(fs.readFileSync(prevPath, "utf8")) : null;
    if (!force && prevCourse && !(await isDue(z, prevCourse))) {
      const old = prev.zones.find((p) => p.id === z.id);
      if (old) { index.zones.push(old); continue; }
    }
    try {
      const c = await buildZone(z, prevCourse);
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
  log(`Claude API this run: ${USAGE.calls} calls, ${USAGE.inTok} input + ${USAGE.outTok} output tokens, ${USAGE.searches} web searches ≈ $${USAGE.usd.toFixed(3)}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
