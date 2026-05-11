# Task State

Updated: 2026-05-06 23:55:00 +08:00

## Current Goal
Replace default word books with more complete, credible curated sources.

## Working Branch
TBD

## Changed Files
- `download_json_words.py`
- `.gitignore`
- `DATA_SOURCES.md`
- `books_manifest.json`
- `books/cet4.json`
- `books/cet6.json`
- `books/kaoyan.json`
- `word_books.json`
- `index.html`
- `sw.js`

## Decisions
- Default book inflation was caused by duplicate English word entries with alternate meanings.
- Added generation-time deduplication by lowercased word, keeping the entry with the richest meaning/phonetic score.
- CET4 uses the cleaned KyleBing CET4 source because it matches the ~4500 expected scope after dedupe.
- CET6 now uses full six-level scope: CET4 base words plus endict CET6 supplement from the 2016 national CET syllabus source.
- Kaoyan now uses exam-data NETEMVocabulary 2024 syllabus/frequency list.
- Added `DATA_SOURCES.md` for source and license notes; NETEM data is CC BY-NC-SA 4.0.
- Bumped app version/cache name for PWA refresh.

## Tests
- `python -m py_compile download_json_words.py server.py`
- JSON verification: manifest counts match file lengths; lowercased duplicate count, missing meaning count, and missing phonetic count are all 0 for `cet4`, `cet6`, `kaoyan`.

## Known Issues
- Current generated counts are `cet4=4543`, `cet6=6076`, `kaoyan=5528`.
- NETEM source has 5530 rows, but `may/May` and `march/March` collapse under the app's lowercased word uniqueness model, yielding 5528 displayed entries.

## Next Actions
1. Review license implications if the app is distributed commercially, especially NETEM CC BY-NC-SA 4.0.

## Relevant Handoffs
- None
