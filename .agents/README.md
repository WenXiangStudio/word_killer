# Agent Context

This folder stores compact cross-window and cross-agent context.

Use the root helper from PowerShell:

```powershell
.\agent-task.ps1 new <task-name>
.\agent-task.ps1 use <task-name>
.\agent-task.ps1 off
.\agent-task.ps1 status
.\agent-task.ps1 handoff
.\agent-task.ps1 remember "durable project fact"
```

`context-mode` controls whether hooks inject task state:

- `off`: no task state is injected.
- `auto`: project state and the active task state are injected on session start.

`project-state.md` stores durable cross-task facts.
`current-task` points at `.agents/tasks/<task-name>/state.md`.

`new <task-name>` carries forward useful sections from the previously active task state.

Historical files under `handoffs/` are not injected by default.