import { useState, useCallback, useRef, useId, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, ChevronRight, ChevronLeft, Upload, CheckCircle, Palette, Users, FileText, Copy, List, Pencil } from 'lucide-react';
import { API_BASE_URL } from '../config';
import { fetchCharacters } from '../hooks/useCharacters';
import { useWebSocketStore } from '../stores/useWebSocketStore';

// ── Color tokens ──────────────────────────────────────────────────────────────

const COLOR_TOKENS = [
  { key: 'primary',         label: 'Primary',         group: 'Brand' },
  { key: 'primaryHover',    label: 'Primary Hover',   group: 'Brand' },
  { key: 'primaryLight',    label: 'Primary Light',   group: 'Brand' },
  { key: 'primaryDark',     label: 'Primary Dark',    group: 'Brand' },
  { key: 'bgPrimary',       label: 'BG Primary',      group: 'Background' },
  { key: 'bgSecondary',     label: 'BG Secondary',    group: 'Background' },
  { key: 'bgTertiary',      label: 'BG Tertiary',     group: 'Background' },
  { key: 'bgQuaternary',    label: 'BG Quaternary',   group: 'Background' },
  { key: 'textPrimary',     label: 'Text Primary',    group: 'Text' },
  { key: 'textSecondary',   label: 'Text Secondary',  group: 'Text' },
  { key: 'textTertiary',    label: 'Text Tertiary',   group: 'Text' },
  { key: 'textQuaternary',  label: 'Text Quaternary', group: 'Text' },
  { key: 'borderPrimary',   label: 'Border Primary',  group: 'Border' },
  { key: 'borderSecondary', label: 'Border Secondary',group: 'Border' },
  { key: 'borderTertiary',  label: 'Border Tertiary', group: 'Border' },
  { key: 'accentSuccess',   label: 'Success',         group: 'Accent' },
  { key: 'accentWarning',   label: 'Warning',         group: 'Accent' },
  { key: 'accentError',     label: 'Error',           group: 'Accent' },
  { key: 'accentInfo',      label: 'Info',            group: 'Accent' },
  { key: 'shadow',          label: 'Shadow',          group: 'Shadow' },
  { key: 'shadowLg',        label: 'Shadow Lg',       group: 'Shadow' },
  { key: 'hoverBg',         label: 'Hover BG',        group: 'Shadow' },
  { key: 'activeBg',        label: 'Active BG',       group: 'Shadow' },
  { key: 'focusRing',       label: 'Focus Ring',      group: 'Shadow' },
] as const;

type ColorKey = typeof COLOR_TOKENS[number]['key'];
type ColorSet = Record<ColorKey, string>;

const SPRITE_STATUSES = ['FORCE', 'THINK', 'REST', 'READING', 'FINISH', 'OFFLINE'] as const;
type SpriteStatus = typeof SPRITE_STATUSES[number];

const STATUS_DESC: Record<SpriteStatus, string> = {
  FORCE:   'WORKING / ORCHESTRATING',
  THINK:   'THINKING',
  REST:    'WAITING / BLOCKED',
  READING: 'READING',
  FINISH:  'DONE',
  OFFLINE: 'OFFLINE / ERROR',
};

// ── Shared style tokens ───────────────────────────────────────────────────────

const S = {
  // Backgrounds
  bgModal:   'bg-[var(--theme-bg-primary)]',
  bgCard:    'bg-[var(--theme-bg-secondary)]',
  bgInput:   'bg-[var(--theme-bg-secondary)]',
  bgSection: 'bg-[var(--theme-bg-tertiary)]',
  bgActive:  'bg-[var(--theme-hover-bg)]',
  // Borders
  border1: 'border-[var(--theme-border-primary)]',
  border2: 'border-[var(--theme-border-secondary)]',
  border3: 'border-[var(--theme-border-tertiary)]',
  // Text
  textPrimary:   'text-[var(--theme-text-primary)]',
  textSecondary: 'text-[var(--theme-text-secondary)]',
  textTertiary:  'text-[var(--theme-text-tertiary)]',
  textMuted:     'text-[var(--theme-text-quaternary)]',
  // Accent
  textSuccess: 'text-[var(--theme-accent-success)]',
  textError:   'text-[var(--theme-accent-error)]',
  textInfo:    'text-[var(--theme-accent-info)]',
  // Input focus
  focusInput: 'focus:outline-none focus:border-[var(--theme-accent-success)]',
};

// ── State types ───────────────────────────────────────────────────────────────

interface CharacterDef {
  localId: string;
  characterId: string;
  displayName: string;
  spritePrefix: string;
  sprites: Partial<Record<SpriteStatus, File>>;
  previews: Partial<Record<SpriteStatus, string>>;
}

type Step = 1 | 2 | 3;

const emptyColors = (): ColorSet => {
  const c: Partial<ColorSet> = {};
  for (const t of COLOR_TOKENS) c[t.key] = '#000000';
  return c as ColorSet;
};

const defaultLightColors = (): ColorSet => ({
  primary: '#3b82f6', primaryHover: '#2563eb', primaryLight: '#dbeafe', primaryDark: '#1e40af',
  bgPrimary: '#ffffff', bgSecondary: '#f9fafb', bgTertiary: '#f3f4f6', bgQuaternary: '#e5e7eb',
  textPrimary: '#111827', textSecondary: '#374151', textTertiary: '#6b7280', textQuaternary: '#9ca3af',
  borderPrimary: '#e5e7eb', borderSecondary: '#d1d5db', borderTertiary: '#9ca3af',
  accentSuccess: '#10b981', accentWarning: '#f59e0b', accentError: '#ef4444', accentInfo: '#3b82f6',
  shadow: 'rgba(0, 0, 0, 0.1)', shadowLg: 'rgba(0, 0, 0, 0.25)', hoverBg: 'rgba(0, 0, 0, 0.05)',
  activeBg: 'rgba(0, 0, 0, 0.1)', focusRing: '#3b82f6',
});

const defaultDarkColors = (): ColorSet => ({
  primary: '#60a5fa', primaryHover: '#3b82f6', primaryLight: '#1e3a8a', primaryDark: '#1d4ed8',
  bgPrimary: '#111827', bgSecondary: '#1f2937', bgTertiary: '#374151', bgQuaternary: '#4b5563',
  textPrimary: '#f9fafb', textSecondary: '#e5e7eb', textTertiary: '#d1d5db', textQuaternary: '#9ca3af',
  borderPrimary: '#374151', borderSecondary: '#4b5563', borderTertiary: '#6b7280',
  accentSuccess: '#34d399', accentWarning: '#fbbf24', accentError: '#f87171', accentInfo: '#60a5fa',
  shadow: 'rgba(0, 0, 0, 0.5)', shadowLg: 'rgba(0, 0, 0, 0.75)', hoverBg: 'rgba(255, 255, 255, 0.05)',
  activeBg: 'rgba(255, 255, 255, 0.1)', focusRing: '#60a5fa',
});

// ── Sub-components ────────────────────────────────────────────────────────────

function isHexColor(v: string) {
  return /^#[0-9a-fA-F]{3,8}$/.test(v.trim());
}

function ColorInput({ tokenKey, label, value, onChange }: {
  tokenKey: string; label: string; value: string; onChange: (v: string) => void;
}) {
  const hex = isHexColor(value);
  return (
    <div className="flex items-center gap-2">
      <span className={`text-[10px] ${S.textTertiary} w-28 flex-shrink-0 font-mono truncate`} title={label}>
        {label}
      </span>
      <div className="relative flex-shrink-0">
        <div
          className={`w-6 h-6 rounded border ${S.border2} cursor-pointer overflow-hidden`}
          style={{ background: value || 'transparent' }}
          title={value}
        />
        {hex && (
          <input
            type="color"
            value={value.slice(0, 7)}
            onChange={e => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            aria-label={`Color picker for ${label}`}
          />
        )}
      </div>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`flex-1 min-w-0 text-xs ${S.bgInput} border ${S.border2} rounded px-2 py-1 ${S.textPrimary} font-mono ${S.focusInput}`}
        placeholder="#000000 or rgba(...)"
        data-key={tokenKey}
      />
    </div>
  );
}

function ColorGrid({ colors, onChange }: { colors: ColorSet; onChange: (key: ColorKey, v: string) => void }) {
  const groups = Array.from(new Set(COLOR_TOKENS.map(t => t.group)));
  return (
    <div className="space-y-4">
      {groups.map(group => (
        <div key={group}>
          <div className={`text-[10px] ${S.textTertiary} uppercase tracking-widest mb-2`}>{group}</div>
          <div className="grid grid-cols-1 gap-1">
            {COLOR_TOKENS.filter(t => t.group === group).map(t => (
              <ColorInput
                key={t.key}
                tokenKey={t.key}
                label={t.label}
                value={colors[t.key]}
                onChange={v => onChange(t.key, v)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SpriteDropzone({ status, file, preview, onChange, required }: {
  status: SpriteStatus;
  file: File | undefined;
  preview: string | undefined;
  onChange: (f: File | null) => void;
  required: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File | null) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.gif') && f.type !== 'image/gif') return;
    onChange(f);
  }, [onChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const hasFile = !!file;

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={[
          `relative w-full aspect-square rounded border-2 cursor-pointer flex flex-col items-center justify-center transition-colors`,
          dragging ? `border-[var(--theme-accent-success)] ${S.bgSection}` : '',
          hasFile
            ? `border-[var(--theme-accent-success)] ${S.bgCard}`
            : required
              ? `border-[var(--theme-accent-error)] ${S.bgCard} opacity-80 hover:opacity-100`
              : `${S.border2} ${S.bgCard} hover:${S.border3}`,
        ].join(' ')}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        {preview ? (
          <img src={preview} alt={status} className="w-full h-full object-contain rounded" style={{ imageRendering: 'pixelated' }} />
        ) : (
          <Upload size={14} className={required ? S.textError : S.textMuted} />
        )}
        {hasFile && (
          <button
            className={`absolute top-0.5 right-0.5 w-4 h-4 ${S.bgSection} rounded-full flex items-center justify-center hover:${S.bgActive} z-10`}
            onClick={e => { e.stopPropagation(); onChange(null); }}
            title="제거"
          >
            <X size={8} className={S.textPrimary} />
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".gif,image/gif"
          className="hidden"
          onChange={e => handleFile(e.target.files?.[0] ?? null)}
        />
      </div>
      <div className="flex items-center gap-1">
        <span className={`text-[10px] font-mono ${S.textSecondary}`}>{status}</span>
        {required && <span className={`text-[9px] ${S.textError} font-bold`}>[필수]</span>}
      </div>
      {!required && !hasFile && (
        <span className={`text-[8px] ${S.textMuted} text-center leading-tight`}>없으면 FORCE<br/>로 대체</span>
      )}
    </div>
  );
}

function CharacterEditor({ char, onUpdate, onRemove }: {
  char: CharacterDef;
  onUpdate: (c: CharacterDef) => void;
  onRemove: () => void;
}) {
  const handleSpriteChange = useCallback((status: SpriteStatus, file: File | null) => {
    const newSprites = { ...char.sprites };
    const newPreviews = { ...char.previews };
    if (file) {
      newSprites[status] = file;
      const url = URL.createObjectURL(file);
      if (newPreviews[status]) URL.revokeObjectURL(newPreviews[status]!);
      newPreviews[status] = url;
    } else {
      if (newPreviews[status]) URL.revokeObjectURL(newPreviews[status]!);
      delete newSprites[status];
      delete newPreviews[status];
    }
    onUpdate({ ...char, sprites: newSprites, previews: newPreviews });
  }, [char, onUpdate]);

  const forceOk = !!char.sprites['FORCE'];

  return (
    <div className={`border ${S.border1} rounded-lg p-4 ${S.bgModal} space-y-4`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {forceOk
            ? <CheckCircle size={14} className={S.textSuccess} />
            : <div className={`w-3.5 h-3.5 rounded-full border-2 border-[var(--theme-accent-error)]`} />
          }
          <span className={`text-sm font-medium ${S.textPrimary}`}>
            {char.displayName || '이름 없음'}
          </span>
          {!forceOk && <span className={`text-xs ${S.textError}`}>FORCE 스프라이트 필요</span>}
        </div>
        <button onClick={onRemove} className={`${S.textMuted} hover:${S.textError} transition-colors`}>
          <Trash2 size={14} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={`text-[10px] ${S.textTertiary} uppercase tracking-widest block mb-1`}>Character ID</label>
          <input
            type="text"
            value={char.characterId}
            onChange={e => {
              const id = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '');
              onUpdate({ ...char, characterId: id, spritePrefix: char.spritePrefix || id.toUpperCase() });
            }}
            placeholder="luna"
            className={`w-full text-xs ${S.bgInput} border ${S.border2} rounded px-2 py-1 ${S.textPrimary} font-mono ${S.focusInput}`}
          />
          <p className={`text-[9px] ${S.textMuted} mt-0.5`}>소문자·숫자·하이픈</p>
        </div>
        <div>
          <label className={`text-[10px] ${S.textTertiary} uppercase tracking-widest block mb-1`}>Display Name</label>
          <input
            type="text"
            value={char.displayName}
            onChange={e => onUpdate({ ...char, displayName: e.target.value })}
            placeholder="Luna"
            className={`w-full text-xs ${S.bgInput} border ${S.border2} rounded px-2 py-1 ${S.textPrimary} ${S.focusInput}`}
          />
        </div>
        <div>
          <label className={`text-[10px] ${S.textTertiary} uppercase tracking-widest block mb-1`}>Sprite Prefix</label>
          <input
            type="text"
            value={char.spritePrefix}
            onChange={e => onUpdate({ ...char, spritePrefix: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })}
            placeholder="LUNA"
            className={`w-full text-xs ${S.bgInput} border ${S.border2} rounded px-2 py-1 ${S.textPrimary} font-mono ${S.focusInput}`}
          />
          <p className={`text-[9px] ${S.textMuted} mt-0.5`}>파일명 prefix (대문자)</p>
        </div>
      </div>

      <div>
        <div className={`text-[10px] ${S.textTertiary} uppercase tracking-widest mb-2`}>스프라이트 GIF</div>
        <div className="grid grid-cols-6 gap-2">
          {SPRITE_STATUSES.map(status => (
            <div key={status}>
              <div className={`text-[8px] ${S.textMuted} mb-1 text-center`}>{STATUS_DESC[status].split(' / ')[0]}</div>
              <SpriteDropzone
                status={status}
                file={char.sprites[status]}
                preview={char.previews[status]}
                onChange={f => handleSpriteChange(status, f)}
                required={status === 'FORCE'}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Theme list ────────────────────────────────────────────────────────────────

interface ThemeItem {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  tags: string[];
  lightColors?: Record<string, string>;
  darkColors?: Record<string, string>;
}

interface ThemeCharacterDetail {
  id: string;
  themeId: string;
  characterId: string;
  displayName: string;
  spritePrefix: string;
  sprites: Record<string, string>; // status → absolute URL
}

async function fetchThemeCharacters(themeId: string): Promise<ThemeCharacterDetail[]> {
  const res = await fetch(`${API_BASE_URL}/api/themes/${themeId}/characters`);
  const json = await res.json();
  if (!json.success) return [];
  return (json.data as any[]).map((char: any) => ({
    ...char,
    sprites: Object.fromEntries(
      Object.entries(char.sprites || {}).map(([k, v]) => [
        k,
        (v as string).startsWith('http') ? v : `${API_BASE_URL}${v}`,
      ])
    ),
  }));
}

function ColorSwatchGrid({ colors, label }: { colors: Record<string, string>; label: string }) {
  return (
    <div>
      <div className={`text-[10px] ${S.textMuted} uppercase tracking-widest mb-1.5`}>{label}</div>
      <div className="flex flex-wrap gap-1">
        {COLOR_TOKENS.map(t => (
          <div
            key={t.key}
            className={`w-5 h-5 rounded border ${S.border2} flex-shrink-0`}
            style={{ background: colors[t.key] || 'transparent' }}
            title={`${t.label}: ${colors[t.key]}`}
          />
        ))}
      </div>
    </div>
  );
}

function AddCharacterPanel({ themeId, onAdded, onCancel }: {
  themeId: string;
  onAdded: () => void;
  onCancel: () => void;
}) {
  const [char, setChar] = useState<CharacterDef>({
    localId: 'new-char',
    characterId: '', displayName: '', spritePrefix: '', sprites: {}, previews: {},
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = char.characterId.trim() && char.displayName.trim() && char.spritePrefix.trim() && !!char.sprites['FORCE'];

  const handleAdd = async () => {
    setSubmitting(true);
    setError(null);
    const fd = new FormData();
    fd.append('metadata', JSON.stringify({
      characterId: char.characterId,
      displayName: char.displayName,
      spritePrefix: char.spritePrefix,
    }));
    for (const status of SPRITE_STATUSES) {
      const f = char.sprites[status];
      if (f) fd.append(`${char.characterId}_${status}`, f);
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/themes/${themeId}/characters`, { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json.success) { setError(json.error ?? 'Failed'); setSubmitting(false); return; }
      Object.values(char.previews).forEach(url => { if (url) URL.revokeObjectURL(url); });
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
      setSubmitting(false);
    }
  };

  return (
    <div className={`border ${S.border1} rounded-lg p-3 ${S.bgCard}`}>
      <p className={`text-xs font-medium ${S.textSecondary} mb-3`}>새 캐릭터 추가</p>
      <CharacterEditor char={char} onUpdate={setChar} onRemove={onCancel} />
      {error && <p className={`mt-2 text-xs ${S.textError}`}>{error}</p>}
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={onCancel} className={`text-xs px-3 py-1.5 ${S.bgCard} border ${S.border2} rounded ${S.textMuted}`}>취소</button>
        <button
          onClick={handleAdd}
          disabled={!canSubmit || submitting}
          className={`text-xs px-3 py-1.5 rounded transition-colors ${canSubmit && !submitting
            ? `${S.bgCard} border border-[var(--theme-accent-success)] ${S.textSuccess}`
            : `${S.bgCard} border ${S.border2} ${S.textMuted} cursor-not-allowed`}`}
        >
          {submitting ? '추가 중...' : '추가'}
        </button>
      </div>
    </div>
  );
}

// ── Utility ───────────────────────────────────────────────────────────────────

function fillColorSet(base: () => ColorSet, src?: Record<string, string>): ColorSet {
  const filled = base();
  if (src) {
    for (const t of COLOR_TOKENS) {
      if (src[t.key]) filled[t.key] = src[t.key];
    }
  }
  return filled;
}

// ── ThemeCard ─────────────────────────────────────────────────────────────────

function ThemeCard({ theme, activeThemeId, activating, onActivate, onDelete, onRefresh }: {
  theme: ThemeItem;
  activeThemeId: string | null;
  activating: string | null;
  onActivate: (id: string) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
}) {
  const isActive = theme.id === activeThemeId;
  const hasColors = !!theme.lightColors && !!theme.darkColors;

  const [expanded, setExpanded] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editTab, setEditTab] = useState<'meta' | 'colors' | 'characters'>('meta');

  // Edit meta
  const [editDisplayName, setEditDisplayName] = useState(theme.displayName);
  const [editDescription, setEditDescription] = useState(theme.description ?? '');
  const [editTagsInput, setEditTagsInput] = useState((theme.tags ?? []).join(', '));

  // Edit colors
  const [editLightColors, setEditLightColors] = useState<ColorSet>(() => fillColorSet(defaultLightColors, theme.lightColors));
  const [editDarkColors, setEditDarkColors] = useState<ColorSet>(() => fillColorSet(defaultDarkColors, theme.darkColors));
  const [editColorTab, setEditColorTab] = useState<'light' | 'dark'>('light');

  // Characters
  const [chars, setChars] = useState<ThemeCharacterDetail[]>([]);
  const [charsLoading, setCharsLoading] = useState(false);
  const [addingChar, setAddingChar] = useState(false);

  // Save / delete state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadChars = useCallback(() => {
    setCharsLoading(true);
    fetchThemeCharacters(theme.id).then(setChars).finally(() => setCharsLoading(false));
  }, [theme.id]);

  useEffect(() => {
    if (expanded) loadChars();
  }, [expanded, loadChars]);

  const enterEdit = useCallback(() => {
    setEditDisplayName(theme.displayName);
    setEditDescription(theme.description ?? '');
    setEditTagsInput((theme.tags ?? []).join(', '));
    setEditLightColors(fillColorSet(defaultLightColors, theme.lightColors));
    setEditDarkColors(fillColorSet(defaultDarkColors, theme.darkColors));
    setEditTab('meta');
    setSaveError(null);
    setEditMode(true);
  }, [theme]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    const tags = editTagsInput.split(',').map(t => t.trim()).filter(Boolean);
    try {
      const res = await fetch(`${API_BASE_URL}/api/themes/${theme.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: editDisplayName.trim(),
          description: editDescription.trim(),
          tags,
          lightColors: editLightColors,
          darkColors: editDarkColors,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) { setSaveError(json.error ?? 'Save failed'); return; }
      setEditMode(false);
      onRefresh();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteChar = async (charId: string) => {
    try {
      await fetch(`${API_BASE_URL}/api/themes/${theme.id}/characters/${charId}`, { method: 'DELETE' });
      setChars(prev => prev.filter(c => c.id !== charId));
    } catch { /* ignore */ }
  };

  return (
    <div
      className={[
        `border rounded-lg transition-colors`,
        isActive ? `border-[var(--theme-accent-success)] ${S.bgCard}` : `${S.border1} ${S.bgModal}`,
      ].join(' ')}
      onClick={() => setConfirmDelete(false)}
    >
      {/* Card header */}
      <div className="flex items-start gap-2 p-3">
        <button
          onClick={e => { e.stopPropagation(); setExpanded(x => !x); if (editMode) setEditMode(false); }}
          className={`mt-0.5 flex-shrink-0 ${S.textMuted} hover:${S.textSecondary} transition-colors`}
        >
          <ChevronRight size={14} className={`transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`} />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {isActive && (
              <span className={`text-[9px] border border-[var(--theme-accent-success)] ${S.textSuccess} px-1.5 py-0.5 rounded-full`}
                style={{ background: 'var(--theme-hover-bg)' }}>활성</span>
            )}
            <span className={`text-xs font-medium ${S.textPrimary}`}>{theme.displayName}</span>
            <span className={`text-[10px] ${S.textMuted} font-mono`}>{theme.name}</span>
            {!hasColors && <span className={`text-[9px] ${S.textError} opacity-70`}>색상 없음</span>}
          </div>
          {theme.description && (
            <p className={`text-[10px] ${S.textTertiary} mt-0.5 truncate`}>{theme.description}</p>
          )}
          {(theme.tags ?? []).length > 0 && (
            <div className="flex gap-1 mt-1 flex-wrap">
              {theme.tags.map(tag => (
                <span key={tag} className={`text-[9px] px-1.5 py-0.5 ${S.bgSection} border ${S.border2} ${S.textMuted} rounded`}>{tag}</span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0 pt-0.5">
          {!isActive && hasColors && (
            <button
              onClick={e => { e.stopPropagation(); onActivate(theme.id); }}
              disabled={!!activating}
              className={`px-2 py-1 ${S.bgCard} border border-[var(--theme-accent-success)] rounded text-[10px] ${S.textSuccess} hover:${S.bgSection} transition-colors disabled:opacity-50`}
            >
              {activating === theme.id ? '적용 중...' : '활성화'}
            </button>
          )}
          <button
            onClick={e => { e.stopPropagation(); setExpanded(true); enterEdit(); }}
            className={`p-1.5 ${S.textMuted} hover:${S.textSecondary} transition-colors`}
            title="편집"
          >
            <Pencil size={12} />
          </button>
          <button
            onClick={e => {
              e.stopPropagation();
              if (!confirmDelete) { setConfirmDelete(true); }
              else { setConfirmDelete(false); onDelete(theme.id); }
            }}
            className={[
              `flex items-center gap-1 px-2 py-1 rounded text-[10px] border transition-colors`,
              confirmDelete
                ? `${S.bgCard} border-[var(--theme-accent-error)] ${S.textError}`
                : `bg-transparent border-transparent ${S.textMuted} hover:${S.textError}`,
            ].join(' ')}
            title={confirmDelete ? '한 번 더 클릭하면 삭제' : '삭제'}
          >
            {confirmDelete ? '확인?' : <Trash2 size={11} />}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className={`border-t ${S.border1} px-4 pb-4 pt-3`}>
          {!editMode ? (
            /* ── Read-only detail ── */
            <div className="space-y-3">
              {hasColors && (
                <div className="grid grid-cols-2 gap-3">
                  <ColorSwatchGrid colors={theme.lightColors!} label="Light" />
                  <ColorSwatchGrid colors={theme.darkColors!} label="Dark" />
                </div>
              )}
              <div>
                <div className={`text-[10px] ${S.textMuted} uppercase tracking-widest mb-1.5`}>캐릭터</div>
                {charsLoading ? (
                  <p className={`text-xs ${S.textMuted}`}>로딩 중...</p>
                ) : chars.length === 0 ? (
                  <p className={`text-xs ${S.textMuted}`}>캐릭터 없음</p>
                ) : (
                  <div className="flex gap-2 flex-wrap">
                    {chars.map(c => (
                      <div key={c.id} className="flex flex-col items-center gap-1">
                        <div className={`w-10 h-10 rounded border ${S.border2} ${S.bgCard} overflow-hidden`}>
                          {c.sprites['FORCE'] ? (
                            <img src={c.sprites['FORCE']} alt={c.displayName}
                              className="w-full h-full object-contain"
                              style={{ imageRendering: 'pixelated' }} />
                          ) : (
                            <div className={`w-full h-full flex items-center justify-center ${S.textMuted}`}>
                              <Users size={12} />
                            </div>
                          )}
                        </div>
                        <span className={`text-[9px] ${S.textTertiary} text-center max-w-[42px] truncate`}>{c.displayName}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex justify-end">
                <button
                  onClick={enterEdit}
                  className={`flex items-center gap-1 text-xs ${S.textMuted} hover:${S.textSecondary} transition-colors`}
                >
                  <Pencil size={11} /> 편집
                </button>
              </div>
            </div>
          ) : (
            /* ── Edit mode ── */
            <div className="space-y-3">
              {/* Edit tabs */}
              <div className={`flex rounded overflow-hidden border ${S.border2} w-fit`}>
                {(['meta', 'colors', 'characters'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setEditTab(tab)}
                    className={[
                      'px-3 py-1 text-xs transition-colors',
                      editTab === tab ? `${S.bgCard} ${S.textSecondary}` : `${S.textMuted} hover:${S.textSecondary}`,
                    ].join(' ')}
                  >
                    {tab === 'meta' ? '메타데이터' : tab === 'colors' ? '색상' : '캐릭터'}
                  </button>
                ))}
              </div>

              {/* Meta tab */}
              {editTab === 'meta' && (
                <div className="space-y-3">
                  <div>
                    <label className={`text-[10px] ${S.textTertiary} uppercase tracking-widest block mb-1`}>Display Name</label>
                    <input
                      type="text"
                      value={editDisplayName}
                      onChange={e => setEditDisplayName(e.target.value)}
                      className={`w-full text-xs ${S.bgInput} border ${S.border2} rounded px-2 py-1.5 ${S.textPrimary} ${S.focusInput}`}
                    />
                  </div>
                  <div>
                    <label className={`text-[10px] ${S.textTertiary} uppercase tracking-widest block mb-1`}>Description</label>
                    <textarea
                      value={editDescription}
                      onChange={e => setEditDescription(e.target.value)}
                      rows={2}
                      className={`w-full text-xs ${S.bgInput} border ${S.border2} rounded px-2 py-1.5 ${S.textPrimary} ${S.focusInput} resize-none`}
                    />
                  </div>
                  <div>
                    <label className={`text-[10px] ${S.textTertiary} uppercase tracking-widest block mb-1`}>Tags (쉼표 구분)</label>
                    <input
                      type="text"
                      value={editTagsInput}
                      onChange={e => setEditTagsInput(e.target.value)}
                      placeholder="fantasy, dark, anime"
                      className={`w-full text-xs ${S.bgInput} border ${S.border2} rounded px-2 py-1.5 ${S.textPrimary} ${S.focusInput}`}
                    />
                  </div>
                </div>
              )}

              {/* Colors tab */}
              {editTab === 'colors' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className={`flex rounded overflow-hidden border ${S.border2}`}>
                      {(['light', 'dark'] as const).map(tab => (
                        <button
                          key={tab}
                          onClick={() => setEditColorTab(tab)}
                          className={[
                            'px-3 py-1 text-xs transition-colors',
                            editColorTab === tab ? `${S.bgCard} ${S.textSecondary}` : `${S.textMuted} hover:${S.textSecondary}`,
                          ].join(' ')}
                        >
                          {tab === 'light' ? '라이트' : '다크'}
                        </button>
                      ))}
                    </div>
                    {editColorTab === 'dark' && (
                      <button
                        onClick={() => setEditDarkColors({ ...editLightColors })}
                        className={`flex items-center gap-1 text-xs ${S.textMuted} hover:${S.textSecondary} transition-colors`}
                      >
                        <Copy size={11} /> 라이트에서 복사
                      </button>
                    )}
                  </div>
                  {editColorTab === 'light'
                    ? <ColorGrid colors={editLightColors} onChange={(k, v) => setEditLightColors(p => ({ ...p, [k]: v }))} />
                    : <ColorGrid colors={editDarkColors}  onChange={(k, v) => setEditDarkColors(p => ({ ...p, [k]: v }))} />
                  }
                </div>
              )}

              {/* Characters tab */}
              {editTab === 'characters' && (
                <div className="space-y-2">
                  {charsLoading ? (
                    <p className={`text-xs ${S.textMuted}`}>로딩 중...</p>
                  ) : (
                    <>
                      {chars.map(c => (
                        <div key={c.id} className={`flex items-center gap-2 p-2 border ${S.border1} rounded-lg ${S.bgCard}`}>
                          <div className={`w-8 h-8 rounded border ${S.border2} overflow-hidden flex-shrink-0`}>
                            {c.sprites['FORCE'] ? (
                              <img src={c.sprites['FORCE']} alt={c.displayName}
                                className="w-full h-full object-contain"
                                style={{ imageRendering: 'pixelated' }} />
                            ) : (
                              <div className={`w-full h-full flex items-center justify-center ${S.textMuted}`}><Users size={10} /></div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs ${S.textPrimary}`}>{c.displayName}</p>
                            <p className={`text-[10px] ${S.textMuted} font-mono`}>{c.characterId}</p>
                          </div>
                          <button
                            onClick={() => handleDeleteChar(c.id)}
                            className={`${S.textMuted} hover:${S.textError} transition-colors flex-shrink-0`}
                            title="캐릭터 삭제"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                      {!addingChar ? (
                        <button
                          onClick={() => setAddingChar(true)}
                          className={`flex items-center gap-1.5 text-xs ${S.textMuted} hover:${S.textSecondary} transition-colors mt-1`}
                        >
                          <Plus size={11} /> 캐릭터 추가
                        </button>
                      ) : (
                        <AddCharacterPanel
                          themeId={theme.id}
                          onAdded={() => { setAddingChar(false); loadChars(); }}
                          onCancel={() => setAddingChar(false)}
                        />
                      )}
                    </>
                  )}
                </div>
              )}

              {saveError && <p className={`text-xs ${S.textError}`}>{saveError}</p>}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => { setEditMode(false); setSaveError(null); }}
                  className={`text-xs px-3 py-1.5 ${S.bgCard} border ${S.border2} rounded ${S.textMuted}`}
                >
                  {editTab === 'characters' ? '완료' : '취소'}
                </button>
                {editTab !== 'characters' && (
                  <button
                    onClick={handleSave}
                    disabled={saving || !editDisplayName.trim()}
                    className={`text-xs px-3 py-1.5 rounded transition-colors ${saving || !editDisplayName.trim()
                      ? `${S.bgCard} border ${S.border2} ${S.textMuted} cursor-not-allowed`
                      : `${S.bgCard} border border-[var(--theme-accent-success)] ${S.textSuccess}`
                    }`}
                  >
                    {saving ? '저장 중...' : '저장'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ThemeList({ activeThemeId, onClose }: { activeThemeId: string | null; onClose: () => void }) {
  const [themes, setThemes] = useState<ThemeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState<string | null>(null);

  const loadThemes = useCallback(() => {
    setLoading(true);
    fetch(`${API_BASE_URL}/api/themes`)
      .then(r => r.json())
      .then(json => setThemes(json.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadThemes(); }, [loadThemes]);

  const handleActivate = useCallback(async (themeId: string) => {
    setActivating(themeId);
    try {
      await fetch(`${API_BASE_URL}/api/themes/${themeId}/activate`, { method: 'POST' });
      await fetchCharacters();
      onClose();
    } finally {
      setActivating(null);
    }
  }, [onClose]);

  const handleDelete = useCallback(async (themeId: string) => {
    try {
      await fetch(`${API_BASE_URL}/api/themes/${themeId}`, { method: 'DELETE' });
      await fetchCharacters();
      setThemes(prev => prev.filter(t => t.id !== themeId));
    } catch { /* ignore */ }
  }, []);

  if (loading) return (
    <div className={`flex items-center justify-center py-12 text-xs ${S.textMuted}`}>로딩 중...</div>
  );

  if (themes.length === 0) return (
    <div className="flex flex-col items-center justify-center py-12 gap-2">
      <p className={`text-xs ${S.textMuted}`}>등록된 테마가 없습니다</p>
      <p className={`text-[10px] ${S.textMuted} opacity-60`}>업로드 탭에서 테마를 추가하세요</p>
    </div>
  );

  return (
    <div className="space-y-2">
      {themes.map(theme => (
        <ThemeCard
          key={theme.id}
          theme={theme}
          activeThemeId={activeThemeId}
          activating={activating}
          onActivate={handleActivate}
          onDelete={handleDelete}
          onRefresh={loadThemes}
        />
      ))}
    </div>
  );
}

// ── Step indicators ───────────────────────────────────────────────────────────

const STEPS = [
  { n: 1 as Step, label: '메타데이터', icon: FileText },
  { n: 2 as Step, label: '색상',       icon: Palette },
  { n: 3 as Step, label: '캐릭터',     icon: Users },
];

// ── Main component ────────────────────────────────────────────────────────────

interface Props { onClose: () => void; }

export function ThemePackageUpload({ onClose }: Props) {
  const uid = useId();

  // Modal-level tab
  const [modalTab, setModalTab] = useState<'list' | 'upload'>('list');
  const activeTheme = useWebSocketStore(s => s.activeTheme);

  // Step
  const [step, setStep] = useState<Step>(1);

  // Step 1: Metadata
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');

  // Step 2: Colors
  const [colorTab, setColorTab] = useState<'light' | 'dark'>('light');
  const [lightColors, setLightColors] = useState<ColorSet>(defaultLightColors);
  const [darkColors, setDarkColors] = useState<ColorSet>(defaultDarkColors);

  // Step 3: Characters
  const [characters, setCharacters] = useState<CharacterDef[]>([]);

  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [uploadedThemeId, setUploadedThemeId] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);

  // ── Validation ──────────────────────────────────────────────────────────────

  const step1Ok = name.trim() !== '' && displayName.trim() !== '' && /^[a-z0-9-_]+$/.test(name.trim());
  const colorsComplete = useCallback((c: ColorSet) => COLOR_TOKENS.every(t => c[t.key].trim() !== ''), []);
  const step2Ok = colorsComplete(lightColors) && colorsComplete(darkColors);
  const step3Ok = characters.length > 0 && characters.every(c =>
    c.characterId.trim() !== '' && c.displayName.trim() !== '' && c.spritePrefix.trim() !== '' && !!c.sprites['FORCE']
  );

  // ── Handlers ────────────────────────────────────────────────────────────────

  const updateLightColor = useCallback((key: ColorKey, v: string) => setLightColors(p => ({ ...p, [key]: v })), []);
  const updateDarkColor  = useCallback((key: ColorKey, v: string) => setDarkColors(p => ({ ...p, [key]: v })),  []);
  const copyLightToDark  = useCallback(() => setDarkColors({ ...lightColors }), [lightColors]);

  const addCharacter = useCallback(() => {
    setCharacters(prev => [...prev, { localId: Math.random().toString(36).slice(2), characterId: '', displayName: '', spritePrefix: '', sprites: {}, previews: {} }]);
  }, []);

  const updateCharacter = useCallback((localId: string, c: CharacterDef) => {
    setCharacters(prev => prev.map(x => x.localId === localId ? c : x));
  }, []);

  const removeCharacter = useCallback((localId: string) => {
    setCharacters(prev => {
      const removed = prev.find(x => x.localId === localId);
      if (removed) Object.values(removed.previews).forEach(url => { if (url) URL.revokeObjectURL(url); });
      return prev.filter(x => x.localId !== localId);
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
    const metadata = {
      theme: { name: name.trim(), displayName: displayName.trim(), description: description.trim() || undefined, tags, lightColors, darkColors },
      characters: characters.map(c => ({ characterId: c.characterId, displayName: c.displayName, spritePrefix: c.spritePrefix })),
    };
    const fd = new FormData();
    fd.append('metadata', JSON.stringify(metadata));
    for (const char of characters) {
      for (const status of SPRITE_STATUSES) {
        const file = char.sprites[status];
        if (file) fd.append(`${char.characterId}_${status}`, file);
      }
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/themes/upload`, { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json.success) { setError(json.error ?? `Upload failed (${res.status})`); setSubmitting(false); return; }
      await fetchCharacters();
      setUploadedThemeId(json.data?.theme?.id ?? null);
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
      setSubmitting(false);
    }
  }, [name, displayName, description, tagsInput, lightColors, darkColors, characters]);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).dataset.overlay) onClose();
  }, [onClose]);

  // ── Shared button styles ─────────────────────────────────────────────────────

  const btnSecondary = `px-3 py-1.5 ${S.bgCard} border ${S.border2} rounded text-xs ${S.textSecondary} hover:${S.bgSection} transition-colors`;
  const btnPrimary   = `px-4 py-1.5 ${S.bgCard} border border-[var(--theme-accent-success)] rounded text-xs font-medium ${S.textSuccess} hover:${S.bgSection} transition-colors`;

  // ── Render ──────────────────────────────────────────────────────────────────

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      data-overlay="1"
      onClick={handleOverlayClick}
    >
      <div
        className={`w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl border ${S.border1} shadow-2xl`}
        style={{ background: 'var(--theme-bg-primary)', boxShadow: '0 24px 64px var(--theme-shadow-lg)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-3 border-b ${S.border1}`}>
          <div className={`flex rounded overflow-hidden border ${S.border2}`}>
            {([
              { key: 'list',   label: '테마 목록', icon: List   },
              { key: 'upload', label: '업로드',    icon: Upload },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setModalTab(tab.key)}
                className={[
                  'flex items-center gap-1.5 px-4 py-1.5 text-xs transition-colors',
                  modalTab === tab.key
                    ? `${S.bgCard} ${S.textSecondary}`
                    : `${S.textMuted} hover:${S.textSecondary}`,
                ].join(' ')}
              >
                <tab.icon size={12} />
                {tab.label}
              </button>
            ))}
          </div>
          <button onClick={onClose} className={`${S.textMuted} hover:${S.textPrimary} transition-colors`}>
            <X size={16} />
          </button>
        </div>

        {/* Upload: Step indicator */}
        {modalTab === 'upload' && !success && (
          <div className={`flex items-center gap-0 px-5 py-3 border-b ${S.border1}`}>
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const active = step === s.n;
              const done = step > s.n;
              return (
                <div key={s.n} className="flex items-center">
                  <button
                    onClick={() => { if (done || active) setStep(s.n); }}
                    className={[
                      'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-colors',
                      active ? `${S.bgCard} ${S.textSecondary}` : done ? `${S.textSuccess} cursor-pointer` : S.textMuted,
                    ].join(' ')}
                  >
                    {done ? <CheckCircle size={12} /> : <Icon size={12} />}
                    {s.label}
                  </button>
                  {i < STEPS.length - 1 && <ChevronRight size={12} className={`${S.textMuted} mx-1`} />}
                </div>
              );
            })}
          </div>
        )}

        {/* List tab */}
        {modalTab === 'list' && (
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <ThemeList activeThemeId={activeTheme?.id ?? null} onClose={onClose} />
          </div>
        )}

        {/* Success state */}
        {modalTab === 'upload' && success ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
            <CheckCircle size={48} className={S.textSuccess} />
            <div className="text-center">
              <p className={`${S.textSecondary} font-semibold mb-1`}>업로드 완료</p>
              <p className={`text-xs ${S.textTertiary}`}>테마 "{displayName}"이(가) 등록되었습니다.</p>
            </div>
            <div className="flex gap-2">
              {uploadedThemeId && (
                <button
                  onClick={async () => {
                    setActivating(true);
                    try { await fetch(`${API_BASE_URL}/api/themes/${uploadedThemeId}/activate`, { method: 'POST' }); }
                    finally { setActivating(false); }
                    onClose();
                  }}
                  disabled={activating}
                  className={`${btnPrimary} disabled:opacity-50`}
                >
                  {activating ? '적용 중...' : '이 테마 활성화'}
                </button>
              )}
              <button onClick={onClose} className={btnSecondary}>닫기</button>
            </div>
          </div>
        ) : modalTab === 'upload' ? (
          <>
            {/* Step content */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

              {/* ── Step 1: Metadata ── */}
              {step === 1 && (
                <div className="space-y-4">
                  <div>
                    <label htmlFor={`${uid}-name`} className={`text-[10px] ${S.textTertiary} uppercase tracking-widest block mb-1`}>
                      Theme ID <span className={S.textError}>*</span>
                    </label>
                    <input
                      id={`${uid}-name`}
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))}
                      placeholder="dark-fantasy"
                      className={`w-full text-sm ${S.bgInput} border ${S.border2} rounded px-3 py-2 ${S.textPrimary} font-mono ${S.focusInput}`}
                    />
                    <p className={`text-[10px] ${S.textMuted} mt-1`}>소문자·숫자·하이픈·밑줄만 허용 (고유값)</p>
                  </div>
                  <div>
                    <label htmlFor={`${uid}-displayName`} className={`text-[10px] ${S.textTertiary} uppercase tracking-widest block mb-1`}>
                      Display Name <span className={S.textError}>*</span>
                    </label>
                    <input
                      id={`${uid}-displayName`}
                      type="text"
                      value={displayName}
                      onChange={e => setDisplayName(e.target.value)}
                      placeholder="Dark Fantasy"
                      className={`w-full text-sm ${S.bgInput} border ${S.border2} rounded px-3 py-2 ${S.textPrimary} ${S.focusInput}`}
                    />
                  </div>
                  <div>
                    <label htmlFor={`${uid}-desc`} className={`text-[10px] ${S.textTertiary} uppercase tracking-widest block mb-1`}>Description</label>
                    <textarea
                      id={`${uid}-desc`}
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      rows={2}
                      placeholder="(선택사항)"
                      className={`w-full text-sm ${S.bgInput} border ${S.border2} rounded px-3 py-2 ${S.textPrimary} ${S.focusInput} resize-none`}
                    />
                  </div>
                  <div>
                    <label htmlFor={`${uid}-tags`} className={`text-[10px] ${S.textTertiary} uppercase tracking-widest block mb-1`}>Tags</label>
                    <input
                      id={`${uid}-tags`}
                      type="text"
                      value={tagsInput}
                      onChange={e => setTagsInput(e.target.value)}
                      placeholder="fantasy, dark, anime (쉼표 구분)"
                      className={`w-full text-sm ${S.bgInput} border ${S.border2} rounded px-3 py-2 ${S.textPrimary} ${S.focusInput}`}
                    />
                  </div>
                </div>
              )}

              {/* ── Step 2: Colors ── */}
              {step === 2 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className={`flex rounded overflow-hidden border ${S.border2}`}>
                      {(['light', 'dark'] as const).map(tab => (
                        <button
                          key={tab}
                          onClick={() => setColorTab(tab)}
                          className={[
                            'px-4 py-1.5 text-xs transition-colors',
                            colorTab === tab ? `${S.bgCard} ${S.textSecondary}` : `${S.textMuted} hover:${S.textSecondary}`,
                          ].join(' ')}
                        >
                          {tab === 'light' ? '라이트 모드' : '다크 모드'}
                          {colorsComplete(tab === 'light' ? lightColors : darkColors) && (
                            <CheckCircle size={10} className={`inline ml-1 ${S.textSuccess}`} />
                          )}
                        </button>
                      ))}
                    </div>
                    {colorTab === 'dark' && (
                      <button onClick={copyLightToDark} className={`flex items-center gap-1 text-xs ${S.textMuted} hover:${S.textSecondary} transition-colors`}>
                        <Copy size={11} />
                        라이트에서 복사
                      </button>
                    )}
                  </div>
                  <div className={`text-[10px] ${S.textMuted}`}>
                    {colorTab === 'light' ? '라이트 모드에서 사용할 24개 색상 토큰' : '다크 모드에서 사용할 24개 색상 토큰'}
                  </div>
                  {colorTab === 'light'
                    ? <ColorGrid colors={lightColors} onChange={updateLightColor} />
                    : <ColorGrid colors={darkColors}  onChange={updateDarkColor}  />
                  }
                </div>
              )}

              {/* ── Step 3: Characters ── */}
              {step === 3 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-xs ${S.textSecondary}`}>캐릭터 정의</p>
                      <p className={`text-[10px] ${S.textMuted}`}>각 캐릭터는 FORCE 스프라이트(필수) 1개 이상 필요</p>
                    </div>
                    <button onClick={addCharacter} className={`flex items-center gap-1.5 ${btnSecondary}`}>
                      <Plus size={12} />
                      캐릭터 추가
                    </button>
                  </div>
                  {characters.length === 0 && (
                    <div className={`text-center py-8 ${S.textMuted} text-xs`}>캐릭터를 추가하세요</div>
                  )}
                  {characters.map(char => (
                    <CharacterEditor
                      key={char.localId}
                      char={char}
                      onUpdate={updated => updateCharacter(char.localId, updated)}
                      onRemove={() => removeCharacter(char.localId)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className={`mx-5 mb-2 px-3 py-2 ${S.bgCard} border border-[var(--theme-accent-error)] rounded text-xs ${S.textError}`}>
                {error}
              </div>
            )}

            {/* Footer nav */}
            <div className={`flex items-center justify-between px-5 py-3 border-t ${S.border1}`}>
              <button
                onClick={() => setStep(s => Math.max(1, s - 1) as Step)}
                className={[
                  `flex items-center gap-1 px-3 py-1.5 rounded text-xs transition-colors ${S.textMuted} hover:${S.textSecondary}`,
                  step === 1 ? 'invisible' : '',
                ].join(' ')}
              >
                <ChevronLeft size={13} />
                이전
              </button>

              <div className={`text-[10px] ${S.textMuted}`}>
                {step === 1 && !step1Ok && '이름(필수)을 입력하세요'}
                {step === 2 && !step2Ok && '모든 색상 토큰을 입력하세요'}
                {step === 3 && !step3Ok && characters.length === 0 && '캐릭터를 추가하세요'}
                {step === 3 && !step3Ok && characters.length > 0 && 'FORCE 스프라이트가 없는 캐릭터가 있습니다'}
              </div>

              {step < 3 ? (
                <button
                  onClick={() => setStep(s => s + 1 as Step)}
                  disabled={step === 1 ? !step1Ok : !step2Ok}
                  className={[
                    'flex items-center gap-1 px-4 py-1.5 rounded text-xs transition-colors',
                    (step === 1 ? !step1Ok : !step2Ok)
                      ? `${S.textMuted} cursor-not-allowed`
                      : btnSecondary,
                  ].join(' ')}
                >
                  다음
                  <ChevronRight size={13} />
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={!step3Ok || submitting}
                  className={[
                    'flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-medium transition-colors',
                    (!step3Ok || submitting) ? `${S.textMuted} cursor-not-allowed` : btnPrimary,
                  ].join(' ')}
                >
                  <Upload size={12} />
                  {submitting ? '업로드 중...' : '업로드'}
                </button>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
