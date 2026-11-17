/**
 * 공항 출국장 일러스트 (오리지널, SVG). 여행자가 캐리어를 끌고 들어와 체크인 카운터에서 안내원을 만난다.
 *  mode = 'enter'   여행자가 걸어 들어오는 애니메이션
 *         'counter' 카운터 앞에 서 있는 장면
 *         'warn'    안내원이 기상 화면의 태풍 경보를 가리키는 장면
 * 말풍선은 HTML로 겹쳐 그린다 (글자 줄바꿈을 위해). 좌표는 viewBox(1600×900)의 백분율.
 */
import type { CSSProperties } from 'react';

export interface Bubble {
  who: 'agent' | 'traveler';
  text: string;
  /** 나타나는 시각 (초) */
  delay?: number;
  tone?: 'normal' | 'alert';
}

interface Props {
  mode: 'enter' | 'counter' | 'warn';
  bubbles?: Bubble[];
  destLabel?: string;
}

const NAVY = '#1b2b4a';
const GOLD = '#c9a252';

function Traveler() {
  return (
    <g className="trv">
      {/* 캐리어 */}
      <g className="trv-case" transform="translate(-118 0) rotate(-14 0 0)">
        <rect x="-38" y="-150" width="76" height="132" rx="12" fill="#d8735a" />
        {[-20, 0, 20].map((x) => (
          <rect key={x} x={x - 2} y="-142" width="4" height="116" rx="2" fill="#b95b44" />
        ))}
        <rect x="-38" y="-96" width="76" height="8" fill="#c9a252" opacity="0.8" />
        <rect x="-6" y="-215" width="5" height="68" fill="#5c6470" />
        <rect x="6" y="-215" width="5" height="68" fill="#5c6470" />
        <rect x="-10" y="-221" width="25" height="9" rx="4" fill="#2e3440" />
        <circle cx="-26" cy="-12" r="11" fill="#2e3440" />
        <circle cx="26" cy="-12" r="11" fill="#2e3440" />
      </g>
      {/* 뒷다리 */}
      <g className="leg back">
        <rect x="-14" y="-150" width="28" height="140" rx="12" fill="#24314a" />
        <ellipse cx="8" cy="-8" rx="24" ry="10" fill="#1d1f24" />
      </g>
      {/* 뒷팔 → 캐리어 손잡이 */}
      <path d="M -8 -262 Q -50 -230 -96 -214" stroke="#b67d2e" strokeWidth="22" strokeLinecap="round" fill="none" />
      <circle cx="-100" cy="-214" r="11" fill="#e3b08a" />
      {/* 몸 (코트) */}
      <path d="M -44 -290 Q -50 -200 -54 -132 L 52 -132 Q 46 -205 42 -290 Q 0 -306 -44 -290 Z" fill="#c98f3a" />
      <path d="M -2 -292 L -2 -134" stroke="#b07a2c" strokeWidth="3" />
      <circle cx="10" cy="-240" r="4" fill="#8a5f22" />
      <circle cx="10" cy="-205" r="4" fill="#8a5f22" />
      {/* 앞다리 */}
      <g className="leg front">
        <rect x="-14" y="-150" width="28" height="140" rx="12" fill="#2d3b55" />
        <ellipse cx="8" cy="-8" rx="24" ry="10" fill="#22252b" />
      </g>
      {/* 목도리 */}
      <path d="M -34 -296 Q 0 -280 34 -296 L 30 -278 Q 0 -266 -30 -278 Z" fill="#a3322b" />
      <path d="M 18 -284 L 30 -232 L 16 -230 L 8 -280 Z" fill="#a3322b" />
      {/* 앞팔 */}
      <g className="arm front">
        <path d="M 22 -270 Q 40 -220 34 -176" stroke="#c98f3a" strokeWidth="22" strokeLinecap="round" fill="none" />
        <circle cx="34" cy="-170" r="11" fill="#e3b08a" />
      </g>
      {/* 머리 */}
      <circle cx="6" cy="-330" r="36" fill="#e3b08a" />
      <path d="M -30 -330 Q -34 -372 6 -374 Q 44 -372 42 -338 Q 30 -352 4 -350 Q -14 -340 -30 -330 Z" fill="#3a2a22" />
      <path d="M -31 -332 Q -38 -310 -26 -300 L -22 -330 Z" fill="#3a2a22" />
      <circle cx="30" cy="-332" r="3.5" fill="#3a2a22" />
    </g>
  );
}

function Agent({ pointing }: { pointing: boolean }) {
  return (
    <g>
      {/* 몸 */}
      <path d="M -62 0 Q -64 -110 -40 -150 Q 0 -166 40 -150 Q 64 -110 62 0 Z" fill={NAVY} />
      <path d="M -18 -152 L 0 -100 L 18 -152 Z" fill="#f4f1ea" />
      <path d="M -22 -150 Q 0 -128 22 -150 L 14 -134 Q 0 -122 -14 -134 Z" fill={GOLD} />
      <rect x="22" y="-110" width="22" height="7" rx="2" fill={GOLD} />
      {/* 팔 */}
      {pointing ? (
        <g>
          <path d="M 44 -138 Q 92 -170 128 -214" stroke={NAVY} strokeWidth="24" strokeLinecap="round" fill="none" />
          <circle cx="134" cy="-220" r="11" fill="#e8bd98" />
        </g>
      ) : (
        <path d="M 46 -132 Q 66 -80 54 -40" stroke={NAVY} strokeWidth="24" strokeLinecap="round" fill="none" />
      )}
      <path d="M -46 -132 Q -66 -80 -54 -40" stroke={NAVY} strokeWidth="24" strokeLinecap="round" fill="none" />
      {/* 머리 */}
      <rect x="-12" y="-176" width="24" height="26" fill="#e8bd98" />
      <circle cx="0" cy="-200" r="34" fill="#e8bd98" />
      <path d="M -36 -196 Q -40 -240 0 -240 Q 40 -240 36 -196 Q 26 -222 0 -222 Q -26 -222 -36 -196 Z" fill="#2c211c" />
      <circle cx={-38} cy={-188} r={15} fill="#2c211c" />
      {/* 모자 */}
      <g transform="rotate(-8 0 -236)">
        <rect x="-30" y="-252" width="60" height="22" rx="8" fill={NAVY} />
        <rect x="-30" y="-238" width="60" height="6" fill={GOLD} />
        <circle cx="0" cy="-243" r="5" fill={GOLD} />
      </g>
      <circle cx="-11" cy="-198" r="3.2" fill="#2c211c" />
      <circle cx="11" cy="-198" r="3.2" fill="#2c211c" />
      <path d="M -8 -182 Q 0 -176 8 -182" stroke="#b5714f" strokeWidth="3" fill="none" strokeLinecap="round" />
    </g>
  );
}

function Silhouette({ x, y, s, cls }: { x: number; y: number; s: number; cls: string }) {
  return (
    <g className={cls} transform={`translate(${x} ${y}) scale(${s})`} opacity="0.32">
      <circle cx="0" cy="-300" r="30" fill="#8c8578" />
      <path d="M -38 -268 Q 0 -280 38 -268 L 44 -120 L -44 -120 Z" fill="#8c8578" />
      <rect x="-30" y="-130" width="24" height="130" rx="10" fill="#8c8578" />
      <rect x="6" y="-130" width="24" height="130" rx="10" fill="#8c8578" />
    </g>
  );
}

export function AirportScene({ mode, bubbles = [], destLabel }: Props) {
  const warn = mode === 'warn';
  const rows: [string, string, string, string][] = [
    ['09:10', destLabel ? destLabel.toUpperCase().slice(0, 12) : 'TOKYO', 'G12', '탑승 중'],
    ['10:40', 'PARIS', 'G07', '정시'],
    ['11:25', 'NEW YORK', 'G21', '정시'],
    ['12:05', 'SYDNEY', 'G15', '태풍 주의'],
    ['13:30', 'BANGKOK', 'G03', '정시'],
  ];
  return (
    <div className={`apscene mode-${mode}`}>
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-label="공항 출국장">
        <defs>
          <linearGradient id="ap-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8fb8dc" />
            <stop offset="0.75" stopColor="#dfe8ee" />
            <stop offset="1" stopColor="#f2e3cf" />
          </linearGradient>
          <linearGradient id="ap-floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#d9d3c7" />
            <stop offset="1" stopColor="#bfb7a8" />
          </linearGradient>
          <linearGradient id="ap-wall" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2a3346" />
            <stop offset="1" stopColor="#3b465c" />
          </linearGradient>
        </defs>
        {/* 천장 */}
        <rect x="0" y="0" width="1600" height="90" fill="url(#ap-wall)" />
        {Array.from({ length: 12 }, (_, i) => (
          <ellipse key={i} cx={70 + i * 135} cy="62" rx="34" ry="6" fill="#fff7e0" opacity="0.85" />
        ))}
        {/* 유리벽 + 바깥 풍경 */}
        <rect x="0" y="90" width="1600" height="440" fill="url(#ap-sky)" />
        <rect x="0" y="455" width="1600" height="75" fill="#9aa39a" />
        <rect x="0" y="470" width="1600" height="16" fill="#6d7276" />
        <rect x="0" y="476" width="1600" height="2" fill="#e8e8e2" opacity="0.6" />
        {/* 바깥의 여객기 */}
        <g transform="translate(860 400)">
          <ellipse cx="240" cy="40" rx="240" ry="26" fill="#f4f4f1" />
          <rect x="20" y="44" width="440" height="16" fill={NAVY} opacity="0.9" rx="8" />
          <path d="M 420 30 L 470 -60 L 505 -60 L 490 40 Z" fill={NAVY} />
          <path d="M 180 52 L 330 90 L 360 90 L 260 50 Z" fill="#c9ccd0" />
          <ellipse cx="250" cy="80" rx="26" ry="11" fill="#e9e9e6" />
          {Array.from({ length: 22 }, (_, i) => (
            <rect key={i} x={60 + i * 16} y="30" width="7" height="6" rx="2" fill="#2a3240" />
          ))}
          <path d="M 0 40 Q 6 22 30 18 L 30 40 Z" fill="#2a3240" opacity="0.8" />
        </g>
        {/* 이륙하는 비행기 */}
        <g className="ap-takeoff">
          <path d="M 0 0 L 60 -6 L 70 -12 L 74 -4 L 60 2 L 0 6 Z" fill="#f2f2ef" />
          <path d="M 20 0 L 40 14 L 46 12 L 34 -1 Z" fill="#c9ccd0" />
        </g>
        {/* 창살 */}
        {Array.from({ length: 17 }, (_, i) => (
          <rect key={i} x={i * 100 - 3} y="90" width="6" height="440" fill="#4a5568" />
        ))}
        <rect x="0" y="300" width="1600" height="5" fill="#4a5568" />
        <rect x="0" y="524" width="1600" height="10" fill="#3b465c" />
        {/* 바닥 */}
        <rect x="0" y="534" width="1600" height="366" fill="url(#ap-floor)" />
        {Array.from({ length: 9 }, (_, i) => (
          <line key={i} x1={-200 + i * 260} y1="900" x2={500 + i * 90} y2="534" stroke="#cbc4b6" strokeWidth="2" />
        ))}
        <rect x="0" y="534" width="1600" height="60" fill="#fff" opacity="0.12" />
        {/* 출발 안내판 */}
        <g transform="translate(110 130)">
          <rect x="-8" y="-40" width="6" height="40" fill="#3b465c" />
          <rect x="430" y="-40" width="6" height="40" fill="#3b465c" />
          <rect x="-20" y="0" width="470" height="236" rx="10" fill="#141c2b" />
          <text x="0" y="34" fill={GOLD} fontSize="22" fontWeight="700" fontFamily="sans-serif" letterSpacing="3">
            출발 DEPARTURES
          </text>
          {rows.map((r, i) => (
            <g key={i} transform={`translate(0 ${70 + i * 34})`} fontFamily="'JetBrains Mono', monospace" fontSize="19">
              <text x="0" y="0" fill="#ffd27a">
                {r[0]}
              </text>
              <text x="80" y="0" fill="#ffd27a">
                {r[1]}
              </text>
              <text x="250" y="0" fill="#ffd27a">
                {r[2]}
              </text>
              <text x="340" y="0" fill={r[3] === '태풍 주의' ? '#ff8a6a' : '#9fe0b5'} fontFamily="sans-serif">
                {r[3]}
              </text>
            </g>
          ))}
        </g>
        {/* 멀리 걷는 사람들 */}
        <Silhouette x={420} y={700} s={0.55} cls="sil sil1" />
        <Silhouette x={760} y={660} s={0.45} cls="sil sil2" />
        <Silhouette x={300} y={650} s={0.42} cls="sil sil3" />
        {/* 화분 */}
        <g transform="translate(70 820)">
          <rect x="-34" y="-60" width="68" height="60" rx="8" fill="#8a6a4a" />
          <ellipse cx="0" cy="-90" rx="46" ry="54" fill="#5f7d4a" />
          <ellipse cx="-20" cy="-120" rx="26" ry="34" fill="#6f8f56" />
        </g>
        {/* 체크인 카운터 */}
        <g transform="translate(1060 470)">
          <rect x="110" y="-190" width="6" height="110" fill="#3b465c" />
          <rect x="274" y="-190" width="6" height="110" fill="#3b465c" />
          <rect x="70" y="-250" width="250" height="60" rx="8" fill={NAVY} />
          <text x="94" y="-213" fill="#f3ead8" fontSize="26" fontWeight="700" fontFamily="'Gowun Batang', serif">
            체크인
          </text>
          <text x="94" y="-196" fill={GOLD} fontSize="12" fontFamily="sans-serif" letterSpacing="3">
            CHECK-IN · 3
          </text>
          {/* 기상 화면 (안내원 뒤 벽) */}
          <g transform="translate(345 -250)" className={warn ? 'wx-screen alert' : 'wx-screen'}>
            <rect x="0" y="0" width="150" height="104" rx="8" fill="#0f1726" stroke={warn ? '#ff6a4a' : '#3b465c'} strokeWidth="5" />
            {warn ? (
              <>
                <path d="M 18 70 Q 50 40 75 60 Q 100 80 130 50" stroke="#9cc7e4" strokeWidth="3" fill="none" strokeDasharray="6 5" />
                <g className="wx-swirl" transform="translate(76 52)">
                  <circle r="26" fill="rgba(255,106,74,0.25)" stroke="#ff6a4a" strokeWidth="2" />
                  <path d="M 0 0 m -14 0 a 14 14 0 1 1 14 14 M 0 0 m 14 0 a 14 14 0 1 1 -14 -14" stroke="#fff" strokeWidth="3" fill="none" />
                </g>
                <text x="75" y="98" textAnchor="middle" fill="#ff8a6a" fontSize="13" fontWeight="700" fontFamily="sans-serif">
                  태풍 경보
                </text>
              </>
            ) : (
              <>
                <circle cx="62" cy="40" r="14" fill="#f2c46b" />
                <ellipse cx="86" cy="52" rx="28" ry="13" fill="#dfe6ef" />
                <text x="75" y="88" textAnchor="middle" fill="#cfd6e2" fontSize="13" fontFamily="sans-serif">
                  WEATHER
                </text>
              </>
            )}
          </g>
          {/* 안내원 */}
          <g transform="translate(235 120)">
            <Agent pointing={warn} />
          </g>
          {/* 카운터 */}
          <rect x="40" y="96" width="430" height="20" rx="4" fill="#efe9dd" />
          <rect x="52" y="116" width="406" height="200" fill={NAVY} />
          <rect x="52" y="116" width="406" height="8" fill={GOLD} />
          <text x="255" y="222" textAnchor="middle" fill="#f3ead8" opacity="0.85" fontSize="40" fontFamily="'Gowun Batang', serif">3</text>
          <rect x="300" y="60" width="70" height="40" rx="4" fill="#2a3240" />
          <rect x="330" y="96" width="10" height="6" fill="#2a3240" />
        </g>
        {/* 여행자 */}
        <g className="trv-pos">
          <Traveler />
        </g>
      </svg>
      {bubbles.map((b, i) => (
        <div
          key={`${b.who}-${i}-${b.text.slice(0, 8)}`}
          className={`bubble ${b.who} ${b.tone ?? 'normal'}`}
          style={{ animationDelay: `${b.delay ?? 0}s` } as CSSProperties}
        >
          {b.text}
        </div>
      ))}
    </div>
  );
}
