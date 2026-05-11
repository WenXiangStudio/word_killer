#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


TASK_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
KEYWORDS = (
    "handoff",
    "hand off",
    "agent-task handoff",
    "context full",
    "context is full",
    "switch window",
    "new window",
    "continue in a new window",
    "\u4ea4\u63a5",
    "\u6362\u7a97\u53e3",
    "\u65b0\u7a97\u53e3",
    "\u4e0a\u4e0b\u6587\u6ee1",
    "\u4e0a\u4e0b\u6587\u5feb\u6ee1",
    "\u5207\u6362agent",
    "\u5207\u6362 agent",
    "\u63a5\u529b",
)


def read_input() -> dict:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"prompt": raw}


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


def prompt_text(data: dict) -> str:
    for key in ("prompt", "message", "user_prompt"):
        value = data.get(key)
        if isinstance(value, str):
            return value
    return json.dumps(data, ensure_ascii=False)


def main() -> int:
    data = read_input()
    text = prompt_text(data).lower()
    if not any(keyword.lower() in text for keyword in KEYWORDS):
        return 0

    root = find_root(data)
    agents_dir = root / ".agents"
    task = read_text(agents_dir / "current-task")
    if task and TASK_RE.match(task):
        task_dir = agents_dir / "tasks" / task
        task_dir.mkdir(parents=True, exist_ok=True)
        flag = task_dir / "handoff-required"
        flag.write_text(
            f"requested at {datetime.now(timezone.utc).isoformat()}\n",
            encoding="utf-8",
        )
        state_path = f".agents/tasks/{task}/state.md"
        handoff_dir = f".agents/tasks/{task}/handoffs/"
    else:
        task = "<no-current-task>"
        state_path = ".agents/tasks/<task>/state.md"
        handoff_dir = ".agents/tasks/<task>/handoffs/"

    print(
        "\n".join(
            [
                "# Agent Task Handoff Requested",
                "",
                f"Active task: `{task}`",
                "",
                "Before stopping, update the compact handoff state:",
                f"- Update `{state_path}` with current goal, changed files, decisions, tests, known issues, and next actions.",
                "- Update `.agents/project-state.md` with durable cross-task facts, intentional removals, migrations, and do-not-recreate notes.",
                f"- Create a note under `{handoff_dir}` if the state file is not enough.",
                "- Keep it concise. Do not paste the full conversation transcript.",
            ]
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())