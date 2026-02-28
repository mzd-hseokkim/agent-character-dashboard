import { create } from 'zustand';
import { useEffect } from 'react';
import type { HookEvent, WebSocketMessage } from '../types/index';
import { useSoundStore } from './useSoundStore';

export type AgentStatus = 'WORKING' | 'THINKING' | 'WAITING' | 'DONE' | 'ERROR' | 'BLOCKED' | 'OFFLINE' | 'ORCHESTRATING' | 'READING';

export interface CharacterEntry {
  id: string;
  characterId: string;
  displayName: string;
  spritePrefix: string;
  sprites: Record<string, string>; // status → URL
}

export interface ActiveTheme {
  id: string;
  lightColors: Record<string, string>;
  darkColors: Record<string, string>;
}

export interface AgentState {
  status: AgentStatus;
  lastEvent: string;
  lastUpdated: number;
  characterId: string;
  subagentCount: number;
  isSubagent: boolean;
  description?: string;
}

interface WebSocketStore {
  events: HookEvent[];
  agentStates: Record<string, AgentState>;
  isConnected: boolean;
  error: string | null;
  characters: CharacterEntry[];
  charactersVersion: number;
  activeTheme: ActiveTheme | null;
  clearEvents: () => void;
  _setConnected: (v: boolean) => void;
  _setError: (v: string | null) => void;
  _setEvents: (events: HookEvent[]) => void;
  _pushEvent: (event: HookEvent) => void;
  _setAgentStates: (states: Record<string, AgentState>) => void;
  _setCharacters: (chars: CharacterEntry[]) => void;
  _bumpCharactersVersion: () => void;
  _setActiveTheme: (theme: ActiveTheme | null) => void;
}

const MAX_EVENTS = parseInt(import.meta.env.VITE_MAX_EVENTS_TO_DISPLAY || '300');

function sound() {
  return useSoundStore.getState();
}

export const useWebSocketStore = create<WebSocketStore>((set, get) => ({
  events: [],
  agentStates: {},
  isConnected: false,
  error: null,
  characters: [],
  charactersVersion: 0,
  activeTheme: null,

  clearEvents: () => set({ events: [] }),

  _setConnected: (v) => set({ isConnected: v }),
  _setError: (v) => set({ error: v }),
  _setEvents: (events) => set({ events }),
  _setCharacters: (chars) => set({ characters: chars }),
  _bumpCharactersVersion: () => set(s => ({ charactersVersion: s.charactersVersion + 1 })),
  _setActiveTheme: (theme) => set({ activeTheme: theme }),

  _pushEvent: (newEvent) => {
    const { events } = get();
    // Update in-place if event with same id exists (HITL status update)
    if (newEvent.id !== undefined) {
      const idx = events.findIndex(e => e.id === newEvent.id);
      if (idx !== -1) {
        const updated = [...events];
        updated[idx] = newEvent;
        set({ events: updated });
        return; // 인플레이스 업데이트는 소리 없음
      }
    }
    let updated = [...events, newEvent];
    if (updated.length > MAX_EVENTS) {
      updated = updated.slice(updated.length - MAX_EVENTS + 10);
    }
    set({ events: updated });

    // React 렌더링 사이클 밖에서 직접 트리거 → 배칭 영향 없음
    const { isMuted, playSound } = sound();
    if (!isMuted) {
      playSound(newEvent.hook_event_type === 'SessionStart' ? 'session_start' : 'log_tick');
    }
  },

  _setAgentStates: (states) => {
    const prev = get().agentStates;
    set({ agentStates: states });

    const { isMuted, playSound } = sound();
    if (isMuted) return;

    const isInitialLoad = Object.keys(prev).length === 0;

    for (const [key, agent] of Object.entries(states)) {
      if (agent.isSubagent) continue;
      const prevAgent = prev[key];

      if (!prevAgent) {
        if (!isInitialLoad) playSound('agent_appear');
        continue;
      }
      if (agent.status === prevAgent.status) continue;

      if (agent.status === 'DONE') playSound('done');
      else if (agent.status === 'ERROR') playSound('error');
      else if (agent.status === 'BLOCKED') playSound('blocked');
      else if (agent.status === 'WORKING') {
        const ps = prevAgent.status;
        if (ps === 'WAITING' || ps === 'OFFLINE' || ps === 'DONE') playSound('reentry');
        else if (ps !== 'ORCHESTRATING') playSound('work_start');
      }
    }
  },
}));

/**
 * Hook that manages the WebSocket connection lifecycle.
 * Call this once at the root component level.
 */
export function useWebSocketConnection(url: string) {
  useEffect(() => {
    const store = useWebSocketStore.getState();
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      try {
        ws = new WebSocket(url);

        ws.onopen = () => {
          console.log('WebSocket connected');
          store._setConnected(true);
          store._setError(null);
        };

        ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            const s = useWebSocketStore.getState();

            if (message.type === 'initial') {
              const initialEvents = Array.isArray(message.data) ? message.data : [];
              s._setEvents(initialEvents.slice(-MAX_EVENTS));
            } else if (message.type === 'event') {
              s._pushEvent(message.data as HookEvent);
            } else if (message.type === 'agent_states') {
              s._setAgentStates(message.data as unknown as Record<string, AgentState>);
            } else if (message.type === 'characters_updated') {
              s._bumpCharactersVersion();
            } else if (message.type === 'theme_activated') {
              const d = message.data as any;
              s._setActiveTheme({ id: d.themeId ?? d.id, lightColors: d.lightColors, darkColors: d.darkColors });
            }
          } catch (err) {
            console.error('Failed to parse WebSocket message:', err);
          }
        };

        ws.onerror = (err) => {
          console.error('WebSocket error:', err);
          store._setError('WebSocket connection error');
        };

        ws.onclose = () => {
          console.log('WebSocket disconnected');
          store._setConnected(false);
          if (!stopped) {
            reconnectTimeout = setTimeout(() => {
              console.log('Attempting to reconnect...');
              connect();
            }, 3000);
          }
        };
      } catch (err) {
        console.error('Failed to connect:', err);
        store._setError('Failed to connect to server');
      }
    };

    connect();

    return () => {
      stopped = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) {
        ws.onclose = null; // prevent reconnect on intentional close
        ws.close();
        ws = null;
      }
    };
  }, [url]);
}
