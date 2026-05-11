#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path


TASK_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")


def read_input() -> dict:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"summary": raw}


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


def summary_text(data: dict) -> str:
    for key in ("summary", "compact_summary", "transcript_summary"):
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def main() -> int:
    data = read_input()
    summary = summary_text(data)
    if not summary:
        return 0

    root = find_root(data)
    agents_dir = root / ".agents"
    task = read_text(agents_dir / "current-task")
    if not task or not TASK_RE.match(task):
        return 0

    handoff_dir = agents_dir / "tasks" / task / "handoffs"
    handoff_dir.mkdir(parents=True, exist_ok=True)

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    path = handoff_dir / f"{stamp}-compact.md"
    path.write_text(
        "\n".join(
            [
                "# Compact Handoff",
                "",
                f"Task: `{task}`",
                f"Created: {stamp}",
                "",
                "## Summary",
                "",
                summary,
                "",
            ]
        ),
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())