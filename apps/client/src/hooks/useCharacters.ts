import { useEffect, useCallback } from 'react';
import { useWebSocketStore } from '../stores/useWebSocketStore';
import type { AgentStatus } from '../stores/useWebSocketStore';
import { API_BASE_URL } from '../config';

// STATUS → sprite suffix 매핑 (SpriteCanvas의 STATUS_TO_GIF와 동일)
const STATUS_TO_SPRITE: Record<AgentStatus, string> = {
  WORKING:       'FORCE',
  ORCHESTRATING: 'FORCE',
  THINKING:      'THINK',
  READING:       'READING',
  WAITING:       'REST',
  BLOCKED:       'REST',
  DONE:          'FINISH',
  ERROR:         'OFFLINE',
  OFFLINE:       'OFFLINE',
};

// 내장 GIF 캐릭터 (DB 미등록 상태에서도 /sprites/ 경로로 서빙)
const BUILTIN_GIF_CHARS: Record<string, string> = {
  frieren: 'FRIEREN',
  fern:    'FERN',
  stark:   'STARK',
  himmel:  'HIMMEL',
};

/** DB에서 캐릭터 목록을 fetch해 Zustand store에 저장 */
export async function fetchCharacters(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/characters`);
    const json = await res.json();
    if (json.success) {
      useWebSocketStore.getState()._setCharacters(json.data);
    }
  } catch (err) {
    console.error('[useCharacters] Failed to fetch characters:', err);
  }
}

/**
 * App 루트에서 한 번 호출.
 * 마운트 시 fetch, characters_updated 수신 시 재fetch.
 */
export function useCharactersInit(): void {
  const version = useWebSocketStore(s => s.charactersVersion);
  useEffect(() => {
    fetchCharacters();
  }, [version]);
}

/**
 * characterId + AgentStatus → GIF URL (string) or null (canvas fallback).
 *
 * 우선순위:
 * 1. DB 등록 캐릭터 → 업로드된 스프라이트 URL (FORCE 폴백 포함)
 * 2. 내장 GIF 캐릭터 → /sprites/{charId}/{PREFIX}_{STATUS}.gif
 * 3. null → SpriteCanvas의 canvas 픽셀아트 렌더링
 */
export function useGetGifUrl() {
  const characters = useWebSocketStore(s => s.characters);

  return useCallback(
    (characterId: string, status: AgentStatus): string | null => {
      const spriteKey = STATUS_TO_SPRITE[status] ?? 'FORCE';

      // 1. DB 등록 캐릭터
      const dbChar = characters.find(c => c.characterId === characterId);
      if (dbChar) {
        return dbChar.sprites[spriteKey] ?? dbChar.sprites['FORCE'] ?? null;
      }

      // 2. 내장 GIF 캐릭터
      const prefix = BUILTIN_GIF_CHARS[characterId];
      if (prefix) {
        return `/sprites/${characterId}/${prefix}_${spriteKey}.gif`;
      }

      // 3. canvas fallback (char_a-e 등)
      return null;
    },
    [characters],
  );
}
