import { create } from 'zustand';
import { useEffect } from 'react';
import type { HookEvent, WebSocketMessage } from '../types/index';

export type AgentStatus = 'WORKING' | 'THINKING' | 'WAITING' | 'DONE' | 'ERROR' | 'BLOCKED' | 'OFFLINE' | 'ORCHESTRATING' | 'READING';

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
  clearEvents: () => void;
  _setConnected: (v: boolean) => void;
  _setError: (v: string | null) => void;
  _setEvents: (events: HookEvent[]) => void;
  _pushEvent: (event: HookEvent) => void;
  _setAgentStates: (states: Record<string, AgentState>) => void;
}

const MAX_EVENTS = parseInt(import.meta.env.VITE_MAX_EVENTS_TO_DISPLAY || '300');

export const useWebSocketStore = create<WebSocketStore>((set, get) => ({
  events: [],
  agentStates: {},
  isConnected: false,
  error: null,

  clearEvents: () => set({ events: [] }),

  _setConnected: (v) => set({ isConnected: v }),
  _setError: (v) => set({ error: v }),
  _setEvents: (events) => set({ events }),
  _setAgentStates: (states) => set({ agentStates: states }),

  _pushEvent: (newEvent) => {
    const { events } = get();
    // Update in-place if event with same id exists (HITL status update)
    if (newEvent.id !== undefined) {
      const idx = events.findIndex(e => e.id === newEvent.id);
      if (idx !== -1) {
        const updated = [...events];
        updated[idx] = newEvent;
        set({ events: updated });
        return;
      }
    }
    let updated = [...events, newEvent];
    if (updated.length > MAX_EVENTS) {
      updated = updated.slice(updated.length - MAX_EVENTS + 10);
    }
    set({ events: updated });
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
