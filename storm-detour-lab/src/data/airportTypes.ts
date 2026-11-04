/** 전처리 스크립트(scripts/prepare-airports.ts)의 압축 배열 형식 */
export type PackedAirport = [
  number, string, string, string, number, number, string, string, string, string, string, 0 | 1, string, string,
];

export interface Airport {
  id: number;
  ident: string;
  type: string;
  name: string;
  lat: number;
  lon: number;
  municipality: string;
  iata: string;
  icao: string;
  gps: string;
  local: string;
  scheduled: boolean;
  keywords: string;
  region: string;
  country: string;
}

export interface CountryEntry {
  code: string;
  name: string;
  continent: string;
  keywords: string;
  count: number;
}

export interface DataMeta {
  source: string;
  sourceUrl: string;
  preparedAt: string;
  totalAirports: number;
  countries: number;
  typeCounts: Record<string, number>;
  origin: { id: number; ident: string; iata: string; name: string; lat: number; lon: number };
}

export const unpack = (p: PackedAirport, country: string): Airport => ({
  id: p[0],
  ident: p[1],
  type: p[2],
  name: p[3],
  lat: p[4],
  lon: p[5],
  municipality: p[6],
  iata: p[7],
  icao: p[8],
  gps: p[9],
  local: p[10],
  scheduled: p[11] === 1,
  keywords: p[12],
  region: p[13],
  country,
});

export const isClosed = (a: Airport) => a.type === 'closed' || a.type === 'closed_airport';
export const isOrigin = (a: Airport) => a.ident === 'RKSI';

export const TYPE_LABEL: Record<string, string> = {
  large_airport: '대형 공항',
  medium_airport: '중형 공항',
  small_airport: '소형 비행장',
  heliport: '헬리포트',
  seaplane_base: '수상비행장',
  balloonport: '기구 이착륙장',
  closed: '폐쇄',
  closed_airport: '폐쇄',
};

/** 검색 일치 점수: 코드 정확 일치 > 이름 시작 > 포함 */
export function matchScore(a: Airport, q: string): number {
  if (!q) return 1;
  const Q = q.toUpperCase();
  if (a.iata === Q || a.icao === Q || a.ident === Q || a.gps === Q || a.local === Q) return 100;
  const name = a.name.toUpperCase();
  if (name.startsWith(Q)) return 50;
  if (a.municipality.toUpperCase().startsWith(Q)) return 40;
  if (name.includes(Q)) return 30;
  if (a.municipality.toUpperCase().includes(Q)) return 20;
  if (a.keywords.toUpperCase().includes(Q)) return 10;
  if (a.ident.includes(Q) || a.region.includes(Q)) return 5;
  return 0;
}
