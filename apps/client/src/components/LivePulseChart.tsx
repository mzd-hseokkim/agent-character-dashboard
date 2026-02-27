import { useRef, useEffect, useMemo, useState } from 'react';
import { Activity, Users, Zap, Wrench, Clock, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import type { HookEvent, TimeRange, ChartConfig } from '../types';
import { useChartData } from '../hooks/useChartData';
import { createChartRenderer, type ChartDimensions } from '../utils/chartRenderer';
import { getIconGroups } from '../utils/canvasIcons';
import { useEventColors } from '../hooks/useEventColors';

interface Props {
  events: HookEvent[];
  filters: { sourceApp: string; sessionId: string; eventType: string };
  onUpdateUniqueApps: (appNames: string[]) => void;
  onUpdateAllApps: (appNames: string[]) => void;
  onUpdateTimeRange: (timeRange: TimeRange) => void;
}

const TIME_RANGES: TimeRange[] = ['1m', '3m', '5m', '10m'];

const formatGap = (gapMs: number): string => {
  if (gapMs === 0) return '—';
  if (gapMs < 1000) return `${Math.round(gapMs)}ms`;
  return `${(gapMs / 1000).toFixed(1)}s`;
};

const getThemeColor = (property: string): string => {
  const color = getComputedStyle(document.documentElement).getPropertyValue(`--theme-${property}`).trim();
  return color || '#3B82F6';
};

const getActiveConfig = (): ChartConfig => ({
  maxDataPoints: 60,
  animationDuration: 300,
  barWidth: 3,
  barGap: 1,
  colors: {
    primary: getThemeColor('primary'),
    glow: getThemeColor('primary-light'),
    axis: getThemeColor('border-primary'),
    text: getThemeColor('text-tertiary'),
  },
});

const rangeLabel = (r: TimeRange) =>
  r === '1m' ? '1 minute' : r === '3m' ? '3 minutes' : r === '5m' ? '5 minutes' : '10 minutes';

export function LivePulseChart({ events, filters, onUpdateUniqueApps, onUpdateAllApps, onUpdateTimeRange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<ReturnType<typeof createChartRenderer> | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const processedEventIds = useRef(new Set<string>());
  const renderFnRef = useRef<() => void>(() => {});
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const chartHeightRef = useRef(96);

  const [windowHeight, setWindowHeight] = useState(() => typeof window !== 'undefined' ? window.innerHeight : 600);
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, text: '' });

  const chartHeight = windowHeight <= 400 ? 210 : 96;
  chartHeightRef.current = chartHeight;

  const { getHexColorForSession } = useEventColors();
  const {
    timeRange, dataPoints, addEvent, getChartData, setTimeRange,
    clearData,
    uniqueAgentCount, uniqueAgentIdsInWindow, allUniqueAgentIds,
    toolCallCount, eventTimingMetrics,
  } = useChartData();

  const timeRangeRef = useRef(timeRange);
  timeRangeRef.current = timeRange;

  const hasData = useMemo(() => dataPoints.some(dp => dp.count > 0), [dataPoints]);
  const totalEventCount = useMemo(() => dataPoints.reduce((sum, dp) => sum + dp.count, 0), [dataPoints]);
  const chartAriaLabel = useMemo(
    () => `Activity chart showing ${totalEventCount} events over the last ${rangeLabel(timeRange)}`,
    [totalEventCount, timeRange]
  );

  // Emit upstream
  useEffect(() => { onUpdateUniqueApps(uniqueAgentIdsInWindow); }, [uniqueAgentIdsInWindow]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onUpdateAllApps(allUniqueAgentIds); }, [allUniqueAgentIds]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onUpdateTimeRange(timeRange); }, [timeRange]); // eslint-disable-line react-hooks/exhaustive-deps

  const getDimensions = (): ChartDimensions => ({
    width: containerRef.current?.offsetWidth || 800,
    height: chartHeightRef.current,
    padding: { top: 7, right: 7, bottom: 20, left: 7 },
  });

  // Always keep renderFnRef up to date
  renderFnRef.current = () => {
    if (!rendererRef.current) return;
    const data = getChartData();
    const maxValue = Math.max(...data.map(d => d.count), 1);
    rendererRef.current.clear();
    rendererRef.current.drawBackground();
    rendererRef.current.drawAxes();
    rendererRef.current.drawTimeLabels(timeRangeRef.current);
    rendererRef.current.drawBars(data, maxValue, 1, getIconGroups, getHexColorForSession);
  };

  const animateNewEvent = (x: number, y: number) => {
    let radius = 0;
    let opacity = 0.8;
    const animate = () => {
      if (!rendererRef.current) return;
      renderFnRef.current();
      rendererRef.current.drawPulseEffect(x, y, radius, opacity);
      radius += 2;
      opacity -= 0.02;
      if (opacity > 0) animationFrameRef.current = requestAnimationFrame(animate);
      else animationFrameRef.current = null;
    };
    animate();
  };

  const isEventFiltered = (event: HookEvent): boolean => {
    const f = filtersRef.current;
    if (f.sourceApp && event.source_app !== f.sourceApp) return false;
    if (f.sessionId && event.session_id !== f.sessionId) return false;
    if (f.eventType && event.hook_event_type !== f.eventType) return false;
    return true;
  };

  const processNewEvents = () => {
    const currentEvents = eventsRef.current;
    const newEventsToProcess: HookEvent[] = [];

    currentEvents.forEach(event => {
      const eventKey = `${event.id}-${event.timestamp}`;
      if (!processedEventIds.current.has(eventKey)) {
        processedEventIds.current.add(eventKey);
        newEventsToProcess.push(event);
      }
    });

    newEventsToProcess.forEach(event => {
      if (event.hook_event_type !== 'refresh' && event.hook_event_type !== 'initial' && isEventFiltered(event)) {
        addEvent(event);
        if (rendererRef.current && canvasRef.current) {
          const chartArea = getDimensions();
          animateNewEvent(chartArea.width - chartArea.padding.right - 10, chartArea.height / 2);
        }
      }
    });

    const currentEventIds = new Set(currentEvents.map(e => `${e.id}-${e.timestamp}`));
    processedEventIds.current.forEach(id => { if (!currentEventIds.has(id)) processedEventIds.current.delete(id); });

    renderFnRef.current();
  };

  // Watch events
  useEffect(() => {
    if (events.length === 0) {
      clearData();
      processedEventIds.current.clear();
      renderFnRef.current();
      return;
    }
    processNewEvents();
  }, [events]); // eslint-disable-line react-hooks/exhaustive-deps

  // Watch filters — reset and reprocess
  const prevFiltersRef = useRef(JSON.stringify(filters));
  useEffect(() => {
    const filtersStr = JSON.stringify(filters);
    if (prevFiltersRef.current === filtersStr) return;
    prevFiltersRef.current = filtersStr;
    clearData();
    processedEventIds.current.clear();
    processNewEvents();
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  // Watch chartHeight — trigger resize
  useEffect(() => {
    if (!rendererRef.current) return;
    rendererRef.current.resize(getDimensions());
    renderFnRef.current();
  }, [chartHeight]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mount: setup renderer, observers, RAF loop, window resize
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    rendererRef.current = createChartRenderer(canvasRef.current, getDimensions(), getActiveConfig());

    const handleResize = () => {
      if (!rendererRef.current) return;
      rendererRef.current.resize(getDimensions());
      renderFnRef.current();
    };
    resizeObserverRef.current = new ResizeObserver(handleResize);
    resizeObserverRef.current.observe(containerRef.current);

    const themeObserver = new MutationObserver(() => { renderFnRef.current(); });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    const handleWindowResize = () => setWindowHeight(window.innerHeight);
    window.addEventListener('resize', handleWindowResize);

    renderFnRef.current();

    let stopped = false;
    let lastRenderTime = 0;
    const frameInterval = 1000 / 30;
    const renderLoop = (currentTime: number) => {
      if (stopped) return;
      if (currentTime - lastRenderTime >= frameInterval) {
        renderFnRef.current();
        lastRenderTime = currentTime - ((currentTime - lastRenderTime) % frameInterval);
      }
      requestAnimationFrame(renderLoop);
    };
    requestAnimationFrame(renderLoop);

    return () => {
      stopped = true;
      clearData();
      processedEventIds.current.clear();
      rendererRef.current?.stopAnimation();
      resizeObserverRef.current?.disconnect();
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      themeObserver.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const data = getChartData();
    const dim = getDimensions();
    const area = { x: dim.padding.left, y: dim.padding.top, width: dim.width - dim.padding.left - dim.padding.right, height: dim.height - dim.padding.top - dim.padding.bottom };
    const barIndex = Math.floor((x - area.x) / (area.width / data.length));
    if (barIndex >= 0 && barIndex < data.length && y >= area.y && y <= area.y + area.height) {
      const point = data[barIndex];
      if (point.count > 0) {
        const typesText = Object.entries(point.eventTypes || {}).map(([t, c]) => `${t}: ${c}`).join(', ');
        setTooltip({ visible: true, x: e.clientX - rect.left, y: e.clientY - rect.top - 30, text: `${point.count} events${typesText ? ` (${typesText})` : ''}` });
        return;
      }
    }
    setTooltip(t => ({ ...t, visible: false }));
  };

  const handleTimeRangeKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let newIndex = currentIndex;
    switch (e.key) {
      case 'ArrowLeft': newIndex = Math.max(0, currentIndex - 1); break;
      case 'ArrowRight': newIndex = Math.min(TIME_RANGES.length - 1, currentIndex + 1); break;
      case 'Home': newIndex = 0; break;
      case 'End': newIndex = TIME_RANGES.length - 1; break;
      default: return;
    }
    if (newIndex !== currentIndex) {
      e.preventDefault();
      setTimeRange(TIME_RANGES[newIndex]);
      const buttons = e.currentTarget.parentElement?.querySelectorAll('button');
      if (buttons?.[newIndex]) (buttons[newIndex] as HTMLButtonElement).focus();
    }
  };

  return (
    <div className="bg-gradient-to-r from-[var(--theme-bg-primary)] to-[var(--theme-bg-secondary)] px-3 py-4 mobile:py-2 shadow-lg">
      <div className="flex items-center justify-between mb-3 mobile:mb-2">
        <div className="flex items-center gap-3 mobile:gap-2">
          <h3 className="text-base mobile:text-xs font-bold text-[var(--theme-primary)] drop-shadow-sm flex items-center gap-1.5">
            <Activity size={16} className="flex-shrink-0" />
            <span className="mobile:hidden">Live Activity Pulse</span>
          </h3>
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1.5 px-2 py-1 bg-gradient-to-r from-[var(--theme-primary)]/10 to-[var(--theme-primary-light)]/10 rounded-lg border border-[var(--theme-primary)]/30 shadow-sm" title={`${uniqueAgentCount} active agent${uniqueAgentCount !== 1 ? 's' : ''}`}>
              <Users size={15} className="flex-shrink-0 text-[var(--theme-primary)]" />
              <span className="text-sm mobile:text-xs font-bold text-[var(--theme-primary)]">{uniqueAgentCount}</span>
              <span className="text-xs mobile:text-[10px] text-[var(--theme-text-tertiary)] font-medium mobile:hidden">agents</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-[var(--theme-bg-tertiary)] rounded-lg border border-[var(--theme-border-primary)] shadow-sm" title={`Total events in the last ${rangeLabel(timeRange)}`}>
              <Zap size={15} className="flex-shrink-0 text-[var(--theme-text-primary)]" />
              <span className="text-sm mobile:text-xs font-bold text-[var(--theme-text-primary)]">{totalEventCount}</span>
              <span className="text-xs mobile:text-[10px] text-[var(--theme-text-tertiary)] font-medium mobile:hidden">events</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-[var(--theme-bg-tertiary)] rounded-lg border border-[var(--theme-border-primary)] shadow-sm" title={`Total tool calls in the last ${rangeLabel(timeRange)}`}>
              <Wrench size={15} className="flex-shrink-0 text-[var(--theme-text-primary)]" />
              <span className="text-sm mobile:text-xs font-bold text-[var(--theme-text-primary)]">{toolCallCount}</span>
              <span className="text-xs mobile:text-[10px] text-[var(--theme-text-tertiary)] font-medium mobile:hidden">tools</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-[var(--theme-bg-tertiary)] rounded-lg border border-[var(--theme-border-primary)] shadow-sm" title={`Average time between events in the last ${rangeLabel(timeRange)}`}>
              <Clock size={15} className="flex-shrink-0 text-[var(--theme-text-primary)]" />
              <span className="text-sm mobile:text-xs font-bold text-[var(--theme-text-primary)]">{formatGap(eventTimingMetrics.avgGap)}</span>
              <span className="text-xs mobile:text-[10px] text-[var(--theme-text-tertiary)] font-medium mobile:hidden">avg gap</span>
            </div>
          </div>
        </div>
        <div className="flex gap-1.5 mobile:gap-1" role="tablist" aria-label="Time range selector">
          {TIME_RANGES.map((range, index) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              onKeyDown={e => handleTimeRangeKeyDown(e, index)}
              className={clsx(
                'px-3 py-1.5 mobile:px-2 mobile:py-1 text-sm mobile:text-xs font-bold rounded-lg transition-all duration-200 min-w-[30px] mobile:min-w-[24px] min-h-[30px] mobile:min-h-[24px] flex items-center justify-center shadow-md hover:shadow-lg transform hover:scale-105 border',
                timeRange === range
                  ? 'bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-primary-light)] text-white border-[var(--theme-primary-dark)] drop-shadow-md'
                  : 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)] border-[var(--theme-border-primary)] hover:bg-[var(--theme-bg-quaternary)] hover:border-[var(--theme-primary)]'
              )}
              role="tab"
              aria-selected={timeRange === range}
              aria-label={`Show ${rangeLabel(range)} of activity`}
              tabIndex={timeRange === range ? 0 : -1}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      <div ref={containerRef} className="relative">
        <canvas
          ref={canvasRef}
          className="w-full cursor-crosshair"
          style={{ height: chartHeight }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setTooltip(t => ({ ...t, visible: false }))}
          role="img"
          aria-label={chartAriaLabel}
        />
        {tooltip.visible && (
          <div
            className="absolute bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-primary-dark)] text-white px-2 py-1.5 mobile:px-3 mobile:py-2 rounded-lg text-xs mobile:text-sm pointer-events-none z-10 shadow-lg border border-[var(--theme-primary-light)] font-bold drop-shadow-md"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            {tooltip.text}
          </div>
        )}
        {!hasData && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-[var(--theme-text-tertiary)] mobile:text-sm text-base font-semibold flex items-center">
              <Loader2 size={15} className="mr-1.5 flex-shrink-0 animate-spin" />
              Waiting for events...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
