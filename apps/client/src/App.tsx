import { useState, useEffect, useRef, useCallback } from 'react';
import { Users, ScrollText, Trash2, Volume2, VolumeX, AlignJustify, LayoutGrid, Sun, Moon, PackagePlus } from 'lucide-react';
import { CSSTransition, SwitchTransition } from 'react-transition-group';
import { useWebSocketStore, useWebSocketConnection } from './stores/useWebSocketStore';
import { useCharactersInit } from './hooks/useCharacters';
import { useThemeStore } from './stores/useThemeStore';
import { useSoundStore } from './stores/useSoundStore';
import { useEventColors } from './hooks/useEventColors';
import { AgentDashboard } from './components/AgentDashboard/AgentDashboard';
import { ThemePackageUpload } from './components/ThemePackageUpload';
import type { ViewMode } from './components/AgentDashboard/AgentDashboard';
import { EventTimeline } from './components/EventTimeline';
import { LivePulseChart } from './components/LivePulseChart';
import { AgentSwimLaneContainer } from './components/AgentSwimLaneContainer';
import { StickScrollButton } from './components/StickScrollButton';
import type { TimeRange } from './types';
import { WS_URL, API_BASE_URL } from './config';
import { applyColorSetToRoot, clearColorSetFromRoot } from './stores/useThemeStore';
import './App.css';


export default function App() {
  // WebSocket
  useWebSocketConnection(WS_URL);
  useCharactersInit();
  const { events, agentStates, isConnected, error, clearEvents, activeTheme, _setActiveTheme } = useWebSocketStore();

  // Theme
  const { initializeTheme, toggleDarkMode, state: themeState } = useThemeStore();
  useEffect(() => { initializeTheme(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 활성 테마 색상 CSS 변수 적용 (activeTheme 변경 또는 다크/라이트 모드 전환 시)
  useEffect(() => {
    if (!activeTheme) { clearColorSetFromRoot(); return; }
    const colors = themeState.isDarkMode ? activeTheme.darkColors : activeTheme.lightColors;
    applyColorSetToRoot(colors);
  }, [activeTheme, themeState.isDarkMode]);

  // 서버 재시작 후 activeTheme 복원을 위해 초기 로드 시 fetch
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/active-theme`)
      .then(r => r.json())
      .then(json => { if (json.success && json.data) _setActiveTheme(json.data); })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sound
  const { isMuted, toggleMute } = useSoundStore();

  // Tab state
  const [activeTab, setActiveTab] = useState<'characters' | 'timeline'>('characters');
  const [viewMode, setViewMode] = useState<ViewMode>('detail');
  const tabNodeRef = useRef<HTMLDivElement>(null);

  // Filters (passed to timeline components)
  const [filters] = useState({ sourceApp: '', sessionId: '', eventType: '' });

  // Upload modal
  const [showUpload, setShowUpload] = useState(false);

  // UI state
  const [stickToBottom, setStickToBottom] = useState(true);
  const [uniqueAppNames, setUniqueAppNames] = useState<string[]>([]);
  const [allAppNames, setAllAppNames] = useState<string[]>([]);
  const [selectedAgentLanes, setSelectedAgentLanes] = useState<string[]>([]);
  const [currentTimeRange, setCurrentTimeRange] = useState<TimeRange>('1m');

  const { getHexColorForApp } = useEventColors();

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
    <div className="app-root h-screen flex flex-col">
      {/* Header */}
      <header className="short:hidden frieren-header">
        <div className="header-inner">
          {/* Left: Title + Tabs */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="header-accent-bar" />
              <h1 className="header-title">Agent Monitor</h1>
            </div>
            <div className="tab-group header-tabs">
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

          {/* Right: Actions */}
          <div className="flex items-center gap-3">
            {/* Connection dot */}
            {isConnected ? (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-[#4a9060]" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#4a9060]" />
              </span>
            ) : (
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            )}

            {/* View mode toggle — 파티 탭에서만 */}
            {activeTab === 'characters' && (
              <button
                className="header-btn"
                onClick={() => setViewMode(v => v === 'detail' ? 'card' : 'detail')}
                title={viewMode === 'detail' ? '카드 뷰로 전환' : '상세 뷰로 전환'}
              >
                {viewMode === 'detail' ? <LayoutGrid size={15} /> : <AlignJustify size={15} />}
              </button>
            )}

            {/* Theme upload */}
            <button
              onClick={() => setShowUpload(true)}
              className="header-btn"
              title="테마 패키지 업로드"
            >
              <PackagePlus size={15} />
            </button>

            {/* Dark mode toggle */}
            <button
              onClick={toggleDarkMode}
              className="header-btn"
              title={themeState.isDarkMode ? '라이트 모드로 전환' : '다크 모드로 전환'}
            >
              {themeState.isDarkMode ? <Sun size={15} /> : <Moon size={15} />}
            </button>

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
                <AgentDashboard agentStates={agentStates} events={events} viewMode={viewMode} />
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

      {/* Theme upload modal */}
      {showUpload && <ThemePackageUpload onClose={() => setShowUpload(false)} />}

      {/* Error */}
      {error && (
        <div className="fixed bottom-4 left-4 mobile:bottom-3 mobile:left-3 mobile:right-3 bg-red-100 border border-red-400 text-red-700 px-3 py-2 mobile:px-2 mobile:py-1.5 rounded mobile:text-xs">
          {error}
        </div>
      )}

    </div>
  );
}
