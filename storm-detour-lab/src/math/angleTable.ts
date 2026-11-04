/**
 * 중3 코사인 삼각비표 (명세 9-2).
 *
 * 교육 단계에서는 역삼각함수(acos)를 쓰지 않는다. 대신
 *  ① 0°~90°의 코사인표(1° 간격, 교과서처럼 소수 넷째 자리)를 만들고
 *  ② 표에서 cos 값이 목표값 r/d를 끼고 있는 두 행을 찾아 "선형보간 근삿값"을 구한 뒤
 *  ③ 같은 원리(cos는 0°~90°에서 감소)로 구간을 절반씩 좁히는 이분 탐색으로 정밀값을 얻는다.
 * cos 값 자체는 Math.cos로 계산한다 — 이것은 "표를 만드는" 일이다.
 */

export interface CosRow {
  deg: number;
  cos: number;
}

const DEG = Math.PI / 180;
export const cosDeg = (deg: number): number => Math.cos(deg * DEG);

/** 교과서형 코사인표: 0°, 1°, …, 90° (소수 넷째 자리 반올림) */
export const COSINE_TABLE: CosRow[] = Array.from({ length: 91 }, (_, deg) => ({
  deg,
  cos: Math.round(cosDeg(deg) * 10000) / 10000,
}));

export interface BisectionStep {
  lo: number;
  hi: number;
  mid: number;
  cosMid: number;
}

export interface CosineLookup {
  /** 찾는 값 cos α = target */
  target: number;
  /** 표에서 target을 끼는 두 행 (lower.deg ≤ α ≤ upper.deg) */
  lower: CosRow;
  upper: CosRow;
  /** 주변 행들 (표 표시용) */
  nearbyRows: CosRow[];
  /** 표 두 행 사이 선형보간 근삿값 */
  interpolatedDeg: number;
  /** 이분 탐색 최종값 */
  alphaDeg: number;
  /** 이분 탐색 과정 (앞부분만 보여 주기 위해 모두 저장) */
  steps: BisectionStep[];
}

/**
 * cos α = target (0 ≤ target ≤ 1) 을 만족하는 α (0°~90°)를 표 역조회 + 이분 탐색으로 찾는다.
 */
export function lookupCosine(target: number, tolDeg = 1e-10, maxIter = 80): CosineLookup {
  const tg = Math.min(1, Math.max(0, target));

  // ① 표에서 끼는 행 찾기 (cos는 감소)
  let i = 0;
  while (i < 90 && COSINE_TABLE[i + 1].cos >= tg) i++;
  const lower = COSINE_TABLE[i];
  const upper = COSINE_TABLE[Math.min(90, i + 1)];

  // ② 선형보간
  let interpolatedDeg = lower.deg;
  if (upper.deg !== lower.deg && lower.cos !== upper.cos) {
    interpolatedDeg = lower.deg + ((lower.cos - tg) / (lower.cos - upper.cos)) * (upper.deg - lower.deg);
  }

  // ③ 이분 탐색: [0°, 90°]에서 cos(mid)와 target 비교
  let lo = 0;
  let hi = 90;
  const steps: BisectionStep[] = [];
  for (let k = 0; k < maxIter && hi - lo > tolDeg; k++) {
    const mid = (lo + hi) / 2;
    const cm = cosDeg(mid);
    steps.push({ lo, hi, mid, cosMid: cm });
    if (cm > tg) lo = mid; // cos(mid)가 크다 → 각이 더 커야 함
    else hi = mid;
  }
  const alphaDeg = (lo + hi) / 2;

  const from = Math.max(0, i - 2);
  const to = Math.min(90, i + 3);
  return {
    target: tg,
    lower,
    upper,
    nearbyRows: COSINE_TABLE.slice(from, to + 1),
    interpolatedDeg,
    alphaDeg,
    steps,
  };
}
