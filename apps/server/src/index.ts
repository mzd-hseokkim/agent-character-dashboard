import { initDatabase, insertEvent, getFilterOptions, getRecentEvents, getEventById, updateEventHITLResponse, db, getAllCharacters, getThemeCharacters, getCharacterSprites, getTheme, deleteThemeCharacterById, getAppSetting, setAppSetting } from './db';
import type { HookEvent, HumanInTheLoopResponse } from './types';
import {
  createTheme,
  updateThemeById,
  getThemeById,
  searchThemes,
  deleteThemeById,
  exportThemeById,
  importTheme,
  getThemeStats
} from './theme';
import { handleThemeUpload, handleAddThemeCharacter, deleteThemeCharacterFiles } from './upload';

// Initialize database
initDatabase();

// Store WebSocket clients
const wsClients = new Set<any>();

// Active theme — persisted in DB, loaded on startup
let activeThemeId: string | null = getAppSetting('activeThemeId');

// ─── Agent State Management ───────────────────────────────────────────────────

type AgentStatus = 'WORKING' | 'THINKING' | 'WAITING' | 'DONE' | 'ERROR' | 'BLOCKED' | 'OFFLINE' | 'ORCHESTRATING' | 'READING';

interface AgentState {
  status: AgentStatus;
  lastEvent: string;
  lastUpdated: number;
  characterId: string;
  subagentCount: number;   // 현재 실행 중인 서브에이전트 수
  isSubagent: boolean;     // 서브에이전트 여부 (작업 카드로 표시)
  description?: string;    // 서브에이전트 작업 설명 (SubagentStart payload에서 추출)
}

const agentStates = new Map<string, AgentState>();

const BUILTIN_DEFAULT_IDS = ['frieren', 'fern', 'stark', 'himmel'];
const CANVAS_FALLBACK_IDS = ['char_a', 'char_b', 'char_c', 'char_d', 'char_e'];

function loadDefaultCharacterIds(): string[] {
  try {
    const dbChars = getAllCharacters();
    if (dbChars.length > 0) {
      return [...new Set(dbChars.map(c => c.characterId))];
    }
  } catch { /* DB not ready yet */ }
  return BUILTIN_DEFAULT_IDS;
}

function loadAllCharacterIds(): string[] {
  const defaults = loadDefaultCharacterIds();
  return [...defaults, ...CANVAS_FALLBACK_IDS.filter(id => !defaults.includes(id))];
}

let characterCounter = 0;
let taskCounter = 0;

// 서브에이전트 판별: 첫 이벤트가 UserPromptSubmit/SessionStart이 아니면 서브에이전트
const AGENT_FIRST_EVENTS = new Set(['UserPromptSubmit', 'SessionStart']);

// 부모 agentKey → 진행 중인 합성 task key 목록 (FIFO)
const pendingTaskQueues = new Map<string, string[]>();

function getOrAssignCharacter(agentKey: string): string {
  const existing = agentStates.get(agentKey);
  if (existing) return existing.characterId;

  // DB에서 이전에 할당된 캐릭터 조회 (재접속 시 동일 캐릭터 유지)
  const row = db.prepare('SELECT character_id FROM agent_characters WHERE agent_key = ?').get(agentKey) as { character_id: string } | null;
  if (row) return row.character_id;

  // 신규 에이전트: 새 캐릭터 배정 후 DB에 저장
  const defaultIds = loadDefaultCharacterIds();
  const characterId = defaultIds[characterCounter++ % defaultIds.length]!
  db.prepare('INSERT INTO agent_characters (agent_key, character_id) VALUES (?, ?)').run(agentKey, characterId);
  return characterId;
}

const READING_TOOLS = new Set([
  'Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch', 'ToolSearch',
]);

function eventToStatus(eventType: string, payload: Record<string, any> = {}): AgentStatus {
  if (eventType === 'PreToolUse' && READING_TOOLS.has(payload.tool_name)) {
    return 'READING';
  }
  const map: Record<string, AgentStatus> = {
    'PreToolUse': 'WORKING',
    'PostToolUse': 'WORKING',
    'UserPromptSubmit': 'THINKING',
    'Stop': 'DONE',
    'PostToolUseFailure': 'ERROR',
    'PermissionRequest': 'BLOCKED',
    'Notification': 'WAITING',
    'SessionEnd': 'OFFLINE',
    'SubagentStart': 'ORCHESTRATING',
  };
  return map[eventType] ?? 'WAITING';
}

function updateAgentState(sourceApp: string, sessionId: string, eventType: string, payload: Record<string, any> = {}) {
  const agentKey = `${sourceApp}:${sessionId.slice(0, 8)}`;
  const existing = agentStates.get(agentKey);

  // SubagentStart: 부모 ORCHESTRATING + 합성 task 카드 생성
  if (eventType === 'SubagentStart') {
    if (existing) {
      agentStates.set(agentKey, {
        ...existing,
        status: 'ORCHESTRATING',
        lastEvent: eventType,
        lastUpdated: Date.now(),
        subagentCount: existing.subagentCount + 1,
      });

      // 합성 task 항목 생성
      const taskKey = `${agentKey}~task${++taskCounter}`;
      agentStates.set(taskKey, {
        status: 'WORKING',
        lastEvent: 'SubagentStart',
        lastUpdated: Date.now(),
        characterId: '',
        subagentCount: 0,
        isSubagent: true,
        description: payload?.description as string | undefined,
      });

      // 부모의 task 큐에 등록
      if (!pendingTaskQueues.has(agentKey)) pendingTaskQueues.set(agentKey, []);
      pendingTaskQueues.get(agentKey)!.push(taskKey);
    }
    broadcastAgentStates();
    return;
  }

  // SubagentStop: 부모 count 감소 + 가장 오래된 task → DONE
  if (eventType === 'SubagentStop') {
    if (existing) {
      const newCount = Math.max(0, existing.subagentCount - 1);
      agentStates.set(agentKey, {
        ...existing,
        status: newCount > 0 ? 'ORCHESTRATING' : 'DONE',
        lastEvent: eventType,
        lastUpdated: Date.now(),
        subagentCount: newCount,
      });

      // FIFO: 가장 먼저 시작된 task를 DONE으로
      const queue = pendingTaskQueues.get(agentKey);
      if (queue && queue.length > 0) {
        const taskKey = queue.shift()!;
        const taskState = agentStates.get(taskKey);
        if (taskState) {
          agentStates.set(taskKey, {
            ...taskState,
            status: 'DONE',
            lastEvent: 'SubagentStop',
            lastUpdated: Date.now(),
          });
        }
        if (queue.length === 0) pendingTaskQueues.delete(agentKey);
      }
    }
    broadcastAgentStates();
    return;
  }

  // 신규 세션: 첫 이벤트로 서브에이전트 여부 판별
  // 메모리에 없어도 DB 기록이 있으면 그걸 기준으로 판별 (OFFLINE 후 재접속 케이스)
  let isSubagent: boolean;
  if (existing) {
    isSubagent = existing.isSubagent;
  } else {
    const dbFirst = db.prepare(
      `SELECT hook_event_type FROM events WHERE source_app = ? AND session_id = ? ORDER BY id ASC LIMIT 1`
    ).get(sourceApp, sessionId) as { hook_event_type: string } | null;
    isSubagent = dbFirst ? !AGENT_FIRST_EVENTS.has(dbFirst.hook_event_type) : !AGENT_FIRST_EVENTS.has(eventType);
  }
  const characterId = getOrAssignCharacter(agentKey);

  // Notification 이벤트는 notification_type으로 실제 상태를 구분
  let status: AgentStatus;
  if (eventType === 'Notification') {
    const notifType: string = payload?.notification_type ?? '';
    status = notifType === 'idle_prompt' || notifType === '' ? 'WAITING' : 'BLOCKED';
  } else {
    status = eventToStatus(eventType, payload);
  }

  agentStates.set(agentKey, {
    status,
    lastEvent: eventType,
    lastUpdated: Date.now(),
    characterId,
    subagentCount: existing?.subagentCount ?? 0,
    isSubagent,
  });
  broadcastAgentStates();
}

function broadcastCharactersUpdated() {
  const message = JSON.stringify({ type: 'characters_updated' });
  wsClients.forEach(client => {
    try { client.send(message); } catch { wsClients.delete(client); }
  });
}

function broadcastThemeActivated(themeId: string, lightColors: object, darkColors: object) {
  const message = JSON.stringify({ type: 'theme_activated', data: { themeId, lightColors, darkColors } });
  wsClients.forEach(client => {
    try { client.send(message); } catch { wsClients.delete(client); }
  });
}

function broadcastAgentStates() {
  const message = JSON.stringify({
    type: 'agent_states',
    data: Object.fromEntries(agentStates),
  });
  wsClients.forEach(client => {
    try { client.send(message); } catch { wsClients.delete(client); }
  });
}

// 서버 시작 시 DB에서 에이전트 상태 복원
function restoreAgentStates() {
  // 에이전트별 첫 이벤트 조회 (isSubagent 판별용)
  const firstRows = db.prepare(`
    SELECT e.source_app, e.session_id, e.hook_event_type
    FROM events e
    JOIN (
      SELECT source_app, session_id, MIN(timestamp) AS min_ts
      FROM events GROUP BY source_app, session_id
    ) fm ON e.source_app = fm.source_app AND e.session_id = fm.session_id AND e.timestamp = fm.min_ts
  `).all() as { source_app: string; session_id: string; hook_event_type: string }[];

  const firstEventMap = new Map<string, string>();
  for (const row of firstRows) {
    firstEventMap.set(`${row.source_app}:${row.session_id.slice(0, 8)}`, row.hook_event_type);
  }

  // 에이전트별 마지막 이벤트 조회 (상태 복원용), 오래된 순 정렬 → characterCounter 순서 유지
  const lastRows = db.prepare(`
    SELECT e.source_app, e.session_id, e.hook_event_type, e.payload, e.timestamp
    FROM events e
    JOIN (
      SELECT source_app, session_id, MAX(timestamp) AS max_ts
      FROM events GROUP BY source_app, session_id
    ) lm ON e.source_app = lm.source_app AND e.session_id = lm.session_id AND e.timestamp = lm.max_ts
    ORDER BY lm.max_ts ASC
  `).all() as { source_app: string; session_id: string; hook_event_type: string; payload: string; timestamp: number }[];

  for (const row of lastRows) {
    const agentKey = `${row.source_app}:${row.session_id.slice(0, 8)}`;
    const firstEventType = firstEventMap.get(agentKey) ?? row.hook_event_type;

    // 서브에이전트 task 카드는 복원 안 함 (일시적 항목)
    if (!AGENT_FIRST_EVENTS.has(firstEventType)) continue;

    const payload = JSON.parse(row.payload);
    const characterId = getOrAssignCharacter(agentKey);
    let status = eventToStatus(row.hook_event_type, payload);

    // 타임아웃 규칙 즉시 적용
    const elapsed = Date.now() - row.timestamp;
    if (elapsed > 5 * 60 * 1000) {
      status = 'OFFLINE';
    } else if (status === 'DONE' && elapsed > 30 * 1000) {
      status = 'WAITING';
    } else if (elapsed > 60 * 1000 && !['WAITING', 'DONE', 'ORCHESTRATING', 'BLOCKED'].includes(status)) {
      status = 'WAITING';
    }

    // OFFLINE 10분 초과 → 이미 삭제됐을 항목이므로 스킵
    if (status === 'OFFLINE' && elapsed > 10 * 60 * 1000) continue;

    agentStates.set(agentKey, {
      status,
      lastEvent: row.hook_event_type,
      lastUpdated: row.timestamp,
      characterId,
      subagentCount: 0,
      isSubagent: false,
    });
  }

  console.log(`✅ Restored ${agentStates.size} agent state(s) from DB`);
}

restoreAgentStates();

// Timeout check: DONE 30s → WAITING, 기타 60s → WAITING, 5min → OFFLINE, OFFLINE 10min → 삭제
// SubAgent task: DONE 5min → 삭제
setInterval(() => {
  const now = Date.now();
  let changed = false;
  agentStates.forEach((state, key) => {
    const elapsed = now - state.lastUpdated;

    // SubAgent task 항목: DONE 후 5분 경과 → 삭제, 비정상(non-DONE) 10분 경과 → 삭제
    if (state.isSubagent) {
      if (state.status === 'DONE' && elapsed > 5 * 60 * 1000) {
        agentStates.delete(key);
        changed = true;
      } else if (state.status !== 'DONE' && elapsed > 10 * 60 * 1000) {
        agentStates.delete(key);
        changed = true;
      }
      return;
    }

    // OFFLINE 후 10분 경과 → 삭제
    if (state.status === 'OFFLINE') {
      if (elapsed > 10 * 60 * 1000) {
        agentStates.delete(key);
        changed = true;
      }
      return;
    }

    if (elapsed > 5 * 60 * 1000) {
      agentStates.set(key, { ...state, status: 'OFFLINE', subagentCount: 0 });
      changed = true;
    } else if (state.status === 'DONE' && elapsed > 30 * 1000) {
      agentStates.set(key, { ...state, status: 'WAITING' });
      changed = true;
    } else if (elapsed > 60 * 1000 && !['WAITING', 'DONE', 'ORCHESTRATING', 'BLOCKED'].includes(state.status)) {
      agentStates.set(key, { ...state, status: 'WAITING' });
      changed = true;
    }
  });
  if (changed) broadcastAgentStates();
}, 10_000);

// Helper function to send response to agent via HTTP callback
async function sendResponseToAgent(
  callbackUrl: string,
  response: HumanInTheLoopResponse
): Promise<void> {
  console.log(`[HITL] Sending response to agent callback: ${callbackUrl}`);
  const res = await fetch(callbackUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(response),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  console.log('[HITL] Response delivered successfully');
}

// Create Bun server with HTTP and WebSocket support
const server = Bun.serve({
  port: parseInt(process.env.SERVER_PORT || '4000'),
  
  async fetch(req: Request) {
    const url = new URL(req.url);
    
    // Handle CORS
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json; charset=utf-8',
    };
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    // Static file serving for uploaded sprites
    if (url.pathname.startsWith('/uploads/')) {
      const relPath = url.pathname.slice('/uploads/'.length);
      const file = Bun.file(`./uploads/${relPath}`);
      if (await file.exists()) {
        return new Response(file, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=86400',
            'Content-Type': 'image/gif',
          },
        });
      }
      return new Response('Not found', { status: 404 });
    }

    // POST /events - Receive new events
    if (url.pathname === '/events' && req.method === 'POST') {
      try {
        const event: HookEvent = await req.json();
        
        // Validate required fields
        if (!event.source_app || !event.session_id || !event.hook_event_type || !event.payload) {
          return new Response(JSON.stringify({ error: 'Missing required fields' }), {
            status: 400,
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }
        
        // Insert event into database
        const savedEvent = insertEvent(event);

        // Update agent state
        updateAgentState(event.source_app, event.session_id, event.hook_event_type, event.payload);

        // Broadcast to all WebSocket clients
        const message = JSON.stringify({ type: 'event', data: savedEvent });
        wsClients.forEach(client => {
          try {
            client.send(message);
          } catch (err) {
            // Client disconnected, remove from set
            wsClients.delete(client);
          }
        });
        
        return new Response(JSON.stringify(savedEvent), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('Error processing event:', error);
        return new Response(JSON.stringify({ error: 'Invalid request' }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // GET /agents - Get current agent states
    if (url.pathname === '/agents' && req.method === 'GET') {
      return new Response(JSON.stringify(Object.fromEntries(agentStates)), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // POST /agents/cycle-character - Cycle to next character for an agent
    if (url.pathname === '/agents/cycle-character' && req.method === 'POST') {
      try {
        const { agentKey } = await req.json() as { agentKey: string };
        const state = agentStates.get(agentKey);
        if (!state) {
          return new Response(JSON.stringify({ error: 'Agent not found' }), {
            status: 404,
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }
        const allIds = loadAllCharacterIds();
        const currentIdx = allIds.indexOf(state.characterId);
        const nextIdx = (currentIdx + 1) % allIds.length;
        const nextCharId = allIds[nextIdx]!
        agentStates.set(agentKey, { ...state, characterId: nextCharId });
        // DB에도 반영하여 재접속 시 수동 변경 사항 유지
        db.prepare('INSERT OR REPLACE INTO agent_characters (agent_key, character_id) VALUES (?, ?)').run(agentKey, nextCharId);
        broadcastAgentStates();
        return new Response(JSON.stringify({ characterId: nextCharId }), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid request' }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // GET /events/filter-options - Get available filter options
    if (url.pathname === '/events/filter-options' && req.method === 'GET') {
      const options = getFilterOptions();
      return new Response(JSON.stringify(options), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    // GET /events/recent - Get recent events
    if (url.pathname === '/events/recent' && req.method === 'GET') {
      const limit = parseInt(url.searchParams.get('limit') || '300');
      const events = getRecentEvents(limit);
      return new Response(JSON.stringify(events), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // GET /events/:id - Get a specific event (used for HITL polling)
    if (url.pathname.match(/^\/events\/\d+$/) && req.method === 'GET') {
      const id = parseInt(url.pathname.split('/')[2]);
      const event = getEventById(id);
      if (!event) {
        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify(event), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // POST /events/:id/respond - Respond to HITL request
    if (url.pathname.match(/^\/events\/\d+\/respond$/) && req.method === 'POST') {
      const id = parseInt(url.pathname.split('/')[2]);

      try {
        const response: HumanInTheLoopResponse = await req.json();
        response.respondedAt = Date.now();

        // Update event in database
        const updatedEvent = updateEventHITLResponse(id, response);

        if (!updatedEvent) {
          return new Response(JSON.stringify({ error: 'Event not found' }), {
            status: 404,
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }

        // Send response to agent via WebSocket
        if (updatedEvent.humanInTheLoop?.responseWebSocketUrl) {
          try {
            await sendResponseToAgent(
              updatedEvent.humanInTheLoop.responseWebSocketUrl,
              response
            );
          } catch (error) {
            console.error('Failed to send response to agent:', error);
            // Don't fail the request if we can't reach the agent
          }
        }

        // Broadcast updated event to all connected clients
        const message = JSON.stringify({ type: 'event', data: updatedEvent });
        wsClients.forEach(client => {
          try {
            client.send(message);
          } catch (err) {
            wsClients.delete(client);
          }
        });

        return new Response(JSON.stringify(updatedEvent), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('Error processing HITL response:', error);
        return new Response(JSON.stringify({ error: 'Invalid request' }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // Theme API endpoints

    // GET /api/active-theme - Current active theme info
    if (url.pathname === '/api/active-theme' && req.method === 'GET') {
      if (!activeThemeId) {
        return new Response(JSON.stringify({ success: true, data: null }), { headers });
      }
      const theme = getTheme(activeThemeId);
      if (!theme) {
        return new Response(JSON.stringify({ success: true, data: null }), { headers });
      }
      return new Response(JSON.stringify({
        success: true,
        data: { id: theme.id, lightColors: theme.lightColors, darkColors: theme.darkColors },
      }), { headers });
    }

    // POST /api/themes/:id/activate - Activate a theme
    if (url.pathname.match(/^\/api\/themes\/[^/]+\/activate$/) && req.method === 'POST') {
      const themeId = url.pathname.split('/')[3];
      const theme = getTheme(themeId);
      if (!theme || !theme.lightColors || !theme.darkColors) {
        return new Response(JSON.stringify({ success: false, error: 'Theme not found or missing color sets' }), { status: 404, headers });
      }

      activeThemeId = themeId;
      setAppSetting('activeThemeId', themeId);

      // 해당 테마의 캐릭터 목록 로드
      const themeChars = getThemeCharacters(themeId);
      if (themeChars.length > 0) {
        // 기존 에이전트들 (서브에이전트 제외)에게 새 캐릭터 재배정
        let idx = 0;
        const updates: { agentKey: string; characterId: string }[] = [];
        agentStates.forEach((state, key) => {
          if (state.isSubagent) return;
          const newCharId = themeChars[idx % themeChars.length]!.characterId;
          idx++;
          agentStates.set(key, { ...state, characterId: newCharId });
          updates.push({ agentKey: key, characterId: newCharId });
        });
        // DB 일괄 반영
        const upsert = db.prepare('INSERT OR REPLACE INTO agent_characters (agent_key, character_id) VALUES (?, ?)');
        const batchUpsert = db.transaction((rows: { agentKey: string; characterId: string }[]) => {
          for (const r of rows) upsert.run(r.agentKey, r.characterId);
        });
        batchUpsert(updates);
        // characterCounter 리셋 (이후 신규 에이전트도 이 테마에서 배정)
        characterCounter = 0;
      }

      broadcastThemeActivated(themeId, theme.lightColors, theme.darkColors);
      broadcastAgentStates();

      return new Response(JSON.stringify({ success: true, data: { themeId } }), { headers });
    }

    // POST /api/themes/upload - Upload a theme package (multipart)
    if (url.pathname === '/api/themes/upload' && req.method === 'POST') {
      const res = await handleThemeUpload(req);
      if (res.status === 201) broadcastCharactersUpdated();
      return res;
    }

    // GET /api/characters - Characters from active theme only (empty if no active theme)
    if (url.pathname === '/api/characters' && req.method === 'GET') {
      const characters = activeThemeId ? getThemeCharacters(activeThemeId) : [];
      const result = characters.map(char => ({
        ...char,
        sprites: Object.fromEntries(
          getCharacterSprites(char.id).map(s => [s.status, `/uploads/${s.filePath}`])
        ),
      }));
      return new Response(JSON.stringify({ success: true, data: result }), {
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    // GET /api/themes/:id/characters - Characters + sprites for a specific theme
    if (url.pathname.match(/^\/api\/themes\/[^/]+\/characters$/) && req.method === 'GET') {
      const themeId = url.pathname.split('/')[3];
      const characters = getThemeCharacters(themeId);
      const result = characters.map(char => ({
        ...char,
        sprites: Object.fromEntries(
          getCharacterSprites(char.id).map(s => [s.status, `/uploads/${s.filePath}`])
        ),
      }));
      return new Response(JSON.stringify({ success: true, data: result }), {
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    // POST /api/themes/:id/characters - Add character to existing theme
    if (url.pathname.match(/^\/api\/themes\/[^/]+\/characters$/) && req.method === 'POST') {
      const themeId = url.pathname.split('/')[3];
      const theme = getTheme(themeId);
      if (!theme) {
        return new Response(JSON.stringify({ success: false, error: 'Theme not found' }), { status: 404, headers });
      }
      const res = await handleAddThemeCharacter(req, themeId);
      if (res.status === 201) broadcastCharactersUpdated();
      return res;
    }

    // DELETE /api/themes/:id/characters/:charId - Delete a character from a theme
    if (url.pathname.match(/^\/api\/themes\/[^/]+\/characters\/[^/]+$/) && req.method === 'DELETE') {
      const parts = url.pathname.split('/');
      const charDbId = parts[5];
      const deletedChar = deleteThemeCharacterById(charDbId);
      if (!deletedChar) {
        return new Response(JSON.stringify({ success: false, error: 'Character not found' }), { status: 404, headers });
      }
      await deleteThemeCharacterFiles(deletedChar.themeId, deletedChar.characterId);
      broadcastCharactersUpdated();
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    // POST /api/themes - Create a new theme
    if (url.pathname === '/api/themes' && req.method === 'POST') {
      try {
        const themeData = await req.json();
        const result = await createTheme(themeData);
        
        const status = result.success ? 201 : 400;
        return new Response(JSON.stringify(result), {
          status,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('Error creating theme:', error);
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Invalid request body' 
        }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // GET /api/themes - Search themes
    if (url.pathname === '/api/themes' && req.method === 'GET') {
      const query = {
        query: url.searchParams.get('query') || undefined,
        isPublic: url.searchParams.get('isPublic') ? url.searchParams.get('isPublic') === 'true' : undefined,
        authorId: url.searchParams.get('authorId') || undefined,
        sortBy: url.searchParams.get('sortBy') as any || undefined,
        sortOrder: url.searchParams.get('sortOrder') as any || undefined,
        limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : undefined,
        offset: url.searchParams.get('offset') ? parseInt(url.searchParams.get('offset')!) : undefined,
      };
      
      const result = await searchThemes(query);
      return new Response(JSON.stringify(result), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    // GET /api/themes/:id - Get a specific theme
    if (url.pathname.startsWith('/api/themes/') && req.method === 'GET') {
      const id = url.pathname.split('/')[3];
      if (!id) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Theme ID is required' 
        }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      
      const result = await getThemeById(id);
      const status = result.success ? 200 : 404;
      return new Response(JSON.stringify(result), {
        status,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    // PUT /api/themes/:id - Update a theme
    if (url.pathname.startsWith('/api/themes/') && req.method === 'PUT') {
      const id = url.pathname.split('/')[3];
      if (!id) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Theme ID is required' 
        }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      
      try {
        const updates = await req.json();
        const result = await updateThemeById(id, updates);

        // 활성 테마가 수정된 경우 색상 변경 즉시 브로드캐스트
        if (result.success && activeThemeId === id) {
          const updatedTheme = getTheme(id);
          if (updatedTheme?.lightColors && updatedTheme?.darkColors) {
            broadcastThemeActivated(id, updatedTheme.lightColors, updatedTheme.darkColors);
          }
        }

        const status = result.success ? 200 : 400;
        return new Response(JSON.stringify(result), {
          status,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('Error updating theme:', error);
        return new Response(JSON.stringify({
          success: false,
          error: 'Invalid request body'
        }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // DELETE /api/themes/:id - Delete a theme
    if (url.pathname.startsWith('/api/themes/') && req.method === 'DELETE') {
      const id = url.pathname.split('/')[3];
      if (!id) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Theme ID is required' 
        }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      
      const authorId = url.searchParams.get('authorId');
      const result = await deleteThemeById(id, authorId || undefined);

      if (result.success) {
        broadcastCharactersUpdated();
        // 활성 테마가 삭제된 경우 DB에서도 초기화
        if (activeThemeId === id) {
          activeThemeId = null;
          setAppSetting('activeThemeId', null);
        }
      }

      const status = result.success ? 200 : (result.error?.includes('not found') ? 404 : 403);
      return new Response(JSON.stringify(result), {
        status,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    // GET /api/themes/:id/export - Export a theme
    if (url.pathname.match(/^\/api\/themes\/[^\/]+\/export$/) && req.method === 'GET') {
      const id = url.pathname.split('/')[3];
      
      const result = await exportThemeById(id);
      if (!result.success) {
        const status = result.error?.includes('not found') ? 404 : 400;
        return new Response(JSON.stringify(result), {
          status,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify(result.data), {
        headers: { 
          ...headers, 
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${result.data.theme.name}.json"`
        }
      });
    }
    
    // POST /api/themes/import - Import a theme
    if (url.pathname === '/api/themes/import' && req.method === 'POST') {
      try {
        const importData = await req.json();
        const authorId = url.searchParams.get('authorId');
        
        const result = await importTheme(importData, authorId || undefined);
        
        const status = result.success ? 201 : 400;
        return new Response(JSON.stringify(result), {
          status,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('Error importing theme:', error);
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Invalid import data' 
        }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // GET /api/themes/stats - Get theme statistics
    if (url.pathname === '/api/themes/stats' && req.method === 'GET') {
      const result = await getThemeStats();
      return new Response(JSON.stringify(result), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    // WebSocket upgrade
    if (url.pathname === '/stream') {
      const success = server.upgrade(req);
      if (success) {
        return undefined;
      }
    }
    
    // Default response
    return new Response('Multi-Agent Observability Server', {
      headers: { ...headers, 'Content-Type': 'text/plain' }
    });
  },
  
  websocket: {
    open(ws) {
      console.log('WebSocket client connected');
      wsClients.add(ws);
      
      // Send recent events on connection
      const events = getRecentEvents(300);
      ws.send(JSON.stringify({ type: 'initial', data: events }));

      // Send current agent states
      ws.send(JSON.stringify({ type: 'agent_states', data: Object.fromEntries(agentStates) }));
    },
    
    message(ws, message) {
      try {
        const data = JSON.parse(message as string);
        if (data?.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
          return;
        }
      } catch { /* 파싱 불가 메시지는 무시 */ }
    },
    
    close(ws) {
      console.log('WebSocket client disconnected');
      wsClients.delete(ws);
    },
    
    error(ws, error) {
      console.error('WebSocket error:', error);
      wsClients.delete(ws);
    }
  }
});

console.log(`🚀 Server running on http://localhost:${server.port}`);
console.log(`📊 WebSocket endpoint: ws://localhost:${server.port}/stream`);
console.log(`📮 POST events to: http://localhost:${server.port}/events`);