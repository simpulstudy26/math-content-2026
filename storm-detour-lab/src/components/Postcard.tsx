import type { Trip } from '../math/trip';
import { Radar } from './Radar';
import { Tex, tn } from './Tex';
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
              <Tex>{`O(0,0),\\ A(${tn(trip.t, 0)},0),\\ C(${tn(trip.C.x, 0)},${tn(trip.C.y, 0)}),\\ r=${tn(r, 0)}`}</Tex>
            </li>
            <li>
              <Tex>{`h=\\sqrt{r^2-b^2}=${tn(trip.result.h!, 1)},\\ 0<${tn(trip.result.B1!.x, 0)}<${tn(trip.result.B2!.x, 0)}<${tn(trip.t, 0)}`}</Tex>
            </li>
            <li>
              <Tex>{`b${trip.C.y > 0 ? '>0' : trip.C.y < 0 ? '<0' : '=0'}\\Rightarrow s=${d.s > 0 ? '+1' : '-1'}`}</Tex>
            </li>
            <li>
              <Tex>{`\\ell_O=${tn(d.lO, 1)},\\ \\ell_A=${tn(d.lA, 1)}`}</Tex>
            </li>
            <li>
              <Tex>{`P(${tn(d.P.x, 0)},${tn(d.P.y, 0)}),\\ Q(${tn(d.Q.x, 0)},${tn(d.Q.y, 0)})`}</Tex>
            </li>
            <li>
              <Tex>{`R(${tn(d.R.x, 0)},${tn(d.R.y, 0)}),\\ \\overline{CR}=${tn(d.dR, 1)}`}</Tex>
            </li>
            <li>
              <Tex>{`\\cos\\alpha=${d.interp.z.toFixed(6)}\\Rightarrow\\hat\\alpha\\approx${tn(d.alphaHat, 4)}^\\circ`}</Tex>
            </li>
            <li>
              <Tex>{`L_{\\min}\\approx${tn(d.lO, 1)}+${tn(d.arcHat, 1)}+${tn(d.lA, 1)}=${tn(d.Lmin, 1)}`}</Tex>
            </li>
          </ol>
          <p className="pc-err">
            표 보간 오차 <Tex>{`\\alpha-\\hat\\alpha=${tn(d.interpErrorDeg, 4)}^\\circ`}</Tex> → 거리 차이 {num(d.interpErrorLen, 2)} km (상한{' '}
            <Tex>{`\\pi r/360=${tn(d.interpErrorBound, 1)}`}</Tex> km)
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
