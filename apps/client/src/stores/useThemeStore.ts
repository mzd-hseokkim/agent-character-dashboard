import { create } from 'zustand';
import { API_BASE_URL } from '../config';
import type {
  ThemeName,
  CustomTheme,
  PredefinedTheme,
  ThemeState,
  ThemeManagerState,
  CreateThemeFormData,
  ThemeColors,
  ThemeValidationResult,
  ThemeImportExport,
  ThemeApiResponse,
} from '../types/theme';
import { PREDEFINED_THEME_NAMES, COLOR_REGEX, RGBA_REGEX } from '../types/theme';

// ── Predefined themes configuration ────────────────────────────────────────
const PREDEFINED_THEMES: Record<ThemeName, PredefinedTheme> = {
  light: {
    name: 'light', displayName: 'Light', description: 'Clean and bright theme with high contrast',
    cssClass: 'theme-light', preview: { primary: '#ffffff', secondary: '#f9fafb', accent: '#3b82f6' },
    colors: { primary: '#3b82f6', primaryHover: '#2563eb', primaryLight: '#dbeafe', primaryDark: '#1e40af', bgPrimary: '#ffffff', bgSecondary: '#f9fafb', bgTertiary: '#f3f4f6', bgQuaternary: '#e5e7eb', textPrimary: '#111827', textSecondary: '#374151', textTertiary: '#6b7280', textQuaternary: '#9ca3af', borderPrimary: '#e5e7eb', borderSecondary: '#d1d5db', borderTertiary: '#9ca3af', accentSuccess: '#10b981', accentWarning: '#f59e0b', accentError: '#ef4444', accentInfo: '#3b82f6', shadow: 'rgba(0, 0, 0, 0.1)', shadowLg: 'rgba(0, 0, 0, 0.25)', hoverBg: 'rgba(0, 0, 0, 0.05)', activeBg: 'rgba(0, 0, 0, 0.1)', focusRing: '#3b82f6' }
  },
  dark: {
    name: 'dark', displayName: 'Dark', description: 'Dark theme with reduced eye strain',
    cssClass: 'theme-dark', preview: { primary: '#111827', secondary: '#1f2937', accent: '#60a5fa' },
    colors: { primary: '#60a5fa', primaryHover: '#3b82f6', primaryLight: '#1e3a8a', primaryDark: '#1d4ed8', bgPrimary: '#111827', bgSecondary: '#1f2937', bgTertiary: '#374151', bgQuaternary: '#4b5563', textPrimary: '#f9fafb', textSecondary: '#e5e7eb', textTertiary: '#d1d5db', textQuaternary: '#9ca3af', borderPrimary: '#374151', borderSecondary: '#4b5563', borderTertiary: '#6b7280', accentSuccess: '#34d399', accentWarning: '#fbbf24', accentError: '#f87171', accentInfo: '#60a5fa', shadow: 'rgba(0, 0, 0, 0.5)', shadowLg: 'rgba(0, 0, 0, 0.75)', hoverBg: 'rgba(255, 255, 255, 0.05)', activeBg: 'rgba(255, 255, 255, 0.1)', focusRing: '#60a5fa' }
  },
  modern: {
    name: 'modern', displayName: 'Modern', description: 'Sleek modern theme with blue accents',
    cssClass: 'theme-modern', preview: { primary: '#f8fafc', secondary: '#f1f5f9', accent: '#0ea5e9' },
    colors: { primary: '#0ea5e9', primaryHover: '#0284c7', primaryLight: '#e0f2fe', primaryDark: '#0c4a6e', bgPrimary: '#f8fafc', bgSecondary: '#f1f5f9', bgTertiary: '#e2e8f0', bgQuaternary: '#cbd5e1', textPrimary: '#0f172a', textSecondary: '#334155', textTertiary: '#64748b', textQuaternary: '#94a3b8', borderPrimary: '#e2e8f0', borderSecondary: '#cbd5e1', borderTertiary: '#94a3b8', accentSuccess: '#059669', accentWarning: '#d97706', accentError: '#dc2626', accentInfo: '#0ea5e9', shadow: 'rgba(15, 23, 42, 0.1)', shadowLg: 'rgba(15, 23, 42, 0.25)', hoverBg: 'rgba(15, 23, 42, 0.05)', activeBg: 'rgba(15, 23, 42, 0.1)', focusRing: '#0ea5e9' }
  },
  earth: {
    name: 'earth', displayName: 'Earth', description: 'Natural theme with warm earth tones',
    cssClass: 'theme-earth', preview: { primary: '#f5f5dc', secondary: '#d2b48c', accent: '#8b4513' },
    colors: { primary: '#8b4513', primaryHover: '#a0522d', primaryLight: '#deb887', primaryDark: '#654321', bgPrimary: '#f5f5dc', bgSecondary: '#f0e68c', bgTertiary: '#daa520', bgQuaternary: '#cd853f', textPrimary: '#2f1b14', textSecondary: '#5d4e37', textTertiary: '#8b4513', textQuaternary: '#a0522d', borderPrimary: '#deb887', borderSecondary: '#d2b48c', borderTertiary: '#cd853f', accentSuccess: '#228b22', accentWarning: '#ff8c00', accentError: '#dc143c', accentInfo: '#4682b4', shadow: 'rgba(139, 69, 19, 0.15)', shadowLg: 'rgba(139, 69, 19, 0.3)', hoverBg: 'rgba(139, 69, 19, 0.08)', activeBg: 'rgba(139, 69, 19, 0.15)', focusRing: '#8b4513' }
  },
  glass: {
    name: 'glass', displayName: 'Glass', description: 'Frosted glass theme with vibrant purple accents',
    cssClass: 'theme-glass', preview: { primary: '#e6e6fa', secondary: '#dda0dd', accent: '#9370db' },
    colors: { primary: '#9370db', primaryHover: '#8a2be2', primaryLight: '#e6e6fa', primaryDark: '#4b0082', bgPrimary: '#f8f8ff', bgSecondary: '#e6e6fa', bgTertiary: '#dda0dd', bgQuaternary: '#d8bfd8', textPrimary: '#2e1065', textSecondary: '#5b21b6', textTertiary: '#7c3aed', textQuaternary: '#8b5cf6', borderPrimary: '#dda0dd', borderSecondary: '#d8bfd8', borderTertiary: '#c8a2c8', accentSuccess: '#32cd32', accentWarning: '#ffa500', accentError: '#ff1493', accentInfo: '#9370db', shadow: 'rgba(147, 112, 219, 0.2)', shadowLg: 'rgba(147, 112, 219, 0.4)', hoverBg: 'rgba(147, 112, 219, 0.1)', activeBg: 'rgba(147, 112, 219, 0.2)', focusRing: '#9370db' }
  },
  'high-contrast': {
    name: 'high-contrast', displayName: 'High Contrast', description: 'Maximum contrast theme for accessibility',
    cssClass: 'theme-high-contrast', preview: { primary: '#ffffff', secondary: '#f0f0f0', accent: '#000000' },
    colors: { primary: '#000000', primaryHover: '#333333', primaryLight: '#f0f0f0', primaryDark: '#000000', bgPrimary: '#ffffff', bgSecondary: '#f0f0f0', bgTertiary: '#e0e0e0', bgQuaternary: '#d0d0d0', textPrimary: '#000000', textSecondary: '#000000', textTertiary: '#333333', textQuaternary: '#666666', borderPrimary: '#000000', borderSecondary: '#333333', borderTertiary: '#666666', accentSuccess: '#008000', accentWarning: '#ff8c00', accentError: '#ff0000', accentInfo: '#0000ff', shadow: 'rgba(0, 0, 0, 0.3)', shadowLg: 'rgba(0, 0, 0, 0.6)', hoverBg: 'rgba(0, 0, 0, 0.1)', activeBg: 'rgba(0, 0, 0, 0.2)', focusRing: '#000000' }
  },
  'dark-blue': {
    name: 'dark-blue', displayName: 'Dark Blue', description: 'Deep blue theme with navy accents',
    cssClass: 'theme-dark-blue', preview: { primary: '#000033', secondary: '#000066', accent: '#0099ff' },
    colors: { primary: '#0099ff', primaryHover: '#0077cc', primaryLight: '#33aaff', primaryDark: '#0066cc', bgPrimary: '#000033', bgSecondary: '#000066', bgTertiary: '#000099', bgQuaternary: '#0000cc', textPrimary: '#e6f2ff', textSecondary: '#ccddff', textTertiary: '#99bbff', textQuaternary: '#6699ff', borderPrimary: '#003366', borderSecondary: '#004499', borderTertiary: '#0066cc', accentSuccess: '#00ff88', accentWarning: '#ffaa00', accentError: '#ff3366', accentInfo: '#0099ff', shadow: 'rgba(0, 0, 51, 0.7)', shadowLg: 'rgba(0, 0, 51, 0.9)', hoverBg: 'rgba(0, 153, 255, 0.15)', activeBg: 'rgba(0, 153, 255, 0.25)', focusRing: '#0099ff' }
  },
  'colorblind-friendly': {
    name: 'colorblind-friendly', displayName: 'Colorblind Friendly', description: 'High contrast colors safe for color vision deficiency',
    cssClass: 'theme-colorblind-friendly', preview: { primary: '#ffffcc', secondary: '#ffcc99', accent: '#993366' },
    colors: { primary: '#993366', primaryHover: '#663344', primaryLight: '#cc6699', primaryDark: '#661144', bgPrimary: '#ffffcc', bgSecondary: '#ffcc99', bgTertiary: '#ffaa88', bgQuaternary: '#ff9966', textPrimary: '#331122', textSecondary: '#442233', textTertiary: '#553344', textQuaternary: '#664455', borderPrimary: '#cc9966', borderSecondary: '#996633', borderTertiary: '#663300', accentSuccess: '#117733', accentWarning: '#cc6633', accentError: '#882233', accentInfo: '#993366', shadow: 'rgba(51, 17, 34, 0.15)', shadowLg: 'rgba(51, 17, 34, 0.3)', hoverBg: 'rgba(153, 51, 102, 0.08)', activeBg: 'rgba(153, 51, 102, 0.15)', focusRing: '#993366' }
  },
  ocean: {
    name: 'ocean', displayName: 'Ocean', description: 'Bright tropical ocean with turquoise and coral accents',
    cssClass: 'theme-ocean', preview: { primary: '#cceeff', secondary: '#66ccff', accent: '#0088cc' },
    colors: { primary: '#0088cc', primaryHover: '#006699', primaryLight: '#33aadd', primaryDark: '#005588', bgPrimary: '#cceeff', bgSecondary: '#99ddff', bgTertiary: '#66ccff', bgQuaternary: '#33bbff', textPrimary: '#003344', textSecondary: '#004455', textTertiary: '#005566', textQuaternary: '#006677', borderPrimary: '#66bbdd', borderSecondary: '#4499cc', borderTertiary: '#2288bb', accentSuccess: '#00cc66', accentWarning: '#ff9933', accentError: '#ff3333', accentInfo: '#0088cc', shadow: 'rgba(0, 136, 204, 0.15)', shadowLg: 'rgba(0, 136, 204, 0.3)', hoverBg: 'rgba(0, 136, 204, 0.08)', activeBg: 'rgba(0, 136, 204, 0.15)', focusRing: '#0088cc' }
  },
  'midnight-purple': {
    name: 'midnight-purple', displayName: 'Midnight Purple', description: 'Deep purples with neon accents',
    cssClass: 'theme-midnight-purple', preview: { primary: '#0f0a1a', secondary: '#1a1333', accent: '#a78bfa' },
    colors: { primary: '#a78bfa', primaryHover: '#c4b5fd', primaryLight: '#2e1065', primaryDark: '#6d28d9', bgPrimary: '#0f0a1a', bgSecondary: '#1a1333', bgTertiary: '#2d1b4e', bgQuaternary: '#3f2766', textPrimary: '#f3e8ff', textSecondary: '#e9d5ff', textTertiary: '#d8b4fe', textQuaternary: '#c084fc', borderPrimary: '#6d28d9', borderSecondary: '#7e22ce', borderTertiary: '#a855f7', accentSuccess: '#34d399', accentWarning: '#fbbf24', accentError: '#f472b6', accentInfo: '#a78bfa', shadow: 'rgba(0, 0, 0, 0.6)', shadowLg: 'rgba(0, 0, 0, 0.8)', hoverBg: 'rgba(167, 139, 250, 0.1)', activeBg: 'rgba(167, 139, 250, 0.2)', focusRing: '#a78bfa' }
  },
  'sunset-orange': {
    name: 'sunset-orange', displayName: 'Sunset Orange', description: 'Warm oranges and neutral tones',
    cssClass: 'theme-sunset-orange', preview: { primary: '#f5ede4', secondary: '#fce4d6', accent: '#ea580c' },
    colors: { primary: '#ea580c', primaryHover: '#c2410c', primaryLight: '#fed7aa', primaryDark: '#9a3412', bgPrimary: '#f5ede4', bgSecondary: '#fce4d6', bgTertiary: '#fbdcc3', bgQuaternary: '#f8d4af', textPrimary: '#1f1208', textSecondary: '#3e2109', textTertiary: '#5d2d0e', textQuaternary: '#7c3a14', borderPrimary: '#fbdcc3', borderSecondary: '#f8c9a8', borderTertiary: '#f5a842', accentSuccess: '#16a34a', accentWarning: '#f59e0b', accentError: '#dc2626', accentInfo: '#ea580c', shadow: 'rgba(218, 74, 13, 0.15)', shadowLg: 'rgba(218, 74, 13, 0.3)', hoverBg: 'rgba(234, 88, 12, 0.08)', activeBg: 'rgba(234, 88, 12, 0.15)', focusRing: '#ea580c' }
  },
  'mint-fresh': {
    name: 'mint-fresh', displayName: 'Mint Fresh', description: 'Cool mint greens with slate neutrals',
    cssClass: 'theme-mint-fresh', preview: { primary: '#f0fdfa', secondary: '#d1fae5', accent: '#0d9488' },
    colors: { primary: '#0d9488', primaryHover: '#0f766e', primaryLight: '#ccfbf1', primaryDark: '#134e4a', bgPrimary: '#f0fdfa', bgSecondary: '#d1fae5', bgTertiary: '#a7f3d0', bgQuaternary: '#7ee8c9', textPrimary: '#0d3b36', textSecondary: '#145352', textTertiary: '#1b6b67', textQuaternary: '#2d827d', borderPrimary: '#a7f3d0', borderSecondary: '#7ee8c9', borderTertiary: '#5eead4', accentSuccess: '#059669', accentWarning: '#d97706', accentError: '#dc2626', accentInfo: '#0d9488', shadow: 'rgba(13, 148, 136, 0.12)', shadowLg: 'rgba(13, 148, 136, 0.25)', hoverBg: 'rgba(13, 148, 136, 0.08)', activeBg: 'rgba(13, 148, 136, 0.15)', focusRing: '#0d9488' }
  },
};

// ── Utility functions ────────────────────────────────────────────────────────

const camelToKebab = (str: string) =>
  str.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();

/** 색상 맵을 --theme-* CSS 변수로 :root에 인라인 적용 */
export function applyColorSetToRoot(colors: Record<string, string>): void {
  const root = document.documentElement;
  Object.entries(colors).forEach(([key, value]) => {
    root.style.setProperty(`--theme-${camelToKebab(key)}`, value);
  });
}

/** 인라인 --theme-* CSS 변수 전체 제거 */
export function clearColorSetFromRoot(): void {
  const root = document.documentElement;
  Array.from(root.style).filter(p => p.startsWith('--theme-')).forEach(p => {
    root.style.removeProperty(p);
  });
}

const generateId = () => Math.random().toString(36).substr(2, 9);

const isValidColor = (color: string): boolean =>
  COLOR_REGEX.test(color) || RGBA_REGEX.test(color) || CSS.supports('color', color);

const applyPredefinedTheme = (themeName: ThemeName) => {
  document.documentElement.className = document.documentElement.className
    .replace(/theme-[\w-]+/g, '');
  const themeData = PREDEFINED_THEMES[themeName];
  if (themeData) {
    document.documentElement.classList.add(themeData.cssClass);
    if (themeName === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }
};

const applyCustomTheme = (theme: CustomTheme) => {
  document.documentElement.className = document.documentElement.className
    .replace(/theme-[\w-]+/g, '');
  const root = document.documentElement;
  Object.entries(theme.colors).forEach(([key, value]) => {
    root.style.setProperty(`--theme-${camelToKebab(key)}`, value);
  });
  root.classList.add('theme-custom');
};

// ── Zustand store ────────────────────────────────────────────────────────────

interface ThemeStore {
  state: ThemeState;
  managerState: ThemeManagerState;

  // computed-like getters
  currentThemeData: () => PredefinedTheme | CustomTheme | undefined;
  predefinedThemes: () => PredefinedTheme[];

  // core
  setTheme: (theme: ThemeName | string) => void;
  toggleDarkMode: () => void;
  validateTheme: (colors: Partial<ThemeColors>) => ThemeValidationResult;
  initializeTheme: () => void;

  // custom theme management
  createCustomTheme: (formData: CreateThemeFormData) => Promise<CustomTheme | null>;
  updateCustomTheme: (themeId: string, updates: Partial<CustomTheme>) => void;
  deleteCustomTheme: (themeId: string) => void;

  // import/export
  exportTheme: (themeId: string) => ThemeImportExport | null;
  importTheme: (importData: ThemeImportExport) => boolean;

  // manager UI state
  openThemeManager: () => void;
  closeThemeManager: () => void;
  setActiveTab: (tab: ThemeManagerState['activeTab']) => void;
  previewTheme: (theme: ThemeName | CustomTheme) => void;
  cancelPreview: () => void;
  applyPreview: () => void;

  // server
  loadThemesFromServer: () => Promise<CustomTheme[]>;
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  state: {
    currentTheme: 'dark',
    isDarkMode: true,
    customThemes: [],
    isCustomTheme: false,
    isLoading: false,
    error: null,
  },
  managerState: {
    isOpen: false,
    activeTab: 'predefined',
    previewTheme: null,
    editingTheme: null,
  },

  currentThemeData: () => {
    const { state } = get();
    if (state.isCustomTheme) {
      return state.customThemes.find(t => t.id === state.currentTheme);
    }
    return PREDEFINED_THEMES[state.currentTheme as ThemeName];
  },

  predefinedThemes: () => Object.values(PREDEFINED_THEMES),

  toggleDarkMode: () => {
    const { state } = get();
    const next = !state.isDarkMode;
    if (next) {
      // 다크 모드: 모든 theme 클래스 제거 → :root Console Dark 적용
      document.documentElement.className = document.documentElement.className
        .replace(/theme-[\w-]+/g, '').trim();
      document.documentElement.classList.remove('dark');
      localStorage.removeItem('theme');
      set(s => ({ state: { ...s.state, isDarkMode: true, currentTheme: 'dark', isCustomTheme: false } }));
    } else {
      // 라이트 모드: theme-light 클래스 추가
      document.documentElement.className = document.documentElement.className
        .replace(/theme-[\w-]+/g, '').trim();
      document.documentElement.classList.add('theme-light');
      localStorage.setItem('theme', 'light');
      set(s => ({ state: { ...s.state, isDarkMode: false, currentTheme: 'light', isCustomTheme: false } }));
    }
  },

  setTheme: (theme) => {
    const { state } = get();
    const isCustom = !PREDEFINED_THEME_NAMES.includes(theme as ThemeName);

    if (isCustom) {
      const customTheme = state.customThemes.find(t => t.id === theme);
      if (!customTheme) { console.error(`Custom theme not found: ${theme}`); return; }
      applyCustomTheme(customTheme);
    } else {
      applyPredefinedTheme(theme as ThemeName);
    }

    localStorage.setItem('theme', theme);
    localStorage.setItem('isCustomTheme', isCustom.toString());
    set(s => ({ state: { ...s.state, currentTheme: theme, isCustomTheme: isCustom } }));
  },

  validateTheme: (colors) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    Object.entries(colors).forEach(([key, value]) => {
      if (!value) { errors.push(`${key} is required`); return; }
      if (!isValidColor(value)) errors.push(`${key} must be a valid color (hex, rgb, or rgba)`);
    });
    return { isValid: errors.length === 0, errors, warnings };
  },

  initializeTheme: () => {
    // Load custom themes from localStorage
    try {
      const stored = localStorage.getItem('customThemes');
      if (stored) {
        set(s => ({ state: { ...s.state, customThemes: JSON.parse(stored) } }));
      }
    } catch { /* ignore */ }

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
      // 라이트 모드 복원
      document.documentElement.className = document.documentElement.className
        .replace(/theme-[\w-]+/g, '').trim();
      document.documentElement.classList.add('theme-light');
      set(s => ({ state: { ...s.state, currentTheme: 'light', isDarkMode: false } }));
    } else if (savedTheme && savedTheme !== 'sunlit-meadow') {
      // 기타 커스텀 테마 복원
      get().setTheme(savedTheme);
      set(s => ({ state: { ...s.state, isDarkMode: true } }));
    } else {
      // 기본값: Console Dark (theme 클래스 없음, :root 사용)
      document.documentElement.className = document.documentElement.className
        .replace(/theme-[\w-]+/g, '').trim();
      document.documentElement.classList.remove('dark');
      localStorage.removeItem('theme');
      set(s => ({ state: { ...s.state, currentTheme: 'dark', isDarkMode: true } }));
    }
  },

  createCustomTheme: async (formData) => {
    const { validateTheme } = get();
    const validation = validateTheme(formData.colors as ThemeColors);
    if (!validation.isValid) {
      set(s => ({ state: { ...s.state, error: validation.errors.join(', ') } }));
      return null;
    }
    const theme: CustomTheme = {
      id: generateId(), name: formData.name, displayName: formData.displayName,
      description: formData.description, colors: formData.colors as ThemeColors,
      isCustom: true, isPublic: formData.isPublic,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      tags: formData.tags,
    };
    set(s => {
      const updated = [...s.state.customThemes, theme];
      localStorage.setItem('customThemes', JSON.stringify(updated));
      return { state: { ...s.state, customThemes: updated } };
    });
    if (formData.isPublic) {
      try { await get().loadThemesFromServer(); } catch { /* ignore */ }
    }
    return theme;
  },

  updateCustomTheme: (themeId, updates) => {
    set(s => {
      const customThemes = s.state.customThemes.map(t =>
        t.id === themeId ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t
      );
      localStorage.setItem('customThemes', JSON.stringify(customThemes));
      return { state: { ...s.state, customThemes } };
    });
  },

  deleteCustomTheme: (themeId) => {
    set(s => {
      const customThemes = s.state.customThemes.filter(t => t.id !== themeId);
      localStorage.setItem('customThemes', JSON.stringify(customThemes));
      return { state: { ...s.state, customThemes } };
    });
    if (get().state.currentTheme === themeId) get().setTheme('light');
  },

  exportTheme: (themeId) => {
    const theme = get().state.customThemes.find(t => t.id === themeId);
    if (!theme) return null;
    return { version: '1.0.0', theme, exportedAt: new Date().toISOString(), exportedBy: 'observability-system' };
  },

  importTheme: (importData) => {
    try {
      const theme = importData.theme;
      const validation = get().validateTheme(theme.colors);
      if (!validation.isValid) {
        set(s => ({ state: { ...s.state, error: `Invalid theme: ${validation.errors.join(', ')}` } }));
        return false;
      }
      const newTheme: CustomTheme = { ...theme, id: generateId(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      set(s => {
        const updated = [...s.state.customThemes, newTheme];
        localStorage.setItem('customThemes', JSON.stringify(updated));
        return { state: { ...s.state, customThemes: updated } };
      });
      return true;
    } catch {
      set(s => ({ state: { ...s.state, error: 'Failed to import theme' } }));
      return false;
    }
  },

  openThemeManager: () => set(s => ({ managerState: { ...s.managerState, isOpen: true } })),
  closeThemeManager: () => set(s => ({ managerState: { ...s.managerState, isOpen: false, previewTheme: null, editingTheme: null } })),
  setActiveTab: (tab) => set(s => ({ managerState: { ...s.managerState, activeTab: tab } })),

  previewTheme: (theme) => {
    set(s => ({ managerState: { ...s.managerState, previewTheme: theme } }));
    if (typeof theme === 'string') applyPredefinedTheme(theme);
    else applyCustomTheme(theme);
  },

  cancelPreview: () => {
    set(s => ({ managerState: { ...s.managerState, previewTheme: null } }));
    const { state } = get();
    if (state.isCustomTheme) {
      const ct = state.customThemes.find(t => t.id === state.currentTheme);
      if (ct) applyCustomTheme(ct);
    } else {
      applyPredefinedTheme(state.currentTheme as ThemeName);
    }
  },

  applyPreview: () => {
    const { managerState } = get();
    if (managerState.previewTheme) {
      const id = typeof managerState.previewTheme === 'string'
        ? managerState.previewTheme
        : managerState.previewTheme.id;
      get().setTheme(id);
      set(s => ({ managerState: { ...s.managerState, previewTheme: null } }));
    }
  },

  loadThemesFromServer: async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/themes?isPublic=true`);
      if (!res.ok) return [];
      const result: ThemeApiResponse<CustomTheme[]> = await res.json();
      if (result.success && result.data) return result.data.map(t => ({ ...t, isCustom: true }));
      return [];
    } catch {
      return [];
    }
  },
}));
