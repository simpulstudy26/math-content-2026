/**
 * 앱 전체가 공유하는 단일 결과 객체 (명세 17장).
 * 같은 입력이면 같은 결과를 반환하는 순수 함수. 지도·수학 패널·미니뷰·비행 애니메이션은
 * 모두 이 객체의 값만 읽는다 (UI에서 다시 계산하지 않는다).
 */
import {
  computeDetourMath,
  parametrizePath,
  sampleArc,
  segmentPointDistance,
  type DetourCandidate,
  type MathDetourResult,
  type Phase,
  type Side,
} from './detour';
import { frameAngles, makeFrame, mathToPlane, planeToMath, type Frame45 } from './frame45';
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

export interface ScenarioInput {
  destinationAirportId: string;
  destination: LatLon;
  stormCenterLatLon: LatLon;
  /** 태풍 반지름 r (km, 수학 평면 단위) */
  radius: number;
  tieSide?: Side;
}

export interface FlightFrame {
  /** 누적 거리 (km) */
  s: number;
  phase: Phase;
  math: Vec2;
  geo: LatLon;
}

export interface ScenarioWarning {
  code:
    | 'destNearAntipode'
    | 'stormNearAntipode'
    | 'stormBeyondAntipode'
    | 'highLatitude'
    | 'crossesDateline'
    | 'nearTangent'
    | 'majorArcOther';
  message: string;
  /** true 면 시뮬레이션 시작을 막는다 */
  blocking: boolean;
}

export interface ScenarioResult {
  input: ScenarioInput;
  coords: {
    t: number;
    A: Vec2;
    C: Vec2;
    /** 인천 중심 방위정거리 평면 좌표 */
    A0: Vec2;
    C0: Vec2;
    destDistanceKm: number;
    destAzimuthDeg: number;
    rotationBasis: { e: Vec2; n: Vec2; headingFromEastDeg: number; rotationDeg: number };
    frame: Frame45;
  };
  math: MathDetourResult;
  check: MathDetourResult['check'];
  path: {
    side: Side | null;
    chosen: DetourCandidate | null;
    other: DetourCandidate | null;
    directLength: number;
    totalLength: number;
    extraLength: number;
    increasePct: number;
  };
  render: {
    baseRoute: LatLon[];
    segmentOP: LatLon[];
    arcPQSamples: LatLon[];
    segmentQA: LatLon[];
    /** 다른 쪽 후보 (비교용) */
    otherRoute: LatLon[];
    stormBoundary: LatLon[];
    /** 수학 좌표 샘플 (미니뷰용) */
    mathArc: Vec2[];
    mathOtherArc: Vec2[];
    flightFramePositions: FlightFrame[];
    totalPathLength: number;
  };
  invariants: {
    rotationLengthError: number;
    arcSamplesOutside: boolean;
    straightSegmentsOutside: boolean;
    minClearance: number;
  };
  warnings: ScenarioWarning[];
  /** 시뮬레이션 시작 가능 여부 */
  canFly: boolean;
}

const lerp = (p: Vec2, q: Vec2, k: number): Vec2 => ({ x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k });

function densify(p: Vec2, q: Vec2, maxStepKm: number): Vec2[] {
  const L = Math.hypot(q.x - p.x, q.y - p.y);
  const n = Math.max(2, Math.ceil(L / maxStepKm));
  return Array.from({ length: n + 1 }, (_, i) => lerp(p, q, i / n));
}

export const FLIGHT_FRAME_COUNT = 900;

export function computeScenario(input: ScenarioInput): ScenarioResult {
  const dest = geoToPlane(input.destination);
  if (dest.distKm < 0.5) throw new Error('목적지가 출발지(인천)와 같거나 너무 가깝습니다.');
  const frame = makeFrame(dest);
  const C0f = geoToPlane(input.stormCenterLatLon);
  const C0 = { x: C0f.x, y: C0f.y };
  const C = planeToMath(frame, C0);
  const t = frame.t;
  const m = computeDetourMath(t, C, input.radius, { tieSide: input.tieSide });

  const toGeo = (p: Vec2) => planeToGeo(mathToPlane(frame, p));
  const toGeoList = (pts: Vec2[], startLon = ICN.lon) =>
    unwrapLongitudes(
      pts.map((p) => {
        const g = toGeo(p);
        return { lat: g.lat, lon: g.lon };
      }),
      startLon,
    );

  const O = { x: 0, y: 0 };
  const A = { x: t, y: t };
  const step = Math.max(20, frame.L / 200);
  const baseRoute = toGeoList(densify(O, A, step));

  let segmentOP: LatLon[] = [];
  let arcPQSamples: LatLon[] = [];
  let segmentQA: LatLon[] = [];
  let otherRoute: LatLon[] = [];
  let mathArc: Vec2[] = [];
  let mathOtherArc: Vec2[] = [];
  const c = m.chosen;
  if (c) {
    mathArc = sampleArc(c, C, input.radius, 128);
    const combined = [...densify(O, c.P, step), ...mathArc.slice(1), ...densify(c.Q, A, step).slice(1)];
    const all = toGeoList(combined);
    const n1 = densify(O, c.P, step).length;
    const n2 = mathArc.length - 1;
    segmentOP = all.slice(0, n1);
    arcPQSamples = all.slice(n1 - 1, n1 + n2);
    segmentQA = all.slice(n1 + n2 - 1);
    if (m.other) {
      mathOtherArc = sampleArc(m.other, C, input.radius, 160);
      otherRoute = toGeoList([
        ...densify(O, m.other.P, step),
        ...mathOtherArc.slice(1),
        ...densify(m.other.Q, A, step).slice(1),
      ]);
    }
  }

  // 태풍 경계: 수학 평면의 정확한 원을 역투영
  const stormMath: Vec2[] = Array.from({ length: 181 }, (_, i) => {
    const th = (2 * Math.PI * i) / 180;
    return { x: C.x + input.radius * Math.cos(th), y: C.y + input.radius * Math.sin(th) };
  });
  const stormBeyondAntipode = stormMath.some((p) => Math.hypot(p.x, p.y) > MAX_PLANE_RADIUS_KM);
  const stormCenterGeo = toGeo(C);
  const stormBoundary = toGeoList(stormMath, stormCenterGeo.lon);

  // 비행 프레임: 누적 길이에 비례하는 등간격 샘플
  const param = parametrizePath(m);
  const frames: FlightFrame[] = [];
  const mathPts: Vec2[] = [];
  const phases: Phase[] = [];
  const ss: number[] = [];
  for (let i = 0; i <= FLIGHT_FRAME_COUNT; i++) {
    const s = (param.total * i) / FLIGHT_FRAME_COUNT;
    const q = param.at(s);
    mathPts.push(q.p);
    phases.push(q.phase);
    ss.push(s);
  }
  const geoFrames = toGeoList(mathPts);
  for (let i = 0; i < mathPts.length; i++) {
    frames.push({ s: ss[i], phase: phases[i], math: mathPts[i], geo: geoFrames[i] });
  }

  // 불변식 검사
  const back = mathToPlane(frame, A);
  const rotationLengthError = Math.hypot(back.x - frame.A0.x, back.y - frame.A0.y);
  const tol = 1e-7 * Math.max(1, input.radius);
  let minClearance = Infinity;
  let arcSamplesOutside = true;
  let straightSegmentsOutside = true;
  if (c) {
    for (const p of mathPts) {
      minClearance = Math.min(minClearance, Math.hypot(p.x - C.x, p.y - C.y) - input.radius);
    }
    arcSamplesOutside = mathArc.every((p) => Math.hypot(p.x - C.x, p.y - C.y) >= input.radius - tol);
    straightSegmentsOutside =
      segmentPointDistance(O, c.P, C) >= input.radius - tol && segmentPointDistance(c.Q, A, C) >= input.radius - tol;
  }

  // 경고
  const warnings: ScenarioWarning[] = [];
  if (dest.distKm > MAX_PLANE_RADIUS_KM - ANTIPODE_WARNING_MARGIN_KM) {
    warnings.push({
      code: 'destNearAntipode',
      message: `목적지가 인천의 대척점 근처입니다 (대척점까지 약 ${Math.round(MAX_PLANE_RADIUS_KM - dest.distKm)} km). 방위가 불안정해 지도 위 태풍 모양이 크게 왜곡됩니다. 수학 평면 계산은 그대로 유효합니다.`,
      blocking: false,
    });
  }
  if (stormBeyondAntipode) {
    warnings.push({
      code: 'stormBeyondAntipode',
      message: '태풍 원의 일부가 인천 대척점 한계(평면 반지름 약 20,004 km)를 넘습니다. 지도로 되돌릴 수 없으므로 태풍을 옮기거나 줄이세요.',
      blocking: true,
    });
  } else if (C0f.distKm + input.radius > MAX_PLANE_RADIUS_KM - ANTIPODE_WARNING_MARGIN_KM) {
    warnings.push({
      code: 'stormNearAntipode',
      message: '태풍이 인천 대척점에 가까워 지도 위 경계가 크게 왜곡됩니다.',
      blocking: false,
    });
  }
  const allLats = [...baseRoute, ...stormBoundary, ...segmentOP, ...arcPQSamples, ...segmentQA].map((p) => p.lat);
  if (allLats.some((la) => Math.abs(la) > 80)) {
    warnings.push({
      code: 'highLatitude',
      message: '경로 또는 태풍이 극지방(위도 80° 이상)을 지납니다. 메르카토르 지도에서는 크게 늘어나 보이므로 지구본 보기를 권장합니다.',
      blocking: false,
    });
  }
  if ([...baseRoute, ...geoFrames].some((p) => p.lon > 180 || p.lon < -180)) {
    warnings.push({
      code: 'crossesDateline',
      message: '경로가 날짜변경선(경도 180°)을 지납니다. 지도에서는 선을 끊지 않고 이어서 그립니다.',
      blocking: false,
    });
  }
  if (m.check.status === 'crossing') {
    const sq = Math.sqrt(Math.max(0, m.check.discriminant));
    if (sq < 0.02 * input.radius) {
      warnings.push({
        code: 'nearTangent',
        message: '태풍이 항로에 거의 접해 있습니다. 우회 거리는 아주 작고, 수치 오차에 민감할 수 있습니다.',
        blocking: false,
      });
    }
  }
  if (m.other?.isMajorArc) {
    warnings.push({
      code: 'majorArcOther',
      message: `반대쪽 후보의 원호는 180°보다 큰 큰 호입니다 (중심각 = 360° − 2α′ ≈ ${m.other.centralAngleDeg.toFixed(2)}°).`,
      blocking: false,
    });
  }

  const blocking = warnings.some((w) => w.blocking);
  // 명세 1장: 태풍이 선분 OA 내부를 두 점에서 가로지를 때만 회피 비행을 시작할 수 있다.
  const canFly = !blocking && m.check.status === 'crossing';

  const ang = frameAngles(frame);
  return {
    input,
    coords: {
      t,
      A,
      C,
      A0: { x: frame.A0.x, y: frame.A0.y },
      C0,
      destDistanceKm: dest.distKm,
      destAzimuthDeg: dest.azimuthDeg,
      rotationBasis: { e: frame.e, n: frame.n, ...ang },
      frame,
    },
    math: m,
    check: m.check,
    path: {
      side: c?.side ?? null,
      chosen: c,
      other: m.other,
      directLength: m.directLength,
      totalLength: m.totalLength,
      extraLength: m.extraLength,
      increasePct: m.increasePct,
    },
    render: {
      baseRoute,
      segmentOP,
      arcPQSamples,
      segmentQA,
      otherRoute,
      stormBoundary,
      mathArc,
      mathOtherArc,
      flightFramePositions: frames,
      totalPathLength: param.total,
    },
    invariants: {
      rotationLengthError,
      arcSamplesOutside,
      straightSegmentsOutside,
      minClearance: c ? minClearance : NaN,
    },
    warnings,
    canFly,
  };
}

/**
 * 자동 태풍 배치 (명세 4-3): C = (t/2, t/2) 근처, 0 < r < t/√2.
 * 우회 방향이 보이도록 중심을 수직 방향으로 r의 일정 비율만큼 비켜 놓는다 (d < r 유지).
 * 반환값은 지리 좌표 중심과 반지름(km).
 */
export function autoStorm(destination: LatLon, offsetRatio = 0.3): { center: LatLon; radius: number } {
  const dest = geoToPlane(destination);
  const frame = makeFrame(dest);
  const t = frame.t;
  const L = frame.L;
  // t/√2 = L/2 보다 충분히 작게, 너무 거대하지 않게
  const r = Math.min(L * 0.16, 900);
  const off = (offsetRatio * r) / Math.SQRT2; // (a−b) = 2·off → d = |a−b|/√2 = √2·off = 0.3r < r
  const C = { x: t / 2 + off, y: t / 2 - off };
  const g = planeToGeo(mathToPlane(frame, C));
  return { center: { lat: g.lat, lon: g.lon }, radius: Math.round(r) };
}

/** 지도 클릭 등: 지리 → 수학 좌표 (현재 목적지 기준) */
export function geoToMath(destination: LatLon, p: LatLon): Vec2 {
  const frame = makeFrame(geoToPlane(destination));
  return planeToMath(frame, geoToPlane(p));
}
