#!/bin/bash
# tracking-skill adapter for Cursor IDE
# Translates Cursor hook events into the JSON format track-start.mjs / track-end.mjs expect.
#
# Usage (from ~/.cursor/hooks.json):
#   "beforeSubmitPrompt": [{ "command": "bash /path/to/cursor-adapter.sh start", "timeout": 10 }]
#   "stop":               [{ "command": "bash /path/to/cursor-adapter.sh stop",  "timeout": 10 }]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACTION="${1:-stop}"   # "start" or "stop"

INPUT=$(cat)

SESSION_ID=$(echo "$INPUT" | jq -r '.conversation_id // empty')
[ -z "$SESSION_ID" ] && SESSION_ID="cursor-$$"

CWD=$(echo "$INPUT" | jq -r '.workspace_roots[0] // .cwd // ""')
[ -z "$CWD" ] && CWD="${PWD}"

PROMPT=$(echo "$INPUT" | jq -r '.userMessage // .prompt // ""')

case "$ACTION" in
  start)
    echo "$INPUT" | jq -n \
      --arg sid "$SESSION_ID" \
      --arg cwd "$CWD" \
      --arg prompt "$PROMPT" \
      '{ session_id: $sid, cwd: $cwd, prompt: $prompt, source: "cursor" }' \
      | node "$SCRIPT_DIR/track-start.mjs"
    ;;
  stop)
    echo "$INPUT" | jq -n \
      --arg sid "$SESSION_ID" \
      '{ session_id: $sid, source: "cursor" }' \
      | node "$SCRIPT_DIR/track-end.mjs"
    ;;
esac
