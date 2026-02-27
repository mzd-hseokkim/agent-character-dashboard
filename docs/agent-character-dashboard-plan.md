# Agent Character Dashboard 구현 계획

> Claude Code 에이전트들의 상태를 도트 캐릭터로 시각화하는 대시보드

---

## 개요

### 목표

Claude Code 에이전트(터미널 인스턴스)별로 고유한 도트 캐릭터를 부여하고,
에이전트의 현재 상태(작업 중 / 대기 중 / 완료 등)에 따라 캐릭터 애니메이션이 바뀌는 실시간 대시보드 구현.

### 베이스 프로젝트

[claude-code-hooks-multi-agent-observability](https://github.com/disler/claude-code-hooks-multi-agent-observability)

**이 프로젝트를 베이스로 쓰는 이유:**

- 훅 스크립트 12종 완성 (PreToolUse, PostToolUse, Stop 등)
- Bun 서버 + SQLite + WebSocket 인프라 완성
- Vue 3 클라이언트 기반 존재
- 글로벌 `~/.claude/settings.json` 적용으로 모든 프로젝트 자동 수집 가능

**수정/추가할 것:**

- 기존 이벤트 타임라인 UI → 캐릭터 대시보드 UI로 교체 또는 병행
- 에이전트 상태 추적 로직 추가
- 스프라이트 시트 렌더링 컴포넌트 추가

---

## 에이전트 상태 설계

### 상태 → 훅 이벤트 매핑

| 상태 | 트리거 이벤트 | 캐릭터 애니메이션 |
|------|-------------|----------------|
| **WORKING** | `PreToolUse`, `PostToolUse` | 타이핑 / 망치질 / 분주한 움직임 |
| **THINKING** | `UserPromptSubmit` | 턱 괴고 생각하는 포즈 |
| **WAITING** | `Notification` (idle_prompt) | 팔짱 끼고 기다리는 포즈 |
| **DONE** | `Stop` | 기지개 / 의자에 기대는 포즈 |
| **ERROR** | `PostToolUseFailure` | 당황한 표정 |
| **BLOCKED** | `PermissionRequest` | 손들고 멈추는 포즈 |
| **OFFLINE** | SessionEnd 후 타임아웃 | 잠자는 포즈 |

### 상태 전환 규칙

- 마지막 이벤트 기준으로 상태 결정
- 이벤트 없이 60초 경과 시 → WAITING
- 이벤트 없이 5분 경과 시 → OFFLINE

---

## 스프라이트 제작

### 도구 추천: PixelLab (pixellab.ai)

- 텍스트 프롬프트로 캐릭터 생성
- 동일 캐릭터 기반으로 애니메이션 프레임 일관성 유지
- 스프라이트 시트(PNG) 직접 export

### 필요한 스프라이트 시트 구성

```
character_A/
├── idle.png       # 4~6 프레임, 가만히 있는 상태
├── working.png    # 6~8 프레임, 일하는 상태
├── thinking.png   # 4 프레임, 생각하는 상태
├── waiting.png    # 4 프레임, 기다리는 상태
├── done.png       # 4 프레임, 완료 상태
├── error.png      # 4 프레임, 에러 상태
└── sleeping.png   # 4 프레임, 오프라인 상태
```

### 스프라이트 시트 스펙

- 해상도: 프레임당 32x32 또는 48x48 픽셀
- 포맷: PNG (투명 배경)
- 레이아웃: 가로로 프레임 나열 (horizontal strip)
- 색상: 팔레트 16색 이내 권장 (레트로 느낌)

### PixelLab 프롬프트 예시

```
pixel art character, office worker, side view, 
32x32, idle animation, 6 frames horizontal sprite sheet,
transparent background, retro 16-bit style
```

### 캐릭터 수

- 에이전트(터미널/프로젝트)당 1캐릭터
- 최소 3~5종 미리 제작 (자동 순환 할당)

---

## 기술 구현

### 전체 아키텍처

```
Claude Code 인스턴스들
    ↓ (훅 이벤트 HTTP POST)
Bun 서버 (port 4000)
    ├── SQLite: 이벤트 저장
    ├── 에이전트 상태 관리 (in-memory Map)
    └── WebSocket: 상태 변경 브로드캐스트
         ↓
Vue 3 대시보드 (port 5173)
    └── 에이전트 카드 그리드
         └── 스프라이트 Canvas 컴포넌트
```

### Phase 1: 베이스 프로젝트 세팅

```bash
git clone https://github.com/disler/claude-code-hooks-multi-agent-observability
cd claude-code-hooks-multi-agent-observability

# 의존성 설치
just install   # 또는 bun install

# 글로벌 훅 설정
# ~/.claude/settings.json 수정
# --source-app $(basename $CLAUDE_PROJECT_DIR) 로 동적 프로젝트명 적용
```

**글로벌 `~/.claude/settings.json` 핵심 설정:**

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "uv run ~/claude-observability/.claude/hooks/send_event.py --source-app $(basename $CLAUDE_PROJECT_DIR) --event-type PreToolUse"
      }]
    }]
  }
}
```

> ⚠️ `$(basename $CLAUDE_PROJECT_DIR)` 동작 여부는 실제 테스트 필요

### Phase 2: 서버 사이드 상태 관리 추가

기존 `apps/server/src/index.ts`에 에이전트 상태 추적 로직 추가:

```typescript
// 에이전트별 현재 상태 관리
const agentStates = new Map<string, {
  status: 'WORKING' | 'THINKING' | 'WAITING' | 'DONE' | 'ERROR' | 'BLOCKED' | 'OFFLINE',
  lastEvent: string,
  lastUpdated: Date,
  characterId: string  // 어떤 캐릭터를 쓸지
}>()

// 이벤트 수신 시 상태 업데이트
function updateAgentState(sourceApp: string, eventType: string) {
  const status = eventToStatus(eventType)
  agentStates.set(sourceApp, {
    status,
    lastEvent: eventType,
    lastUpdated: new Date(),
    characterId: getOrAssignCharacter(sourceApp)
  })
  
  // WebSocket으로 전체 상태 브로드캐스트
  broadcastAgentStates()
}

// 타임아웃 체크 (60초 → WAITING, 5분 → OFFLINE)
setInterval(checkTimeouts, 10000)
```

**상태 전환 함수:**

```typescript
function eventToStatus(eventType: string): AgentStatus {
  const map = {
    'PreToolUse': 'WORKING',
    'PostToolUse': 'WORKING',
    'UserPromptSubmit': 'THINKING',
    'Stop': 'DONE',
    'PostToolUseFailure': 'ERROR',
    'PermissionRequest': 'BLOCKED',
    'Notification': 'WAITING',
    'SessionEnd': 'OFFLINE'
  }
  return map[eventType] ?? 'WAITING'
}
```

**WebSocket 메시지 포맷 추가:**

```typescript
// 기존 이벤트 스트림과 별도로 에이전트 상태 전용 채널
ws.send(JSON.stringify({
  type: 'agent_states',
  data: Object.fromEntries(agentStates)
}))
```

### Phase 3: 스프라이트 렌더링 컴포넌트

`apps/client/src/components/SpriteCanvas.vue`:

```vue
<template>
  <canvas ref="canvas" :width="spriteSize" :height="spriteSize" />
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  characterId: string  // 'character_A', 'character_B' 등
  status: string       // 'WORKING', 'IDLE' 등
  spriteSize: number   // 표시 크기 (px)
}>()

const canvas = ref<HTMLCanvasElement>()
const frameSize = 32      // 스프라이트 한 프레임 크기
const fps = 8             // 애니메이션 속도
let currentFrame = 0
let animTimer: number

// 상태별 스프라이트 시트 로드
const spriteCache = new Map<string, HTMLImageElement>()

async function loadSprite(characterId: string, status: string) {
  const key = `${characterId}_${status}`
  if (spriteCache.has(key)) return spriteCache.get(key)!
  
  const img = new Image()
  img.src = `/sprites/${characterId}/${status.toLowerCase()}.png`
  await img.decode()
  spriteCache.set(key, img)
  return img
}

// 애니메이션 루프
async function animate() {
  const img = await loadSprite(props.characterId, props.status)
  const totalFrames = img.width / frameSize
  const ctx = canvas.value!.getContext('2d')!
  
  ctx.clearRect(0, 0, props.spriteSize, props.spriteSize)
  ctx.imageSmoothingEnabled = false  // 픽셀아트 선명하게
  ctx.drawImage(
    img,
    currentFrame * frameSize, 0,  // 소스 위치
    frameSize, frameSize,          // 소스 크기
    0, 0,                          // 대상 위치
    props.spriteSize, props.spriteSize  // 대상 크기 (확대)
  )
  
  currentFrame = (currentFrame + 1) % totalFrames
  animTimer = setTimeout(animate, 1000 / fps)
}

onMounted(() => animate())
onUnmounted(() => clearTimeout(animTimer))
watch(() => [props.characterId, props.status], () => {
  currentFrame = 0  // 상태 바뀌면 첫 프레임부터
})
</script>
```

### Phase 4: 대시보드 메인 화면

`apps/client/src/components/AgentDashboard.vue`:

```vue
<template>
  <div class="dashboard">
    <h1>🎮 Agent Dashboard</h1>
    <div class="agent-grid">
      <div 
        v-for="(agent, name) in agentStates" 
        :key="name"
        class="agent-card"
        :class="agent.status.toLowerCase()"
      >
        <SpriteCanvas 
          :characterId="agent.characterId"
          :status="agent.status"
          :spriteSize="96"
        />
        <div class="agent-info">
          <div class="agent-name">{{ name }}</div>
          <div class="agent-status">{{ statusLabel[agent.status] }}</div>
          <div class="last-event">{{ agent.lastEvent }}</div>
        </div>
      </div>
    </div>
  </div>
</template>
```

---

## 작업 순서 (추천)

### Step 1: 환경 세팅 (0.5일)

- [ ] 베이스 프로젝트 클론 및 실행 확인
- [ ] 글로벌 훅 설정 및 `$(basename $CLAUDE_PROJECT_DIR)` 동작 테스트
- [ ] 여러 터미널에서 이벤트가 대시보드에 잡히는지 확인

### Step 2: 스프라이트 제작 (1~2일)

- [ ] PixelLab에서 캐릭터 3~5종 생성
- [ ] 각 캐릭터별 상태 애니메이션 스프라이트 시트 제작
  - idle, working, thinking, waiting, done, error, sleeping
- [ ] `/apps/client/public/sprites/` 폴더에 배치

### Step 3: 서버 수정 (0.5일)

- [ ] 에이전트 상태 Map 추가
- [ ] 이벤트 수신 시 상태 업데이트 로직
- [ ] 타임아웃 체크 (WAITING / OFFLINE 전환)
- [ ] 에이전트 상태 전용 WebSocket 메시지 추가

### Step 4: 프론트 구현 (1일)

- [ ] `SpriteCanvas.vue` 컴포넌트 구현
- [ ] `AgentDashboard.vue` 메인 화면 구현
- [ ] WebSocket에서 에이전트 상태 수신 및 실시간 반영
- [ ] 기존 이벤트 타임라인과 탭으로 병행 (선택)

### Step 5: 스타일링 및 마무리 (0.5일)

- [ ] 상태별 카드 배경색/효과
- [ ] 캐릭터 이름/상태 표시 UI
- [ ] 반응형 그리드 레이아웃

---

## 리스크 및 대응

| 리스크 | 가능성 | 대응 |
|--------|--------|------|
| `$(basename $CLAUDE_PROJECT_DIR)` 동작 안 함 | 중간 | 환경변수 대신 Python 스크립트에서 `os.getcwd()` 로 처리 |
| PixelLab 캐릭터 상태 간 일관성 부족 | 높음 | 레퍼런스 이미지 업로드 기능 활용, 같은 세션에서 연속 생성 |
| 스프라이트 시트 프레임 수 불일치 | 낮음 | 서버에서 캐릭터별 메타데이터(프레임 수) JSON으로 관리 |

---

## 참고 링크

- [claude-code-hooks-multi-agent-observability](https://github.com/disler/claude-code-hooks-multi-agent-observability)
- [Claude Code Hooks 공식 문서](https://code.claude.com/docs/en/hooks)
- [PixelLab AI](https://www.pixellab.ai/)
- [Canvas 픽셀아트 렌더링 (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
