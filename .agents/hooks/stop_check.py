#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path


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


def newer_or_equal(path: Path, marker: Path) -> bool:
    if not path.exists() or not marker.exists():
        return False
    return path.stat().st_mtime >= marker.stat().st_mtime


def main() -> int:
    data = read_input()
    root = find_root(data)
    agents_dir = root / ".agents"

    task = read_text(agents_dir / "current-task")
    if not task or not TASK_RE.match(task):
        return 0

    task_dir = agents_dir / "tasks" / task
    state_path = task_dir / "state.md"
    flag_path = task_dir / "handoff-required"
    blocked_marker = task_dir / "handoff-blocked-once"

    if not flag_path.exists():
        return 0

    if newer_or_equal(state_path, flag_path):
        try:
            flag_path.unlink()
        except OSError:
            pass
        try:
            blocked_marker.unlink()
        except OSError:
            pass
        return 0

    if blocked_marker.exists() and newer_or_equal(blocked_marker, flag_path):
        return 0

    blocked_marker.write_text("blocked once\n", encoding="utf-8")

    reason = (
        f"Handoff is required for active task `{task}` before stopping. "
        f"Update `.agents/tasks/{task}/state.md` with current goal, changed files, "
        "decisions, tests/checks run, known issues, and next actions. "
        "Update `.agents/project-state.md` with durable cross-task facts, intentional removals, migrations, and do-not-recreate notes. "
        f"If useful, add a concise markdown note under `.agents/tasks/{task}/handoffs/`. "
        "Do not paste the full transcript."
    )
    print(json.dumps({"decision": "block", "reason": reason}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())