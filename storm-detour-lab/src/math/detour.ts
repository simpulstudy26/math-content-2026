/**
 * 45° 정규화 좌표계에서의 최단 우회 경로 (명세 5~10장).
 * 입력: t (A = (t,t)), C = (a,b), r.  모든 길이 단위는 수학 평면 단위(앱에서는 km).
 *
 * 경로 구조: O → P (접선) → 원호 PQ → Q → A (접선)
 *   OP = √(a²+b²−r²),  AQ = √((t−a)²+(t−b)²−r²)
 *   R : 접점 P, Q에서의 두 접선의 교점,  cos α = r / CR  (α는 코사인표로 찾음)
 *   중심각 = 2α (작은 호) 또는 360° − 2α (큰 호),  호 = 2πr·(중심각/360)
 */
import { lookupCosine, type CosineLookup } from './angleTable';
import { intersectSegment, type IntersectionResult } from './intersections';
import { checkTangent, sideOf, tangentPoints, type TangentCheck } from './tangents';
import { dist, type Vec2 } from './vec';

/** +1 : y − x > 0 쪽(위쪽) 우회,  −1 : y − x < 0 쪽(아래쪽) 우회 */
export type Side = 1 | -1;

export const SIDE_LABEL: Record<string, string> = {
  '1': 'y > x 쪽 (직선 위쪽)',
  '-1': 'y < x 쪽 (직선 아래쪽)',
};

export interface DetourCandidate {
  side: Side;
  P: Vec2;
  Q: Vec2;
  /** 두 접선의 교점 R — 원호가 반원에 아주 가까워 접선이 평행하면 null */
  R: Vec2 | null;
  /** Δ = u_x v_y − u_y v_x  (u = P−C, v = Q−C) */
  delta: number;
  OP: number;
  AQ: number;
  /** CR = d */
  CR: number | null;
  /** cos α = r/d */
  cosineRatio: number | null;
  lookup: CosineLookup | null;
  /** 표에서 찾은 α (도) */
  alphaDeg: number;
  /** 2α — 작은 중심각 */
  smallAngleDeg: number;
  /** 실제 원호가 큰 호(180° 초과)인가 — 진행 방향으로 판정 */
  isMajorArc: boolean;
  /** 교육용 중심각: 작은 호면 2α, 큰 호면 360° − 2α */
  centralAngleDeg: number;
  /** 2πr·(중심각/360) */
  arcLength: number;
  totalLength: number;
  /** 원호 진행 방향: −1 시계, +1 반시계 */
  arcDirection: 1 | -1;
  /** P, Q의 극각(도) — 렌더링·방향 판단용 */
  thetaPDeg: number;
  thetaQDeg: number;
  /** 극각으로 직접 잰 원호의 방향 있는 각 (검산용, 0~360) */
  sweepDeg: number;
  checks: {
    tangentP: TangentCheck;
    tangentQ: TangentCheck;
    /** 비행 방향이 P, Q에서 끊기지 않는가 (접선 방향 일치) */
    headingContinuousAtP: boolean;
    headingContinuousAtQ: boolean;
    /** 원호가 교점 I−, I+를 포함하지 않는가 (원 내부로 들어가지 않는 쪽) */
    arcAvoidsChord: boolean;
    /** 코사인표 중심각과 극각 sweep의 차이(도) */
    angleAgreementDeg: number;
  };
}

export interface MathDetourResult {
  t: number;
  A: Vec2;
  C: Vec2;
  r: number;
  check: IntersectionResult;
  directLength: number;
  /** 우회가 필요하고 가능한가 */
  detourRequired: boolean;
  /** b − a 부호로 정한 짧은 쪽 (b = a 이면 null) */
  ruleSide: Side | null;
  /** b = a (양쪽 길이 동일) */
  tie: boolean;
  /** 최종 선택된 우회 */
  chosen: DetourCandidate | null;
  /** 반대쪽 후보 (비교용) */
  other: DetourCandidate | null;
  /** b−a 규칙과 실제로 계산한 두 후보의 길이 비교가 일치하는가 */
  ruleAgrees: boolean | null;
  totalLength: number;
  extraLength: number;
  increasePct: number;
}

const toDeg = (rad: number) => (rad * 180) / Math.PI;
const mod360 = (x: number) => ((x % 360) + 360) % 360;
const polarDeg = (p: Vec2, C: Vec2) => mod360(toDeg(Math.atan2(p.y - C.y, p.x - C.x)));

/** θ가 θ0에서 dir 방향으로 sweep 만큼 돈 구간 안(양 끝 제외)에 있는가 */
function angleWithin(theta: number, theta0: number, dir: 1 | -1, sweep: number): boolean {
  const rel = dir === 1 ? mod360(theta - theta0) : mod360(theta0 - theta);
  return rel > 1e-9 && rel < sweep - 1e-9;
}

export function buildCandidate(t: number, C: Vec2, r: number, side: Side, chordPts: Vec2[]): DetourCandidate {
  const O = { x: 0, y: 0 };
  const A = { x: t, y: t };
  const tO = tangentPoints(O, C, r);
  const tA = tangentPoints(A, C, r);
  const pickSide = (pair: { plus: Vec2; minus: Vec2 }) => (sideOf(pair.plus) === side ? pair.plus : pair.minus);
  const P = pickSide(tO);
  const Q = pickSide(tA);

  // 원이 진행 방향(O→A, 즉 (1,1))의 오른쪽에 있으면 시계방향으로 돈다.
  // 위쪽(y>x) 우회: 원은 경로의 오른쪽 → 시계(−1). 아래쪽: 반시계(+1).
  const arcDirection: 1 | -1 = side === 1 ? -1 : 1;
  const thetaPDeg = polarDeg(P, C);
  const thetaQDeg = polarDeg(Q, C);
  const sweepDeg = arcDirection === 1 ? mod360(thetaQDeg - thetaPDeg) : mod360(thetaPDeg - thetaQDeg);
  const isMajorArc = sweepDeg > 180;

  // 접선 교점 R
  const u = { x: P.x - C.x, y: P.y - C.y };
  const w = { x: Q.x - C.x, y: Q.y - C.y };
  const delta = u.x * w.y - u.y * w.x;
  const parallel = Math.abs(delta) < 1e-10 * r * r;
  let R: Vec2 | null = null;
  let CR: number | null = null;
  let cosineRatio: number | null = null;
  let lookup: CosineLookup | null = null;
  let alphaDeg: number;
  if (!parallel) {
    R = { x: C.x + (r * r * (w.y - u.y)) / delta, y: C.y + (r * r * (u.x - w.x)) / delta };
    CR = dist(R, C);
    cosineRatio = r / CR;
    lookup = lookupCosine(cosineRatio);
    alphaDeg = lookup.alphaDeg;
  } else {
    // 두 접선이 평행 → R이 무한히 멀다 → cos α → 0, α = 90°
    alphaDeg = 90;
  }
  const smallAngleDeg = 2 * alphaDeg;
  const centralAngleDeg = isMajorArc ? 360 - smallAngleDeg : smallAngleDeg;
  const arcLength = (2 * Math.PI * r * centralAngleDeg) / 360;

  const OP = Math.sqrt(Math.max(0, C.x * C.x + C.y * C.y - r * r));
  const AQ = Math.sqrt(Math.max(0, (t - C.x) ** 2 + (t - C.y) ** 2 - r * r));

  // 비행 방향 연속성: 원호의 접선 방향(진행 방향)이 O→P, Q→A 방향과 같은가
  const tangentDir = (p: Vec2): Vec2 => {
    const rx = (p.x - C.x) / r;
    const ry = (p.y - C.y) / r;
    return arcDirection === 1 ? { x: -ry, y: rx } : { x: ry, y: -rx };
  };
  const dP = tangentDir(P);
  const dQ = tangentDir(Q);
  const headingContinuousAtP = OP < 1e-12 || (dP.x * P.x + dP.y * P.y) / OP > 1 - 1e-6;
  const headingContinuousAtQ = AQ < 1e-12 || (dQ.x * (A.x - Q.x) + dQ.y * (A.y - Q.y)) / AQ > 1 - 1e-6;

  const arcAvoidsChord = chordPts.every((I) => !angleWithin(polarDeg(I, C), thetaPDeg, arcDirection, sweepDeg));

  return {
    side,
    P,
    Q,
    R,
    delta,
    OP,
    AQ,
    CR,
    cosineRatio,
    lookup,
    alphaDeg,
    smallAngleDeg,
    isMajorArc,
    centralAngleDeg,
    arcLength,
    totalLength: OP + arcLength + AQ,
    arcDirection,
    thetaPDeg,
    thetaQDeg,
    sweepDeg,
    checks: {
      tangentP: checkTangent(P, O, C, r),
      tangentQ: checkTangent(Q, A, C, r),
      headingContinuousAtP,
      headingContinuousAtQ,
      arcAvoidsChord,
      angleAgreementDeg: Math.abs(centralAngleDeg - sweepDeg),
    },
  };
}

export interface DetourOptions {
  /** b = a(동점)일 때 보여 줄 쪽. 기본: 위쪽(+1) */
  tieSide?: Side;
}

export function computeDetourMath(t: number, C: Vec2, r: number, opts: DetourOptions = {}): MathDetourResult {
  const check = intersectSegment(t, C.x, C.y, r);
  const directLength = t * Math.SQRT2;
  const A = { x: t, y: t };
  const base = { t, A, C, r, check, directLength };

  if (check.status !== 'crossing') {
    return {
      ...base,
      detourRequired: false,
      ruleSide: null,
      tie: false,
      chosen: null,
      other: null,
      ruleAgrees: null,
      totalLength: directLength,
      extraLength: 0,
      increasePct: 0,
    };
  }

  const diff = C.y - C.x; // b − a
  const tieTol = 1e-12 * Math.max(1, t);
  const tie = Math.abs(diff) <= tieTol;
  // b > a : 중심이 위 → 아래쪽(y<x) 우회,  b < a : 위쪽(y>x) 우회
  const ruleSide: Side | null = tie ? null : diff > 0 ? -1 : 1;
  const chosenSide: Side = ruleSide ?? opts.tieSide ?? 1;

  const chordPts = check.intersections;
  const chosen = buildCandidate(t, C, r, chosenSide, chordPts);
  const other = buildCandidate(t, C, r, chosenSide === 1 ? -1 : 1, chordPts);

  const lenTol = 1e-9 * Math.max(1, directLength);
  const ruleAgrees = tie
    ? Math.abs(chosen.totalLength - other.totalLength) <= lenTol * 1e3
    : chosen.totalLength <= other.totalLength + lenTol;

  const totalLength = chosen.totalLength;
  const extraLength = totalLength - directLength;
  return {
    ...base,
    detourRequired: true,
    ruleSide,
    tie,
    chosen,
    other,
    ruleAgrees,
    totalLength,
    extraLength,
    increasePct: (100 * extraLength) / directLength,
  };
}

/* ───────────────────────── 경로 샘플링 ───────────────────────── */

export type Phase = 'OP' | 'ARC' | 'QA' | 'DIRECT';

export interface PathPiece {
  phase: Phase;
  /** 이 조각이 시작되는 누적 거리 */
  start: number;
  length: number;
}

export interface SampledPath {
  pieces: PathPiece[];
  total: number;
  /** 누적 거리 s에서의 위치·진행방향(수학 좌표) */
  at: (s: number) => { p: Vec2; heading: Vec2; phase: Phase };
}

/** 수학 좌표의 경로를 누적 길이로 매개화한다. */
export function parametrizePath(res: MathDetourResult): SampledPath {
  const O = { x: 0, y: 0 };
  const A = res.A;
  const c = res.chosen;
  if (!c) {
    const L = res.directLength;
    const h = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
    return {
      pieces: [{ phase: 'DIRECT', start: 0, length: L }],
      total: L,
      at: (s) => {
        const k = Math.min(1, Math.max(0, s / L));
        return { p: { x: A.x * k, y: A.y * k }, heading: h, phase: 'DIRECT' };
      },
    };
  }
  const { C, r } = res;
  // 실제 그리는 원호는 극각 sweep을 사용 (코사인표 중심각과 일치함은 테스트로 보장)
  const arcLen = (r * c.sweepDeg * Math.PI) / 180;
  const pieces: PathPiece[] = [
    { phase: 'OP', start: 0, length: c.OP },
    { phase: 'ARC', start: c.OP, length: arcLen },
    { phase: 'QA', start: c.OP + arcLen, length: c.AQ },
  ];
  const total = c.OP + arcLen + c.AQ;
  const th0 = (c.thetaPDeg * Math.PI) / 180;
  const dirOP = c.OP > 0 ? { x: c.P.x / c.OP, y: c.P.y / c.OP } : { x: 1, y: 0 };
  const dirQA = c.AQ > 0 ? { x: (A.x - c.Q.x) / c.AQ, y: (A.y - c.Q.y) / c.AQ } : { x: 1, y: 0 };
  const at = (sRaw: number) => {
    const s = Math.min(total, Math.max(0, sRaw));
    if (s <= c.OP) {
      return { p: { x: O.x + dirOP.x * s, y: O.y + dirOP.y * s }, heading: dirOP, phase: 'OP' as Phase };
    }
    if (s <= c.OP + arcLen) {
      const th = th0 + (c.arcDirection * (s - c.OP)) / r;
      const p = { x: C.x + r * Math.cos(th), y: C.y + r * Math.sin(th) };
      const heading =
        c.arcDirection === 1 ? { x: -Math.sin(th), y: Math.cos(th) } : { x: Math.sin(th), y: -Math.cos(th) };
      return { p, heading, phase: 'ARC' as Phase };
    }
    const k = s - c.OP - arcLen;
    return { p: { x: c.Q.x + dirQA.x * k, y: c.Q.y + dirQA.y * k }, heading: dirQA, phase: 'QA' as Phase };
  };
  return { pieces, total, at };
}

/** 원호 위의 샘플점 (U(θ) = (a + r cos θ, b + r sin θ)) */
export function sampleArc(c: DetourCandidate, C: Vec2, r: number, n = 96): Vec2[] {
  const out: Vec2[] = [];
  const th0 = (c.thetaPDeg * Math.PI) / 180;
  const sw = (c.sweepDeg * Math.PI) / 180;
  for (let i = 0; i <= n; i++) {
    const th = th0 + c.arcDirection * (sw * i) / n;
    out.push({ x: C.x + r * Math.cos(th), y: C.y + r * Math.sin(th) });
  }
  return out;
}

/** 선분 PQ와 점 C 사이의 최소 거리 */
export function segmentPointDistance(P: Vec2, Q: Vec2, C: Vec2): number {
  const dx = Q.x - P.x;
  const dy = Q.y - P.y;
  const L2 = dx * dx + dy * dy;
  let k = L2 > 0 ? ((C.x - P.x) * dx + (C.y - P.y) * dy) / L2 : 0;
  k = Math.max(0, Math.min(1, k));
  return Math.hypot(P.x + k * dx - C.x, P.y + k * dy - C.y);
}
