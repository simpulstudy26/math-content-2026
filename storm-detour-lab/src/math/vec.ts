/** 2차원 벡터 도우미 — 순수 함수만 둔다. */
export interface Vec2 {
  x: number;
  y: number;
}

export const v = (x: number, y: number): Vec2 => ({ x, y });
export const add = (p: Vec2, q: Vec2): Vec2 => ({ x: p.x + q.x, y: p.y + q.y });
export const sub = (p: Vec2, q: Vec2): Vec2 => ({ x: p.x - q.x, y: p.y - q.y });
export const scale = (p: Vec2, k: number): Vec2 => ({ x: p.x * k, y: p.y * k });
export const dot = (p: Vec2, q: Vec2): number => p.x * q.x + p.y * q.y;
export const cross = (p: Vec2, q: Vec2): number => p.x * q.y - p.y * q.x;
export const norm = (p: Vec2): number => Math.hypot(p.x, p.y);
export const dist = (p: Vec2, q: Vec2): number => Math.hypot(p.x - q.x, p.y - q.y);
/** 90° 반시계 회전 J(v) = (−v_y, v_x) */
export const perp = (p: Vec2): Vec2 => ({ x: -p.y, y: p.x });

/** 비교용 상대 허용오차 */
export const EPS = 1e-9;
