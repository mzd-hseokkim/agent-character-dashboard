import { useState, useEffect } from 'react';
import type { FilterOptions } from '../types/index';
import { API_BASE_URL } from '../config';

interface Filters {
  sourceApp: string;
  sessionId: string;
  eventType: string;
}

interface Props {
  filters: Filters;
  onUpdateFilters: (filters: Filters) => void;
}

const SELECT_CLASS = 'w-full px-4 py-2 mobile:px-2 mobile:py-1.5 text-base mobile:text-sm border border-[var(--theme-primary)] rounded-lg focus:ring-2 focus:ring-[var(--theme-primary)]/30 focus:border-[var(--theme-primary-dark)] bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] shadow-md hover:shadow-lg transition-all duration-200';

export function FilterPanel({ filters, onUpdateFilters }: Props) {
  const [options, setOptions] = useState<FilterOptions>({ source_apps: [], session_ids: [], hook_event_types: [] });

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/events/filter-options`);
        if (res.ok) setOptions(await res.json());
      } catch { /* ignore */ }
    };
    fetchOptions();
    const interval = setInterval(fetchOptions, 10000);
    return () => clearInterval(interval);
  }, []);

  const hasActiveFilters = filters.sourceApp || filters.sessionId || filters.eventType;

  return (
    <div className="bg-gradient-to-r from-[var(--theme-bg-primary)] to-[var(--theme-bg-secondary)] border-b-2 border-[var(--theme-primary)] px-3 py-4 mobile:py-2 shadow-lg">
      <div className="flex flex-wrap gap-3 items-center mobile:flex-col mobile:items-stretch">
        <div className="flex-1 min-w-0 mobile:w-full">
          <label className="block text-base mobile:text-sm font-bold text-[var(--theme-primary)] mb-1.5 drop-shadow-sm">Source App</label>
          <select className={SELECT_CLASS} value={filters.sourceApp} onChange={e => onUpdateFilters({ ...filters, sourceApp: e.target.value })}>
            <option value="">All Sources</option>
            {options.source_apps.map(app => <option key={app} value={app}>{app}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-0 mobile:w-full">
          <label className="block text-base mobile:text-sm font-bold text-[var(--theme-primary)] mb-1.5 drop-shadow-sm">Session ID</label>
          <select className={SELECT_CLASS} value={filters.sessionId} onChange={e => onUpdateFilters({ ...filters, sessionId: e.target.value })}>
            <option value="">All Sessions</option>
            {options.session_ids.map(s => <option key={s} value={s}>{s.slice(0, 8)}...</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-0 mobile:w-full">
          <label className="block text-base mobile:text-sm font-bold text-[var(--theme-primary)] mb-1.5 drop-shadow-sm">Event Type</label>
          <select className={SELECT_CLASS} value={filters.eventType} onChange={e => onUpdateFilters({ ...filters, eventType: e.target.value })}>
            <option value="">All Types</option>
            {options.hook_event_types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {hasActiveFilters && (
          <button
            onClick={() => onUpdateFilters({ sourceApp: '', sessionId: '', eventType: '' })}
            className="px-4 py-2 mobile:px-2 mobile:py-1.5 mobile:w-full text-base mobile:text-sm font-medium text-[var(--theme-text-secondary)] bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-bg-quaternary)] border border-[var(--theme-border-primary)] hover:border-[var(--theme-primary)] rounded-md transition-colors shadow-sm"
          >
            Clear Filters
          </button>
        )}
      </div>
    </div>
  );
}
