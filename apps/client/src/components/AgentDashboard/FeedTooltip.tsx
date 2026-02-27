import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { CSSTransition } from 'react-transition-group';
import type { HookEvent } from '../../types';

export interface TipState {
  visible: boolean;
  x: number;
  y: number;
  ev: HookEvent | null;
}

function feedItemClass(ev: HookEvent): string {
  if (ev.humanInTheLoop && ev.humanInTheLoopStatus?.status === 'pending') return 'hitl';
  if (ev.hook_event_type === 'PostToolUseFailure') return 'failed';
  if (ev.hook_event_type === 'PostToolUse') return 'done';
  if (ev.hook_event_type === 'PreToolUse') return 'casting';
  if (ev.hook_event_type === 'Stop') return 'stop';
  if (ev.hook_event_type === 'SubagentStop') return 'subagent-stop';
  if (ev.hook_event_type === 'SessionEnd') return 'complete';
  return 'info';
}

const KNOWN_FIELDS = new Set([
  'file_path', 'path', 'command', 'pattern', 'url', 'query',
  'old_string', 'new_string', 'replace_all', 'description', 'offset', 'limit',
]);

function fmtTime(ts?: number): string {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

interface Props {
  tip: TipState;
}

export function FeedTooltip({ tip }: Props) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const ev = tip.ev;

  const tipHasRows = ev?.payload?.tool_input
    ? !!(ev.payload.tool_input.file_path || ev.payload.tool_input.path || ev.payload.tool_input.command || ev.payload.tool_input.pattern || ev.payload.tool_input.url || ev.payload.tool_input.query)
    : false;

  const tipEditDiff = (() => {
    const inp = ev?.payload?.tool_input;
    if (!inp || (!inp.old_string && !inp.new_string)) return null;
    const trim = (s: string) => s?.length > 110 ? s.slice(0, 110) + '…' : (s ?? '');
    return { old: trim(inp.old_string ?? '(비어있음)'), new: trim(inp.new_string ?? '(비어있음)') };
  })();

  const tipGenericFields = (() => {
    const inp = ev?.payload?.tool_input;
    if (!inp) return [] as [string, string][];
    return Object.entries(inp)
      .filter(([k]) => !KNOWN_FIELDS.has(k))
      .map(([k, v]) => {
        const str = Array.isArray(v) ? JSON.stringify(v) : String(v ?? '');
        return [k, str.length > 80 ? str.slice(0, 80) + '…' : str] as [string, string];
      })
      .slice(0, 5);
  })();

  const tipResponse = (() => {
    if (ev?.hook_event_type !== 'PostToolUse') return null;
    const resp = ev?.payload?.tool_response;
    if (!resp) return null;
    const str = typeof resp === 'string' ? resp : JSON.stringify(resp);
    return str.slice(0, 240) + (str.length > 240 ? '…' : '');
  })();

  const tipMessage = (() => {
    if (!ev) return null;
    const p = ev.payload;
    const raw = p?.prompt ?? p?.message ?? p?.last_assistant_message ?? null;
    if (!raw) return null;
    const str = typeof raw === 'string' ? raw : JSON.stringify(raw);
    return str.slice(0, 200) + (str.length > 200 ? '…' : '');
  })();

  const itemClass = ev ? feedItemClass(ev) : '';

  return createPortal(
    <CSSTransition in={tip.visible && !!ev} nodeRef={tooltipRef} timeout={{ enter: 100, exit: 70 }} classNames="ftip" unmountOnExit>
      <div ref={tooltipRef} className="feed-tooltip" style={{ left: tip.x, top: tip.y }}>
        {ev && (
          <>
            <div className={`ftip-header ${itemClass}`}>
              <span className="ftip-type">{ev.hook_event_type}</span>
              {ev.payload?.tool_name && <span className="ftip-tool">{ev.payload.tool_name}</span>}
            </div>
            {tipHasRows && (
              <div className="ftip-rows">
                {ev.payload.tool_input?.file_path && <div className="ftip-row"><span className="ftip-lbl">경로</span><span className="ftip-val mono">{ev.payload.tool_input.file_path}</span></div>}
                {ev.payload.tool_input?.path && <div className="ftip-row"><span className="ftip-lbl">경로</span><span className="ftip-val mono">{ev.payload.tool_input.path}</span></div>}
                {ev.payload.tool_input?.command && <div className="ftip-row"><span className="ftip-lbl">명령</span><span className="ftip-val mono">{ev.payload.tool_input.command}</span></div>}
                {ev.payload.tool_input?.pattern && <div className="ftip-row"><span className="ftip-lbl">패턴</span><span className="ftip-val mono">{ev.payload.tool_input.pattern}</span></div>}
                {ev.payload.tool_input?.url && <div className="ftip-row"><span className="ftip-lbl">URL</span><span className="ftip-val mono">{ev.payload.tool_input.url}</span></div>}
                {ev.payload.tool_input?.query && <div className="ftip-row"><span className="ftip-lbl">검색어</span><span className="ftip-val">{ev.payload.tool_input.query}</span></div>}
              </div>
            )}
            {tipEditDiff && (
              <div className="ftip-rows">
                <div className="ftip-row"><span className="ftip-lbl ftip-lbl-del">이전</span><span className="ftip-val mono ftip-diff-del">{tipEditDiff.old}</span></div>
                <div className="ftip-row"><span className="ftip-lbl ftip-lbl-ins">이후</span><span className="ftip-val mono ftip-diff-ins">{tipEditDiff.new}</span></div>
              </div>
            )}
            {tipGenericFields.length > 0 && (
              <div className="ftip-rows">
                {tipGenericFields.map(([k, v]) => (
                  <div key={k} className="ftip-row"><span className="ftip-lbl">{k}</span><span className="ftip-val mono">{v}</span></div>
                ))}
              </div>
            )}
            {tipResponse && (
              <div className="ftip-response">
                <div className="ftip-resp-hdr">OUTPUT</div>
                <pre className="ftip-resp-txt">{tipResponse}</pre>
              </div>
            )}
            {tipMessage && <div className="ftip-msg">{tipMessage}</div>}
            {ev.summary && <div className="ftip-summary">{ev.summary}</div>}
            <div className="ftip-footer">
              <span className="ftip-model">{ev.model_name ?? ''}</span>
              <span className="ftip-time">{fmtTime(ev.timestamp)}</span>
            </div>
          </>
        )}
      </div>
    </CSSTransition>,
    document.body
  );
}
