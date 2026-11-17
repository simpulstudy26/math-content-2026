import type { Trip } from '../math/trip';
import { Radar } from './Radar';
import { AH } from './Hat';
import { num } from '../format';

interface Props {
  trip: Trip;
  destLabel: string;
  destCode: string;
  onReplay: () => void;
  onNew: () => void;
  onClose: () => void;
}

/** 도착 엽서 — 이번 여행의 계산을 한 장으로 */
export function Postcard({ trip, destLabel, destCode, onReplay, onNew, onClose }: Props) {
  const d = trip.result.detour!;
  const r = trip.input.radius;
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const end = trip.path.at(trip.path.total);
  return (
    <div className="postcard-wrap" onClick={onClose}>
      <div className="postcard" onClick={(e) => e.stopPropagation()}>
        <div className="pc-left">
          <div className="pc-title">
            <small>도착했어요</small>
            <h2>{destLabel}</h2>
            <span>
              인천 ICN → {destCode} · {today}
            </span>
          </div>
          <div className="pc-radar">
            <Radar trip={trip} distance={trip.path.total} zoom={0} reveal={{ intersections: true, points: true, R: true, arc: true }} pos={end.p} heading={end.dir} />
          </div>
          <div className="pc-stats">
            <div>
              <span>직선 항로 t</span>
              <b>{num(trip.t, 1)} km</b>
            </div>
            <div className="accent">
              <span>최단 우회 L_min</span>
              <b>{num(d.Lmin, 1)} km</b>
            </div>
            <div>
              <span>늘어난 거리</span>
              <b>
                +{num(d.extra, 1)} km <small>({num(d.increasePct, 2)}%)</small>
              </b>
            </div>
          </div>
        </div>
        <div className="pc-right">
          <div className="stamp">
            <span>🌀</span>
            <small>STORM AVOIDED</small>
          </div>
          <h3>계산 노트 한 장 요약</h3>
          <ol className="pc-steps">
            <li>
              좌표: O(0, 0), A({num(trip.t, 0)}, 0), C({num(trip.C.x, 0)}, {num(trip.C.y, 0)}), r = {num(r, 0)}
            </li>
            <li>
              h = √(r² − b²) = {num(trip.result.h!, 1)} → 0 &lt; {num(trip.result.B1!.x, 0)} &lt; {num(trip.result.B2!.x, 0)} &lt; {num(trip.t, 0)}
            </li>
            <li>
              b {trip.C.y > 0 ? '> 0' : trip.C.y < 0 ? '< 0' : '= 0'} → s = {d.s > 0 ? '+1 (위쪽)' : '−1 (아래쪽)'}
            </li>
            <li>
              OP = ℓ_O = {num(d.lO, 1)}, AQ = ℓ_A = {num(d.lA, 1)}
            </li>
            <li>
              P({num(d.P.x, 0)}, {num(d.P.y, 0)}), Q({num(d.Q.x, 0)}, {num(d.Q.y, 0)})
            </li>
            <li>
              R({num(d.R.x, 0)}, {num(d.R.y, 0)}), CR = {num(d.dR, 1)}
            </li>
            <li>
              cos α = {d.interp.z.toFixed(6)} → {AH} ≈ {num(d.alphaHat, 4)}° ({d.interp.lower.deg}°~{d.interp.upper.deg}° 보간)
            </li>
            <li>
              호 = πr{AH}/90 = {num(d.arcHat, 1)} → L_min ≈ {num(d.Lmin, 1)} km
            </li>
          </ol>
          <p className="pc-err">
            표 보간 오차 α − {AH} = {num(d.interpErrorDeg, 4)}° → 거리 차이 {num(d.interpErrorLen, 2)} km (상한 πr/360 = {num(d.interpErrorBound, 1)} km)
          </p>
          <div className="pc-btns">
            <button className="btn-soft" onClick={onReplay}>
              ↺ 다시 비행
            </button>
            <button className="btn-main" onClick={onNew}>
              🎫 새 여행 떠나기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
