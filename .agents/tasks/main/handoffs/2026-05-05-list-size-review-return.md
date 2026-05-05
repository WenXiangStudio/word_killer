# Handoff: List Size Persistence And Review Return Flow

Updated: 2026-05-05 23:48:31 +08:00

## Current Task
Finished requested PWA fixes for `word_killer`: remember the "每个List词数" value across reloads, and keep Review-tab launched review sessions returning to the Review tab instead of the List page.

## Changes
- `index.html`: added `WORDS_PER_LIST_KEY = 'wordsPerList:v1'`, preference load/save helpers, clamping to 5-200, and preference persistence when the value changes or learning/review starts.
- `index.html`: changed Review tab buttons to call `reviewCollectedWrongWords('review-home')` and `reviewForgottenWords('review-home')`.
- `index.html`: added `returnTarget` to review return state; `showSetup()` now routes `review-home` back to the Review tab while preserving List-return behavior for other entry points.
- `index.html`: bumped `APP_VERSION` to `v2026.05.05-1`.
- `sw.js`: bumped `CACHE_NAME` to `wordkiller-v18`.
- Commit `ac0153f fix: persist list size and review return flow` was pushed to `origin/main`.

## Tests
- Inline script syntax checked with Node `new Function(...)`.
- `manifest.json` and `books_manifest.json` validated with `python -m json.tool`.
- Live GitHub Pages checked after push:
  - `https://wenxiangstudio.github.io/word_killer/` serves `v2026.05.05-1`.
  - `https://wenxiangstudio.github.io/word_killer/sw.js` serves `wordkiller-v18`.

## Issues
- Users with an existing installed PWA/browser cache may still see `v2026.04.27-3` until the service worker refreshes.
- Cache reset URL: `https://wenxiangstudio.github.io/word_killer/reset.html`.
- Working tree app code is clean versus `origin/main`, but there are untracked agent/editor support files in the repo root.

## Next Steps
1. If user reports old version, ask them to open `reset.html`, wait for redirect, then reopen the app.
2. For later frontend/PWA edits, bump both `APP_VERSION` and `CACHE_NAME` before deployment.
3. Keep future task handoffs under `.agents/tasks/main/`.
