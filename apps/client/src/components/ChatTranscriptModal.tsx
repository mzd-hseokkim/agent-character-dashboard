import { useState, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { ChatTranscript } from './ChatTranscript';

interface Props {
  isOpen: boolean;
  chat: unknown[];
  onClose: () => void;
}

const FILTERS = [
  { type: 'user', label: 'User', icon: '👤' },
  { type: 'assistant', label: 'Assistant', icon: '🤖' },
  { type: 'system', label: 'System', icon: '⚙️' },
  { type: 'tool_use', label: 'Tool Use', icon: '🔧' },
  { type: 'tool_result', label: 'Tool Result', icon: '✅' },
  { type: 'Read', label: 'Read', icon: '📄' },
  { type: 'Write', label: 'Write', icon: '✍️' },
  { type: 'Edit', label: 'Edit', icon: '✏️' },
  { type: 'Glob', label: 'Glob', icon: '🔎' },
];

function matchesSearch(item: unknown, query: string): boolean {
  const lowerQuery = query.toLowerCase().trim();
  const i = item as Record<string, unknown>;

  if (typeof i.content === 'string') {
    const cleanContent = i.content.replace(/\u001b\[[0-9;]*m/g, '').toLowerCase();
    if (cleanContent.includes(lowerQuery)) return true;
  }
  if (i.role && String(i.role).toLowerCase().includes(lowerQuery)) return true;

  if (i.message) {
    const msg = i.message as Record<string, unknown>;
    if (msg.role && String(msg.role).toLowerCase().includes(lowerQuery)) return true;
    if (msg.content) {
      if (typeof msg.content === 'string' && msg.content.toLowerCase().includes(lowerQuery)) return true;
      if (Array.isArray(msg.content)) {
        for (const c of msg.content as Record<string, unknown>[]) {
          if (c.text && String(c.text).toLowerCase().includes(lowerQuery)) return true;
          if (c.name && String(c.name).toLowerCase().includes(lowerQuery)) return true;
          if (c.input && JSON.stringify(c.input).toLowerCase().includes(lowerQuery)) return true;
          if (c.content && typeof c.content === 'string' && c.content.toLowerCase().includes(lowerQuery)) return true;
        }
      }
    }
  }
  if (i.type && String(i.type).toLowerCase().includes(lowerQuery)) return true;
  if (i.uuid && String(i.uuid).toLowerCase().includes(lowerQuery)) return true;
  if (i.sessionId && String(i.sessionId).toLowerCase().includes(lowerQuery)) return true;
  if (i.toolUseResult && JSON.stringify(i.toolUseResult).toLowerCase().includes(lowerQuery)) return true;
  return false;
}

function matchesFilters(item: unknown, activeFilters: string[]): boolean {
  if (activeFilters.length === 0) return true;
  const i = item as Record<string, unknown>;

  if (i.type && activeFilters.includes(String(i.type))) return true;
  if (i.role && activeFilters.includes(String(i.role))) return true;

  if (i.type === 'system' && i.content) {
    const content = String(i.content);
    const hookMatch = content.match(/([A-Za-z]+):/)?.[1];
    if (hookMatch && activeFilters.includes(hookMatch)) return true;
    const toolNames = ['Read', 'Write', 'Edit', 'Glob'];
    for (const tool of toolNames) {
      if (content.includes(tool) && activeFilters.includes(tool)) return true;
    }
  }

  const msg = i.message as Record<string, unknown> | undefined;
  if (msg?.content && Array.isArray(msg.content)) {
    for (const c of msg.content as Record<string, unknown>[]) {
      if (c.type === 'tool_use') {
        if (activeFilters.includes('tool_use')) return true;
        if (c.name && activeFilters.includes(String(c.name))) return true;
      }
      if (c.type === 'tool_result' && activeFilters.includes('tool_result')) return true;
    }
  }
  return false;
}

export function ChatTranscriptModal({ isOpen, chat, onClose }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchQuery, setActiveSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [copyAllButtonText, setCopyAllButtonText] = useState('📋 Copy All');

  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) close();
    };
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, [isOpen, close]);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setActiveSearchQuery('');
      setActiveFilters([]);
    }
  }, [isOpen]);

  const filteredChat = useMemo(() => {
    if (!activeSearchQuery && activeFilters.length === 0) return chat;
    return chat.filter(item => {
      const matchesQuery = !activeSearchQuery || matchesSearch(item, activeSearchQuery);
      const matchesFilter = matchesFilters(item, activeFilters);
      return matchesQuery && matchesFilter;
    });
  }, [chat, activeSearchQuery, activeFilters]);

  const toggleFilter = (type: string) => {
    setActiveFilters(prev =>
      prev.includes(type) ? prev.filter(f => f !== type) : [...prev, type]
    );
  };

  const executeSearch = () => setActiveSearchQuery(searchQuery);

  const clearSearch = () => {
    setSearchQuery('');
    setActiveSearchQuery('');
    setActiveFilters([]);
  };

  const copyAllMessages = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(chat, null, 2));
      setCopyAllButtonText('✅ Copied!');
      setTimeout(() => setCopyAllButtonText('📋 Copy All'), 2000);
    } catch {
      setCopyAllButtonText('❌ Failed');
      setTimeout(() => setCopyAllButtonText('📋 Copy All'), 2000);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 mobile:p-0">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={close}
      />

      {/* Modal */}
      <div
        className="relative bg-white dark:bg-gray-800 rounded-lg mobile:rounded-none shadow-xl flex flex-col overflow-hidden z-10 mobile:w-full mobile:h-full mobile:fixed mobile:inset-0"
        style={{ width: '85vw', height: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6 mobile:p-3">
          <div className="flex items-center justify-between mb-4 mobile:mb-2">
            <h2 className="text-3xl mobile:text-lg font-semibold text-gray-900 dark:text-white">
              💬 Chat Transcript
            </h2>
            <button
              onClick={close}
              className="p-2 mobile:p-3 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <svg className="w-6 h-6 mobile:w-5 mobile:h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-4">
            {/* Search Input */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyUp={e => e.key === 'Enter' && executeSearch()}
                  placeholder="Search transcript..."
                  className="w-full px-4 py-2 mobile:px-3 mobile:py-2 pl-10 mobile:pl-8 text-lg mobile:text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
                <svg className="absolute left-3 top-3 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <button
                onClick={executeSearch}
                className="px-4 py-2 mobile:px-3 mobile:py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors text-base mobile:text-sm min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                Search
              </button>
              <button
                onClick={copyAllMessages}
                title="Copy all messages as JSON"
                className="px-4 py-2 mobile:px-3 mobile:py-2 bg-gray-500 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors text-base mobile:text-sm min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                {copyAllButtonText}
              </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-2 mobile:gap-1 max-h-24 mobile:max-h-32 overflow-y-auto p-2 mobile:p-1 bg-gray-50 dark:bg-gray-900/50 rounded-lg mobile:overflow-x-auto mobile:pb-2">
              {FILTERS.map(filter => (
                <button
                  key={filter.type}
                  onClick={() => toggleFilter(filter.type)}
                  className={clsx(
                    'px-4 py-2 mobile:px-3 mobile:py-1.5 rounded-full text-sm mobile:text-xs font-medium transition-colors min-h-[44px] mobile:min-h-[36px] flex items-center whitespace-nowrap',
                    activeFilters.includes(filter.type)
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  )}
                >
                  <span className="mr-1">{filter.icon}</span>
                  {filter.label}
                </button>
              ))}
              {(searchQuery || activeSearchQuery || activeFilters.length > 0) && (
                <button
                  onClick={clearSearch}
                  className="px-4 py-2 mobile:px-3 mobile:py-1.5 rounded-full text-sm mobile:text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 min-h-[44px] mobile:min-h-[36px] flex items-center whitespace-nowrap"
                >
                  Clear All
                </button>
              )}
            </div>

            {/* Results Count */}
            {(activeSearchQuery || activeFilters.length > 0) && (
              <div className="text-sm mobile:text-xs text-gray-500 dark:text-gray-400">
                Showing {filteredChat.length} of {chat.length} messages
                {activeSearchQuery && (
                  <span className="ml-2 font-medium mobile:block mobile:ml-0 mobile:mt-1">
                    (searching for "{activeSearchQuery}")
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 mobile:p-3 overflow-hidden flex flex-col">
          <ChatTranscript chat={filteredChat} />
        </div>
      </div>
    </div>,
    document.body
  );
}
