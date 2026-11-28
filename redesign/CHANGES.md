# Redesign v2: change log (managed separately)

> The live app (`index.html`) is **left untouched**. The redesign is kept only in these files:
> - `redesign/v2.css` — styles
> - `redesign/v2.js` — screen layout and behaviour (it reuses the app's existing functions)
> - `redesign/build.py` — builds the rolling test page `test.html` (with no argument) or a snapshot `MMDD.html` (with a date argument) from index.html plus the two files above
> - `1120.html` — the 2026-11-20 test page (**generated file, do not edit by hand**)
>
> Test URL: https://dev--classy-puffpuff-3becd9.netlify.app/1120.html  (with the developer card: `?dev=1`)
> **Test page (always the latest): https://dev--classy-puffpuff-3becd9.netlify.app/test.html**
> Version policy (Jay, 11/23): **don't make a version file for every change** — log changes in this CHANGES.md (and in memory), and make a dated snapshot (`MMDD.html`, frozen copy in `redesign/snap/MMDD/`) **only at major changes or on a set cycle** (e.g. before production release, when the design is approved, or weekly).
> Snapshots so far: `1120.html` (first redesign), `1123.html` (description moved up), `1128.html` (just before the production release).

## How it is managed
- **When index.html changes:** run `python3 redesign/build.py` to rebuild today's date page (`MMDD.html`). Features added to the app carry over to the redesign as they are.
- **To roll back (discard the redesign):** delete the `redesign/` folder and the date pages (`MMDD.html`). index.html is unaffected.
- **To adopt:** after approval, add 3 lines to index.html (the fonts link, v2.css, v2.js). Keep the pre-adoption state in the `backup-pre-redesign` branch.
- **Pre-adoption backup:** GitHub branch `backup-pre-redesign` (commit ca6dcea, 2026-11-20).

## Changes

| ID | Item | Description | Files |
|---|---|---|---|
| R1 | Tab layout | Sections are assigned to tabs (Explore = location + search + list; Walks = location + course card; Hiking = location + list; Saved = saved list). | v2.js, v2.css |
| R2 | Map + bottom sheet | The guide view goes into a bottom sheet, and the app's map element moves to a full-screen layer behind it. | v2.js, v2.css |
| R3 | Bottom tab bar | 4 fixed tabs (Explore / Walks / Hiking / Saved), line SVG icons, labels in 5 languages. | v2.js, v2.css |
| R4 | Chip icons | Chip emoji replaced with 1.5px-stroke SVG icons (9 kinds); pill-shaped chips. | v2.js, v2.css |
| R5 | Saved | ☆ Save button on place and mountain rows; Saved tab (stored in localStorage on this device, up to 100). | v2.js |
| R6 | Tab switching | Explore ↔ Hiking switches the hike category automatically; Walks tab shows a notice when the area has no course. | v2.js |
| R7 | Sheet behaviour | 3 heights (peek / half / full). Drag the handle or the content (when scrolled to the top). Fling speed is recognised. Drag all the way down to close. Android **back button closes the sheet**. Close button ✕ at top right. | v2.js |
| R7-1 | Route above the sheet | The route is fitted into the map area **above** the sheet. Your position is included only if it is within 15 km (prevents zooming out to the whole region). | v2.js |
| R8 | Developer card | The API key card is shown only with `?dev=1`. | v2.js, v2.css |
| M1 | Display mode check | Detects the Play app (TWA) / installed app (PWA) / mobile browser / **desktop-site mode** / in-app browser such as KakaoTalk. Desktop-site mode → a "turn off Desktop site" notice; in-app browser → an "open in Chrome" notice (once each). With `?dev=1` the mode, viewport and screen width are shown at the top. | v2.js, v2.css |
| A1 | Description first | "About this place" moves right under the title and address (previously it was the last step, 04). Long text is folded to about 5 lines with a "Read more" button. The repeated "Official description" heading is hidden. | v2.js, v2.css |
| D1 | Cards | Corner radius 16px, soft shadow. | v2.css |
| D2 | Multilingual fonts | `html[lang]` font stacks: ja → Noto Sans JP, zh-Hans → Noto Sans SC, zh-Hant → Noto Sans TC. | v2.css, build |
| D3 | Outdoor readability | `--muted` light #6f6046 → #54472f, dark #b1a58d → #d0c5ae (more contrast). | v2.css |
| D4 | Dancheong stripe | 8px → 3px. | v2.css |

## Checks (headless browser, Pixel 7 emulation, Leaflet map)
- Hiking tab → open a mountain: sheet at half height, map layer shown, markers drawn (4).
- Swipe content up → full (4%); swipe down → peek (74%).
- Browser back → sheet closes, still on the same page.
- Script errors: 0.
- **Not checked:** behaviour with NAVER Map on a real phone (needs a phone test).

## History
- 2026-11-20 v2.0: first sample (single copied file).
- 2026-11-20 v2.1: restructured as separate overlay files. Sheet drag area enlarged (content drag added), back button closes the sheet, route fitted above the sheet, close button moved to the top right (it overlapped the zoom buttons).
- 2026-11-28: snapshot `1128.html` (just before the 11/29 production release). Backup of the app as it was then: branch `backup-pre-release-1128`.
- 2026-11-23 v2.6 (test.html): missing descriptions scanned — 13 areas × 5 languages, nearest 10 places each (~610 places): ko 0, en 1, ja 2, zhs 1, zht 1 had no description (mostly festivals and performances, e.g. "Anthropolis 1", plus STAGE35 Seongsu). Fix (**app itself, index.html dev**): when a foreign-language description is empty, find the same place in Korean KTO (Korean name in the title's brackets → keyword search, else nearest within 40 m) and show the **Korean original + a "Translate" button (Google Translate)**, then the visitor info (dates, times, fees…). Version policy changed to the rolling test.html.
- 2026-11-23 v2.5 (`1123.html`): reported "some places have no description" → KTO check: descriptions exist for nearly all places in each language's list (0 empty in 25 sampled each around Yongin, Suwon and Gyeongbokgung). In the redesign the description was at the very bottom, so it looked missing. → A1 description first. Also added to the **app itself (index.html, dev)**: a **visitor info** box (KTO detailIntro2: hours, closed days, fees, contact, parking, dates, signature dish, check-in, website), also shown when there is no description. Each date page now uses a frozen overlay copy (`redesign/snap/`).
- 2026-11-20 v2.4: display mode check (M1) — reported "text looks small, like a PC" → likely the browser's "Desktop site" setting is on; detect it and show a notice.
- 2026-11-20: test page renamed `next.html` → `1120.html` (date naming rule).
- 2026-11-20 v2.3: stage 2 — mini player + Media Session, sunset gauge + 119, map-app tip (P1, P2, H1, H2, T1). Checked in emulation: gauge, 119 button, player (recording plays, subtitles, back, stop), tip all OK; 0 errors.
- 2026-11-20 v2.2: on a real phone the map did not show with NAVER Map. NAVER writes `position:relative` inline on the map container, so with `height:auto` the height became 0. Fixed with `!important` absolute positioning at 100% width and height, plus one more map resize after it loads.
