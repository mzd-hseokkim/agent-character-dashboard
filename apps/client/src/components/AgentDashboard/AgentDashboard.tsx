import { useState, useEffect, useMemo, useCallback, useRef, createRef } from 'react';
import { TransitionGroup, CSSTransition } from 'react-transition-group';
import { useSoundStore } from '../../stores/useSoundStore';
import { AgentColumn } from './AgentColumn';
import { FeedTooltip } from './FeedTooltip';
import type { TipState } from './FeedTooltip';
import type { AgentState, AgentStatus } from '../../stores/useWebSocketStore';
import type { HookEvent } from '../../types';
import { API_BASE_URL } from '../../config';
import '../../styles/agent-dashboard.css';

interface Props {
  agentStates: Record<string, AgentState>;
  events: HookEvent[];
}

const TOOLTIP_W = 320;

export function AgentDashboard({ agentStates, events }: Props) {
  const { playSound } = useSoundStore();
  const [tick, setTick] = useState(0);
  const [celebratingKeys, setCelebratingKeys] = useState(new Set<string>());
  const [tip, setTip] = useState<TipState>({ visible: false, x: 0, y: 0, ev: null });

  const celebrateTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const colRefsRef = useRef(new Map<string, React.RefObject<HTMLDivElement | null>>());
  const getColRef = (key: string): React.RefObject<HTMLDivElement | null> => {
    if (!colRefsRef.current.has(key)) {
      colRefsRef.current.set(key, createRef<HTMLDivElement>());
    }
    return colRefsRef.current.get(key)!;
  };
  const prevEventsLengthRef = useRef(0);
  const prevAgentKeysRef = useRef<string[]>([]);
  const prevStatusesRef = useRef(new Map<string, string>());

  // Tick timer + cleanup
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => {
      clearInterval(timer);
      celebrateTimersRef.current.forEach(t => clearTimeout(t));
    };
  }, []);

  // Main agents: non-subagent, sorted by lastUpdated desc
  const mainAgents = useMemo(() =>
    Object.entries(agentStates)
      .filter(([, a]) => !a.isSubagent)
      .sort(([, a], [, b]) => b.lastUpdated - a.lastUpdated),
    [agentStates]
  );

  const mainAgentKeyStr = mainAgents.map(([k]) => k).join(',');
  const mainAgentStatusStr = mainAgents.map(([k, a]) => `${k}:${a.status}`).join(',');

  // Watch events length → detect SessionStart
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const prev = prevEventsLengthRef.current;
    prevEventsLengthRef.current = events.length;
    if (!prev || events.length <= prev) return;
    const newEv = events[events.length - 1];
    if (newEv?.hook_event_type === 'SessionStart') playSound('session_start');
  }, [events.length]);

  // Watch mainAgent keys → detect new agent appearance
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const prev = prevAgentKeysRef.current;
    const next = mainAgents.map(([k]) => k);
    prevAgentKeysRef.current = next;
    if (!prev.length) return;
    const prevSet = new Set(prev);
    next.forEach(k => { if (!prevSet.has(k)) playSound('agent_appear'); });
  }, [mainAgentKeyStr]);

  // Watch mainAgent statuses → celebration + sounds
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const next = new Map(mainAgents.map(([k, a]) => [k, a.status] as [string, AgentStatus]));
    for (const [key, status] of next) {
      const prevStatus = prevStatusesRef.current.get(key);
      if (!prevStatus) { prevStatusesRef.current.set(key, status); continue; }
      if (status === prevStatus) continue;

      if (status === 'DONE') {
        setCelebratingKeys(s => new Set([...s, key]));
        const existing = celebrateTimersRef.current.get(key);
        if (existing) clearTimeout(existing);
        celebrateTimersRef.current.set(key, setTimeout(() => {
          setCelebratingKeys(s => { const ns = new Set(s); ns.delete(key); return ns; });
        }, 3500));
        playSound('done');
      } else if (status === 'ERROR') {
        playSound('error');
      } else if (status === 'BLOCKED') {
        playSound('blocked');
      } else if (status === 'WORKING') {
        const fromIdle = prevStatus === 'WAITING' || prevStatus === 'OFFLINE' || prevStatus === 'DONE';
        if (fromIdle) playSound('reentry');
        else if (prevStatus !== 'ORCHESTRATING') playSound('work_start');
      }
      prevStatusesRef.current.set(key, status);
    }
    prevStatusesRef.current = next;
  }, [mainAgentStatusStr]);

  const handleMouseEnterFeedItem = useCallback((el: HTMLElement, ev: HookEvent) => {
    const inp = ev.payload?.tool_input;
    const p = ev.payload;
    const hasExtra =
      (inp && Object.keys(inp as Record<string, unknown>).length > 0) ||
      ev.summary ||
      p?.tool_response ||
      p?.prompt ||
      p?.message ||
      p?.last_assistant_message;
    if (!hasExtra) { setTip(t => ({ ...t, visible: false })); return; }

    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight;
    let x = rect.left - TOOLTIP_W - 8;
    if (x < 8) x = rect.right + 8;
    const y = Math.min(rect.top, vh - 240);
    setTip({ visible: true, x, y, ev });
  }, []);

  const handleMouseLeaveFeedItem = useCallback(() => {
    setTip({ visible: false, x: 0, y: 0, ev: null });
  }, []);

  const handleCycleCharacter = useCallback((agentKey: string) => {
    fetch(`${API_BASE_URL}/agents/cycle-character`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentKey }),
    });
  }, []);

  return (
    <div className="console-layout">
      {mainAgents.length === 0 ? (
        <div className="empty-state">
          <div className="empty-text">에이전트 연결 대기 중...</div>
        </div>
      ) : (
        <TransitionGroup component="div" className="columns-container">
          {mainAgents.map(([key, agent]) => {
            const nodeRef = getColRef(key);
            return (
              <CSSTransition key={key} nodeRef={nodeRef as React.RefObject<HTMLDivElement>} timeout={{ enter: 720, exit: 580 }} classNames="agent-col">
                <AgentColumn
                  ref={nodeRef}
                  agentKey={key}
                  agent={agent}
                  events={events}
                  tick={tick}
                  celebrating={celebratingKeys.has(key)}
                  onCycleCharacter={() => handleCycleCharacter(key)}
                  onMouseEnterFeedItem={handleMouseEnterFeedItem}
                  onMouseLeaveFeedItem={handleMouseLeaveFeedItem}
                />
              </CSSTransition>
            );
          })}
        </TransitionGroup>
      )}
      <FeedTooltip tip={tip} />
    </div>
  );
}
