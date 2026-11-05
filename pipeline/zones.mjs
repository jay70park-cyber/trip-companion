// Areas that get an automatic walking course.
// id      — matches the area id in index.html (AREAS)
// type    — "hot": recent blog mentions drive the stops; "heritage": official sites and Odii stories drive them
// start   — where the walk begins (a station exit or main gate)
// radiusM — how far from the start a stop may be
// queries — Korean search phrases for recent blog posts (hot areas only)
export const ZONES = [
  {
    id: "hongdae", type: "hot",
    name: { en: "Hongdae", ko: "홍대", ja: "弘大", zhs: "弘大", zht: "弘大" },
    start: { lat: 37.5573, lng: 126.9245, label: { en: "Hongik Univ. Station Exit 9", ko: "홍대입구역 9번 출구" } },
    radiusM: 800,
    queries: ["홍대 핫플", "홍대 가볼만한곳", "홍대 데이트 코스", "연남동 핫플"],
  },
  {
    id: "seongsu", type: "hot",
    name: { en: "Seongsu-dong", ko: "성수동", ja: "聖水洞", zhs: "圣水洞", zht: "聖水洞" },
    start: { lat: 37.5446, lng: 127.0560, label: { en: "Seongsu Station Exit 3", ko: "성수역 3번 출구" } },
    radiusM: 1300,  // few official sites close to the station; reach Seoul Forest and the café streets
    queries: ["성수동 핫플", "성수 팝업", "성수동 가볼만한곳", "성수 카페거리"],
  },
  {
    id: "myeongdong", type: "hot",
    name: { en: "Myeong-dong", ko: "명동", ja: "明洞", zhs: "明洞", zht: "明洞" },
    start: { lat: 37.5609, lng: 126.9863, label: { en: "Myeong-dong Station Exit 6", ko: "명동역 6번 출구" } },
    radiusM: 700,
    queries: ["명동 핫플", "명동 가볼만한곳", "명동 맛집 거리"],
  },
  {
    id: "gyeongbok", type: "heritage",
    name: { en: "Gyeongbokgung & Bukchon", ko: "경복궁·북촌", ja: "景福宮・北村", zhs: "景福宫·北村", zht: "景福宮·北村" },
    start: { lat: 37.5760, lng: 126.9769, label: { en: "Gwanghwamun Gate", ko: "광화문" } },
    radiusM: 1200,
    queries: ["북촌 가볼만한곳", "삼청동 핫플"],
  },
  {
    id: "hwaseong", type: "heritage",
    name: { en: "Hwaseong Fortress & Haenggung", ko: "수원화성·화성행궁", ja: "水原華城・華城行宮", zhs: "水原华城·华城行宫", zht: "水原華城·華城行宮" },
    start: { lat: 37.2817, lng: 127.0137, label: { en: "Hwaseong Haenggung Square", ko: "화성행궁 광장" } },
    radiusM: 1300,
    queries: ["행리단길 핫플", "수원화성 가볼만한곳"],
  },
];

export const LANGS = ["en", "ko", "ja", "zhs", "zht"];
export const KTO_SERVICE = { en: "EngService2", ko: "KorService2", ja: "JpnService2", zhs: "ChsService2", zht: "ChtService2" };
// Attraction + culture content types, per service family
export const KTO_TYPES = { ko: ["12", "14"], foreign: ["76", "78"] };
export const ODII_LANG = { en: "en", ko: "ko", ja: "jp" };
