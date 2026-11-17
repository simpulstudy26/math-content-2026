/**
 * 계산 좌표계: 출발점 O = (0, 0), 목적지 A = (t, 0).
 * 수학 문서의 "출발점에서 목적지로 향하는 방향을 처음부터 양의 x축으로 정의한다"를 구현한다.
 *
 * 인천 중심 평면(X, Y)에서 목적지가 A₀ = (X_A, Y_A)일 때
 *   e = A₀/|A₀| (진행 방향, x축),  n = (−e_y, e_x) (왼쪽 수직, y축)
 *   x = P·e,  y = P·n            ← 회전만 하므로 길이·각도·원·접선이 그대로 보존된다.
 */
import type { Vec2 } from './vec';

export interface Frame {
  /** OA = t (km) */
  t: number;
  e: Vec2;
  n: Vec2;
  A0: Vec2;
}

export function makeFrame(A0: Vec2): Frame {
  const t = Math.hypot(A0.x, A0.y);
  if (!(t > 0)) throw new Error('출발지와 목적지가 같아 좌표계를 만들 수 없습니다.');
  const e = { x: A0.x / t, y: A0.y / t };
  return { t, e, n: { x: -e.y, y: e.x }, A0 };
}

export const planeToMath = (f: Frame, P: Vec2): Vec2 => ({
  x: P.x * f.e.x + P.y * f.e.y,
  y: P.x * f.n.x + P.y * f.n.y,
});

export const mathToPlane = (f: Frame, p: Vec2): Vec2 => ({
  x: p.x * f.e.x + p.y * f.n.x,
  y: p.x * f.e.y + p.y * f.n.y,
});
