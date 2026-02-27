import { useState, useMemo } from 'react';
import type { HookEvent } from '../types/index';

const getSearchableText = (event: HookEvent): string => {
  const parts: string[] = [];
  if (event.hook_event_type) parts.push(event.hook_event_type);
  if (event.source_app) parts.push(event.source_app);
  if (event.session_id) parts.push(event.session_id);
  if (event.model_name) parts.push(event.model_name);
  const p = event.payload as Record<string, unknown>;
  if (p?.tool_name) parts.push(String(p.tool_name));
  if (p?.tool_command) parts.push(String(p.tool_command));
  if ((p?.tool_file as Record<string, unknown>)?.path) parts.push(String((p.tool_file as Record<string, unknown>).path));
  if (event.summary) parts.push(event.summary);
  if (event.humanInTheLoop?.question) parts.push(event.humanInTheLoop.question);
  return parts.join(' ').toLowerCase();
};

const validateRegex = (pattern: string): { valid: boolean; error?: string } => {
  if (!pattern || pattern.trim() === '') return { valid: true };
  try {
    new RegExp(pattern);
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : 'Invalid regex pattern' };
  }
};

export function useEventSearch() {
  const [searchPattern, setSearchPattern] = useState<string>('');
  const [searchError, setSearchError] = useState<string>('');

  const hasError = useMemo(() => searchError.length > 0, [searchError]);

  const matchesPattern = (event: HookEvent, pattern: string): boolean => {
    if (!pattern || pattern.trim() === '') return true;
    if (!validateRegex(pattern).valid) return false;
    try {
      return new RegExp(pattern, 'i').test(getSearchableText(event));
    } catch {
      return false;
    }
  };

  const searchEvents = (events: HookEvent[], pattern: string): HookEvent[] => {
    if (!pattern || pattern.trim() === '') return events;
    return events.filter(event => matchesPattern(event, pattern));
  };

  const updateSearchPattern = (pattern: string) => {
    setSearchPattern(pattern);
    if (!pattern || pattern.trim() === '') {
      setSearchError('');
      return;
    }
    const validation = validateRegex(pattern);
    setSearchError(validation.valid ? '' : (validation.error ?? 'Invalid regex pattern'));
  };

  const clearSearch = () => {
    setSearchPattern('');
    setSearchError('');
  };

  return {
    searchPattern,
    searchError,
    hasError,
    validateRegex,
    matchesPattern,
    searchEvents,
    updateSearchPattern,
    clearSearch,
    getSearchableText,
  };
}
