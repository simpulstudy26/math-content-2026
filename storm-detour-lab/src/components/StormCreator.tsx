import type { ScenarioResult } from '../math/scenario';
import { STATUS_LABEL } from '../math/intersections';
import { km, latlon, num } from '../format';

interface Props {
  scenario: ScenarioResult | null;
  hasDestination: boolean;
  radius: number;
  onRadius: (r: number) => void;
  onAuto: () => void;
  onClear: () => void;
  placing: boolean;
  onPlacing: (v: boolean) => void;
  hasStorm: boolean;
  maxRadius: number;
}

/** 실패한 조건을 구체적으로 알려 준다 (명세 4-3) */
function explainStatus(s: ScenarioResult): string[] {
  const c = s.check;
  const out: string[] = [];
  const { t } = s.coords;
  if (c.status === 'invalidRadius') out.push('반지름 r > 0 이어야 합니다.');
  if (c.originInside) out.push(`출발지 O가 원 안: a²+b² = ${num(c.originPower + s.input.radius ** 2, 0)} ≤ r² = ${num(s.input.radius ** 2, 0)}`);
  if (c.destInside) out.push(`목적지 A가 원 안: (t−a)²+(t−b)² ≤ r²`);
  if (c.status === 'miss') out.push(`d = |a−b|/√2 = ${km(c.lineDistance, 0)} ≥ r → 직선 y=x와 만나지 않습니다.`);
  if (c.status === 'tangent') out.push('판별식 2r² − (a−b)² = 0 → 접하기만 합니다.');
  if (c.status === 'outsideSegment')
    out.push(`교점 u− = ${num(c.uMinus!, 0)}, u+ = ${num(c.uPlus!, 0)} 이 0 < u− < u+ < t = ${num(t, 0)} 를 만족하지 않습니다.`);
  return out;
}

export function StormCreator({ scenario, hasDestination, radius, onRadius, onAuto, onClear, placing, onPlacing, hasStorm, maxRadius }: Props) {
  const status = scenario?.check.status;
  const ok = status === 'crossing';
  return (
    <div className="storm">
      <div className="search-step">
        <span className="step-no">3</span>
        <span className="step-title">가상 태풍 (원형 진입 금지 구역)</span>
      </div>
      {!hasDestination ? (
        <p className="muted tiny pad-x">목적지를 먼저 고르세요.</p>
      ) : (
        <>
          <div className="btn-row">
            <button className="btn primary" onClick={onAuto}>
              자동 배치
            </button>
            <button className={`btn ${placing ? 'on' : ''}`} onClick={() => onPlacing(!placing)}>
              {placing ? '지도를 클릭하세요…' : '지도 클릭으로 놓기'}
            </button>
            {hasStorm && (
              <button className="btn ghost" onClick={onClear}>
                지우기
              </button>
            )}
          </div>
          {hasStorm && (
            <>
              <label className="slider">
                <span>
                  반지름 r <b>{km(radius, 0)}</b>
                </span>
                <input
                  type="range"
                  min={10}
                  max={Math.max(50, Math.round(maxRadius))}
                  step={5}
                  value={radius}
                  onChange={(e) => onRadius(Number(e.target.value))}
                />
                <input
                  type="number"
                  className="input num"
                  min={1}
                  value={radius}
                  onChange={(e) => onRadius(Math.max(0, Number(e.target.value)))}
                />
              </label>
              {scenario && (
                <>
                  <div className="tiny muted pad-x">
                    중심 {latlon(scenario.input.stormCenterLatLon)} · 지도에서 ✛ 를 끌어 옮기세요
                  </div>
                  <div className={`status ${ok ? 'ok' : status === 'endpointInside' || status === 'invalidRadius' ? 'bad' : 'warn'}`}>
                    <b>{STATUS_LABEL[status!]}</b>
                    {explainStatus(scenario).map((m) => (
                      <div key={m}>{m}</div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
