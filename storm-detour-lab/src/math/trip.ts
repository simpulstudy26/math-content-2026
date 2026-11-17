/**
 * 한 번의 여행 = 한 문제. 발권 입력(목적지·태풍)을 받아 비행·노트·지도·엽서가 함께 쓰는
 * 단일 결과 객체를 만든다. 같은 입력이면 같은 결과 (순수 함수).
 */
import { computeDetour, parametrize, type DetourResult, type PathParam, type Phase } from './detour';
import { makeFrame, mathToPlane, planeToMath, type Frame } from './frame';
import {
  ANTIPODE_WARNING_MARGIN_KM,
  ICN,
  MAX_PLANE_RADIUS_KM,
  geoToPlane,
  planeToGeo,
  unwrapLongitudes,
  type LatLon,
} from './geoProjection';
import type { Vec2 } from './vec';

export interface TripInput {
  destination: LatLon;
  stormCenter: LatLon;
  /** km */
  radius: number;
}

export interface TripSample {
  /** 누적 거리 (km) */
  s: number;
  phase: Phase;
  math: Vec2;
  /** 진행 방향 (수학 좌표 단위벡터) */
  dir: Vec2;
  geo: LatLon;
}

export interface TripWarning {
  code: 'destNearAntipode' | 'stormBeyondAntipode' | 'stormNearAntipode' | 'thinCrossing';
  message: string;
  blocking: boolean;
}

export interface Trip {
  input: TripInput;
  frame: Frame;
  t: number;
  /** 태풍 중심의 계산 좌표 (a, b) */
  C: Vec2;
  /** 인천 중심 평면 좌표 */
  A0: Vec2;
  C0: Vec2;
  destDistanceKm: number;
  destAzimuthDeg: number;
  result: DetourResult;
  path: PathParam;
  /** 경로 위 등간격 샘플 (비행·지도 공용) */
  samples: TripSample[];
  /** 기본 직선 항로 (지도용) */
  baseRoute: LatLon[];
  /** 태풍 경계: 계산 평면의 정확한 원을 지리 좌표로 되돌린 것 */
  stormBoundary: LatLon[];
  warnings: TripWarning[];
  canFly: boolean;
  /** 계산 좌표 → 지리 */
  toGeo: (p: Vec2) => LatLon;
}

const SAMPLE_COUNT = 1600;

export function buildTrip(input: TripInput): Trip {
  const dest = geoToPlane(input.destination);
  if (dest.distKm < 1) throw new Error('목적지가 출발지(인천)와 같거나 너무 가깝습니다.');
  const frame = makeFrame(dest);
  const c0 = geoToPlane(input.stormCenter);
  const C0 = { x: c0.x, y: c0.y };
  const C = planeToMath(frame, C0);
  const t = frame.t;
  const result = computeDetour(t, C.x, C.y, input.radius);
  const path = parametrize(result);

  const toGeoRaw = (p: Vec2): LatLon => {
    const g = planeToGeo(mathToPlane(frame, p));
    return { lat: g.lat, lon: g.lon };
  };

  const mathPts: Vec2[] = [];
  const meta: { s: number; phase: Phase; dir: Vec2 }[] = [];
  for (let i = 0; i <= SAMPLE_COUNT; i++) {
    const s = (path.total * i) / SAMPLE_COUNT;
    const q = path.at(s);
    mathPts.push(q.p);
    meta.push({ s, phase: q.phase, dir: q.dir });
  }
  const geos = unwrapLongitudes(mathPts.map(toGeoRaw), ICN.lon);
  const samples: TripSample[] = mathPts.map((p, i) => ({ ...meta[i], math: p, geo: geos[i] }));

  const baseRoute = unwrapLongitudes(
    Array.from({ length: 241 }, (_, i) => toGeoRaw({ x: (t * i) / 240, y: 0 })),
    ICN.lon,
  );
  const ring: Vec2[] = Array.from({ length: 181 }, (_, i) => {
    const th = (2 * Math.PI * i) / 180;
    return { x: C.x + input.radius * Math.cos(th), y: C.y + input.radius * Math.sin(th) };
  });
  const stormBoundary = unwrapLongitudes(ring.map(toGeoRaw), input.stormCenter.lon);

  const warnings: TripWarning[] = [];
  if (ring.some((p) => Math.hypot(...Object.values(mathToPlane(frame, p))) > MAX_PLANE_RADIUS_KM)) {
    warnings.push({
      code: 'stormBeyondAntipode',
      message: '태풍 일부가 인천의 대척점 너머까지 뻗어 지도로 되돌릴 수 없습니다. 태풍을 옮기거나 줄여 주세요.',
      blocking: true,
    });
  } else if (c0.distKm + input.radius > MAX_PLANE_RADIUS_KM - ANTIPODE_WARNING_MARGIN_KM) {
    warnings.push({ code: 'stormNearAntipode', message: '태풍이 인천의 대척점 근처라 지도에서 모양이 크게 찌그러져 보입니다.', blocking: false });
  }
  if (dest.distKm > MAX_PLANE_RADIUS_KM - ANTIPODE_WARNING_MARGIN_KM) {
    warnings.push({
      code: 'destNearAntipode',
      message: `목적지가 인천의 대척점 근처입니다 (남은 거리 약 ${Math.round(MAX_PLANE_RADIUS_KM - dest.distKm).toLocaleString()} km). 계산은 그대로 맞지만 지도 위 모양이 크게 왜곡됩니다.`,
      blocking: false,
    });
  }
  if (result.status === 'crossing' && result.h! < 0.03 * input.radius) {
    warnings.push({ code: 'thinCrossing', message: '태풍이 항로를 아주 살짝만 걸칩니다. 우회 거리가 매우 짧습니다.', blocking: false });
  }

  return {
    input,
    frame,
    t,
    C,
    A0: { x: frame.A0.x, y: frame.A0.y },
    C0,
    destDistanceKm: dest.distKm,
    destAzimuthDeg: dest.azimuthDeg,
    result,
    path,
    samples,
    baseRoute,
    stormBoundary,
    warnings,
    canFly: result.status === 'crossing' && !warnings.some((w) => w.blocking),
    toGeo: toGeoRaw,
  };
}

/**
 * 추천 태풍 배치: 항로 중간쯤, 진행 방향 왼쪽(b > 0) 또는 오른쪽으로 살짝 비켜서
 * 0 < a − h < a + h < t 를 만족한다.
 */
export function suggestStorm(destination: LatLon, side: 1 | -1 = 1): { center: LatLon; radius: number } {
  const frame = makeFrame(geoToPlane(destination));
  const t = frame.t;
  const r = Math.round(Math.min(t * 0.14, 850));
  const C = { x: t * 0.52, y: side * r * 0.35 };
  const g = planeToGeo(mathToPlane(frame, C));
  return { center: { lat: g.lat, lon: g.lon }, radius: r };
}

/* ───────────── 비행 시간 배분 (감상용 3~5분) ───────────── */

export interface Timeline {
  /** ×1 속도에서 전체 비행 시간 (초) */
  duration: number;
  /** 경과 시간(초) → 누적 거리(km) — 단조 증가, 시작·끝은 천천히 */
  distanceAt: (sec: number) => number;
  /** 누적 거리 → 시간 (노트 일정 계산용) */
  timeAtDistance: (km: number) => number;
  /** 각 구간 시작 시각 */
  marks: { P: number; Q: number };
}

/** Fritsch–Carlson 단조 3차 보간 */
function monotoneCubic(xs: number[], ys: number[], endSlopes: [number, number]) {
  const n = xs.length;
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m: number[] = [endSlopes[0]];
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(endSlopes[1]);
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = m[i + 1] = 0;
      continue;
    }
    const al = m[i] / d[i];
    const be = m[i + 1] / d[i];
    const s = al * al + be * be;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      m[i] = k * al * d[i];
      m[i + 1] = k * be * d[i];
    }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const u = (x - xs[i]) / h;
    const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
    const h10 = u ** 3 - 2 * u ** 2 + u;
    const h01 = -2 * u ** 3 + 3 * u ** 2;
    const h11 = u ** 3 - u ** 2;
    return h00 * ys[i] + h10 * h * m[i] + h01 * ys[i + 1] + h11 * h * m[i + 1];
  };
}

/** 이륙 활주 거리 (km) */
export const RUNWAY_ROLL_KM = 2.6;
/** 접지 후 정지까지 (km) */
export const LANDING_ROLL_KM = 1.8;
/** 순항 고도 (km) */
export const CRUISE_ALT_KM = 10;

/**
 * 고도(km)를 누적 거리로 정한다: 활주 → 이륙 후 상승 → 순항 → 하강 → 접지.
 * 실제 비행의 상승·하강 경사(수 도)에 가깝게.
 */
export function altitudeAtDistance(s: number, total: number): number {
  const up = s <= RUNWAY_ROLL_KM ? 0 : CRUISE_ALT_KM * (1 - Math.exp(-(s - RUNWAY_ROLL_KM) / 55)) * smoothUnit((s - RUNWAY_ROLL_KM) / 2.5);
  const dEnd = total - s - LANDING_ROLL_KM;
  const down = dEnd <= 0 ? 0 : CRUISE_ALT_KM * (1 - Math.exp(-dEnd / 75)) * smoothUnit(dEnd / 1.5);
  return Math.max(0, Math.min(up, down, CRUISE_ALT_KM));
}
function smoothUnit(u: number) {
  const x = Math.min(1, Math.max(0, u));
  return x * x * (3 - 2 * x);
}

export function makeTimeline(trip: Trip, duration = 240): Timeline {
  const pcs = trip.path.pieces;
  const total = trip.path.total;
  if (pcs.length < 3) {
    const f = monotoneCubic([0, duration], [0, total], [0, 0]);
    return { duration, distanceAt: f, timeAtDistance: (km) => (km / total) * duration, marks: { P: duration, Q: duration } };
  }
  // 원호 구간은 짧아도 감상할 수 있도록 일정 비율의 시간을 보장한다.
  // 시작은 활주로 이륙 활주(천천히), 끝은 착륙 후 감속.
  const tP = duration * 0.44;
  const tQ = duration * 0.72;
  const L1 = pcs[0].length;
  const L12 = L1 + pcs[1].length;
  const L3 = pcs[2].length;
  const roll = Math.min(RUNWAY_ROLL_KM, L1 * 0.2);
  const climb = Math.max(roll + 1, Math.min(70, L1 * 0.35));
  const approach = Math.max(total - L3 * 0.5, Math.min(total - 110, total - 5));
  const flare = Math.max(approach + 0.5, total - LANDING_ROLL_KM);
  const xs = [0, duration * 0.07, duration * 0.12, tP, tQ, duration * 0.86, duration * 0.95, duration];
  const ys = [0, roll, climb, L1, L12, Math.max(L12 + 1e-3, approach), Math.max(L12 + 2e-3, flare), total];
  const f = monotoneCubic(xs, ys, [0, 0]);
  const timeAtDistance = (km: number) => {
    let lo = 0;
    let hi = duration;
    for (let k = 0; k < 50; k++) {
      const mid = (lo + hi) / 2;
      if (f(mid) < km) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  return { duration, distanceAt: f, timeAtDistance, marks: { P: tP, Q: tQ } };
}
