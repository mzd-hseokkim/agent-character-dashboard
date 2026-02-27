#!/usr/bin/env bash
# Claude Code hook → agent-character-dashboard server
# Usage: send_event.sh <EventType>
# Called by Claude Code hooks; reads JSON payload from stdin

# Windows Git Bash UTF-8 보장
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
export PYTHONIOENCODING=utf-8

EVENT_TYPE="${1:-Unknown}"
SERVER_URL="${DASHBOARD_SERVER_URL:-http://localhost:4000}"

# Read stdin (hook payload JSON)
PAYLOAD=$(cat)

# Derive source_app from project directory
SOURCE_APP="${CLAUDE_PROJECT_DIR:-unknown}"
SOURCE_APP=$(basename "$SOURCE_APP")

# Extract session_id from stdin payload (Claude Code puts it in the JSON)
SESSION_ID=$(echo "$PAYLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('session_id','unknown-session'))" 2>/dev/null || echo "unknown-session")

# Build and POST event (--connect-timeout 1: 서버 없으면 1초 안에 포기)
curl -s --connect-timeout 1 --max-time 3 \
  -X POST "${SERVER_URL}/events" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d "{
    \"source_app\": \"${SOURCE_APP}\",
    \"session_id\": \"${SESSION_ID}\",
    \"hook_event_type\": \"${EVENT_TYPE}\",
    \"payload\": ${PAYLOAD}
  }" > /dev/null 2>&1 || true
