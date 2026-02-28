# Agent Character Dashboard

Claude Code 에이전트를 도트 캐릭터로 시각화하는 실시간 멀티에이전트 관찰 대시보드.

각 Claude Code 세션이 고유한 캐릭터로 표시되며, 툴 사용/생각 중/완료 등 상태가 애니메이션으로 변한다.

---

## 동작 원리

```
Claude Code 인스턴스 (여러 터미널)
    │  툴 사용, 프롬프트 제출, 완료 등 이벤트 발생 시
    ↓
~/.claude/settings.json 글로벌 훅 발동
    │  send_event.py 실행 (stdin으로 이벤트 데이터 전달)
    ↓
Bun 서버 (port 4000) ← HTTP POST /events
    │  SQLite에 저장 + 인메모리 에이전트 상태 갱신
    ↓
React 대시보드 (port 5174) ← WebSocket /stream
    │  에이전트별 캐릭터 렌더링, 상태 뱃지, 이벤트 타임라인
```

**핵심:** Claude Code에 **글로벌 훅**을 설정하면, 모든 Claude Code 세션이 자동으로 대시보드에 보고된다. 대시보드 서버가 꺼져 있어도 Claude Code 동작에는 영향 없다(3초 타임아웃 후 무시).

---

## 사전 요구사항

- [Bun](https://bun.sh/) — 서버 런타임 및 패키지 매니저
- [Python](https://www.python.org/) — 훅 스크립트 실행 (`python` 명령)
- [Claude Code](https://claude.ai/code) — 관찰 대상 CLI

---

## 설치

```bash
# 클라이언트 의존성
cd apps/client
bun install

# 서버 의존성
cd ../server
bun install
```

---

## 실행

터미널 2개를 열어 각각 실행한다.

**터미널 1 — 서버:**
```bash
cd apps/server
bun src/index.ts
```

**터미널 2 — 클라이언트:**
```bash
cd apps/client
bun dev
```

브라우저에서 `http://localhost:5174` 접속.

---

## Claude Code 훅 설정 (핵심)

대시보드에 데이터를 보내려면 Claude Code의 **글로벌 훅**을 설정해야 한다.

훅 설정 파일: `~/.claude/settings.json`

### Windows 경로 주의

`send_event.py` 경로를 **이 프로젝트의 실제 경로**로 변경해야 한다.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "python C:/WORK/workspace/agent-character-dashboard/.claude/hooks/send_event.py PreToolUse",
            "timeout": 5
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "python C:/WORK/workspace/agent-character-dashboard/.claude/hooks/send_event.py PostToolUse",
            "timeout": 5
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "python C:/WORK/workspace/agent-character-dashboard/.claude/hooks/send_event.py UserPromptSubmit",
            "timeout": 5
          }
        ]
      }
    ],
    "Notification": [
      {
        "matcher": "permission_prompt|idle_prompt|elicitation_dialog",
        "hooks": [
          {
            "type": "command",
            "command": "python C:/WORK/workspace/agent-character-dashboard/.claude/hooks/send_event.py Notification",
            "timeout": 5
          }
        ]
      }
    ],
    "PermissionRequest": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python C:/WORK/workspace/agent-character-dashboard/.claude/hooks/send_event.py PermissionRequest",
            "timeout": 5
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python C:/WORK/workspace/agent-character-dashboard/.claude/hooks/send_event.py Stop",
            "timeout": 5
          }
        ]
      }
    ],
    "SubagentStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python C:/WORK/workspace/agent-character-dashboard/.claude/hooks/send_event.py SubagentStart",
            "timeout": 5
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python C:/WORK/workspace/agent-character-dashboard/.claude/hooks/send_event.py SubagentStop",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

> **주의:** `settings.json`에 이미 다른 설정(permissions, model 등)이 있으면 `hooks` 키만 병합한다.

### 훅 설정 확인

훅이 정상 동작하는지 확인하려면:

1. 대시보드 서버를 실행한 상태에서
2. 아무 프로젝트에서 `claude` 명령으로 Claude Code를 실행하고
3. 프롬프트를 입력하면
4. 대시보드 `http://localhost:5174`에서 해당 에이전트 카드가 나타나는지 확인

---

## 에이전트 식별 방식

에이전트는 `source_app:session_id` 조합으로 식별된다.

- **source_app**: Claude Code가 실행된 프로젝트 폴더 이름 (`CLAUDE_PROJECT_DIR` 환경변수에서 추출)
- **session_id**: Claude Code 세션 ID (앞 8자리만 표시)

표시 예시: `my-project:a1b2c3d4`

같은 프로젝트에서 여러 Claude Code 세션을 실행하면 각각 별도 카드로 표시된다.

---

## 에이전트 상태

| 상태 | 의미 | 트리거 이벤트 |
|------|------|--------------|
| THINKING | 프롬프트 처리 중 | UserPromptSubmit |
| READING | 파일/웹 읽기 중 | PreToolUse (Read, Grep, Glob 등) |
| WORKING | 툴 실행 중 | PreToolUse / PostToolUse |
| ORCHESTRATING | SubAgent 실행 중 | SubagentStart |
| DONE | 응답 완료 | Stop |
| BLOCKED | 권한 요청 대기 | PermissionRequest |
| WAITING | 유휴 상태 | 이벤트 없음 (30~60초 후 자동) |
| OFFLINE | 오프라인 | 5분 이상 비활동 |

### 자동 상태 전환 타임아웃

- **30초**: DONE → WAITING
- **60초**: 기타 상태 → WAITING
- **5분**: 모든 상태 → OFFLINE
- **10분**: OFFLINE → 대시보드에서 삭제

---

## SubAgent 지원

`Task` 툴로 SubAgent를 실행하면:

- 부모 에이전트 상태 → **ORCHESTRATING** (⚡N 뱃지로 활성 수 표시)
- 각 SubAgent 작업이 별도 **Task 카드**로 표시
- SubAgent 완료 시 Task 카드 → DONE으로 표시 후 5분 뒤 삭제

---

## 대시보드 화면 구성

### 파티 탭 (캐릭터 화면)

- **에이전트 카드**: 캐릭터 스프라이트, 상태 뱃지, APM(분당 액션 수), 마지막 업데이트 시각
- **피드**: 최근 툴 이벤트 목록 (마우스 오버 시 상세 툴팁)
- **캐릭터 순환**: 캐릭터 클릭 시 다음 캐릭터로 변경
- **카드 뷰 / 상세 뷰 전환**: 헤더 버튼으로 레이아웃 토글

### 이벤트 탭 (타임라인)

- **Party Events 타임라인**: 모든 에이전트의 훅 이벤트를 최신순으로 표시, 정규식 검색 지원
- **LivePulseChart**: 실시간 활동 차트
- **SwimLane**: 에이전트별 이벤트 레인

### 테마 관리

- **다크/라이트 모드 토글**: 헤더 Sun/Moon 버튼
- **테마 매니저**: 헤더 팔레트 버튼 → 테마 목록, 신규 테마 업로드, 활성 테마 전환
- **테마 패키지 업로드**: 테마 메타데이터 + 라이트/다크 색상 팔레트 + 캐릭터 GIF 일괄 등록

---

## 캐릭터 목록

| 캐릭터 | 렌더링 방식 | 스프라이트 경로 |
|--------|------------|----------------|
| frieren | GIF | `public/sprites/frieren/` |
| fern | GIF | `public/sprites/fern/` |
| stark | GIF | `public/sprites/stark/` |
| himmel | GIF | `public/sprites/himmel/` |
| char_a ~ char_e | Canvas 픽셀아트 | (코드 내 생성) |

GIF 파일명 규칙: `{CHARNAME_대문자}_{STATUS}.gif`

상태 매핑:

| 에이전트 상태 | GIF 접미사 |
|-------------|-----------|
| WORKING, ORCHESTRATING | FORCE |
| THINKING | THINK |
| READING | READING |
| WAITING, BLOCKED | REST |
| DONE | FINISH |
| ERROR, OFFLINE | OFFLINE |

> **참고:** FORCE(WORKING) 파일만 필수이며, 나머지 상태 파일이 없으면 FORCE GIF로 대체된다.

---

## 새 캐릭터 GIF 추가하기

캐릭터 추가는 **테마 패키지 업로드 UI**를 통해 진행한다. 코드 수정 없이 동적으로 등록된다.

### 테마 업로드 UI 사용법

1. 헤더의 팔레트(🎨) 버튼 → 테마 매니저 열기
2. "새 테마 추가" 버튼 클릭
3. 테마 이름/설명 입력
4. 라이트/다크 색상 팔레트 지정
5. 캐릭터 섹션에서 캐릭터 ID와 이름을 입력하고 GIF 파일 업로드
6. 저장 후 "활성화" 버튼으로 테마 적용

### 수동으로 GIF 파일 배치 (내장 캐릭터용)

내장 캐릭터(`frieren`, `fern`, `stark`, `himmel`)는 클라이언트 `public` 디렉토리에 파일을 직접 넣어도 된다.

파일명 규칙: `{CHARNAME_대문자}_{STATUS}.gif`

예시 (캐릭터 ID = `himmel`, 프리픽스 = `HIMMEL`):

```
apps/client/public/sprites/himmel/
├── HIMMEL_FORCE.gif     # WORKING / ORCHESTRATING 상태 (필수)
├── HIMMEL_THINK.gif     # THINKING 상태
├── HIMMEL_READING.gif   # READING 상태
├── HIMMEL_REST.gif      # WAITING / BLOCKED 상태
├── HIMMEL_FINISH.gif    # DONE 상태
└── HIMMEL_OFFLINE.gif   # ERROR / OFFLINE 상태
```

---

## 테마 관리 시스템

### 개요

테마 패키지는 **색상 팔레트 + 캐릭터 GIF** 묶음이다. 한 번에 하나의 테마가 활성화되며, 활성 테마의 캐릭터가 에이전트에 자동 배정된다.

### 서버 API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/themes` | 테마 목록 조회 |
| POST | `/api/themes/upload` | 테마 패키지 업로드 (multipart) |
| POST | `/api/themes/:id/activate` | 테마 활성화 |
| DELETE | `/api/themes/:id` | 테마 삭제 |
| GET | `/api/characters` | 현재 활성 캐릭터 목록 |
| GET | `/api/themes/:id/characters` | 특정 테마의 캐릭터 목록 |

업로드된 GIF 파일은 `./uploads/sprites/{themeId}/{charId}/` 에 저장되고 `/uploads/` 경로로 정적 서빙된다.

### 색상 변수

테마는 라이트/다크 두 벌의 색상 팔레트를 가진다. 활성화 시 CSS 변수(`--theme-*`)로 적용된다.

---

## 환경변수

### 클라이언트 (`apps/client/.env`)

```env
VITE_API_URL=http://localhost:4000    # 서버 API URL
VITE_WS_URL=ws://localhost:4000/stream # WebSocket URL
VITE_MAX_EVENTS_TO_DISPLAY=300        # 메모리에 유지할 최대 이벤트 수
VITE_PORT=5174                        # 개발 서버 포트 (기본 5174)
```

### 훅 스크립트

서버 포트를 바꾸거나 원격 서버를 사용하는 경우:

```bash
export DASHBOARD_SERVER_URL=http://your-server:4000
```

또는 시스템 환경변수로 설정한다.

---

## 프로젝트 구조

```
agent-character-dashboard/
├── .claude/
│   └── hooks/
│       └── send_event.py              # Claude Code → 서버 이벤트 전송 훅
├── apps/
│   ├── server/
│   │   └── src/
│   │       ├── index.ts               # Bun 서버 (HTTP + WebSocket + 에이전트 상태 관리)
│   │       ├── db.ts                  # SQLite (bun:sqlite) 이벤트/테마/캐릭터 저장소
│   │       ├── types.ts               # 공유 타입 (Theme, ThemeCharacter, CharacterSprite 등)
│   │       ├── theme.ts               # 테마 CRUD 로직
│   │       └── upload.ts              # 테마 패키지 업로드 핸들러 (multipart, GIF 검증)
│   ├── client/                        # React 19 + Vite 클라이언트 (메인)
│   │   └── src/
│   │       ├── App.tsx                # 메인 레이아웃 (탭 UI)
│   │       ├── config.ts              # API/WebSocket URL 설정
│   │       ├── stores/                # Zustand 스토어
│   │       │   ├── useWebSocketStore.ts  # 에이전트 상태, 이벤트, 캐릭터 목록
│   │       │   ├── useThemeStore.ts      # 테마/색상/다크모드 상태
│   │       │   └── useSoundStore.ts      # 사운드 설정
│   │       ├── hooks/                 # React 커스텀 훅
│   │       │   ├── useCharacters.ts      # 동적 캐릭터 로딩 (DB → 내장 → null 폴백)
│   │       │   ├── useEventColors.ts
│   │       │   ├── useEventSearch.ts
│   │       │   └── ...
│   │       └── components/
│   │           ├── AgentDashboard/
│   │           │   ├── AgentDashboard.tsx   # 에이전트 컬럼 컨테이너
│   │           │   ├── AgentColumn.tsx      # 단일 에이전트 컬럼
│   │           │   ├── AgentCard.tsx        # 캐릭터 카드 (스프라이트, 상태, APM)
│   │           │   ├── FeedItem.tsx         # 피드 이벤트 행
│   │           │   └── FeedTooltip.tsx      # 툴팁 포탈
│   │           ├── SpriteCanvas.tsx         # 캐릭터 렌더링 (GIF/Canvas 픽셀아트)
│   │           ├── ThemeManager.tsx         # 테마 목록/활성화 UI
│   │           ├── ThemePackageUpload.tsx   # 테마 패키지 업로드 UI
│   │           ├── ThemePreview.tsx         # 테마 색상 미리보기
│   │           ├── EventTimeline.tsx        # 이벤트 스트림
│   │           ├── LivePulseChart.tsx       # 실시간 활동 차트
│   │           ├── HitlOverlay.tsx          # HITL 인터랙션 오버레이
│   │           └── ...
│   └── client-vue/                    # Vue 3 클라이언트 (아카이브)
└── README.md
```

---

## 트러블슈팅

### 에이전트가 대시보드에 나타나지 않을 때

1. **서버 실행 확인**: `http://localhost:4000/agents` 에서 JSON 응답 오는지 확인
2. **훅 경로 확인**: `~/.claude/settings.json`의 `send_event.py` 경로가 실제 파일 위치와 일치하는지 확인
3. **python 명령 확인**: 터미널에서 `python --version` 실행. `python3`만 있다면 훅 커맨드를 `python3`으로 변경
4. **방화벽 확인**: `localhost:4000` 포트 접근 차단 여부 확인
5. **isSubagent 오분류**: 서버 재시작 후 오래된 세션이 서브에이전트로 분류될 수 있음. `http://localhost:4000/agents`에서 `isSubagent` 값 확인

### 한글이 깨질 때

훅 스크립트는 `sys.stdin.buffer.read()`로 바이너리 읽기 후 UTF-8 디코딩을 사용한다. bash 버전(`send_event.sh`)이 아닌 반드시 Python 버전(`send_event.py`)을 사용해야 한다.

### session_id가 "unknown"으로 표시될 때

`session_id`는 환경변수가 아닌 stdin payload JSON 안에 있다. 훅 스크립트가 `send_event.py`인지 확인한다.

### WebSocket 연결 끊김

클라이언트는 3초마다 자동 재연결을 시도한다. 서버가 실행 중이면 자동으로 복구된다.

### 테마 업로드 실패 시

- GIF 파일 형식 검증: 파일 magic bytes(`GIF87a` / `GIF89a`)가 올바른지 확인
- 파일 크기 제한: 개별 GIF 파일은 10MB 이하 권장
- `./uploads/` 디렉토리 쓰기 권한 확인 (`apps/server/uploads/`)
