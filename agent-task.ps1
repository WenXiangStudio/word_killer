param(
  [Parameter(Position = 0)]
  [ValidateSet("new", "use", "off", "status", "handoff", "clear-handoff", "remember")]
  [string]$Command = "status",

  [Parameter(Position = 1)]
  [string]$Task
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$AgentsDir = Join-Path $Root ".agents"
$TasksDir = Join-Path $AgentsDir "tasks"
$ModePath = Join-Path $AgentsDir "context-mode"
$CurrentTaskPath = Join-Path $AgentsDir "current-task"
$ProjectStatePath = Join-Path $AgentsDir "project-state.md"

function Write-TextFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Content
  )

  $parent = Split-Path -Parent $Path
  if ($parent -and -not (Test-Path $parent)) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
  }

  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Assert-TaskName {
  param([string]$Name)

  if (-not $Name -or $Name -notmatch "^[A-Za-z0-9][A-Za-z0-9._-]*$") {
    throw "Task name must match: ^[A-Za-z0-9][A-Za-z0-9._-]*$"
  }
}

function Ensure-AgentDirs {
  New-Item -ItemType Directory -Force -Path $AgentsDir | Out-Null
  New-Item -ItemType Directory -Force -Path $TasksDir | Out-Null
  if (-not (Test-Path $ProjectStatePath)) {
    Write-TextFile -Path $ProjectStatePath -Content (New-ProjectStateTemplate)
  }
}

function Get-CurrentTask {
  if (Test-Path $CurrentTaskPath) {
    return (Get-Content $CurrentTaskPath -Raw).Trim()
  }
  return ""
}

function Get-TaskDir {
  param([string]$Name)
  return Join-Path $TasksDir $Name
}

function New-ProjectStateTemplate {
  $now = Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz"
  return @"
# Project State

Updated: $now

Use this file for durable project facts that should follow every task.
Keep it concise. Do not paste full transcripts.

## Durable Project Facts
- None recorded yet.

## Architecture / Configuration Notes
- None recorded yet.

## Do Not Recreate / Revert
- None recorded yet.
"@
}

function Get-StateSection {
  param(
    [Parameter(Mandatory = $true)][string]$Content,
    [Parameter(Mandatory = $true)][string]$Heading
  )

  $pattern = "(?ms)^##\s+$([regex]::Escape($Heading))\s*\r?\n(.*?)(?=^##\s+|\z)"
  $match = [regex]::Match($Content, $pattern)
  if ($match.Success) {
    return $match.Groups[1].Value.Trim()
  }
  return ""
}

function Test-UsefulStateSection {
  param([string]$Value)

  if (-not $Value) {
    return $false
  }

  $trimmed = $Value.Trim()
  return $trimmed -and $trimmed -notin @("- TBD", "TBD", "- None", "None", "- None recorded yet.", "Not recorded yet.", "- Not recorded yet.")
}

function New-CarryForwardBlock {
  param(
    [Parameter(Mandatory = $true)][string]$PreviousTask,
    [Parameter(Mandatory = $true)][string]$PreviousStatePath
  )

  if (-not (Test-Path $PreviousStatePath)) {
    return ""
  }

  $previous = Get-Content $PreviousStatePath -Raw
  $sections = @("Current Goal", "Changed Files", "Decisions", "Tests", "Known Issues", "Next Actions", "Relevant Handoffs")
  $lines = New-Object System.Collections.Generic.List[string]

  foreach ($section in $sections) {
    $value = Get-StateSection -Content $previous -Heading $section
    if (Test-UsefulStateSection $value) {
      $lines.Add("### Previous $section")
      $lines.Add("")
      $lines.Add($value)
      $lines.Add("")
    }
  }

  if ($lines.Count -eq 0) {
    return ""
  }

  $relativeState = ".agents/tasks/$PreviousTask/state.md"
  return @"

## Carry Forward From Previous Task
Previous task: ``$PreviousTask``
Previous state: ``$relativeState``

Inherited context from the previous task. Remove items that no longer apply.

$($lines -join "`n")
"@
}

function New-StateTemplate {
  param(
    [string]$Name,
    [string]$PreviousTask = ""
  )

  $now = Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz"
  $carryForward = ""
  if ($PreviousTask) {
    $previousStatePath = Join-Path (Get-TaskDir $PreviousTask) "state.md"
    $carryForward = New-CarryForwardBlock -PreviousTask $PreviousTask -PreviousStatePath $previousStatePath
  }

  return @"
# Task State

Updated: $now

## Current Goal
Continue task ``$Name``.

## Working Branch
TBD

## Changed Files
- TBD

## Decisions
- TBD

## Tests
- Not recorded yet.

## Known Issues
- TBD

## Next Actions
1. Clarify the next concrete task.
2. Read the relevant files before editing.
3. Update this file before switching windows or agents.

## Relevant Handoffs
- None
$carryForward
"@
}

function Set-ActiveTask {
  param(
    [string]$Name,
    [switch]$CarryForward
  )

  Assert-TaskName $Name
  Ensure-AgentDirs

  $previousTask = Get-CurrentTask
  $taskDir = Get-TaskDir $Name
  $handoffDir = Join-Path $taskDir "handoffs"
  $statePath = Join-Path $taskDir "state.md"

  New-Item -ItemType Directory -Force -Path $handoffDir | Out-Null

  if (-not (Test-Path $statePath)) {
    $sourceTask = ""
    if ($CarryForward -and $previousTask -and $previousTask -ne $Name) {
      $sourceTask = $previousTask
    }
    Write-TextFile -Path $statePath -Content (New-StateTemplate -Name $Name -PreviousTask $sourceTask)
  }

  Write-TextFile -Path $ModePath -Content "auto`n"
  Write-TextFile -Path $CurrentTaskPath -Content "$Name`n"

  Write-Host "Active task: $Name"
  Write-Host "Context mode: auto"
  Write-Host "State: $statePath"
  Write-Host "Project state: $ProjectStatePath"
}

Ensure-AgentDirs

switch ($Command) {
  "new" {
    Set-ActiveTask $Task -CarryForward
  }

  "use" {
    Set-ActiveTask $Task
  }

  "off" {
    Write-TextFile -Path $ModePath -Content "off`n"
    Write-Host "Context mode: off"
  }

  "status" {
    $mode = "off"
    if (Test-Path $ModePath) {
      $mode = (Get-Content $ModePath -Raw).Trim()
    }

    $current = Get-CurrentTask
    Write-Host "Project: $Root"
    Write-Host "Context mode: $mode"
    Write-Host "Project state: $ProjectStatePath"
    if ($current) {
      $taskDir = Get-TaskDir $current
      Write-Host "Current task: $current"
      Write-Host "State: $(Join-Path $taskDir 'state.md')"
      $flag = Join-Path $taskDir "handoff-required"
      Write-Host "Handoff required: $(Test-Path $flag)"
    } else {
      Write-Host "Current task: none"
    }
  }

  "handoff" {
    $current = Get-CurrentTask
    Assert-TaskName $current
    $taskDir = Get-TaskDir $current
    New-Item -ItemType Directory -Force -Path $taskDir | Out-Null

    $flag = Join-Path $taskDir "handoff-required"
    $now = Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz"
    Write-TextFile -Path $flag -Content "requested at $now`n"

    Write-Host "Handoff requested for task: $current"
    Write-Host "Ask the active agent:"
    Write-Host "Please perform an agent-task handoff before stopping. Update .agents/tasks/$current/state.md with current goal, changed files, decisions, tests, known issues, and next actions. Put durable cross-task facts in .agents/project-state.md. Create a handoff note under .agents/tasks/$current/handoffs/ if the state file is not enough."
  }

  "remember" {
    Ensure-AgentDirs
    if (-not $Task) {
      throw "Usage: .\agent-task.ps1 remember `"durable project fact`""
    }
    $now = Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz"
    $entry = "`n- $Task (recorded $now)`n"
    [System.IO.File]::AppendAllText($ProjectStatePath, $entry, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "Remembered in: $ProjectStatePath"
  }

  "clear-handoff" {
    $current = Get-CurrentTask
    Assert-TaskName $current
    $taskDir = Get-TaskDir $current
    $flag = Join-Path $taskDir "handoff-required"
    $blockedMarker = Join-Path $taskDir "handoff-blocked-once"
    if (Test-Path $flag) {
      Remove-Item -LiteralPath $flag
    } else {
      Write-Host "No handoff flag for task: $current"
    }
    if (Test-Path $blockedMarker) {
      Remove-Item -LiteralPath $blockedMarker
    }
    Write-Host "Cleared handoff markers for task: $current"
  }
}