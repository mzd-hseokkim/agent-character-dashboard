import { useMemo } from 'react';
import type { CustomTheme, CreateThemeFormData } from '../types/theme';

interface Props {
  theme: CustomTheme | CreateThemeFormData;
  onApply: () => void;
}

const formatColorLabel = (key: string) =>
  key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());

export function ThemePreview({ theme, onApply }: Props) {
  const displayColors = useMemo(() => {
    const c = theme.colors;
    if (!c) return {};
    return { primary: c.primary, bgPrimary: c.bgPrimary, bgSecondary: c.bgSecondary, bgTertiary: c.bgTertiary, textPrimary: c.textPrimary, textSecondary: c.textSecondary, accentSuccess: c.accentSuccess, accentError: c.accentError };
  }, [theme.colors]);

  const c = theme.colors;
  return (
    <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-lg font-medium text-gray-900 dark:text-white">Live Preview</h4>
        <button onClick={onApply} className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm">Apply Preview</button>
      </div>

      <div className="border-2 border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b" style={{ backgroundColor: c?.bgPrimary || '#ffffff', borderColor: c?.borderPrimary || '#e5e7eb' }}>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold" style={{ color: c?.textPrimary || '#111827' }}>{(theme as CustomTheme).displayName || 'Theme Preview'}</h3>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: c?.accentSuccess || '#10b981' }} />
              <span className="text-sm" style={{ color: c?.textTertiary || '#6b7280' }}>Connected</span>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-4" style={{ backgroundColor: c?.bgSecondary || '#f9fafb' }}>
          <div className="rounded-lg p-4 border shadow-sm" style={{ backgroundColor: c?.bgPrimary || '#ffffff', borderColor: c?.borderPrimary || '#e5e7eb' }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-3">
                <span className="px-3 py-1 rounded-full text-sm font-medium border-2" style={{ backgroundColor: (c?.primary || '#3b82f6') + '20', color: c?.primary || '#3b82f6', borderColor: c?.primary || '#3b82f6' }}>demo-app</span>
                <span className="px-2 py-1 rounded-full text-sm border" style={{ color: c?.textSecondary || '#374151', borderColor: c?.borderSecondary || '#d1d5db' }}>abc123</span>
                <span className="px-3 py-1 rounded-full text-sm font-medium" style={{ backgroundColor: (c?.accentInfo || '#3b82f6') + '20', color: c?.accentInfo || '#3b82f6' }}>🔧 PreToolUse</span>
              </div>
              <span className="text-sm" style={{ color: c?.textQuaternary || '#9ca3af' }}>2:34 PM</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium" style={{ color: c?.textSecondary || '#374151' }}>Bash</span>
                <span className="ml-2" style={{ color: c?.textTertiary || '#6b7280' }}>ls -la</span>
              </div>
              <div className="px-3 py-1 rounded-lg" style={{ backgroundColor: c?.bgTertiary || '#f3f4f6' }}>
                <span className="text-sm" style={{ color: c?.textSecondary || '#374151' }}>📝 Summary available</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-8 gap-2">
            {Object.entries(displayColors).map(([key, color]) => (
              <div key={key} className="h-8 rounded border relative group cursor-pointer" style={{ backgroundColor: color, borderColor: c?.borderPrimary || '#e5e7eb' }} title={`${formatColorLabel(key)}: ${color}`}>
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 rounded transition-all duration-200" />
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-4">
              {[['accentSuccess', '#10b981', 'Success'], ['accentWarning', '#f59e0b', 'Warning'], ['accentError', '#ef4444', 'Error']].map(([key, fallback, label]) => (
                <div key={key} className="flex items-center space-x-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: (c as Record<string, string>)?.[key] || fallback }} />
                  <span style={{ color: c?.textSecondary || '#374151' }}>{label}</span>
                </div>
              ))}
            </div>
            <span style={{ color: c?.textTertiary || '#6b7280' }}>156 events</span>
          </div>
        </div>
      </div>

      <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
        <div className="flex items-start space-x-3">
          <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Live Preview Active</p>
            <p className="text-sm text-blue-600 dark:text-blue-300">This is how your theme will look in the application. Changes are applied in real-time.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
