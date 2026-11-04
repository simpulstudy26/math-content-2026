import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { CountryAirportSearch, koreanCountryName } from './components/CountryAirportSearch';
import { StormCreator } from './components/StormCreator';
import { WorldFlightMap, type MapProjection } from './components/WorldFlightMap';
import { MathPlaneInset } from './components/MathPlaneInset';
import { FlightPlayer } from './components/FlightPlayer';
import { MathProcessPanel } from './components/MathProcessPanel';
import { unpack, type Airport, type CountryEntry, type DataMeta, type PackedAirport } from './data/airportTypes';
import { ICN, type LatLon } from './math/geoProjection';
import { autoStorm, computeScenario, type ScenarioResult } from './math/scenario';
import { parametrizePath, type Side } from './math/detour';
import { flightReducer, initialFlight, phaseAt } from './state/flight';
import { STATUS_LABEL } from './math/intersections';

const DATA = `${import.meta.env.BASE_URL}data`;
/** 재생 속도 ×1에서 전체 비행에 걸리는 시간(초) */
const FLIGHT_SECONDS = 14;

const DEMOS: { cc: string; ident: string; label: string }[] = [
  { cc: 'JP', ident: 'RJAA', label: '도쿄 나리타' },
  { cc: 'GB', ident: 'EGLL', label: '런던 히스로' },
  { cc: 'US', ident: 'KJFK', label: '뉴욕 JFK' },
  { cc: 'NZ', ident: 'NZAA', label: '오클랜드' },
  { cc: 'BR', ident: 'SBGR', label: '상파울루' },
];

interface Storm {
  center: LatLon;
  radius: number;
}

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
  const [tieSide, setTieSide] = useState<Side>(1);
  const [placing, setPlacing] = useState(false);
  const [showOther, setShowOther] = useState(false);
  const [projection, setProjection] = useState<MapProjection>('mercator');
  const [insetOpen, setInsetOpen] = useState(true);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(true);

  // 데이터 로드
  useEffect(() => {
    Promise.all([fetch(`${DATA}/meta.json`).then((r) => r.json()), fetch(`${DATA}/countries.json`).then((r) => r.json())])
      .then(([m, c]) => {
        setMeta(m);
        setCountries((c as CountryEntry[]).filter((x) => x.count > 0));
      })
      .catch(() => setLoadError('공항 데이터를 불러오지 못했습니다. `npm run prepare-airports`를 먼저 실행했는지 확인하세요.'));
  }, []);

  const loadCountry = useCallback(async (cc: string): Promise<Airport[]> => {
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

  const chooseAirport = useCallback((a: Airport) => {
    setDest(a);
    // 새 목적지에는 유효한 태풍을 자동 추천 (명세 4-3)
    const st = autoStorm({ lat: a.lat, lon: a.lon });
    setStorm(st);
    setPlacing(false);
  }, []);

  const runDemo = useCallback(
    async (d: (typeof DEMOS)[number]) => {
      await chooseCountry(d.cc);
      const list = await loadCountry(d.cc);
      const a = list.find((x) => x.ident === d.ident);
      if (a) chooseAirport(a);
    },
    [chooseCountry, chooseAirport, loadCountry],
  );

  // 단일 수학 엔진 결과
  const { scenario, scenarioError } = useMemo((): { scenario: ScenarioResult | null; scenarioError: string | null } => {
    if (!dest || !storm) return { scenario: null, scenarioError: null };
    try {
      return {
        scenario: computeScenario({
          destinationAirportId: String(dest.id),
          destination: { lat: dest.lat, lon: dest.lon },
          stormCenterLatLon: storm.center,
          radius: storm.radius,
          tieSide,
        }),
        scenarioError: null,
      };
    } catch (e) {
      return { scenario: null, scenarioError: (e as Error).message };
    }
  }, [dest, storm, tieSide]);

  const param = useMemo(() => (scenario ? parametrizePath(scenario.math) : null), [scenario]);
  const scenarioKey = scenario
    ? `${scenario.input.destinationAirportId}|${scenario.input.stormCenterLatLon.lat}|${scenario.input.stormCenterLatLon.lon}|${scenario.input.radius}|${tieSide}`
    : '';

  const [flight, dispatch] = useReducer(flightReducer, initialFlight());
  useEffect(() => dispatch({ type: 'reset', scenarioKey }), [scenarioKey]);

  // 재생 루프
  useEffect(() => {
    if (!flight.playing) return;
    let last = performance.now();
    let id = 0;
    const loop = (now: number) => {
      dispatch({ type: 'tick', dtSec: (now - last) / 1000, durationSec: FLIGHT_SECONDS });
      last = now;
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [flight.playing]);

  const phase = param ? phaseAt(flight.progress, param.pieces, param.total) : null;

  const blocking = scenario?.warnings.find((w) => w.blocking);
  const canFly = !!scenario && scenario.canFly;
  const flyReason = !dest
    ? '목적지 공항을 고르세요.'
    : !storm
      ? '태풍을 만드세요.'
      : scenarioError
        ? scenarioError
        : blocking
          ? blocking.message
          : scenario && scenario.check.status !== 'crossing'
            ? `${STATUS_LABEL[scenario.check.status]} — 태풍이 선분 OA를 두 점에서 가로지를 때 회피 비행을 시작할 수 있습니다.`
            : null;

  const radiusMax = scenario ? Math.min(3000, scenario.coords.t * Math.SQRT2 * 0.6) : 1500;

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo">◎</span>
          <div>
            <h1>태풍 회피 최단 항로</h1>
            <p>인천 ICN에서 출발 · 좌표축을 돌려 목적지를 y = x 위에 놓고 최단 우회를 구한다</p>
          </div>
        </div>
        <div className="top-tools">
          <div className="seg-ctl" role="group" aria-label="지도 투영">
            <button className={projection === 'mercator' ? 'on' : ''} onClick={() => setProjection('mercator')}>
              평면 지도
            </button>
            <button className={projection === 'globe' ? 'on' : ''} onClick={() => setProjection('globe')}>
              지구본
            </button>
          </div>
          <label className="toggle-inline">
            <input type="checkbox" checked={showOther} onChange={(e) => setShowOther(e.target.checked)} /> 반대쪽 후보
          </label>
          {scenario?.math.tie && (
            <div className="seg-ctl" role="group" aria-label="동점일 때 방향">
              <button className={tieSide === 1 ? 'on' : ''} onClick={() => setTieSide(1)}>
                위쪽
              </button>
              <button className={tieSide === -1 ? 'on' : ''} onClick={() => setTieSide(-1)}>
                아래쪽
              </button>
            </div>
          )}
          <button className="btn ghost" onClick={() => setAboutOpen(true)}>
            정보
          </button>
        </div>
      </header>

      <main className="layout">
        <div className="stage">
          <WorldFlightMap
            origin={ICN}
            destination={dest}
            countryAirports={airports}
            scenario={scenario}
            progress={flight.progress}
            showOther={showOther}
            projection={projection}
            placing={placing}
            onPlace={(p) => {
              setStorm((s) => ({ center: p, radius: s?.radius ?? 500 }));
              setPlacing(false);
            }}
            onStormDrag={(p) => setStorm((s) => (s ? { ...s, center: p } : s))}
            onSelectAirport={(id) => {
              const a = airports?.find((x) => x.id === id);
              if (a && a.type !== 'closed' && a.ident !== 'RKSI') chooseAirport(a);
            }}
          />

          <div className={`controls ${controlsOpen ? '' : 'collapsed'}`}>
            <button className="controls-toggle" onClick={() => setControlsOpen((v) => !v)}>
              {controlsOpen ? '◂ 접기' : '▸ 목적지·태풍'}
            </button>
            {controlsOpen && (
              <div className="controls-body">
                {loadError && <div className="status bad">{loadError}</div>}
                <div className="demo-row">
                  <span className="tiny muted">빠른 예시</span>
                  {DEMOS.map((d) => (
                    <button key={d.ident} className="chip" onClick={() => runDemo(d)}>
                      {d.label}
                    </button>
                  ))}
                </div>
                <CountryAirportSearch
                  countries={countries}
                  country={country}
                  onCountry={chooseCountry}
                  airports={airports}
                  loadingAirports={loadingAirports}
                  selected={dest}
                  onSelect={chooseAirport}
                />
                <StormCreator
                  scenario={scenario}
                  hasDestination={!!dest}
                  radius={storm?.radius ?? 500}
                  onRadius={(r) => setStorm((s) => (s ? { ...s, radius: r } : s))}
                  onAuto={() => dest && setStorm(autoStorm({ lat: dest.lat, lon: dest.lon }))}
                  onClear={() => setStorm(null)}
                  placing={placing}
                  onPlacing={setPlacing}
                  hasStorm={!!storm}
                  maxRadius={radiusMax}
                />
              </div>
            )}
          </div>

          {scenario && (
            <div className="inset-wrap">
              <MathPlaneInset scenario={scenario} progress={flight.progress} showOther={showOther} open={insetOpen} onToggle={() => setInsetOpen((v) => !v)} />
            </div>
          )}

          <FlightPlayer
            enabled={canFly}
            reason={flyReason}
            playing={flight.playing}
            progress={flight.progress}
            speed={flight.speed}
            phase={canFly ? phase : null}
            pieces={canFly && param ? param.pieces : []}
            total={param?.total ?? 0}
            onPlay={() => dispatch({ type: 'play' })}
            onPause={() => dispatch({ type: 'pause' })}
            onRestart={() => dispatch({ type: 'restart' })}
            onSkip={() => param && dispatch({ type: 'skip', pieces: param.pieces, total: param.total })}
            onSeek={(p) => dispatch({ type: 'seek', progress: p })}
            onSpeed={(s) => dispatch({ type: 'speed', speed: s })}
            onResetStorm={() => dest && setStorm(autoStorm({ lat: dest.lat, lon: dest.lon }))}
          />
        </div>

        <aside className="side">
          <MathProcessPanel
            scenario={scenario}
            phase={canFly ? phase : null}
            playing={flight.playing || (flight.progress > 0 && flight.progress < 1)}
            destName={dest ? `${dest.name} (${koreanCountryName(dest.country, dest.country)})` : ''}
          />
        </aside>
      </main>

      {aboutOpen && (
        <div className="modal" onClick={() => setAboutOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>이 시뮬레이터에 대하여</h2>
            <p>
              교육용 2차원 기하 모델입니다. 태풍은 실제 기상 정보가 아니라 사용자가 만든 <b>원형 진입 금지 구역</b>이며, 실제 영공·연료·풍향·고도·운항
              제한은 반영하지 않습니다.
            </p>
            <p>
              <b>좌표:</b> 인천을 중심으로 한 방위정거리 투영(WGS84 측지선)으로 평면을 만들고, 목적지가 y = x 위의 A(t, t)가 되도록 좌표축을 회전합니다.
              인천에서의 거리는 정확히 보존되지만, 다른 곳의 거리·모양은 근사입니다. 지도에서 태풍이 동그랗지 않게 보이는 것은 투영 차이 때문입니다.
            </p>
            <p>
              <b>공항 데이터:</b> {meta?.source ?? 'OurAirports'} · 전처리 {meta ? new Date(meta.preparedAt).toLocaleDateString('ko-KR') : '—'} · 공항{' '}
              {meta?.totalAirports.toLocaleString() ?? '—'}곳 · 국가·지역 {meta?.countries ?? '—'}개. 데이터의 정확성·현실 시설의 존재·정기 노선 여부는
              보장되지 않습니다.
            </p>
            <p>
              <b>국경:</b> Natural Earth (world-atlas). <b>측지 계산:</b> GeographicLib.
            </p>
            <button className="btn primary" onClick={() => setAboutOpen(false)}>
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
