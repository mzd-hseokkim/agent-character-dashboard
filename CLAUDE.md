# Claude Code Multi Agent Observability

## Instructions
> Follow these instructions as you work through the project.

### REMEMBER: Use source_app + session_id to uniquely identify an agent.

Every hook event will include a source_app and session_id. Use these to uniquely identify an agent.
For display purposes, we want to show the agent ID as "source_app:session_id" with session_id truncated to the first 8 characters.

## Stack

- **Server**: Bun + SQLite + WebSocket (`apps/server/`)
- **Client**: React 19 + Vite + Tailwind + Zustand (`apps/client/`) — ← React 마이그레이션 완료
- **Archived**: Vue 3 클라이언트는 `apps/client-vue/`에 보관

## 주요 경로

- 서버: `apps/server/src/index.ts`
- 클라이언트 엔트리: `apps/client/src/App.tsx`
- 에이전트 카드: `apps/client/src/components/AgentDashboard/`
- 스프라이트 렌더러: `apps/client/src/components/SpriteCanvas.tsx`
- 훅 스크립트: `.claude/hooks/send_event.py`
- Zustand 스토어: `apps/client/src/stores/`
- React 훅: `apps/client/src/hooks/`