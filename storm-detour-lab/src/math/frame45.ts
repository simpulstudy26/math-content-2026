/**
 * 45° 정규화 좌표계 (명세 3-2).
 * 인천 중심 평면에서 목적지 A₀=(X_A, Y_A)가 주어지면, 원점은 그대로 두고
 * 축을 회전하여 A가 제1사분면의 직선 y = x 위, 즉 A = (t, t)가 되게 한다.
 *
 *   e = (X_A/L, Y_A/L),  n = (−Y_A/L, X_A/L)
 *   s = X e_x + Y e_y,   h = X n_x + Y n_y
 *   x = (s − h)/√2,      y = (s + h)/√2
 *
 * 평행이동(없음)과 회전뿐이므로 거리·각도·원·접선 성질이 모두 보존된다.
 */
import type { Vec2 } from './vec';

export interface Frame45 {
  /** OA의 평면 길이 L (km) */
  L: number;
  /** A = (t, t), t = L/√2 */
  t: number;
  /** 항로 방향 단위벡터 */
  e: Vec2;
  /** 항로 수직 단위벡터 (e를 반시계로 90° 회전) */
  n: Vec2;
  /** 목적지의 인천 중심 평면 좌표 */
  A0: Vec2;
}

const SQRT2 = Math.SQRT2;

export function makeFrame(A0: Vec2): Frame45 {
  const L = Math.hypot(A0.x, A0.y);
  if (!(L > 0)) throw new Error('출발지와 목적지가 같아 좌표계를 만들 수 없습니다 (L = 0).');
  const e = { x: A0.x / L, y: A0.y / L };
  const n = { x: -A0.y / L, y: A0.x / L };
  return { L, t: L / SQRT2, e, n, A0 };
}

/** 인천 중심 평면 (X, Y) → 수학 좌표 (x, y) */
export function planeToMath(f: Frame45, P: Vec2): Vec2 {
  const s = P.x * f.e.x + P.y * f.e.y;
  const h = P.x * f.n.x + P.y * f.n.y;
  return { x: (s - h) / SQRT2, y: (s + h) / SQRT2 };
}

/** 수학 좌표 (x, y) → 인천 중심 평면 (X, Y) : s=(x+y)/√2, h=(y−x)/√2, (X,Y)=s e + h n */
export function mathToPlane(f: Frame45, p: Vec2): Vec2 {
  const s = (p.x + p.y) / SQRT2;
  const h = (p.y - p.x) / SQRT2;
  return { x: s * f.e.x + h * f.n.x, y: s * f.e.y + h * f.n.y };
}

/** 패널 표시용: 원래 평면에서 OA가 동쪽(X축)과 이루는 각, 그리고 회전각(도) */
export function frameAngles(f: Frame45): { headingFromEastDeg: number; rotationDeg: number } {
  const headingFromEastDeg = (Math.atan2(f.A0.y, f.A0.x) * 180) / Math.PI;
  // 수학 좌표에서 OA 방향은 45°이므로, 축을 (heading − 45°)만큼 회전한 것과 같다.
  let rotationDeg = headingFromEastDeg - 45;
  if (rotationDeg > 180) rotationDeg -= 360;
  if (rotationDeg <= -180) rotationDeg += 360;
  return { headingFromEastDeg, rotationDeg };
}
