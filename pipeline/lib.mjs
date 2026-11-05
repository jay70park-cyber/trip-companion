// Pure helpers for the course pipeline (no network). Covered by pipeline/test.mjs.

export function meters(a, b) {
  const R = 6371000, r = Math.PI / 180;
  const x = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export const stripTags = (s) => String(s || "").replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").trim();

// Naver local search returns WGS84 degrees × 10^7 as integers in strings.
export function naverCoord(mapx, mapy) {
  let x = Number(mapx), y = Number(mapy);
  if (!isFinite(x) || !isFinite(y)) return null;
  if (Math.abs(x) > 1000) x /= 1e7;
  if (Math.abs(y) > 1000) y /= 1e7;
  if (x < 124 || x > 132 || y < 33 || y > 39) return null; // outside Korea → reject
  return { lat: y, lng: x };
}

// "20260930" → Date
export function parsePostDate(s) {
  const m = String(s || "").match(/^(\d{4})(\d{2})(\d{2})$/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
}

const SPONSORED = /협찬|체험단|원고료|제공\s*받|무상\s*제공|광고|소정의|서포터즈|업체로부터/;
export function isSponsored(post) {
  return SPONSORED.test(stripTags(post.title) + " " + stripTags(post.description));
}

export function recentPosts(posts, now, days = 90) {
  const since = now.getTime() - days * 86400000;
  return posts.filter((p) => {
    const d = parsePostDate(p.postdate);
    return d && d.getTime() >= since && !isSponsored(p);
  });
}

// Places we never send visitors to (bars, nightlife, lodging, chains of no interest)
const EXCLUDED_CATEGORY = /술집|주점|호프|요리주점|포차|바\(BAR\)|클럽|나이트|유흥|모텔|호텔|숙박|노래방|PC방|편의점|은행|병원|약국|부동산|주차장/;
export function allowedCategory(category) {
  return !EXCLUDED_CATEGORY.test(String(category || ""));
}

// Count distinct bloggers per extracted place name.
// extracted: [{ name, posts: [indices into posts] }]
export function scoreMentions(extracted, posts) {
  const out = [];
  for (const e of extracted || []) {
    const name = String(e.name || "").trim();
    if (!name || name.length < 2) continue;
    const bloggers = new Set();
    for (const i of e.posts || []) {
      const p = posts[i];
      if (p) bloggers.add(p.bloggerlink || p.bloggername || String(i));
    }
    out.push({ name, category: e.category || "", bloggers: bloggers.size });
  }
  return out.sort((a, b) => b.bloggers - a.bloggers);
}

// Drop candidates that sit within `minGap` metres of a better one.
export function dedupe(cands, minGap = 40) {
  const kept = [];
  for (const c of cands) {
    if (kept.some((k) => meters(k, c) < minGap)) continue;
    const cn = normName(c.nameKo || c.nameEn || c.name);
    if (cn && kept.some((k) => normName(k.nameKo || k.nameEn || k.name) === cn)) continue;
    kept.push(c);
  }
  return kept;
}
const normName = (s) => (s == null ? "" : String(s)).replace(/\s|\(.*?\)|본점|점$/g, "").toLowerCase();

// Order stops for a walk from `start`: nearest neighbour, then 2-opt on the open path.
export function orderStops(start, stops) {
  const rest = stops.slice(), path = [];
  let cur = start;
  while (rest.length) {
    let bi = 0, bd = Infinity;
    rest.forEach((s, i) => { const d = meters(cur, s); if (d < bd) { bd = d; bi = i; } });
    cur = rest.splice(bi, 1)[0];
    path.push(cur);
  }
  const len = (p) => p.reduce((acc, s, i) => acc + meters(i ? p[i - 1] : start, s), 0);
  let improved = true, best = path;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const cand = best.slice(0, i).concat(best.slice(i, k + 1).reverse(), best.slice(k + 1));
        if (len(cand) + 0.5 < len(best)) { best = cand; improved = true; }
      }
    }
  }
  return best;
}

// Enforce walkability: each leg ≤ maxLeg, whole walk ≤ maxTotal, between min and max stops.
// Drops the stop farthest from the start until the limits hold.
export function fitWalk(start, stops, { maxLeg = 900, maxTotal = 3500, minStops = 4, maxStops = 9 } = {}) {
  let s = stops.slice(0, Math.max(maxStops * 2, maxStops));
  for (let guard = 0; guard < 50; guard++) {
    if (s.length < minStops) return null;
    s = orderStops(start, s).slice(0, maxStops);
    const legs = s.map((x, i) => meters(i ? s[i - 1] : start, x));
    const total = legs.reduce((a, b) => a + b, 0);
    const longLeg = legs.findIndex((d) => d > maxLeg);
    if (longLeg === -1 && total <= maxTotal) return { stops: s, straightM: Math.round(total) };
    if (s.length <= minStops) return null;
    // remove the stop farthest from the start (or the one ending the long leg)
    let drop = longLeg !== -1 ? longLeg : 0;
    if (longLeg === -1) { let far = -1; s.forEach((x, i) => { const d = meters(start, x); if (d > far) { far = d; drop = i; } }); }
    s.splice(drop, 1);
  }
  return null;
}

// Keep only the first n sentences of an official overview.
export function firstSentences(text, n = 3) {
  const t = stripTags(String(text || "").replace(/<br\s*\/?>/gi, " ")).replace(/\s+/g, " ").trim();
  if (!t) return "";
  const parts = t.match(/[^.!?。！？]+[.!?。！？]+["')\]]*|[^.!?。！？]+$/g) || [t];
  return parts.slice(0, n).map((p) => p.trim()).join(" ");
}

// Pull the first JSON object out of a model reply.
export function parseJson(text) {
  const s = String(text || "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("no JSON in reply");
  return JSON.parse(s.slice(a, b + 1));
}

// A course is publishable only if it passes these checks.
export function validateCourse(c, langs) {
  const problems = [];
  if (!c || !Array.isArray(c.stops)) return ["no stops"];
  if (c.stops.length < 4) problems.push("fewer than 4 stops");
  for (const s of c.stops) {
    if (!isFinite(s.lat) || !isFinite(s.lng)) problems.push(`stop ${s.n} has no position`);
    for (const l of langs) {
      if (!s.name || !s.name[l]) problems.push(`stop ${s.n} missing name (${l})`);
      if (!s.text || !s.text[l]) problems.push(`stop ${s.n} missing text (${l})`);
    }
  }
  return problems;
}
