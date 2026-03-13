# tracking-skill

A lightweight session tracker for AI coding tools. Logs every prompt and its duration per project to a local CSV file, with a terminal UI to browse your history.

Supports **Claude Code** and **Cursor**.

## How it works

Hooks fire on every prompt (`UserPromptSubmit`) and on session end (`Stop`). Each event appends one row to `~/.claude/tracking/sessions.csv`. The viewer pairs start/end rows by session ID to compute durations and renders them in a day-by-day TUI.

```
~/.claude/tracking/sessions.csv   ← append-only, never modified
```

## Installation

```bash
git clone https://github.com/XC3S/ai-session-tracking-skill
cd ai-session-tracking-skill
npm install
node src/install.mjs
```

`install.mjs` safely merges the hooks into your existing `~/.claude/settings.json` and `~/.cursor/hooks.json` without overwriting other entries (e.g. peon-ping).

**Restart Claude Code and/or Cursor** after installing for the hooks to take effect.

### Global `track` command (optional)

```bash
npm link
track       # opens the viewer from anywhere
```

## Viewer

```bash
npm run view
# or, after npm link:
track
```

| Key | Action |
|-----|--------|
| `←` `→` | Navigate days |
| `r` | Reload CSV and jump to today |
| `q` / `Ctrl+C` | Quit |

Each session shows: time, source (`cc` = Claude Code, `cur` = Cursor), project, duration, and the first line of the prompt. Sessions still in progress are shown in magenta as `active`.

## Data format

`~/.claude/tracking/sessions.csv` — append-only CSV with columns:

| Column | Description |
|--------|-------------|
| `session_id` | UUID assigned by the tool |
| `event_type` | `start` or `end` |
| `timestamp` | ISO 8601 UTC |
| `date` | `YYYY-MM-DD` |
| `project` | basename of the working directory |
| `prompt` | first 300 chars of the prompt (start rows only) |
| `source` | `claude-code` or `cursor` |

## Requirements

- Node.js 18+
- `jq` (for Cursor adapter)
- Claude Code and/or Cursor
