import { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Moon, RefreshCw, Zap, MessageSquare, Hand } from 'lucide-react';
import { CSSTransition } from 'react-transition-group';
import { SpriteCanvas } from '../SpriteCanvas';
import { CelebrationOverlay } from './CelebrationOverlay';
import { describeEvent } from './FeedItem';
import type { AgentState, AgentStatus } from '../../stores/useWebSocketStore';
import type { HookEvent } from '../../types';

const CHAR_SIZE = 130;

const STATUS_LABEL: Record<AgentStatus, string> = {
  WORKING: '작업 중', THINKING: '생각 중', READING: '읽는 중', WAITING: '유휴',
  DONE: '완료', ERROR: '오류', BLOCKED: '승인 대기', OFFLINE: '오프라인', ORCHESTRATING: '지휘 중',
};

const STATUS_AURA: Record<AgentStatus, string> = {
  WORKING: '#5a9840', THINKING: '#5890b8', READING: '#5a8848', WAITING: '#b09040',
  DONE: '#c8a030', ERROR: '#b04838', BLOCKED: '#8060b0', OFFLINE: '#505850', ORCHESTRATING: '#9878c8',
};

function splitKey(key: string): [string, string] {
  const idx = key.lastIndexOf(':');
  return [key.slice(0, idx), key.slice(idx + 1)];
}

function getAgentAuraStyle(agent: AgentState, tick: number): React.CSSProperties {
  void tick;
  const color = STATUS_AURA[agent.status ?? 'OFFLINE'];
  const secs = (Date.now() - agent.lastUpdated) / 1000;
  const i = secs < 2 ? 1.0 : secs < 10 ? 0.7 : secs < 30 ? 0.35 : 0.12;
  const h = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return {
    position: 'absolute',
    width: CHAR_SIZE + 'px', height: CHAR_SIZE + 'px',
    borderRadius: '50%',
    border: `2px solid ${color}${h(i * 200)}`,
    boxShadow: `0 0 ${44 * i}px ${20 * i}px ${color}${h(i * 90)}, inset 0 0 ${16 * i}px ${color}${h(i * 35)}`,
    opacity: 0.2 + i * 0.8,
    transition: 'box-shadow 1.2s ease, border-color 1.2s ease, opacity 1.2s ease',
    pointerEvents: 'none',
  };
}

function getActionInfo(agentKey: string, events: HookEvent[]) {
  const [app, sess] = splitKey(agentKey);
  const ev = [...events]
    .filter(e => e.source_app === app && e.session_id.startsWith(sess) && e.payload?.tool_name)
    .at(-1);
  return ev ? describeEvent(ev) : null;
}

function getApm(agentKey: string, events: HookEvent[], tick: number): string {
  void tick;
  const [app, sess] = splitKey(agentKey);
  const cutoff = Date.now() - 60_000;
  return String(events.filter(
    e => e.source_app === app && e.session_id.startsWith(sess) && (e.timestamp ?? 0) > cutoff
  ).length);
}

function timeAgo(ts: number, tick: number): string {
  void tick;
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60) return `${secs}초 전`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}분 전`;
  return `${Math.floor(mins / 60)}시간 전`;
}

function isAgentLive(agent: AgentState, tick: number): boolean {
  void tick;
  const recentUpdate = Date.now() - agent.lastUpdated < 30000;
  const activeStatus = !['DONE', 'OFFLINE'].includes(agent.status);
  return recentUpdate && activeStatus;
}

function getLatestPrompt(agentKey: string, events: HookEvent[]): string {
  const [app, sess] = splitKey(agentKey);
  const ev = [...events]
    .filter(e => e.source_app === app && e.session_id.startsWith(sess) && e.hook_event_type === 'UserPromptSubmit')
    .at(-1);
  const prompt = ev?.payload?.prompt;
  if (!prompt || typeof prompt !== 'string') return '';
  const trimmed = prompt.trim();
  return trimmed.slice(0, 50) + (trimmed.length > 50 ? '…' : '');
}

function getFullPrompt(agentKey: string, events: HookEvent[]): string {
  const [app, sess] = splitKey(agentKey);
  const ev = [...events]
    .filter(e => e.source_app === app && e.session_id.startsWith(sess) && e.hook_event_type === 'UserPromptSubmit')
    .at(-1);
  const prompt = ev?.payload?.prompt;
  if (!prompt || typeof prompt !== 'string') return '';
  return prompt.trim();
}

const PTIP_W = 320;

interface PromptTipState { visible: boolean; x: number; y: number; text: string; }

function agentHasHitlPending(agentKey: string, agent: AgentState, events: HookEvent[]): boolean {
  if (agent.status === 'OFFLINE' || agent.status === 'DONE') return false;
  const [app, sess] = splitKey(agentKey);
  const agentEvs = [...events]
    .filter(e => e.source_app === app && e.session_id.startsWith(sess))
    .reverse(); // newest first
  // 가장 최근 HITL 이벤트를 찾아 pending 여부 확인
  const latestHitlIdx = agentEvs.findIndex(e => e.humanInTheLoop !== undefined);
  if (latestHitlIdx === -1) return false;
  const latestHitl = agentEvs[latestHitlIdx];
  // 서버에서 responded로 업데이트된 경우
  if (latestHitl.humanInTheLoopStatus?.status !== 'pending') return false;
  // 해당 HITL보다 더 최신 이벤트들
  const newerEvs = agentEvs.slice(0, latestHitlIdx);
  // 새 사용자 메시지가 왔으면 → 이미 응답됨
  if (newerEvs.some(e => e.hook_event_type === 'UserPromptSubmit')) return false;
  // PostToolUse가 왔으면 → 에이전트가 도구를 실행했다 = HITL이 이미 승인됨
  if (newerEvs.some(e => e.hook_event_type === 'PostToolUse')) return false;
  return true;
}

interface Props {
  agentKey: string;
  agent: AgentState;
  events: HookEvent[];
  tick: number;
  celebrating: boolean;
  onCycleCharacter: () => void;
}

export function AgentCard({ agentKey, agent, events, tick, celebrating, onCycleCharacter }: Props) {
  const celebrateNodeRef = useRef<HTMLDivElement>(null);
  const hitlHandRef = useRef<HTMLDivElement>(null);
  const [promptTip, setPromptTip] = useState<PromptTipState>({ visible: false, x: 0, y: 0, text: '' });
  const [actionFlash, setActionFlash] = useState(false);
  const prevActionKeyRef = useRef<string | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const live = isAgentLive(agent, tick);
  const actionInfo = getActionInfo(agentKey, events);

  // 현재작업 변경 시 플래시
  const actionKey = actionInfo ? `${actionInfo.label}|${actionInfo.detail ?? ''}` : null;
  useEffect(() => {
    if (prevActionKeyRef.current === null) { prevActionKeyRef.current = actionKey; return; }
    if (prevActionKeyRef.current !== actionKey && actionKey !== null) {
      prevActionKeyRef.current = actionKey;
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      setActionFlash(true);
      flashTimerRef.current = setTimeout(() => setActionFlash(false), 550);
    } else {
      prevActionKeyRef.current = actionKey;
    }
  }, [actionKey]);
  const hitlPending = agentHasHitlPending(agentKey, agent, events);
  const latestPrompt = getLatestPrompt(agentKey, events);
  const ActionIcon = actionInfo?.Icon ?? Moon;

  function onPromptEnter(e: React.MouseEvent<HTMLDivElement>) {
    const text = getFullPrompt(agentKey, events);
    if (!text) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = rect.left;
    if (x + PTIP_W > vw - 8) x = vw - PTIP_W - 8;
    const PTIP_EST_H = 160;
    const y = rect.bottom + 4 + PTIP_EST_H > vh - 8 ? rect.top - PTIP_EST_H - 4 : rect.bottom + 4;
    setPromptTip({ visible: true, x, y, text });
  }

  function onPromptLeave() {
    setPromptTip(s => ({ ...s, visible: false }));
  }

  return (
    <>
    <div className={`col-card${celebrating ? ' celebrating' : ''}`}>
      {/* Header */}
      <div className="card-header">
        <div className={`live-badge${live ? ' live' : ''}`}>
          <span className="live-dot" />
          {live ? 'LIVE' : 'IDLE'}
        </div>
        <span className="card-name" title={agentKey}>{agentKey.split(':')[0]}</span>
        <span className={`card-status-pill ${agent.status.toLowerCase()}`}>
          {STATUS_LABEL[agent.status]}
        </span>
      </div>

      {/* Stage */}
      <div className="card-stage">
        <CSSTransition
          in={celebrating}
          timeout={{ enter: 200, exit: 600 }}
          classNames="celebrate"
          unmountOnExit
          nodeRef={celebrateNodeRef}
        >
          <div
            ref={celebrateNodeRef}
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}
          >
            <CelebrationOverlay />
          </div>
        </CSSTransition>

        <div className="card-aura" style={getAgentAuraStyle(agent, tick)} />

        <div
          className={`card-char-wrap${agent.status === 'OFFLINE' ? ' offline' : ''}${celebrating ? ' celebrating' : ''}`}
          onClick={onCycleCharacter}
          title="클릭 → 캐릭터 변경"
        >
          <SpriteCanvas characterId={agent.characterId} status={agent.status} size={CHAR_SIZE} />
          <div className="char-hint"><RefreshCw size={24} /></div>
          <CSSTransition
            in={hitlPending}
            timeout={{ enter: 200, exit: 150 }}
            classNames="hitl-hand"
            unmountOnExit
            nodeRef={hitlHandRef}
          >
            <div ref={hitlHandRef} className="char-hitl-hand"><Hand size={18} /></div>
          </CSSTransition>
        </div>
      </div>

      {/* Latest prompt */}
      <div className="card-prompt" onMouseEnter={onPromptEnter} onMouseLeave={onPromptLeave}>
        <MessageSquare size={9} />
        <span className="cp-text">{latestPrompt}</span>
      </div>

      {/* Current action */}
      <div className={`card-action ${actionInfo?.phase ?? 'idle'}${actionFlash ? ' action-flash' : ''}`}>
        <span className="ca-icon"><ActionIcon size={13} /></span>
        <div className="ca-body">
          <div className="ca-main">{actionInfo?.label ?? '대기 중'}</div>
          {actionInfo?.detail && <div className="ca-detail">{actionInfo.detail}</div>}
        </div>
      </div>

      {/* Stats */}
      <div className="card-stats">
        <div className="cs-item">
          <span className="cs-lbl">APM</span>
          <span className="cs-val apm">{getApm(agentKey, events, tick)}</span>
        </div>
        <div className="cs-sep" />
        <div className="cs-item">
          <span className="cs-lbl">마지막</span>
          <span className="cs-val">{timeAgo(agent.lastUpdated, tick)}</span>
        </div>
        {agent.subagentCount > 0 && (
          <span className="cs-sub"><Zap size={9} />{agent.subagentCount}</span>
        )}
      </div>
    </div>

    {/* Prompt tooltip portal */}
    {promptTip.visible && promptTip.text && createPortal(
      <div className="prompt-tooltip" style={{ left: promptTip.x, top: promptTip.y }}>
        <div className="ptip-header">USER PROMPT</div>
        <pre className="ptip-body">{promptTip.text}</pre>
      </div>,
      document.body
    )}
    </>
  );
}
