# 테마 관리 시스템 - 구현 계획

## 배경

현재 테마 시스템(색상 24토큰)과 캐릭터/스프라이트 시스템이 완전히 분리되어 있다.
캐릭터 추가 시 서버(`CHARACTER_IDS`)와 클라이언트(`GIF_CHARS`) 양쪽 하드코딩을 수동으로 수정해야 하는 구조.
→ 색상 + 캐릭터 이미지를 하나의 **테마 패키지**로 묶어 업로드하고 DB로 관리하도록 전환한다.

## 다크/라이트 모드 설계 원칙

**모드(mode)**와 **테마(theme)**는 독립적인 두 축이다.

```
isDarkMode (boolean)  ←  전역 토글로 결정, 사용자 preference
currentTheme (string) ←  어떤 테마 패키지를 사용할지

적용: activeTheme.lightColors  (isDarkMode = false)
      activeTheme.darkColors   (isDarkMode = true)
```

**테마 등록 시 두 색상셋은 필수**다. 라이트 모드 전용/다크 모드 전용 테마는 없다.
토글은 테마와 무관하게 동작하며, 테마 전환 후에도 현재 모드가 유지된다.

### 사전 작업: isDarkMode 토글 버튼 (테마 시스템 독립)
- `useThemeStore`에 `isDarkMode: boolean` + `toggleDarkMode()` 추가
- `App.tsx` 헤더에 Sun/Moon 아이콘 토글 버튼 추가
- 임시 구현: predefined `light` ↔ `dark` 테마 전환 (Phase 5 이후 교체)

---

## 현재 상태

| 영역 | 현재 구현 | 관련 파일 |
|------|----------|----------|
| 테마 색상 | SQLite `themes` 테이블, CRUD API 완비. 단, `colors` 단일 컬럼 (dual 미지원) | `server/src/theme.ts`, `server/src/db.ts` |
| 캐릭터 목록 | 서버 **하드코딩** `CHARACTER_IDS` 배열 | `server/src/index.ts:36` |
| GIF 매핑 | 클라이언트 **하드코딩** `GIF_CHARS` 맵 | `client/src/components/SpriteCanvas.tsx` |
| GIF 파일 | `client/public/sprites/{charId}/` 정적 파일 (Vite 서빙) | 4캐릭터 × 6상태 = 24 GIF |
| 파일 업로드 | **없음** | - |
| 테마 UI | ThemeManager.tsx, ThemePreview.tsx 존재하나 앱에 미연결 | dead code |

### GIF 파일 컨벤션
```
sprites/{charId}/{CHARNAME}_{STATUS}.gif
예) sprites/stark/STARK_FORCE.gif

STATUS: FORCE (필수) | FINISH | OFFLINE | READING | REST | THINK (선택)
```

### 스프라이트 필수/선택 정책

**FORCE만 필수**다. 나머지 5개는 선택사항이며, 없을 경우 FORCE로 폴백한다.

| STATUS | 필수 여부 | 폴백 | 사용 시점 |
|--------|---------|------|---------|
| FORCE | **필수** | — | WORKING, ORCHESTRATING |
| THINK | 선택 | FORCE | THINKING |
| REST | 선택 | FORCE | WAITING, BLOCKED |
| READING | 선택 | FORCE | READING |
| FINISH | 선택 | FORCE | DONE |
| OFFLINE | 선택 | FORCE | OFFLINE, ERROR |

→ GIF 1개만 있어도 테마 등록·동작 가능. 세분화는 원하는 만큼 선택적으로 추가.

---

## Phase 1: DB 스키마 확장
**규모: S (~150줄)**

### themes 테이블 마이그레이션 (기존 테이블 수정)

`colors TEXT` 단일 컬럼을 `light_colors` / `dark_colors`로 분리한다.
기존 데이터가 있는 경우를 위해 마이그레이션 처리:

```sql
-- 신규 컬럼 추가
ALTER TABLE themes ADD COLUMN light_colors TEXT;
ALTER TABLE themes ADD COLUMN dark_colors TEXT;

-- 기존 colors → light_colors로 복사 (dark_colors는 NULL 허용, 나중에 채워넣기)
UPDATE themes SET light_colors = colors WHERE light_colors IS NULL;
```

`colors` 컬럼은 하위 호환을 위해 당분간 유지하되, 신규 코드는 `light_colors`/`dark_colors`만 사용.

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
  status TEXT NOT NULL,        -- FORCE(필수) | FINISH | OFFLINE | READING | REST | THINK(선택)
  filePath TEXT NOT NULL,      -- uploads/ 기준 상대 경로
  fileSize INTEGER NOT NULL,
  mimeType TEXT DEFAULT 'image/gif',
  createdAt INTEGER NOT NULL,
  UNIQUE(characterId, status),
  FOREIGN KEY (characterId) REFERENCES theme_characters(id) ON DELETE CASCADE
);
-- FORCE 외 status는 없을 수 있음. 클라이언트는 없는 상태 → FORCE로 폴백.
```

### 수정 파일
- `apps/server/src/db.ts` — `initDatabase()`에 마이그레이션 + 신규 테이블 추가, CRUD 함수 추가
  - `insertThemeCharacter()`, `getThemeCharacters(themeId)`, `getAllCharacters()`
  - `insertCharacterSprite()`, `getCharacterSprites(characterId)`
- `apps/server/src/types.ts` — `ThemeCharacter`, `CharacterSprite` 인터페이스 추가
  - `Theme` 타입 업데이트: `colors` → `lightColors`, `darkColors`

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
  "theme": {
    "name": "dark-fantasy",
    "displayName": "Dark Fantasy",
    "lightColors": { ...24개 토큰 },   ← 필수
    "darkColors":  { ...24개 토큰 }    ← 필수
  },
  "characters": [
    { "characterId": "luna", "displayName": "Luna", "spritePrefix": "LUNA" }
  ]
}
luna_FORCE  (file): LUNA_FORCE.gif    ← 필수 (캐릭터당 최소 1개)
luna_THINK  (file): LUNA_THINK.gif    ← 선택
luna_REST   (file): LUNA_REST.gif     ← 선택
luna_FINISH (file): LUNA_FINISH.gif   ← 선택
luna_READING(file): LUNA_READING.gif  ← 선택
luna_OFFLINE(file): LUNA_OFFLINE.gif  ← 선택
```

### 폴백 로직 (서버)
- 업로드 검증: 캐릭터당 `*_FORCE` 파일이 없으면 400 에러
- 나머지 상태 파일이 없어도 정상 처리 (DB에 해당 row 없음)

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

### 신규 파일: `apps/client/src/hooks/useCharacters.ts`
- 서버 `GET /api/characters`에서 레지스트리 fetch
- WebSocket `characters_updated` 메시지로 실시간 갱신
- `getGifUrl(characterId, status)` 반환:
  - DB 등록 캐릭터 → `http://server:4000/uploads/sprites/...`
  - 내장 캐릭터 → `/sprites/...` (기존 경로 유지)
- **폴백 로직**: 요청한 status URL이 없으면(404) FORCE URL로 자동 대체
  ```typescript
  function getGifUrl(char: CharacterEntry, status: string): string {
    const sprites = char.sprites  // Map<status, filePath>
    return sprites[status] ?? sprites['FORCE']
  }
  ```

### 수정 파일
- `apps/client/src/components/SpriteCanvas.tsx` — `GIF_CHARS` 제거, `useCharacters()` 사용
- `apps/client/src/stores/useWebSocketStore.ts` — `characters_updated` 메시지 핸들링

---

## Phase 4: 테마 패키지 업로드 UI
**규모: M-L (~450줄)**

### 신규 파일: `apps/client/src/components/ThemePackageUpload.tsx`

3섹션 모달/패널:
1. **테마 메타데이터** — name, displayName, description, tags
2. **색상 입력** — 라이트 모드 / 다크 모드 탭 전환, 각 탭에 24개 색상 토큰 입력
   - 두 탭 모두 입력 완료해야 제출 가능 (둘 다 필수)
   - 라이트 탭에서 입력 후 "다크로 복사 + 반전 제안" 버튼으로 보조 가능
3. **캐릭터 정의** — "캐릭터 추가" 버튼, 각 캐릭터별
   - characterId, displayName 입력
   - GIF 드롭존 6개: FORCE는 **[필수]** 배지, 나머지 5개는 선택사항으로 표시
   - 선택 드롭존에 "없으면 FORCE로 대체됨" 안내 문구
   - 업로드된 GIF 썸네일 미리보기
   - 제출 버튼: FORCE 미업로드 시 비활성화
4. **제출** — FormData 구성 → `POST /api/themes/upload`

### 수정 파일
- `apps/client/src/App.tsx` — 업로드 UI 진입점 추가 (탭 또는 버튼)

---

## Phase 5: 활성 테마 적용
**규모: S-M (~150줄)**

### 서버 — `POST /api/themes/:id/activate`
- 서버 인메모리에 `activeThemeId` 저장
- 기존 에이전트들의 `characterId`를 해당 테마 캐릭터풀에서 재배정
- WebSocket으로 `agent_states` + `theme_activated` 브로드캐스트

### 클라이언트
- 테마 선택 시 색상(CSS 변수) + 캐릭터 동시 전환
- `isDarkMode` 상태에 따라 `lightColors` 또는 `darkColors` 선택 적용
- `useThemeStore.ts` 업데이트:
  - `toggleDarkMode()`의 임시 구현(predefined light/dark 전환) → 현재 활성 테마의 dual 색상셋 적용으로 교체
  - `activateTheme(themeId)` 추가: 색상 적용 시 `isDarkMode` 참조

---

## 의존성 순서

```
[사전] isDarkMode 토글 버튼 (독립)
           ↓ (Phase 5에서 연결)
Phase 1 (DB) → Phase 2 (Upload API) → Phase 3 (동적 캐릭터)
                                             ↓
                                      Phase 4 (Upload UI)
                                             ↓
                                      Phase 5 (활성 테마)
```

## 규모 요약

| Phase | 규모 | 신규 파일 | 수정 파일 | 코드량 |
|-------|------|-----------|----------|--------|
| 사전. isDarkMode 토글 | XS | 0 | 2 | ~30줄 |
| 1. DB 스키마 | S | 0 | 2 | ~150줄 |
| 2. Upload API | M | 1 `upload.ts` | 2 | ~300줄 |
| 3. 동적 캐릭터 | M | 1 `useCharacters.ts` | 2 | ~220줄 |
| 4. Upload UI | M-L | 1 `ThemePackageUpload.tsx` | 1 | ~450줄 |
| 5. 활성 테마 | S-M | 0 | 3 | ~150줄 |
| **합계** | **L** | **3** | **~10** | **~1,300줄** |

## 재사용 가능한 기존 코드

| 기존 코드 | 위치 | 재사용 용도 |
|----------|------|------------|
| `validateTheme()`, `sanitizeTheme()` | `server/src/theme.ts` | Phase 2 업로드 검증 (light/dark 각각 적용) |
| `generateId()` | `server/src/theme.ts` | character/sprite ID 생성 |
| `insertTheme()` | `server/src/db.ts` | 업로드 트랜잭션 내 호출 (light_colors/dark_colors 전달) |
| `STATUS_TO_GIF` 매핑 | `SpriteCanvas.tsx` | 파일명 컨벤션 유지 (변경 불필요) |
| WebSocket 메시지 패턴 | `useWebSocketStore.ts` | `characters_updated` 추가 |
| `useThemeStore` (isDarkMode) | `stores/useThemeStore.ts` | Phase 5에서 toggleDarkMode() 교체 |

## 마이그레이션 전략

기존 4개 캐릭터(frieren, fern, stark, himmel)는 `client/public/sprites/`에 **그대로 유지**.
DB 미등록 캐릭터는 기존 경로에서 서빙되므로 하위 호환성 보장.
나중에 DB로 옮기고 싶으면 별도 마이그레이션 스크립트 작성.

기존 `themes` 테이블의 `colors` 컬럼은 Phase 1 마이그레이션 후에도 유지.
`light_colors`가 채워진 레코드는 신규 방식으로, `colors`만 있는 레코드는 레거시로 처리.
