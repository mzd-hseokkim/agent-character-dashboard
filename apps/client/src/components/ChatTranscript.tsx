import { useState, useMemo } from 'react';

interface Props {
  chat: unknown[];
}

const cleanSystemContent = (content: string) => content.replace(/\u001b\[[0-9;]*m/g, '');
const cleanCommandContent = (content: string) =>
  content
    .replace(/<command-message>.*?<\/command-message>/gs, '')
    .replace(/<command-name>(.*?)<\/command-name>/gs, '$1')
    .trim();
const formatTimestamp = (ts: string) => new Date(ts).toLocaleTimeString();

export function ChatTranscript({ chat }: Props) {
  const [expandedDetails, setExpandedDetails] = useState<Set<number>>(new Set());
  const [copyStates, setCopyStates] = useState<Map<number, string>>(new Map());

  const chatItems = useMemo(() => chat, [chat]);

  const toggleDetails = (index: number) => {
    setExpandedDetails(prev => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  };

  const copyMessage = async (index: number) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(chatItems[index], null, 2));
      setCopyStates(prev => new Map(prev).set(index, '✅'));
      setTimeout(() => setCopyStates(prev => { const m = new Map(prev); m.delete(index); return m; }), 2000);
    } catch {
      setCopyStates(prev => new Map(prev).set(index, '❌'));
      setTimeout(() => setCopyStates(prev => { const m = new Map(prev); m.delete(index); return m; }), 2000);
    }
  };

  const ActionButtons = ({ index, typeOrRole }: { index: number; typeOrRole: string }) => (
    <div className="flex items-center space-x-1 ml-2">
      <button onClick={() => toggleDetails(index)} className="px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors">
        {expandedDetails.has(index) ? 'Hide' : 'Show'} Details
      </button>
      <button onClick={() => copyMessage(index)} title={`Copy ${typeOrRole} message`} className="px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors flex items-center">
        {copyStates.get(index) || '📋'}
      </button>
    </div>
  );

  const DetailsSection = ({ index }: { index: number }) => (
    expandedDetails.has(index) ? (
      <div className="mt-3 p-3 bg-gray-100 dark:bg-gray-900 rounded-lg">
        <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto">{JSON.stringify(chatItems[index], null, 2)}</pre>
      </div>
    ) : null
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 h-full overflow-y-auto space-y-3 border-2 border-gray-300 dark:border-gray-600">
      {chatItems.map((item, index) => {
        const i = item as Record<string, unknown>;

        if (i.type === 'user' && i.message) {
          const msg = i.message as Record<string, unknown>;
          const content = msg.content;
          return (
            <div key={index} className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/30">
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3 flex-1">
                  <span className="text-lg font-semibold px-3 py-1 rounded-full flex-shrink-0 bg-blue-500 text-white">User</span>
                  <div className="flex-1">
                    {typeof content === 'string' ? (
                      <p className="text-lg text-gray-800 dark:text-gray-100 whitespace-pre-wrap font-medium">
                        {content.includes('<command-') ? cleanCommandContent(content) : content}
                      </p>
                    ) : Array.isArray(content) ? (
                      <div className="space-y-2">
                        {(content as Record<string, unknown>[]).map((c, ci) => (
                          <div key={ci}>
                            {c.type === 'text' && <p className="text-lg text-gray-800 dark:text-gray-100 whitespace-pre-wrap font-medium">{String(c.text)}</p>}
                            {c.type === 'tool_result' && <div className="bg-gray-100 dark:bg-gray-900 p-2 rounded"><span className="text-sm font-mono text-gray-600 dark:text-gray-400">Tool Result:</span><pre className="text-sm text-gray-700 dark:text-gray-300 mt-1">{String(c.content)}</pre></div>}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {!!i.timestamp && <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">{formatTimestamp(String(i.timestamp))}</div>}
                  </div>
                </div>
                <ActionButtons index={index} typeOrRole="user" />
              </div>
              <DetailsSection index={index} />
            </div>
          );
        }

        if (i.type === 'assistant' && i.message) {
          const msg = i.message as Record<string, unknown>;
          const content = msg.content;
          const usage = msg.usage as Record<string, number> | undefined;
          return (
            <div key={index} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900/30">
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3 flex-1">
                  <span className="text-lg font-semibold px-3 py-1 rounded-full flex-shrink-0 bg-gray-500 text-white">Assistant</span>
                  <div className="flex-1">
                    {Array.isArray(content) && (
                      <div className="space-y-2">
                        {(content as Record<string, unknown>[]).map((c, ci) => (
                          <div key={ci}>
                            {c.type === 'text' && <p className="text-lg text-gray-800 dark:text-gray-100 whitespace-pre-wrap font-medium">{String(c.text)}</p>}
                            {c.type === 'tool_use' && (
                              <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded border border-yellow-200 dark:border-yellow-800">
                                <div className="flex items-center space-x-2 mb-2"><span className="text-2xl">🔧</span><span className="font-semibold text-yellow-800 dark:text-yellow-200">{String(c.name)}</span></div>
                                <pre className="text-sm text-gray-700 dark:text-gray-300 overflow-x-auto">{JSON.stringify(c.input, null, 2)}</pre>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {usage && <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">Tokens: {usage.input_tokens} in / {usage.output_tokens} out</div>}
                    {!!i.timestamp && <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{formatTimestamp(String(i.timestamp))}</div>}
                  </div>
                </div>
                <ActionButtons index={index} typeOrRole="assistant" />
              </div>
              <DetailsSection index={index} />
            </div>
          );
        }

        if (i.type === 'system') {
          return (
            <div key={index} className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3 flex-1">
                  <span className="text-lg font-semibold px-3 py-1 rounded-full flex-shrink-0 bg-amber-600 text-white">System</span>
                  <div className="flex-1">
                    <p className="text-lg text-gray-800 dark:text-gray-100 font-medium">{cleanSystemContent(String(i.content || ''))}</p>
                    {!!i.toolUseID && <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 font-mono">Tool ID: {String(i.toolUseID)}</div>}
                    {!!i.timestamp && <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{formatTimestamp(String(i.timestamp))}</div>}
                  </div>
                </div>
                <ActionButtons index={index} typeOrRole="system" />
              </div>
              <DetailsSection index={index} />
            </div>
          );
        }

        if (i.role) {
          return (
            <div key={index} className={`p-3 rounded-lg ${i.role === 'user' ? 'bg-blue-50 dark:bg-blue-900/30' : 'bg-gray-50 dark:bg-gray-900/30'}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3 flex-1">
                  <span className={`text-lg font-semibold px-3 py-1 rounded-full flex-shrink-0 ${i.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-500 text-white'}`}>
                    {i.role === 'user' ? 'User' : 'Assistant'}
                  </span>
                  <div className="flex-1">
                    <p className="text-lg text-gray-800 dark:text-gray-100 whitespace-pre-wrap font-medium">{String(i.content || '')}</p>
                  </div>
                </div>
                <ActionButtons index={index} typeOrRole={String(i.role)} />
              </div>
              <DetailsSection index={index} />
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}
