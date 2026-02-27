import { useState, useEffect, useRef, useCallback } from 'react';
import { Users, ScrollText, Trash2, Volume2, VolumeX } from 'lucide-react';
import { CSSTransition, SwitchTransition } from 'react-transition-group';
import { useWebSocketStore, useWebSocketConnection } from './stores/useWebSocketStore';
import { useThemeStore } from './stores/useThemeStore';
import { useSoundStore } from './stores/useSoundStore';
import { useEventColors } from './hooks/useEventColors';
import { AgentDashboard } from './components/AgentDashboard/AgentDashboard';
import { EventTimeline } from './components/EventTimeline';
import { LivePulseChart } from './components/LivePulseChart';
import { AgentSwimLaneContainer } from './components/AgentSwimLaneContainer';
import { StickScrollButton } from './components/StickScrollButton';
import { ToastNotification } from './components/ToastNotification';
import type { TimeRange } from './types';
import { WS_URL } from './config';
import './App.css';

interface Toast {
  id: number;
  agentName: string;
  agentColor: string;
}

let toastIdCounter = 0;

export default function App() {
  // WebSocket
  useWebSocketConnection(WS_URL);
  const { events, agentStates, isConnected, error, clearEvents } = useWebSocketStore();

  // Theme init
  const { initializeTheme } = useThemeStore();
  useEffect(() => { initializeTheme(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sound
  const { isMuted, toggleMute } = useSoundStore();

  // Tab state
  const [activeTab, setActiveTab] = useState<'characters' | 'timeline'>('characters');
  const tabNodeRef = useRef<HTMLDivElement>(null);

  // Filters (passed to timeline components)
  const [filters] = useState({ sourceApp: '', sessionId: '', eventType: '' });

  // UI state
  const [stickToBottom, setStickToBottom] = useState(true);
  const [uniqueAppNames, setUniqueAppNames] = useState<string[]>([]);
  const [allAppNames, setAllAppNames] = useState<string[]>([]);
  const [selectedAgentLanes, setSelectedAgentLanes] = useState<string[]>([]);
  const [currentTimeRange, setCurrentTimeRange] = useState<TimeRange>('1m');

  // Toast notifications
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seenAgentsRef = useRef(new Set<string>());
  const { getHexColorForApp } = useEventColors();

  // Watch for new agents in uniqueAppNames
  useEffect(() => {
    uniqueAppNames.forEach(appName => {
      if (!seenAgentsRef.current.has(appName)) {
        seenAgentsRef.current.add(appName);
        const toast: Toast = {
          id: toastIdCounter++,
          agentName: appName,
          agentColor: getHexColorForApp(appName),
        };
        setToasts(prev => [...prev, toast]);
      }
    });
  }, [uniqueAppNames]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toggleAgentLane = useCallback((agentId: string) => {
    setSelectedAgentLanes(prev =>
      prev.includes(agentId) ? prev.filter(id => id !== agentId) : [...prev, agentId]
    );
  }, []);

  const handleClearClick = useCallback(() => {
    clearEvents();
    setSelectedAgentLanes([]);
  }, [clearEvents]);

  return (
    <div className="h-screen flex flex-col" style={{ background: '#0d1117' }}>
      {/* Header */}
      <header className="short:hidden frieren-header">
        <div className="header-inner">
          {/* Left: Title + Tabs */}
          <div className="flex items-center gap-6 mobile:hidden">
            <div className="flex items-center gap-3">
              <div className="header-accent-bar" />
              <h1 className="header-title">Party Observability</h1>
            </div>
            <div className="tab-group">
              <button
                onClick={() => setActiveTab('characters')}
                className={`tab-btn ${activeTab === 'characters' ? 'tab-active' : 'tab-inactive'}`}
              >
                <Users size={13} />
                파티
              </button>
              <button
                onClick={() => setActiveTab('timeline')}
                className={`tab-btn ${activeTab === 'timeline' ? 'tab-active' : 'tab-inactive'}`}
              >
                <ScrollText size={13} />
                이벤트
              </button>
            </div>
          </div>

          {/* Right: Status + Actions */}
          <div className="flex items-center gap-3">
            {/* Connection indicator */}
            <div className="flex items-center gap-2">
              {isConnected ? (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-[#4a9060]" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#4a9060]" />
                </span>
              ) : (
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              )}
              <span className="text-xs mobile:hidden header-text-dim">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>

            {/* Event count */}
            <span className="header-count">{events.length}</span>

            {/* Mute toggle */}
            <button
              onClick={toggleMute}
              className={`header-btn${isMuted ? ' header-btn-muted' : ''}`}
              title={isMuted ? '효과음 켜기' : '효과음 끄기'}
            >
              {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>

            {/* Clear */}
            <button onClick={handleClearClick} className="header-btn" title="기록 지우기">
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      </header>

      {/* Tab content */}
      <div className="flex-1 relative overflow-hidden">
        <SwitchTransition mode="out-in">
          <CSSTransition
            key={activeTab}
            timeout={{ enter: 280, exit: 120 }}
            classNames="tab-switch"
            nodeRef={tabNodeRef}
          >
            <div ref={tabNodeRef} className="tab-pane">
              {activeTab === 'characters' ? (
                <AgentDashboard agentStates={agentStates} events={events} />
              ) : (
                <div className="tab-pane flex flex-col">
                  <LivePulseChart
                    events={events}
                    filters={filters}
                    onUpdateUniqueApps={setUniqueAppNames}
                    onUpdateAllApps={setAllAppNames}
                    onUpdateTimeRange={setCurrentTimeRange}
                  />

                  {selectedAgentLanes.length > 0 && (
                    <div className="w-full bg-[var(--theme-bg-secondary)] px-3 py-4 overflow-hidden">
                      <AgentSwimLaneContainer
                        selectedAgents={selectedAgentLanes}
                        events={events}
                        timeRange={currentTimeRange}
                        onSelectedAgentsChange={setSelectedAgentLanes}
                      />
                    </div>
                  )}

                  <div className="flex flex-col flex-1 overflow-hidden">
                    <EventTimeline
                      events={events}
                      filters={filters}
                      stickToBottom={stickToBottom}
                      uniqueAppNames={uniqueAppNames}
                      allAppNames={allAppNames}
                      onStickToBottomChange={setStickToBottom}
                      onSelectAgent={toggleAgentLane}
                    />
                  </div>

                  <StickScrollButton
                    stickToBottom={stickToBottom}
                    onToggle={() => setStickToBottom(s => !s)}
                  />
                </div>
              )}
            </div>
          </CSSTransition>
        </SwitchTransition>
      </div>

      {/* Error */}
      {error && (
        <div className="fixed bottom-4 left-4 mobile:bottom-3 mobile:left-3 mobile:right-3 bg-red-100 border border-red-400 text-red-700 px-3 py-2 mobile:px-2 mobile:py-1.5 rounded mobile:text-xs">
          {error}
        </div>
      )}

      {/* Toasts */}
      {toasts.map((toast, index) => (
        <ToastNotification
          key={toast.id}
          index={index}
          agentName={toast.agentName}
          agentColor={toast.agentColor}
          onDismiss={() => dismissToast(toast.id)}
        />
      ))}
    </div>
  );
}
