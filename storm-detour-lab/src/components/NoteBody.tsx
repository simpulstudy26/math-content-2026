import type { ReactNode } from 'react';
import type { Trip } from '../math/trip';
import type { NoteId } from '../story/notes';
import { COS_TABLE } from '../math/cosTable';
import { AH } from './Hat';
import { num, sq } from '../format';

const Eq = ({ children }: { children: ReactNode }) => <div className="eq">{children}</div>;
const B = ({ children }: { children: ReactNode }) => <b className="hl">{children}</b>;
const P2 = (p: { x: number; y: number }, d = 2) => `(${num(p.x, d)}, ${num(p.y, d)})`;

/** 노트 한 장의 내용 — 이 여행의 숫자를 문서의 일반식에 대입한다 */
export function NoteBody({ id, trip }: { id: NoteId; trip: Trip }) {
  const { t } = trip;
  const r = trip.input.radius;
  const res = trip.result;
  const a = res.a;
  const b = res.b;
  const d = res.detour;

  switch (id) {
    case 'setup':
      return (
        <>
          <p>출발점에서 목적지로 향하는 방향을 처음부터 양의 x축으로 잡았어요. 레이더 화면이 곧 이 좌표평면입니다.</p>
          <Eq>
            O = (0, 0), A = (t, 0), t = <B>{num(t, 1)}</B> km
            <br />
            직선 항로: y = 0, 0 ≤ x ≤ t
            <br />
            태풍: (x − {num(a, 1)})² + (y − {num(b, 1)})² = {num(r, 0)}²
          </Eq>
        </>
      );
    case 'cross':
      return (
        <>
          <p>원의 방정식에 y = 0을 넣어 교점을 구해요.</p>
          <Eq>
            (x − a)² = r² − b² = {sq(r, 0)} − {sq(b, 1)} = {num(res.r2mb2, 1)}
            <br />h = √(r² − b²) = <B>{res.h !== null ? num(res.h, 2) : '—'}</B>
            <br />
            B₁ = (a − h, 0) = ({res.B1 ? num(res.B1.x, 2) : '—'}, 0), B₂ = ({res.B2 ? num(res.B2.x, 2) : '—'}, 0)
          </Eq>
          {res.B1 && res.B2 && (
            <Eq>
              0 &lt; {num(res.B1.x, 1)} &lt; {num(res.B2.x, 1)} &lt; {num(t, 1)} ✔ → 두 교점 모두 선분 OA 위, 우회 필요
            </Eq>
          )}
          <p className="small">이 부등식 하나로 |b| &lt; r, 출발·도착점이 원 밖, 두 교점이 선분 위가 한꺼번에 보장돼요.</p>
        </>
      );
    case 'side':
      return d ? (
        <>
          <Eq>
            b = {num(b, 2)} {b > 0 ? '> 0' : b < 0 ? '< 0' : '= 0'} → s = <B>{d.s > 0 ? '+1' : '−1'}</B> ({d.s > 0 ? 'x축 위쪽' : 'x축 아래쪽'}으로 우회)
          </Eq>
          <p>
            {d.symmetric
              ? '중심이 항로 위에 있어 두 길이 똑같아요. 위쪽을 대표로 골랐어요.'
              : `태풍 중심이 항로의 ${b > 0 ? '위' : '아래'}쪽에 있으니, 반대편인 ${b > 0 ? '아래' : '위'}쪽 원호가 더 짧아요. 두 경로의 접선 길이 합은 같고 원호만 달라요.`}
          </p>
        </>
      ) : null;
    case 'why':
      return (
        <ul className="why">
          <li>
            <b>원 밖은 직선</b> — 꺾인 길은 삼각형의 부등식 XY + YZ ≥ XZ 때문에 펴면 짧아져요.
          </li>
          <li>
            <b>원 둘레는 원호</b> — 더 바깥으로 돌면 같은 중심각에도 길이가 늘어요.
          </li>
          <li>
            <b>들어오고 나가는 길은 접선</b> — 접점이 아닌 곳에서 꺾이면 더 짧게 잇는 길이 생겨요.
          </li>
          <li className="formula">L = OP + 호 PQ + QA</li>
        </ul>
      );
    case 'tangent':
      return d ? (
        <>
          <p>접선 ⟂ 반지름이라 △OCP, △ACQ는 직각삼각형이에요.</p>
          <Eq>
            D_O = a² + b² = {num(d.DO, 0)}
            <br />ℓ_O = OP = √(D_O − r²) = <B>{num(d.lO, 1)}</B> km
            <br />
            D_A = (t − a)² + b² = {num(d.DA, 0)}
            <br />ℓ_A = AQ = √(D_A − r²) = <B>{num(d.lA, 1)}</B> km
          </Eq>
        </>
      ) : null;
    case 'points':
      return d ? (
        <>
          <p>원의 방정식과 수직 조건을 연립한 일반식에 s = {d.s > 0 ? '+1' : '−1'}을 대입해요.</p>
          <Eq>
            P = ((aℓ_O² − sbrℓ_O)/D_O, (bℓ_O² + sarℓ_O)/D_O)
            <br />= <B>{P2(d.P)}</B>
            <br />
            Q = (a + ((t−a)r² + sbrℓ_A)/D_A, b + (−br² + s(t−a)rℓ_A)/D_A)
            <br />= <B>{P2(d.Q)}</B>
          </Eq>
          <p className="small">
            검산: P, Q의 y좌표가 모두 {d.s > 0 ? '양수' : '음수'} → 같은 쪽 ✔ · (q_x − a)² + (q_y − b)² = r² ✔
          </p>
        </>
      ) : null;
    case 'turnP':
      return (
        <p>
          비행기가 접점 P에 닿았어요. 여기서 진행 방향은 반지름 CP와 수직이라, 꺾이지 않고 그대로 원 둘레를 따라 {d?.arcDir === 1 ? '왼쪽' : '오른쪽'}으로 부드럽게 선회합니다. 창밖
          {d?.arcDir === 1 ? ' 왼쪽' : ' 오른쪽'}에 태풍의 소용돌이가 보여요.
        </p>
      );
    case 'R':
      return d ? (
        <>
          <p>접선 OP와 AQ를 연장한 두 직선의 교점 R을 구해요.</p>
          <Eq>
            OP: p_y x − p_x y = 0
            <br />
            AQ: q_y(x − t) − (q_x − t)y = 0
            <br />H = p_x q_y − p_y(q_x − t) = {num(d.H, 1)}
            <br />R = (t p_x q_y / H, t p_y q_y / H) = <B>{P2(d.R)}</B>
            <br />
            CR = d_R = √((u − a)² + (v − b)²) = <B>{num(d.dR, 2)}</B>
          </Eq>
        </>
      ) : null;
    case 'table': {
      if (!d) return null;
      const it = d.interp;
      const rows = COS_TABLE.slice(Math.max(0, it.lower.deg - 1), Math.min(91, it.upper.deg + 2));
      return (
        <>
          <p>△CPR ≡ △CQR 이므로 ∠PCQ = 2α, cos α = CP / CR.</p>
          <Eq>
            z = r / CR = {num(r, 0)} / {num(d.dR, 2)} = <B>{it.z.toFixed(8)}</B>
          </Eq>
          <div className="mini-table">
            {rows.map((row) => (
              <div key={row.deg} className={row.deg === it.lower.deg || row.deg === it.upper.deg ? 'hit' : ''}>
                <span>cos {row.deg}°</span>
                <span className="mono">{row.cos.toFixed(8)}</span>
              </div>
            ))}
          </div>
          {it.exactHit ? (
            <Eq>
              표의 값과 정확히 같아요 → {AH} = <B>{it.alphaHat}°</B>
            </Eq>
          ) : (
            <Eq>
              두 점 ({it.lower.deg}, {it.lower.cos.toFixed(8)}), ({it.upper.deg}, {it.upper.cos.toFixed(8)})
              <br />y = {it.m.toFixed(8)}x + {it.n.toFixed(8)}
              <br />y = z 대입 → {AH} = <B>{num(d.alphaHat, 6)}°</B>, 2{AH} = {num(d.centralHat, 6)}°
            </Eq>
          )}
          <p className="small">역삼각함수 없이, 표의 두 점을 잇는 일차함수로만 구했어요.</p>
        </>
      );
    }
    case 'arc':
      return d ? (
        <Eq>
          호 PQ = 2πr × 2{AH}/360 = πr{AH}/90
          <br />= π × {num(r, 0)} × {num(d.alphaHat, 4)} / 90 = <B>{num(d.arcHat, 1)}</B> km
        </Eq>
      ) : null;
    case 'exitQ':
      return <p>접점 Q에서 원 둘레를 떠나요. 진행 방향이 접선 QA와 같아서, 다시 꺾임 없이 목적지 A를 향해 곧게 날아갑니다.</p>;
    case 'total':
      return d ? (
        <>
          <Eq>
            L_min ≈ ℓ_O + πr{AH}/90 + ℓ_A
            <br />= {num(d.lO, 1)} + {num(d.arcHat, 1)} + {num(d.lA, 1)} = <B>{num(d.Lmin, 1)}</B> km
            <br />L_직선 = t = {num(t, 1)} km
            <br />
            ΔL = L_min − t = <B>{num(d.extra, 1)}</B> km (우회 증가율 {num(d.increasePct, 2)}%)
          </Eq>
          {d.approxBelowStraight && (
            <p className="small warn">
              어? 근삿값이 직선보다 짧게 나왔어요. 태풍이 항로를 아주 살짝만 걸쳐서, 표 보간 오차(최대 πr/360)가 실제로 늘어난 거리보다 커졌기 때문이에요. 실제 우회 거리는 항상
              직선보다 깁니다.
            </p>
          )}
        </>
      ) : null;
    case 'error':
      return d ? (
        <>
          <p>1° 간격 표의 선형 보간은 실제 α보다 조금 작게 나와요(코사인 그래프가 위로 볼록하니까).</p>
          <Eq>
            실제 도형에서 잰 α = {num(d.alphaTrue, 6)}°
            <br />α − {AH} = <B>{num(d.interpErrorDeg, 6)}°</B> (0 이상 0.25° 미만)
            <br />
            거리 오차 = πr|α − {AH}|/90 = {num(d.interpErrorLen, 3)} km
            <br />
            상한 πr/360 = {num(d.interpErrorBound, 2)} km
          </Eq>
        </>
      ) : null;
  }
}
