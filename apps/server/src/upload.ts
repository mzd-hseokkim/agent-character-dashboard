import { mkdir, rm } from 'node:fs/promises';
import { insertTheme, insertThemeCharacter, insertCharacterSprite } from './db';
import type { Theme, ThemeCharacter, CharacterSprite } from './types';

const UPLOADS_BASE = './uploads/sprites';
const VALID_STATUSES = ['FORCE', 'FINISH', 'OFFLINE', 'READING', 'REST', 'THINK'] as const;
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB per file

const REQUIRED_COLOR_TOKENS = [
  'primary', 'primaryHover', 'primaryLight', 'primaryDark',
  'bgPrimary', 'bgSecondary', 'bgTertiary', 'bgQuaternary',
  'textPrimary', 'textSecondary', 'textTertiary', 'textQuaternary',
  'borderPrimary', 'borderSecondary', 'borderTertiary',
  'accentSuccess', 'accentWarning', 'accentError', 'accentInfo',
  'shadow', 'shadowLg', 'hoverBg', 'activeBg', 'focusRing',
] as const;

function generateId(): string {
  return Math.random().toString(36).substr(2, 16);
}

function isValidGif(buffer: Uint8Array): boolean {
  if (buffer.length < 6) return false;
  const header = new TextDecoder('utf-8').decode(buffer.subarray(0, 6));
  return header === 'GIF87a' || header === 'GIF89a';
}

function validateColors(colors: unknown): colors is Record<string, string> {
  if (!colors || typeof colors !== 'object' || Array.isArray(colors)) return false;
  const c = colors as Record<string, unknown>;
  return REQUIRED_COLOR_TOKENS.every(key => {
    const v = c[key];
    return typeof v === 'string' && v.length > 0;
  });
}

function errResp(msg: string, status = 400): Response {
  return new Response(JSON.stringify({ success: false, error: msg }), {
    status,
    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json; charset=utf-8' },
  });
}

interface FileEntry { buffer: Uint8Array; size: number; }

export async function handleThemeUpload(req: Request): Promise<Response> {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json; charset=utf-8',
  };

  // 1. multipart 파싱
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let formData: any;
  try {
    formData = await req.formData();
  } catch {
    return errResp('Invalid multipart form data');
  }

  // 2. metadata 필드 파싱
  const metadataRaw = formData.get('metadata');
  if (typeof metadataRaw !== 'string') return errResp('Missing metadata field');

  let metadata: any;
  try {
    metadata = JSON.parse(metadataRaw);
  } catch {
    return errResp('metadata must be valid JSON');
  }

  const { theme: themeMeta, characters: charsMeta } = metadata ?? {};

  // 3. 테마 메타데이터 검증
  if (!themeMeta?.name || !themeMeta?.displayName) {
    return errResp('theme.name and theme.displayName are required');
  }
  if (!/^[a-z0-9-_]+$/.test(themeMeta.name)) {
    return errResp('theme.name must be lowercase alphanumeric, hyphens, underscores only');
  }
  if (!validateColors(themeMeta.lightColors)) {
    return errResp('theme.lightColors must contain all 24 color tokens');
  }
  if (!validateColors(themeMeta.darkColors)) {
    return errResp('theme.darkColors must contain all 24 color tokens');
  }
  if (!Array.isArray(charsMeta) || charsMeta.length === 0) {
    return errResp('At least one character is required');
  }

  // 4. 캐릭터 구조 검증
  for (const char of charsMeta) {
    if (!char?.characterId || !char?.displayName || !char?.spritePrefix) {
      return errResp('Character missing required fields: characterId, displayName, spritePrefix');
    }
    if (!/^[a-z0-9_-]+$/.test(char.characterId)) {
      return errResp(`characterId must be lowercase alphanumeric: ${char.characterId}`);
    }
  }

  // 5. GIF 파일 읽기 + 검증 (DB/디스크 작업 전에 전부 확인)
  const fileBuffers = new Map<string, FileEntry>();

  for (const char of charsMeta) {
    for (const status of VALID_STATUSES) {
      const key = `${char.characterId}_${status}`;
      const file = formData.get(key);
      if (!file || !(file instanceof File)) continue;

      if (file.size > MAX_FILE_SIZE) {
        return errResp(`File ${key} exceeds 2MB limit (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
      }
      const buffer = new Uint8Array(await file.arrayBuffer());
      if (!isValidGif(buffer)) {
        return errResp(`File ${key} is not a valid GIF (invalid magic bytes)`);
      }
      fileBuffers.set(key, { buffer, size: file.size });
    }

    // FORCE는 캐릭터당 필수
    if (!fileBuffers.has(`${char.characterId}_FORCE`)) {
      return errResp(`Missing required FORCE sprite for character: ${char.characterId}`);
    }
  }

  // 6. DB + 디스크 저장
  const themeId = generateId();
  const now = Date.now();

  const theme: Theme = {
    id: themeId,
    name: themeMeta.name as string,
    displayName: themeMeta.displayName as string,
    description: themeMeta.description?.toString().trim() || undefined,
    colors: themeMeta.lightColors as any,   // backward compat
    lightColors: themeMeta.lightColors as any,
    darkColors: themeMeta.darkColors as any,
    isPublic: Boolean(themeMeta.isPublic),
    authorId: themeMeta.authorId?.toString() || undefined,
    authorName: themeMeta.authorName?.toString() || undefined,
    createdAt: now,
    updatedAt: now,
    tags: Array.isArray(themeMeta.tags)
      ? themeMeta.tags.filter((t: any) => typeof t === 'string')
      : [],
    downloadCount: 0,
    rating: 0,
    ratingCount: 0,
  };

  try {
    insertTheme(theme);
  } catch (e: any) {
    if (e?.message?.includes('UNIQUE')) {
      return errResp(`Theme name "${theme.name}" already exists`, 409);
    }
    throw e;
  }

  const savedCharacters: ThemeCharacter[] = [];
  const savedSprites: CharacterSprite[] = [];

  for (let i = 0; i < charsMeta.length; i++) {
    const char = charsMeta[i];
    const charDbId = generateId();
    const prefix = char.spritePrefix.toString().toUpperCase();

    const themeChar: ThemeCharacter = {
      id: charDbId,
      themeId,
      characterId: char.characterId,
      displayName: char.displayName,
      spritePrefix: prefix,
      sortOrder: i,
      createdAt: now,
    };
    insertThemeCharacter(themeChar);
    savedCharacters.push(themeChar);

    // 스프라이트 디렉토리 생성
    const charDir = `${UPLOADS_BASE}/${themeId}/${char.characterId}`;
    await mkdir(charDir, { recursive: true });

    for (const status of VALID_STATUSES) {
      const key = `${char.characterId}_${status}`;
      const entry = fileBuffers.get(key);
      if (!entry) continue;

      const filename = `${prefix}_${status}.gif`;
      await Bun.write(`${charDir}/${filename}`, entry.buffer);

      const sprite: CharacterSprite = {
        id: generateId(),
        characterId: charDbId,
        status,
        filePath: `sprites/${themeId}/${char.characterId}/${filename}`,
        fileSize: entry.size,
        mimeType: 'image/gif',
        createdAt: now,
      };
      insertCharacterSprite(sprite);
      savedSprites.push(sprite);
    }
  }

  return new Response(JSON.stringify({
    success: true,
    message: 'Theme package uploaded successfully',
    data: { theme, characters: savedCharacters, sprites: savedSprites },
  }), { status: 201, headers: CORS });
}

/** 기존 테마에 캐릭터 한 명 추가 */
export async function handleAddThemeCharacter(req: Request, themeId: string): Promise<Response> {
  const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json; charset=utf-8' };

  let formData: any;
  try { formData = await req.formData(); } catch { return errResp('Invalid multipart form data'); }

  const metadataRaw = formData.get('metadata');
  if (typeof metadataRaw !== 'string') return errResp('Missing metadata field');

  let char: any;
  try { char = JSON.parse(metadataRaw); } catch { return errResp('metadata must be valid JSON'); }

  if (!char?.characterId || !char?.displayName || !char?.spritePrefix) {
    return errResp('Missing required fields: characterId, displayName, spritePrefix');
  }
  if (!/^[a-z0-9_-]+$/.test(char.characterId)) {
    return errResp('characterId must be lowercase alphanumeric, hyphens, underscores');
  }

  const fileBuffers = new Map<string, { buffer: Uint8Array; size: number }>();
  for (const status of VALID_STATUSES) {
    const key = `${char.characterId}_${status}`;
    const file = formData.get(key);
    if (!file || !(file instanceof File)) continue;
    if (file.size > MAX_FILE_SIZE) return errResp(`File ${key} exceeds 2MB limit`);
    const buffer = new Uint8Array(await file.arrayBuffer());
    if (!isValidGif(buffer)) return errResp(`File ${key} is not a valid GIF`);
    fileBuffers.set(key, { buffer, size: file.size });
  }

  if (!fileBuffers.has(`${char.characterId}_FORCE`)) {
    return errResp('Missing required FORCE sprite');
  }

  const now = Date.now();
  const charDbId = generateId();
  const prefix = char.spritePrefix.toString().toUpperCase();

  const themeChar: ThemeCharacter = {
    id: charDbId,
    themeId,
    characterId: char.characterId,
    displayName: char.displayName,
    spritePrefix: prefix,
    sortOrder: 999,
    createdAt: now,
  };

  try {
    insertThemeCharacter(themeChar);
  } catch (e: any) {
    if (e?.message?.includes('UNIQUE')) {
      return errResp(`Character "${char.characterId}" already exists in this theme`, 409);
    }
    throw e;
  }

  const charDir = `${UPLOADS_BASE}/${themeId}/${char.characterId}`;
  await mkdir(charDir, { recursive: true });

  const savedSprites: CharacterSprite[] = [];
  for (const status of VALID_STATUSES) {
    const key = `${char.characterId}_${status}`;
    const entry = fileBuffers.get(key);
    if (!entry) continue;

    const filename = `${prefix}_${status}.gif`;
    await Bun.write(`${charDir}/${filename}`, entry.buffer);

    const sprite: CharacterSprite = {
      id: generateId(),
      characterId: charDbId,
      status,
      filePath: `sprites/${themeId}/${char.characterId}/${filename}`,
      fileSize: entry.size,
      mimeType: 'image/gif',
      createdAt: now,
    };
    insertCharacterSprite(sprite);
    savedSprites.push(sprite);
  }

  return new Response(JSON.stringify({
    success: true,
    message: 'Character added successfully',
    data: { character: themeChar, sprites: savedSprites },
  }), { status: 201, headers: CORS });
}

/** 캐릭터 디렉토리 삭제 */
export async function deleteThemeCharacterFiles(themeId: string, characterId: string): Promise<void> {
  await rm(`${UPLOADS_BASE}/${themeId}/${characterId}`, { recursive: true, force: true });
}
