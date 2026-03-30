#!/usr/bin/env bash
set -euo pipefail

if [ -z "${AGENT_REACHOUT_TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${AGENT_REACHOUT_TELEGRAM_CHAT_ID:-}" ]; then
  echo "Missing AGENT_REACHOUT_TELEGRAM_BOT_TOKEN or AGENT_REACHOUT_TELEGRAM_CHAT_ID" >&2
  exit 0
fi

payload=$(cat)

# Debounce Stop events — only send if a tool was used since last Stop
# This prevents spammy "finished" messages after every conversational reply
DEBOUNCE_FILE="/tmp/agent-reachout-last-stop"
TOOL_FLAG="/tmp/agent-reachout-tool-used"
event_name=$(echo "$payload" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("hook_event_name",""))' 2>/dev/null || echo "")

# Track when tools are used (Notification/PermissionRequest indicate active work)
if [ "$event_name" = "Notification" ] || [ "$event_name" = "PermissionRequest" ]; then
  touch "$TOOL_FLAG"
fi

if [ "$event_name" = "Stop" ]; then
  # Only notify if tools were used since last Stop
  if [ ! -f "$TOOL_FLAG" ]; then
    exit 0
  fi
  rm -f "$TOOL_FLAG"
  # Also debounce rapid successive Stops (within 10s)
  now=$(date +%s)
  if [ -f "$DEBOUNCE_FILE" ]; then
    last_stop=$(cat "$DEBOUNCE_FILE" 2>/dev/null || echo 0)
    elapsed=$((now - last_stop))
    if [ "$elapsed" -lt 10 ]; then
      exit 0
    fi
  fi
  echo "$now" > "$DEBOUNCE_FILE"
fi

message=$(echo "$payload" | python3 -c '
import json
import sys
from datetime import datetime

payload = json.load(sys.stdin)
event = payload.get("hook_event_name", "Unknown")

if event == "Notification":
    notification_type = payload.get("notification_type", "")
    title = payload.get("title", "")
    message = payload.get("message", "")
    # Build a clean, informative notification
    lines = []
    if title:
        lines.append(f"🔔 {title}")
    elif notification_type:
        lines.append(f"🔔 Claude Code: {notification_type}")
    else:
        lines.append("🔔 Claude Code: Notification")
    if message:
        # Truncate long messages to keep Telegram tidy
        msg = message if len(message) <= 500 else message[:497] + "..."
        lines.append(msg)
    print("\n".join(lines))

elif event == "PermissionRequest":
    tool_name = payload.get("tool_name", "unknown tool")
    tool_input = payload.get("tool_input", {})
    lines = [f"⚠️ Claude Code needs permission: {tool_name}"]
    if isinstance(tool_input, dict):
        for key in ("command", "file_path", "pattern", "url", "query", "message"):
            if key in tool_input:
                detail = str(tool_input[key])
                if len(detail) > 200:
                    detail = detail[:197] + "..."
                lines.append(f"  {key}: {detail}")
                break
    print("\n".join(lines))

elif event == "Stop":
    reason = payload.get("stop_reason") or payload.get("reason") or ""
    ts = datetime.now().strftime("%H:%M")
    if reason:
        print(f"✅ Claude Code finished at {ts}\nReason: {reason}")
    else:
        print(f"✅ Claude Code finished at {ts}")

else:
    print(f"Claude Code: {event}")
')

curl -sS -X POST "https://api.telegram.org/bot${AGENT_REACHOUT_TELEGRAM_BOT_TOKEN}/sendMessage" \
  --data-urlencode "chat_id=${AGENT_REACHOUT_TELEGRAM_CHAT_ID}" \
  --data-urlencode "text=${message}" \
  > /dev/null
