import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Booking, type Storm } from './components/Booking';
import { FlightView } from './components/FlightView';
import { koreanCountryName } from './components/CountryAirportSearch';
import { unpack, type Airport, type CountryEntry, type DataMeta, type PackedAirport } from './data/airportTypes';
import { buildTrip, suggestStorm, type Trip } from './math/trip';
import { Ambient } from './audio/ambient';

const DATA = `${import.meta.env.BASE_URL}data`;

const DEMOS = [
  { cc: 'JP', ident: 'RJAA', label: '도쿄' },
  { cc: 'FR', ident: 'LFPG', label: '파리' },
  { cc: 'US', ident: 'KJFK', label: '뉴욕' },
  { cc: 'AU', ident: 'YSSY', label: '시드니' },
  { cc: 'TH', ident: 'VTBS', label: '방콕' },
];

export default function App() {
  const [meta, setMeta] = useState<DataMeta | null>(null);
  const [countries, setCountries] = useState<CountryEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [airports, setAirports] = useState<Airport[] | null>(null);
  const [loadingAirports, setLoadingAirports] = useState(false);
  const cache = useRef(new Map<string, Airport[]>());
  const [dest, setDest] = useState<Airport | null>(null);
  const [storm, setStorm] = useState<Storm | null>(null);
  const [placing, setPlacing] = useState(false);
  const [screen, setScreen] = useState<'booking' | 'flight'>('booking');
  const [aboutOpen, setAboutOpen] = useState(false);
  const ambient = useRef(new Ambient()).current;

  useEffect(() => {
    Promise.all([fetch(`${DATA}/meta.json`).then((r) => r.json()), fetch(`${DATA}/countries.json`).then((r) => r.json())])
      .then(([m, c]) => {
        setMeta(m);
        setCountries((c as CountryEntry[]).filter((x) => x.count > 0));
      })
      .catch(() => setLoadError('공항 데이터를 불러오지 못했습니다.'));
  }, []);

  const loadCountry = useCallback(async (cc: string) => {
    const hit = cache.current.get(cc);
    if (hit) return hit;
    const packed = (await fetch(`${DATA}/airports/${cc}.json`).then((r) => r.json())) as PackedAirport[];
    const list = packed.map((p) => unpack(p, cc));
    cache.current.set(cc, list);
    return list;
  }, []);

  const chooseCountry = useCallback(
    async (cc: string) => {
      setCountry(cc);
      setAirports(null);
      setLoadingAirports(true);
      try {
        setAirports(await loadCountry(cc));
      } finally {
        setLoadingAirports(false);
      }
    },
    [loadCountry],
  );

  const chooseDest = useCallback((a: Airport) => {
    setDest(a);
    setStorm(suggestStorm({ lat: a.lat, lon: a.lon }, 1));
    setPlacing(false);
  }, []);

  const { trip, tripError } = useMemo((): { trip: Trip | null; tripError: string | null } => {
    if (!dest || !storm) return { trip: null, tripError: null };
    try {
      return { trip: buildTrip({ destination: { lat: dest.lat, lon: dest.lon }, stormCenter: storm.center, radius: storm.radius }), tripError: null };
    } catch (e) {
      return { trip: null, tripError: (e as Error).message };
    }
  }, [dest, storm]);

  const destLabel = dest ? `${dest.municipality || dest.name}` : '';
  const destCode = dest ? dest.iata || dest.ident : '';

  return (
    <div className="app">
      {screen === 'booking' ? (
        <Booking
          countries={countries}
          loadError={loadError}
          country={country}
          onCountry={chooseCountry}
          airports={airports}
          loadingAirports={loadingAirports}
          dest={dest}
          onDest={chooseDest}
          storm={storm}
          onStorm={setStorm}
          onSuggest={(side) => dest && setStorm(suggestStorm({ lat: dest.lat, lon: dest.lon }, side))}
          trip={trip}
          tripError={tripError}
          placing={placing}
          onPlacing={setPlacing}
          onBoard={() => {
            ambient.start();
            setScreen('flight');
          }}
          demos={DEMOS.map((d) => ({
            label: d.label,
            run: async () => {
              await chooseCountry(d.cc);
              const a = (await loadCountry(d.cc)).find((x) => x.ident === d.ident);
              if (a) chooseDest(a);
            },
          }))}
          onAbout={() => setAboutOpen(true)}
        />
      ) : (
        trip && (
          <FlightView
            trip={trip}
            destLabel={`${destLabel}${dest ? ` (${koreanCountryName(dest.country, dest.country)})` : ''}`}
            destCode={destCode}
            ambient={ambient}
            onExit={() => {
              ambient.suspend();
              setScreen('booking');
            }}
          />
        )
      )}

      {aboutOpen && (
        <div className="modal" onClick={() => setAboutOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>태풍을 지나는 여행</h2>
            <p>
              인천에서 고른 공항까지 날아가며, 가상의 원형 태풍을 피하는 최단 항로(접선 + 원호 + 접선)를 직선·원의 방정식, 피타고라스 정리, 접선, 코사인표 선형 보간으로
              계산합니다. 출발점에서 목적지로 향하는 방향을 양의 x축으로 두어 O = (0, 0), A = (t, 0)입니다.
            </p>
            <p>
              <b>평면 모델:</b> 계산은 인천을 중심으로 한 방위정거리 평면(km)에서 이루어지고, 지도와 3D 지구에는 같은 원과 경로를 되돌려 그립니다. 인천에서의 거리만 정확히
              보존되며 지구 곡률 보정은 다루지 않습니다. 태풍은 실제 기상이 아니라 원형 진입 금지 구역입니다.
            </p>
            <p>
              <b>데이터·소리:</b> 공항 {meta?.totalAirports.toLocaleString() ?? '—'}곳 — {meta?.source ?? 'OurAirports'}. 국경 Natural Earth. 지구 그림·구름·음악은 모두 코드로
              직접 만든 것입니다.
            </p>
            <button className="btn-main" onClick={() => setAboutOpen(false)}>
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
