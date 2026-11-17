import type { DetourDetail } from '../math/detour';
import type { Vec2 } from '../math/vec';

/** 원호 PQ 위의 점들 (화면에 그리기 위한 샘플) */
export function sampleArc(d: DetourDetail, C: Vec2, r: number, n = 64): Vec2[] {
  let sweep = d.arcDir === 1 ? d.thetaQ - d.thetaP : d.thetaP - d.thetaQ;
  sweep = ((sweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return Array.from({ length: n + 1 }, (_, i) => {
    const th = d.thetaP + (d.arcDir * sweep * i) / n;
    return { x: C.x + r * Math.cos(th), y: C.y + r * Math.sin(th) };
  });
}
