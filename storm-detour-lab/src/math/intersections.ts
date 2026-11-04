/**
 * 직선 y = x (선분 OA)와 태풍 원 (x−a)² + (y−b)² = r² 의 관계 (명세 4장).
 */

export type CollisionStatus =
  | 'crossing' // 선분 OA 내부의 서로 다른 두 점에서 가로지름 → 우회 필요
  | 'tangent' // 직선에 접함 → 우회 불필요
  | 'miss' // 직선과 만나지 않음 → 우회 불필요
  | 'outsideSegment' // 무한 직선만 교차, 선분 OA 밖에서 → 우회 불필요
  | 'endpointInside' // 출발지 또는 목적지가 원 안(또는 위) → 태풍 수정 필요
  | 'invalidRadius'; // r ≤ 0

export interface IntersectionResult {
  status: CollisionStatus;
  /** 중심 C에서 y=x까지 거리 |a−b|/√2 */
  lineDistance: number;
  /** 판별식 2r² − (a−b)² */
  discriminant: number;
  uMinus: number | null;
  uPlus: number | null;
  /** I− = (u−, u−), I+ = (u+, u+) */
  intersections: { x: number; y: number }[];
  /** |OC|² − r², |AC|² − r² (양수여야 원 밖) */
  originPower: number;
  destPower: number;
  originInside: boolean;
  destInside: boolean;
}

export function intersectSegment(t: number, a: number, b: number, r: number): IntersectionResult {
  const lineDistance = Math.abs(a - b) / Math.SQRT2;
  const discriminant = 2 * r * r - (a - b) * (a - b);
  const originPower = a * a + b * b - r * r;
  const destPower = (t - a) * (t - a) + (t - b) * (t - b) - r * r;
  const scaleTol = 1e-12 * Math.max(1, r * r, t * t);
  const originInside = originPower <= scaleTol;
  const destInside = destPower <= scaleTol;

  const base = {
    lineDistance,
    discriminant,
    originPower,
    destPower,
    originInside,
    destInside,
  };

  if (!(r > 0)) {
    return { ...base, status: 'invalidRadius', uMinus: null, uPlus: null, intersections: [] };
  }

  let uMinus: number | null = null;
  let uPlus: number | null = null;
  const intersections: { x: number; y: number }[] = [];
  if (discriminant > scaleTol) {
    const sq = Math.sqrt(discriminant);
    uMinus = (a + b - sq) / 2;
    uPlus = (a + b + sq) / 2;
    intersections.push({ x: uMinus, y: uMinus }, { x: uPlus, y: uPlus });
  } else if (Math.abs(discriminant) <= scaleTol) {
    uMinus = uPlus = (a + b) / 2;
    intersections.push({ x: uMinus, y: uMinus });
  }

  if (originInside || destInside) {
    return { ...base, status: 'endpointInside', uMinus, uPlus, intersections };
  }
  if (discriminant < -scaleTol) {
    return { ...base, status: 'miss', uMinus, uPlus, intersections };
  }
  if (Math.abs(discriminant) <= scaleTol) {
    return { ...base, status: 'tangent', uMinus, uPlus, intersections };
  }
  const inside = 0 < uMinus! && uMinus! < uPlus! && uPlus! < t;
  return { ...base, status: inside ? 'crossing' : 'outsideSegment', uMinus, uPlus, intersections };
}

export const STATUS_LABEL: Record<CollisionStatus, string> = {
  crossing: '통과 — 선분 OA가 태풍을 두 점에서 가로지름 (우회 계산 가능)',
  tangent: '접함 — 판별식 0, 우회 불필요',
  miss: '닿지 않음 — 우회 불필요',
  outsideSegment: '선분 밖에서만 교차 — 우회 불필요',
  endpointInside: '출발지 또는 목적지가 태풍 안 — 태풍 위치·반지름 수정 필요',
  invalidRadius: '반지름이 0 이하 — 태풍 수정 필요',
};
