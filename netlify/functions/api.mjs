// Trip Companion server relay.
// Keeps API keys on Netlify (environment variables) so visitors never need one.
//   GET  /api/config                    → which keys are configured (+ the public NAVER client id)
//   GET  /api/tour/<service>/<op>?...   → apis.data.go.kr/B551011/<service>/<op> with serviceKey added
//   POST /api/tmap/<path>               → apis.openapi.sk.com/<path> with appKey header added
const TOUR_SERVICES = new Set(["EngService2", "KorService2", "JpnService2", "ChsService2", "ChtService2", "Odii"]);
const TMAP_PATHS = [/^\/transit\/routes\/?$/, /^\/tmap\/routes\/pedestrian\/?$/];

const env = (k) => (globalThis.Netlify?.env?.get?.(k) ?? process.env[k] ?? "").replace(/[^\x21-\x7E]/g, "");
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export default async (req) => {
  const url = new URL(req.url);
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== url.host) return json({ error: "forbidden origin" }, 403);

  const path = url.pathname.replace(/^\/api\/?/, "");

  if (path === "config") {
    return json({ ok: true, tour: !!env("TOURAPI_KEY"), tmap: !!env("TMAP_KEY"), naver: env("NAVER_CLIENT_ID") });
  }

  if (path.startsWith("tour/")) {
    if (req.method !== "GET") return json({ error: "method" }, 405);
    const [, service, op] = path.split("/");
    if (!TOUR_SERVICES.has(service) || !/^[A-Za-z0-9]+$/.test(op || "")) return json({ error: "not allowed" }, 404);
    const qs = new URLSearchParams(url.search);
    const clientKey = (qs.get("serviceKey") || "").replace(/[^\x21-\x7E]/g, "");
    qs.delete("serviceKey");
    const key = env("TOURAPI_KEY") || clientKey;
    if (!key) return json({ error: "TourAPI key is not configured" }, 500);
    const enc = key.includes("%") ? key : encodeURIComponent(key);
    const r = await fetch(`https://apis.data.go.kr/B551011/${service}/${op}?serviceKey=${enc}&${qs}`);
    return new Response(await r.text(), {
      status: r.status,
      headers: { "content-type": r.headers.get("content-type") || "application/json", "cache-control": r.ok ? "public, max-age=300" : "no-store" },
    });
  }

  if (path.startsWith("tmap/")) {
    if (req.method !== "POST") return json({ error: "method" }, 405);
    const sub = "/" + path.slice(5);
    if (!TMAP_PATHS.some((re) => re.test(sub))) return json({ error: "not allowed" }, 404);
    const key = env("TMAP_KEY") || (req.headers.get("appKey") || "").replace(/[^\x21-\x7E]/g, "");
    if (!key) return json({ error: { message: "TMAP key is not configured" } }, 500);
    const r = await fetch("https://apis.openapi.sk.com" + sub + url.search, {
      method: "POST",
      headers: { appKey: key, "Content-Type": "application/json", Accept: "application/json" },
      body: await req.text(),
    });
    return new Response(await r.text(), { status: r.status, headers: { "content-type": r.headers.get("content-type") || "application/json", "cache-control": "no-store" } });
  }

  return json({ error: "not found" }, 404);
};

export const config = { path: "/api/*" };
