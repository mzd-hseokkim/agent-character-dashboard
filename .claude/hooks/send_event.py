#!/usr/bin/env python3
"""Claude Code hook → agent-character-dashboard server"""
import sys
import json
import os
import time
import urllib.request
import urllib.error


def _post_event(server_url, event):
    body = json.dumps(event, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        f"{server_url}/events",
        data=body,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    resp = urllib.request.urlopen(req, timeout=5)
    return json.loads(resp.read().decode("utf-8"))


def _get_event(server_url, event_id):
    req = urllib.request.Request(f"{server_url}/events/{event_id}")
    resp = urllib.request.urlopen(req, timeout=3)
    return json.loads(resp.read().decode("utf-8"))


def _resolve_event(server_url, event_id, allowed=True):
    """Mark the HITL event as resolved so the dashboard clears the indicator."""
    try:
        body = json.dumps({"permission": allowed}).encode("utf-8")
        req = urllib.request.Request(
            f"{server_url}/events/{event_id}/respond",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=3)
    except Exception:
        pass


def handle_permission_request(event, server_url, timeout=110):
    """
    Send the HITL event to the dashboard, then poll every second until
    the user responds (or timeout). Returns True = allow, False = deny.
    """
    tool_name = event["payload"].get("tool_name", "Unknown")
    tool_input = event["payload"].get("tool_input", {})

    lines = [f"Tool: {tool_name}"]
    if "command" in tool_input:
        lines.append(f"$ {tool_input['command'][:200]}")
    elif "file_path" in tool_input:
        lines.append(f"File: {tool_input['file_path']}")
    elif "path" in tool_input:
        lines.append(f"Path: {tool_input['path']}")
    elif "url" in tool_input:
        lines.append(f"URL: {tool_input['url'][:120]}")
    elif "description" in tool_input:
        lines.append(tool_input["description"][:120])

    event["humanInTheLoop"] = {
        "question": "\n".join(lines),
        "responseWebSocketUrl": "",  # polling approach — no callback server needed
        "type": "permission",
        "timeout": timeout,
        "requiresResponse": True,
    }

    try:
        saved = _post_event(server_url, event)
        event_id = saved.get("id")
    except Exception as e:
        sys.stderr.write(f"[HITL] Could not reach dashboard: {e}\n")
        return True  # server unreachable → allow

    if not event_id:
        return True

    sys.stderr.write(f"[HITL] Waiting for dashboard response (event #{event_id})...\n")
    deadline = time.time() + timeout
    result = True  # default: allow

    try:
        while time.time() < deadline:
            try:
                data = _get_event(server_url, event_id)
                hitl_status = data.get("humanInTheLoopStatus") or {}
                if hitl_status.get("status") == "responded":
                    permission = hitl_status.get("response", {}).get("permission", True)
                    action = "allowed" if permission else "denied"
                    sys.stderr.write(f"[HITL] User {action} the request.\n")
                    result = bool(permission)
                    return result
            except Exception:
                pass
            time.sleep(1)

        sys.stderr.write(f"[HITL] No response in {timeout}s — allowing by default\n")
        return result
    finally:
        # Always mark the event resolved so the dashboard clears the indicator.
        # This fires whether the loop found a response, timed out, or the
        # process was terminated externally (e.g. user answered in CLI).
        _resolve_event(server_url, event_id, result)


def main():
    event_type = sys.argv[1] if len(sys.argv) > 1 else "Unknown"
    server_url = os.environ.get("DASHBOARD_SERVER_URL", "http://localhost:4000")

    raw = sys.stdin.buffer.read()
    try:
        payload = json.loads(raw.decode("utf-8"))
    except Exception:
        payload = {}

    session_id = payload.get("session_id", "unknown-session")
    project_dir = os.environ.get("CLAUDE_PROJECT_DIR", "unknown")
    source_app = os.path.basename(project_dir.rstrip("/\\")) or "unknown"

    event = {
        "source_app": source_app,
        "session_id": session_id,
        "hook_event_type": event_type,
        "payload": payload,
    }

    if event_type == "PermissionRequest":
        allowed = handle_permission_request(event, server_url)
        sys.exit(0 if allowed else 2)
    else:
        # Fire-and-forget for other event types
        body = json.dumps(event, ensure_ascii=False).encode("utf-8")
        try:
            req = urllib.request.Request(
                f"{server_url}/events",
                data=body,
                headers={"Content-Type": "application/json; charset=utf-8"},
                method="POST",
            )
            urllib.request.urlopen(req, timeout=3)
        except Exception:
            pass  # server down → don't disrupt Claude Code


if __name__ == "__main__":
    main()
