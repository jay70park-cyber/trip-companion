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
  // ---- added 2026-11-17 ----
  {
    id: "insadong", type: "heritage",
    name: { en: "Insadong & Ikseondong", ko: "인사동·익선동", ja: "仁寺洞・益善洞", zhs: "仁寺洞·益善洞", zht: "仁寺洞·益善洞" },
    start: { lat: 37.5760, lng: 126.9855, label: { en: "Anguk Station Exit 6", ko: "안국역 6번 출구" } },
    radiusM: 900,
    queries: ["익선동 핫플", "인사동 가볼만한곳"],
  },
  {
    id: "changdeok", type: "heritage",
    name: { en: "Changdeokgung & Changgyeonggung", ko: "창덕궁·창경궁", ja: "昌徳宮・昌慶宮", zhs: "昌德宫·昌庆宫", zht: "昌德宮·昌慶宮" },
    start: { lat: 37.5794, lng: 126.9910, label: { en: "Donhwamun Gate, Changdeokgung", ko: "창덕궁 돈화문" } },
    radiusM: 1100,
    queries: ["원서동 가볼만한곳", "창경궁 산책"],
  },
  {
    id: "namsan", type: "heritage",
    name: { en: "Namsan & N Seoul Tower", ko: "남산·N서울타워", ja: "南山・Nソウルタワー", zhs: "南山·N首尔塔", zht: "南山·N首爾塔" },
    start: { lat: 37.5512, lng: 126.9882, label: { en: "N Seoul Tower", ko: "N서울타워" } },
    radiusM: 1200,
    queries: ["남산 산책로", "해방촌 핫플"],
  },
  {
    id: "ddp", type: "hot",
    name: { en: "Dongdaemun, DDP & Euljiro", ko: "동대문·DDP·을지로", ja: "東大門・DDP・乙支路", zhs: "东大门·DDP·乙支路", zht: "東大門·DDP·乙支路" },
    start: { lat: 37.5665, lng: 127.0092, label: { en: "Dongdaemun Design Plaza (DDP)", ko: "동대문디자인플라자(DDP)" } },
    radiusM: 1100,
    queries: ["동대문 DDP 가볼만한곳", "을지로 핫플", "광장시장 맛집"],
  },
  {
    id: "jamsil", type: "hot",
    name: { en: "Jamsil & Seokchon Lake", ko: "잠실·석촌호수", ja: "蚕室・石村湖", zhs: "蚕室·石村湖", zht: "蠶室·石村湖" },
    start: { lat: 37.5125, lng: 127.1025, label: { en: "Lotte World Tower", ko: "롯데월드타워" } },
    radiusM: 1200,
    queries: ["석촌호수 핫플", "송리단길 핫플"],
  },
  {
    id: "chinatown", type: "heritage",
    name: { en: "Incheon Chinatown & Open Port", ko: "인천 차이나타운·개항장", ja: "仁川チャイナタウン・開港場", zhs: "仁川唐人街·开港场", zht: "仁川中華街·開港場" },
    start: { lat: 37.4764, lng: 126.6168, label: { en: "Incheon Station", ko: "인천역" } },
    radiusM: 1000,
    queries: ["인천 개항장 가볼만한곳", "차이나타운 핫플"],
  },
  {
    id: "gongju", type: "heritage",
    name: { en: "Gongju: Gongsanseong & Jeminchon", ko: "공주 공산성·제민천", ja: "公州 公山城・済民川", zhs: "公州 公山城·济民川", zht: "公州 公山城·濟民川" },
    start: { lat: 36.4628, lng: 127.1250, label: { en: "Gongsanseong Fortress", ko: "공산성" } },
    radiusM: 1300,
    queries: ["공주 제민천 핫플", "공산성 가볼만한곳"],
  },
  {
    id: "jeonju", type: "heritage",
    name: { en: "Jeonju Hanok Village", ko: "전주 한옥마을", ja: "全州韓屋村", zhs: "全州韩屋村", zht: "全州韓屋村" },
    start: { lat: 35.8153, lng: 127.1500, label: { en: "Gyeonggijeon Shrine", ko: "경기전" } },
    radiusM: 1000,
    queries: ["전주 한옥마을 핫플", "전주 객리단길"],
  },
  {
    id: "yeosu", type: "hot",
    name: { en: "Yeosu Harbor", ko: "여수 이순신광장·낭만포차", ja: "麗水 李舜臣広場", zhs: "丽水 李舜臣广场", zht: "麗水 李舜臣廣場" },
    start: { lat: 34.7385, lng: 127.7371, label: { en: "Yi Sun-sin Square", ko: "이순신광장" } },
    radiusM: 1300,
    queries: ["여수 낭만포차", "이순신광장 가볼만한곳"],
  },
  {
    id: "gyeongju", type: "heritage",
    name: { en: "Gyeongju: Daereungwon & Hwangnidan-gil", ko: "경주 대릉원·황리단길", ja: "慶州 大陵苑・皇理団通り", zhs: "庆州 大陵苑·皇理团路", zht: "慶州 大陵苑·皇理團路" },
    start: { lat: 35.8380, lng: 129.2120, label: { en: "Daereungwon Tomb Complex", ko: "대릉원" } },
    radiusM: 1200,
    queries: ["황리단길 핫플", "경주 대릉원 가볼만한곳"],
  },
  {
    id: "hahoe", type: "heritage",
    name: { en: "Andong Hahoe Village", ko: "안동 하회마을", ja: "安東河回村", zhs: "安东河回村", zht: "安東河回村" },
    start: { lat: 36.5390, lng: 128.5180, label: { en: "Hahoe Village entrance", ko: "하회마을 입구" } },
    radiusM: 900,
    queries: ["안동 하회마을 가볼만한곳"],
  },
  {
    id: "daegu", type: "hot",
    name: { en: "Daegu: Modern Alleys & Dongseongno", ko: "대구 근대골목·동성로", ja: "大邱 近代路地・東城路", zhs: "大邱 近代胡同·东城路", zht: "大邱 近代胡同·東城路" },
    start: { lat: 35.8690, lng: 128.5950, label: { en: "Dongseongno", ko: "동성로" } },
    radiusM: 1200,
    queries: ["대구 근대골목 투어", "동성로 핫플", "김광석 거리"],
  },
  {
    id: "busan_haeundae", type: "hot",
    name: { en: "Busan Haeundae", ko: "부산 해운대", ja: "釜山 海雲台", zhs: "釜山 海云台", zht: "釜山 海雲臺" },
    start: { lat: 35.1631, lng: 129.1590, label: { en: "Haeundae Station Exit 5", ko: "해운대역 5번 출구" } },
    radiusM: 1300,
    queries: ["해운대 핫플", "해리단길 핫플", "블루라인파크"],
  },
  {
    id: "busan_gamcheon", type: "heritage",
    name: { en: "Busan Gamcheon Culture Village", ko: "부산 감천문화마을", ja: "釜山 甘川文化村", zhs: "釜山 甘川文化村", zht: "釜山 甘川文化村" },
    start: { lat: 35.0975, lng: 129.0106, label: { en: "Gamcheon Culture Village", ko: "감천문화마을 입구" } },
    radiusM: 800,
    queries: ["감천문화마을 가볼만한곳"],
  },
  {
    id: "busan_nampo", type: "hot",
    name: { en: "Busan Nampo-dong & Jagalchi", ko: "부산 남포동·자갈치", ja: "釜山 南浦洞・チャガルチ", zhs: "釜山 南浦洞·札嘎其", zht: "釜山 南浦洞·札嘎其" },
    start: { lat: 35.0966, lng: 129.0306, label: { en: "Nampo Station", ko: "남포역" } },
    radiusM: 1000,
    queries: ["남포동 핫플", "자갈치시장 맛집", "BIFF광장"],
  },
  {
    id: "jeju_city", type: "heritage",
    name: { en: "Jeju Old Town", ko: "제주 원도심", ja: "済州 旧市街", zhs: "济州 旧城区", zht: "濟州 舊城區" },
    start: { lat: 33.5115, lng: 126.5269, label: { en: "Dongmun Market", ko: "동문시장" } },
    radiusM: 1200,
    queries: ["제주 원도심 가볼만한곳", "동문시장 맛집", "탑동 핫플"],
  },
  {
    id: "seogwipo", type: "heritage",
    name: { en: "Seogwipo Old Town", ko: "서귀포 이중섭거리·올레시장", ja: "西帰浦 李仲燮通り", zhs: "西归浦 李仲燮街", zht: "西歸浦 李仲燮街" },
    start: { lat: 33.2464, lng: 126.5642, label: { en: "Lee Jung-seop Street", ko: "이중섭거리" } },
    radiusM: 1200,
    queries: ["서귀포 올레시장", "이중섭거리 가볼만한곳", "천지연폭포"],
  },
  {
    id: "daejeon", type: "hot",
    name: { en: "Daejeon Old Downtown", ko: "대전 원도심", ja: "大田 旧都心", zhs: "大田 旧城区", zht: "大田 舊城區" },
    start: { lat: 36.3290, lng: 127.4275, label: { en: "Jungangno Station", ko: "중앙로역" } },
    radiusM: 1200,
    queries: ["대전 원도심 핫플", "대전 은행동 가볼만한곳", "소제동 카페"],
  },
];
export const LANGS = ["en", "ko", "ja", "zhs", "zht"];
export const KTO_SERVICE = { en: "EngService2", ko: "KorService2", ja: "JpnService2", zhs: "ChsService2", zht: "ChtService2" };
// Attraction + culture content types, per service family
export const KTO_TYPES = { ko: ["12", "14"], foreign: ["76", "78"] };
export const ODII_LANG = { en: "en", ko: "ko", ja: "jp" };
