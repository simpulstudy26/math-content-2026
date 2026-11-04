import type { ScenarioResult } from '../math/scenario';
import { SIDE_LABEL } from '../math/detour';
import { km, num } from '../format';

export function ComparisonSummary({ scenario: s }: { scenario: ScenarioResult }) {
  const p = s.path;
  return (
    <div className="summary">
      <div className="sum-cell">
        <span>기본 직선 OA</span>
        <b>{km(p.directLength)}</b>
      </div>
      <div className="sum-cell accent">
        <span>최단 우회 L<sub>min</sub></span>
        <b>{km(p.totalLength)}</b>
      </div>
      <div className="sum-cell">
        <span>추가 거리 ΔL</span>
        <b>
          +{km(p.extraLength)} <small>({num(p.increasePct, 2)}%)</small>
        </b>
      </div>
      {p.chosen && p.other && (
        <div className="sum-wide tiny">
          선택: {SIDE_LABEL[String(p.chosen.side)]} {s.math.tie && '(b = a, 양쪽 동일)'} · 반대쪽 후보 {km(p.other.totalLength)}
          {p.other.isMajorArc && ' (큰 호)'}
          {s.math.ruleAgrees === false && <span className="bad-text"> · ⚠ b−a 규칙과 계산 결과 불일치</span>}
        </div>
      )}
    </div>
  );
}
