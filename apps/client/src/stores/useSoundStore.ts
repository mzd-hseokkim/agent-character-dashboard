/**
 * useSoundStore — Web Audio API 기반 8비트 스타일 효과음 (Zustand store)
 * 외부 파일 없이 순수 합성음 생성
 */
import { create } from 'zustand';

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function osc(
  ac: AudioContext,
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

export type SoundEvent = 'agent_appear' | 'done' | 'error' | 'blocked' | 'work_start' | 'session_end' | 'session_start' | 'reentry';

const SOUNDS: Record<SoundEvent, (ac: AudioContext) => void> = {
  // 에이전트 등장: 상승하는 두 음
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

const MUTE_KEY = 'acd_sound_muted';

interface SoundStore {
  isMuted: boolean;
  toggleMute: () => void;
  playSound: (event: SoundEvent) => void;
}

export const useSoundStore = create<SoundStore>((set, get) => ({
  isMuted: localStorage.getItem(MUTE_KEY) === 'true',

  toggleMute: () => {
    const next = !get().isMuted;
    localStorage.setItem(MUTE_KEY, String(next));
    set({ isMuted: next });
  },

  playSound: (event: SoundEvent) => {
    if (get().isMuted) return;
    try {
      const ac = getCtx();
      SOUNDS[event](ac);
    } catch (_e) {
      // AudioContext 차단 등 무시
    }
  },
}));
