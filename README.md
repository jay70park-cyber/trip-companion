# K-Trip Companion

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

## Walking courses (automatic)

`.github/workflows/courses.yml` runs on the 1st of every month (and on demand from the Actions tab).
It runs `pipeline/build-courses.mjs`, which builds a walking course for each zone in `pipeline/zones.mjs`
from KTO official places, Odii audio stories and recent Naver blog posts, checks every stop on the map,
lays out a walkable route with TMAP, writes commentary with an AI model that is fact-checked against the
sources, and translates it into five languages. Courses are written to the `data` branch
(`courses/index.json`, `courses/<zone>.json`), which the app reads directly, so no Netlify deploy is needed.

Repository secrets used: `TOURAPI_KEY`, `TMAP_KEY`, `NAVER_SEARCH_ID`, `NAVER_SEARCH_SECRET`, `ANTHROPIC_API_KEY`.
Optional repository variable: `AI_MODEL`. Without the Naver/AI keys the courses use official places only.
