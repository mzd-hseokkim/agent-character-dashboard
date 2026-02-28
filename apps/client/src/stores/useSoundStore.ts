/**
 * useSoundStore — Web Audio API 기반 8비트 스타일 효과음 (Zustand store)
 *
 * 렌더링 전략 (게임 오디오 엔진 방식):
 *   앱 로드 시 OfflineAudioContext로 각 사운드를 AudioBuffer에 미리 렌더링.
 *   재생 시 AudioBufferSourceNode를 생성해 즉시 재생.
 *   → OscillatorNode를 매번 조립하는 비용 없음, throttle 불필요, 동시 다중 재생 가능.
 *   OfflineAudioContext는 autoplay 정책 무관 (사용자 인터랙션 없이도 렌더링 가능).
 */
import { create } from 'zustand';

// ─── 공유 AudioContext ────────────────────────────────────────────────────────

let ctx: AudioContext | null = null;

// ─── 오실레이터 헬퍼 ──────────────────────────────────────────────────────────

function osc(
  ac: BaseAudioContext,
  type: OscillatorType,
  freq: number,
  gain: number,
  start: number,
  end: number,
  freqEnd?: number,
): void {
  const g = ac.createGain();
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (freqEnd !== undefined) o.frequency.linearRampToValueAtTime(freqEnd, end);
  g.gain.setValueAtTime(gain, start);
  g.gain.exponentialRampToValueAtTime(0.001, end);
  o.connect(g);
  g.connect(ac.destination);
  o.start(start);
  o.stop(end);
}

// ─── 사운드 정의 ─────────────────────────────────────────────────────────────

export type SoundEvent =
  | 'agent_appear'
  | 'done'
  | 'error'
  | 'blocked'
  | 'work_start'
  | 'session_end'
  | 'session_start'
  | 'reentry'
  | 'log_tick';

// 각 사운드의 렌더링 길이(초) — 마지막 osc end 기준 + 여유
const SOUND_DURATIONS: Record<SoundEvent, number> = {
  agent_appear:  0.55,
  done:          0.75,
  error:         0.45,
  blocked:       0.35,
  reentry:       1.00,
  work_start:    0.20,
  log_tick:      0.15,
  session_start: 1.10,
  session_end:   0.45,
};

const SOUNDS: Record<SoundEvent, (ac: BaseAudioContext) => void> = {
  // 에이전트 등장: 상승하는 세 음
  agent_appear(ac) {
    const t = ac.currentTime;
    osc(ac, 'square', 440, 0.12, t,        t + 0.08);
    osc(ac, 'square', 660, 0.12, t + 0.09, t + 0.20);
    osc(ac, 'square', 880, 0.10, t + 0.18, t + 0.38);
  },

  // 완료: 빅토리 징글 (4음 상승)
  done(ac) {
    const t = ac.currentTime;
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      osc(ac, 'square', f, 0.13, t + i * 0.09, t + i * 0.09 + 0.18);
    });
    osc(ac, 'triangle', 1047, 0.07, t + 0.28, t + 0.55);
  },

  // 오류: 하강하는 버저
  error(ac) {
    const t = ac.currentTime;
    osc(ac, 'sawtooth', 440, 0.12, t,        t + 0.12, 220);
    osc(ac, 'sawtooth', 220, 0.10, t + 0.13, t + 0.30, 110);
  },

  // 승인 대기: 짧은 경고 비프 x2
  blocked(ac) {
    const t = ac.currentTime;
    osc(ac, 'square', 880, 0.10, t,        t + 0.08);
    osc(ac, 'square', 880, 0.10, t + 0.12, t + 0.20);
  },

  // 재입장 (유휴/오프라인 → 작업): 짜잔 팡파레
  reentry(ac) {
    const t = ac.currentTime;
    osc(ac, 'sine',      55,  0.18, t,        t + 0.10, 28);
    osc(ac, 'square',   392,  0.13, t + 0.04, t + 0.14);
    osc(ac, 'square',   494,  0.11, t + 0.04, t + 0.14);
    osc(ac, 'square',   523,  0.14, t + 0.17, t + 0.28);
    osc(ac, 'square',   659,  0.14, t + 0.17, t + 0.28);
    osc(ac, 'square',   784,  0.12, t + 0.17, t + 0.28);
    osc(ac, 'square',  1047,  0.13, t + 0.26, t + 0.44);
    osc(ac, 'square',  1319,  0.09, t + 0.30, t + 0.50);
    osc(ac, 'triangle', 784,  0.07, t + 0.42, t + 0.72);
  },

  // 작업 시작: 짧은 업 블립
  work_start(ac) {
    const t = ac.currentTime;
    osc(ac, 'square', 330, 0.09, t, t + 0.06, 495);
  },

  // 로그 틱: 짧은 클릭감
  log_tick(ac) {
    const t = ac.currentTime;
    osc(ac, 'square', 880, 0.09, t, t + 0.05);
  },

  // 세션 시작: 파워온 부트업
  session_start(ac) {
    const t = ac.currentTime;
    osc(ac, 'sawtooth',  80,  0.10, t,        t + 0.18, 160);
    osc(ac, 'sawtooth', 160,  0.08, t + 0.14, t + 0.28, 240);
    osc(ac, 'square',   261,  0.11, t + 0.22, t + 0.34);
    osc(ac, 'square',   329,  0.11, t + 0.31, t + 0.43);
    osc(ac, 'square',   392,  0.11, t + 0.40, t + 0.52);
    osc(ac, 'square',   523,  0.12, t + 0.49, t + 0.65);
    osc(ac, 'triangle', 523,  0.07, t + 0.58, t + 0.90);
    osc(ac, 'triangle', 784,  0.05, t + 0.62, t + 0.90);
  },

  // 세션 종료: 하강 페이드
  session_end(ac) {
    const t = ac.currentTime;
    osc(ac, 'triangle', 660, 0.10, t,        t + 0.15, 440);
    osc(ac, 'triangle', 440, 0.08, t + 0.12, t + 0.30, 220);
  },
};

// ─── 사전 렌더링 ──────────────────────────────────────────────────────────────

const SAMPLE_RATE = 44100;
const soundBuffers = new Map<SoundEvent, AudioBuffer>();

async function prerenderAll(): Promise<void> {
  for (const event of Object.keys(SOUNDS) as SoundEvent[]) {
    const frameCount = Math.ceil(SAMPLE_RATE * SOUND_DURATIONS[event]);
    const offline = new OfflineAudioContext(1, frameCount, SAMPLE_RATE);
    SOUNDS[event](offline);
    soundBuffers.set(event, await offline.startRendering());
  }
}

// 앱 로드 즉시 백그라운드 렌더링 — OfflineAudioContext는 autoplay 정책 무관
prerenderAll().catch(() => {});

// ─── 재생 ─────────────────────────────────────────────────────────────────────

function playBuffered(ac: AudioContext, event: SoundEvent): void {
  const buffer = soundBuffers.get(event);
  if (buffer) {
    // AudioBufferSourceNode: 생성 비용 극히 낮음, 재생 완료 후 자동 GC
    const src = ac.createBufferSource();
    src.buffer = buffer;
    src.connect(ac.destination);
    src.start(ac.currentTime);
    return;
  }
  // 렌더링 완료 전(극히 드문 케이스) 폴백: 직접 합성
  SOUNDS[event](ac);
}

// ─── Autoplay 정책 대응 ───────────────────────────────────────────────────────

// suspend 중 유실된 마지막 사운드 (가장 최신 1개만 보관)
let pendingEvent: SoundEvent | null = null;

function attachCtxListeners(ac: AudioContext): void {
  ac.addEventListener('statechange', () => {
    if (ac.state === 'running') {
      // resume 성공 → 보류 중인 사운드 즉시 재생
      const ev = pendingEvent;
      pendingEvent = null;
      if (ev) try { playBuffered(ac, ev); } catch {}
    } else if (ac.state === 'suspended') {
      // Chrome이 suspend 시 즉시 resume 재시도
      ac.resume().catch(() => {});
    }
  });
}

function tryResume(): void {
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  else if (ctx.state === 'running') {
    // 이미 running이면 pending 즉시 처리 (focus 복귀 시 statechange 없는 경우 대비)
    const ev = pendingEvent;
    pendingEvent = null;
    if (ev) try { playBuffered(ctx, ev); } catch {}
  }
}

if (typeof window !== 'undefined') {
  // 앱 로드 즉시 AudioContext 생성 + resume 시도 (autoplay 허용 환경에서 바로 동작)
  ctx = new AudioContext();
  attachCtxListeners(ctx);
  ctx.resume().catch(() => {});

  // 탭 visible 복귀 시 resume
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tryResume();
  });

  // window focus 복귀 시 resume (다른 앱에서 돌아올 때)
  window.addEventListener('focus', tryResume);

  // 여전히 suspended 상태일 경우 첫 클릭으로 해제
  document.addEventListener('pointerdown', tryResume, { once: true });
}

// ─── Store ────────────────────────────────────────────────────────────────────

const MUTE_KEY = 'acd_sound_muted';

interface SoundStore {
  isMuted: boolean;
  toggleMute: () => void;
  playSound: (event: SoundEvent) => void;
}

export const useSoundStore = create<SoundStore>((set, get) => ({
  isMuted: localStorage.getItem(MUTE_KEY) !== 'false',

  toggleMute: () => {
    const next = !get().isMuted;
    localStorage.setItem(MUTE_KEY, String(next));
    set({ isMuted: next });
  },

  playSound: (event: SoundEvent) => {
    if (get().isMuted) return;

    // ctx 미생성 (첫 클릭 전): 보류 저장, 클릭 시 재생
    if (!ctx) {
      pendingEvent = event;
      return;
    }

    // ctx가 running이 아닌 경우: 보류 저장 + resume 시도
    if (ctx.state !== 'running') {
      pendingEvent = event;
      tryResume();
      return;
    }

    // 정상 경로: 즉시 재생
    try { playBuffered(ctx, event); } catch {}
  },
}));
