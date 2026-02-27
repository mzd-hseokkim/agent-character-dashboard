// Canvas icon rendering using Path2D — mirrors lucide-vue-next icons (v0.575.0)
// SVG node data extracted from lucide-vue-next/dist/esm/icons/

type SvgAttr = Record<string, string | undefined>;
type SvgNode = [string, SvgAttr];

const ICON_NODES: Record<string, SvgNode[]> = {
  'wrench': [
    ['path', { d: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z' }],
  ],
  'circle-check': [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['path', { d: 'm9 12 2 2 4-4' }],
  ],
  'circle-x': [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['path', { d: 'm15 9-6 6' }],
    ['path', { d: 'm9 9 6 6' }],
  ],
  'lock': [
    ['rect', { width: '18', height: '11', x: '3', y: '11', rx: '2', ry: '2' }],
    ['path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' }],
  ],
  'bell': [
    ['path', { d: 'M10.268 21a2 2 0 0 0 3.464 0' }],
    ['path', { d: 'M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326' }],
  ],
  'square': [
    ['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2' }],
  ],
  'play': [
    ['path', { d: 'M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z' }],
  ],
  'users': [
    ['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }],
    ['path', { d: 'M16 3.128a4 4 0 0 1 0 7.744' }],
    ['path', { d: 'M22 21v-2a4 4 0 0 0-3-3.87' }],
    ['circle', { cx: '9', cy: '7', r: '4' }],
  ],
  'archive': [
    ['rect', { width: '20', height: '5', x: '2', y: '3', rx: '1' }],
    ['path', { d: 'M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8' }],
    ['path', { d: 'M10 12h4' }],
  ],
  'message-square': [
    ['path', { d: 'M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z' }],
  ],
  'log-in': [
    ['path', { d: 'm10 17 5-5-5-5' }],
    ['path', { d: 'M15 12H3' }],
    ['path', { d: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4' }],
  ],
  'log-out': [
    ['path', { d: 'm16 17 5-5-5-5' }],
    ['path', { d: 'M21 12H9' }],
    ['path', { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' }],
  ],
  'terminal': [
    ['path', { d: 'M12 19h8' }],
    ['path', { d: 'm4 17 6-6-6-6' }],
  ],
  'book-open': [
    ['path', { d: 'M12 7v14' }],
    ['path', { d: 'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z' }],
  ],
  'file-plus': [
    ['path', { d: 'M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z' }],
    ['path', { d: 'M14 2v5a1 1 0 0 0 1 1h5' }],
    ['path', { d: 'M9 15h6' }],
    ['path', { d: 'M12 18v-6' }],
  ],
  'pencil': [
    ['path', { d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z' }],
    ['path', { d: 'm15 5 4 4' }],
  ],
  'folder-search': [
    ['path', { d: 'M10.7 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v4.1' }],
    ['path', { d: 'm21 21-1.9-1.9' }],
    ['circle', { cx: '17', cy: '17', r: '3' }],
  ],
  'search': [
    ['path', { d: 'm21 21-4.34-4.34' }],
    ['circle', { cx: '11', cy: '11', r: '8' }],
  ],
  'globe': [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['path', { d: 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20' }],
    ['path', { d: 'M2 12h20' }],
  ],
  'bot': [
    ['path', { d: 'M12 8V4H8' }],
    ['rect', { width: '16', height: '12', x: '4', y: '8', rx: '2' }],
    ['path', { d: 'M2 14h2' }],
    ['path', { d: 'M20 14h2' }],
    ['path', { d: 'M15 13v2' }],
    ['path', { d: 'M9 13v2' }],
  ],
  'plug': [
    ['path', { d: 'M12 22v-5' }],
    ['path', { d: 'M15 8V2' }],
    ['path', { d: 'M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z' }],
    ['path', { d: 'M9 8V2' }],
  ],
  'zap': [
    ['path', { d: 'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z' }],
  ],
  'circle-help': [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['path', { d: 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3' }],
    ['path', { d: 'M12 17h.01' }],
  ],
};

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  if (typeof (ctx as any).roundRect === 'function') {
    (ctx as any).roundRect(x, y, w, h, r);
  } else {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }
}

/** Draw a single lucide icon centered at (cx, cy) with given size and stroke color. */
export function drawCanvasIcon(
  ctx: CanvasRenderingContext2D,
  iconName: string,
  cx: number,
  cy: number,
  size: number,
  color: string
): void {
  const nodes = ICON_NODES[iconName] ?? ICON_NODES['circle-help'];

  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color;
  ctx.fillStyle = 'none';
  ctx.lineWidth = 2 * (24 / size);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const [type, attrs] of nodes) {
    if (type === 'path') {
      const path = new Path2D(attrs.d!);
      if (attrs.fill && attrs.fill !== 'none') {
        ctx.fillStyle = color;
        ctx.fill(path);
        ctx.fillStyle = 'none';
      } else {
        ctx.stroke(path);
      }
    } else if (type === 'circle') {
      ctx.beginPath();
      ctx.arc(Number(attrs.cx), Number(attrs.cy), Number(attrs.r), 0, Math.PI * 2);
      ctx.stroke();
    } else if (type === 'rect') {
      ctx.beginPath();
      drawRoundRect(
        ctx,
        Number(attrs.x ?? 0),
        Number(attrs.y ?? 0),
        Number(attrs.width),
        Number(attrs.height),
        attrs.rx ? Number(attrs.rx) : 0
      );
      ctx.stroke();
    } else if (type === 'line') {
      ctx.beginPath();
      ctx.moveTo(Number(attrs.x1), Number(attrs.y1));
      ctx.lineTo(Number(attrs.x2), Number(attrs.y2));
      ctx.stroke();
    }
  }

  ctx.restore();
}

// ── Icon name maps (mirrors hookIconMap / toolIconMap in EventRow.vue) ────────

export const EVENT_TYPE_TO_ICON: Record<string, string> = {
  'PreToolUse': 'wrench',
  'PostToolUse': 'circle-check',
  'PostToolUseFailure': 'circle-x',
  'PermissionRequest': 'lock',
  'Notification': 'bell',
  'Stop': 'square',
  'SubagentStart': 'play',
  'SubagentStop': 'users',
  'PreCompact': 'archive',
  'UserPromptSubmit': 'message-square',
  'SessionStart': 'log-in',
  'SessionEnd': 'log-out',
};

export const TOOL_NAME_TO_ICON: Record<string, string> = {
  'Bash': 'terminal',
  'Read': 'book-open',
  'Write': 'file-plus',
  'Edit': 'pencil',
  'MultiEdit': 'pencil',
  'Glob': 'folder-search',
  'Grep': 'search',
  'WebFetch': 'globe',
  'WebSearch': 'search',
  'NotebookEdit': 'book-open',
  'Task': 'bot',
  'TaskCreate': 'bot',
  'TaskGet': 'bot',
  'TaskUpdate': 'bot',
  'TaskList': 'bot',
  'TaskOutput': 'bot',
  'TaskStop': 'square',
  'TeamCreate': 'users',
  'TeamDelete': 'users',
  'SendMessage': 'message-square',
  'EnterPlanMode': 'zap',
  'ExitPlanMode': 'zap',
  'AskUserQuestion': 'circle-help',
  'Skill': 'zap',
};

export function getIconForEventType(eventType: string): string {
  return EVENT_TYPE_TO_ICON[eventType] ?? 'circle-help';
}

export function getIconForTool(toolName: string): string {
  if (toolName?.startsWith('mcp__')) return 'plug';
  return TOOL_NAME_TO_ICON[toolName] ?? 'wrench';
}

// ── Icon group descriptor ─────────────────────────────────────────────────────

export interface IconGroup {
  /** 1 icon (event only) or 2 icons [eventIcon, toolIcon] */
  icons: string[];
  count: number;
}

/**
 * Returns up to 3 icon groups for a chart bar label,
 * replacing the old emoji-string approach.
 */
export function getIconGroups(
  eventTypes: Record<string, number>,
  toolEvents?: Record<string, number>
): IconGroup[] {
  if (toolEvents && Object.keys(toolEvents).length > 0) {
    const entries: Array<{ icons: string[]; count: number }> = [];

    for (const [key, count] of Object.entries(toolEvents)) {
      const [eventType, toolName] = key.split(':');
      entries.push({
        icons: [getIconForEventType(eventType), getIconForTool(toolName)],
        count,
      });
    }

    // Non-tool events not already covered
    const toolEventTypes = new Set(Object.keys(toolEvents).map(k => k.split(':')[0]));
    for (const [type, count] of Object.entries(eventTypes)) {
      if (!toolEventTypes.has(type)) {
        entries.push({ icons: [getIconForEventType(type)], count });
      }
    }

    return entries
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  }

  return Object.entries(eventTypes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type, count]) => ({ icons: [getIconForEventType(type)], count }));
}

// ── Draw a row of icon groups inside a bar ────────────────────────────────────

const ICON_SIZE = 13;
const ICON_GAP = 2;   // gap between event+tool icons within one group
const GROUP_GAP = 4;  // gap between groups
const BG_PAD_X = 5;
const BG_PAD_Y = 4;
const COUNT_FONT = 'bold 9px system-ui, sans-serif';
const COUNT_COLOR = '#1e3020';
const BG_COLOR = 'rgba(220, 232, 216, 0.95)';

/**
 * Measures total width needed to render all groups.
 * Uses a dummy measureText call for the count text.
 */
function measureGroups(
  ctx: CanvasRenderingContext2D,
  groups: IconGroup[]
): number {
  let w = BG_PAD_X * 2;
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    w += g.icons.length * ICON_SIZE + (g.icons.length - 1) * ICON_GAP;
    if (g.count > 1) {
      ctx.font = COUNT_FONT;
      w += 2 + ctx.measureText(`×${g.count}`).width;
    }
    if (i < groups.length - 1) w += GROUP_GAP;
  }
  return w;
}

/**
 * Draw icon groups (lucide icons + optional count) centered at (cx, cy).
 * Call this from chartRenderer instead of ctx.fillText(emojiString).
 */
export function drawIconGroupsLabel(
  ctx: CanvasRenderingContext2D,
  groups: IconGroup[],
  cx: number,
  cy: number,
  iconColor: string
): void {
  if (groups.length === 0) return;

  const bgW = measureGroups(ctx, groups);
  const bgH = ICON_SIZE + BG_PAD_Y * 2;
  const bgX = cx - bgW / 2;
  const bgY = cy - bgH / 2;

  ctx.save();

  // Background pill
  ctx.fillStyle = BG_COLOR;
  ctx.beginPath();
  drawRoundRect(ctx, bgX, bgY, bgW, bgH, 5);
  ctx.fill();

  // Icons
  let curX = bgX + BG_PAD_X;
  const iconCY = cy;

  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];

    for (let ii = 0; ii < g.icons.length; ii++) {
      drawCanvasIcon(ctx, g.icons[ii], curX + ICON_SIZE / 2, iconCY, ICON_SIZE, iconColor);
      curX += ICON_SIZE;
      if (ii < g.icons.length - 1) curX += ICON_GAP;
    }

    if (g.count > 1) {
      ctx.font = COUNT_FONT;
      ctx.fillStyle = COUNT_COLOR;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`×${g.count}`, curX + 2, iconCY + 1);
      curX += 2 + ctx.measureText(`×${g.count}`).width;
    }

    if (gi < groups.length - 1) curX += GROUP_GAP;
  }

  ctx.restore();
}
