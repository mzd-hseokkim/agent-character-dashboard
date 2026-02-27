import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { useThemeStore } from '../stores/useThemeStore';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function ThemeManager({ isOpen, onClose }: Props) {
  const { state, predefinedThemes, setTheme } = useThemeStore();
  const currentTheme = state.currentTheme;
  const themes = predefinedThemes();

  const selectTheme = (themeName: string) => {
    setTheme(themeName);
    onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl flex flex-col overflow-hidden z-10"
        style={{ width: '75vw', height: '75vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-3xl font-semibold text-gray-900 dark:text-white">
              🎨 Theme Manager
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <svg className="w-6 h-6 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto">
          {/* Theme Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {themes.map(theme => (
              <div
                key={theme.name}
                onClick={() => selectTheme(theme.name)}
                className={clsx(
                  'cursor-pointer rounded-lg border-2 p-4 transition-all hover:shadow-md',
                  currentTheme === theme.name
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                )}
              >
                {/* Theme Preview */}
                <div className="flex h-16 rounded-md overflow-hidden mb-3">
                  <div className="flex-1" style={{ backgroundColor: theme.preview.primary }} />
                  <div className="flex-1" style={{ backgroundColor: theme.preview.secondary }} />
                  <div className="flex-1" style={{ backgroundColor: theme.preview.accent }} />
                </div>

                {/* Theme Info */}
                <h3 className="font-medium text-gray-900 dark:text-white">{theme.displayName}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{theme.description}</p>

                {/* Current indicator */}
                {currentTheme === theme.name && (
                  <div className="mt-2">
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                      <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      Current
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {themes.length} themes available
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
