import { describe, expect, it } from 'vitest';
import { COS_TABLE, MAX_INTERP_ERROR_DEG, interpolateAlpha } from '../src/math/cosTable';
import { computeDetour, parametrize } from '../src/math/detour';
import { makeFrame, mathToPlane, planeToMath } from '../src/math/frame';

const close = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe('문서 9~10장 수치 예제: O=(0,0), A=(10,0), C=(4,1), r=2', () => {
  const res = computeDetour(10, 4, 1, 2);
  const d = res.detour!;

  it('9-1 교점 B₁=(4−√3,0), B₂=(4+√3,0), 우회 필요', () => {
    expect(res.status).toBe('crossing');
    close(res.B1!.x, 2.267949);
    close(res.B2!.x, 5.732051);
  });
  it('9-2 b=1>0 → s=−1 (아래쪽), ℓ_O=√13, ℓ_A=√33', () => {
    expect(d.s).toBe(-1);
    expect(d.DO).toBe(17);
    expect(d.DA).toBe(37);
    close(d.lO, Math.sqrt(13), 1e-12);
    close(d.lA, Math.sqrt(33), 1e-12);
  });
  it('9-3 P≈(3.483006, −0.932024), Q≈(4.338132, −0.971210)', () => {
    close(d.P.x, 3.483006);
    close(d.P.y, -0.932024);
    close(d.Q.x, 4.338132);
    close(d.Q.y, -0.97121);
  });
  it('10-1 H≈−8.659726, R≈(3.906276, −1.045288), CR≈2.047434', () => {
    close(d.H, -8.659726);
    close(d.R.x, 3.906276);
    close(d.R.y, -1.045288);
    close(d.dR, 2.047434);
  });
  it('10-2 z≈0.976832397, 12°와 13° 사이, α̂≈12.348164°, 2α̂≈24.696329°', () => {
    close(d.interp.z, 0.976832397, 1e-9);
    expect(d.interp.lower.deg).toBe(12);
    expect(d.interp.upper.deg).toBe(13);
    close(d.interp.m, -0.00377754, 1e-8);
    close(d.interp.n, 1.02347808, 1e-7);
    close(d.alphaHat, 12.348164, 1e-5);
    close(d.centralHat, 24.696329, 1e-5);
  });
  it('10-3 호≈0.862064, L_min≈10.212178, 정확값≈10.212810, 차이≈0.000631', () => {
    close(d.arcHat, 0.862064, 1e-5);
    close(d.Lmin, 10.212178, 1e-5);
    close(d.LTrue, 10.21281, 1e-5);
    close(d.LTrue - d.Lmin, 0.000631, 1e-5);
    expect(res.straight).toBe(10);
  });
});

describe('경계 상황 (문서 11장)', () => {
  it('b² > r² → 만나지 않음, 직선 t', () => {
    expect(computeDetour(10, 5, 3, 2).status).toBe('miss');
  });
  it('b² = r² → 접함, 직선 허용', () => {
    expect(computeDetour(10, 5, 2, 2).status).toBe('tangent');
  });
  it('교점이 선분 밖', () => {
    expect(computeDetour(10, 12, 0.5, 1).status).toBe('outsideSegment');
    expect(computeDetour(10, -3, 0.5, 1).status).toBe('outsideSegment');
  });
  it('출발점·도착점이 원 안 → 태풍 수정', () => {
    expect(computeDetour(10, 0.5, 0.2, 1).status).toBe('endpointInside');
    expect(computeDetour(10, 9.6, -0.2, 1).status).toBe('endpointInside');
  });
  it('r ≤ 0', () => {
    expect(computeDetour(10, 5, 0, 0).status).toBe('invalidRadius');
  });
  it('b = 0 → 위쪽(s=+1) 대표 선택, 대칭 표시', () => {
    const d = computeDetour(10, 5, 0, 2).detour!;
    expect(d.s).toBe(1);
    expect(d.symmetric).toBe(true);
    expect(d.P.y).toBeGreaterThan(0);
    expect(d.Q.y).toBeGreaterThan(0);
  });
  it('b < 0 → 위쪽 우회', () => {
    const d = computeDetour(10, 5, -1, 2).detour!;
    expect(d.s).toBe(1);
    expect(d.P.y).toBeGreaterThan(0);
  });
});

describe('무작위 태풍 3000개: 일반식의 성질', () => {
  let seed = 20261117;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const cases: ReturnType<typeof computeDetour>[] = [];
  for (let i = 0; i < 40000 && cases.length < 3000; i++) {
    const t = 1 + rnd() * 30;
    const res = computeDetour(t, rnd() * t, (rnd() - 0.5) * t, 0.02 + rnd() * t * 0.6);
    if (res.status === 'crossing') cases.push(res);
  }

  it('충분한 표본', () => expect(cases.length).toBe(3000));

  it('P, Q는 원 위, 반지름 ⟂ 접선, 같은 쪽(부호 s)', () => {
    for (const r of cases) {
      const d = r.detour!;
      const sc = Math.max(1, r.r);
      expect(d.checks.PonCircle).toBeLessThan(1e-9 * sc);
      expect(d.checks.QonCircle).toBeLessThan(1e-9 * sc);
      expect(Math.abs(d.checks.Pperp)).toBeLessThan(1e-8 * sc * r.t);
      expect(Math.abs(d.checks.Qperp)).toBeLessThan(1e-8 * sc * r.t);
      expect(Math.sign(d.P.y)).toBe(d.s);
      expect(Math.sign(d.Q.y)).toBe(d.s);
      expect(Math.abs(d.H)).toBeGreaterThan(0);
    }
  });

  it('R은 두 접선 위, CR > r, 중심각은 작은 호(2α < 180°)', () => {
    for (const r of cases) {
      const d = r.detour!;
      // R이 직선 OP 위: p_y u − p_x v = 0
      expect(Math.abs(d.P.y * d.R.x - d.P.x * d.R.y)).toBeLessThan(1e-7 * r.t * r.t);
      expect(Math.abs(d.Q.y * (d.R.x - r.t) - (d.Q.x - r.t) * d.R.y)).toBeLessThan(1e-7 * r.t * r.t);
      expect(d.dR).toBeGreaterThan(r.r);
      expect(2 * d.alphaTrue).toBeLessThan(180);
    }
  });

  it('보간 오차 0 ≤ α − α̂ < 0.25°, |ΔL| < πr/360', () => {
    for (const r of cases) {
      const d = r.detour!;
      expect(d.interpErrorDeg).toBeGreaterThan(-1e-9);
      expect(d.interpErrorDeg).toBeLessThan(MAX_INTERP_ERROR_DEG);
      expect(d.interpErrorLen).toBeLessThan(d.interpErrorBound + 1e-12);
      expect(d.LTrue).toBeGreaterThanOrEqual(d.Lmin - 1e-9);
      // 실제 우회 거리는 항상 직선보다 길다. 근삿값은 아주 얕은 관통에서 직선보다 작아질 수 있다.
      expect(d.LTrue).toBeGreaterThan(r.t);
      expect(d.approxBelowStraight).toBe(d.Lmin <= r.t);
      if (d.approxBelowStraight) expect(d.LTrue - r.t).toBeLessThan(d.interpErrorBound);
    }
  });

  it('문서 2-4: 반대쪽(중심이 있는 쪽)으로 돌면 원호가 더 길다', () => {
    // 같은 일반식에 부호만 −s 로 바꿔 반대쪽 접점을 구하고, 반대 방향으로 도는 원호 길이를 잰다.
    const arcFor = (t: number, a: number, b: number, r: number, s: 1 | -1) => {
      const DO = a * a + b * b;
      const lO = Math.sqrt(DO - r * r);
      const DA = (t - a) ** 2 + b * b;
      const lA = Math.sqrt(DA - r * r);
      const P = { x: (a * lO * lO - s * b * r * lO) / DO, y: (b * lO * lO + s * a * r * lO) / DO };
      const Q = { x: a + ((t - a) * r * r + s * b * r * lA) / DA, y: b + (-b * r * r + s * (t - a) * r * lA) / DA };
      const dir = s === -1 ? 1 : -1;
      let sw = dir * (Math.atan2(Q.y - b, Q.x - a) - Math.atan2(P.y - b, P.x - a));
      sw = ((sw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      return { arc: r * sw, tangents: lO + lA };
    };
    for (const r of cases.slice(0, 1000)) {
      const d = r.detour!;
      const mine = arcFor(r.t, r.a, r.b, r.r, d.s);
      const other = arcFor(r.t, r.a, r.b, r.r, d.s === 1 ? -1 : 1);
      close(mine.arc, d.arcTrue, 1e-9 * Math.max(1, r.r));
      close(mine.tangents, other.tangents, 1e-9 * r.t); // 접선 길이 합은 같다
      if (r.b === 0) close(mine.arc, other.arc, 1e-9 * Math.max(1, r.r));
      else expect(other.arc).toBeGreaterThan(mine.arc);
    }
  });

  it('경로 매개화: 끝점 A, 경로가 원 안으로 들어가지 않음', () => {
    for (const r of cases.slice(0, 300)) {
      const p = parametrize(r);
      const end = p.at(p.total).p;
      expect(Math.abs(end.x - r.t)).toBeLessThan(1e-7 * r.t);
      expect(Math.abs(end.y)).toBeLessThan(1e-7 * r.t);
      for (let i = 0; i <= 200; i++) {
        const q = p.at((p.total * i) / 200).p;
        expect(Math.hypot(q.x - r.a, q.y - r.b)).toBeGreaterThan(r.r * (1 - 1e-9));
      }
    }
  });
});

describe('코사인표', () => {
  it('0°~90°, 소수 8자리, 감소', () => {
    expect(COS_TABLE).toHaveLength(91);
    expect(COS_TABLE[12].cos).toBe(0.9781476);
    expect(COS_TABLE[13].cos).toBe(0.97437006);
    expect(COS_TABLE[60].cos).toBe(0.5);
    for (let i = 1; i <= 90; i++) expect(COS_TABLE[i].cos).toBeLessThan(COS_TABLE[i - 1].cos);
  });
  it('표 값과 정확히 같으면 보간 없이 그 각', () => {
    const it0 = interpolateAlpha(0.5);
    expect(it0.exactHit).toBe(true);
    expect(it0.alphaHat).toBe(60);
  });
  it('최대 보간 오차는 0°~1° 구간에서 약 0.249995°', () => {
    let worst = 0;
    for (let k = 0; k <= 1000; k++) {
      const alpha = (k / 1000) * 1;
      const z = Math.cos((alpha * Math.PI) / 180);
      worst = Math.max(worst, alpha - interpolateAlpha(z).alphaHat);
    }
    close(worst, 0.249995, 2e-4);
  });
});

describe('계산 좌표계: 목적지가 항상 (t, 0)', () => {
  it('임의 방향 300개', () => {
    let seed = 5;
    const rnd = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
    for (let i = 0; i < 300; i++) {
      const A0 = { x: (rnd() - 0.5) * 30000, y: (rnd() - 0.5) * 30000 };
      const f = makeFrame(A0);
      const A = planeToMath(f, A0);
      close(A.x, f.t, 1e-6);
      close(A.y, 0, 1e-6);
      const P0 = { x: (rnd() - 0.5) * 9000, y: (rnd() - 0.5) * 9000 };
      const back = mathToPlane(f, planeToMath(f, P0));
      close(back.x, P0.x, 1e-7);
      close(back.y, P0.y, 1e-7);
    }
  });
});
