import type { CosineLookup } from '../math/angleTable';
import { num } from '../format';

/** 삼각비표 역조회 과정 (명세 9-2) — 표의 근처 값과 이분 탐색 단계를 보여 준다 */
export function CosineLookupTable({ lookup }: { lookup: CosineLookup }) {
  const firstSteps = lookup.steps.slice(0, 6);
  return (
    <div className="costable">
      <table>
        <thead>
          <tr>
            <th>각도</th>
            <th>cos</th>
          </tr>
        </thead>
        <tbody>
          {lookup.nearbyRows.map((row) => {
            const inBracket = row.deg === lookup.lower.deg || row.deg === lookup.upper.deg;
            return (
              <tr key={row.deg} className={inBracket ? 'hit' : ''}>
                <td>{row.deg}°</td>
                <td className="mono">{row.cos.toFixed(4)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="costable-side">
        <div>
          찾는 값 <span className="mono">r/d = {lookup.target.toFixed(6)}</span>
        </div>
        <div>
          표에서 <b>{lookup.lower.deg}°</b>({lookup.lower.cos.toFixed(4)}) 와 <b>{lookup.upper.deg}°</b>(
          {lookup.upper.cos.toFixed(4)}) 사이
        </div>
        <div>
          선형보간 ≈ <span className="mono">{num(lookup.interpolatedDeg, 3)}°</span>
        </div>
        <details>
          <summary>이분 탐색으로 좁히기 ({lookup.steps.length}회)</summary>
          <ol className="bisect">
            {firstSteps.map((s, i) => (
              <li key={i} className="mono">
                [{num(s.lo, 4)}, {num(s.hi, 4)}] 중간 {num(s.mid, 4)}° → cos {s.cosMid.toFixed(5)} {s.cosMid > lookup.target ? '> 목표 → 오른쪽' : '≤ 목표 → 왼쪽'}
              </li>
            ))}
            {lookup.steps.length > firstSteps.length && <li className="muted">… 구간 폭이 10⁻¹⁰° 이하가 될 때까지 반복</li>}
          </ol>
        </details>
        <div className="result-line">
          표에서 찾은 α ≈ <b className="mono">{num(lookup.alphaDeg, 6)}°</b>
        </div>
        <div className="tiny muted">cos는 0°~90°에서 감소하므로 구간을 절반씩 줄일 수 있다. 역삼각함수(arccos)는 쓰지 않았다.</div>
      </div>
    </div>
  );
}
