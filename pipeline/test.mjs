// Self-test for the pure pipeline helpers. Run: node pipeline/test.mjs
import assert from "node:assert/strict";
import * as L from "./lib.mjs";

const start = { lat: 37.5573, lng: 126.9245 };

// distance
assert.ok(Math.abs(L.meters({ lat: 37.5, lng: 127 }, { lat: 37.501, lng: 127 }) - 111.2) < 1);

// Naver coordinates (× 10^7) and rejection outside Korea
assert.deepEqual(L.naverCoord("1269245000", "375573000"), { lat: 37.5573, lng: 126.9245 });
assert.equal(L.naverCoord("0", "0"), null);

// sponsored and old posts are dropped
const now = new Date(Date.UTC(2026, 10, 5));
const posts = [
  { title: "홍대 카페", description: "분위기 좋은 곳", postdate: "20261020" },
  { title: "홍대 카페 <b>협찬</b>", description: "제공받아 작성", postdate: "20261021" },
  { title: "옛날 글", description: "작년", postdate: "20250101" },
];
assert.equal(L.recentPosts(posts, now, 90).length, 1);

// categories
assert.equal(L.allowedCategory("카페,디저트>카페"), true);
assert.equal(L.allowedCategory("술집>요리주점"), false);
assert.equal(L.allowedCategory("숙박>모텔"), false);

// distinct bloggers
const ps = [{ bloggerlink: "a" }, { bloggerlink: "a" }, { bloggerlink: "b" }, { bloggerlink: "c" }];
const sc = L.scoreMentions([{ name: "카페 X", posts: [0, 1, 2, 3] }, { name: "카페 Y", posts: [0, 1] }], ps);
assert.equal(sc[0].bloggers, 3);
assert.equal(sc[1].bloggers, 1);

// dedupe within 40 m and same name
const d = L.dedupe([
  { lat: 37.557, lng: 126.925, name: "A" },
  { lat: 37.5571, lng: 126.9251, name: "B" },     // ~14 m away → dropped
  { lat: 37.56, lng: 126.92, nameKo: "카페 A 본점" },
  { lat: 37.561, lng: 126.921, nameKo: "카페 A" }, // same name → dropped
]);
assert.equal(d.length, 2);

// ordering visits nearest first and never makes the walk longer
const pts = [
  { lat: 37.5600, lng: 126.9245 }, { lat: 37.5580, lng: 126.9245 },
  { lat: 37.5620, lng: 126.9245 }, { lat: 37.5590, lng: 126.9260 },
];
const ord = L.orderStops(start, pts);
assert.equal(ord[0].lat, 37.5580);
assert.equal(ord.length, 4);

// walk fitting drops far stops and respects limits
const far = pts.concat([{ lat: 37.60, lng: 126.95 }]);
const fit = L.fitWalk(start, far, { maxLeg: 900, maxTotal: 3000, minStops: 4, maxStops: 8 });
assert.ok(fit && fit.stops.length === 4 && fit.straightM <= 3000);
assert.equal(L.fitWalk(start, pts.slice(0, 2), { minStops: 4 }), null);

// sentences and JSON
assert.equal(L.firstSentences("One. Two! Three? Four.", 2), "One. Two!");
assert.equal(L.firstSentences("<p>첫 문장입니다. 둘째 문장입니다.</p>", 1), "첫 문장입니다.");
assert.deepEqual(L.parseJson('Sure:\n{"a":1}\n'), { a: 1 });

// validation
const good = { stops: [1, 2, 3, 4].map((n) => ({ n, lat: 1, lng: 1, name: { en: "x", ko: "x" }, text: { en: "t", ko: "t" } })) };
assert.deepEqual(L.validateCourse(good, ["en", "ko"]), []);
good.stops[0].text.ko = "";
assert.equal(L.validateCourse(good, ["en", "ko"]).length, 1);

// names and sights
assert.equal(L.stripKoParen("弘大（홍대）"), "弘大");
assert.equal(L.stripKoParen("KT&G Sangsangmadang (KT&G 상상마당(홍대))"), "KT&G Sangsangmadang");
assert.equal(L.stripKoParen("Hongdae (Hongik University Street)"), "Hongdae (Hongik University Street)");
assert.equal(L.isSight("ID Clinic Hongdae"), false);
assert.equal(L.isSight("G-line Book Street"), true);
assert.equal(L.allowedCategory("의료>성형외과"), false);

console.log("pipeline self-test: all passed");
