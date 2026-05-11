# Project State

Updated: 2026-05-11 21:45:00 +08:00

Use this file for durable project facts that should follow every task.
Keep it concise. Do not paste full transcripts.

## Durable Project Facts
- `word_books.json` is permanently removed from git and gitignored. It was replaced by `books_manifest.json` + `books/*.json`.
- Word book manifest format: `{books: {cet4: {path, count}, cet6: {...}, kaoyan: {...}}}`.
- The app is a single-page PWA served by Python SimpleHTTPRequestHandler on port 8000.

## Architecture / Configuration Notes
- Source files: `index.html` (HTML shell), `style.css` (all styles), `app.js` (all logic), `phonetic_db.js` (preloaded phonetics), `sw.js` (service worker)
- Deployment: GitHub Pages via `.github/workflows/pages.yml` — must copy `index.html`, `style.css`, `app.js`, `reset.html`, `books_manifest.json`, `manifest.json`, `phonetic_db.js`, `sw.js`, icons, `books/`, `.nojekyll` to `_site/`
- JS functions remain global (not modules/IIFE) because HTML uses `onclick` attributes
- Service worker cache: `wordkiller-v21` (bump on asset structure changes)
- Phonetic enrichment: local DB → Youdao API (via allorigins.win CORS proxy) → Free Dictionary API
- Pronunciation: Youdao dictvoice audio, fallback to browser SpeechSynthesis TTS

## Do Not Recreate / Revert
- Do NOT recreate `word_books.json` — it's a 2MB legacy file replaced by `books_manifest.json` + `books/*.json`
- Do NOT re-inline CSS or JS back into `index.html` — the three-file split is intentional
