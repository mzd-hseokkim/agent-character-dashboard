import { useRef, useEffect, useMemo, useState } from 'react';
import { Brain, Zap, Wrench, Clock, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import type { HookEvent, TimeRange, ChartConfig } from '../types';
import { useAgentChartData } from '../hooks/useAgentChartData';
import { createChartRenderer, type ChartDimensions } from '../utils/chartRenderer';
import { getIconGroups } from '../utils/canvasIcons';
import { useEventColors } from '../hooks/useEventColors';
import styles from './AgentSwimLane.module.css';

interface Props {
  agentName: string;
  events: HookEvent[];
  timeRange: TimeRange;
  onClose: () => void;
}

const CHART_HEIGHT = 80;

const formatGap = (gapMs: number): string => {
  if (gapMs === 0) return '—';
  if (gapMs < 1000) return `${Math.round(gapMs)}ms`;
  return `${(gapMs / 1000).toFixed(1)}s`;
};

const formatModelName = (name: string | null | undefined): string => {
  if (!name) return '';
  const parts = name.split('-');
  if (parts.length >= 4) return `${parts[1]}-${parts[2]}-${parts[3]}`;
  return name;
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

export function AgentSwimLane({ agentName, events, timeRange, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<ReturnType<typeof createChartRenderer> | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const processedEventIds = useRef(new Set<string>());
  const renderFnRef = useRef<() => void>(() => {});
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const timeRangeRef = useRef(timeRange);
  timeRangeRef.current = timeRange;

  const [hoveredEventCount, setHoveredEventCount] = useState(false);
  const [hoveredToolCount, setHoveredToolCount] = useState(false);
  const [hoveredAvgTime, setHoveredAvgTime] = useState(false);
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, text: '' });

  const { getHexColorForApp, getHexColorForSession } = useEventColors();
  const { dataPoints, addEvent, getChartData, setTimeRange, clearData: cleanupChartData, eventTimingMetrics: agentEventTimingMetrics } = useAgentChartData(agentName);

  const appName = agentName.split(':')[0];
  const sessionId = agentName.split(':')[1];

  const modelName = useMemo(() => {
    const [targetApp, targetSession] = agentName.split(':');
    const agentEvents = events
      .filter(e => e.source_app === targetApp && e.session_id.slice(0, 8) === targetSession && e.model_name);
    if (!agentEvents.length) return null;
    return agentEvents[agentEvents.length - 1].model_name;
  }, [events, agentName]);

  const hasData = useMemo(() => dataPoints.some(dp => dp.count > 0), [dataPoints]);
  const totalEventCount = useMemo(() => dataPoints.reduce((sum, dp) => sum + dp.count, 0), [dataPoints]);
  const toolCallCount = useMemo(() => dataPoints.reduce((sum, dp) => sum + (dp.eventTypes?.['PreToolUse'] || 0), 0), [dataPoints]);
  const chartAriaLabel = useMemo(() => {
    const [app, session] = agentName.split(':');
    return `Activity chart for ${app} (session: ${session}) showing ${totalEventCount} events`;
  }, [agentName, totalEventCount]);

  const getDimensions = (): ChartDimensions => ({
    width: containerRef.current?.offsetWidth || 800,
    height: CHART_HEIGHT,
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

  const processNewEvents = () => {
    const currentEvents = eventsRef.current;
    const [targetApp, targetSession] = agentName.split(':');
    const newEventsToProcess: HookEvent[] = [];

    currentEvents.forEach(event => {
      const eventKey = `${event.id}-${event.timestamp}`;
      if (!processedEventIds.current.has(eventKey)) {
        processedEventIds.current.add(eventKey);
        newEventsToProcess.push(event);
      }
    });

    newEventsToProcess.forEach(event => {
      if (
        event.hook_event_type !== 'refresh' &&
        event.hook_event_type !== 'initial' &&
        event.source_app === targetApp &&
        event.session_id.slice(0, 8) === targetSession
      ) {
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
  useEffect(() => { processNewEvents(); }, [events]); // eslint-disable-line react-hooks/exhaustive-deps

  // Watch timeRange
  useEffect(() => {
    setTimeRange(timeRange);
    renderFnRef.current();
  }, [timeRange]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mount: setup renderer + RAF loop
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
      cleanupChartData();
      rendererRef.current?.stopAnimation();
      resizeObserverRef.current?.disconnect();
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      themeObserver.disconnect();
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

  return (
    <div className={styles.agentSwimLane}>
      <div className={styles.laneHeader}>
        <div className={styles.headerLeft}>
          <div className={styles.agentLabelContainer}>
            <span className={styles.agentLabelApp} style={{ backgroundColor: getHexColorForApp(appName), borderColor: getHexColorForApp(appName) }}>
              <span className="font-mono text-xs">{appName}</span>
            </span>
            <span className={styles.agentLabelSession} style={{ backgroundColor: getHexColorForSession(sessionId), borderColor: getHexColorForSession(sessionId) }}>
              <span className="font-mono text-xs">{sessionId}</span>
            </span>
          </div>
          {modelName && (
            <div className={styles.modelBadge} title={`Model: ${modelName}`}>
              <Brain size={15} className="flex-shrink-0" />
              <span className="text-xs font-bold">{formatModelName(modelName)}</span>
            </div>
          )}
          <div
            className={styles.eventCountBadge}
            onMouseOver={() => setHoveredEventCount(true)}
            onMouseLeave={() => setHoveredEventCount(false)}
            title={`Total events in the last ${timeRange}`}
          >
            <Zap size={15} className="flex-shrink-0" />
            <span className={clsx('text-xs font-bold', hoveredEventCount && 'min-w-[65px]')}>
              {hoveredEventCount ? `${totalEventCount} Events` : totalEventCount}
            </span>
          </div>
          <div
            className={styles.toolCallBadge}
            onMouseOver={() => setHoveredToolCount(true)}
            onMouseLeave={() => setHoveredToolCount(false)}
            title={`Tool calls in the last ${timeRange}`}
          >
            <Wrench size={15} className="flex-shrink-0" />
            <span className={clsx('text-xs font-bold', hoveredToolCount && 'min-w-[75px]')}>
              {hoveredToolCount ? `${toolCallCount} Tool Calls` : toolCallCount}
            </span>
          </div>
          <div
            className={clsx(styles.avgTimeBadge, 'flex items-center gap-1.5 px-2 py-2 bg-[var(--theme-bg-tertiary)] rounded-lg border border-[var(--theme-border-primary)] shadow-sm min-h-[28px]')}
            onMouseOver={() => setHoveredAvgTime(true)}
            onMouseLeave={() => setHoveredAvgTime(false)}
            title={`Average time between events in the last ${timeRange}`}
          >
            <Clock size={15} className="flex-shrink-0" />
            <span className={clsx('text-sm font-bold text-[var(--theme-text-primary)]', hoveredAvgTime && 'min-w-[90px]')}>
              {hoveredAvgTime ? `Avg Gap: ${formatGap(agentEventTimingMetrics.avgGap)}` : formatGap(agentEventTimingMetrics.avgGap)}
            </span>
          </div>
        </div>
        <button onClick={onClose} className={styles.closeBtn} title="Remove this swim lane">✕</button>
      </div>
      <div ref={containerRef} className={styles.chartWrapper}>
        <canvas
          ref={canvasRef}
          className="w-full cursor-crosshair"
          style={{ height: CHART_HEIGHT }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setTooltip(t => ({ ...t, visible: false }))}
          role="img"
          aria-label={chartAriaLabel}
        />
        {tooltip.visible && (
          <div
            className="absolute bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-primary-dark)] text-white px-2 py-1.5 rounded-lg text-xs pointer-events-none z-10 shadow-lg border border-[var(--theme-primary-light)] font-bold drop-shadow-md"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            {tooltip.text}
          </div>
        )}
        {!hasData && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-[var(--theme-text-tertiary)] text-sm font-semibold flex items-center">
              <Loader2 size={14} className="mr-1 flex-shrink-0 animate-spin" />
              Waiting for events...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
