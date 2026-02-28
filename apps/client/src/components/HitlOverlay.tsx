import { useState, useEffect, useMemo, useRef, createRef, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { TransitionGroup, CSSTransition } from 'react-transition-group';
import { Key, MessageSquare, List, Check, X, Send } from 'lucide-react';
import type { HookEvent, HumanInTheLoopResponse } from '../types';
import { API_BASE_URL } from '../config';
import { useSoundStore } from '../stores/useSoundStore';
import '../styles/hitl.css';

interface Props {
  events: HookEvent[];
}

function HitlIcon({ ev }: { ev: HookEvent }) {
  const t = ev.humanInTheLoop!.type;
  if (t === 'permission') return <Key size={10} />;
  if (t === 'question') return <MessageSquare size={10} />;
  return <List size={10} />;
}

function hitlLabel(ev: HookEvent): string {
  const t = ev.humanInTheLoop!.type;
  if (t === 'permission') return '허가 요청';
  if (t === 'question') return '질문';
  return '선택';
}

function agentKey(ev: HookEvent): string {
  return `${ev.source_app}:${ev.session_id.slice(0, 8)}`;
}

async function post(ev: HookEvent, payload: Partial<HumanInTheLoopResponse>) {
  try {
    await fetch(`${API_BASE_URL}/events/${ev.id}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, hookEvent: ev }),
    });
  } catch (e) {
    console.error('[HITL] Failed to send response:', e);
  }
}

interface CardProps {
  ev: HookEvent;
  tick: number;
  inputValue: string;
  onInputChange: (val: string) => void;
  onRespondPermission: (allow: boolean) => void;
  onRespondQuestion: () => void;
  onRespondChoice: (choice: string) => void;
}

const HitlCard = forwardRef<HTMLDivElement, CardProps>(function HitlCard(
  { ev, tick, inputValue, onInputChange, onRespondPermission, onRespondQuestion, onRespondChoice }, ref
) {
  const timeLeft = () => {
    void tick;
    const timeout = ev.humanInTheLoop?.timeout;
    if (!timeout || !ev.timestamp) return 0;
    const elapsed = Math.floor((Date.now() - ev.timestamp) / 1000);
    return Math.max(0, timeout - elapsed);
  };
  return (
    <div ref={ref} className={`hitl-card ${ev.humanInTheLoop!.type}`}>
      <div className="hitl-hdr">
        <span className="hitl-badge">
          <HitlIcon ev={ev} />
          {hitlLabel(ev)}
        </span>
        <span className="hitl-agent">{agentKey(ev)}</span>
        {timeLeft() > 0 && (
          <span className={`hitl-countdown${timeLeft() < 20 ? ' urgent' : ''}`}>
            {timeLeft()}s
          </span>
        )}
      </div>
      <div className="hitl-body">
        <pre className="hitl-question">{ev.humanInTheLoop!.question}</pre>
      </div>
      <div className="hitl-actions">
        {ev.humanInTheLoop!.type === 'permission' && (
          <>
            <button className="hitl-btn allow" onClick={() => onRespondPermission(true)}>
              <Check size={12} /> 허용
            </button>
            <button className="hitl-btn deny" onClick={() => onRespondPermission(false)}>
              <X size={12} /> 거부
            </button>
          </>
        )}
        {ev.humanInTheLoop!.type === 'question' && (
          <>
            <input
              className="hitl-input"
              placeholder="답변 입력..."
              value={inputValue}
              onChange={e => onInputChange(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && onRespondQuestion()}
            />
            <button className="hitl-btn allow" onClick={onRespondQuestion}>
              <Send size={12} />
            </button>
          </>
        )}
        {ev.humanInTheLoop!.type === 'choice' && (
          ev.humanInTheLoop!.choices?.map(choice => (
            <button key={choice} className="hitl-btn choice" onClick={() => onRespondChoice(choice)}>
              {choice}
            </button>
          ))
        )}
      </div>
    </div>
  );
});

export function HitlOverlay({ events }: Props) {
  const [tick, setTick] = useState(0);
  const [inputMap, setInputMap] = useState<Record<number, string>>({});
  const hitlRefsRef = useRef(new Map<number, React.RefObject<HTMLDivElement | null>>());
  const getHitlRef = (id: number): React.RefObject<HTMLDivElement | null> => {
    if (!hitlRefsRef.current.has(id)) {
      hitlRefsRef.current.set(id, createRef<HTMLDivElement>());
    }
    return hitlRefsRef.current.get(id)!;
  };

  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const pendingHitl = useMemo(
    () => events.filter(ev => ev.humanInTheLoop && ev.id !== undefined && ev.humanInTheLoopStatus?.status === 'pending'),
    [events]
  );

  // 새 HITL 요청 등장 시 사운드 재생
  const playSound = useSoundStore(s => s.playSound);
  const prevPendingIdsRef = useRef(new Set<number>());
  useEffect(() => {
    const prev = prevPendingIdsRef.current;
    const hasNew = pendingHitl.some(ev => !prev.has(ev.id!));
    if (hasNew) playSound('hitl_request');
    prevPendingIdsRef.current = new Set(pendingHitl.map(ev => ev.id!));
  }, [pendingHitl, playSound]);

  function respondPermission(ev: HookEvent, allowed: boolean) {
    post(ev, { permission: allowed });
  }

  function respondQuestion(ev: HookEvent) {
    const response = (inputMap[ev.id!] ?? '').trim();
    if (!response) return;
    post(ev, { response });
    setInputMap(prev => { const next = { ...prev }; delete next[ev.id!]; return next; });
  }

  function respondChoice(ev: HookEvent, choice: string) {
    post(ev, { choice });
  }

  return createPortal(
    <TransitionGroup className="hitl-stack">
      {pendingHitl.map(ev => {
        const nodeRef = getHitlRef(ev.id!);
        return (
          <CSSTransition
            key={ev.id}
            nodeRef={nodeRef as React.RefObject<HTMLDivElement>}
            timeout={{ enter: 220, exit: 150 }}
            classNames="hitl"
          >
            <HitlCard
              ref={nodeRef}
              ev={ev}
              tick={tick}
              inputValue={inputMap[ev.id!] ?? ''}
              onInputChange={val => setInputMap(prev => ({ ...prev, [ev.id!]: val }))}
              onRespondPermission={allow => respondPermission(ev, allow)}
              onRespondQuestion={() => respondQuestion(ev)}
              onRespondChoice={choice => respondChoice(ev, choice)}
            />
          </CSSTransition>
        );
      })}
    </TransitionGroup>,
    document.body
  );
}
