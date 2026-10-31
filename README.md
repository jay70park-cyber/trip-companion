# Trip Companion

Location-based travel companion for foreign visitors in Korea: nearby places and temples (KTO TourAPI), public transport and walking routes (TMAP), NAVER map with live follow, arrival alerts, and audio guides (KTO Odii). Installable as an app (PWA).

- `index.html` — the app (single page)
- `netlify/functions/api.mjs` — server relay that adds API keys (`/api/*`)
- `manifest.webmanifest`, `sw.js`, `icons/` — app install support

## Keys (Netlify environment variables)

| Variable | Value |
|---|---|
| `TOURAPI_KEY` | data.go.kr general key (Decoding) |
| `TMAP_KEY` | SK open API appKey |
| `NAVER_CLIENT_ID` | NAVER Cloud Maps Client ID |

No key is stored in this repository.

Deployed automatically to Netlify from the `main` branch.
