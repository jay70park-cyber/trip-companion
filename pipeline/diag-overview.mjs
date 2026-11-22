// One-off check: how often KTO's detailCommon2 has no overview, per language service, around a few places.
const KEY = process.env.TOURAPI_KEY;
const SV = { ko: "KorService2", en: "EngService2", ja: "JpnService2", zhs: "ChsService2", zht: "ChtService2" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(sv, op, p) {
  const qs = new URLSearchParams({ serviceKey: KEY, MobileOS: "ETC", MobileApp: "KTrip", _type: "json", ...p });
  const r = await fetch(`https://apis.data.go.kr/B551011/${sv}/${op}?${qs}`);
  const t = await r.text(); try { const it = JSON.parse(t)?.response?.body?.items?.item; return Array.isArray(it) ? it : it ? [it] : []; } catch { return []; }
}
const target = await call(SV.ko, "searchKeyword2", { keyword: "장욱진", numOfRows: "5", pageNo: "1" });
console.log("장욱진 search:", target.map((x) => `${x.contentid} ${x.title} type${x.contenttypeid}`).join(" | "));
for (const x of target) {
  for (const [l, sv] of Object.entries(SV)) {
    const d = await call(sv, "detailCommon2", { contentId: x.contentid });
    console.log(`  ${x.title} [${l}] overview: ${(d[0]?.overview || "").length} chars`);
    await sleep(150);
  }
}
for (const [name, lat, lng] of [["Yongin Mabuk", 37.2925, 127.1305], ["Suwon Hwaseong", 37.2850, 127.0130], ["Gyeongbokgung", 37.5796, 126.9770]]) {
  for (const [l, sv] of Object.entries(SV)) {
    const items = await call(sv, "locationBasedList2", { mapX: String(lng), mapY: String(lat), radius: "5000", numOfRows: "40", pageNo: "1", arrange: "E" });
    let empty = 0, n = 0;
    for (const it of items.slice(0, 25)) { const d = await call(sv, "detailCommon2", { contentId: it.contentid }); n++; if (!(d[0]?.overview || "").trim()) empty++; await sleep(120); }
    console.log(`${name} [${l}]: ${items.length} places within 5 km; overview empty in ${empty}/${n} checked`);
  }
}
