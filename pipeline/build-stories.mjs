// Publishes hand-written "story" walking courses (pipeline/stories/*.json): stops are chosen and ordered by
// the story, not by distance, and the text is written and checked by hand — no AI and no web search here.
// This script only (1) snaps each stop to TMAP's point for it, if one is within 400 m of the given point,
// (2) routes the walk between stops on foot, and (3) writes <outDir>/courses/<id>.json and the index entry.
// Story courses are not touched by the monthly course builder (build-courses.mjs keeps zones it does not build).
//
// It also publishes hand-written "shop" courses (pipeline/shops/*.json, e.g. the Olive Young · Daiso · Musinsa
// walks). Their stops carry a street address: each one is placed by TMAP's address search (fullAddrGeo) first,
// then by a POI name search near the given point. A course with "preview": true is shown only on the dev
// site (dev--*.netlify.app); set it to false to release it — no app deploy is needed for that.
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(process.argv[2] || "out");
const DIR = path.join(OUT, "courses");
const SOURCES = [
  { dir: new URL("./stories/", import.meta.url), type: "story" },
  { dir: new URL("./shops/", import.meta.url), type: "shop" },
];
const TMAP = process.env.TMAP_KEY || "";
const TODAY = new Date().toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const meters = (a, b) => { const R = 6371000, r = Math.PI / 180, x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lng - a.lng) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };

async function req(url, opts = {}) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { ...opts, headers: { appKey: TMAP, Accept: "application/json", ...(opts.headers || {}) } });
      const t = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status} ${t.slice(0, 100)}`);
      return t.trim() ? JSON.parse(t) : null;
    } catch (e) { if (i === 2) throw e; await sleep(1500 * (i + 1)); }
  }
}

// snap: false keeps the hand-given point (e.g. a gate whose name TMAP also uses for a bus stop)
async function snap(s) {
  if (!TMAP || !s.poi || s.snap === false) return s;
  try {
    const qs = new URLSearchParams({ version: "1", searchKeyword: s.poi, count: "5", reqCoordType: "WGS84GEO", resCoordType: "WGS84GEO", centerLat: String(s.lat), centerLon: String(s.lng), radius: String(Math.max(1, Math.ceil((s.snapM || 400) / 1000))) });
    const d = await req(`https://apis.openapi.sk.com/tmap/pois?${qs}`);
    const pois = (d?.searchPoiInfo?.pois?.poi || []).map((p) => ({ name: p.name, lat: +(p.noorLat || p.frontLat), lng: +(p.noorLon || p.frontLon) }));
    const best = pois.filter((p) => meters(s, p) < (s.snapM || 400)).sort((a, b) => meters(s, a) - meters(s, b))[0];
    if (best) { console.log(`  · ${s.poi} → TMAP "${best.name}" (${Math.round(meters(s, best))} m from the given point)`); return { ...s, lat: +best.lat.toFixed(6), lng: +best.lng.toFixed(6) }; }
    console.log(`  · ${s.poi}: no TMAP point within 400 m — keeping the given point`);
  } catch (e) { console.log(`  ! ${s.poi}: ${e.message}`); }
  await sleep(250);
  return s;
}

// shop stops: place by street address (TMAP fullAddrGeo), then fall back to a POI name search near the given point
async function geocode(s) {
  if (!TMAP || !s.address) return snap(s);
  try {
    const qs = new URLSearchParams({ version: "1", format: "json", coordType: "WGS84GEO", addressFlag: "F00", fullAddr: s.address });
    const d = await req(`https://apis.openapi.sk.com/tmap/geo/fullAddrGeo?${qs}`);
    const c = (d?.coordinateInfo?.coordinate || [])[0] || {};
    const lat = +(c.newLatEntr || c.newLat || c.lat), lng = +(c.newLonEntr || c.newLon || c.lon);
    await sleep(250);
    if (isFinite(lat) && isFinite(lng) && lat && lng) {
      const off = Math.round(meters(s, { lat, lng }));
      console.log(`  · ${s.address} → ${lat.toFixed(6)}, ${lng.toFixed(6)} (${off} m from the given point)`);
      if (off > 2500) console.log(`  ! ${s.address}: far from the given point — check the address`);
      return { ...s, lat: +lat.toFixed(6), lng: +lng.toFixed(6), placed: "address" };
    }
    console.log(`  ! ${s.address}: no address match — trying the POI name`);
  } catch (e) { console.log(`  ! ${s.address}: ${e.message} — trying the POI name`); }
  return { ...(await snap(s)), placed: "poi-or-given" };
}

async function walk(a, b) {
  if (!TMAP) return null;
  try {
    const d = await req("https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startX: a.lng, startY: a.lat, endX: b.lng, endY: b.lat, startName: encodeURIComponent("A"), endName: encodeURIComponent("B"), reqCoordType: "WGS84GEO", resCoordType: "WGS84GEO" }),
    });
    const f = d?.features || [], p0 = f[0]?.properties, coords = [];
    for (const x of f) if (x.geometry?.type === "LineString") for (const c of x.geometry.coordinates) coords.push([+c[1].toFixed(6), +c[0].toFixed(6)]);
    await sleep(250);
    return { coords, distance: p0?.totalDistance ?? null, time: p0?.totalTime ?? null };
  } catch (e) { console.log(`  ! walk: ${e.message}`); return null; }
}

fs.mkdirSync(DIR, { recursive: true });
const indexPath = path.join(DIR, "index.json");
const index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, "utf8")) : { updated: TODAY, zones: [] };

const LANGS = ["en", "ko", "ja", "zhs", "zht"];
const files = SOURCES.flatMap(({ dir, type }) => fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith(".json")).map((f) => ({ url: new URL(f, dir), type })) : []);
for (const { url, type } of files) {
  const src = JSON.parse(fs.readFileSync(url, "utf8"));
  const shop = type === "shop";
  console.log(`▶ ${type} ${src.id}`);
  const stops = [];
  for (const s of src.stops) stops.push(shop ? await geocode({ snapM: 1200, ...s }) : await snap(s));
  // a shop walk starts at a station exit: snap it to TMAP's point for that exit if one is close
  const start = shop && src.start.poi ? { ...(await snap({ ...src.start, snapM: 300 })), label: src.start.label } : src.start;
  // a shop stop that neither the address nor the POI search could place still sits on its rough given point: never publish that
  const unplaced = shop ? stops.find((s, i) => s.lat === src.stops[i].lat && s.lng === src.stops[i].lng) : null;
  if (unplaced) { console.log(`  ! ${src.id}: could not place ${unplaced.name.ko} (${unplaced.address}) — skipped, the previous version is kept`); continue; }
  const far = shop ? stops.find((s) => meters(start, s) > 2000) : null;
  if (far) { console.log(`  ! ${src.id}: ${far.name.ko} is ${Math.round(meters(start, far))} m from the start — skipped, the previous version is kept`); continue; }
  let path_ = [], walkM = 0, walkS = 0, prev = { lat: start.lat, lng: start.lng };
  for (const s of stops) {
    // straight: true for a short path TMAP does not route (e.g. King Gojong's Road, open only in the daytime)
    const leg = s.straight ? null : await walk(prev, s);
    if (leg && leg.coords.length) { path_.push(...leg.coords); walkM += leg.distance || 0; walkS += leg.time || 0; s.legM = leg.distance; }
    else { const k = s.straight ? 1.1 : 1.3, d = meters(prev, s) * k; path_.push([prev.lat, prev.lng], [s.lat, s.lng]); walkM += d; walkS += d / 1.2; s.legM = Math.round(d); }
    prev = s;
  }
  const course = {
    id: src.id, type, areas: src.areas || [], updated: TODAY, ...(src.preview ? { preview: true } : {}),
    name: src.name, start: { lat: start.lat, lng: start.lng, label: src.start.label }, intro: src.intro,
    // shopping takes longer per stop than reading a story
    distanceM: Math.round(walkM), durationMin: Math.round(walkS / 60 + stops.length * (shop ? (src.minutesPerStop || 30) : 12)),
    generator: { ai: false, model: null, editor: shop ? "hand-written, store facts checked " + (src.checked || TODAY) : "hand-written, sources checked" },
    stops: stops.map((s, i) => shop
      ? { n: i + 1, kind: "shop", tag: s.tag, address: s.address, hours: s.hours || "", lat: s.lat, lng: s.lng, name: s.name, text: s.text, sources: s.sources || [], image: s.image || "", legM: s.legM }
      : { n: i + 1, kind: "story", year: s.year, lat: s.lat, lng: s.lng, name: s.name, text: s.text, sources: s.sources || [], image: s.image || "", legM: s.legM }),
    path: path_,
  };
  for (const l of LANGS) if (!course.name[l] || !course.intro[l] || !course.start.label[l]) throw new Error(`${src.id}: missing ${l} in name, intro or start label`);
  for (const s of course.stops) for (const l of LANGS) if (!s.name[l] || !s.text[l] || (shop && !s.tag?.[l])) throw new Error(`${src.id} stop ${s.n}: missing ${l}`);
  fs.writeFileSync(path.join(DIR, `${src.id}.json`), JSON.stringify(course) + "\n");
  index.zones = index.zones.filter((z) => z.id !== src.id);
  index.zones.push({ id: course.id, type, areas: course.areas, ...(src.preview ? { preview: true } : {}), name: course.name, start: course.start, stops: course.stops.length, distanceM: course.distanceM, durationMin: course.durationMin, updated: TODAY, ai: false });
  console.log(`  ✓ ${course.stops.length} stops, ${course.distanceM} m, ~${course.durationMin} min`);
}
fs.writeFileSync(indexPath, JSON.stringify(index, null, 1) + "\n");
