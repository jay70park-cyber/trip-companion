// Publishes hand-written "story" walking courses (pipeline/stories/*.json): stops are chosen and ordered by
// the story, not by distance, and the text is written and checked by hand — no AI and no web search here.
// This script only (1) snaps each stop to TMAP's point for it, if one is within 400 m of the given point,
// (2) routes the walk between stops on foot, and (3) writes <outDir>/courses/<id>.json and the index entry.
// Story courses are not touched by the monthly course builder (build-courses.mjs keeps zones it does not build).
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(process.argv[2] || "out");
const DIR = path.join(OUT, "courses");
const SRC = new URL("./stories/", import.meta.url);
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

async function snap(s) {
  if (!TMAP || !s.poi) return s;
  try {
    const qs = new URLSearchParams({ version: "1", searchKeyword: s.poi, count: "5", reqCoordType: "WGS84GEO", resCoordType: "WGS84GEO", centerLat: String(s.lat), centerLon: String(s.lng), radius: "1" });
    const d = await req(`https://apis.openapi.sk.com/tmap/pois?${qs}`);
    const pois = (d?.searchPoiInfo?.pois?.poi || []).map((p) => ({ name: p.name, lat: +(p.noorLat || p.frontLat), lng: +(p.noorLon || p.frontLon) }));
    const best = pois.filter((p) => meters(s, p) < 400).sort((a, b) => meters(s, a) - meters(s, b))[0];
    if (best) { console.log(`  · ${s.poi} → TMAP "${best.name}" (${Math.round(meters(s, best))} m from the given point)`); return { ...s, lat: +best.lat.toFixed(6), lng: +best.lng.toFixed(6) }; }
    console.log(`  · ${s.poi}: no TMAP point within 400 m — keeping the given point`);
  } catch (e) { console.log(`  ! ${s.poi}: ${e.message}`); }
  await sleep(250);
  return s;
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

for (const f of fs.readdirSync(SRC).filter((x) => x.endsWith(".json"))) {
  const src = JSON.parse(fs.readFileSync(new URL(f, SRC), "utf8"));
  console.log(`▶ story ${src.id}`);
  const stops = [];
  for (const s of src.stops) stops.push(await snap(s));
  const start = src.start;   // the start point is the first stop's gate, given by hand
  let path_ = [], walkM = 0, walkS = 0, prev = { lat: src.start.lat, lng: src.start.lng };
  for (const s of stops) {
    const leg = await walk(prev, s);
    if (leg && leg.coords.length) { path_.push(...leg.coords); walkM += leg.distance || 0; walkS += leg.time || 0; s.legM = leg.distance; }
    else { const d = meters(prev, s); path_.push([prev.lat, prev.lng], [s.lat, s.lng]); walkM += d * 1.3; walkS += d * 1.3 / 1.2; s.legM = Math.round(d * 1.3); }
    prev = s;
  }
  const course = {
    id: src.id, type: "story", areas: src.areas || [], updated: TODAY,
    name: src.name, start: { lat: start.lat, lng: start.lng, label: src.start.label }, intro: src.intro,
    distanceM: Math.round(walkM), durationMin: Math.round(walkS / 60 + stops.length * 12),
    generator: { ai: false, model: null, editor: "hand-written, sources checked" },
    stops: stops.map((s, i) => ({ n: i + 1, kind: "story", year: s.year, lat: s.lat, lng: s.lng, name: s.name, text: s.text, sources: s.sources || [], image: s.image || "", legM: s.legM })),
    path: path_,
  };
  for (const s of course.stops) for (const l of ["en", "ko", "ja", "zhs", "zht"]) if (!s.name[l] || !s.text[l]) throw new Error(`${src.id} stop ${s.n}: missing ${l}`);
  fs.writeFileSync(path.join(DIR, `${src.id}.json`), JSON.stringify(course) + "\n");
  index.zones = index.zones.filter((z) => z.id !== src.id);
  index.zones.push({ id: course.id, type: "story", areas: course.areas, name: course.name, start: course.start, stops: course.stops.length, distanceM: course.distanceM, durationMin: course.durationMin, updated: TODAY, ai: false });
  console.log(`  ✓ ${course.stops.length} stops, ${course.distanceM} m, ~${course.durationMin} min`);
}
fs.writeFileSync(indexPath, JSON.stringify(index, null, 1) + "\n");
