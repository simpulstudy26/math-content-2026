/**
 * 기내 노트 일정 — 비행 시각에 맞춰 문서 11장의 계산 순서 ①~⑧이 하나씩 적힌다.
 * 내용(수식)은 components/InFlightNotes.tsx 에서 그린다. 여기서는 순서와 시각만 정한다.
 */
import type { Timeline } from '../math/trip';

export type NoteId =
  | 'setup' // ① 좌표 설정
  | 'cross' // ② 교점 h, 관통 조건
  | 'side' // ③ 우회 방향 s
  | 'why' // 2장: 왜 접선–원호–접선인가
  | 'tangent' // ④ 접선 길이
  | 'points' // ⑤ 접점 P, Q
  | 'turnP' // (이야기) P 도착, 선회 시작
  | 'R' // ⑥ 교점 R, CR
  | 'table' // ⑦ 코사인표 보간
  | 'arc' // ⑧ 원호 길이
  | 'exitQ' // (이야기) Q 통과
  | 'total' // L_min 합산·비교
  | 'error'; // 보간 오차

export interface NoteSlot {
  id: NoteId;
  at: number;
  kind: 'calc' | 'story';
  step?: string;
  title: string;
}

export function scheduleNotes(tl: Timeline): NoteSlot[] {
  const D = tl.duration;
  const { P, Q } = tl.marks;
  const slots: NoteSlot[] = [
    { id: 'setup', at: 1.5, kind: 'calc', step: '①', title: '좌표 설정 — 기수 방향이 x축' },
    { id: 'cross', at: D * 0.1, kind: 'calc', step: '②', title: '항로가 태풍을 관통하는가' },
    { id: 'side', at: D * 0.17, kind: 'calc', step: '③', title: '어느 쪽으로 돌까' },
    { id: 'why', at: D * 0.23, kind: 'story', title: '왜 접선–원호–접선일까' },
    { id: 'tangent', at: D * 0.3, kind: 'calc', step: '④', title: '접선 길이 — 피타고라스' },
    { id: 'points', at: D * 0.37, kind: 'calc', step: '⑤', title: '접점 P, Q의 좌표' },
    { id: 'turnP', at: P - 1, kind: 'story', title: '접점 P — 선회 시작' },
    { id: 'R', at: P + (Q - P) * 0.18, kind: 'calc', step: '⑥', title: '두 접선의 교점 R' },
    { id: 'table', at: P + (Q - P) * 0.45, kind: 'calc', step: '⑦', title: '코사인표로 α 찾기' },
    { id: 'arc', at: P + (Q - P) * 0.75, kind: 'calc', step: '⑧', title: '원호 PQ의 길이' },
    { id: 'exitQ', at: Q, kind: 'story', title: '접점 Q — 목적지로 직진' },
    { id: 'total', at: Q + (D - Q) * 0.3, kind: 'calc', title: '최단 거리와 직선 비교' },
    { id: 'error', at: Q + (D - Q) * 0.62, kind: 'calc', title: '표 보간 오차' },
  ];
  return slots;
}

/** 레이더(좌표평면)에 무엇을 보여 줄지 — 계산이 적힌 뒤에만 점이 나타난다 */
export function radarReveal(visible: Set<NoteId>) {
  return {
    intersections: visible.has('cross'),
    points: visible.has('points'),
    R: visible.has('R'),
    arc: visible.has('arc'),
  };
}
