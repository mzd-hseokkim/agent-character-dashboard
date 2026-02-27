import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import type { HookEvent, ChartDataPoint, TimeRange } from '../types/index';

const timeRangeConfig = {
  '1m':  { duration: 60 * 1000,      bucketSize: 1000,  maxPoints: 60 },
  '3m':  { duration: 3 * 60 * 1000,  bucketSize: 3000,  maxPoints: 60 },
  '5m':  { duration: 5 * 60 * 1000,  bucketSize: 5000,  maxPoints: 60 },
  '10m': { duration: 10 * 60 * 1000, bucketSize: 10000, maxPoints: 60 },
} as const;

const parseAgentId = (agentId: string) => {
  const parts = agentId.split(':');
  return parts.length === 2 ? { app: parts[0], session: parts[1] } : null;
};

export function useChartData(agentIdFilter?: string) {
  const [timeRange, setTimeRangeState] = useState<TimeRange>('1m');
  const [dataPoints, setDataPoints] = useState<ChartDataPoint[]>([]);
  // Force re-render ticker for computed values that depend on time
  const [tick, setTick] = useState(0);

  const allEventsRef = useRef<HookEvent[]>([]);
  const eventBufferRef = useRef<HookEvent[]>([]);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeRangeRef = useRef<TimeRange>('1m');

  const agentIdParsed = useMemo(() => agentIdFilter ? parseAgentId(agentIdFilter) : null, [agentIdFilter]);

  const getCurrentConfig = useCallback(() => timeRangeConfig[timeRangeRef.current], []);

  const getBucketTimestamp = useCallback((timestamp: number) => {
    const config = getCurrentConfig();
    return Math.floor(timestamp / config.bucketSize) * config.bucketSize;
  }, [getCurrentConfig]);

  const cleanOldData = useCallback((points: ChartDataPoint[]): ChartDataPoint[] => {
    const now = Date.now();
    const config = getCurrentConfig();
    const cutoffTime = now - config.duration;
    let filtered = points.filter(dp => dp.timestamp >= cutoffTime);
    if (filtered.length > config.maxPoints) filtered = filtered.slice(-config.maxPoints);
    return filtered;
  }, [getCurrentConfig]);

  const cleanOldEvents = useCallback(() => {
    const cutoffTime = Date.now() - 5 * 60 * 1000;
    allEventsRef.current = allEventsRef.current.filter(e => e.timestamp && e.timestamp >= cutoffTime);
  }, []);

  const processEventBuffer = useCallback(() => {
    const eventsToProcess = [...eventBufferRef.current];
    eventBufferRef.current = [];
    allEventsRef.current.push(...eventsToProcess);

    setDataPoints(prev => {
      const updated = [...prev];
      eventsToProcess.forEach(event => {
        if (!event.timestamp) return;
        if (agentIdParsed) {
          if (event.source_app !== agentIdParsed.app) return;
          if (event.session_id.slice(0, 8) !== agentIdParsed.session) return;
        }
        const bucketTime = getBucketTimestamp(event.timestamp);
        const bucket = updated.find(dp => dp.timestamp === bucketTime);
        if (bucket) {
          bucket.count++;
          bucket.eventTypes[event.hook_event_type] = (bucket.eventTypes[event.hook_event_type] || 0) + 1;
          if (event.payload?.tool_name) {
            const key = `${event.hook_event_type}:${event.payload.tool_name}`;
            bucket.toolEvents = bucket.toolEvents || {};
            bucket.toolEvents[key] = (bucket.toolEvents[key] || 0) + 1;
          }
          bucket.sessions = bucket.sessions || {};
          bucket.sessions[event.session_id] = (bucket.sessions[event.session_id] || 0) + 1;
        } else {
          const toolEvents: Record<string, number> = {};
          if (event.payload?.tool_name) {
            toolEvents[`${event.hook_event_type}:${event.payload.tool_name}`] = 1;
          }
          updated.push({ timestamp: bucketTime, count: 1, eventTypes: { [event.hook_event_type]: 1 }, toolEvents, sessions: { [event.session_id]: 1 } });
        }
      });
      return cleanOldData(updated);
    });
    cleanOldEvents();
  }, [agentIdParsed, getBucketTimestamp, cleanOldData, cleanOldEvents]);

  const addEvent = useCallback((event: HookEvent) => {
    eventBufferRef.current.push(event);
    if (debounceTimerRef.current !== null) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      processEventBuffer();
      debounceTimerRef.current = null;
    }, 50);
  }, [processEventBuffer]);

  const reaggregateData = useCallback((newRange: TimeRange) => {
    const config = timeRangeConfig[newRange];
    const now = Date.now();
    const cutoffTime = now - config.duration;
    const getBucket = (ts: number) => Math.floor(ts / config.bucketSize) * config.bucketSize;

    let relevantEvents = allEventsRef.current.filter(e => e.timestamp && e.timestamp >= cutoffTime);
    if (agentIdParsed) {
      relevantEvents = relevantEvents.filter(e =>
        e.source_app === agentIdParsed.app && e.session_id.slice(0, 8) === agentIdParsed.session
      );
    }

    const newPoints: ChartDataPoint[] = [];
    relevantEvents.forEach(event => {
      if (!event.timestamp) return;
      const bucketTime = getBucket(event.timestamp);
      const bucket = newPoints.find(dp => dp.timestamp === bucketTime);
      if (bucket) {
        bucket.count++;
        bucket.eventTypes[event.hook_event_type] = (bucket.eventTypes[event.hook_event_type] || 0) + 1;
        if (event.payload?.tool_name) {
          const key = `${event.hook_event_type}:${event.payload.tool_name}`;
          bucket.toolEvents = bucket.toolEvents || {};
          bucket.toolEvents[key] = (bucket.toolEvents[key] || 0) + 1;
        }
        bucket.sessions = bucket.sessions || {};
        bucket.sessions[event.session_id] = (bucket.sessions[event.session_id] || 0) + 1;
      } else {
        const toolEvents: Record<string, number> = {};
        if (event.payload?.tool_name) {
          toolEvents[`${event.hook_event_type}:${event.payload.tool_name}`] = 1;
        }
        newPoints.push({ timestamp: bucketTime, count: 1, eventTypes: { [event.hook_event_type]: 1 }, toolEvents, sessions: { [event.session_id]: 1 } });
      }
    });
    let filtered = newPoints.filter(dp => dp.timestamp >= cutoffTime);
    if (filtered.length > config.maxPoints) filtered = filtered.slice(-config.maxPoints);
    setDataPoints(filtered);
  }, [agentIdParsed]);

  const setTimeRange = useCallback((range: TimeRange) => {
    timeRangeRef.current = range;
    setTimeRangeState(range);
    reaggregateData(range);
  }, [reaggregateData]);

  const getChartData = useCallback((): ChartDataPoint[] => {
    const now = Date.now();
    const config = getCurrentConfig();
    const startTime = now - config.duration;
    const getBucket = (ts: number) => Math.floor(ts / config.bucketSize) * config.bucketSize;
    const buckets: ChartDataPoint[] = [];
    for (let time = startTime; time <= now; time += config.bucketSize) {
      const bucketTime = getBucket(time);
      const existing = dataPoints.find(dp => dp.timestamp === bucketTime);
      buckets.push({ timestamp: bucketTime, count: existing?.count || 0, eventTypes: existing?.eventTypes || {}, toolEvents: existing?.toolEvents || {}, sessions: existing?.sessions || {} });
    }
    return buckets.slice(-config.maxPoints);
  }, [dataPoints, getCurrentConfig]);

  const clearData = useCallback(() => {
    setDataPoints([]);
    allEventsRef.current = [];
    eventBufferRef.current = [];
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const createAgentId = (sourceApp: string, sessionId: string) => `${sourceApp}:${sessionId.slice(0, 8)}`;

  // Auto-clean + tick interval
  useEffect(() => {
    const interval = setInterval(() => {
      setDataPoints(prev => cleanOldData(prev));
      cleanOldEvents();
      setTick(t => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [cleanOldData, cleanOldEvents]);

  const currentConfig = useMemo(() => timeRangeConfig[timeRange], [timeRange]);

  const uniqueAgentIdsInWindow = useMemo(() => {
    void tick;
    const now = Date.now();
    const cutoffTime = now - currentConfig.duration;
    const unique = new Set<string>();
    allEventsRef.current.forEach(e => {
      if (e.timestamp && e.timestamp >= cutoffTime) unique.add(createAgentId(e.source_app, e.session_id));
    });
    return Array.from(unique);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, currentConfig]);

  const allUniqueAgentIds = useMemo(() => {
    void tick;
    const unique = new Set<string>();
    allEventsRef.current.forEach(e => unique.add(createAgentId(e.source_app, e.session_id)));
    return Array.from(unique);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const uniqueAgentCount = useMemo(() => uniqueAgentIdsInWindow.length, [uniqueAgentIdsInWindow]);

  const toolCallCount = useMemo(() =>
    dataPoints.reduce((sum, dp) => sum + (dp.eventTypes?.['PreToolUse'] || 0), 0),
    [dataPoints]
  );

  const eventTimingMetrics = useMemo(() => {
    void tick;
    const now = Date.now();
    const cutoffTime = now - currentConfig.duration;
    const windowEvents = allEventsRef.current
      .filter(e => e.timestamp && e.timestamp >= cutoffTime)
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    if (windowEvents.length < 2) return { minGap: 0, maxGap: 0, avgGap: 0 };
    const gaps: number[] = [];
    for (let i = 1; i < windowEvents.length; i++) {
      const gap = (windowEvents[i].timestamp || 0) - (windowEvents[i - 1].timestamp || 0);
      if (gap > 0) gaps.push(gap);
    }
    if (gaps.length === 0) return { minGap: 0, maxGap: 0, avgGap: 0 };
    return { minGap: Math.min(...gaps), maxGap: Math.max(...gaps), avgGap: gaps.reduce((a, b) => a + b, 0) / gaps.length };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, currentConfig]);

  return {
    timeRange,
    dataPoints,
    addEvent,
    getChartData,
    setTimeRange,
    clearData,
    currentConfig,
    uniqueAgentCount,
    uniqueAgentIdsInWindow,
    allUniqueAgentIds,
    toolCallCount,
    eventTimingMetrics,
  };
}
