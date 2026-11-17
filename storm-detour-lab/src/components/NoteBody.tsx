import type { ReactNode } from 'react';
import type { Trip } from '../math/trip';
import type { NoteId } from '../story/notes';
import { COS_TABLE } from '../math/cosTable';
import { Tex, tn, tsq } from './Tex';

const M = ({ children }: { children: ReactNode }) => <div className="math">{children}</div>;
const T = (s: string) => <Tex>{s}</Tex>;
const TB = (s: string) => <Tex block>{s}</Tex>;
const pt = (p: { x: number; y: number }, d = 2) => `(${tn(p.x, d)},\\ ${tn(p.y, d)})`;

/** 노트 한 장의 내용 — 이 여행의 숫자를 문서의 일반식에 대입한다 (KaTeX로 조판) */
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
          <p>출발점에서 목적지로 향하는 방향을 처음부터 양의 {T('x')}축으로 잡았어요. 레이더 화면이 곧 이 좌표평면입니다.</p>
          <M>
            {TB(`O=(0,0),\\quad A=(t,0),\\quad t=\\mathbf{${tn(t, 1)}}\\ \\text{km}`)}
            {TB(`\\text{항로: } y=0\\ (0\\le x\\le t)`)}
            {TB(`\\text{태풍: } (x-${tn(a, 1)})^2+(y-${tn(b, 1)})^2=${tn(r, 0)}^2`)}
          </M>
        </>
      );
    case 'cross':
      return (
        <>
          <p>원의 방정식에 {T('y=0')}을 넣어 교점을 구해요.</p>
          <M>
            {TB(`(x-a)^2=r^2-b^2=${tsq(r, 0)}-${tsq(b, 1)}=${tn(res.r2mb2, 1)}`)}
            {TB(`h=\\sqrt{r^2-b^2}=\\mathbf{${res.h !== null ? tn(res.h, 2) : '-'}}`)}
            {res.B1 && res.B2 && TB(`B_1=(${tn(res.B1.x, 2)},\\,0),\\quad B_2=(${tn(res.B2.x, 2)},\\,0)`)}
            {res.B1 && res.B2 && TB(`0<${tn(res.B1.x, 1)}<${tn(res.B2.x, 1)}<${tn(t, 1)}\\ \\checkmark`)}
          </M>
          <p className="small">
            부등식 {T('0<a-h<a+h<t')} 하나로 {T('|b|<r')}, 출발·도착점이 원 밖, 두 교점이 선분 위가 한꺼번에 보장돼요.
          </p>
        </>
      );
    case 'side':
      return d ? (
        <>
          <M>{TB(`b=${tn(b, 2)}${b > 0 ? '>0' : b < 0 ? '<0' : '=0'}\\ \\Longrightarrow\\ s=\\mathbf{${d.s > 0 ? '+1' : '-1'}}`)}</M>
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
            <b>원 밖은 직선</b> — 꺾인 길은 삼각형의 부등식 {T('\\overline{XY}+\\overline{YZ}\\ge\\overline{XZ}')} 때문에 펴면 짧아져요.
          </li>
          <li>
            <b>원 둘레는 원호</b> — 더 바깥으로 돌면 같은 중심각에도 길이가 늘어요.
          </li>
          <li>
            <b>들어오고 나가는 길은 접선</b> — 접점이 아닌 곳에서 꺾이면 더 짧게 잇는 길이 생겨요.
          </li>
          <li className="formula">{TB(`L=\\overline{OP}+\\overset{\\frown}{PQ}+\\overline{QA}`)}</li>
        </ul>
      );
    case 'tangent':
      return d ? (
        <>
          <p>접선 ⟂ 반지름이라 {T('\\triangle OCP,\\ \\triangle ACQ')}는 직각삼각형이에요.</p>
          <M>
            {TB(`D_O=a^2+b^2=${tn(d.DO, 0)}`)}
            {TB(`\\ell_O=\\overline{OP}=\\sqrt{D_O-r^2}=\\mathbf{${tn(d.lO, 1)}}`)}
            {TB(`D_A=(t-a)^2+b^2=${tn(d.DA, 0)}`)}
            {TB(`\\ell_A=\\overline{AQ}=\\sqrt{D_A-r^2}=\\mathbf{${tn(d.lA, 1)}}`)}
          </M>
        </>
      ) : null;
    case 'points':
      return d ? (
        <>
          <p>원의 방정식과 수직 조건을 연립한 일반식에 {T(`s=${d.s > 0 ? '+1' : '-1'}`)}을 대입해요.</p>
          <M>
            {TB(`P=\\left(\\frac{a\\ell_O^2-sbr\\ell_O}{D_O},\\ \\frac{b\\ell_O^2+sar\\ell_O}{D_O}\\right)`)}
            {TB(`=\\mathbf{${pt(d.P)}}`)}
            {TB(`Q=\\left(a+\\frac{(t-a)r^2+sbr\\ell_A}{D_A},\\ b+\\frac{-br^2+s(t-a)r\\ell_A}{D_A}\\right)`)}
            {TB(`=\\mathbf{${pt(d.Q)}}`)}
          </M>
          <p className="small">
            검산: {T('p_y,\\ q_y')}가 모두 {d.s > 0 ? '양수' : '음수'} → 같은 쪽 ✔ · {T('(q_x-a)^2+(q_y-b)^2=r^2')} ✔
          </p>
        </>
      ) : null;
    case 'turnP':
      return (
        <p>
          접점 {T('P')}에 닿았어요. 여기서 진행 방향은 반지름 {T('CP')}와 수직이라, 꺾이지 않고 그대로 원 둘레를 따라 {d?.arcDir === 1 ? '왼쪽' : '오른쪽'}으로 선회합니다. 창밖
          {d?.arcDir === 1 ? ' 왼쪽' : ' 오른쪽'}으로 태풍의 구름벽이 지나가요.
        </p>
      );
    case 'R':
      return d ? (
        <>
          <p>접선 {T('OP')}와 {T('AQ')}를 연장한 두 직선의 교점 {T('R=(u,v)')}을 구해요.</p>
          <M>
            {TB(`OP:\\ p_y x-p_x y=0`)}
            {TB(`AQ:\\ q_y(x-t)-(q_x-t)y=0`)}
            {TB(`H=p_xq_y-p_y(q_x-t)=${tn(d.H, 1)}`)}
            {TB(`R=\\left(\\frac{t\\,p_xq_y}{H},\\ \\frac{t\\,p_yq_y}{H}\\right)=\\mathbf{${pt(d.R)}}`)}
            {TB(`\\overline{CR}=d_R=\\sqrt{(u-a)^2+(v-b)^2}=\\mathbf{${tn(d.dR, 2)}}`)}
          </M>
        </>
      ) : null;
    case 'table': {
      if (!d) return null;
      const it = d.interp;
      const rows = COS_TABLE.slice(Math.max(0, it.lower.deg - 1), Math.min(91, it.upper.deg + 2));
      return (
        <>
          <p>
            {T('\\triangle CPR\\equiv\\triangle CQR')} 이므로 {T('\\angle PCQ=2\\alpha')}, {T('\\cos\\alpha=\\dfrac{\\overline{CP}}{\\overline{CR}}')}.
          </p>
          <M>{TB(`z=\\frac{r}{\\overline{CR}}=\\frac{${tn(r, 0)}}{${tn(d.dR, 2)}}=\\mathbf{${it.z.toFixed(8)}}`)}</M>
          <div className="mini-table">
            {rows.map((row) => (
              <div key={row.deg} className={row.deg === it.lower.deg || row.deg === it.upper.deg ? 'hit' : ''}>
                <span>{T(`\\cos ${row.deg}^\\circ`)}</span>
                <span className="mono">{row.cos.toFixed(8)}</span>
              </div>
            ))}
          </div>
          {it.exactHit ? (
            <M>{TB(`\\hat\\alpha=\\mathbf{${it.alphaHat}^\\circ}`)}</M>
          ) : (
            <M>
              {TB(`(${it.lower.deg},\\ ${it.lower.cos.toFixed(8)}),\\ (${it.upper.deg},\\ ${it.upper.cos.toFixed(8)})`)}
              {TB(`y=${it.m.toFixed(8)}\\,x+${it.n.toFixed(8)}`)}
              {TB(`y=z\\ \\Rightarrow\\ \\hat\\alpha=\\mathbf{${tn(d.alphaHat, 6)}^\\circ},\\quad 2\\hat\\alpha=${tn(d.centralHat, 6)}^\\circ`)}
            </M>
          )}
          <p className="small">역삼각함수 없이, 표의 두 점을 잇는 일차함수로만 구했어요.</p>
        </>
      );
    }
    case 'arc':
      return d ? (
        <M>
          {TB(`\\overset{\\frown}{PQ}=2\\pi r\\cdot\\frac{2\\hat\\alpha}{360}=\\frac{\\pi r\\hat\\alpha}{90}`)}
          {TB(`=\\frac{\\pi\\times${tn(r, 0)}\\times${tn(d.alphaHat, 4)}}{90}=\\mathbf{${tn(d.arcHat, 1)}}\\ \\text{km}`)}
        </M>
      ) : null;
    case 'exitQ':
      return (
        <p>
          접점 {T('Q')}에서 원 둘레를 떠나요. 진행 방향이 접선 {T('QA')}와 같아서, 꺾임 없이 목적지 {T('A')}를 향해 곧게 날아갑니다.
        </p>
      );
    case 'total':
      return d ? (
        <>
          <M>
            {TB(`L_{\\min}\\approx\\ell_O+\\frac{\\pi r\\hat\\alpha}{90}+\\ell_A`)}
            {TB(`=${tn(d.lO, 1)}+${tn(d.arcHat, 1)}+${tn(d.lA, 1)}=\\mathbf{${tn(d.Lmin, 1)}}\\ \\text{km}`)}
            {TB(`L_{\\text{직선}}=t=${tn(t, 1)}\\ \\text{km}`)}
            {TB(`\\Delta L=L_{\\min}-t=\\mathbf{${tn(d.extra, 1)}}\\ \\text{km}\\ \\ (${tn(d.increasePct, 2)}\\%)`)}
          </M>
          {d.approxBelowStraight && (
            <p className="small warn">
              근삿값이 직선보다 짧게 나왔어요. 태풍이 항로를 아주 살짝만 걸쳐서, 표 보간 오차(최대 {T('\\pi r/360')})가 실제로 늘어난 거리보다 커졌기 때문이에요. 실제 우회
              거리는 항상 직선보다 깁니다.
            </p>
          )}
        </>
      ) : null;
    case 'error':
      return d ? (
        <>
          <p>1° 간격 표의 선형 보간은 실제 {T('\\alpha')}보다 조금 작게 나와요 (코사인 그래프가 위로 볼록하니까).</p>
          <M>
            {TB(`\\alpha_{\\text{실제}}=${tn(d.alphaTrue, 6)}^\\circ`)}
            {TB(`\\alpha-\\hat\\alpha=\\mathbf{${tn(d.interpErrorDeg, 6)}^\\circ}\\quad(0\\le\\alpha-\\hat\\alpha<0.25^\\circ)`)}
            {TB(`|\\Delta L_{\\text{보간}}|=\\frac{\\pi r}{90}|\\alpha-\\hat\\alpha|=${tn(d.interpErrorLen, 3)}\\ \\text{km}`)}
            {TB(`<\\frac{\\pi r}{360}=${tn(d.interpErrorBound, 2)}\\ \\text{km}`)}
          </M>
        </>
      ) : null;
  }
}
