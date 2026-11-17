import type { Airport, CountryEntry } from '../data/airportTypes';
import type { LatLon } from '../math/geoProjection';
import { STATUS_TEXT } from '../math/detour';
import type { Trip } from '../math/trip';
import { CountryAirportSearch } from './CountryAirportSearch';
import { BookingMap } from './BookingMap';
import { num } from '../format';

export interface Storm {
  center: LatLon;
  radius: number;
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
  placing: boolean;
  onPlacing: (v: boolean) => void;
  onBoard: () => void;
  demos: { label: string; run: () => void }[];
  onAbout: () => void;
}

function Check({ ok, children }: { ok: boolean | null; children: React.ReactNode }) {
  return <li className={ok === null ? 'na' : ok ? 'ok' : 'no'}>{children}</li>;
}

export function Booking(p: Props) {
  const trip = p.trip;
  const res = trip?.result;
  const maxR = trip ? Math.max(60, Math.round(Math.min(2500, trip.t * 0.45))) : 1500;
  const h = res?.h ?? null;
  const blocking = trip?.warnings.find((w) => w.blocking);

  return (
    <div className="booking">
      <section className="booking-side">
        <header className="brand">
          <div>
            <h1>태풍을 지나는 여행</h1>
            <p>인천에서 떠나는 최단 항로 수학 비행</p>
          </div>
          <button className="link-btn" onClick={p.onAbout}>
            정보
          </button>
        </header>

        <div className="ticket">
          <div className="ticket-top">
            <div>
              <small>FROM</small>
              <b>ICN</b>
              <span>인천</span>
            </div>
            <span className="ticket-plane">✈</span>
            <div className="right">
              <small>TO</small>
              <b>{p.dest ? p.dest.iata || p.dest.ident : '???'}</b>
              <span>{p.dest ? p.dest.municipality || p.dest.name : '목적지를 고르세요'}</span>
            </div>
          </div>
          <div className="ticket-row">
            <div>
              <small>직선 거리 t</small>
              <b>{trip ? `${num(trip.t, 0)} km` : '—'}</b>
            </div>
            <div>
              <small>태풍 반지름 r</small>
              <b>{p.storm ? `${num(p.storm.radius, 0)} km` : '—'}</b>
            </div>
            <div>
              <small>좌석</small>
              <b>조종석 1A</b>
            </div>
          </div>
        </div>

        <div className="demo-row">
          <span>빠른 출발</span>
          {p.demos.map((d) => (
            <button key={d.label} className="chip" onClick={d.run}>
              {d.label}
            </button>
          ))}
        </div>

        <h3 className="sec">
          <span>1</span>목적지
        </h3>
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

        <h3 className="sec">
          <span>2</span>태풍 배치
        </h3>
        {!p.dest ? (
          <p className="muted small">목적지를 고르면 태풍을 놓을 수 있어요.</p>
        ) : (
          <>
            <div className="btn-row">
              <button className="btn-soft" onClick={() => p.onSuggest(1)}>
                추천 (항로 왼쪽)
              </button>
              <button className="btn-soft" onClick={() => p.onSuggest(-1)}>
                추천 (항로 오른쪽)
              </button>
              <button className={`btn-soft ${p.placing ? 'on' : ''}`} onClick={() => p.onPlacing(!p.placing)}>
                {p.placing ? '지도를 클릭…' : '지도에 직접 놓기'}
              </button>
            </div>
            {p.storm && (
              <label className="slider">
                <span>
                  반지름 r = <b>{num(p.storm.radius, 0)} km</b>
                </span>
                <input
                  type="range"
                  min={20}
                  max={maxR}
                  step={5}
                  value={Math.min(p.storm.radius, maxR)}
                  onChange={(e) => p.onStorm({ ...p.storm!, radius: Number(e.target.value) })}
                />
              </label>
            )}
            {p.storm && <p className="muted small">지도에서 🌀를 끌어 태풍을 옮길 수 있어요.</p>}
          </>
        )}

        {trip && res && (
          <div className="check">
            <div className="check-title">관통 판정 (문서 1-3)</div>
            <ul>
              <Check ok={res.r2mb2 > 0}>
                r² − b² = {num(res.r2mb2, 0)} {res.r2mb2 > 0 ? '> 0' : '≤ 0'} {h !== null && <>→ h = {num(h, 1)}</>}
              </Check>
              <Check ok={h === null ? null : res.a - h > 0}>
                0 &lt; a − h {h !== null && <>= {num(res.a - h, 1)}</>}
              </Check>
              <Check ok={h === null ? null : res.a + h < trip.t}>
                a + h &lt; t {h !== null && <>: {num(res.a + h, 1)} &lt; {num(trip.t, 1)}</>}
              </Check>
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
        )}
        {p.tripError && <div className="msg bad">{p.tripError}</div>}

        <button className="board" disabled={!trip?.canFly} onClick={p.onBoard}>
          {trip?.canFly ? '탑승하기 ✈' : '태풍이 항로를 관통하면 탑승할 수 있어요'}
        </button>
      </section>

      <section className="booking-map-wrap">
        <BookingMap
          destination={p.dest}
          airports={p.airports}
          trip={trip}
          placing={p.placing}
          onPlace={(c) => {
            p.onStorm({ center: c, radius: p.storm?.radius ?? 400 });
            p.onPlacing(false);
          }}
          onStormDrag={(c) => p.storm && p.onStorm({ ...p.storm, center: c })}
          onSelectAirport={(id) => {
            const a = p.airports?.find((x) => x.id === id);
            if (a && a.type !== 'closed' && a.type !== 'closed_airport' && a.ident !== 'RKSI') p.onDest(a);
          }}
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
            태풍 (계산 평면의 원)
          </span>
        </div>
      </section>
    </div>
  );
}
