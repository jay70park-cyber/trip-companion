// Publishes Jay's own restaurant picks for the app's "Food near the destination" step.
// Input:  pipeline/picks.json  — { picks: [{ id, area, address, name:{ko,en,ja,zhs,zht}, menu:{…}, text:{…}, lat?, lng? }] }
// Output: <outDir>/picks/picks.json
// A pick without lat/lng gets them from its address (TMAP address search), then from its Korean name.
// Coordinates found earlier are reused, so a rerun does not need TMAP.
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(process.argv[2] || "out");
const SRC = new URL("./picks.json", import.meta.url);
const DEST = path.join(OUT, "picks", "picks.json");
const TMAP = process.env.TMAP_KEY || "";
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
  out.push({ ...p, lat: +pos.lat.toFixed(6), lng: +pos.lng.toFixed(6) });
  console.log(`✓ ${label}  ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`);
}

fs.mkdirSync(path.dirname(DEST), { recursive: true });
fs.writeFileSync(DEST, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), picks: out }, null, 1) + "\n");
console.log(`Done: ${out.length} of ${(src.picks || []).length} picks published.`);
