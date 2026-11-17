import { useMemo, useState } from 'react';
import type { Airport, CountryEntry } from '../data/airportTypes';
import type { LatLon } from '../math/geoProjection';
import { STATUS_TEXT } from '../math/detour';
import type { Trip } from '../math/trip';
import { CountryAirportSearch, koreanCountryName } from './CountryAirportSearch';
import { BookingMap } from './BookingMap';
import { AirportScene, type Bubble } from './AirportScene';
import { rng } from '../scene/clouds';
import { num } from '../format';

export interface Storm {
  center: LatLon;
  radius: number;
}

export interface Ticket {
  passenger: string;
  flightNo: string;
  date: string;
  dep: string;
  arr: string;
  seat: string;
  gate: string;
  boarding: string;
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
  popular: { label: string; run: () => void }[];
  onAbout: () => void;
}

const STEPS = ['항공편 검색', '항공편 선택', '기상 안내', '좌석 선택', '탑승권'];
const NAVY = '#1b2b4a';

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (min: number) => `${pad(Math.floor(((min % 1440) + 1440) % 1440 / 60))}:${pad(Math.round(((min % 60) + 60) % 60))}`;

function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <circle cx="20" cy="20" r="14" fill="none" stroke="#c9a252" strokeWidth="5" />
      <circle cx="23" cy="16" r="5" fill="#c9a252" />
    </svg>
  );
}

function Barcode({ seed }: { seed: number }) {
  const r = rng(seed);
  const bars: number[] = [];
  let x = 0;
  while (x < 300) {
    const w = 1 + Math.floor(r() * 4);
    bars.push(x, w);
    x += w + 1 + Math.floor(r() * 3);
  }
  return (
    <svg viewBox="0 0 300 50" className="barcode" preserveAspectRatio="none">
      {bars.map((v, i) => (i % 2 === 0 ? <rect key={i} x={v} y="0" width={bars[i + 1]} height="50" fill={NAVY} /> : null))}
    </svg>
  );
}

export function BookingFlow(p: Props) {
  const [step, setStep] = useState(0);
  const [passenger, setPassenger] = useState('심풀 여행자');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [flightIdx, setFlightIdx] = useState<number | null>(null);
  const [seat, setSeat] = useState<string | null>(null);
  const [briefingSeen, setBriefingSeen] = useState(false);
  const [placing, setPlacing] = useState(false);
  const trip = p.trip;
  const res = trip?.result;

  const flights = useMemo(() => {
    if (!trip || !p.dest) return [];
    const durMin = Math.round(((trip.t / 830) * 60 + 35) / 5) * 5;
    const base = 900 + Math.round(trip.t / 9) * 5;
    const code = (p.dest.iata || p.dest.ident).charCodeAt(0);
    return [
      { no: `SP ${100 + (code % 9) * 10 + 1}`, dep: 9 * 60 + 10, cls: '이코노미', fare: base },
      { no: `SP ${300 + (code % 7) * 10 + 5}`, dep: 13 * 60 + 40, cls: '이코노미', fare: base + 140 },
      { no: `SP ${700 + (code % 5) * 10 + 9}`, dep: 18 * 60 + 25, cls: '비즈니스', fare: base * 3 },
    ].map((f) => ({ ...f, durMin, arr: f.dep + durMin }));
  }, [trip, p.dest]);

  const taken = useMemo(() => {
    const r = rng((p.dest?.id ?? 7) * 31 + (flightIdx ?? 0));
    const set = new Set<string>();
    for (let row = 1; row <= 24; row++) for (const c of 'ABCDEF') if (r() < 0.42) set.add(`${row}${c}`);
    return set;
  }, [p.dest, flightIdx]);

  const fl = flightIdx !== null ? flights[flightIdx] : null;
  const destName = p.dest ? p.dest.municipality || p.dest.name : '';
  const destCountry = p.dest ? koreanCountryName(p.dest.country, p.dest.country) : '';
  const ticket: Ticket | null =
    fl && seat && p.dest
      ? {
          passenger,
          flightNo: fl.no,
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

  const agentLine: Record<number, Bubble> = {
    0: { who: 'agent', text: p.dest ? `${destName}(${destCountry}) 말씀이시죠? 좋은 선택이에요!` : '어디로 떠나시나요? 도착지를 검색해 주세요.' },
    1: { who: 'agent', text: '오늘 이 노선에는 세 편이 있어요. 원하시는 시간을 골라 주세요.' },
    3: { who: 'agent', text: '창가 좌석(A·F)에서는 태풍을 비켜 도는 모습이 잘 보여요.' },
    4: { who: 'agent', text: '탑승권 나왔습니다. 태풍은 최단 우회 항로로 안전하게 피해 갈게요. 좋은 여행 되세요!' },
  };

  return (
    <div className="bk">
      <header className="bk-top">
        <div className="bk-brand">
          <Logo />
          <b>SIMPUL AIR</b>
          <span>심풀 항공 · 인천 출발 예약</span>
        </div>
        <ol className="bk-steps">
          {STEPS.map((s, i) => (
            <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''}>
              <span>{i < step ? '✓' : i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
        <button className="link-btn light" onClick={p.onAbout}>
          정보
        </button>
      </header>

      <main className={`bk-main step-${step}`}>
        <section className="bk-form">
          {/* ① 검색 */}
          {step === 0 && (
            <>
              <h2>어디로 떠나세요?</h2>
              <div className="route-pick">
                <div className="rp-box">
                  <small>출발</small>
                  <b>ICN</b>
                  <span>인천국제공항</span>
                </div>
                <span className="rp-arrow">✈</span>
                <div className={`rp-box ${p.dest ? '' : 'empty'}`}>
                  <small>도착</small>
                  <b>{p.dest ? p.dest.iata || p.dest.ident : '———'}</b>
                  <span>{p.dest ? `${destName} · ${destCountry}` : '아래에서 검색'}</span>
                </div>
              </div>
              <div className="field-row">
                <label>
                  <small>가는 날</small>
                  <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
                </label>
                <label>
                  <small>탑승객 이름</small>
                  <input className="input" value={passenger} maxLength={16} onChange={(e) => setPassenger(e.target.value)} />
                </label>
              </div>
              <div className="demo-row">
                <span>인기 여행지</span>
                {p.popular.map((d) => (
                  <button key={d.label} className="chip" onClick={d.run}>
                    {d.label}
                  </button>
                ))}
              </div>
              {p.loadError && <div className="msg bad">{p.loadError}</div>}
              <CountryAirportSearch
                countries={p.countries}
                country={p.country}
                onCountry={p.onCountry}
                airports={p.airports}
                loadingAirports={p.loadingAirports}
                selected={p.dest}
                onSelect={p.onDest}
              />
              {p.tripError && <div className="msg bad">{p.tripError}</div>}
            </>
          )}

          {/* ② 항공편 선택 */}
          {step === 1 && trip && (
            <>
              <h2>
                ICN → {p.dest?.iata || p.dest?.ident} <small>{date}</small>
              </h2>
              <p className="muted small">직항 · 직선 거리 {num(trip.t, 0)} km · 가상 항공사(심풀 항공)의 연습용 운항표</p>
              <div className="flights">
                {flights.map((f, i) => (
                  <button key={f.no} className={`flight-card ${flightIdx === i ? 'on' : ''}`} onClick={() => setFlightIdx(i)}>
                    <div className="fc-time">
                      <b>{hhmm(f.dep)}</b>
                      <span className="fc-line">
                        <i />
                        {Math.floor(f.durMin / 60)}시간 {f.durMin % 60}분 · 직항
                      </span>
                      <b>{hhmm(f.arr)}</b>
                    </div>
                    <div className="fc-meta">
                      <span>{f.no}</span>
                      <span>{f.cls}</span>
                      <span>SA-321 (가상 기종)</span>
                      <b>₩{(f.fare * 100).toLocaleString()}</b>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ③ 기상 안내 = 태풍 배치 */}
          {step === 2 && trip && res && (
            <>
              <div className="agent-note alert">
                <span className="ag-face">!</span>
                <p>
                  <b>출발 전 기상 안내</b>
                  <br />
                  예정 항로에 태풍이 접근하고 있어요. 지도에서 태풍의 위치와 크기를 확인해 주세요. 태풍이 항로를 관통하면 <b>접선–원호–접선</b>의 최단 우회 항로로 운항합니다.
                </p>
              </div>
              <div className="btn-row">
                <button className="btn-soft" onClick={() => p.onSuggest(1)}>
                  예보 A (항로 왼쪽)
                </button>
                <button className="btn-soft" onClick={() => p.onSuggest(-1)}>
                  예보 B (항로 오른쪽)
                </button>
                <button className={`btn-soft ${placing ? 'on' : ''}`} onClick={() => setPlacing(!placing)}>
                  {placing ? '지도를 클릭…' : '지도에 직접 놓기'}
                </button>
              </div>
              {p.storm && (
                <label className="slider">
                  <span>
                    태풍 반지름 <b>r = {num(p.storm.radius, 0)} km</b>
                  </span>
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
              <p className="muted small">지도에서 🌀를 끌어 태풍을 옮길 수 있어요.</p>
              <div className="check">
                <div className="check-title">관통 판정 · 계산 좌표 O(0,0), A(t,0)</div>
                <ul>
                  <li className={res.r2mb2 > 0 ? 'ok' : 'no'}>
                    r² − b² = {num(res.r2mb2, 0)} {res.r2mb2 > 0 ? '> 0' : '≤ 0'} {h !== null && <>→ h = {num(h, 1)}</>}
                  </li>
                  <li className={h === null ? 'na' : res.a - h > 0 ? 'ok' : 'no'}>0 &lt; a − h {h !== null && <>= {num(res.a - h, 1)}</>}</li>
                  <li className={h === null ? 'na' : res.a + h < trip.t ? 'ok' : 'no'}>
                    a + h &lt; t {h !== null && <>: {num(res.a + h, 1)} &lt; {num(trip.t, 1)}</>}
                  </li>
                </ul>
                <div className={`msg ${trip.canFly ? 'good' : 'warn'}`}>{blocking ? blocking.message : STATUS_TEXT[res.status]}</div>
                {trip.warnings
                  .filter((w) => !w.blocking)
                  .map((w) => (
                    <div key={w.code} className="msg note">
                      {w.message}
                    </div>
                  ))}
              </div>
            </>
          )}

          {/* ④ 좌석 */}
          {step === 3 && (
            <>
              <h2>좌석을 골라 주세요</h2>
              <p className="muted small">
                {fl?.no} · {fl?.cls} · 회색은 이미 예약된 좌석
              </p>
              <div className="seatmap">
                <div className="sm-head">
                  {['A', 'B', 'C', '', 'D', 'E', 'F'].map((c, i) => (
                    <span key={i}>{c}</span>
                  ))}
                </div>
                <div className="sm-body">
                  {Array.from({ length: 24 }, (_, r) => r + 1).map((row) => (
                    <div key={row} className="sm-row">
                      {['A', 'B', 'C', '', 'D', 'E', 'F'].map((c, i) =>
                        c === '' ? (
                          <span key={i} className="sm-aisle">
                            {row}
                          </span>
                        ) : (
                          <button
                            key={i}
                            disabled={taken.has(`${row}${c}`)}
                            className={`seat ${seat === `${row}${c}` ? 'on' : ''} ${c === 'A' || c === 'F' ? 'win' : ''}`}
                            onClick={() => setSeat(`${row}${c}`)}
                            aria-label={`${row}${c}`}
                          />
                        ),
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <p className="small">{seat ? `선택한 좌석: ${seat}${seat.endsWith('A') || seat.endsWith('F') ? ' (창가)' : ''}` : '좌석을 눌러 선택하세요.'}</p>
            </>
          )}

          {/* ⑤ 탑승권 */}
          {step === 4 && ticket && trip && (
            <>
              <h2>탑승권</h2>
              <div className="bpass">
                <div className="bp-main">
                  <div className="bp-head">
                    <Logo size={22} />
                    <b>SIMPUL AIR</b>
                    <span>BOARDING PASS · 탑승권</span>
                  </div>
                  <div className="bp-route">
                    <div>
                      <small>FROM</small>
                      <b>ICN</b>
                      <span>인천</span>
                    </div>
                    <span className="bp-plane">✈</span>
                    <div className="r">
                      <small>TO</small>
                      <b>{p.dest?.iata || p.dest?.ident}</b>
                      <span>{destName}</span>
                    </div>
                  </div>
                  <div className="bp-grid">
                    <div>
                      <small>PASSENGER</small>
                      <b>{ticket.passenger}</b>
                    </div>
                    <div>
                      <small>FLIGHT</small>
                      <b>{ticket.flightNo}</b>
                    </div>
                    <div>
                      <small>DATE</small>
                      <b>{ticket.date}</b>
                    </div>
                    <div>
                      <small>GATE</small>
                      <b>{ticket.gate}</b>
                    </div>
                    <div>
                      <small>BOARDING</small>
                      <b>{ticket.boarding}</b>
                    </div>
                    <div>
                      <small>SEAT</small>
                      <b>{ticket.seat}</b>
                    </div>
                  </div>
                  <div className="bp-note">
                    ⚠ 태풍 회피 운항 · 예상 비행 거리 L<sub>min</sub> ≈ {num(trip.result.detour!.Lmin, 0)} km (직선 {num(trip.t, 0)} km)
                  </div>
                </div>
                <div className="bp-stub">
                  <small>SEAT</small>
                  <b>{ticket.seat}</b>
                  <small>GATE</small>
                  <b>{ticket.gate}</b>
                  <Barcode seed={(p.dest?.id ?? 1) + ticket.seat.charCodeAt(0)} />
                </div>
              </div>
            </>
          )}

          <div className="bk-nav">
            {step > 0 && (
              <button className="btn-soft" onClick={() => setStep(step - 1)}>
                ← 이전
              </button>
            )}
            {step < 4 ? (
              <button
                className="btn-main"
                disabled={!canNext}
                onClick={() => {
                  if (step === 1 && !briefingSeen) setBriefingSeen(false);
                  setStep(step + 1);
                  setPlacing(false);
                }}
              >
                {['항공편 검색', '이 항공편 선택', '태풍 확인 완료', '좌석 확정', ''][step]} →
              </button>
            ) : (
              <button className="board" onClick={() => ticket && p.onBoard(ticket)}>
                탑승하기 ✈
              </button>
            )}
          </div>
          {step === 2 && !trip?.canFly && <p className="small muted right">태풍이 항로를 두 점에서 가로지르도록 놓아야 다음으로 갈 수 있어요.</p>}
        </section>

        <section className="bk-visual">
          {step === 2 ? (
            <>
              <BookingMap
                destination={p.dest}
                airports={null}
                trip={trip}
                placing={placing}
                onPlace={(c) => {
                  p.onStorm({ center: c, radius: p.storm?.radius ?? 400 });
                  setPlacing(false);
                }}
                onStormDrag={(c) => p.storm && p.onStorm({ ...p.storm, center: c })}
                onSelectAirport={() => {}}
              />
              <div className="map-legend">
                <span>
                  <i className="lg base" />
                  직선 항로 y = 0
                </span>
                <span>
                  <i className="lg route" />
                  최단 우회
                </span>
                <span>
                  <i className="lg storm" />
                  태풍 (진입 금지 원)
                </span>
              </div>
            </>
          ) : step === 0 && p.dest ? (
            <>
              <BookingMap
                destination={p.dest}
                airports={p.airports}
                trip={null}
                placing={false}
                onPlace={() => {}}
                onStormDrag={() => {}}
                onSelectAirport={(id) => {
                  const a = p.airports?.find((x) => x.id === id);
                  if (a && a.type !== 'closed' && a.type !== 'closed_airport' && a.ident !== 'RKSI') p.onDest(a);
                }}
              />
              <div className="scene-pip">
                <AirportScene mode="counter" bubbles={[agentLine[0]]} destLabel={destName} />
              </div>
            </>
          ) : (
            <AirportScene mode="counter" bubbles={agentLine[step] ? [agentLine[step]] : []} destLabel={destName} />
          )}
        </section>
      </main>

      {step === 2 && !briefingSeen && (
        <div className="briefing" onClick={() => setBriefingSeen(true)}>
          <div className="briefing-card" onClick={(e) => e.stopPropagation()}>
            <AirportScene
              mode="warn"
              destLabel={destName}
              bubbles={[
                { who: 'agent', tone: 'alert', text: '잠깐만요! 예정 항로에 태풍 경보가 있어요. 그대로 직선으로 가면 태풍 속을 지나게 돼요.', delay: 0.4 },
                { who: 'traveler', text: '그럼 어떻게 가나요?', delay: 2.2 },
              ]}
            />
            <div className="briefing-foot">
              <p>
                안내원: “태풍을 <b>원</b>으로 보고, 원을 피하는 <b>가장 짧은 길</b>로 돌아갈 거예요. 먼저 태풍의 위치와 크기를 확인해 주세요.”
              </p>
              <button className="btn-main" onClick={() => setBriefingSeen(true)}>
                기상 지도 확인하기 →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
