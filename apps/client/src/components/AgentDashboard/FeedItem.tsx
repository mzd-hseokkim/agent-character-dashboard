import { forwardRef, useState, useEffect } from 'react';
import type { FC } from 'react';
import type { HookEvent } from '../../types';
import {
  Terminal, FileText, PenLine, Pencil, Search, FolderSearch, Globe, Bot, BookOpen,
  MessageSquare, Rocket, Flag, Zap, CheckCircle, Bell, Key, Package, Plug, MapPin,
} from 'lucide-react';

type LucideIcon = FC<{ size?: number }>;

const TOOL_LANG: Record<string, [LucideIcon, string, string]> = {
  Bash:         [Terminal,     '쉘 명령 실행',     '쉘 명령 완료'],
  Read:         [FileText,     '파일 읽는',         '파일 읽기 완료'],
  Write:        [PenLine,      '파일 작성',         '파일 작성 완료'],
  Edit:         [Pencil,       '파일 편집',         '파일 편집 완료'],
  MultiEdit:    [Pencil,       '파일 다중 편집',   '파일 편집 완료'],
  Grep:         [Search,       '코드 검색',         '코드 검색 완료'],
  Glob:         [FolderSearch, '파일 탐색',         '파일 탐색 완료'],
  WebFetch:     [Globe,        '웹 요청',           '웹 요청 완료'],
  WebSearch:    [Globe,        '웹 검색',           '웹 검색 완료'],
  Task:         [Bot,          '서브에이전트 실행', '서브에이전트 완료'],
  NotebookEdit: [BookOpen,     '노트북 편집',       '노트북 편집 완료'],
};

const HOOK_MAP: Record<string, [LucideIcon, string]> = {
  UserPromptSubmit:  [MessageSquare, '사용자 메시지 수신'],
  SessionStart:      [Rocket,        '세션 시작'],
  SessionEnd:        [Flag,          '세션 종료'],
  SubagentStart:     [Zap,           '서브에이전트 소환'],
  SubagentStop:      [CheckCircle,   '서브에이전트 완료'],
  Stop:              [Flag,          '작업 완료'],
  Notification:      [Bell,          '알림'],
  PermissionRequest: [Key,           '권한 요청'],
  PreCompact:        [Package,       '컨텍스트 압축'],
};

function toolTarget(inp: Record<string, unknown> | undefined): string {
  if (!inp) return '';
  if (inp.file_path) return String(inp.file_path).split(/[\\/]/).pop() ?? '';
  if (inp.command) { const s = String(inp.command); return s.slice(0, 44) + (s.length > 44 ? '…' : ''); }
  if (inp.pattern) return String(inp.pattern).slice(0, 40);
  if (inp.url) return String(inp.url).replace(/^https?:\/\//, '').slice(0, 40);
  if (inp.query) return `"${String(inp.query).slice(0, 36)}"`;
  if (inp.description) return String(inp.description).slice(0, 40);
  return '';
}

interface ActionInfo {
  Icon: LucideIcon;
  label: string;
  detail: string;
  phase: 'casting' | 'done' | 'failed';
}

function describeEvent(ev: HookEvent): ActionInfo | null {
  const tool = ev.payload?.tool_name as string | undefined;
  if (!tool) return null;
  const phase: ActionInfo['phase'] =
    ev.hook_event_type === 'PostToolUseFailure' ? 'failed' :
    ev.hook_event_type === 'PostToolUse' ? 'done' : 'casting';
  const target = toolTarget(ev.payload?.tool_input);
  if (tool.startsWith('mcp__')) {
    const svc = tool.split('__').slice(1).join(' › ');
    return { Icon: Plug, label: phase === 'casting' ? `${svc} 실행 중` : `${svc} ${phase === 'done' ? '완료' : '실패'}`, detail: target, phase };
  }
  const [Icon, activeVerb, doneVerb] = TOOL_LANG[tool] ?? [Zap, `${tool} 실행`, `${tool} 완료`];
  return { Icon, label: phase === 'casting' ? `${activeVerb} 중` : (phase === 'done' ? doneVerb : `${activeVerb} 실패`), detail: target, phase };
}

function getEvIcon(ev: HookEvent): LucideIcon {
  return describeEvent(ev)?.Icon ?? HOOK_MAP[ev.hook_event_type]?.[0] ?? MapPin;
}
function getEvMainText(ev: HookEvent): string {
  const info = describeEvent(ev);
  if (info) return info.label;
  return HOOK_MAP[ev.hook_event_type]?.[1] ?? ev.hook_event_type;
}
function getEvDetailText(ev: HookEvent): string {
  const info = describeEvent(ev);
  if (info?.detail) return info.detail;
  if (ev.summary) return ev.summary.slice(0, 60);
  return '';
}
function feedItemClass(ev: HookEvent, isHitlActive = false): string {
  if (isHitlActive) return 'hitl';
  if (ev.hook_event_type === 'PostToolUseFailure') return 'failed';
  if (ev.hook_event_type === 'PostToolUse') return 'done';
  if (ev.hook_event_type === 'PreToolUse') return 'casting';
  if (ev.hook_event_type === 'Stop') return 'stop';
  if (ev.hook_event_type === 'SubagentStop') return 'subagent-stop';
  if (ev.hook_event_type === 'SessionEnd') return 'complete';
  return 'info';
}
function fmtTime(ts?: number): string {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

interface Props {
  ev: HookEvent;
  isHitlActive?: boolean;
  onMouseEnter: (el: HTMLElement, ev: HookEvent) => void;
  onMouseLeave: () => void;
}

export const FeedItem = forwardRef<HTMLDivElement, Props>(function FeedItem(
  { ev, isHitlActive = false, onMouseEnter, onMouseLeave }, ref
) {
  const EvIcon = getEvIcon(ev);
  const hitlPending = isHitlActive;
  const [isNew, setIsNew] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setIsNew(false), 420);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      ref={ref}
      className={`feed-item ${feedItemClass(ev, isHitlActive)}${isNew ? ' feed-item-new' : ''}`}
      onMouseEnter={e => onMouseEnter(e.currentTarget, ev)}
      onMouseLeave={onMouseLeave}
    >
      <span className={`fi-icon${hitlPending ? ' fi-icon-hitl' : ''}`}>
        <EvIcon size={12} />
      </span>
      <div className="fi-body">
        <div className="fi-main">{getEvMainText(ev)}</div>
        {hitlPending ? (
          <div className="fi-hitl-badge">
            <span className="fi-hitl-dot" />
            CLI에서 직접 답변 필요
          </div>
        ) : (
          getEvDetailText(ev) && <div className="fi-detail">{getEvDetailText(ev)}</div>
        )}
      </div>
      <span className="fi-time">{fmtTime(ev.timestamp)}</span>
    </div>
  );
});

// Export helpers needed by AgentCard/AgentDashboard
export { describeEvent, TOOL_LANG, HOOK_MAP, toolTarget };
