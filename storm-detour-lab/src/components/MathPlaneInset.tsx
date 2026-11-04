import type { ScenarioResult } from '../math/scenario';
import type { Vec2 } from '../math/vec';
import { num } from '../format';

interface Props {
  scenario: ScenarioResult;
  progress: number;
  showOther: boolean;
  open: boolean;
  onToggle: () => void;
}

/** 수학 좌표계 확대뷰 — 정확한 원, y=x, O, A, C, r, P, Q, R (명세 12-1) */
export function MathPlaneInset({ scenario: s, progress, showOther, open, onToggle }: Props) {
  if (!open) {
    return (
      <button className="inset-toggle" onClick={onToggle}>
        수학 좌표계 보기 ▴
      </button>
    );
  }
  const { t, C } = s.coords;
  const r = s.input.radius;
  const c = s.path.chosen;
  const W = 300;
  const H = 300;
  const xs = [0, t, C.x - r, C.x + r];
  const ys = [0, t, C.y - r, C.y + r];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY) * 1.18;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const k = W / span;
  const X = (x: number) => W / 2 + (x - cx) * k;
  const Y = (y: number) => H / 2 - (y - cy) * k;
  const P = (p: Vec2) => `${X(p.x).toFixed(2)},${Y(p.y).toFixed(2)}`;
  const poly = (pts: Vec2[]) => pts.map(P).join(' ');

  const frames = s.render.flightFramePositions;
  const i = Math.min(frames.length - 1, Math.round(progress * (frames.length - 1)));
  const plane = frames[i].math;
  const traveled = frames.slice(0, i + 1).map((f) => f.math);
  const lineEnd = span;

  const label = (p: Vec2, text: string, dx = 6, dy = -6, cls = '') => (
    <text x={X(p.x) + dx} y={Y(p.y) + dy} className={`lbl ${cls}`}>
      {text}
    </text>
  );

  return (
    <div className="inset">
      <div className="inset-head">
        <span>
          수학 좌표계 <small className="muted">(단위 km · 정확한 비율)</small>
        </span>
        <button className="icon-btn" onClick={onToggle} aria-label="접기">
          ▾
        </button>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="inset-svg">
        {/* 축 */}
        <line x1={X(minX - span)} y1={Y(0)} x2={X(maxX + span)} y2={Y(0)} className="axis" />
        <line x1={X(0)} y1={Y(minY - span)} x2={X(0)} y2={Y(maxY + span)} className="axis" />
        <text x={W - 12} y={Y(0) - 4} className="lbl axis-l">
          x
        </text>
        <text x={X(0) + 4} y={12} className="lbl axis-l">
          y
        </text>
        {/* y = x */}
        <line x1={X(-lineEnd)} y1={Y(-lineEnd)} x2={X(t + lineEnd)} y2={Y(t + lineEnd)} className="diag" />
        <line x1={X(0)} y1={Y(0)} x2={X(t)} y2={Y(t)} className={s.math.detourRequired ? 'oa blocked' : 'oa'} />
        {/* 태풍 */}
        <circle cx={X(C.x)} cy={Y(C.y)} r={r * k} className="storm-c" />
        {c && (
          <>
            <line x1={X(C.x)} y1={Y(C.y)} x2={X(c.P.x)} y2={Y(c.P.y)} className="radius" />
            <line x1={X(C.x)} y1={Y(C.y)} x2={X(c.Q.x)} y2={Y(c.Q.y)} className="radius" />
            {c.R && <line x1={X(C.x)} y1={Y(C.y)} x2={X(c.R.x)} y2={Y(c.R.y)} className="radius cr" />}
            {c.R && (
              <>
                <line x1={X(c.P.x)} y1={Y(c.P.y)} x2={X(c.R.x)} y2={Y(c.R.y)} className="tan-ext" />
                <line x1={X(c.Q.x)} y1={Y(c.Q.y)} x2={X(c.R.x)} y2={Y(c.R.y)} className="tan-ext" />
              </>
            )}
            {showOther && s.path.other && (
              <polyline
                points={poly([{ x: 0, y: 0 }, s.path.other.P, ...s.render.mathOtherArc, s.path.other.Q, { x: t, y: t }])}
                className="other-path"
              />
            )}
            <polyline points={poly([{ x: 0, y: 0 }, c.P, ...s.render.mathArc, c.Q, { x: t, y: t }])} className="plan-path" />
          </>
        )}
        {traveled.length > 1 && <polyline points={poly(traveled)} className="trav-path" />}
        {s.check.intersections.map((I, n) => (
          <circle key={n} cx={X(I.x)} cy={Y(I.y)} r={3.2} className="pt-i" />
        ))}
        {s.check.intersections.length === 2 && (
          <>
            {label(s.check.intersections[0], 'I−', 6, 12, 'warm')}
            {label(s.check.intersections[1], 'I+', 6, 12, 'warm')}
          </>
        )}
        <circle cx={X(C.x)} cy={Y(C.y)} r={2.6} className="pt-c" />
        {label(C, 'C', 5, -5)}
        <circle cx={X(0)} cy={Y(0)} r={3.5} className="pt-o" />
        {label({ x: 0, y: 0 }, 'O', -14, 14)}
        <circle cx={X(t)} cy={Y(t)} r={3.5} className="pt-o" />
        {label({ x: t, y: t }, 'A(t,t)', 6, -4)}
        {c && (
          <>
            <circle cx={X(c.P.x)} cy={Y(c.P.y)} r={3} className="pt-pq" />
            {label(c.P, 'P', 6, 12)}
            <circle cx={X(c.Q.x)} cy={Y(c.Q.y)} r={3} className="pt-pq" />
            {label(c.Q, 'Q', 6, 12)}
            {c.R && <circle cx={X(c.R.x)} cy={Y(c.R.y)} r={3} className="pt-r" />}
            {c.R && label(c.R, 'R', 6, 4, 'amber')}
          </>
        )}
        <circle cx={X(plane.x)} cy={Y(plane.y)} r={4.5} className="pt-plane" />
      </svg>
      <div className="inset-foot tiny">
        t = {num(t, 1)} · C = ({num(C.x, 1)}, {num(C.y, 1)}) · r = {num(r, 0)}
      </div>
    </div>
  );
}
