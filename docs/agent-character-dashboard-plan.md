# Agent Character Dashboard 구현 계획

> Claude Code 에이전트들의 상태를 도트 캐릭터로 시각화하는 실시간 대시보드

---

## 개요

### 목표

Claude Code 에이전트(터미널 인스턴스)별로 고유한 도트 캐릭터를 부여하고,
에이전트의 현재 상태(작업 중 / 대기 중 / 완료 등)에 따라 캐릭터 애니메이션이 바뀌는 실시간 대시보드 구현.

### 베이스 프로젝트

[claude-code-hooks-multi-agent-observability](https://github.com/disler/claude-code-hooks-multi-agent-observability)

---

## 현재 상태 (2026-02-28)

### 완료된 작업

#### Phase 0: 환경 세팅
- [x] 베이스 프로젝트 기반 구축
- [x] Bun + SQLite + WebSocket 서버 (`apps/server/`)
- [x] 훅 스크립트 Python으로 전환 (Windows 호환, UTF-8 안정성)
  - `.claude/hooks/send_event.py`
  - `session_id`는 stdin payload JSON에서 추출 (환경변수 아님)
- [x] `~/.claude/settings.json` 글로벌 훅 적용

#### Phase 1: Vue → React 마이그레이션 (완료)
- [x] Vue 3 클라이언트 → React 19 + Vite + Tailwind + Zustand
- [x] 기존 Vue 클라이언트 `apps/client-vue/`로 아카이빙
- [x] 메인 클라이언트: `apps/client/` (port 5174)
- [x] Zustand 스토어: `useWebSocketStore`, `useThemeStore`, `useSoundStore`

#### Phase 2: 서버 사이드 에이전트 상태 관리
- [x] `agentStates` Map 구현 (`apps/server/src/index.ts`)
- [x] `updateAgentState()` — 이벤트 → 상태 전환 로직
- [x] `broadcastAgentStates()` — WebSocket 브로드캐스트
- [x] isSubagent 판별 로직 (첫 이벤트가 UserPromptSubmit/SessionStart → 메인 에이전트)
  - 오래된 세션 재접속 시 DB 조회로 isSubagent 보정
- [x] 캐릭터 배정 DB 영속화 (재시작 후에도 동일 캐릭터 유지)
- [x] 타임아웃 체크: WAITING(60초), OFFLINE(5분)

#### Phase 3: 스프라이트 시스템
- [x] `SpriteCanvas.tsx` — Canvas 기반 픽셀아트 fallback (char_a ~ char_e)
- [x] GIF 캐릭터 지원: frieren, fern, stark, himmel
  - `apps/client/public/sprites/{charId}/`
  - 파일 컨벤션: `{CHARNAME_UPPER}_{STATUS}.gif`
  - 상태 매핑:
    | 앱 상태 | GIF 파일 |
    |---------|---------|
    | WORKING / ORCHESTRATING | FORCE |
    | THINKING | THINK |
    | READING | READING |
    | WAITING / BLOCKED | REST |
    | DONE | FINISH |
    | ERROR / OFFLINE | OFFLINE |

#### Phase 4: 에이전트 대시보드 UI
- [x] `AgentDashboard/` — 메인 대시보드 컴포넌트
- [x] 에이전트 카드: 캐릭터 + 상태 + 마지막 이벤트 + 프롬프트
- [x] 카드 진입/퇴장 애니메이션 강화
- [x] 뷰 모드 토글: 상세 보기 / 카드 보기
- [x] 에이전트 컬럼 피드 (마지막 N개 이벤트)
- [x] FeedTooltip (호버 시 상세 내용)
- [x] PromptTooltip (프롬프트 호버 상세)

#### Phase 5: 이벤트 탭 (EventTimeline)
- [x] 이벤트 타임라인 테이블
- [x] 실시간 LivePulseChart (에이전트별 활동 스파크라인)
- [x] 필터 패널 (에이전트 / 이벤트 타입 필터)
- [x] 스틱-투-바텀 스크롤 + "New Events" 버튼
- [x] CSS 변수 기반 테마 시스템 (`var(--theme-*)`)

#### Phase 6: HITL (Human-In-The-Loop) 오버레이
- [x] `HitlOverlay.tsx` — createPortal로 body에 마운트
- [x] PermissionRequest 카드: allow / deny 버튼
- [x] Question 카드: 텍스트 입력 + submit
- [x] Countdown 타이머 (urgent 3초 이하 블링크)
- [x] `hitl.css` — 슬라이드인 애니메이션, 퍼플 글로우 효과

#### Phase 7: 채팅 트랜스크립트 모달
- [x] `ChatTranscriptModal.tsx` — createPortal, 에이전트 전체 대화 조회
- [x] forwardRef + nodeRef 패턴 (React 19 findDOMNode 제거 대응)

#### Phase 8: 다크/라이트 모드 토글 (2026-02-28)
- [x] 헤더에 Sun/Moon 토글 버튼 추가 (`App.tsx`)
- [x] `isDarkMode: boolean` — `useThemeStore`에 독립 상태로 추가
- [x] `toggleDarkMode()` 구현:
  - 다크: 모든 `theme-*` 클래스 제거 → `:root` Console Dark 기본값 사용
  - 라이트: `theme-light` 클래스만 추가
- [x] localStorage 영속화 (`'light'` 저장 / 다크 시 키 제거)
- [x] `initializeTheme()` 수정: `'light'` 저장값 복원 처리
- [x] "Paper Forest" 라이트 팔레트 CSS 작성:
  - `App.css` — 헤더, 탭, 버튼 라이트 오버라이드
  - `agent-dashboard.css` — 에이전트 카드, 피드, 컬럼 라이트 오버라이드
  - `themes.css` — `.theme-light { --theme-*: ... }` CSS 변수 블록 (이벤트 탭 자동 대응)
  - `hitl.css` — HITL 카드 라이트 오버라이드

---

## 아키텍처

```
Claude Code 인스턴스들
    ↓ (훅 이벤트 HTTP POST, Python)
Bun 서버 (port 4000)
    ├── SQLite: 이벤트 저장, 캐릭터 배정 영속화
    ├── agentStates Map: 에이전트 상태 관리
    └── WebSocket (/stream): 상태 변경 브로드캐스트
         ↓
React 19 대시보드 (port 5174)  ← apps/client/
    ├── 파티 탭 (AgentDashboard)
    │   ├── 에이전트 컬럼 (SpriteCanvas + 피드)
    │   └── 뷰 모드: 상세 / 카드
    ├── 이벤트 탭 (EventTimeline)
    │   ├── LivePulseChart
    │   ├── 이벤트 테이블 (필터 지원)
    │   └── CSS 변수 테마 자동 대응
    ├── HitlOverlay (portal → body)
    └── ChatTranscriptModal (portal → body)
```

---

## 에이전트 상태 설계

### 상태 → 훅 이벤트 매핑

| 상태 | 트리거 이벤트 | GIF 파일 |
|------|-------------|---------|
| WORKING | PreToolUse, PostToolUse | FORCE |
| ORCHESTRATING | (서브에이전트 관리 중) | FORCE |
| THINKING | UserPromptSubmit | THINK |
| READING | Read 도구 사용 중 | READING |
| WAITING | Notification (idle) | REST |
| BLOCKED | PermissionRequest | REST |
| DONE | Stop | FINISH |
| ERROR | PostToolUseFailure | OFFLINE |
| OFFLINE | SessionEnd 후 타임아웃 5분 | OFFLINE |

### 에이전트 키 형식
`source_app:session_id(8자)` — CLAUDE.md 규칙

---

## 테마 시스템 설계 원칙

### 모드 vs 테마

- **모드** (`isDarkMode`): 전역 다크/라이트 토글. 테마와 독립적.
- **테마** (`currentTheme`): 시각적 정체성 (Console Dark, Ocean 등). 향후 커스텀 테마 등록 지원.

### 다크 모드 동작 방식

```
다크 모드:  HTML에 theme-* 클래스 없음 → :root CSS 변수 (Console Dark 기본값)
라이트 모드: HTML에 theme-light 클래스 → .theme-light {} 오버라이드 적용
```

> ⚠️ `setTheme('dark')`를 호출하면 `.theme-dark` (Tailwind 블루-그레이)가 적용됨.
> 다크 모드 전환 시에는 절대 `setTheme('dark')` 호출 금지 — `toggleDarkMode()`만 사용.

### 향후 테마 등록 형식 (tasks/theme-management.md)

각 테마 패키지는 `lightColors`와 `darkColors` 두 세트 모두 필수:

```json
{
  "name": "Ocean",
  "lightColors": { "--theme-primary": "#0070b0", ... },
  "darkColors":  { "--theme-primary": "#40a8e0", ... }
}
```

---

## 알려진 이슈 / 미완성 항목

### ChatTranscriptModal 라이트 모드
- `ChatTranscriptModal.tsx`가 Tailwind `dark:` 변형 사용 (`dark:bg-gray-900` 등)
- 우리 시스템은 `.dark` 클래스를 추가하지 않으므로 `dark:` 변형이 **절대 활성화되지 않음**
- 라이트 모드에서 모달 내부 색상이 올바르지 않음
- 수정 방향: CSS 변수 기반 오버라이드 또는 인라인 스타일 교체 필요

### ThemePreview 하드코딩 색상
- `ThemePreview.tsx`가 하드코딩된 색상 사용
- 현재 `ThemeManager`가 App.tsx에 연결되지 않아 데드 코드 상태
- 우선순위 낮음

---

## 핵심 파일 경로

| 역할 | 경로 |
|------|------|
| 서버 엔트리 | `apps/server/src/index.ts` |
| 클라이언트 엔트리 | `apps/client/src/App.tsx` |
| 클라이언트 메인 CSS | `apps/client/src/App.css` |
| 에이전트 대시보드 | `apps/client/src/components/AgentDashboard/` |
| 스프라이트 렌더러 | `apps/client/src/components/SpriteCanvas.tsx` |
| Zustand 스토어 | `apps/client/src/stores/` |
| 테마 스토어 | `apps/client/src/stores/useThemeStore.ts` |
| 테마 타입 | `apps/client/src/types/theme.ts` |
| React 훅 | `apps/client/src/hooks/` |
| CSS (대시보드) | `apps/client/src/styles/agent-dashboard.css` |
| CSS (테마 변수) | `apps/client/src/styles/themes.css` |
| CSS (HITL) | `apps/client/src/styles/hitl.css` |
| 훅 스크립트 | `.claude/hooks/send_event.py` |
| GIF 스프라이트 | `apps/client/public/sprites/{charId}/` |

---

## 참고 링크

- [claude-code-hooks-multi-agent-observability](https://github.com/disler/claude-code-hooks-multi-agent-observability)
- [Claude Code Hooks 공식 문서](https://code.claude.com/docs/en/hooks)
- [PixelLab AI](https://www.pixellab.ai/)
