import { useRef, useEffect, useMemo } from 'react';
import type { AgentStatus } from '../stores/useWebSocketStore';
import { useGetGifUrl } from '../hooks/useCharacters';

interface Props {
  characterId: string;
  status: AgentStatus;
  size: number;
}

const STATUS_TO_GIF: Record<AgentStatus, string> = {
  WORKING:       'FORCE',
  ORCHESTRATING: 'FORCE',
  THINKING:      'THINK',
  READING:       'READING',
  WAITING:       'REST',
  BLOCKED:       'REST',
  DONE:          'FINISH',
  ERROR:         'OFFLINE',
  OFFLINE:       'OFFLINE',
};


const PALETTES: Record<string, { body: string; hair: string; accent: string }> = {
  char_a: { body: '#5b8dd9', hair: '#f5c842', accent: '#e05c5c' },
  char_b: { body: '#5dc98a', hair: '#c86dd4', accent: '#f5a623' },
  char_c: { body: '#e07070', hair: '#70c8e0', accent: '#a8d87a' },
  char_d: { body: '#c8a870', hair: '#7090e0', accent: '#e07090' },
  char_e: { body: '#9070d0', hair: '#60d0a0', accent: '#f0c040' },
};

const FPS: Record<AgentStatus, number> = {
  WORKING: 8, THINKING: 3, WAITING: 2, DONE: 4,
  ERROR: 6, BLOCKED: 3, OFFLINE: 1, ORCHESTRATING: 6, READING: 4,
};

type Frame = [number, number, string][];

function getFrames(status: AgentStatus, f: number): Frame {
  const head: Frame = [
    [5,1,'hair'],[6,1,'hair'],[7,1,'hair'],[8,1,'hair'],[9,1,'hair'],
    [5,2,'body'],[6,2,'skin'],[7,2,'skin'],[8,2,'skin'],[9,2,'body'],
    [5,3,'body'],[6,3,'skin'],[7,3,'skin'],[8,3,'skin'],[9,3,'body'],
    [5,4,'body'],[6,4,'skin'],[7,4,'skin'],[8,4,'skin'],[9,4,'body'],
  ];
  const torso: Frame = [
    [5,5,'body'],[6,5,'body'],[7,5,'body'],[8,5,'body'],[9,5,'body'],
    [4,6,'body'],[5,6,'body'],[6,6,'body'],[7,6,'body'],[8,6,'body'],[9,6,'body'],[10,6,'body'],
    [4,7,'body'],[5,7,'body'],[6,7,'body'],[7,7,'body'],[8,7,'body'],[9,7,'body'],[10,7,'body'],
    [4,8,'body'],[5,8,'body'],[6,8,'body'],[7,8,'body'],[8,8,'body'],[9,8,'body'],[10,8,'body'],
  ];
  const overlays: Record<string, Frame[]> = {
    WORKING: [
      [[3,6,'accent'],[3,7,f%2===0?'accent':'body'],[11,6,'skin'],[12,6,'accent']],
      [[3,6,'skin'],[3,7,'accent'],[11,6,'accent'],[12,7,'accent']],
    ],
    THINKING: [
      [[3,6,'skin'],[4,9,'skin'],[5,9,'skin'],[6,9,'skin'],[7,9,'accent']],
      [[3,6,'skin'],[4,9,'skin'],[5,9,'skin'],[7,9,'accent'],[8,9,'skin']],
    ],
    WAITING: [
      [[4,6,'skin'],[5,6,'skin'],[9,6,'skin'],[10,6,'skin']],
      [[4,7,'skin'],[5,7,'skin'],[9,7,'skin'],[10,7,'skin']],
    ],
    DONE: [
      [[3,4,'skin'],[3,5,'skin'],[11,4,'skin'],[11,5,'skin']],
      [[2,3,'skin'],[3,4,'skin'],[11,4,'skin'],[12,3,'skin']],
    ],
    ERROR: [
      [[4,1,'skin'],[5,1,'skin'],[9,1,'skin'],[10,1,'skin'],[7,3,'accent']],
      [[4,1,'skin'],[5,1,'skin'],[9,1,'skin'],[10,1,'skin'],[7,3,'body']],
    ],
    BLOCKED: [
      [[11,4,'skin'],[12,4,'skin'],[12,5,'skin'],[12,6,'skin'],[11,5,'accent']],
      [[11,4,'skin'],[12,3,'skin'],[12,4,'skin'],[12,5,'skin'],[11,5,'accent']],
    ],
    OFFLINE: [
      [[7,0,'accent'],[9,0,'accent'],[11,0,'accent']],
      [[8,0,'accent'],[10,0,'accent']],
    ],
    ORCHESTRATING: [
      [[2,5,'accent'],[3,5,'skin'],[11,6,'skin'],[12,6,'accent']],
      [[3,5,'accent'],[3,6,'skin'],[11,5,'skin'],[12,5,'accent']],
    ],
    READING: [
      [[3,6,'accent'],[4,7,'accent'],[5,7,'accent'],[6,7,'skin']],
      [[3,6,'skin'],[4,7,'skin'],[5,7,'accent'],[6,7,'accent']],
    ],
  };
  const legs: Frame = [
    [5,9,'body'],[6,9,'body'],[8,9,'body'],[9,9,'body'],
    [5,10,'body'],[6,10,'body'],[8,10,'body'],[9,10,'body'],
    [5,11,'accent'],[6,11,'accent'],[8,11,'accent'],[9,11,'accent'],
  ];
  const overlay = (overlays[status] ?? overlays['WAITING'])[f % 2];
  return [...head, ...torso, ...legs, ...overlay];
}

const BG_COLORS: Record<AgentStatus, string> = {
  WORKING: '#1a2a1a', THINKING: '#1a1a2a', WAITING: '#2a2a1a',
  DONE: '#1a2a2a', ERROR: '#2a1a1a', BLOCKED: '#2a1a2a',
  OFFLINE: '#1a1a1a', ORCHESTRATING: '#2a1a2a', READING: '#1a2020',
};

export function SpriteCanvas({ characterId, status, size }: Props) {
  const getGifUrl = useGetGifUrl();
  const gifSrc = useMemo(() => getGifUrl(characterId, status), [getGifUrl, characterId, status]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (gifSrc) return; // GIF mode — no canvas animation needed
    frameRef.current = 0;
  }, [status, characterId, gifSrc]);

  useEffect(() => {
    if (gifSrc) return;

    const palette = PALETTES[characterId] ?? PALETTES['char_a'];
    const colorMap: Record<string, string> = {
      hair: palette.hair, body: palette.body, accent: palette.accent, skin: '#f5c9a0',
    };

    const animate = () => {
      const cvs = canvasRef.current;
      if (!cvs) return;
      const ctx = cvs.getContext('2d')!;
      const scale = Math.floor(size / 16);
      const gridOffset = Math.floor((size - scale * 16) / 2);
      const xOff = gridOffset + Math.round(scale / 2);
      const yOff = gridOffset + Math.round(scale * 1.5);

      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = BG_COLORS[status];
      ctx.fillRect(0, 0, size, size);

      for (const [x, y, colorKey] of getFrames(status, frameRef.current)) {
        ctx.fillStyle = colorMap[colorKey] ?? colorKey;
        ctx.fillRect(x * scale + xOff, y * scale + yOff, scale, scale);
      }
      frameRef.current = (frameRef.current + 1) % 2;
      timerRef.current = setTimeout(animate, 1000 / (FPS[status] ?? 4));
    };

    animate();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [gifSrc, status, characterId, size]);

  if (gifSrc) {
    return (
      <img
        src={gifSrc}
        width={size}
        height={size}
        style={{ imageRendering: 'pixelated', display: 'block' }}
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
