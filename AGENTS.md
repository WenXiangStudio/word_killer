# Agent Instructions

## Project

`word_killer` is the current project. Before making changes, read the local README, package metadata, and relevant source files.

## Working Rules

- Read current files before changing behavior.
- Do not revert user changes or unrelated generated files.
- Keep edits scoped to the requested task.
- Prefer existing project patterns over new abstractions.
- Do not add large generated artifacts to git unless explicitly requested.

## Commands

Update this section with the project's real commands, for example:

```powershell
npm test
npm run build
python -m pytest
```

<!-- BEGIN AGENT-CONTEXT -->
## Agent Task Context

This project uses `.agents/` for compact cross-window and cross-agent handoff state.

- `AGENTS.md` is stable project guidance and may be loaded automatically.
- `.agents/project-state.md` stores durable cross-task facts and is injected when `.agents/context-mode` is `auto`.
- `.agents/tasks/<task>/state.md` is task state and is injected only when `.agents/context-mode` is `auto`.
- `.agents/tasks/<task>/handoffs/` stores historical handoff notes. Do not read all handoffs by default.
- `.\agent-task.ps1 new <task-name>` carries forward useful sections from the previously active task state.
- Before switching windows, compacting context, or changing agents, update the active task state and durable project state when facts should carry across tasks.

Use:

```powershell
.\agent-task.ps1 status
.\agent-task.ps1 use <task-name>
.\agent-task.ps1 new <task-name>
.\agent-task.ps1 off
.\agent-task.ps1 handoff
.\agent-task.ps1 remember "durable project fact"
```
<!-- END AGENT-CONTEXT -->