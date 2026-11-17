/**
 * 원형 태풍 회피 최단 항로 (문서 "도착점 A = (t, 0) 기준 전체 유도").
 * 입력: t > 0, 태풍 중심 C = (a, b), 반지름 r.   길이 단위는 평면 단위(앱에서는 km).
 *
 *   ① 교점   h = √(r² − b²),  B₁ = (a − h, 0), B₂ = (a + h, 0),  조건 0 < a − h < a + h < t
 *   ② 방향   s = −1 (b > 0, 아래쪽),  +1 (b ≤ 0, 위쪽)
 *   ③ 접선   D_O = a² + b², ℓ_O = √(D_O − r²) = OP,   D_A = (t − a)² + b², ℓ_A = √(D_A − r²) = AQ
 *   ④ 접점   P = ((aℓ_O² − sbrℓ_O)/D_O, (bℓ_O² + sarℓ_O)/D_O)
 *            Q = (a + ((t−a)r² + sbrℓ_A)/D_A, b + (−br² + s(t−a)rℓ_A)/D_A)
 *   ⑤ 교점 R H = p_x q_y − p_y(q_x − t),  R = (t p_x q_y / H, t p_y q_y / H),  d_R = CR
 *   ⑥ 각도   z = r/d_R → 코사인표 보간으로 α̂
 *   ⑦ 거리   L_min ≈ ℓ_O + πrα̂/90 + ℓ_A,  L_직선 = t
 */
import { MAX_INTERP_ERROR_DEG, interpolateAlpha, type Interpolation } from './cosTable';
import type { Vec2 } from './vec';

export type Status =
  | 'crossing' // 두 교점이 모두 선분 내부 → 최단 우회 공식 사용
  | 'tangent' // b² = r², 한 점에서 접함 → 직선 OA 허용
  | 'miss' // b² > r², 만나지 않음 → 직선
  | 'outsideSegment' // 직선과는 만나지만 선분 OA 밖 → 직선
  | 'endpointInside' // 출발점 또는 도착점이 원 내부·경계 → 태풍 수정
  | 'invalidRadius'; // r ≤ 0

export interface DetourResult {
  t: number;
  a: number;
  b: number;
  r: number;
  status: Status;
  /** r² − b² */
  r2mb2: number;
  /** h = √(r² − b²) (교점이 있을 때) */
  h: number | null;
  B1: Vec2 | null;
  B2: Vec2 | null;
  originInside: boolean;
  destInside: boolean;
  /** 직선 거리 t */
  straight: number;
  detour: DetourDetail | null;
}

export interface DetourDetail {
  /** 우회 방향 부호 s */
  s: 1 | -1;
  /** b = 0 (위쪽을 대표 선택, 두 경로 길이 같음) */
  symmetric: boolean;
  DO: number;
  lO: number;
  DA: number;
  lA: number;
  P: Vec2;
  Q: Vec2;
  H: number;
  R: Vec2;
  dR: number;
  interp: Interpolation;
  alphaHat: number;
  /** 2α̂ */
  centralHat: number;
  /** πrα̂/90 */
  arcHat: number;
  /** L_min ≈ ℓ_O + πrα̂/90 + ℓ_A */
  Lmin: number;
  /** ΔL = L_min − t */
  extra: number;
  /** ΔL / t × 100 */
  increasePct: number;
  /** 검산용: 실제 도형에서 잰 α (도) — 화면의 원호를 그리고 오차를 보여 주는 데만 쓴다 */
  alphaTrue: number;
  arcTrue: number;
  LTrue: number;
  /** α − α̂ (도), 0 ≤ … < 0.25 */
  interpErrorDeg: number;
  /** |ΔL_보간| = πr|α − α̂|/90 */
  interpErrorLen: number;
  /** 상한 πr/360 */
  interpErrorBound: number;
  /**
   * 근삿값 L_min 이 직선 거리 t 보다 작아지는 경우 (태풍이 항로를 아주 살짝 걸칠 때).
   * 실제 우회 거리는 항상 t 보다 길지만, 보간 오차(최대 πr/360)가 실제 추가 거리보다 크면 생긴다.
   */
  approxBelowStraight: boolean;
  /** 원호 진행 방향: +1 반시계, −1 시계 (s = −1 → 반시계) */
  arcDir: 1 | -1;
  /** 중심에서 본 P, Q의 각 (라디안) — 렌더링용 */
  thetaP: number;
  thetaQ: number;
  checks: {
    PonCircle: number;
    QonCircle: number;
    /** OP ⟂ CP : p_x(p_x − a) + p_y(p_y − b) */
    Pperp: number;
    /** AQ ⟂ CQ : (q_x − t)(q_x − a) + q_y(q_y − b) */
    Qperp: number;
  };
}

export function computeDetour(t: number, a: number, b: number, r: number): DetourResult {
  const base = { t, a, b, r, straight: t };
  const tol = 1e-12 * Math.max(1, r * r, t * t);
  const originInside = a * a + b * b - r * r <= tol;
  const destInside = (t - a) * (t - a) + b * b - r * r <= tol;
  const r2mb2 = r * r - b * b;
  const empty = { h: null, B1: null, B2: null, detour: null };

  if (!(r > 0)) return { ...base, ...empty, r2mb2, originInside, destInside, status: 'invalidRadius' };
  if (r2mb2 < -tol) return { ...base, ...empty, r2mb2, originInside, destInside, status: 'miss' };
  if (Math.abs(r2mb2) <= tol) {
    return { ...base, ...empty, h: 0, B1: { x: a, y: 0 }, B2: { x: a, y: 0 }, r2mb2, originInside, destInside, status: 'tangent' };
  }
  const h = Math.sqrt(r2mb2);
  const B1 = { x: a - h, y: 0 };
  const B2 = { x: a + h, y: 0 };
  const withB = { ...base, h, B1, B2, r2mb2, originInside, destInside };
  if (originInside || destInside) return { ...withB, detour: null, status: 'endpointInside' };
  if (!(0 < a - h && a + h < t)) return { ...withB, detour: null, status: 'outsideSegment' };

  const s: 1 | -1 = b > 0 ? -1 : 1;
  const DO = a * a + b * b;
  const lO = Math.sqrt(DO - r * r);
  const DA = (t - a) * (t - a) + b * b;
  const lA = Math.sqrt(DA - r * r);
  const P = { x: (a * lO * lO - s * b * r * lO) / DO, y: (b * lO * lO + s * a * r * lO) / DO };
  const Q = {
    x: a + ((t - a) * r * r + s * b * r * lA) / DA,
    y: b + (-b * r * r + s * (t - a) * r * lA) / DA,
  };
  const H = P.x * Q.y - P.y * (Q.x - t);
  const R = { x: (t * P.x * Q.y) / H, y: (t * P.y * Q.y) / H };
  const dR = Math.hypot(R.x - a, R.y - b);
  const interp = interpolateAlpha(r / dR);
  const alphaHat = interp.alphaHat;
  const arcHat = (Math.PI * r * alphaHat) / 90;
  const Lmin = lO + arcHat + lA;

  // 검산: 실제 도형의 중심각 (렌더링·오차 표시 전용)
  const thetaP = Math.atan2(P.y - b, P.x - a);
  const thetaQ = Math.atan2(Q.y - b, Q.x - a);
  const arcDir: 1 | -1 = s === -1 ? 1 : -1;
  let sweep = arcDir === 1 ? thetaQ - thetaP : thetaP - thetaQ;
  sweep = ((sweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const alphaTrue = (sweep * 90) / Math.PI; // sweep/2 를 도로
  const arcTrue = r * sweep;
  const interpErrorDeg = alphaTrue - alphaHat;

  return {
    ...withB,
    status: 'crossing',
    detour: {
      s,
      symmetric: b === 0,
      DO,
      lO,
      DA,
      lA,
      P,
      Q,
      H,
      R,
      dR,
      interp,
      alphaHat,
      centralHat: 2 * alphaHat,
      arcHat,
      Lmin,
      extra: Lmin - t,
      increasePct: ((Lmin - t) / t) * 100,
      alphaTrue,
      arcTrue,
      LTrue: lO + arcTrue + lA,
      interpErrorDeg,
      interpErrorLen: (Math.PI * r * Math.abs(interpErrorDeg)) / 90,
      interpErrorBound: (Math.PI * r) / 360,
      approxBelowStraight: Lmin <= t,
      arcDir,
      thetaP,
      thetaQ,
      checks: {
        PonCircle: Math.abs(Math.hypot(P.x - a, P.y - b) - r),
        QonCircle: Math.abs(Math.hypot(Q.x - a, Q.y - b) - r),
        Pperp: P.x * (P.x - a) + P.y * (P.y - b),
        Qperp: (Q.x - t) * (Q.x - a) + Q.y * (Q.y - b),
      },
    },
  };
}

export { MAX_INTERP_ERROR_DEG };

/* ───────────── 실제 비행 경로 (거리 매개화) ───────────── */

export type Phase = 'OP' | 'ARC' | 'QA' | 'DIRECT';

export interface Piece {
  phase: Phase;
  start: number;
  length: number;
}

export interface PathParam {
  pieces: Piece[];
  total: number;
  /** 누적 거리 s 에서의 위치와 진행 방향 */
  at: (s: number) => { p: Vec2; dir: Vec2; phase: Phase };
}

export function parametrize(res: DetourResult): PathParam {
  const d = res.detour;
  const t = res.t;
  if (!d) {
    return {
      pieces: [{ phase: 'DIRECT', start: 0, length: t }],
      total: t,
      at: (s) => ({ p: { x: Math.min(t, Math.max(0, s)), y: 0 }, dir: { x: 1, y: 0 }, phase: 'DIRECT' }),
    };
  }
  const { a, b, r } = res;
  const L1 = d.lO;
  const L2 = d.arcTrue;
  const L3 = d.lA;
  const total = L1 + L2 + L3;
  const u1 = { x: d.P.x / L1, y: d.P.y / L1 };
  const u3 = { x: (t - d.Q.x) / L3, y: -d.Q.y / L3 };
  return {
    pieces: [
      { phase: 'OP', start: 0, length: L1 },
      { phase: 'ARC', start: L1, length: L2 },
      { phase: 'QA', start: L1 + L2, length: L3 },
    ],
    total,
    at: (sRaw) => {
      const s = Math.min(total, Math.max(0, sRaw));
      if (s <= L1) return { p: { x: u1.x * s, y: u1.y * s }, dir: u1, phase: 'OP' };
      if (s <= L1 + L2) {
        const th = d.thetaP + (d.arcDir * (s - L1)) / r;
        const p = { x: a + r * Math.cos(th), y: b + r * Math.sin(th) };
        const dir = d.arcDir === 1 ? { x: -Math.sin(th), y: Math.cos(th) } : { x: Math.sin(th), y: -Math.cos(th) };
        return { p, dir, phase: 'ARC' };
      }
      const k = s - L1 - L2;
      return { p: { x: d.Q.x + u3.x * k, y: d.Q.y + u3.y * k }, dir: u3, phase: 'QA' };
    },
  };
}

export const STATUS_TEXT: Record<Status, string> = {
  crossing: '항로가 태풍을 관통합니다 — 우회 계산 가능',
  tangent: '직선이 태풍에 한 점에서 접합니다 — 직선 비행 가능',
  miss: '항로가 태풍과 만나지 않습니다',
  outsideSegment: '교점이 출발~도착 구간 밖에 있습니다',
  endpointInside: '출발지나 목적지가 태풍 안에 있습니다',
  invalidRadius: '반지름은 0보다 커야 합니다',
};
