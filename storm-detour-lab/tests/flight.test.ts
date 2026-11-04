import { describe, expect, it } from 'vitest';
import { flightReducer, initialFlight, phaseAt } from '../src/state/flight';

const pieces = [
  { phase: 'OP' as const, start: 0, length: 4 },
  { phase: 'ARC' as const, start: 4, length: 1 },
  { phase: 'QA' as const, start: 5, length: 4 },
];

describe('비행 재생 상태', () => {
  it('비행 중 태풍(시나리오) 변경 → 정지·처음으로', () => {
    let s = flightReducer(initialFlight('a'), { type: 'play' });
    s = flightReducer(s, { type: 'tick', dtSec: 3, durationSec: 10 });
    expect(s.playing).toBe(true);
    expect(s.progress).toBeCloseTo(0.3);
    s = flightReducer(s, { type: 'reset', scenarioKey: 'b' });
    expect(s.playing).toBe(false);
    expect(s.progress).toBe(0);
  });
  it('같은 시나리오 키면 유지', () => {
    const s = { ...initialFlight('a'), progress: 0.5 };
    expect(flightReducer(s, { type: 'reset', scenarioKey: 'a' }).progress).toBe(0.5);
  });
  it('배속 2배', () => {
    let s = flightReducer({ ...initialFlight('a'), speed: 2 }, { type: 'play' });
    s = flightReducer(s, { type: 'tick', dtSec: 1, durationSec: 10 });
    expect(s.progress).toBeCloseTo(0.2);
  });
  it('단계 넘기기: OP 끝 → 원호 끝 → QA 끝', () => {
    let s = { ...initialFlight('a'), progress: 0.1 };
    s = flightReducer(s, { type: 'skip', pieces, total: 9 });
    expect(s.progress).toBeCloseTo(4 / 9);
    s = flightReducer(s, { type: 'skip', pieces, total: 9 });
    expect(s.progress).toBeCloseTo(5 / 9);
    s = flightReducer(s, { type: 'skip', pieces, total: 9 });
    expect(s.progress).toBe(1);
  });
  it('단계 판정', () => {
    expect(phaseAt(0.2, pieces, 9)).toBe('OP');
    expect(phaseAt(4.5 / 9, pieces, 9)).toBe('ARC');
    expect(phaseAt(0.9, pieces, 9)).toBe('QA');
  });
});
