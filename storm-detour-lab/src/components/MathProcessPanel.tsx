import { useEffect, useRef, type ReactNode } from 'react';
import type { Phase } from '../math/detour';
import { SIDE_LABEL } from '../math/detour';
import type { ScenarioResult } from '../math/scenario';
import { ICN } from '../math/geoProjection';
import { CosineLookupTable } from './CosineLookupTable';
import { ComparisonSummary } from './ComparisonSummary';
import { deg, km, latlon, num, pt, sq } from '../format';

type StepId = 'frame' | 'eq' | 'cross' | 'side' | 'tangent' | 'length' | 'R' | 'table' | 'arc' | 'total';

const PHASE_STEPS: Record<Phase, StepId[]> = {
  OP: ['tangent', 'length'],
  ARC: ['R', 'table', 'arc'],
  QA: ['length', 'total'],
  DIRECT: ['total'],
};

function Step({ id, no, title, active, children }: { id: StepId; no: number; title: string; active: boolean; children: ReactNode }) {
  return (
    <section className={`step ${active ? 'active' : ''}`} data-step={id}>
      <h3>
        <span className="step-no">{no}</span>
        {title}
      </h3>
      <div className="step-body">{children}</div>
    </section>
  );
}

const Eq = ({ children }: { children: ReactNode }) => <div className="eq">{children}</div>;

interface Props {
  scenario: ScenarioResult | null;
  phase: Phase | null;
  playing: boolean;
  destName: string;
}

export function MathProcessPanel({ scenario: s, phase, playing, destName }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const active = new Set<StepId>(phase && playing ? PHASE_STEPS[phase] : []);
  const activeKey = [...active].join(',');

  useEffect(() => {
    if (!activeKey) return;
    const first = ref.current?.querySelector('.step.active');
    first?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeKey]);

  if (!s) {
    return (
      <div className="panel-empty">
        <h2>수학 계산 과정</h2>
        <p>
          왼쪽에서 <b>국가 → 공항</b>을 고르고 <b>태풍</b>을 만들면, 이 패널에 좌표 정규화부터 최단 우회 거리까지의 계산이 단계별로 나타납니다.
        </p>
        <ol className="muted">
          <li>목적지를 y = x 위의 A(t, t)로 옮기는 좌표축 회전</li>
          <li>원과 직선의 교점 두 개 판정</li>
          <li>접점 P, Q · 피타고라스 접선 길이</li>
          <li>접선 교점 R과 코사인표로 중심각 찾기</li>
          <li>호의 길이와 최단 거리</li>
        </ol>
      </div>
    );
  }

  const { t, A0, C, C0, destDistanceKm, destAzimuthDeg, rotationBasis: rb } = s.coords;
  const r = s.input.radius;
  const a = C.x;
  const b = C.y;
  const ck = s.check;
  const c = s.path.chosen;
  const m = s.math;

  return (
    <div className="panel" ref={ref}>
      <ComparisonSummary scenario={s} />
      {s.warnings.length > 0 && (
        <div className="warnings">
          {s.warnings.map((w) => (
            <div key={w.code} className={w.blocking ? 'warn-item blocking' : 'warn-item'}>
              {w.blocking ? '⛔ ' : '⚠ '}
              {w.message}
            </div>
          ))}
        </div>
      )}

      <Step id="frame" no={1} title="좌표계 정규화: A를 y = x 위로" active={active.has('frame')}>
        <p className="note">
          공항을 옮기는 것이 아니라 <b>좌표축을 돌리는 것</b>입니다. 세 종류의 좌표가 서로 다릅니다.
        </p>
        <div className="kv">
          <span>① 실제 경위도</span>
          <span>
            O {latlon(ICN)}
            <br />A {latlon(s.input.destination)} <small className="muted">{destName}</small>
          </span>
          <span>② 인천 중심 평면</span>
          <span>
            D = {km(destDistanceKm)}, β = {deg(destAzimuthDeg, 2)}
            <br />
            A₀ = (D sin β, D cos β) = {pt(A0)}
          </span>
          <span>③ 수학 좌표</span>
          <span>
            축을 {deg(rb.rotationDeg, 2)} 회전 → <b>A = (t, t)</b>
          </span>
        </div>
        <Eq>
          L = √(X<sub>A</sub>² + Y<sub>A</sub>²) = {km(t * Math.SQRT2)}
          <br />t = L/√2 = <b>{num(t, 2)}</b>
          <br />e = ({num(rb.e.x, 4)}, {num(rb.e.y, 4)}), n = ({num(rb.n.x, 4)}, {num(rb.n.y, 4)})
          <br />x = (s − h)/√2, y = (s + h)/√2
        </Eq>
      </Step>

      <Step id="eq" no={2} title="직선과 원의 방정식" active={active.has('eq')}>
        <p className="tiny muted">
          태풍 중심(지도) {latlon(s.input.stormCenterLatLon)} → 평면 {pt(C0)} → 회전 → C
        </p>
        <Eq>
          기본 항로: <b>y = x</b> (0 ≤ x ≤ {num(t, 1)})
          <br />
          태풍: (x − {num(a, 1)})² + (y − {num(b, 1)})² = {num(r, 0)}²
        </Eq>
      </Step>

      <Step id="cross" no={3} title="선분 OA와 두 점에서 만나는가" active={active.has('cross')}>
        <Eq>
          d = |a − b|/√2 = {km(ck.lineDistance)} {ck.lineDistance < r ? '<' : '≥'} r = {km(r, 0)}
          <br />
          2u² − 2(a+b)u + a² + b² − r² = 0
          <br />
          판별식 2r² − (a−b)² = {num(ck.discriminant, 0)}
        </Eq>
        {ck.uMinus !== null && ck.uPlus !== null && ck.intersections.length === 2 && (
          <Eq>
            u<sub>−</sub> = {num(ck.uMinus, 2)}, u<sub>+</sub> = {num(ck.uPlus, 2)}
            <br />
            0 &lt; u<sub>−</sub> &lt; u<sub>+</sub> &lt; t = {num(t, 2)} → {ck.status === 'crossing' ? '✔ 선분 내부' : '✘ 선분 밖'}
          </Eq>
        )}
        <div className="tiny">
          O 원 밖: a² + b² − r² = {num(ck.originPower, 0)} {ck.originPower > 0 ? '> 0 ✔' : '≤ 0 ✘'} · A 원 밖: {num(ck.destPower, 0)}{' '}
          {ck.destPower > 0 ? '> 0 ✔' : '≤ 0 ✘'}
        </div>
      </Step>

      {!c ? (
        <Step id="total" no={4} title="결론" active={active.has('total')}>
          <p>우회가 필요 없으므로 최단 경로는 직선 OA입니다.</p>
          <Eq>
            L = √(t² + t²) = t√2 = <b>{km(m.directLength)}</b>
          </Eq>
        </Step>
      ) : (
        <>
          <Step id="side" no={4} title="어느 쪽으로 돌아야 짧은가" active={active.has('side')}>
            <Eq>
              b − a = {num(b - a, 2)} {m.tie ? '= 0' : b - a > 0 ? '> 0 → 중심이 y=x 위' : '< 0 → 중심이 y=x 아래'}
            </Eq>
            <p>
              → <b>{SIDE_LABEL[String(c.side)]}</b>로 우회{m.tie && ' (양쪽 거리 동일 — 한쪽을 골라 표시)'}
            </p>
            <p className="tiny muted">
              검증: 두 후보를 실제로 계산하면 {km(c.totalLength)} vs {km(s.path.other!.totalLength)} {m.ruleAgrees ? '✔ 일치' : '✘ 불일치'}
            </p>
          </Step>

          <Step id="tangent" no={5} title="접점 P, Q (같은 쪽)" active={active.has('tangent')}>
            <Eq>
              T<sub>±</sub> = C + (r²/D²)·v ± (rH/D²)·J(v)
              <br />
              v = S − C, H = √(D² − r²), J(v) = (−v<sub>y</sub>, v<sub>x</sub>)
            </Eq>
            <div className="kv">
              <span>P (S = O)</span>
              <span>{pt(c.P)}</span>
              <span>Q (S = A)</span>
              <span>{pt(c.Q)}</span>
            </div>
            <p className="tiny muted">
              P, Q 모두 y − x {c.side === 1 ? '> 0' : '< 0'} · 검산 |T−C| − r ≈ {c.checks.tangentP.radiusError.toExponential(1)}, 반지름 ⟂ 접선 ✔
            </p>
          </Step>

          <Step id="length" no={6} title="접선 길이 — 피타고라스" active={active.has('length')}>
            <Eq>
              OP = √(a² + b² − r²) = √({sq(a)} + {sq(b)} − {sq(r, 0)}) = <b>{km(c.OP)}</b>
              <br />
              AQ = √((t−a)² + (t−b)² − r²) = <b>{km(c.AQ)}</b>
            </Eq>
            <p className="tiny muted">∠CPO = ∠CQA = 90° (반지름 ⟂ 접선). 양쪽 후보의 접선 길이는 같고, 차이는 원호뿐입니다.</p>
          </Step>

          <Step id="R" no={7} title="두 접선의 교점 R" active={active.has('R')}>
            {c.R ? (
              <>
                <Eq>
                  u = P − C, v = Q − C, Δ = u<sub>x</sub>v<sub>y</sub> − u<sub>y</sub>v<sub>x</sub> = {num(c.delta, 0)}
                  <br />
                  R = (a + r²(v<sub>y</sub>−u<sub>y</sub>)/Δ, b + r²(u<sub>x</sub>−v<sub>x</sub>)/Δ) = {pt(c.R)}
                  <br />d = CR = <b>{km(c.CR!)}</b>
                </Eq>
                <p className="tiny muted">△PCR ≡ △QCR (RHS 합동) → CR은 ∠PCQ를 이등분: ∠PCR = ∠RCQ = α</p>
              </>
            ) : (
              <p>두 접선이 거의 평행합니다 (Δ ≈ 0). 중심각이 180°에 가까워 α = 90°로 둡니다.</p>
            )}
          </Step>

          <Step id="table" no={8} title="삼각비표로 α 찾기" active={active.has('table')}>
            {c.lookup ? (
              <>
                <Eq>
                  cos α = PC / CR = r / d = {num(r, 0)} / {num(c.CR!, 2)} = {num(c.cosineRatio!, 6)}
                </Eq>
                <CosineLookupTable lookup={c.lookup} />
              </>
            ) : (
              <p>cos α → 0 이므로 α = 90°.</p>
            )}
          </Step>

          <Step id="arc" no={9} title="원호 PQ의 길이" active={active.has('arc')}>
            <Eq>
              중심각 ∠PCQ = 2α = <b>{deg(c.centralAngleDeg, 4)}</b>
              <br />호 PQ = 2πr × (2α/360) = πrα/90 = <b>{km(c.arcLength)}</b>
            </Eq>
            <p className="tiny muted">원호를 현 PQ로 바꾸면 원 내부를 지나므로 안 됩니다. P, Q에서 비행 방향은 원호의 접선 방향과 같아 꺾이지 않습니다.</p>
          </Step>

          <Step id="total" no={10} title="최단 우회 거리" active={active.has('total')}>
            <Eq>
              L<sub>min</sub> = OP + 호PQ + QA
              <br />= {num(c.OP, 1)} + {num(c.arcLength, 1)} + {num(c.AQ, 1)} = <b>{km(s.path.totalLength)}</b>
              <br />
              ΔL = L<sub>min</sub> − t√2 = {km(s.path.extraLength)} ({num(s.path.increasePct, 3)}%)
            </Eq>
            {s.path.other && (
              <details className="tiny">
                <summary>반대쪽 후보 계산</summary>
                <div className="eq">
                  α′ ≈ {deg(s.path.other.alphaDeg, 4)}, 2α′ = {deg(s.path.other.smallAngleDeg, 4)}
                  <br />
                  {s.path.other.isMajorArc
                    ? `실제 진행 방향의 원호는 180°보다 큰 큰 호 → 중심각 = 360° − 2α′ = ${deg(s.path.other.centralAngleDeg, 4)}`
                    : `작은 호 → 중심각 = 2α′ = ${deg(s.path.other.centralAngleDeg, 4)}`}
                  <br />
                  호 = {km(s.path.other.arcLength)}, 총 {km(s.path.other.totalLength)}
                </div>
              </details>
            )}
          </Step>
        </>
      )}
      <p className="model-note tiny muted">
        모든 거리는 인천 중심 방위정거리 평면 위의 거리(km)입니다. 인천에서 뻗어 나가는 거리만 정확히 보존되며, 태풍 주변의 거리는 근삿값입니다. 실제
        기상·영공·연료·고도는 반영하지 않은 2차원 기하 모델입니다.
      </p>
    </div>
  );
}
