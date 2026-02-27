# 테마 관리 시스템 - 구현 계획

## 배경

현재 테마 시스템(색상 24토큰)과 캐릭터/스프라이트 시스템이 완전히 분리되어 있다.
캐릭터 추가 시 서버(`CHARACTER_IDS`)와 클라이언트(`GIF_CHARS`) 양쪽 하드코딩을 수동으로 수정해야 하는 구조.
→ 색상 + 캐릭터 이미지를 하나의 **테마 패키지**로 묶어 업로드하고 DB로 관리하도록 전환한다.

## 현재 상태

| 영역 | 현재 구현 | 관련 파일 |
|------|----------|----------|
| 테마 색상 | SQLite `themes` 테이블, CRUD API 완비 | `server/src/theme.ts`, `server/src/db.ts` |
| 캐릭터 목록 | 서버 **하드코딩** `CHARACTER_IDS` 배열 | `server/src/index.ts:36` |
| GIF 매핑 | 클라이언트 **하드코딩** `GIF_CHARS` 맵 | `client/src/components/SpriteCanvas.vue:29` |
| GIF 파일 | `client/public/sprites/{charId}/` 정적 파일 (Vite 서빙) | 3캐릭터 × 6상태 = 18 GIF |
| 파일 업로드 | **없음** | - |
| 테마 UI | ThemeManager.vue, ThemePreview.vue 존재하나 앱에 미연결 | dead code |

### GIF 파일 컨벤션
```
sprites/{charId}/{CHARNAME}_{STATUS}.gif
예) sprites/stark/STARK_FORCE.gif

STATUS: FINISH | FORCE | OFFLINE | READING | REST | THINK
```

---

## Phase 1: DB 스키마 확장
**규모: S (~120줄)**

### 신규 테이블

```sql
-- 테마에 속한 캐릭터
CREATE TABLE IF NOT EXISTS theme_characters (
  id TEXT PRIMARY KEY,
  themeId TEXT NOT NULL,
  characterId TEXT NOT NULL,   -- 'luna', 'rex' 등 (에이전트에 배정되는 ID)
  displayName TEXT NOT NULL,   -- 'Luna', 'Rex'
  spritePrefix TEXT NOT NULL,  -- 'LUNA', 'REX' (파일명 prefix)
  sortOrder INTEGER DEFAULT 0,
  createdAt INTEGER NOT NULL,
  UNIQUE(themeId, characterId),
  FOREIGN KEY (themeId) REFERENCES themes(id) ON DELETE CASCADE
);

-- 캐릭터별 스프라이트 파일
CREATE TABLE IF NOT EXISTS character_sprites (
  id TEXT PRIMARY KEY,
  characterId TEXT NOT NULL,   -- FK → theme_characters.id
  status TEXT NOT NULL,        -- FINISH, FORCE, OFFLINE, READING, REST, THINK
  filePath TEXT NOT NULL,      -- uploads/ 기준 상대 경로
  fileSize INTEGER NOT NULL,
  mimeType TEXT DEFAULT 'image/gif',
  createdAt INTEGER NOT NULL,
  UNIQUE(characterId, status),
  FOREIGN KEY (characterId) REFERENCES theme_characters(id) ON DELETE CASCADE
);
```

### 수정 파일
- `apps/server/src/db.ts` — `initDatabase()`에 테이블 추가, CRUD 함수 추가
  - `insertThemeCharacter()`, `getThemeCharacters(themeId)`, `getAllCharacters()`
  - `insertCharacterSprite()`, `getCharacterSprites(characterId)`
- `apps/server/src/types.ts` — `ThemeCharacter`, `CharacterSprite` 인터페이스 추가

---

## Phase 2: 파일 업로드 API
**규모: M (~300줄)**

### 신규 파일: `apps/server/src/upload.ts`
- `parseThemePackage(req)` — `req.formData()` (Bun 네이티브)로 multipart 파싱
- `validateGifFile(file)` — magic bytes 검증(GIF87a/GIF89a), 크기 제한 2MB/파일
- `saveSpriteToDisk(themeId, charId, status, file)` — `Bun.write()`로 저장
- 저장 경로: `apps/server/uploads/sprites/{themeId}/{characterId}/{PREFIX}_{STATUS}.gif`

### 신규 API 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| `POST` | `/api/themes/upload` | 테마 패키지 업로드 (multipart) |
| `GET` | `/api/characters` | DB 등록 전체 캐릭터 목록 |
| `GET` | `/api/themes/:id/characters` | 특정 테마의 캐릭터 + 스프라이트 |

### 업로드 요청 형식 (multipart/form-data)
```
metadata (text): {
  "theme": { "name": "dark-fantasy", "displayName": "Dark Fantasy", "colors": {...}, ... },
  "characters": [
    { "characterId": "luna", "displayName": "Luna", "spritePrefix": "LUNA" }
  ]
}
luna_FINISH (file): LUNA_FINISH.gif
luna_FORCE  (file): LUNA_FORCE.gif
...
```

### 정적 파일 서빙 추가 (`apps/server/src/index.ts`)
```typescript
if (url.pathname.startsWith('/uploads/')) {
  const file = Bun.file(`./uploads${url.pathname.slice(8)}`);
  if (await file.exists()) return new Response(file, { headers: { 'Cache-Control': 'public, max-age=86400', ... } });
}
```

### 테마 삭제 연동
- `deleteThemeById()` 확장: DB 삭제 + `uploads/sprites/{themeId}/` 디렉토리도 제거

---

## Phase 3: 동적 캐릭터 등록 (하드코딩 제거)
**규모: M (~220줄)**

### 서버 (`apps/server/src/index.ts`)
- `CHARACTER_IDS` 상수 → `loadCharacterIds()` 함수 (DB 조회)
- 내장 캐릭터(`char_a`~`char_e`)는 DB 목록에 없을 경우 fallback으로 유지
- `cycleCharacter` 엔드포인트도 동적 목록 사용
- 테마 업로드/삭제 시 WebSocket으로 `characters_updated` 브로드캐스트

### 신규 파일: `apps/client/src/composables/useCharacters.ts`
- 서버 `GET /api/characters`에서 레지스트리 fetch
- WebSocket `characters_updated` 메시지로 실시간 갱신
- `getGifUrl(characterId, status)` 반환:
  - DB 등록 캐릭터 → `http://server:4000/uploads/sprites/...`
  - 내장 캐릭터 → `/sprites/...` (기존 경로 유지)

### 수정 파일
- `apps/client/src/components/SpriteCanvas.vue` — `GIF_CHARS` 제거, `useCharacters()` 사용
- `apps/client/src/composables/useWebSocket.ts` — `characters_updated` 메시지 핸들링

---

## Phase 4: 테마 패키지 업로드 UI
**규모: M-L (~400줄)**

### 신규 파일: `apps/client/src/components/ThemePackageUpload.vue`

3섹션 모달/패널:
1. **테마 메타데이터** — name, displayName, description, tags, 24개 색상 입력
2. **캐릭터 정의** — "캐릭터 추가" 버튼, 각 캐릭터별
   - characterId, displayName 입력
   - 6개 상태별 GIF 드롭존 (FINISH, FORCE, OFFLINE, READING, REST, THINK)
   - 업로드 GIF 썸네일 미리보기
3. **제출** — FormData 구성 → `POST /api/themes/upload`

### 수정 파일
- `apps/client/src/App.vue` — 업로드 UI 진입점 추가 (탭 또는 버튼)

---

## Phase 5: 활성 테마 적용
**규모: S-M (~130줄)**

### 서버 — `POST /api/themes/:id/activate`
- 서버 인메모리에 `activeThemeId` 저장
- 기존 에이전트들의 `characterId`를 해당 테마 캐릭터풀에서 재배정
- WebSocket으로 `agent_states` + `theme_activated` 브로드캐스트

### 클라이언트
- 테마 선택 시 색상(CSS 변수) + 캐릭터 동시 전환
- `apps/client/src/composables/useThemes.ts` — `activateTheme(themeId)` 추가

---

## 의존성 순서

```
Phase 1 (DB) → Phase 2 (Upload API) → Phase 3 (동적 캐릭터)
                                              ↓
                                       Phase 4 (Upload UI)
                                              ↓
                                       Phase 5 (활성 테마)
```

## 규모 요약

| Phase | 규모 | 신규 파일 | 수정 파일 | 코드량 |
|-------|------|-----------|----------|--------|
| 1. DB 스키마 | S | 0 | 2 | ~120줄 |
| 2. Upload API | M | 1 `upload.ts` | 2 | ~300줄 |
| 3. 동적 캐릭터 | M | 1 `useCharacters.ts` | 3 | ~220줄 |
| 4. Upload UI | M-L | 1 `ThemePackageUpload.vue` | 1 | ~400줄 |
| 5. 활성 테마 | S-M | 0 | 3 | ~130줄 |
| **합계** | **L** | **3** | **~8** | **~1,170줄** |

## 재사용 가능한 기존 코드

| 기존 코드 | 위치 | 재사용 용도 |
|----------|------|------------|
| `validateTheme()`, `sanitizeTheme()` | `server/src/theme.ts` | Phase 2 업로드 검증 |
| `generateId()` | `server/src/theme.ts` | character/sprite ID 생성 |
| `insertTheme()` | `server/src/db.ts` | 업로드 트랜잭션 내 호출 |
| `STATUS_TO_GIF` 매핑 | `SpriteCanvas.vue` | 파일명 컨벤션 유지 (변경 불필요) |
| WebSocket 메시지 패턴 | `useWebSocket.ts` | `characters_updated` 추가 |

## 마이그레이션 전략

기존 3개 캐릭터(frieren, fern, stark)는 `client/public/sprites/`에 **그대로 유지**.
DB 미등록 캐릭터는 기존 경로에서 서빙되므로 하위 호환성 보장.
나중에 DB로 옮기고 싶으면 별도 마이그레이션 스크립트 작성.
