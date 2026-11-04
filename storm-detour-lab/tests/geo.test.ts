import { describe, expect, it } from 'vitest';
import { ICN, MAX_PLANE_RADIUS_KM, geoToPlane, geodesicDistanceKm, planeToGeo } from '../src/math/geoProjection';
import { autoStorm, computeScenario } from '../src/math/scenario';

const close = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThan(tol);

/** 서로 다른 국가·날짜변경선·고위도·대척점 근처 공항 (OurAirports 좌표) */
const AIRPORTS = {
  NRT: { lat: 35.764702, lon: 140.386002 },
  JFK: { lat: 40.639447, lon: -73.779317 },
  LHR: { lat: 51.4706, lon: -0.461941 },
  GRU: { lat: -23.431944, lon: -46.467778 },
  JNB: { lat: -26.133693, lon: 28.242317 },
  AKL: { lat: -37.008099, lon: 174.792007 },
  SCL: { lat: -33.393001, lon: -70.785797 },
  NAN: { lat: -17.755399, lon: 177.442993 }, // 피지, 날짜변경선 근처
  HNL: { lat: 21.32062, lon: -157.924228 },
  LYR: { lat: 78.246101, lon: 15.4656 }, // 스발바르, 고위도
  MVD: { lat: -34.838402, lon: -56.0308 }, // 몬테비데오, 인천 대척점 근처
  GMP: { lat: 37.5583, lon: 126.791 },
};

describe('지리 ↔ 인천 중심 방위정거리 평면', () => {
  it('인천 = (0,0)', () => {
    const p = geoToPlane(ICN);
    close(p.x, 0, 1e-6);
    close(p.y, 0, 1e-6);
  });
  it('평면 거리 L = 측지 거리 D, 왕복 오차 < 1 m', () => {
    for (const [code, ap] of Object.entries(AIRPORTS)) {
      const p = geoToPlane(ap);
      close(Math.hypot(p.x, p.y), geodesicDistanceKm(ICN, ap), 1e-6);
      const g = planeToGeo(p);
      close(geodesicDistanceKm(g, ap), 0, code === 'MVD' ? 0.01 : 0.001);
    }
  });
  it('대척점 한계 ≈ 20,004 km', () => {
    close(MAX_PLANE_RADIUS_KM, 20003.93, 0.1);
  });
});

describe('세계 공항 시나리오: 항상 A=(t,t)', () => {
  for (const [code, ap] of Object.entries(AIRPORTS)) {
    it(`${code}: 자동 태풍 → 교차, 경로·불변식 유지`, () => {
      const st = autoStorm(ap);
      const res = computeScenario({
        destinationAirportId: code,
        destination: ap,
        stormCenterLatLon: st.center,
        radius: st.radius,
      });
      close(res.coords.A.x, res.coords.t, 1e-6);
      close(res.coords.A.y, res.coords.t, 1e-6);
      expect(res.coords.t).toBeGreaterThan(0);
      close(res.coords.t * Math.SQRT2, geodesicDistanceKm(ICN, ap), 1e-5);
      expect(res.check.status).toBe('crossing');
      expect(res.path.chosen!.side).toBe(res.coords.C.y > res.coords.C.x ? -1 : 1);
      expect(res.invariants.arcSamplesOutside).toBe(true);
      expect(res.invariants.straightSegmentsOutside).toBe(true);
      expect(res.invariants.minClearance).toBeGreaterThan(-1e-6);
      expect(res.invariants.rotationLengthError).toBeLessThan(1e-6);
      close(res.render.totalPathLength, res.path.totalLength, 1e-6);
      // 비행 프레임 끝 = 목적지
      const last = res.render.flightFramePositions.at(-1)!.geo;
      close(geodesicDistanceKm({ lat: last.lat, lon: last.lon }, ap), 0, 0.01);
      // 지도용 선이 날짜변경선에서 끊기지 않음 (연속 경도 차 < 180°)
      const lines = [res.render.baseRoute, res.render.segmentOP, res.render.arcPQSamples, res.render.segmentQA];
      for (const ln of lines) {
        for (let i = 1; i < ln.length; i++) expect(Math.abs(ln[i].lon - ln[i - 1].lon)).toBeLessThan(180);
      }
      expect(res.canFly).toBe(true);
    });
  }

  it('날짜변경선 경고: 호놀룰루·뉴욕은 경고, 피지(동경 177°)는 경고 없음', () => {
    const fj = autoStorm(AIRPORTS.NAN);
    const fres = computeScenario({ destinationAirportId: 'NAN', destination: AIRPORTS.NAN, stormCenterLatLon: fj.center, radius: fj.radius });
    expect(fres.warnings.some((w) => w.code === 'crossesDateline')).toBe(false);
    for (const ap of [AIRPORTS.HNL, AIRPORTS.JFK]) {
      const st = autoStorm(ap);
      const res = computeScenario({ destinationAirportId: 'x', destination: ap, stormCenterLatLon: st.center, radius: st.radius });
      expect(res.warnings.some((w) => w.code === 'crossesDateline')).toBe(true);
    }
  });
  it('대척점 근처 경고 (몬테비데오)', () => {
    const st = autoStorm(AIRPORTS.MVD);
    const res = computeScenario({ destinationAirportId: 'MVD', destination: AIRPORTS.MVD, stormCenterLatLon: st.center, radius: st.radius });
    expect(res.warnings.some((w) => w.code === 'destNearAntipode')).toBe(true);
  });
  it('출발지와 같은 공항은 거부', () => {
    expect(() =>
      computeScenario({ destinationAirportId: 'ICN', destination: ICN, stormCenterLatLon: ICN, radius: 100 }),
    ).toThrow();
  });
  it('같은 입력 → 같은 결과 (결정적)', () => {
    const st = autoStorm(AIRPORTS.LHR);
    const inp = { destinationAirportId: 'LHR', destination: AIRPORTS.LHR, stormCenterLatLon: st.center, radius: st.radius };
    const a = computeScenario(inp);
    const b = computeScenario(inp);
    expect(a.path.totalLength).toBe(b.path.totalLength);
    expect(a.path.chosen!.alphaDeg).toBe(b.path.chosen!.alphaDeg);
  });
});
