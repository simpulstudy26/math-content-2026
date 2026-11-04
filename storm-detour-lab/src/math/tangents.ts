/**
 * 원 밖의 점 S에서 원 (중심 C, 반지름 r)에 그은 두 접선의 접점 (명세 7장).
 *
 *   v = S − C, D² = |v|², H = √(D² − r²), J(v) = (−v_y, v_x)
 *   T± = C + (r²/D²)·v ± (rH/D²)·J(v)
 */
import { add, dot, perp, scale, sub, type Vec2 } from './vec';

export interface TangentPair {
  /** + 부호 접점 */
  plus: Vec2;
  /** − 부호 접점 */
  minus: Vec2;
  /** D² = |S−C|² */
  D2: number;
  /** H = 접선 길이 √(D² − r²) */
  H: number;
}

export function tangentPoints(S: Vec2, C: Vec2, r: number): TangentPair {
  const vv = sub(S, C);
  const D2 = dot(vv, vv);
  if (D2 <= r * r) throw new Error('점이 원 안 또는 원 위에 있어 접선을 그을 수 없습니다.');
  const H = Math.sqrt(D2 - r * r);
  const base = add(C, scale(vv, (r * r) / D2));
  const off = scale(perp(vv), (r * H) / D2);
  return { plus: add(base, off), minus: sub(base, off), D2, H };
}

export interface TangentCheck {
  /** ||T−C| − r| */
  radiusError: number;
  /** |(T−C)·(S−T)| / (r·|S−T|) — 0이면 반지름 ⟂ 접선 */
  perpendicularityError: number;
}

export function checkTangent(T: Vec2, S: Vec2, C: Vec2, r: number): TangentCheck {
  const ct = sub(T, C);
  const ts = sub(S, T);
  const radiusError = Math.abs(Math.hypot(ct.x, ct.y) - r);
  const len = Math.hypot(ts.x, ts.y);
  const perpendicularityError = len > 0 ? Math.abs(dot(ct, ts)) / (r * len) : 0;
  return { radiusError, perpendicularityError };
}

/** y − x 부호: 직선 y=x 기준 어느 쪽인가 (+1 위, −1 아래) */
export const sideOf = (p: Vec2): 1 | -1 | 0 => {
  const d = p.y - p.x;
  return d > 0 ? 1 : d < 0 ? -1 : 0;
};
