import { useEffect, useMemo, useRef, useState } from 'react';
import { TYPE_LABEL, isClosed, isOrigin, matchScore, type Airport, type CountryEntry } from '../data/airportTypes';

let regionNames: Intl.DisplayNames | null = null;
try {
  regionNames = new Intl.DisplayNames(['ko'], { type: 'region' });
} catch {
  regionNames = null;
}
export function koreanCountryName(code: string, fallback: string): string {
  try {
    const n = regionNames?.of(code);
    if (n && n !== code) return n;
  } catch {
    /* 표준이 아닌 코드 */
  }
  return fallback;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** 고정 높이 가상 리스트 */
function VirtualList<T>({
  items,
  rowHeight,
  height,
  render,
}: {
  items: T[];
  rowHeight: number;
  height: number;
  render: (item: T, i: number) => React.ReactNode;
}) {
  const [top, setTop] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: 0 });
    setTop(0);
  }, [items]);
  const start = Math.max(0, Math.floor(top / rowHeight) - 4);
  const end = Math.min(items.length, Math.ceil((top + height) / rowHeight) + 4);
  return (
    <div
      ref={ref}
      className="vscroll"
      style={{ height: Math.min(height, Math.max(rowHeight, items.length * rowHeight)) }}
      onScroll={(e) => setTop((e.target as HTMLDivElement).scrollTop)}
    >
      <div style={{ height: items.length * rowHeight, position: 'relative' }}>
        {items.slice(start, end).map((it, k) => (
          <div key={start + k} style={{ position: 'absolute', top: (start + k) * rowHeight, left: 0, right: 0, height: rowHeight }}>
            {render(it, start + k)}
          </div>
        ))}
      </div>
    </div>
  );
}

interface Props {
  countries: CountryEntry[];
  country: string | null;
  onCountry: (code: string) => void;
  airports: Airport[] | null;
  loadingAirports: boolean;
  selected: Airport | null;
  onSelect: (a: Airport) => void;
}

export function CountryAirportSearch({ countries, country, onCountry, airports, loadingAirports, selected, onSelect }: Props) {
  const [cq, setCq] = useState('');
  const [aq, setAq] = useState('');
  const [showClosed, setShowClosed] = useState(true);
  const [openCountry, setOpenCountry] = useState(country === null);
  // 바깥(빠른 예시 등)에서 국가가 정해지면 국가 목록을 닫는다
  useEffect(() => {
    if (country) setOpenCountry(false);
  }, [country]);
  const dcq = useDebounced(cq, 120);
  const daq = useDebounced(aq, 160);

  const labeled = useMemo(
    () => countries.map((c) => ({ ...c, ko: koreanCountryName(c.code, c.name) })),
    [countries],
  );
  const countryHits = useMemo(() => {
    const q = dcq.trim().toLowerCase();
    const list = q
      ? labeled.filter(
          (c) =>
            c.ko.toLowerCase().includes(q) ||
            c.name.toLowerCase().includes(q) ||
            c.code.toLowerCase() === q ||
            c.keywords.toLowerCase().includes(q),
        )
      : labeled;
    return [...list].sort((p, q2) => p.ko.localeCompare(q2.ko, 'ko'));
  }, [labeled, dcq]);

  const airportHits = useMemo(() => {
    if (!airports) return [];
    const q = daq.trim();
    const out: { a: Airport; s: number }[] = [];
    for (const a of airports) {
      if (!showClosed && isClosed(a)) continue;
      const s = matchScore(a, q);
      if (s > 0) out.push({ a, s });
    }
    if (q) out.sort((p, r) => r.s - p.s);
    return out.map((o) => o.a);
  }, [airports, daq, showClosed]);

  const current = labeled.find((c) => c.code === country);

  return (
    <div className="search">
      <div className="search-step">
        <span className="step-no">1</span>
        <span className="step-title">국가·지역</span>
        {current && !openCountry && (
          <button className="chip" onClick={() => setOpenCountry(true)}>
            {current.ko} <small>{current.code}</small> ✎
          </button>
        )}
      </div>
      {(openCountry || !current) && (
        <>
          <input
            className="input"
            placeholder="국가 이름 또는 코드 (예: 일본, Brazil, NZ)"
            value={cq}
            onChange={(e) => setCq(e.target.value)}
            autoFocus={!current}
          />
          <VirtualList
            items={countryHits}
            rowHeight={34}
            height={204}
            render={(c) => (
              <button
                className={`row country-row ${c.code === country ? 'active' : ''}`}
                onClick={() => {
                  onCountry(c.code);
                  setOpenCountry(false);
                  setAq('');
                }}
              >
                <span>{c.ko}</span>
                <small className="muted">
                  {c.code} · {c.count.toLocaleString()}곳
                </small>
              </button>
            )}
          />
        </>
      )}

      {country && (
        <>
          <div className="search-step">
            <span className="step-no">2</span>
            <span className="step-title">공항·비행장</span>
            <label className="toggle-inline">
              <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> 폐쇄 포함
            </label>
          </div>
          <input
            className="input"
            placeholder="이름·도시·IATA·ICAO·ident (예: NRT, Haneda, 00AK)"
            value={aq}
            onChange={(e) => setAq(e.target.value)}
          />
          {loadingAirports ? (
            <div className="muted pad">공항 목록 불러오는 중…</div>
          ) : (
            <>
              <div className="muted tiny pad-x">
                {airportHits.length.toLocaleString()}곳 {airports && airportHits.length !== airports.length && `/ 전체 ${airports.length.toLocaleString()}곳`}
              </div>
              <VirtualList
                items={airportHits}
                rowHeight={50}
                height={250}
                render={(a) => {
                  const closed = isClosed(a);
                  const origin = isOrigin(a);
                  const disabled = closed || origin;
                  return (
                    <button
                      className={`row airport-row ${selected?.id === a.id ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
                      onClick={() => !disabled && onSelect(a)}
                      title={closed ? '폐쇄된 시설은 운항 시연 목적지로 선택할 수 없습니다.' : origin ? '출발지와 같은 공항입니다.' : ''}
                    >
                      <span className="ap-codes">
                        <b>{a.iata || '—'}</b>
                        <small>{a.ident}</small>
                      </span>
                      <span className="ap-main">
                        <span className="ap-name">{a.name}</span>
                        <small className="muted">
                          {a.municipality || a.region} · {TYPE_LABEL[a.type] ?? a.type}
                          {a.scheduled && ' · 정기편'}
                          {closed && ' · 선택 불가(폐쇄)'}
                          {origin && ' · 출발지'}
                        </small>
                      </span>
                    </button>
                  );
                }}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
