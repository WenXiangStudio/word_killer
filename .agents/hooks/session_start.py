#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path


MAX_STATE_CHARS = int(os.environ.get("AGENT_TASK_MAX_CHARS", "6000"))
MAX_PROJECT_STATE_CHARS = int(os.environ.get("AGENT_PROJECT_STATE_MAX_CHARS", "6000"))
MAX_STATUS_LINES = 60
TASK_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")


def read_input() -> dict:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}


def find_root(data: dict) -> Path:
    start = Path(data.get("cwd") or os.getcwd()).resolve()
    fallback = start
    for candidate in (start, *start.parents):
        if (candidate / ".agents").exists():
            return candidate
        if (candidate / ".git").exists():
            fallback = candidate
    return fallback


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return ""


def git_output(root: Path, *args: str) -> str:
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=root,
            capture_output=True,
            text=True,
            timeout=2,
            check=False,
        )
    except Exception:
        return ""
    return result.stdout.strip()


def clipped(text: str, limit: int, env_name: str) -> str:
    if len(text) <= limit:
        return text
    keep_head = max(limit - 800, 0)
    return (
        text[:keep_head].rstrip()
        + f"\n\n[State truncated by {env_name}. Open the state file if more detail is needed.]"
    )


def main() -> int:
    data = read_input()
    root = find_root(data)
    agents_dir = root / ".agents"

    mode = read_text(agents_dir / "context-mode").lower()
    if mode != "auto":
        return 0

    task = read_text(agents_dir / "current-task")
    if not task or not TASK_RE.match(task):
        return 0

    state_path = agents_dir / "tasks" / task / "state.md"
    project_state_path = agents_dir / "project-state.md"
    state = read_text(state_path)
    project_state = read_text(project_state_path)

    branch = git_output(root, "branch", "--show-current") or "unknown"
    status = git_output(root, "status", "--short")
    status_lines = status.splitlines()
    if len(status_lines) > MAX_STATUS_LINES:
        status = "\n".join(status_lines[:MAX_STATUS_LINES])
        status += f"\n... {len(status_lines) - MAX_STATUS_LINES} more lines omitted"

    output = [
        "# Agent Task Context",
        "",
        "This context was injected by `.agents/hooks/session_start.py`.",
        "Use it as compact task state, not as a full transcript.",
        "Do not read all historical handoffs unless `state.md` references them or the user asks.",
        "",
        f"Project root: `{root}`",
        f"Current task: `{task}`",
        f"Project state file: `{project_state_path.relative_to(root)}`",
        f"Task state file: `{state_path.relative_to(root)}`",
        "",
        "## Git Snapshot",
        f"Branch: `{branch}`",
        "",
        "Status:",
        "```text",
        status or "clean",
        "```",
        "",
        "## Project State",
        "",
    ]

    if project_state:
        output.append(clipped(project_state, MAX_PROJECT_STATE_CHARS, "AGENT_PROJECT_STATE_MAX_CHARS"))
    else:
        output.append(
            f"No project state found at `{project_state_path.relative_to(root)}`. "
            "Create it or run `.\agent-task.ps1 status` from the project root."
        )

    output.extend(
        [
            "",
        "## Task State",
        "",
        ]
    )

    if state:
        output.append(clipped(state, MAX_STATE_CHARS, "AGENT_TASK_MAX_CHARS"))
    else:
        output.append(
            f"No task state found at `{state_path.relative_to(root)}`. "
            "Create it or run `.\agent-task.ps1 new <task-name>` from the project root."
        )

    print("\n".join(output))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())