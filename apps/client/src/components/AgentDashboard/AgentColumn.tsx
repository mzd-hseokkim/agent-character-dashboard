import { forwardRef } from 'react';
import { AgentCard } from './AgentCard';
import { FeedItem } from './FeedItem';
import type { AgentState, AgentStatus } from '../../stores/useWebSocketStore';
import type { HookEvent } from '../../types';

function splitKey(key: string): [string, string] {
  const idx = key.lastIndexOf(':');
  return [key.slice(0, idx), key.slice(idx + 1)];
}

function getAgentEvents(agentKey: string, events: HookEvent[]): HookEvent[] {
  const [app, sess] = splitKey(agentKey);
  return [...events]
    .filter(e => e.source_app === app && e.session_id.startsWith(sess))
    .reverse()
    .slice(0, 80);
}

function isHitlShown(agent: AgentState, ev: HookEvent, agentEvents: HookEvent[]): boolean {
  if (!ev.humanInTheLoop || ev.humanInTheLoopStatus?.status !== 'pending') return false;
  const s = agent.status as AgentStatus;
  if (s === 'OFFLINE' || s === 'DONE') return false;
  return agentEvents.length > 0 && agentEvents[0].id === ev.id;
}

interface Props {
  agentKey: string;
  agent: AgentState;
  events: HookEvent[];
  tick: number;
  celebrating: boolean;
  onCycleCharacter: () => void;
  onMouseEnterFeedItem: (el: HTMLElement, ev: HookEvent) => void;
  onMouseLeaveFeedItem: () => void;
}

export const AgentColumn = forwardRef<HTMLDivElement, Props>(function AgentColumn(
  { agentKey, agent, events, tick, celebrating,
    onCycleCharacter, onMouseEnterFeedItem, onMouseLeaveFeedItem },
  ref
) {
  const agentEvents = getAgentEvents(agentKey, events);

  return (
    <div ref={ref} className={`agent-column ${agent.status.toLowerCase()}${celebrating ? ' celebrating' : ''}`}>
      <AgentCard
        agentKey={agentKey}
        agent={agent}
        events={events}
        tick={tick}
        celebrating={celebrating}
        onCycleCharacter={onCycleCharacter}
      />

      <div className="col-feed">
        {agentEvents.length === 0 ? (
          <div className="feed-empty">이벤트 대기 중...</div>
        ) : (
          <div className="feed-items">
            {agentEvents.map(ev => {
              const key = `${ev.id ?? ev.timestamp ?? 0}-${ev.hook_event_type}`;
              return (
                <FeedItem
                  key={key}
                  ev={ev}
                  isHitlActive={isHitlShown(agent, ev, agentEvents)}
                  onMouseEnter={onMouseEnterFeedItem}
                  onMouseLeave={onMouseLeaveFeedItem}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});
