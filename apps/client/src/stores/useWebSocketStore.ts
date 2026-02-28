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
      if (newEvent.humanInTheLoop && newEvent.humanInTheLoopStatus?.status === 'pending') {
        playSound('hitl_request');
      } else {
        playSound(newEvent.hook_event_type === 'SessionStart' ? 'session_start' : 'log_tick');
      }
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
const RECONNECT_INTERVAL = 3000;
const HEARTBEAT_INTERVAL = 15000; // 15초마다 ping
const HEARTBEAT_TIMEOUT = 5000;   // pong 응답 대기 시간

export function useWebSocketConnection(url: string) {
  useEffect(() => {
    const store = useWebSocketStore.getState();
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
    let heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const clearHeartbeat = () => {
      if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
      if (heartbeatTimeout) { clearTimeout(heartbeatTimeout); heartbeatTimeout = null; }
    };

    const scheduleReconnect = () => {
      if (stopped || reconnectTimeout) return;
      reconnectTimeout = setTimeout(() => {
        reconnectTimeout = null;
        console.log('Attempting to reconnect...');
        connect();
      }, RECONNECT_INTERVAL);
    };

    const connect = () => {
      if (stopped) return;
      try {
        ws = new WebSocket(url);

        ws.onopen = () => {
          console.log('WebSocket connected');
          store._setConnected(true);
          store._setError(null);

          // Heartbeat: 서버가 pong을 못 보내면 좀비 연결로 판단하고 강제 종료
          heartbeatInterval = setInterval(() => {
            if (!ws || ws.readyState !== WebSocket.OPEN) return;
            try {
              ws.send(JSON.stringify({ type: 'ping' }));
            } catch {
              // send 실패 시 연결이 끊긴 것으로 간주
              clearHeartbeat();
              ws?.close();
              return;
            }
            heartbeatTimeout = setTimeout(() => {
              console.warn('WebSocket heartbeat timeout — forcing reconnect');
              clearHeartbeat();
              ws?.close();
            }, HEARTBEAT_TIMEOUT);
          }, HEARTBEAT_INTERVAL);
        };

        ws.onmessage = (event) => {
          // pong 수신 시 타임아웃 해제
          try {
            const raw = JSON.parse(event.data);
            if (raw?.type === 'pong') {
              if (heartbeatTimeout) { clearTimeout(heartbeatTimeout); heartbeatTimeout = null; }
              return;
            }
          } catch { /* 파싱 실패는 아래에서 처리 */ }

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
          clearHeartbeat();
          store._setConnected(false);
          scheduleReconnect();
        };
      } catch (err) {
        console.error('Failed to connect:', err);
        store._setError('Failed to connect to server');
        scheduleReconnect(); // catch 시에도 재연결 시도
      }
    };

    connect();

    return () => {
      stopped = true;
      clearHeartbeat();
      if (reconnectTimeout) { clearTimeout(reconnectTimeout); reconnectTimeout = null; }
      if (ws) {
        ws.onclose = null; // prevent reconnect on intentional close
        ws.close();
        ws = null;
      }
    };
  }, [url]);
}
