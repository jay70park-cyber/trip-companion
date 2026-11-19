// One-off helper: prints TMAP POI candidates for each stop of pipeline/themes/*.json (no publishing).
// Run in Actions (TMAP_KEY is a secret): node pipeline/geocode.mjs
import fs from "node:fs";
const TMAP = process.env.TMAP_KEY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const meters = (a, b) => { const R = 6371000, r = Math.PI / 180, x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lng - a.lng) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const dir = new URL("./themes/", import.meta.url);
const list = JSON.parse(fs.readFileSync(new URL("./geocode-list.json", import.meta.url), "utf8"));
const tasks = list.map(([q, lat, lng]) => ({ poi: q, lat, lng, name: { ko: q } }));

for (const t of [{ courses: [{ id: "list", stops: tasks }] }]) {
  for (const c of t.courses) {
    console.log(`## ${c.id}`);
    for (const s of c.stops) {
      const q = s.poi || s.name.ko;
      const qs = new URLSearchParams({ version: "1", searchKeyword: q, count: "6", reqCoordType: "WGS84GEO", resCoordType: "WGS84GEO", centerLat: String(s.lat), centerLon: String(s.lng), radius: "10" });
      try {
        const r = await fetch(`https://apis.openapi.sk.com/tmap/pois?${qs}`, { headers: { appKey: TMAP, Accept: "application/json" } });
        const tx = await r.text();
        const pois = tx.trim() ? (JSON.parse(tx)?.searchPoiInfo?.pois?.poi || []) : [];
        console.log(`- ${q}`);
        for (const p of pois) { const la = +(p.noorLat || p.frontLat), ln = +(p.noorLon || p.frontLon); console.log(`    ${p.name} | ${la.toFixed(6)}, ${ln.toFixed(6)} | ${Math.round(meters(s, { lat: la, lng: ln }))} m`); }
        if (!pois.length) console.log("    (none)");
      } catch (e) { console.log(`- ${q}: ${e.message}`); }
      await sleep(300);
    }
  }
}
