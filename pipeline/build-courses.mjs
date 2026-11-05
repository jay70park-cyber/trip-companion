// Builds automatic walking courses and writes them as JSON files.
//
//   node pipeline/build-courses.mjs <outDir>
//
// Keys (environment variables; any that are missing switch that step off):
//   TOURAPI_KEY          data.go.kr key (Decoding)          → official places, descriptions, Odii audio
//   TMAP_KEY             SK open API appKey                 → walking paths between stops
//   NAVER_SEARCH_ID      developers.naver.com Client ID     → recent blog posts, place check
//   NAVER_SEARCH_SECRET  developers.naver.com Client Secret
//   ANTHROPIC_API_KEY    AI for place extraction, commentary, fact check and translation
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
  nid: env("NAVER_SEARCH_ID"), nsec: env("NAVER_SEARCH_SECRET"),
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

async function naver(kind, params) {
  const qs = new URLSearchParams(params);
  const text = await http(`https://openapi.naver.com/v1/search/${kind}.json?${qs}`, {
    headers: { "X-Naver-Client-Id": KEY.nid, "X-Naver-Client-Secret": KEY.nsec },
  });
  await sleep(150);
  return JSON.parse(text).items || [];
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

async function ai(prompt, maxTokens = 4000) {
  const text = await http("https://api.anthropic.com/v1/messages", {
    method: "POST", timeout: 120000,
    headers: { "x-api-key": KEY.ai, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: KEY.model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
  });
  const data = JSON.parse(text);
  const out = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
  return L.parseJson(out);
}

/* ---------------- step 1: trending places from recent blog posts ---------------- */
async function hotCandidates(z) {
  if (!KEY.nid || !KEY.nsec || !KEY.ai) { log("  · trending places skipped (needs Naver search + AI keys)"); return []; }
  let posts = [];
  for (const q of z.queries) {
    for (const start of [1, 101]) {
      const items = await naver("blog", { query: q, display: "100", start: String(start), sort: "date" }).catch((e) => { log(`  ! blog ${q}: ${e.message}`); return []; });
      posts = posts.concat(items);
    }
  }
  const seen = new Set();
  posts = L.recentPosts(posts, NOW, 90).filter((p) => (seen.has(p.link) ? false : (seen.add(p.link), true)));
  log(`  · ${posts.length} recent non-sponsored posts`);
  if (posts.length < 10) return [];
  posts = posts.slice(0, 300);
  const lines = posts.map((p, i) => `[${i}] ${L.stripTags(p.title)} — ${L.stripTags(p.description)}`).join("\n");
  const ex = await ai(
`These are snippets of recent Korean blog posts about ${z.name.ko}.
List the specific named places in or near ${z.name.ko} that the posts recommend visiting: cafes, restaurants, streets, shops, galleries, pop-up stores, landmarks.
Rules:
- Use the place name exactly as written in Korean in the snippets.
- Skip bars, pubs, clubs, hotels, motels, hospitals, and generic words (e.g. "카페거리" alone is fine only if it is a named street).
- For each place, list the indices of the snippets that mention it.
Reply with JSON only: {"places":[{"name":"...","category":"cafe|restaurant|street|shop|gallery|popup|landmark|other","posts":[0,5]}]}

SNIPPETS
${lines}`, 4000).catch((e) => { log(`  ! extract: ${e.message}`); return { places: [] }; });

  const scored = L.scoreMentions(ex.places, posts).filter((p) => p.bloggers >= 3).slice(0, 15);
  log(`  · ${scored.length} places mentioned by 3+ bloggers`);
  const out = [];
  for (const s of scored) {
    const items = await naver("local", { query: `${z.name.ko} ${s.name}`, display: "5" }).catch(() => []);
    const want = s.name.replace(/\s/g, "");
    const hit = items.find((it) => L.stripTags(it.title).replace(/\s/g, "").includes(want) || want.includes(L.stripTags(it.title).replace(/\s/g, "")));
    if (!hit) continue;
    const pos = L.naverCoord(hit.mapx, hit.mapy);
    if (!pos || L.meters(z.start, pos) > z.radiusM + 300) continue;
    if (!L.allowedCategory(hit.category)) continue;
    const snippets = posts.filter((p, i) => (ex.places.find((e) => e.name === s.name)?.posts || []).includes(i)).slice(0, 6);
    out.push({
      kind: "hot", ...pos, nameKo: L.stripTags(hit.title), category: hit.category || s.category,
      address: hit.roadAddress || hit.address || "", bloggers: s.bloggers,
      sources: snippets.map((p) => ({ label: L.stripTags(p.title), url: p.link })),
      blog: snippets.map((p) => L.stripTags(p.description)),
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
    .filter((x) => x.title && !/hotel|guesthouse|hostel/i.test(x.title))
    .map((x) => ({ kind: "official", lat: x.lat, lng: x.lng, nameEn: x.title.replace(/\s*\([^)]*[가-힣][^)]*\)\s*$/, ""), enId: x.contentid, image: (x.firstimage || "").replace(/^http:/, "https:"), dist: +x.dist || L.meters(z.start, x) }))
    .sort((a, b) => (b.image ? 1 : 0) - (a.image ? 1 : 0) || a.dist - b.dist);
}

/* ---------------- step 3: names, descriptions and audio per stop ---------------- */
async function enrichOfficial(z, stop) {
  stop.name = {}; stop.official = {};
  for (const l of LANGS) {
    const list = await ktoNear(l, z.start, z.radiusM);
    const near = list.map((x) => ({ x, d: L.meters(stop, x) })).filter((o) => o.d < 80).sort((a, b) => a.d - b.d)[0];
    if (!near) continue;
    stop.name[l] = String(near.x.title || "").replace(l === "ko" ? /$^/ : /\s*\([^)]*[가-힣][^)]*\)\s*$/, "");
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
  if (s.blog && s.blog.length) parts.push(`Recent visitor posts: ${s.blog.map((b) => `"${b}"`).join(" | ")}`);
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
Reply with JSON only: {"intro":"...","stops":[{"n":1,"name_en":"...","text_en":"..."}]}

${block}`, 4000);

  const draft = gen.stops.map((g) => `### STOP ${g.n}\nTEXT: ${g.text_en}\nSOURCES:\n${sourcesFor(stops.find((s) => s.n === g.n) || {})}`).join("\n\n");
  const checked = await ai(
`Fact-check this walking tour. For each stop, delete every sentence in TEXT that makes a claim not supported by that stop's SOURCES (paraphrase is fine; general wording like "a popular spot" is fine only if the sources say visitors recommend it).
If nothing remains, write one sentence that only states what kind of place it is according to the sources.
Also check the INTRO against all sources in the same way.
Reply with JSON only: {"intro":"...","stops":[{"n":1,"text_en":"..."}]}

INTRO: ${gen.intro}

${draft}`, 4000);

  const en = new Map(checked.stops.map((x) => [x.n, x.text_en]));
  const names = new Map(gen.stops.map((x) => [x.n, x.name_en]));
  const tr = await ai(
`Translate this walking tour into Korean (ko), Japanese (ja), Simplified Chinese (zhs) and Traditional Chinese (zht).
Translate faithfully. Do not add or remove information.
For the Korean place name, use KO_NAME exactly when it is given.
Reply with JSON only: {"intro":{"ko":"","ja":"","zhs":"","zht":""},"stops":[{"n":1,"name":{"ko":"","ja":"","zhs":"","zht":""},"text":{"ko":"","ja":"","zhs":"","zht":""}}]}

INTRO: ${checked.intro}

${stops.map((s) => `### STOP ${s.n}\nNAME: ${names.get(s.n) || s.nameEn || s.nameKo}\nKO_NAME: ${s.nameKo || ""}\nTEXT: ${en.get(s.n) || ""}`).join("\n\n")}`, 8000);

  const intro = { en: checked.intro, ...tr.intro };
  for (const s of stops) {
    const t = tr.stops.find((x) => x.n === s.n) || { name: {}, text: {} };
    s.name = { ...(s.name || {}), en: s.name?.en || names.get(s.n) || s.nameEn };
    for (const l of ["ko", "ja", "zhs", "zht"]) s.name[l] = s.name[l] || t.name[l] || s.nameKo || s.name.en;
    if (s.nameKo) s.name.ko = s.nameKo.replace(/\s*\([^)]*\)\s*$/, "") || s.name.ko;
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
  const fit = L.fitWalk(z.start, cands, { maxLeg: 900, maxTotal: z.type === "hot" ? 3000 : 3800, minStops: 4, maxStops: z.type === "hot" ? 8 : 9 });
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
