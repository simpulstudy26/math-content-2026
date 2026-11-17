import { describe, expect, it } from 'vitest';
import { ICN, MAX_PLANE_RADIUS_KM, geoToPlane, geodesicDistanceKm, planeToGeo } from '../src/math/geoProjection';
import { buildTrip, makeTimeline, suggestStorm } from '../src/math/trip';

const close = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThan(tol);

const AIRPORTS = {
  NRT: { lat: 35.764702, lon: 140.386002 },
  JFK: { lat: 40.639447, lon: -73.779317 },
  LHR: { lat: 51.4706, lon: -0.461941 },
  GRU: { lat: -23.431944, lon: -46.467778 },
  JNB: { lat: -26.133693, lon: 28.242317 },
  AKL: { lat: -37.008099, lon: 174.792007 },
  HNL: { lat: 21.32062, lon: -157.924228 },
  LYR: { lat: 78.246101, lon: 15.4656 },
  MVD: { lat: -34.838402, lon: -56.0308 },
  CJU: { lat: 33.512058, lon: 126.492996 },
};

describe('지리 ↔ 인천 중심 평면', () => {
  it('왕복 오차 < 10 m, 평면 거리 = 측지 거리', () => {
    for (const ap of Object.values(AIRPORTS)) {
      const p = geoToPlane(ap);
      close(Math.hypot(p.x, p.y), geodesicDistanceKm(ICN, ap), 1e-6);
      close(geodesicDistanceKm(planeToGeo(p), ap), 0, 0.01);
    }
    close(MAX_PLANE_RADIUS_KM, 20003.93, 0.1);
  });
});

describe('세계 공항 여행', () => {
  for (const [code, ap] of Object.entries(AIRPORTS)) {
    for (const side of [1, -1] as const) {
      it(`${code} (태풍 ${side > 0 ? '왼쪽' : '오른쪽'}): 추천 태풍으로 탑승 가능, 경로·시간 정상`, () => {
        const st = suggestStorm(ap, side);
        const trip = buildTrip({ destination: ap, stormCenter: st.center, radius: st.radius });
        expect(trip.result.status).toBe('crossing');
        expect(trip.canFly).toBe(true);
        close(trip.t, geodesicDistanceKm(ICN, ap), 1e-6);
        // b의 부호로 방향 결정
        expect(trip.result.detour!.s).toBe(side > 0 ? -1 : 1);
        // 마지막 샘플 = 목적지
        const last = trip.samples.at(-1)!.geo;
        close(geodesicDistanceKm(last, ap), 0, 0.05);
        // 날짜변경선에서 끊기지 않음
        for (let i = 1; i < trip.samples.length; i++) {
          expect(Math.abs(trip.samples[i].geo.lon - trip.samples[i - 1].geo.lon)).toBeLessThan(10);
        }
        // 타임라인: 단조 증가, P·Q 시각에 정확히 접점 도착
        const tl = makeTimeline(trip, 240);
        let prev = -1;
        for (let k = 0; k <= 480; k++) {
          const s = tl.distanceAt(k / 2);
          expect(s).toBeGreaterThanOrEqual(prev - 1e-9);
          prev = s;
        }
        close(tl.distanceAt(tl.marks.P), trip.path.pieces[0].length, 1e-6);
        close(tl.distanceAt(tl.marks.Q), trip.path.pieces[0].length + trip.path.pieces[1].length, 1e-6);
        close(tl.distanceAt(240), trip.path.total, 1e-9);
        close(tl.timeAtDistance(trip.path.pieces[0].length), tl.marks.P, 1e-3);
      });
    }
  }

  it('대척점 근처 목적지 경고 (몬테비데오)', () => {
    const st = suggestStorm(AIRPORTS.MVD);
    const trip = buildTrip({ destination: AIRPORTS.MVD, stormCenter: st.center, radius: st.radius });
    expect(trip.warnings.some((w) => w.code === 'destNearAntipode')).toBe(true);
  });
  it('항로를 벗어난 태풍은 탑승 불가', () => {
    const trip = buildTrip({ destination: AIRPORTS.NRT, stormCenter: { lat: 10, lon: 150 }, radius: 300 });
    expect(trip.canFly).toBe(false);
    expect(trip.result.status).toBe('miss');
  });
  it('출발지와 같은 곳은 거부', () => {
    expect(() => buildTrip({ destination: ICN, stormCenter: ICN, radius: 100 })).toThrow();
  });
});
