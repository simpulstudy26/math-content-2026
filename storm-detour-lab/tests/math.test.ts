import { describe, expect, it } from 'vitest';
import { COSINE_TABLE, lookupCosine } from '../src/math/angleTable';
import { computeDetourMath, parametrizePath, sampleArc, segmentPointDistance } from '../src/math/detour';
import { makeFrame, mathToPlane, planeToMath } from '../src/math/frame45';
import { intersectSegment } from '../src/math/intersections';
import { checkTangent, tangentPoints } from '../src/math/tangents';

const close = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe('명세 11장 수치 예제: O=(0,0), A=(6,6), C=(3,3), r=√2', () => {
  const res = computeDetourMath(6, { x: 3, y: 3 }, Math.SQRT2);

  it('교점 (2,2), (4,4)', () => {
    expect(res.check.status).toBe('crossing');
    close(res.check.uMinus!, 2, 1e-12);
    close(res.check.uPlus!, 4, 1e-12);
  });
  it('OP = AQ = 4, CR = 3/2', () => {
    const c = res.chosen!;
    close(c.OP, 4, 1e-12);
    close(c.AQ, 4, 1e-12);
    close(c.CR!, 1.5, 1e-12);
    close(c.cosineRatio!, (2 * Math.SQRT2) / 3, 1e-12);
  });
  it('α ≈ 19.471221°, 중심각 ≈ 38.942441°', () => {
    const c = res.chosen!;
    close(c.alphaDeg, 19.471221, 1e-6);
    close(c.centralAngleDeg, 38.942441, 1e-6);
    expect(c.isMajorArc).toBe(false);
  });
  it('호 ≈ 0.961204, 총거리 ≈ 8.961204, 추가 ≈ 0.475923', () => {
    close(res.chosen!.arcLength, 0.961204, 1e-6);
    close(res.totalLength, 8.961204, 1e-6);
    close(res.directLength, 8.485281, 1e-6);
    close(res.extraLength, 0.475923, 1e-6);
  });
  it('b = a → 동점, 양쪽 길이 동일', () => {
    expect(res.tie).toBe(true);
    close(res.chosen!.totalLength, res.other!.totalLength, 1e-9);
    expect(res.chosen!.side).not.toBe(res.other!.side);
  });
});

function assertCandidateInvariants(res: ReturnType<typeof computeDetourMath>) {
  for (const c of [res.chosen!, res.other!]) {
    expect(c.checks.tangentP.radiusError).toBeLessThan(1e-9);
    expect(c.checks.tangentQ.radiusError).toBeLessThan(1e-9);
    expect(c.checks.tangentP.perpendicularityError).toBeLessThan(1e-9);
    expect(c.checks.tangentQ.perpendicularityError).toBeLessThan(1e-9);
    expect(c.checks.headingContinuousAtP).toBe(true);
    expect(c.checks.headingContinuousAtQ).toBe(true);
    expect(c.checks.arcAvoidsChord).toBe(true);
    expect(c.checks.angleAgreementDeg).toBeLessThan(1e-6);
    // P, Q가 같은 쪽
    expect(Math.sign(c.P.y - c.P.x)).toBe(c.side);
    expect(Math.sign(c.Q.y - c.Q.x)).toBe(c.side);
    // 원호 샘플이 원 안으로 들어가지 않음
    for (const p of sampleArc(c, res.C, res.r, 200)) {
      expect(Math.hypot(p.x - res.C.x, p.y - res.C.y)).toBeGreaterThan(res.r - 1e-9);
    }
    expect(segmentPointDistance({ x: 0, y: 0 }, c.P, res.C)).toBeGreaterThan(res.r - 1e-9);
    expect(segmentPointDistance(c.Q, res.A, res.C)).toBeGreaterThan(res.r - 1e-9);
  }
}

describe('우회 방향 (명세 6장)', () => {
  it('b > a → y<x 쪽(아래)이 짧은 우회', () => {
    const res = computeDetourMath(6, { x: 2.8, y: 3.3 }, 1.2);
    expect(res.check.status).toBe('crossing');
    expect(res.ruleSide).toBe(-1);
    expect(res.chosen!.side).toBe(-1);
    expect(res.ruleAgrees).toBe(true);
    expect(res.chosen!.totalLength).toBeLessThan(res.other!.totalLength);
    assertCandidateInvariants(res);
  });
  it('b < a → y>x 쪽(위)이 짧은 우회', () => {
    const res = computeDetourMath(6, { x: 3.4, y: 2.9 }, 1.1);
    expect(res.ruleSide).toBe(1);
    expect(res.chosen!.side).toBe(1);
    expect(res.ruleAgrees).toBe(true);
    assertCandidateInvariants(res);
  });
  it('b = a → 동점, 표시 방향만 바꿀 수 있음', () => {
    const up = computeDetourMath(10, { x: 5, y: 5 }, 2, { tieSide: 1 });
    const down = computeDetourMath(10, { x: 5, y: 5 }, 2, { tieSide: -1 });
    expect(up.chosen!.side).toBe(1);
    expect(down.chosen!.side).toBe(-1);
    close(up.totalLength, down.totalLength, 1e-9);
  });
  it('무작위 유효 태풍 500개에서 b−a 규칙 = 실제 두 후보 비교', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let n = 0;
    for (let i = 0; i < 4000 && n < 500; i++) {
      const t = 1 + rnd() * 20;
      const a = rnd() * t;
      const b = rnd() * t;
      const r = 0.05 + rnd() * t * 0.7;
      const res = computeDetourMath(t, { x: a, y: b }, r);
      if (res.check.status !== 'crossing') continue;
      n++;
      expect(res.ruleAgrees).toBe(true);
      assertCandidateInvariants(res);
      expect(res.chosen!.isMajorArc).toBe(false);
    }
    expect(n).toBeGreaterThan(300);
  });
});

describe('우회가 필요 없는 경우', () => {
  it('닿지 않음 → 직선, L = t√2', () => {
    const res = computeDetourMath(6, { x: 1, y: 5 }, 1);
    expect(res.check.status).toBe('miss');
    expect(res.detourRequired).toBe(false);
    close(res.totalLength, 6 * Math.SQRT2);
  });
  it('접함 → 우회 불필요', () => {
    // d = |a−b|/√2 = r
    const res = computeDetourMath(6, { x: 2, y: 4 }, Math.SQRT2);
    expect(res.check.status).toBe('tangent');
    expect(res.detourRequired).toBe(false);
  });
  it('무한 직선만 교차, 선분 OA 밖 → 우회 불필요', () => {
    const res = computeDetourMath(6, { x: 10, y: 10 }, 1);
    expect(res.check.status).toBe('outsideSegment');
    expect(res.detourRequired).toBe(false);
    close(res.totalLength, 6 * Math.SQRT2);
  });
  it('출발지가 원 안 → 태풍 수정 필요', () => {
    expect(computeDetourMath(6, { x: 0.5, y: 0.5 }, 1).check.status).toBe('endpointInside');
    expect(computeDetourMath(6, { x: 6, y: 5.5 }, 1).check.status).toBe('endpointInside');
  });
  it('반지름 0 이하', () => {
    expect(intersectSegment(6, 3, 3, 0).status).toBe('invalidRadius');
  });
});

describe('중심이 제2~4사분면에 있어도 동작', () => {
  it('a < 0 인 태풍 (선분 OA 근처는 아니지만 수식이 0으로 나누지 않음)', () => {
    const res = computeDetourMath(6, { x: -2, y: 1 }, 0.5);
    expect(res.check.status).toBe('miss');
    expect(Number.isFinite(res.check.lineDistance)).toBe(true);
  });
  it('a < 0, b > 0 이고 선분을 가로지르는 큰 원', () => {
    // C=(−0.5, 1.5): d = 2/√2 = √2, r = 2 → 교차, |OC|² = 2.5 < 4 → 출발지가 원 안
    expect(computeDetourMath(6, { x: -0.5, y: 1.5 }, 2).check.status).toBe('endpointInside');
    // 출발지를 벗어나는 예: C = (1.2, 3.2), r = 1.6
    const ok = computeDetourMath(6, { x: 1.2, y: 3.2 }, 1.6);
    expect(ok.check.status).toBe('crossing');
    assertCandidateInvariants(ok);
  });
  it('접점 공식: 음수 좌표 중심에서도 |T−C| = r, 반지름 ⟂ 접선', () => {
    const C = { x: -3, y: -1 };
    const S = { x: 2, y: 4 };
    const tp = tangentPoints(S, C, 1.7);
    for (const T of [tp.plus, tp.minus]) {
      const ck = checkTangent(T, S, C, 1.7);
      expect(ck.radiusError).toBeLessThan(1e-12);
      expect(ck.perpendicularityError).toBeLessThan(1e-12);
    }
  });
});

describe('180°보다 긴 반대편 원호 (명세 6장 보정)', () => {
  // A=(6,6), C=(2,4), r=4.4: 짧은 쪽(아래) ≈ 122.5°, 반대쪽(위) ≈ 196.3°
  const res = computeDetourMath(6, { x: 2, y: 4 }, 4.4);
  it('선택된 짧은 쪽은 작은 호, 중심각 = 2α', () => {
    expect(res.check.status).toBe('crossing');
    expect(res.chosen!.side).toBe(-1);
    expect(res.chosen!.isMajorArc).toBe(false);
    close(res.chosen!.centralAngleDeg, 2 * res.chosen!.alphaDeg, 1e-12);
  });
  it('반대쪽은 큰 호, 중심각 = 360° − 2α′ (2α′로 오인하지 않음)', () => {
    const o = res.other!;
    expect(o.isMajorArc).toBe(true);
    expect(o.centralAngleDeg).toBeGreaterThan(180);
    close(o.centralAngleDeg, 360 - 2 * o.alphaDeg, 1e-9);
    close(o.centralAngleDeg, o.sweepDeg, 1e-6);
    expect(o.smallAngleDeg).toBeLessThan(180);
    assertCandidateInvariants(res);
  });
});

describe('코사인표 역조회 (acos 미사용)', () => {
  it('표: 0°~90°, cos 감소', () => {
    expect(COSINE_TABLE.length).toBe(91);
    expect(COSINE_TABLE[0].cos).toBe(1);
    expect(COSINE_TABLE[60].cos).toBe(0.5);
    for (let i = 1; i <= 90; i++) expect(COSINE_TABLE[i].cos).toBeLessThanOrEqual(COSINE_TABLE[i - 1].cos);
  });
  it('cos α = 0.5 → 60°, 표의 끼는 행·선형보간', () => {
    const lk = lookupCosine(0.5);
    close(lk.alphaDeg, 60, 1e-8);
    const lk2 = lookupCosine((2 * Math.SQRT2) / 3);
    expect(lk2.lower.deg).toBe(19);
    expect(lk2.upper.deg).toBe(20);
    close(lk2.interpolatedDeg, 19.47, 0.01);
  });
});

describe('45° 좌표계 회전', () => {
  it('임의의 방향의 목적지 → 항상 A=(t,t), t>0, 거리·직교성 보존', () => {
    let seed = 11;
    const rnd = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
    for (let i = 0; i < 300; i++) {
      const A0 = { x: (rnd() - 0.5) * 30000, y: (rnd() - 0.5) * 30000 };
      const f = makeFrame(A0);
      const A = planeToMath(f, A0);
      close(A.x, f.t, 1e-6);
      close(A.y, f.t, 1e-6);
      expect(f.t).toBeGreaterThan(0);
      close(f.e.x * f.n.x + f.e.y * f.n.y, 0, 1e-12);
      const P0 = { x: (rnd() - 0.5) * 9000, y: (rnd() - 0.5) * 9000 };
      const Q0 = { x: (rnd() - 0.5) * 9000, y: (rnd() - 0.5) * 9000 };
      const P = planeToMath(f, P0);
      const Q = planeToMath(f, Q0);
      close(Math.hypot(P.x - Q.x, P.y - Q.y), Math.hypot(P0.x - Q0.x, P0.y - Q0.y), 1e-6);
      const back = mathToPlane(f, P);
      close(back.x, P0.x, 1e-7);
      close(back.y, P0.y, 1e-7);
    }
  });
  it('목적지가 원점과 같으면 오류', () => {
    expect(() => makeFrame({ x: 0, y: 0 })).toThrow();
  });
});

describe('비행 경로 매개화', () => {
  it('누적 길이 = 총거리, 원호 구간 샘플이 원 밖', () => {
    const res = computeDetourMath(6, { x: 3.2, y: 2.7 }, 1.3);
    const p = parametrizePath(res);
    close(p.total, res.totalLength, 1e-9);
    for (let i = 0; i <= 1000; i++) {
      const q = p.at((p.total * i) / 1000);
      expect(Math.hypot(q.p.x - res.C.x, q.p.y - res.C.y)).toBeGreaterThan(res.r - 1e-9);
    }
    const end = p.at(p.total).p;
    close(end.x, 6, 1e-9);
    close(end.y, 6, 1e-9);
  });
});
