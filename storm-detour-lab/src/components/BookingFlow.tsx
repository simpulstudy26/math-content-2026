import { useEffect, useMemo, useState } from 'react';
import type { Airport, CountryEntry } from '../data/airportTypes';
import type { LatLon } from '../math/geoProjection';
import { STATUS_TEXT } from '../math/detour';
import type { Trip } from '../math/trip';
import { CountryAirportSearch, koreanCountryName } from './CountryAirportSearch';
import { BookingMap } from './BookingMap';
import { AirportScene } from './AirportScene';
import { rng } from '../scene/clouds';
import { num } from '../format';

export interface Storm {
  center: LatLon;
  radius: number;
}

export interface Ticket {
  passenger: string;
  /** 출발 시간대 이름 (예: 아침 출발) — 항공사·편명은 쓰지 않는다 */
  flightNo: string;
  date: string;
  dep: string;
  arr: string;
  seat: string;
  gate: string;
  boarding: string;
}

export interface Popular {
  label: string;
  code: string;
  country: string;
  run: () => void;
}

interface Props {
  countries: CountryEntry[];
  loadError: string | null;
  country: string | null;
  onCountry: (cc: string) => void;
  airports: Airport[] | null;
  loadingAirports: boolean;
  dest: Airport | null;
  onDest: (a: Airport) => void;
  storm: Storm | null;
  onStorm: (s: Storm | null) => void;
  onSuggest: (side: 1 | -1) => void;
  trip: Trip | null;
  tripError: string | null;
  onBoard: (t: Ticket) => void;
  popular: Popular[];
  onAbout: () => void;
}

const STEPS = ['목적지', '출발 시각', '기상', '좌석', '탑승권'];

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (min: number) => `${pad(Math.floor((((min % 1440) + 1440) % 1440) / 60))}:${pad(Math.round(((min % 60) + 60) % 60))}`;
const dur = (m: number) => `${Math.floor(m / 60)}시간 ${pad(m % 60)}분`;

function Barcode({ seed }: { seed: number }) {
  const r = rng(seed);
  const bars: [number, number][] = [];
  let x = 0;
  while (x < 300) {
    const w = 1 + Math.floor(r() * 4);
    bars.push([x, w]);
    x += w + 1 + Math.floor(r() * 3);
  }
  return (
    <svg viewBox="0 0 300 50" className="barcode" preserveAspectRatio="none" aria-hidden>
      {bars.map(([bx, w], i) => (
        <rect key={i} x={bx} y="0" width={w} height="50" fill="currentColor" />
      ))}
    </svg>
  );
}

/** 태풍 모양 표식 (특정 브랜드가 아닌 기상 기호) */
function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-20 -20 40 40" aria-hidden className="bx-mark">
      <path d="M0 0m-10 0a10 10 0 1 1 10 10M0 0m10 0a10 10 0 1 1-10-10" stroke="currentColor" strokeWidth="3.2" fill="none" strokeLinecap="round" />
      <circle r="2.6" fill="currentColor" />
    </svg>
  );
}

function useMapPadding() {
  const calc = () => {
    const w = window.innerWidth;
    return w < 900 ? { top: 90, right: 72, bottom: Math.round(window.innerHeight * 0.58), left: 40 } : { top: 110, right: 70, bottom: 70, left: Math.min(560, w * 0.42) };
  };
  const [p, setP] = useState(calc);
  useEffect(() => {
    const on = () => setP(calc());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return p;
}

export function BookingFlow(p: Props) {
  const [step, setStep] = useState(0);
  const [passenger, setPassenger] = useState('여행자');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [flightIdx, setFlightIdx] = useState<number | null>(null);
  const [seat, setSeat] = useState<string | null>(null);
  const [briefingSeen, setBriefingSeen] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const padding = useMapPadding();
  const trip = p.trip;
  const res = trip?.result;

  const flights = useMemo(() => {
    if (!trip || !p.dest) return [];
    const durMin = Math.round(((trip.t / 830) * 60 + 35) / 5) * 5;
    return [
      { name: '아침 출발', mood: '여유로운 아침', dep: 9 * 60 + 10 },
      { name: '오후 출발', mood: '한낮의 비행', dep: 13 * 60 + 40 },
      { name: '저녁 출발', mood: '해 질 녘 도착', dep: 17 * 60 + 25 },
    ].map((f) => ({ ...f, durMin, arr: f.dep + durMin }));
  }, [trip, p.dest]);

  const taken = useMemo(() => {
    const r = rng((p.dest?.id ?? 7) * 31 + (flightIdx ?? 0));
    const set = new Set<string>();
    for (let row = 1; row <= 24; row++) for (const c of 'ABCDEF') if (r() < 0.42) set.add(`${row}${c}`);
    return set;
  }, [p.dest, flightIdx]);

  const fl = flightIdx !== null ? flights[flightIdx] : null;
  const destCode = p.dest ? p.dest.iata || p.dest.ident : '';
  const destName = p.dest ? p.dest.municipality || p.dest.name : '';
  const destCountry = p.dest ? koreanCountryName(p.dest.country, p.dest.country) : '';
  const ticket: Ticket | null =
    fl && seat && p.dest
      ? {
          passenger,
          flightNo: fl.name,
          date,
          dep: hhmm(fl.dep),
          arr: hhmm(fl.arr),
          seat,
          gate: `${'ABC'[fl.dep % 3]}${10 + (fl.dep % 17)}`,
          boarding: hhmm(fl.dep - 30),
        }
      : null;

  const canNext = [!!p.dest && !!trip, fl !== null, !!trip?.canFly, !!seat, !!ticket][step];
  const h = res?.h ?? null;
  const blocking = trip?.warnings.find((w) => w.blocking);
  const isWin = (s: string) => s.endsWith('A') || s.endsWith('F');

  const go = (n: number) => {
    setStep(n);
    setPlacing(false);
  };

  return (
    <div className={`bx step-${step}`}>
      <div className="bx-map">
        <BookingMap
          destination={p.dest}
          airports={step === 0 ? p.airports : null}
          trip={trip}
          showStorm={step >= 2}
          stormEditable={step === 2}
          padding={padding}
          placing={placing}
          onPlace={(c) => {
            p.onStorm({ center: c, radius: p.storm?.radius ?? 400 });
            setPlacing(false);
          }}
          onStormDrag={(c) => p.storm && p.onStorm({ ...p.storm, center: c })}
          onSelectAirport={(id) => {
            const a = p.airports?.find((x) => x.id === id);
            if (a && a.type !== 'closed' && a.type !== 'closed_airport' && a.ident !== 'RKSI') p.onDest(a);
          }}
        />
      </div>
      <div className="bx-shade" />

      <header className="bx-top">
        <div className="bx-brand">
          <Mark />
          <span>태풍을 지나는 여행</span>
        </div>
        <ol className="bx-steps">
          {STEPS.map((s, i) => (
            <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''}>
              <button disabled={i > step} onClick={() => i < step && go(i)}>
                <em>{pad(i + 1)}</em>
                {s}
              </button>
            </li>
          ))}
        </ol>
        <button className="bx-link" onClick={p.onAbout}>
          이 앱에 대하여
        </button>
      </header>

      <aside className="bx-panel">
        <div className="bx-scroll" key={step}>
          {/* ① 목적지 */}
          {step === 0 && (
            <>
              <div className="bx-eyebrow">01 · 목적지</div>
              <h1 className="bx-h1">어디로 떠나볼까요?</h1>
              <p className="bx-lede">인천에서 출발합니다. 목적지를 고르면 지도에 직선 항로가 그려져요.</p>

              <div className="bx-route">
                <div>
                  <b>ICN</b>
                  <span>인천</span>
                </div>
                <div className="bx-route-line">
                  <i />
                  {trip && <small>{num(trip.t, 0)} km</small>}
                </div>
                <div className={`r ${p.dest ? '' : 'empty'}`}>
                  <b>{p.dest ? destCode : '···'}</b>
                  <span>{p.dest ? `${destName} · ${destCountry}` : '목적지'}</span>
                </div>
              </div>

              <div className="bx-label">추천 여행지</div>
              <div className="bx-dests">
                {p.popular.map((d) => (
                  <button key={d.code} className={`bx-dest ${destCode === d.code ? 'on' : ''}`} onClick={d.run}>
                    <b>{d.code}</b>
                    <span>{d.label}</span>
                    <small>{d.country}</small>
                  </button>
                ))}
              </div>

              <button className={`bx-expand ${searchOpen ? 'open' : ''}`} onClick={() => setSearchOpen(!searchOpen)}>
                <span>세계의 모든 공항에서 찾기</span>
                <small>86,000여 곳 · 국가 → 공항</small>
                <i>{searchOpen ? '−' : '+'}</i>
              </button>
              {searchOpen && (
                <div className="bx-search">
                  {p.loadError && <div className="bx-msg bad">{p.loadError}</div>}
                  <CountryAirportSearch
                    countries={p.countries}
                    country={p.country}
                    onCountry={p.onCountry}
                    airports={p.airports}
                    loadingAirports={p.loadingAirports}
                    selected={p.dest}
                    onSelect={p.onDest}
                  />
                </div>
              )}
              {p.tripError && <div className="bx-msg bad">{p.tripError}</div>}

              <div className="bx-fields">
                <label>
                  <small>가는 날</small>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </label>
                <label>
                  <small>탑승객</small>
                  <input value={passenger} maxLength={16} onChange={(e) => setPassenger(e.target.value)} />
                </label>
              </div>
            </>
          )}

          {/* ② 출발 시각 */}
          {step === 1 && trip && (
            <>
              <div className="bx-eyebrow">02 · 출발 시각</div>
              <h1 className="bx-h1">
                {destName}까지,
                <br />
                언제 떠날까요?
              </h1>
              <p className="bx-lede">
                {date} · 직항 · 직선 거리 {num(trip.t, 0)} km
              </p>
              <div className="bx-flights">
                {flights.map((f, i) => (
                  <button key={f.name} className={`bx-flight ${flightIdx === i ? 'on' : ''}`} onClick={() => setFlightIdx(i)}>
                    <div className="bf-head">
                      <span>{f.name}</span>
                      <small>{f.mood}</small>
                    </div>
                    <div className="bf-times">
                      <div>
                        <b>{hhmm(f.dep)}</b>
                        <small>ICN</small>
                      </div>
                      <div className="bf-line">
                        <i />
                        <small>{dur(f.durMin)}</small>
                      </div>
                      <div className="r">
                        <b>{hhmm(f.arr)}</b>
                        <small>{destCode}</small>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <p className="bx-fine">출발·도착 시각은 직선 거리로 어림한 가상의 값입니다.</p>
            </>
          )}

          {/* ③ 기상 = 태풍 배치 */}
          {step === 2 && trip && res && (
            <>
              <div className="bx-eyebrow alert">03 · 기상 경보</div>
              <h1 className="bx-h1">항로 위에 태풍이 있어요</h1>
              <p className="bx-lede">
                태풍을 반지름 r인 <b>원</b>으로 보고, 원을 피하는 가장 짧은 길 — <b>접선 · 원호 · 접선</b> — 으로 돌아갑니다. 태풍의 위치와 크기를 정해 주세요.
              </p>

              <div className="bx-label">태풍 위치</div>
              <div className="bx-seg">
                <button onClick={() => p.onSuggest(1)}>예보 A · 왼쪽</button>
                <button onClick={() => p.onSuggest(-1)}>예보 B · 오른쪽</button>
                <button className={placing ? 'on' : ''} onClick={() => setPlacing(!placing)}>
                  {placing ? '지도를 클릭하세요' : '직접 놓기'}
                </button>
              </div>
              <p className="bx-fine">지도의 태풍 표식을 끌어서 옮길 수도 있어요.</p>

              {p.storm && (
                <label className="bx-range">
                  <div>
                    <span>태풍 반지름</span>
                    <b>
                      r = {num(p.storm.radius, 0)} <small>km</small>
                    </b>
                  </div>
                  <input
                    type="range"
                    min={20}
                    max={Math.max(60, Math.round(Math.min(2500, trip.t * 0.45)))}
                    step={5}
                    value={p.storm.radius}
                    onChange={(e) => p.onStorm({ ...p.storm!, radius: Number(e.target.value) })}
                  />
                </label>
              )}

              <div className="bx-check">
                <div className="bx-check-head">
                  <span>관통 판정</span>
                  <small>O(0, 0) · A(t, 0) · C(a, b)</small>
                </div>
                <ul>
                  <li className={res.r2mb2 > 0 ? 'ok' : 'no'}>
                    <span>r² − b² &gt; 0</span>
                    <code>
                      {num(res.r2mb2, 0)}
                      {h !== null && <> → h = {num(h, 1)}</>}
                    </code>
                  </li>
                  <li className={h === null ? 'na' : res.a - h > 0 ? 'ok' : 'no'}>
                    <span>0 &lt; a − h</span>
                    <code>{h !== null ? num(res.a - h, 1) : '—'}</code>
                  </li>
                  <li className={h === null ? 'na' : res.a + h < trip.t ? 'ok' : 'no'}>
                    <span>a + h &lt; t</span>
                    <code>{h !== null ? `${num(res.a + h, 1)} < ${num(trip.t, 1)}` : '—'}</code>
                  </li>
                </ul>
                <div className={`bx-verdict ${trip.canFly ? 'good' : 'warn'}`}>{blocking ? blocking.message : STATUS_TEXT[res.status]}</div>
                {trip.warnings
                  .filter((w) => !w.blocking)
                  .map((w) => (
                    <div key={w.code} className="bx-msg">
                      {w.message}
                    </div>
                  ))}
              </div>
            </>
          )}

          {/* ④ 좌석 */}
          {step === 3 && (
            <>
              <div className="bx-eyebrow">04 · 좌석</div>
              <h1 className="bx-h1">창밖이 보이는 자리로</h1>
              <p className="bx-lede">창가(A·F)에서는 태풍을 비켜 도는 구름벽이 잘 보여요.</p>
              <div className="bx-legend">
                <span>
                  <i className="s free" />
                  선택 가능
                </span>
                <span>
                  <i className="s win" />
                  창가
                </span>
                <span>
                  <i className="s taken" />
                  예약됨
                </span>
                <span>
                  <i className="s on" />
                  내 좌석
                </span>
              </div>
              <div className="bx-cabin">
                <div className="bx-nose" />
                <div className="bx-cols">
                  {['A', 'B', 'C', '', 'D', 'E', 'F'].map((c, i) => (
                    <span key={i}>{c}</span>
                  ))}
                </div>
                {Array.from({ length: 24 }, (_, r) => r + 1).map((row) => (
                  <div key={row} className={`bx-row ${row === 12 ? 'exit' : ''}`}>
                    {['A', 'B', 'C', '', 'D', 'E', 'F'].map((c, i) =>
                      c === '' ? (
                        <span key={i} className="bx-aisle">
                          {row}
                        </span>
                      ) : (
                        <button
                          key={i}
                          disabled={taken.has(`${row}${c}`)}
                          className={`bx-seat ${seat === `${row}${c}` ? 'on' : ''} ${c === 'A' || c === 'F' ? 'win' : ''}`}
                          onClick={() => setSeat(`${row}${c}`)}
                          aria-label={`${row}${c}`}
                        />
                      ),
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ⑤ 탑승권 */}
          {step === 4 && ticket && trip && (
            <>
              <div className="bx-eyebrow">05 · 탑승권</div>
              <h1 className="bx-h1">준비 끝, 좋은 여행 되세요</h1>
              <div className="bx-pass">
                <div className="bp-top">
                  <span>BOARDING PASS</span>
                  <span>{ticket.date}</span>
                </div>
                <div className="bp-route">
                  <div>
                    <b>ICN</b>
                    <span>인천</span>
                  </div>
                  <div className="bp-mid">
                    <i />
                    <small>{dur(fl!.durMin)}</small>
                  </div>
                  <div className="r">
                    <b>{destCode}</b>
                    <span>{destName}</span>
                  </div>
                </div>
                <div className="bp-grid">
                  <div>
                    <small>탑승객</small>
                    <b>{ticket.passenger}</b>
                  </div>
                  <div>
                    <small>출발</small>
                    <b>{ticket.dep}</b>
                  </div>
                  <div>
                    <small>도착</small>
                    <b>{ticket.arr}</b>
                  </div>
                  <div>
                    <small>탑승구</small>
                    <b>{ticket.gate}</b>
                  </div>
                  <div>
                    <small>탑승 시작</small>
                    <b>{ticket.boarding}</b>
                  </div>
                  <div>
                    <small>좌석</small>
                    <b>
                      {ticket.seat}
                      {isWin(ticket.seat) && <em> 창가</em>}
                    </b>
                  </div>
                </div>
                <div className="bp-perf" />
                <div className="bp-bottom">
                  <div className="bp-note">
                    <small>태풍 회피 운항</small>
                    <span>
                      예상 비행 거리 <b>L<sub>min</sub> ≈ {num(trip.result.detour!.Lmin, 0)} km</b>
                      <br />
                      직선 t = {num(trip.t, 0)} km
                    </span>
                  </div>
                  <Barcode seed={(p.dest?.id ?? 1) + ticket.seat.charCodeAt(0)} />
                </div>
              </div>
            </>
          )}
        </div>

        <footer className="bx-nav">
          {step > 0 ? (
            <button className="bx-back" onClick={() => go(step - 1)}>
              ← 이전
            </button>
          ) : (
            <span />
          )}
          {step === 3 && seat && (
            <span className="bx-pick">
              {seat}
              {isWin(seat) ? ' · 창가' : ''}
            </span>
          )}
          {step < 4 ? (
            <button className="bx-next" disabled={!canNext} onClick={() => go(step + 1)}>
              {['출발 시각 고르기', '기상 확인하기', '좌석 고르기', '탑승권 받기'][step]} →
            </button>
          ) : (
            <button className="bx-next bx-board" onClick={() => ticket && p.onBoard(ticket)}>
              탑승하기
            </button>
          )}
        </footer>
        {step === 2 && !trip?.canFly && <p className="bx-hint">태풍이 직선 항로를 두 점에서 가로지르도록 놓아야 다음으로 갈 수 있어요.</p>}
      </aside>

      {step === 2 && (
        <div className="bx-mapkey">
          <span>
            <i className="k base" />
            직선 항로
          </span>
          <span>
            <i className="k route" />
            최단 우회
          </span>
          <span>
            <i className="k storm" />
            태풍 (진입 금지 원)
          </span>
        </div>
      )}

      {step === 2 && !briefingSeen && (
        <div className="bx-brief" onClick={() => setBriefingSeen(true)}>
          <div className="bx-brief-card" onClick={(e) => e.stopPropagation()}>
            <div className="bx-brief-head">
              <span className="dot" />
              기상 브리핑 · 출발 전 안내
            </div>
            <AirportScene
              mode="warn"
              destLabel={destName}
              bubbles={[
                { who: 'agent', tone: 'alert', text: '잠깐만요! 예정 항로에 태풍 경보가 있어요. 그대로 직선으로 가면 태풍 속을 지나게 돼요.', delay: 0.4 },
                { who: 'traveler', text: '그럼 어떻게 가나요?', delay: 2.2 },
              ]}
            />
            <div className="bx-brief-foot">
              <p>
                “태풍을 <b>원</b>으로 보고, 원을 피하는 <b>가장 짧은 길</b>로 돌아갈 거예요. 먼저 태풍의 위치와 크기를 확인해 주세요.”
              </p>
              <button className="bx-next" onClick={() => setBriefingSeen(true)}>
                기상 지도 보기 →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
