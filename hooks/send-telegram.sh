#!/usr/bin/env bash
set -euo pipefail

if [ -z "${AGENT_REACHOUT_TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${AGENT_REACHOUT_TELEGRAM_CHAT_ID:-}" ]; then
  echo "Missing AGENT_REACHOUT_TELEGRAM_BOT_TOKEN or AGENT_REACHOUT_TELEGRAM_CHAT_ID" >&2
  exit 0
fi

payload=$(cat)

message=$(python3 - <<'PY' <<< "$payload")
import json
import sys

payload = json.load(sys.stdin)
event = payload.get('hook_event_name', 'Unknown')
lines = [f'Claude Code: {event}']

if event == 'Notification':
    notification_type = payload.get('notification_type')
    title = payload.get('title')
    message = payload.get('message')
    if notification_type:
        lines.append(f'Type: {notification_type}')
    if title:
        lines.append(f'Title: {title}')
    if message:
        lines.append(f'Message: {message}')
elif event == 'PermissionRequest':
    tool_name = payload.get('tool_name')
    tool_input = payload.get('tool_input', {})
    if tool_name:
        lines.append(f'Tool: {tool_name}')
    if isinstance(tool_input, dict):
        for key in ('command', 'file_path', 'pattern', 'url', 'query', 'message'):
            if key in tool_input:
                lines.append(f'{key}: {tool_input[key]}')
                break
elif event == 'Stop':
    reason = payload.get('stop_reason') or payload.get('reason')
    if reason:
        lines.append(f'Reason: {reason}')

print('\n'.join(lines))
PY
)

curl -sS -X POST "https://api.telegram.org/bot${AGENT_REACHOUT_TELEGRAM_BOT_TOKEN}/sendMessage" \
  --data-urlencode "chat_id=${AGENT_REACHOUT_TELEGRAM_CHAT_ID}" \
  --data-urlencode "text=${message}" \
  > /dev/null
