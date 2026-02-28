import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef, createRef } from 'react';
import { TransitionGroup, CSSTransition } from 'react-transition-group';
import { AgentColumn } from './AgentColumn';
import { FeedTooltip } from './FeedTooltip';
import type { TipState } from './FeedTooltip';
import type { AgentState, AgentStatus } from '../../stores/useWebSocketStore';
import type { HookEvent } from '../../types';
import { API_BASE_URL } from '../../config';
import '../../styles/agent-dashboard.css';

export type ViewMode = 'detail' | 'card';

interface Props {
  agentStates: Record<string, AgentState>;
  events: HookEvent[];
  viewMode: ViewMode;
}

const TOOLTIP_W = 320;

export function AgentDashboard({ agentStates, events, viewMode }: Props) {
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
  const prevStatusRef = useRef(new Map<string, string>());
  const prevPositionsRef = useRef(new Map<string, { x: number; y: number }>());

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

  // Watch mainAgent statuses → celebration (DONE 축하 애니메이션만)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const next = new Map(mainAgents.map(([k, a]) => [k, a.status] as [string, AgentStatus]));
    for (const [key, status] of next) {
      const prevStatus = prevStatusRef.current.get(key);
      if (!prevStatus) { prevStatusRef.current.set(key, status); continue; }
      if (status === prevStatus) continue;

      if (status === 'DONE') {
        setCelebratingKeys(s => new Set([...s, key]));
        const existing = celebrateTimersRef.current.get(key);
        if (existing) clearTimeout(existing);
        celebrateTimersRef.current.set(key, setTimeout(() => {
          setCelebratingKeys(s => { const ns = new Set(s); ns.delete(key); return ns; });
        }, 3500));
      }
      prevStatusRef.current.set(key, status);
    }
    prevStatusRef.current = next;
  }, [mainAgentStatusStr]);

  // FLIP animation for card view reordering
  useLayoutEffect(() => {
    if (viewMode !== 'card') {
      // Clear any in-progress FLIP transforms when leaving card view
      for (const [, colRef] of colRefsRef.current) {
        const el = colRef.current;
        if (!el) continue;
        el.style.transition = '';
        el.style.transform = '';
      }
      prevPositionsRef.current.clear();
      return;
    }

    // Step 1: clear any ongoing FLIP transforms so we read true grid positions
    for (const [, colRef] of colRefsRef.current) {
      const el = colRef.current;
      if (!el) continue;
      el.style.transition = 'none';
      el.style.transform = '';
    }

    // Force reflow to commit the cleared transforms
    let firstEl: HTMLElement | null = null;
    for (const [, colRef] of colRefsRef.current) {
      if (colRef.current) { firstEl = colRef.current; break; }
    }
    if (firstEl) firstEl.getBoundingClientRect();

    // Step 2: read new (true) positions and compute FLIP offsets
    const newPositions = new Map<string, { x: number; y: number }>();
    const toAnimate: Array<HTMLElement> = [];

    for (const [key, colRef] of colRefsRef.current) {
      const el = colRef.current;
      if (!el) continue;
      // Skip elements that are entering or exiting (TransitionGroup handles those)
      if (el.classList.contains('agent-col-enter') || el.classList.contains('agent-col-exit')) continue;

      const rect = el.getBoundingClientRect();
      newPositions.set(key, { x: rect.left, y: rect.top });

      const prev = prevPositionsRef.current.get(key);
      if (prev && (Math.abs(prev.x - rect.left) > 1 || Math.abs(prev.y - rect.top) > 1)) {
        const dx = prev.x - rect.left;
        const dy = prev.y - rect.top;
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        toAnimate.push(el);
      }
    }

    if (toAnimate.length > 0) {
      // Force reflow to commit the inverted transforms before animating
      if (firstEl) firstEl.getBoundingClientRect();

      // Step 3: play — animate each element to its final position
      for (const el of toAnimate) {
        el.style.transition = 'transform 0.38s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        el.style.transform = '';
        el.addEventListener('transitionend', () => { el.style.transition = ''; }, { once: true });
      }
    }

    prevPositionsRef.current = newPositions;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainAgentKeyStr, viewMode]);

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
        <TransitionGroup component="div" className={`columns-container${viewMode === 'card' ? ' grid-mode' : ''}`}>
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
                  viewMode={viewMode}
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
