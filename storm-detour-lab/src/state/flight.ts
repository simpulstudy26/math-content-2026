/**
 * 비행 재생 상태 — React와 독립적인 순수 리듀서.
 * 시나리오(공항·태풍)가 바뀌면 scenarioKey가 달라지고, 재생은 정지·초기화된다 (명세 15장: 비행 중 태풍 재배치).
 */
import type { Phase, PathPiece } from '../math/detour';

export type Speed = 0.5 | 1 | 2;

export interface FlightState {
  scenarioKey: string;
  /** 진행 비율 0~1 (누적 경로 길이 기준) */
  progress: number;
  playing: boolean;
  speed: Speed;
}

export type FlightAction =
  | { type: 'reset'; scenarioKey: string }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'restart' }
  | { type: 'tick'; dtSec: number; durationSec: number }
  | { type: 'seek'; progress: number }
  | { type: 'speed'; speed: Speed }
  | { type: 'skip'; pieces: PathPiece[]; total: number };

export const initialFlight = (scenarioKey = ''): FlightState => ({
  scenarioKey,
  progress: 0,
  playing: false,
  speed: 1,
});

export function flightReducer(s: FlightState, a: FlightAction): FlightState {
  switch (a.type) {
    case 'reset':
      return s.scenarioKey === a.scenarioKey ? s : { ...initialFlight(a.scenarioKey), speed: s.speed };
    case 'play':
      return { ...s, playing: true, progress: s.progress >= 1 ? 0 : s.progress };
    case 'pause':
      return { ...s, playing: false };
    case 'restart':
      return { ...s, progress: 0, playing: true };
    case 'tick': {
      if (!s.playing) return s;
      const p = Math.min(1, s.progress + (a.dtSec * s.speed) / a.durationSec);
      return { ...s, progress: p, playing: p < 1 };
    }
    case 'seek':
      return { ...s, progress: Math.min(1, Math.max(0, a.progress)) };
    case 'speed':
      return { ...s, speed: a.speed };
    case 'skip': {
      // 현재 단계의 끝(다음 단계 시작)으로 이동
      const sNow = s.progress * a.total;
      const next = a.pieces.map((p) => p.start + p.length).find((end) => end > sNow + 1e-6 * a.total);
      return { ...s, progress: next === undefined ? 1 : next / a.total };
    }
  }
}

export function phaseAt(progress: number, pieces: PathPiece[], total: number): Phase {
  const s = progress * total;
  for (const p of pieces) if (s <= p.start + p.length + 1e-9) return p.phase;
  return pieces[pieces.length - 1]?.phase ?? 'DIRECT';
}
