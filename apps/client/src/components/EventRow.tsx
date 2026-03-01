import { useState, useMemo, forwardRef } from 'react';
import type { FC } from 'react';
import clsx from 'clsx';
import type { HookEvent } from '../types';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { ChatTranscriptModal } from './ChatTranscriptModal';
import {
  Wrench, CircleCheck, CircleX, Lock, Bell, Square, Play,
  Users, Archive, MessageSquare, LogIn, LogOut,
  Terminal, BookOpen, FilePlus, Pencil, FolderSearch, Search,
  Globe, FileText, Bot, ClipboardList, List, Download, Send,
  Map, CircleHelp, Zap, Plug, Brain, Copy, Check,
  Package, UserPlus,
} from 'lucide-react';
import '../styles/event.css';

interface Props {
  event: HookEvent;
  gradientClass: string;
  colorClass: string;
  appGradientClass: string;
  appColorClass: string;
  appHexColor: string;
}

type LucideIcon = FC<{ size?: number; className?: string }>;

const HOOK_ICON_MAP: Record<string, LucideIcon> = {
  PreToolUse: Wrench, PostToolUse: CircleCheck, PostToolUseFailure: CircleX,
  PermissionRequest: Lock, Notification: Bell, Stop: Square, SubagentStart: Play,
  SubagentStop: Users, PreCompact: Archive, UserPromptSubmit: MessageSquare,
  SessionStart: LogIn, SessionEnd: LogOut,
};

const TOOL_ICON_MAP: Record<string, LucideIcon> = {
  Bash: Terminal, Read: BookOpen, Write: FilePlus, Edit: Pencil, MultiEdit: Pencil,
  Glob: FolderSearch, Grep: Search, WebFetch: Globe, WebSearch: Search,
  NotebookEdit: BookOpen, Task: Bot, TaskCreate: ClipboardList, TaskGet: ClipboardList,
  TaskUpdate: ClipboardList, TaskList: List, TaskOutput: Download, TaskStop: Square,
  TeamCreate: UserPlus, TeamDelete: UserPlus, SendMessage: Send,
  EnterPlanMode: Map, ExitPlanMode: Map, AskUserQuestion: CircleHelp, Skill: Zap,
};

const TOOL_EVENT_TYPES = ['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest'];

const formatTime = (timestamp?: number) => timestamp ? new Date(timestamp).toLocaleTimeString() : '';

const formatModelName = (name?: string | null) => {
  if (!name) return '';
  const parts = name.split('-');
  return parts.length >= 4 ? `${parts[1]}-${parts[2]}-${parts[3]}` : name;
};

function getToolName(event: HookEvent): string | null {
  return TOOL_EVENT_TYPES.includes(event.hook_event_type) && event.payload?.tool_name
    ? event.payload.tool_name : null;
}

function getToolInfo(event: HookEvent): { tool: string; detail?: string } | null {
  const payload = event.payload;
  if (event.hook_event_type === 'UserPromptSubmit' && payload.prompt) {
    return { tool: 'Prompt:', detail: `"${payload.prompt.slice(0, 100)}${payload.prompt.length > 100 ? '...' : ''}"` };
  }
  if (event.hook_event_type === 'PreCompact') {
    const trigger = payload.trigger || 'unknown';
    return { tool: 'Compaction:', detail: trigger === 'manual' ? 'Manual compaction' : 'Auto-compaction (full context)' };
  }
  if (event.hook_event_type === 'SessionStart') {
    const source = payload.source || 'unknown';
    const labels: Record<string, string> = { startup: 'New session', resume: 'Resuming session', clear: 'Fresh session' };
    return { tool: 'Session:', detail: labels[source] || source };
  }
  if (payload.tool_name) {
    const info: { tool: string; detail?: string } = { tool: payload.tool_name };
    const input = payload.tool_input;
    if (input) {
      if (input.command) info.detail = input.command.slice(0, 50) + (input.command.length > 50 ? '...' : '');
      else if (input.file_path) info.detail = input.file_path.split('/').pop();
      else if (input.pattern) info.detail = input.pattern;
      else if (input.url) info.detail = input.url.slice(0, 60) + (input.url.length > 60 ? '...' : '');
      else if (input.query) info.detail = `"${input.query.slice(0, 50)}${input.query.length > 50 ? '...' : ''}"`;
      else if (input.notebook_path) info.detail = input.notebook_path.split('/').pop();
      else if (input.recipient) info.detail = `→ ${input.recipient}${input.summary ? ': ' + input.summary : ''}`;
      else if (input.subject) info.detail = input.subject;
      else if (input.taskId) info.detail = `#${input.taskId}${input.status ? ' → ' + input.status : ''}`;
      else if (input.description && input.subagent_type) info.detail = `${input.subagent_type}: ${input.description}`;
      else if (input.task_id) info.detail = `task: ${input.task_id}`;
      else if (input.team_name) info.detail = input.team_name;
      else if (input.skill) info.detail = input.skill;
    }
    return info;
  }
  return null;
}

export const EventRow = forwardRef<HTMLDivElement, Props>(function EventRow(
  { event, gradientClass, colorClass, appHexColor }, ref
) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showChatModal, setShowChatModal] = useState(false);
  const [copyButtonText, setCopyButtonText] = useState<'copy' | 'copied' | 'failed'>('copy');

  const { isMobile } = useMediaQuery();

  const sessionIdShort = event.session_id.slice(0, 8);
  const borderColorClass = colorClass.replace('bg-', 'border-');
  const appBorderStyle = { borderColor: appHexColor };
  const appBgStyle = { backgroundColor: appHexColor + '33' };
  const formattedPayload = useMemo(() => JSON.stringify(event.payload, null, 2), [event.payload]);
  const toolName = getToolName(event);
  const toolInfo = getToolInfo(event);

  const HookIcon = HOOK_ICON_MAP[event.hook_event_type] || CircleHelp;
  const ToolIconForHook = useMemo((): LucideIcon | null => {
    if (TOOL_EVENT_TYPES.includes(event.hook_event_type) && event.payload?.tool_name) {
      const name = event.payload.tool_name as string;
      return name.startsWith('mcp__') ? Plug : (TOOL_ICON_MAP[name] || Wrench);
    }
    return null;
  }, [event]);
  const ToolIcon = useMemo((): LucideIcon => {
    if (!toolName) return Wrench;
    return (toolName as string).startsWith('mcp__') ? Plug : (TOOL_ICON_MAP[toolName as string] || Wrench);
  }, [toolName]);

  const copyPayload = async () => {
    try {
      await navigator.clipboard.writeText(formattedPayload);
      setCopyButtonText('copied');
      setTimeout(() => setCopyButtonText('copy'), 2000);
    } catch {
      setCopyButtonText('failed');
      setTimeout(() => setCopyButtonText('copy'), 2000);
    }
  };

  return (
    <div ref={ref}>
      <div
          className={clsx('group relative p-2 mobile:p-1.5 rounded-lg transition-all duration-300 cursor-pointer border border-[var(--theme-border-primary)] hover:border-[var(--theme-primary)] bg-gradient-to-r from-[var(--theme-bg-primary)] to-[var(--theme-bg-secondary)]', isExpanded && 'ring-1 ring-[var(--theme-primary)] border-[var(--theme-primary)]')}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="absolute left-0 top-0 bottom-0 w-2 rounded-l-lg" style={{ backgroundColor: appHexColor }} />
          <div className={clsx('absolute left-2 top-0 bottom-0 w-1', gradientClass)} />
          <div className="ml-3.5">
            {/* Mobile layout */}
            <div className="hidden mobile:block mb-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-[var(--theme-text-primary)] px-1.5 py-0.5 rounded border bg-[var(--theme-bg-tertiary)]" style={{ ...appBgStyle, ...appBorderStyle }}>{event.source_app}</span>
                <span className="text-xs text-[var(--theme-text-tertiary)] font-medium">{formatTime(event.timestamp)}</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className={clsx('text-xs text-[var(--theme-text-secondary)] px-1.5 py-0.5 rounded-full border bg-[var(--theme-bg-tertiary)]/50', borderColorClass)}>{sessionIdShort}</span>
                {event.model_name && <span className="inline-flex items-center gap-0.5 text-xs text-[var(--theme-text-secondary)] px-1.5 py-0.5 rounded-full border bg-[var(--theme-bg-tertiary)]/50 shadow-sm" title={`Model: ${event.model_name}`}><Brain size={11} className="flex-shrink-0" />{formatModelName(event.model_name)}</span>}
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-semibold border border-[var(--theme-primary)] text-[var(--theme-primary)]">
                  <HookIcon size={12} className="flex-shrink-0" />
                  {ToolIconForHook && <ToolIconForHook size={10} className="flex-shrink-0 -ml-0.5" />}
                  {event.hook_event_type}
                </span>
                {toolName && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border border-[var(--theme-border-secondary)] text-[var(--theme-text-secondary)]"><ToolIcon size={11} className="mr-0.5 flex-shrink-0" />{toolName}</span>}
              </div>
            </div>
            {/* Desktop layout */}
            <div className="flex items-center justify-between mb-1 mobile:hidden">
              <div className="flex items-center space-x-1.5 flex-wrap gap-y-0.5">
                <span className="text-xs font-semibold text-[var(--theme-text-primary)] px-1.5 py-0 rounded border bg-[var(--theme-bg-tertiary)]" style={{ ...appBgStyle, ...appBorderStyle }}>{event.source_app}</span>
                <span className={clsx('text-xs text-[var(--theme-text-secondary)] px-1.5 py-0 rounded border bg-[var(--theme-bg-tertiary)]', borderColorClass)}>{sessionIdShort}</span>
                {event.model_name && <span className="inline-flex items-center gap-0.5 text-xs text-[var(--theme-text-secondary)] px-1.5 py-0 rounded border bg-[var(--theme-bg-tertiary)]" title={`Model: ${event.model_name}`}><Brain size={11} className="flex-shrink-0" />{formatModelName(event.model_name)}</span>}
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded text-xs font-semibold border border-[var(--theme-primary)] text-[var(--theme-primary)]">
                  <HookIcon size={11} className="flex-shrink-0" />
                  {ToolIconForHook && <ToolIconForHook size={10} className="flex-shrink-0 -ml-0.5" />}
                  {event.hook_event_type}
                </span>
                {toolName && <span className="inline-flex items-center px-1.5 py-0 rounded text-xs font-medium border border-[var(--theme-border-secondary)] text-[var(--theme-text-secondary)]"><ToolIcon size={11} className="mr-0.5 flex-shrink-0" />{toolName}</span>}
              </div>
              <span className="text-xs text-[var(--theme-text-tertiary)] font-semibold shrink-0 ml-2">{formatTime(event.timestamp)}</span>
            </div>
            {/* Tool info & summary - desktop */}
            <div className="flex items-center justify-between mb-1 mobile:hidden">
              {toolInfo && (
                <div className="text-xs text-[var(--theme-text-secondary)] font-semibold">
                  <span className="font-medium italic px-1.5 py-0 rounded border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)]">{toolInfo.tool}</span>
                  {toolInfo.detail && <span className={clsx('ml-1.5 text-[var(--theme-text-tertiary)]', event.hook_event_type === 'UserPromptSubmit' && 'italic')}>{toolInfo.detail}</span>}
                </div>
              )}
              {event.summary && (
                <div className="max-w-[55%] px-2 py-0.5 bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border-primary)] rounded">
                  <span className="inline-flex items-center gap-0.5 text-xs text-[var(--theme-text-primary)] font-semibold"><FileText size={11} className="flex-shrink-0" />{event.summary}</span>
                </div>
              )}
            </div>
            {/* Tool info & summary - mobile */}
            <div className="space-y-1 hidden mobile:block mb-1">
              {toolInfo && (
                <div className="text-xs text-[var(--theme-text-secondary)] font-semibold w-full">
                  <span className="font-medium italic px-1.5 py-0 rounded border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)]">{toolInfo.tool}</span>
                  {toolInfo.detail && <span className={clsx('ml-1.5 text-[var(--theme-text-tertiary)]', event.hook_event_type === 'UserPromptSubmit' && 'italic')}>{toolInfo.detail}</span>}
                </div>
              )}
              {event.summary && (
                <div className="w-full px-1.5 py-0.5 bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border-primary)] rounded">
                  <span className="inline-flex items-center gap-0.5 text-xs text-[var(--theme-text-primary)] font-semibold"><FileText size={11} className="flex-shrink-0" />{event.summary}</span>
                </div>
              )}
            </div>
            {/* Expanded content */}
            {isExpanded && (
              <div className="mt-2 pt-2 border-t-2 border-[var(--theme-primary)] bg-gradient-to-r from-[var(--theme-bg-primary)] to-[var(--theme-bg-secondary)] rounded-b-lg p-3 space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-base mobile:text-sm font-bold text-[var(--theme-primary)] drop-shadow-sm flex items-center gap-1.5">
                      <Package size={16} className="flex-shrink-0" />Payload
                    </h4>
                    <button onClick={e => { e.stopPropagation(); copyPayload(); }}
                      className="px-3 py-1 mobile:px-2 mobile:py-0.5 text-sm mobile:text-xs font-bold rounded-lg bg-[var(--theme-primary)] hover:bg-[var(--theme-primary-dark)] text-white transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105 flex items-center space-x-1">
                      {copyButtonText === 'copied' ? <Check size={13} className="flex-shrink-0" /> : <Copy size={13} className="flex-shrink-0" />}
                      <span>{copyButtonText === 'copied' ? 'Copied!' : copyButtonText === 'failed' ? 'Failed' : 'Copy'}</span>
                    </button>
                  </div>
                  <pre className="text-sm mobile:text-xs text-[var(--theme-text-primary)] bg-[var(--theme-bg-tertiary)] p-3 mobile:p-2 rounded-lg overflow-x-auto max-h-64 overflow-y-auto font-mono border border-[var(--theme-primary)]/30 shadow-md hover:shadow-lg transition-shadow duration-200">
                    {formattedPayload}
                  </pre>
                </div>
                {event.chat && event.chat.length > 0 && (
                  <div className="flex justify-end">
                    <button
                      onClick={e => { e.stopPropagation(); if (!isMobile) setShowChatModal(true); }}
                      disabled={isMobile}
                      className={clsx('px-4 py-2 mobile:px-3 mobile:py-1.5 font-bold rounded-lg transition-all duration-200 flex items-center space-x-1.5 shadow-md hover:shadow-lg',
                        isMobile
                          ? 'bg-[var(--theme-bg-quaternary)] cursor-not-allowed opacity-50 text-[var(--theme-text-quaternary)] border border-[var(--theme-border-tertiary)]'
                          : 'bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-primary-light)] hover:from-[var(--theme-primary-dark)] hover:to-[var(--theme-primary)] text-white border border-[var(--theme-primary-dark)] transform hover:scale-105'
                      )}
                    >
                      <MessageSquare size={16} className="flex-shrink-0" />
                      <span className="text-sm mobile:text-xs font-bold drop-shadow-sm">
                        {isMobile ? 'Not available in mobile' : `View Chat Transcript (${event.chat.length} messages)`}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      {event.chat && event.chat.length > 0 && (
        <ChatTranscriptModal isOpen={showChatModal} chat={event.chat} onClose={() => setShowChatModal(false)} />
      )}
    </div>
  );
});
