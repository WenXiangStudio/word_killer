# Task State

Updated: 2026-05-05 23:48:31 +08:00

## Current Goal
Maintain `word_killer` PWA. Latest completed work: persist the per-List word count setting and fix review-center return flow.

## Working Branch
`main` tracking `origin/main`.

## Changed Files
- `index.html`
- `sw.js`
- `.agents/tasks/main/state.md`
- `.agents/tasks/main/handoffs/2026-05-05-list-size-review-return.md`

## Decisions
- Store the "每个List词数" preference in `localStorage` as `wordsPerList:v1`, clamped to the existing 5-200 input range.
- Keep review flows launched from the Review tab returning to the Review tab via `returnTarget: review-home`.
- Preserve existing List-preview behavior for review flows launched outside the Review tab.
- Bump visible app version to `v2026.05.05-1` and service worker cache to `wordkiller-v18` so deployed clients can pick up the update.

## Tests
- Extracted the inline script from `index.html` and validated it with `node` via `new Function(...)`.
- Validated `manifest.json` and `books_manifest.json` with `python -m json.tool`.
- Pushed commit `ac0153f fix: persist list size and review return flow` to `origin/main`.
- Verified live GitHub Pages files: online `index.html` contains `v2026.05.05-1`; online `sw.js` contains `wordkiller-v18`.

## Known Issues
- Existing installed PWA/browser sessions may still show the old version until the service worker updates. Use `https://wenxiangstudio.github.io/word_killer/reset.html` to clear old cache if needed.
- Repository status includes untracked agent/editor support files (`.agents/`, `.claude/`, `.codex/`, `AGENTS.md`, `CLAUDE.md`, `agent-task.ps1`); app source is synced with `origin/main`.

## Next Actions
1. If the user reports old UI on a device, have them visit `reset.html` and then reopen the app.
2. For future app changes, bump both `APP_VERSION` in `index.html` and `CACHE_NAME` in `sw.js`.
3. Continue using `.agents/tasks/main/state.md` for this project handoff state.

## Relevant Handoffs
- `.agents/tasks/main/handoffs/2026-05-05-list-size-review-return.md`
