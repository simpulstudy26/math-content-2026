import { useMemo } from 'react';
import type { Trip } from '../math/trip';
import type { Vec2 } from '../math/vec';
import { sampleArc } from './radarGeometry';

interface Props {
  trip: Trip;
  /** 현재 누적 거리 */
  distance: number;
  /** 0 = 전체 항로, 1 = 태풍 근처 확대 */
  zoom: number;
  reveal: { intersections: boolean; points: boolean; R: boolean; arc: boolean };
  pos: Vec2;
  heading: Vec2;
}

const W = 300;
const H = 190;

type Box = { x0: number; x1: number; y0: number; y1: number };

function fit(box: Box): Box {
  // 가로세로 비율을 화면에 맞추고 같은 축척을 유지 (원이 원으로 보이게)
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  let w = box.x1 - box.x0;
  let h = box.y1 - box.y0;
  if (w / h > W / H) h = (w * H) / W;
  else w = (h * W) / H;
  return { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 };
}
const lerpBox = (a: Box, b: Box, u: number): Box => ({
  x0: a.x0 + (b.x0 - a.x0) * u,
  x1: a.x1 + (b.x1 - a.x1) * u,
  y0: a.y0 + (b.y0 - a.y0) * u,
  y1: a.y1 + (b.y1 - a.y1) * u,
});

/** 조종석 레이더 = 계산 좌표평면 (x축 = 기수 방향, 위쪽 = 진행 방향의 왼쪽) */
export function Radar({ trip, distance, zoom, reveal, pos, heading }: Props) {
  const { t, C } = trip;
  const r = trip.input.radius;
  const d = trip.result.detour;

  const boxes = useMemo(() => {
    const ys = [0, C.y - r * 1.25, C.y + r * 1.25];
    const full = fit({ x0: -t * 0.05, x1: t * 1.05, y0: Math.min(...ys, -t * 0.05), y1: Math.max(...ys, t * 0.05) });
    const xs = [C.x - r * 1.9, C.x + r * 1.9];
    const zy = [0, C.y - r * 1.5, C.y + r * 1.5];
    if (d) {
      xs.push(d.P.x - r * 0.4, d.Q.x + r * 0.4, d.R.x);
      zy.push(d.R.y - r * 0.2, d.R.y + r * 0.2);
    }
    const near = fit({ x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...zy), y1: Math.max(...zy) });
    return { full, near };
  }, [t, C.x, C.y, r, d]);

  const box = lerpBox(boxes.full, boxes.near, zoom);
  const k = W / (box.x1 - box.x0);
  const X = (x: number) => (x - box.x0) * k;
  const Y = (y: number) => H - (y - box.y0) * k;
  const pt = (p: Vec2) => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`;

  const traveled = useMemo(() => {
    const out: Vec2[] = [];
    for (const s of trip.samples) {
      if (s.s > distance) break;
      out.push(s.math);
    }
    return out;
  }, [trip.samples, distance]);
  const arcPts = useMemo(() => (d ? sampleArc(d, C, r, 64) : []), [d, C, r]);

  const lbl = (p: Vec2, text: string, dx: number, dy: number, cls = '') => (
    <text x={X(p.x) + dx} y={Y(p.y) + dy} className={`rl ${cls}`}>
      {text}
    </text>
  );
  const ang = (Math.atan2(-heading.y, heading.x) * 180) / Math.PI;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="radar-svg" aria-label="계산 좌표평면 레이더">
      <defs>
        <clipPath id="radar-clip">
          <rect x="0" y="0" width={W} height={H} rx="10" />
        </clipPath>
      </defs>
      <g clipPath="url(#radar-clip)">
        <rect x="0" y="0" width={W} height={H} className="radar-bg" />
        {/* 축 */}
        <line x1={0} y1={Y(0)} x2={W} y2={Y(0)} className="r-axis" />
        <line x1={X(0)} y1={0} x2={X(0)} y2={H} className="r-axis faint" />
        <line x1={X(0)} y1={Y(0)} x2={X(t)} y2={Y(0)} className={`r-oa ${trip.result.status === 'crossing' ? 'blocked' : ''}`} />
        {/* 태풍 */}
        <circle cx={X(C.x)} cy={Y(C.y)} r={r * k} className="r-storm" />
        <circle cx={X(C.x)} cy={Y(C.y)} r={2} className="r-dot" />
        {lbl(C, 'C', 4, -4)}
        {d && reveal.points && (
          <>
            <line x1={X(0)} y1={Y(0)} x2={X(d.P.x)} y2={Y(d.P.y)} className="r-plan" />
            <line x1={X(d.Q.x)} y1={Y(d.Q.y)} x2={X(t)} y2={Y(0)} className="r-plan" />
            <polyline points={arcPts.map(pt).join(' ')} className={`r-plan ${reveal.arc ? 'arc-on' : ''}`} />
            <line x1={X(C.x)} y1={Y(C.y)} x2={X(d.P.x)} y2={Y(d.P.y)} className="r-radius" />
            <line x1={X(C.x)} y1={Y(C.y)} x2={X(d.Q.x)} y2={Y(d.Q.y)} className="r-radius" />
          </>
        )}
        {d && reveal.R && (
          <>
            <line x1={X(d.P.x)} y1={Y(d.P.y)} x2={X(d.R.x)} y2={Y(d.R.y)} className="r-ext" />
            <line x1={X(d.Q.x)} y1={Y(d.Q.y)} x2={X(d.R.x)} y2={Y(d.R.y)} className="r-ext" />
            <line x1={X(C.x)} y1={Y(C.y)} x2={X(d.R.x)} y2={Y(d.R.y)} className="r-ext cr" />
            <circle cx={X(d.R.x)} cy={Y(d.R.y)} r={3} className="r-R" />
            {lbl(d.R, 'R', 5, d.s < 0 ? 12 : -5, 'amber')}
          </>
        )}
        {traveled.length > 1 && <polyline points={traveled.map(pt).join(' ')} className="r-trav" />}
        {reveal.intersections && trip.result.B1 && trip.result.B2 && (
          <>
            <circle cx={X(trip.result.B1.x)} cy={Y(0)} r={2.8} className="r-B" />
            <circle cx={X(trip.result.B2.x)} cy={Y(0)} r={2.8} className="r-B" />
            {zoom > 0.5 && lbl(trip.result.B1, 'B₁', -6, d && d.s < 0 ? -6 : 13, 'warm')}
            {zoom > 0.5 && lbl(trip.result.B2, 'B₂', -6, d && d.s < 0 ? -6 : 13, 'warm')}
          </>
        )}
        {d && reveal.points && (
          <>
            <circle cx={X(d.P.x)} cy={Y(d.P.y)} r={3} className="r-PQ" />
            <circle cx={X(d.Q.x)} cy={Y(d.Q.y)} r={3} className="r-PQ" />
            {lbl(d.P, 'P', -12, d.s < 0 ? 13 : -5)}
            {lbl(d.Q, 'Q', 5, d.s < 0 ? 13 : -5)}
          </>
        )}
        <circle cx={X(0)} cy={Y(0)} r={3} className="r-dot" />
        {lbl({ x: 0, y: 0 }, 'O', 4, 13)}
        <circle cx={X(t)} cy={Y(0)} r={3} className="r-dot" />
        {lbl({ x: t, y: 0 }, 'A(t, 0)', -40, 13)}
        <g transform={`translate(${X(pos.x)},${Y(pos.y)}) rotate(${ang})`}>
          <path d="M8 0 L-5 -5 L-2 0 L-5 5 Z" className="r-plane" />
        </g>
      </g>
    </svg>
  );
}
