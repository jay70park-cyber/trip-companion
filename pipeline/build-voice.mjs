// Recorded narration for walking courses with Google Cloud Text-to-Speech (Chirp 3: HD voices).
// For every stop and language it makes one mp3 of "name. text" and lists it in <outDir>/voice/index.json:
//   { "<courseId>/<stopN>/<lang>": { "h": <hash of the spoken text>, "f": "<file>.mp3" } }
// The app plays a file only when its hash matches the text it is showing, so a stale recording is never played.
// Only text that changed since the last run is sent to Google, and MAX_CHARS caps one run
// (Chirp 3: HD has a free allowance of 1M characters a month; a full first run is about 0.2M).
import fs from "node:fs";
import path from "node:path";
import { fnv, spoken } from "./voice-lib.mjs";

const OUT = path.resolve(process.argv[2] || "out");
const CDIR = path.join(OUT, "courses");
const VDIR = path.join(OUT, "voice");
const KEY = process.env.GOOGLE_TTS_KEY || "";
const VOICE = process.env.VOICE_NAME || "Aoede";
const MAX_CHARS = +(process.env.MAX_CHARS || 600000);
const ONLY = (process.env.COURSES || "").split(",").map((x) => x.trim()).filter(Boolean);
const LANGS = { en: ["en-US"], ko: ["ko-KR"], ja: ["ja-JP"], zhs: ["cmn-CN"], zht: ["cmn-TW", "cmn-CN"] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const API = "https://texttospeech.googleapis.com/v1";

async function call(url, body) {
  for (let i = 0; i < 4; i++) {
    const res = await fetch(`${url}${url.includes("?") ? "&" : "?"}key=${KEY}`, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
    const t = await res.text();
    if (res.ok) return JSON.parse(t);
    if (res.status === 429 || res.status >= 500) { await sleep(3000 * (i + 1)); continue; }
    throw new Error(`HTTP ${res.status} ${t.slice(0, 200)}`);
  }
  throw new Error("Text-to-Speech kept failing");
}

async function pickVoices() {
  const all = (await call(`${API}/voices`)).voices || [];
  const out = {};
  for (const [l, codes] of Object.entries(LANGS)) {
    for (const c of codes) {
      const hd = all.filter((v) => v.name.startsWith(`${c}-Chirp3-HD-`));
      const v = hd.find((x) => x.name.endsWith(`-${VOICE}`)) || hd[0];
      if (v) { out[l] = { languageCode: c, name: v.name }; break; }
    }
    console.log(`  ${l}: ${out[l]?.name || "no Chirp 3: HD voice — skipped"}`);
  }
  return out;
}

// Chirp 3: HD takes up to 5,000 bytes per request; longer text is split at sentence ends and the mp3s joined
function chunks(text) {
  const parts = text.match(/[^.!?。！？]+[.!?。！？]*\s*/g) || [text];
  const out = [""];
  for (const p of parts) { if (Buffer.byteLength(out.at(-1) + p) > 4200) out.push(""); out[out.length - 1] += p; }
  return out.filter((x) => x.trim());
}

async function main() {
  if (!KEY) { console.log("GOOGLE_TTS_KEY is not set — nothing to do."); return; }
  fs.mkdirSync(VDIR, { recursive: true });
  const ixPath = path.join(VDIR, "index.json");
  const prev = fs.existsSync(ixPath) ? JSON.parse(fs.readFileSync(ixPath, "utf8")) : { files: {} };
  if (process.env.SAMPLE) return samples();
  const voices = await pickVoices();
  const files = {};
  let chars = 0, made = 0, kept = 0, capped = 0, fails = 0, stopped = false;
  const courses = fs.readdirSync(CDIR).filter((f) => f.endsWith(".json") && f !== "index.json");
  for (const f of courses) {
    const c = JSON.parse(fs.readFileSync(path.join(CDIR, f), "utf8"));
    for (const s of c.stops || []) {
      for (const l of Object.keys(LANGS)) {
        const text = spoken(s, l);
        const key = `${c.id}/${s.n}/${l}`;
        if (!text || !voices[l]) continue;
        const h = fnv(text);
        const old = prev.files[key];
        const file = `${c.id}-${s.n}-${l}-${h}-${voices[l].name.split("-").pop().toLowerCase()}.mp3`;
        if (old && old.h === h && old.v === voices[l].name && fs.existsSync(path.join(VDIR, old.f))) { files[key] = old; kept++; continue; }
        if (ONLY.length && !ONLY.includes(c.id)) { if (old) files[key] = old; continue; }
        if (stopped || chars + text.length > MAX_CHARS) { capped++; if (old) files[key] = old; continue; }
        try {
          const bufs = [];
          for (const part of chunks(text)) {
            const r = await call(`${API}/text:synthesize`, { input: { text: part }, voice: voices[l], audioConfig: { audioEncoding: "MP3" } });
            bufs.push(Buffer.from(r.audioContent, "base64"));
          }
          fs.writeFileSync(path.join(VDIR, file), Buffer.concat(bufs));
          files[key] = { h, f: file, v: voices[l].name };
          chars += text.length; made++; fails = 0;
          if (made % 20 === 0) console.log(`  … ${made} recordings, ${chars} characters`);
        } catch (e) {
          console.log(`  ! ${key}: ${e.message}`); if (old) files[key] = old;
          // e.g. the free trial ended or billing was turned off: stop asking, keep every recording made so far
          if (++fails >= 5 && !stopped) { stopped = true; console.log("  ! Text-to-Speech keeps failing — stopping; existing recordings are kept and the app reads the rest with the phone's voice"); }
        }
        await sleep(120);
      }
    }
  }
  // remove recordings that no stop uses any more
  const used = new Set(Object.values(files).map((x) => x.f));
  for (const f of fs.readdirSync(VDIR)) if (f.endsWith(".mp3") && !used.has(f)) fs.unlinkSync(path.join(VDIR, f));
  fs.writeFileSync(ixPath, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), voice: VOICE, files }));
  console.log(`Done: ${made} new recordings (${chars} characters sent), ${kept} unchanged${capped ? `, ${capped} left for the next run (MAX_CHARS)` : ""}.`);
}

// Voice audition: the same stop read by several voices, saved as voice/samples/<voice>-<lang>.mp3
async function samples() {
  const all = (await call(`${API}/voices`)).voices || [];
  const c = JSON.parse(fs.readFileSync(path.join(CDIR, "gojong.json"), "utf8"));
  const s = c.stops[1];
  const dir = path.join(VDIR, "samples");
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  for (const name of process.env.SAMPLE.split(",")) {
    for (const [l, code] of [["ko", "ko-KR"], ["en", "en-US"]]) {
      const v = all.find((x) => x.name === `${code}-Chirp3-HD-${name.trim()}`);
      if (!v) { console.log(`  no ${code} ${name}`); continue; }
      const text = spoken(s, l);
      const r = await call(`${API}/text:synthesize`, { input: { text }, voice: { languageCode: code, name: v.name }, audioConfig: { audioEncoding: "MP3" } });
      fs.writeFileSync(path.join(dir, `${name.trim()}-${l}.mp3`), Buffer.from(r.audioContent, "base64"));
      console.log(`  ✓ ${v.name} (${v.ssmlGender})`);
    }
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
