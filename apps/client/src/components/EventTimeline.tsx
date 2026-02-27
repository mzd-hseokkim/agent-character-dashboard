import { useRef, useEffect, useMemo, createRef } from 'react';
import { TransitionGroup, CSSTransition } from 'react-transition-group';
import { Sparkles, Moon, X, TriangleAlert, Inbox } from 'lucide-react';
import clsx from 'clsx';
import type { HookEvent } from '../types';
import { EventRow } from './EventRow';
import { useEventColors } from '../hooks/useEventColors';
import { useEventSearch } from '../hooks/useEventSearch';
import '../styles/event.css';

interface Props {
  events: HookEvent[];
  filters: { sourceApp: string; sessionId: string; eventType: string };
  stickToBottom: boolean;
  uniqueAppNames?: string[];
  allAppNames?: string[];
  onStickToBottomChange: (value: boolean) => void;
  onSelectAgent: (agentName: string) => void;
}

export function EventTimeline({
  events, filters, stickToBottom, uniqueAppNames, allAppNames,
  onStickToBottomChange, onSelectAgent,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventRefsRef = useRef(new Map<string, React.RefObject<HTMLDivElement | null>>());
  const getEventRef = (key: string): React.RefObject<HTMLDivElement | null> => {
    if (!eventRefsRef.current.has(key)) {
      eventRefsRef.current.set(key, createRef<HTMLDivElement>());
    }
    return eventRefsRef.current.get(key)!;
  };
  const { getGradientForSession, getColorForSession, getGradientForApp, getColorForApp, getHexColorForApp } = useEventColors();
  const { searchPattern, searchError, searchEvents, updateSearchPattern, clearSearch } = useEventSearch();

  const displayedAgentIds = useMemo(
    () => allAppNames?.length ? allAppNames : (uniqueAppNames || []),
    [allAppNames, uniqueAppNames]
  );
  const getAppNameFromAgentId = (id: string) => id.split(':')[0];
  const isAgentActive = (id: string) => (uniqueAppNames || []).includes(id);

  const filteredEvents = useMemo(() => {
    let filtered = events.filter(ev => {
      if (filters.sourceApp && ev.source_app !== filters.sourceApp) return false;
      if (filters.sessionId && ev.session_id !== filters.sessionId) return false;
      if (filters.eventType && ev.hook_event_type !== filters.eventType) return false;
      return true;
    });
    if (searchPattern) filtered = searchEvents(filtered, searchPattern);
    return [...filtered].reverse();
  }, [events, filters, searchPattern, searchEvents]);

  const scrollToTop = () => { if (scrollRef.current) scrollRef.current.scrollTop = 0; };

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const isAtTop = scrollRef.current.scrollTop < 50;
    if (isAtTop !== stickToBottom) onStickToBottomChange(isAtTop);
  };

  // Scroll to top when new events arrive and stick is on
  useEffect(() => {
    if (stickToBottom) scrollToTop();
  }, [events.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (stickToBottom) scrollToTop(); }, [stickToBottom]);

  return (
    <div className="flex-1 mobile:h-[50vh] overflow-hidden flex flex-col">
      {/* Fixed Header */}
      <div className="px-3 py-4 mobile:py-2 bg-gradient-to-r from-[var(--theme-bg-primary)] to-[var(--theme-bg-secondary)] relative z-10 border-b border-[var(--theme-border-primary)]"
        style={{ boxShadow: '0 2px 8px -1px rgba(30,48,32,0.08), 0 4px 12px -2px rgba(30,48,32,0.06)' }}>
        <h2 className="text-2xl mobile:text-lg font-bold text-[var(--theme-primary)] text-center drop-shadow-sm">
          Party Events
        </h2>

        {displayedAgentIds.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 mobile:gap-1.5 justify-start">
            {displayedAgentIds.map(agentId => {
              const active = isAgentActive(agentId);
              const appName = getAppNameFromAgentId(agentId);
              const hexColor = getHexColorForApp(appName);
              const AgentIcon = active ? Sparkles : Moon;
              return (
                <button
                  key={agentId}
                  onClick={() => onSelectAgent(agentId)}
                  className={clsx(
                    'flex items-center text-base mobile:text-sm font-bold px-3 mobile:px-2 py-1 rounded-full border-2 shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-105 cursor-pointer',
                    active ? 'text-[var(--theme-text-primary)] bg-[var(--theme-bg-tertiary)]'
                           : 'text-[var(--theme-text-tertiary)] bg-[var(--theme-bg-tertiary)] opacity-50 hover:opacity-75'
                  )}
                  style={{
                    borderColor: hexColor,
                    backgroundColor: hexColor + (active ? '33' : '1a'),
                  }}
                  title={`${active ? 'Active: Click to add' : 'Sleeping: No recent events. Click to add'} ${agentId} to comparison lanes`}
                >
                  <AgentIcon size={12} className="mr-2 flex-shrink-0" />
                  <span className="font-mono text-sm">
                    {agentId.length > 17 ? agentId.slice(0, 7) + '...' + agentId.slice(-7) : agentId}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Search */}
        <div className="mt-3 mobile:mt-2 w-full">
          <div className="flex items-center gap-2 mobile:gap-1">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchPattern}
                onChange={e => updateSearchPattern(e.target.value)}
                placeholder="Search events (regex enabled)... e.g., 'tool.*error' or '^GET'"
                className={clsx(
                  'w-full px-3 mobile:px-2 py-2 mobile:py-1.5 rounded-lg text-sm mobile:text-xs font-mono border-2 transition-all duration-200',
                  'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)] placeholder-[var(--theme-text-tertiary)]',
                  'border-[var(--theme-border-primary)] focus:border-[var(--theme-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)]/20',
                  searchError && 'border-[var(--theme-accent-error)]'
                )}
                aria-label="Search events with regex pattern"
              />
              {searchPattern && (
                <button onClick={clearSearch}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-[var(--theme-text-tertiary)] hover:text-[var(--theme-primary)] transition-colors duration-200"
                  title="Clear search" aria-label="Clear search">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
          {searchError && (
            <div className="mt-1.5 mobile:mt-1 px-2 py-1.5 mobile:py-1 bg-[var(--theme-accent-error)]/10 border border-[var(--theme-accent-error)] rounded-lg text-xs mobile:text-[11px] text-[var(--theme-accent-error)] font-semibold" role="alert">
              <TriangleAlert size={13} className="inline-block mr-1 align-middle" /> {searchError}
            </div>
          )}
        </div>
      </div>

      {/* Scrollable event list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-1.5 mobile:px-2 mobile:py-1 relative" onScroll={handleScroll}>
        <TransitionGroup component="div" className="space-y-1 mobile:space-y-0.5">
          {filteredEvents.map(ev => {
            const key = `${ev.id}-${ev.timestamp}`;
            const nodeRef = getEventRef(key);
            return (
              <CSSTransition
                key={key}
                nodeRef={nodeRef as React.RefObject<HTMLDivElement>}
                timeout={{ enter: 380, exit: 200 }}
                classNames="event"
              >
                <EventRow
                  ref={nodeRef}
                  event={ev}
                  gradientClass={getGradientForSession(ev.session_id)}
                  colorClass={getColorForSession(ev.session_id)}
                  appGradientClass={getGradientForApp(ev.source_app)}
                  appColorClass={getColorForApp(ev.source_app)}
                  appHexColor={getHexColorForApp(ev.source_app)}
                />
              </CSSTransition>
            );
          })}
        </TransitionGroup>

        {filteredEvents.length === 0 && (
          <div className="text-center py-8 mobile:py-6 text-[var(--theme-text-tertiary)]">
            <Inbox size={40} className="mb-3 mx-auto opacity-40" />
            <p className="text-lg mobile:text-base font-semibold text-[var(--theme-primary)] mb-1.5">No events to display</p>
            <p className="text-base mobile:text-sm">Events will appear here as they are received</p>
          </div>
        )}
      </div>
    </div>
  );
}
