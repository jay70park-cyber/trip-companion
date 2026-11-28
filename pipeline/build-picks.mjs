// Publishes Jay's own restaurant picks for the app's "Food near the destination" step.
// Input:  pipeline/picks.json  — { picks: [{ id, kind ("food" default | "sight" | ["food","sight"]), area, address, name:{ko,en,ja,zhs,zht}, menu:{…}, text:{…}, lat?, lng? }] }
// Output: <outDir>/picks/picks.json
// A pick without lat/lng gets them from its address (TMAP address search), then from its Korean name.
// Coordinates found earlier are reused, so a rerun does not need TMAP.
// Photo: pipeline/pick-images/<id>.jpg (Jay's own photo) wins; otherwise the KTO photo of the same place, if KTO lists it.
// KTO is checked again on every run, so a changed or removed KTO photo is picked up within a month.
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(process.argv[2] || "out");
const SRC = new URL("./picks.json", import.meta.url);
const DEST = path.join(OUT, "picks", "picks.json");
const TMAP = process.env.TMAP_KEY || "";
const TOUR = process.env.TOURAPI_KEY || "";
const IMG_DIR = new URL("./pick-images/", import.meta.url);
const RAW = "https://raw.githubusercontent.com/jay70park-cyber/trip-companion/data/picks/img/";
const norm = (x) => String(x || "").replace(/\s|\(.*?\)|본점|점$/g, "").toLowerCase();
const meters = (a, b) => { const R = 6371000, r = Math.PI / 180, x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lng - a.lng) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };

async function ktoSearch(keyword) {
  const enc = TOUR.includes("%") ? TOUR : encodeURIComponent(TOUR);
  const qs = new URLSearchParams({ MobileOS: "ETC", MobileApp: "KTripCompanion", _type: "json", keyword, numOfRows: "20", pageNo: "1", arrange: "A" });
  const res = await fetch(`https://apis.data.go.kr/B551011/KorService2/searchKeyword2?serviceKey=${enc}&${qs}`);
  const d = JSON.parse(await res.text());
  const items = d?.response?.body?.items?.item || [];
  await sleep(150);
  return Array.isArray(items) ? items : [items];
}

// KTO titles are spaced differently ("수통골 감나무집 본점") and branches are often listed under the brand name,
// so try the full name, then without the branch part, then its first word (the brand), then the tail of a long first word.
function keywords(name) {
  const base = name.replace(/\(.*?\)/g, "").trim();
  const noBranch = base.replace(/\s*(본점|[^\s]*점)$/, "").trim();
  const first = noBranch.split(/\s+/)[0] || "";   // the brand: "성심당 롯데백화점" → "성심당", never "롯데백화점"
  const tail = first.length >= 5 ? first.slice(-4) : "";  // "수통골감나무집" → "감나무집"
  return [...new Set([base, noBranch, first, tail])].filter((k) => k.length >= 2);
}

// The KTO (Korean) entry for this place: nearest result within 250 m for any keyword variant.
// Returns { image, kto: { id, lat, lng } } — the app uses kto's point to fetch KTO's live description in each language.
async function ktoMatch(name, pos) {
  if (!TOUR) return null;
  const seen = [];
  for (const kw of keywords(name)) {
    const items = await ktoSearch(kw);
    const near = items.map((it) => ({ it, d: meters(pos, { lat: +it.mapy, lng: +it.mapx }) })).filter((x) => x.d < 250).sort((a, b) => a.d - b.d);
    seen.push(...near.map((x) => `${x.it.title}${x.it.firstimage ? "📷" : ""}`));
    const hit = (near.find((x) => x.it.firstimage) || near[0])?.it;
    if (hit) {
      console.log(`  · KTO match "${hit.title}" (keyword ${kw})${hit.firstimage ? ", with photo" : ""}`);
      return { image: (hit.firstimage || "").replace(/^http:/, "https:"), kto: { id: String(hit.contentid), lat: +(+hit.mapy).toFixed(6), lng: +(+hit.mapx).toFixed(6) } };
    }
  }
  console.log(`  · KTO: not listed nearby (${keywords(name).join(" / ")}; within 250 m: ${seen.join(", ") || "none"})`);
  return null;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const inKorea = (lat, lng) => lat > 33 && lat < 39 && lng > 124 && lng < 132;

async function getJson(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { appKey: TMAP, Accept: "application/json" } });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 120)}`);
      return text.trim() ? JSON.parse(text) : null;
    } catch (e) { if (i === 2) throw e; await sleep(2000 * (i + 1)); }
  }
}

async function byAddress(addr) {
  const qs = new URLSearchParams({ version: "1", fullAddr: addr, coordType: "WGS84GEO", addressFlag: "F00" });
  const d = await getJson(`https://apis.openapi.sk.com/tmap/geo/fullAddrGeo?${qs}`);
  const c = d?.coordinateInfo?.coordinate?.[0];
  if (!c) return null;
  const lat = +(c.newLat || c.lat), lng = +(c.newLon || c.lon);
  return inKorea(lat, lng) ? { lat, lng } : null;
}

async function byName(name) {
  const qs = new URLSearchParams({ version: "1", searchKeyword: name, count: "1", reqCoordType: "WGS84GEO", resCoordType: "WGS84GEO" });
  const d = await getJson(`https://apis.openapi.sk.com/tmap/pois?${qs}`);
  const p = d?.searchPoiInfo?.pois?.poi?.[0];
  if (!p) return null;
  const lat = +(p.noorLat || p.frontLat), lng = +(p.noorLon || p.frontLon);
  return inKorea(lat, lng) ? { lat, lng } : null;
}

const src = JSON.parse(fs.readFileSync(SRC, "utf8"));
let prev = [];
try { prev = JSON.parse(fs.readFileSync(DEST, "utf8")).picks || []; } catch {}
const prevById = new Map(prev.map((p) => [p.id, p]));

const out = [];
for (const p of src.picks || []) {
  const label = p.name?.ko || p.id;
  if (!p.id || !p.name?.ko) { console.log(`✗ skipped (needs id and name.ko): ${JSON.stringify(p).slice(0, 80)}`); continue; }
  let pos = isFinite(p.lat) && isFinite(p.lng) ? { lat: +p.lat, lng: +p.lng } : null;
  const old = prevById.get(p.id);
  if (!pos && old && old.address === p.address && isFinite(old.lat)) pos = { lat: old.lat, lng: old.lng };
  if (!pos && TMAP) {
    try { if (p.address) pos = await byAddress(p.address); } catch (e) { console.log(`  ! address search ${label}: ${e.message}`); }
    try { if (!pos) pos = await byName(label); } catch (e) { console.log(`  ! name search ${label}: ${e.message}`); }
    await sleep(250);
  }
  if (!pos) { console.log(`✗ ${label}: location not found — check the address`); continue; }
  let image = "", photo = "";
  for (const ext of ["jpg", "jpeg", "png", "webp"]) {
    const f = new URL(`${p.id}.${ext}`, IMG_DIR);
    if (fs.existsSync(f)) {
      fs.mkdirSync(path.join(OUT, "picks", "img"), { recursive: true });
      fs.copyFileSync(f, path.join(OUT, "picks", "img", `${p.id}.${ext}`));
      image = `${RAW}${p.id}.${ext}?v=${fs.statSync(f).size}`; photo = "own"; break;
    }
  }
  // Checked again on every run (monthly and on each change), so KTO's current photo is used; if KTO cannot be reached, keep last time's.
  let kto = null;
  try {
    const m = await ktoMatch(label, pos);
    if (m) { kto = m.kto; if (!image && m.image) { image = m.image; photo = "kto"; } }
  } catch (e) {
    console.log(`  ! KTO ${label}: ${e.message} — keeping last result`);
    if (old?.kto) kto = old.kto;
    if (!image && old?.photo === "kto" && old.image) { image = old.image; photo = "kto"; }
  }
  out.push({ ...p, lat: +pos.lat.toFixed(6), lng: +pos.lng.toFixed(6), ...(image ? { image, photo } : {}), ...(kto ? { kto } : {}) });
  console.log(`✓ ${label}  ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}  photo: ${photo || "none"}`);
}

fs.mkdirSync(path.dirname(DEST), { recursive: true });
fs.writeFileSync(DEST, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), picks: out }, null, 1) + "\n");
console.log(`Done: ${out.length} of ${(src.picks || []).length} picks published.`);
