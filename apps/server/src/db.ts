import { Database } from 'bun:sqlite';
import type { HookEvent, FilterOptions, Theme, ThemeSearchQuery, ThemeCharacter, CharacterSprite } from './types';

let db: Database;

export function initDatabase(): void {
  db = new Database('events.db');
  
  // Enable WAL mode for better concurrent performance
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  
  // Create events table
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_app TEXT NOT NULL,
      session_id TEXT NOT NULL,
      hook_event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      chat TEXT,
      summary TEXT,
      timestamp INTEGER NOT NULL
    )
  `);
  
  // Check if chat column exists, add it if not (for migration)
  try {
    const columns = db.prepare("PRAGMA table_info(events)").all() as any[];
    const hasChatColumn = columns.some((col: any) => col.name === 'chat');
    if (!hasChatColumn) {
      db.exec('ALTER TABLE events ADD COLUMN chat TEXT');
    }

    // Check if summary column exists, add it if not (for migration)
    const hasSummaryColumn = columns.some((col: any) => col.name === 'summary');
    if (!hasSummaryColumn) {
      db.exec('ALTER TABLE events ADD COLUMN summary TEXT');
    }

    // Check if humanInTheLoop column exists, add it if not (for migration)
    const hasHumanInTheLoopColumn = columns.some((col: any) => col.name === 'humanInTheLoop');
    if (!hasHumanInTheLoopColumn) {
      db.exec('ALTER TABLE events ADD COLUMN humanInTheLoop TEXT');
    }

    // Check if humanInTheLoopStatus column exists, add it if not (for migration)
    const hasHumanInTheLoopStatusColumn = columns.some((col: any) => col.name === 'humanInTheLoopStatus');
    if (!hasHumanInTheLoopStatusColumn) {
      db.exec('ALTER TABLE events ADD COLUMN humanInTheLoopStatus TEXT');
    }

    // Check if model_name column exists, add it if not (for migration)
    const hasModelNameColumn = columns.some((col: any) => col.name === 'model_name');
    if (!hasModelNameColumn) {
      db.exec('ALTER TABLE events ADD COLUMN model_name TEXT');
    }
  } catch (error) {
    // If the table doesn't exist yet, the CREATE TABLE above will handle it
  }
  
  // Create indexes for common queries
  db.exec('CREATE INDEX IF NOT EXISTS idx_source_app ON events(source_app)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_session_id ON events(session_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_hook_event_type ON events(hook_event_type)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_timestamp ON events(timestamp)');
  
  // Create agent_characters table for persistent character assignment
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_characters (
      agent_key TEXT PRIMARY KEY,
      character_id TEXT NOT NULL
    )
  `);

  // Create themes table
  db.exec(`
    CREATE TABLE IF NOT EXISTS themes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      displayName TEXT NOT NULL,
      description TEXT,
      colors TEXT NOT NULL,
      isPublic INTEGER NOT NULL DEFAULT 0,
      authorId TEXT,
      authorName TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      tags TEXT,
      downloadCount INTEGER DEFAULT 0,
      rating REAL DEFAULT 0,
      ratingCount INTEGER DEFAULT 0
    )
  `);
  
  // Create theme shares table
  db.exec(`
    CREATE TABLE IF NOT EXISTS theme_shares (
      id TEXT PRIMARY KEY,
      themeId TEXT NOT NULL,
      shareToken TEXT NOT NULL UNIQUE,
      expiresAt INTEGER,
      isPublic INTEGER NOT NULL DEFAULT 0,
      allowedUsers TEXT,
      createdAt INTEGER NOT NULL,
      accessCount INTEGER DEFAULT 0,
      FOREIGN KEY (themeId) REFERENCES themes (id) ON DELETE CASCADE
    )
  `);
  
  // Create theme ratings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS theme_ratings (
      id TEXT PRIMARY KEY,
      themeId TEXT NOT NULL,
      userId TEXT NOT NULL,
      rating INTEGER NOT NULL,
      comment TEXT,
      createdAt INTEGER NOT NULL,
      UNIQUE(themeId, userId),
      FOREIGN KEY (themeId) REFERENCES themes (id) ON DELETE CASCADE
    )
  `);
  
  // Create indexes for theme tables
  db.exec('CREATE INDEX IF NOT EXISTS idx_themes_name ON themes(name)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_themes_isPublic ON themes(isPublic)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_themes_createdAt ON themes(createdAt)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_theme_shares_token ON theme_shares(shareToken)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_theme_ratings_theme ON theme_ratings(themeId)');

  // Phase 1: themes 테이블 마이그레이션 - light_colors / dark_colors 컬럼 추가
  const themeColumns = db.prepare("PRAGMA table_info(themes)").all() as any[];
  if (!themeColumns.some((c: any) => c.name === 'light_colors')) {
    db.exec('ALTER TABLE themes ADD COLUMN light_colors TEXT');
    // 기존 colors → light_colors로 복사
    db.exec('UPDATE themes SET light_colors = colors WHERE light_colors IS NULL');
  }
  if (!themeColumns.some((c: any) => c.name === 'dark_colors')) {
    db.exec('ALTER TABLE themes ADD COLUMN dark_colors TEXT');
  }

  // Phase 1: 테마 캐릭터 테이블
  db.exec(`
    CREATE TABLE IF NOT EXISTS theme_characters (
      id TEXT PRIMARY KEY,
      themeId TEXT NOT NULL,
      characterId TEXT NOT NULL,
      displayName TEXT NOT NULL,
      spritePrefix TEXT NOT NULL,
      sortOrder INTEGER DEFAULT 0,
      createdAt INTEGER NOT NULL,
      UNIQUE(themeId, characterId),
      FOREIGN KEY (themeId) REFERENCES themes(id) ON DELETE CASCADE
    )
  `);

  // Phase 1: 캐릭터별 스프라이트 파일 테이블
  db.exec(`
    CREATE TABLE IF NOT EXISTS character_sprites (
      id TEXT PRIMARY KEY,
      characterId TEXT NOT NULL,
      status TEXT NOT NULL,
      filePath TEXT NOT NULL,
      fileSize INTEGER NOT NULL,
      mimeType TEXT DEFAULT 'image/gif',
      createdAt INTEGER NOT NULL,
      UNIQUE(characterId, status),
      FOREIGN KEY (characterId) REFERENCES theme_characters(id) ON DELETE CASCADE
    )
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_theme_characters_themeId ON theme_characters(themeId)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_character_sprites_characterId ON character_sprites(characterId)');

  // App settings table (key-value store for persistent server state)
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
}

export function insertEvent(event: HookEvent): HookEvent {
  const stmt = db.prepare(`
    INSERT INTO events (source_app, session_id, hook_event_type, payload, chat, summary, timestamp, humanInTheLoop, humanInTheLoopStatus, model_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const timestamp = event.timestamp || Date.now();

  // Initialize humanInTheLoopStatus to pending if humanInTheLoop exists
  let humanInTheLoopStatus = event.humanInTheLoopStatus;
  if (event.humanInTheLoop && !humanInTheLoopStatus) {
    humanInTheLoopStatus = { status: 'pending' };
  }

  const result = stmt.run(
    event.source_app,
    event.session_id,
    event.hook_event_type,
    JSON.stringify(event.payload),
    event.chat ? JSON.stringify(event.chat) : null,
    event.summary || null,
    timestamp,
    event.humanInTheLoop ? JSON.stringify(event.humanInTheLoop) : null,
    humanInTheLoopStatus ? JSON.stringify(humanInTheLoopStatus) : null,
    event.model_name || null
  );

  return {
    ...event,
    id: result.lastInsertRowid as number,
    timestamp,
    humanInTheLoopStatus
  };
}

export function getFilterOptions(): FilterOptions {
  const sourceApps = db.prepare('SELECT DISTINCT source_app FROM events ORDER BY source_app').all() as { source_app: string }[];
  const sessionIds = db.prepare('SELECT DISTINCT session_id FROM events ORDER BY session_id DESC LIMIT 300').all() as { session_id: string }[];
  const hookEventTypes = db.prepare('SELECT DISTINCT hook_event_type FROM events ORDER BY hook_event_type').all() as { hook_event_type: string }[];
  
  return {
    source_apps: sourceApps.map(row => row.source_app),
    session_ids: sessionIds.map(row => row.session_id),
    hook_event_types: hookEventTypes.map(row => row.hook_event_type)
  };
}

export function getRecentEvents(limit: number = 300): HookEvent[] {
  const stmt = db.prepare(`
    SELECT id, source_app, session_id, hook_event_type, payload, chat, summary, timestamp, humanInTheLoop, humanInTheLoopStatus, model_name
    FROM events
    ORDER BY timestamp DESC
    LIMIT ?
  `);

  const rows = stmt.all(limit) as any[];

  return rows.map(row => ({
    id: row.id,
    source_app: row.source_app,
    session_id: row.session_id,
    hook_event_type: row.hook_event_type,
    payload: JSON.parse(row.payload),
    chat: row.chat ? JSON.parse(row.chat) : undefined,
    summary: row.summary || undefined,
    timestamp: row.timestamp,
    humanInTheLoop: row.humanInTheLoop ? JSON.parse(row.humanInTheLoop) : undefined,
    humanInTheLoopStatus: row.humanInTheLoopStatus ? JSON.parse(row.humanInTheLoopStatus) : undefined,
    model_name: row.model_name || undefined
  })).reverse();
}

// Theme database functions
export function insertTheme(theme: Theme): Theme {
  const stmt = db.prepare(`
    INSERT INTO themes (id, name, displayName, description, colors, light_colors, dark_colors, isPublic, authorId, authorName, createdAt, updatedAt, tags, downloadCount, rating, ratingCount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const colorsJson = JSON.stringify(theme.lightColors ?? theme.colors);

  stmt.run(
    theme.id,
    theme.name,
    theme.displayName,
    theme.description || null,
    JSON.stringify(theme.colors),
    colorsJson,
    theme.darkColors ? JSON.stringify(theme.darkColors) : null,
    theme.isPublic ? 1 : 0,
    theme.authorId || null,
    theme.authorName || null,
    theme.createdAt,
    theme.updatedAt,
    JSON.stringify(theme.tags),
    theme.downloadCount || 0,
    theme.rating || 0,
    theme.ratingCount || 0
  );

  return theme;
}

export function updateTheme(id: string, updates: Partial<Theme> & { updatedAt?: number }): boolean {
  const setClauses: string[] = [];
  const values: any[] = [];

  if (updates.displayName !== undefined) { setClauses.push('displayName = ?'); values.push(updates.displayName); }
  if (updates.description !== undefined) { setClauses.push('description = ?'); values.push(updates.description || null); }
  if (updates.isPublic !== undefined) { setClauses.push('isPublic = ?'); values.push(updates.isPublic ? 1 : 0); }
  if (updates.tags !== undefined) { setClauses.push('tags = ?'); values.push(JSON.stringify(updates.tags)); }
  if (updates.colors !== undefined) { setClauses.push('colors = ?'); values.push(JSON.stringify(updates.colors)); }
  if (updates.lightColors !== undefined) { setClauses.push('light_colors = ?'); values.push(JSON.stringify(updates.lightColors)); }
  if (updates.darkColors !== undefined) { setClauses.push('dark_colors = ?'); values.push(JSON.stringify(updates.darkColors)); }
  if (updates.updatedAt !== undefined) { setClauses.push('updatedAt = ?'); values.push(updates.updatedAt); }

  if (setClauses.length === 0) return false;

  const stmt = db.prepare(`UPDATE themes SET ${setClauses.join(', ')} WHERE id = ?`);
  const result = stmt.run(...values, id);
  return result.changes > 0;
}

export function getTheme(id: string): Theme | null {
  const stmt = db.prepare('SELECT * FROM themes WHERE id = ?');
  const row = stmt.get(id) as any;

  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    displayName: row.displayName,
    description: row.description,
    colors: JSON.parse(row.colors),
    lightColors: row.light_colors ? JSON.parse(row.light_colors) : undefined,
    darkColors: row.dark_colors ? JSON.parse(row.dark_colors) : undefined,
    isPublic: Boolean(row.isPublic),
    authorId: row.authorId,
    authorName: row.authorName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    tags: JSON.parse(row.tags || '[]'),
    downloadCount: row.downloadCount,
    rating: row.rating,
    ratingCount: row.ratingCount
  };
}

export function getThemes(query: ThemeSearchQuery = {}): Theme[] {
  let sql = 'SELECT * FROM themes WHERE 1=1';
  const params: any[] = [];
  
  if (query.isPublic !== undefined) {
    sql += ' AND isPublic = ?';
    params.push(query.isPublic ? 1 : 0);
  }
  
  if (query.authorId) {
    sql += ' AND authorId = ?';
    params.push(query.authorId);
  }
  
  if (query.query) {
    sql += ' AND (name LIKE ? OR displayName LIKE ? OR description LIKE ?)';
    const searchTerm = `%${query.query}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }
  
  // Add sorting
  const sortBy = query.sortBy || 'created';
  const sortOrder = query.sortOrder || 'desc';
  const sortColumn = {
    name: 'name',
    created: 'createdAt',
    updated: 'updatedAt',
    downloads: 'downloadCount',
    rating: 'rating'
  }[sortBy] || 'createdAt';
  
  sql += ` ORDER BY ${sortColumn} ${sortOrder.toUpperCase()}`;
  
  // Add pagination
  if (query.limit) {
    sql += ' LIMIT ?';
    params.push(query.limit);
    
    if (query.offset) {
      sql += ' OFFSET ?';
      params.push(query.offset);
    }
  }
  
  const stmt = db.prepare(sql);
  const rows = stmt.all(...params) as any[];
  
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    displayName: row.displayName,
    description: row.description,
    colors: JSON.parse(row.colors),
    lightColors: row.light_colors ? JSON.parse(row.light_colors) : undefined,
    darkColors: row.dark_colors ? JSON.parse(row.dark_colors) : undefined,
    isPublic: Boolean(row.isPublic),
    authorId: row.authorId,
    authorName: row.authorName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    tags: JSON.parse(row.tags || '[]'),
    downloadCount: row.downloadCount,
    rating: row.rating,
    ratingCount: row.ratingCount
  }));
}

export function deleteTheme(id: string): boolean {
  const stmt = db.prepare('DELETE FROM themes WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

export function incrementThemeDownloadCount(id: string): boolean {
  const stmt = db.prepare('UPDATE themes SET downloadCount = downloadCount + 1 WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

// HITL helper functions
export function getEventById(id: number): HookEvent | null {
  const row = db.prepare(`
    SELECT id, source_app, session_id, hook_event_type, payload, chat, summary, timestamp, humanInTheLoop, humanInTheLoopStatus, model_name
    FROM events WHERE id = ?
  `).get(id) as any;

  if (!row) return null;

  return {
    id: row.id,
    source_app: row.source_app,
    session_id: row.session_id,
    hook_event_type: row.hook_event_type,
    payload: JSON.parse(row.payload),
    chat: row.chat ? JSON.parse(row.chat) : undefined,
    summary: row.summary || undefined,
    timestamp: row.timestamp,
    humanInTheLoop: row.humanInTheLoop ? JSON.parse(row.humanInTheLoop) : undefined,
    humanInTheLoopStatus: row.humanInTheLoopStatus ? JSON.parse(row.humanInTheLoopStatus) : undefined,
    model_name: row.model_name || undefined,
  };
}

export function updateEventHITLResponse(id: number, response: any): HookEvent | null {
  const status = {
    status: 'responded',
    respondedAt: response.respondedAt,
    response
  };

  const stmt = db.prepare('UPDATE events SET humanInTheLoopStatus = ? WHERE id = ?');
  stmt.run(JSON.stringify(status), id);

  const selectStmt = db.prepare(`
    SELECT id, source_app, session_id, hook_event_type, payload, chat, summary, timestamp, humanInTheLoop, humanInTheLoopStatus, model_name
    FROM events
    WHERE id = ?
  `);
  const row = selectStmt.get(id) as any;

  if (!row) return null;

  return {
    id: row.id,
    source_app: row.source_app,
    session_id: row.session_id,
    hook_event_type: row.hook_event_type,
    payload: JSON.parse(row.payload),
    chat: row.chat ? JSON.parse(row.chat) : undefined,
    summary: row.summary || undefined,
    timestamp: row.timestamp,
    humanInTheLoop: row.humanInTheLoop ? JSON.parse(row.humanInTheLoop) : undefined,
    humanInTheLoopStatus: row.humanInTheLoopStatus ? JSON.parse(row.humanInTheLoopStatus) : undefined,
    model_name: row.model_name || undefined
  };
}

// Phase 1: ThemeCharacter CRUD
export function insertThemeCharacter(char: ThemeCharacter): ThemeCharacter {
  db.prepare(`
    INSERT INTO theme_characters (id, themeId, characterId, displayName, spritePrefix, sortOrder, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(char.id, char.themeId, char.characterId, char.displayName, char.spritePrefix, char.sortOrder, char.createdAt);
  return char;
}

export function getThemeCharacters(themeId: string): ThemeCharacter[] {
  return (db.prepare(`
    SELECT * FROM theme_characters WHERE themeId = ? ORDER BY sortOrder ASC, createdAt ASC
  `).all(themeId) as any[]).map(rowToThemeCharacter);
}

export function getAllCharacters(): ThemeCharacter[] {
  return (db.prepare(`
    SELECT * FROM theme_characters ORDER BY themeId, sortOrder ASC
  `).all() as any[]).map(rowToThemeCharacter);
}

export function deleteThemeCharacter(id: string): boolean {
  return db.prepare('DELETE FROM theme_characters WHERE id = ?').run(id).changes > 0;
}

export function deleteThemeCharacterById(charRowId: string): ThemeCharacter | null {
  const row = db.prepare('SELECT * FROM theme_characters WHERE id = ?').get(charRowId) as any;
  if (!row) return null;
  db.prepare('DELETE FROM theme_characters WHERE id = ?').run(charRowId);
  return rowToThemeCharacter(row);
}

function rowToThemeCharacter(row: any): ThemeCharacter {
  return {
    id: row.id,
    themeId: row.themeId,
    characterId: row.characterId,
    displayName: row.displayName,
    spritePrefix: row.spritePrefix,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
  };
}

// Phase 1: CharacterSprite CRUD
export function insertCharacterSprite(sprite: CharacterSprite): CharacterSprite {
  db.prepare(`
    INSERT INTO character_sprites (id, characterId, status, filePath, fileSize, mimeType, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(sprite.id, sprite.characterId, sprite.status, sprite.filePath, sprite.fileSize, sprite.mimeType, sprite.createdAt);
  return sprite;
}

export function getCharacterSprites(characterId: string): CharacterSprite[] {
  return (db.prepare(`
    SELECT * FROM character_sprites WHERE characterId = ? ORDER BY status ASC
  `).all(characterId) as any[]).map(rowToCharacterSprite);
}

export function deleteCharacterSprites(characterId: string): boolean {
  return db.prepare('DELETE FROM character_sprites WHERE characterId = ?').run(characterId).changes > 0;
}

function rowToCharacterSprite(row: any): CharacterSprite {
  return {
    id: row.id,
    characterId: row.characterId,
    status: row.status,
    filePath: row.filePath,
    fileSize: row.fileSize,
    mimeType: row.mimeType || 'image/gif',
    createdAt: row.createdAt,
  };
}

// App settings helpers
export function getAppSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as any;
  return row ? row.value : null;
}

export function setAppSetting(key: string, value: string | null): void {
  if (value === null) {
    db.prepare('DELETE FROM app_settings WHERE key = ?').run(key);
  } else {
    db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(key, value);
  }
}

export { db };