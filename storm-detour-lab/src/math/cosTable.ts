/**
 * 0°~90° 코사인표 (1° 간격, 소수점 아래 8자리) 와 두 행을 잇는 일차함수 보간 (문서 7장·부록).
 * 역삼각함수를 쓰지 않는다. Math.cos 는 표를 "만드는" 데만 쓴다.
 */

export interface CosRow {
  deg: number;
  cos: number;
}

export const COS_TABLE: CosRow[] = Array.from({ length: 91 }, (_, deg) => ({
  deg,
  cos: Math.round(Math.cos((deg * Math.PI) / 180) * 1e8) / 1e8,
}));

export interface Interpolation {
  /** 목표값 z = r / CR */
  z: number;
  /** z를 끼우는 두 행: lower.cos ≥ z ≥ upper.cos, upper.deg = lower.deg + 1 */
  lower: CosRow;
  upper: CosRow;
  /** 두 점을 지나는 일차함수 y = m x + n */
  m: number;
  n: number;
  /** z가 표의 값과 정확히 같은가 (보간 불필요) */
  exactHit: boolean;
  /** 보간 근삿값 α̂ (도) */
  alphaHat: number;
}

export function interpolateAlpha(zRaw: number): Interpolation {
  const z = Math.min(1, Math.max(0, zRaw));
  let k = 0;
  while (k < 89 && COS_TABLE[k + 1].cos >= z) k++;
  const lower = COS_TABLE[k];
  const upper = COS_TABLE[k + 1];
  const m = (upper.cos - lower.cos) / (upper.deg - lower.deg);
  const n = lower.cos - m * lower.deg;
  const hitRow = COS_TABLE.find((r) => r.cos === z);
  const alphaHat = hitRow ? hitRow.deg : (z - n) / m;
  return { z, lower, upper, m, n, exactHit: !!hitRow, alphaHat };
}

/** 1° 표 보간 오차의 이론적 최댓값 (도) — 문서 8-3: 약 0.249995° */
export const MAX_INTERP_ERROR_DEG = 0.25;
