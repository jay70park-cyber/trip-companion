// One-off check: places in the app's lists (3 km, nearest first) whose KTO description is empty, per language.
const KEY = process.env.TOURAPI_KEY;
const SV = { ko: "KorService2", en: "EngService2", ja: "JpnService2", zhs: "ChsService2", zht: "ChtService2" };
const AREAS = [["gyeongbok",37.5796,126.9770],["myeongdong",37.5636,126.9850],["hongdae",37.5563,126.9236],["seongsu",37.5446,127.0560],
  ["hwaseong",37.2819,127.0136],["folkvillage",37.2588,127.1180],["gongju",36.4628,127.1250],["jeonju",35.8150,127.1530],
  ["gyeongju",35.8380,129.2120],["busan_haeundae",35.1587,129.1604],["gangneung",37.7956,128.8960],["daegu",35.8690,128.5950],["jeju_city",33.4996,126.5312]];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let calls = 0;
async function call(sv, op, p) {
  calls++;
  const qs = new URLSearchParams({ serviceKey: KEY, MobileOS: "ETC", MobileApp: "KTrip", _type: "json", ...p });
  const r = await fetch(`https://apis.data.go.kr/B551011/${sv}/${op}?${qs}`);
  const t = await r.text(); try { const it = JSON.parse(t)?.response?.body?.items?.item; return Array.isArray(it) ? it : it ? [it] : []; } catch { return null; }
}
const empties = [];
for (const [l, sv] of Object.entries(SV)) {
  let tot = 0, emp = 0;
  for (const [a, lat, lng] of AREAS) {
    const items = await call(sv, "locationBasedList2", { mapX: String(lng), mapY: String(lat), radius: "3000", numOfRows: "10", pageNo: "1", arrange: "E" });
    if (items === null) { console.log(`! ${l} ${a}: API error (quota?) — stopping`); process.exit(0); }
    for (const it of items) {
      const d = await call(sv, "detailCommon2", { contentId: it.contentid });
      tot++; if (!(d?.[0]?.overview || "").trim()) { emp++; empties.push(`${l} | ${a} | ${it.contentid} | type ${it.contenttypeid} | ${it.title}`); }
      await sleep(80);
    }
  }
  console.log(`[${l}] ${emp} of ${tot} nearest places have no description`);
}
console.log("EMPTY:\n" + empties.join("\n"));
console.log(`API calls used: ${calls}`);
