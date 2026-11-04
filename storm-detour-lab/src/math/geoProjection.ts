/**
 * 지리 좌표(위도·경도) ↔ 인천 중심 방위정거리(azimuthal equidistant) 평면.
 *
 * - 정방향: WGS84 타원체 측지선 역문제(Inverse)로 인천 O에서 S까지의 거리 D(km)와
 *   초기 방위각 β(북쪽 기준 시계방향)를 구해 X = D sin β, Y = D cos β 로 둔다.
 * - 역방향: (X, Y) → D = √(X²+Y²), β = atan2(X, Y) → 측지선 정문제(Direct).
 *
 * 이 투영은 인천에서의 방사형 거리·방위만 보존한다. 원점을 지나는 평면 위 직선은
 * 인천을 지나는 측지선(대권 항로)에 대응한다.
 */
import { Geodesic } from 'geographiclib-geodesic';
import type { Vec2 } from './vec';

const geod = Geodesic.WGS84;

export interface LatLon {
  lat: number;
  lon: number;
}

/** 출발지 인천국제공항 (OurAirports RKSI 레코드 기준, 전처리 스크립트가 검증) */
export const ICN: LatLon = { lat: 37.469101, lon: 126.450996 };

/** 인천의 지리적 대척점까지의 측지 거리(km) — 이 거리 근처에서는 방위가 불안정하다. */
export const MAX_PLANE_RADIUS_KM = (() => {
  const r = geod.Inverse(ICN.lat, ICN.lon, -ICN.lat, ICN.lon - 180);
  return r.s12! / 1000;
})();

/** 대척점 근처 경고 기준(km): 대척점까지 남은 거리가 이 값보다 작으면 경고 */
export const ANTIPODE_WARNING_MARGIN_KM = 1500;

export interface ForwardResult extends Vec2 {
  /** 인천에서의 측지 거리 D (km) */
  distKm: number;
  /** 초기 방위각 β (도, 북쪽 기준 시계방향) */
  azimuthDeg: number;
}

/** 지리 → 인천 중심 평면 (단위 km) */
export function geoToPlane(p: LatLon, origin: LatLon = ICN): ForwardResult {
  const r = geod.Inverse(origin.lat, origin.lon, p.lat, p.lon);
  const D = r.s12! / 1000;
  const beta = r.azi1!;
  const br = (beta * Math.PI) / 180;
  return { x: D * Math.sin(br), y: D * Math.cos(br), distKm: D, azimuthDeg: beta };
}

export interface InverseResult extends LatLon {
  /** 평면 반지름이 대척점 한계를 넘었는가 (이 경우 결과는 의미가 없다) */
  beyondAntipode: boolean;
}

/** 인천 중심 평면 → 지리 */
export function planeToGeo(q: Vec2, origin: LatLon = ICN): InverseResult {
  const D = Math.hypot(q.x, q.y);
  if (D < 1e-9) return { lat: origin.lat, lon: origin.lon, beyondAntipode: false };
  const beta = (Math.atan2(q.x, q.y) * 180) / Math.PI;
  const r = geod.Direct(origin.lat, origin.lon, beta, D * 1000);
  return { lat: r.lat2!, lon: r.lon2!, beyondAntipode: D > MAX_PLANE_RADIUS_KM };
}

/** 두 지점 사이의 실제 측지 거리 (km) — 비교 표시용 */
export function geodesicDistanceKm(p: LatLon, q: LatLon): number {
  return geod.Inverse(p.lat, p.lon, q.lat, q.lon).s12! / 1000;
}

/**
 * 경도 연속화: 지도에 선을 그릴 때 날짜변경선(±180°)에서 끊기지 않도록
 * 직전 점과의 경도 차가 180°를 넘지 않게 ±360°를 더한다.
 * MapLibre는 −180~180 범위를 벗어난 경도도 이어서 그려 준다.
 */
export function unwrapLongitudes(points: LatLon[], startLon = ICN.lon): LatLon[] {
  const out: LatLon[] = [];
  let prev = startLon;
  for (const p of points) {
    let lon = p.lon;
    while (lon - prev > 180) lon -= 360;
    while (lon - prev < -180) lon += 360;
    out.push({ lat: p.lat, lon });
    prev = lon;
  }
  return out;
}
