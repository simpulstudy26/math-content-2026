/**
 * OurAirports 공개 도메인 CSV → 국가별 검색 인덱스 (명세 13장)
 *
 *   npm run prepare-airports              # data-raw/ 의 CSV 사용 (없으면 내려받기)
 *   npm run prepare-airports -- --download  # 항상 새로 내려받기
 *
 * 출력: public/data/meta.json, public/data/countries.json, public/data/airports/<CC>.json
 * 모든 레코드(소형·헬리포트·수상비행장·기구장·폐쇄 포함)를 빠짐없이 넣는다.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data-raw');
const OUT = join(ROOT, 'public', 'data');
// ourairports.com/data/ 의 파일과 동일한 내용을 OurAirports 관리자가 GitHub에 매일 미러링한다.
const SOURCES = {
  airports: [
    'https://davidmegginson.github.io/ourairports-data/airports.csv',
    'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv',
    'https://ourairports.com/data/airports.csv',
  ],
  countries: [
    'https://davidmegginson.github.io/ourairports-data/countries.csv',
    'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/countries.csv',
    'https://ourairports.com/data/countries.csv',
  ],
};

/** RFC 4180 CSV 파서 (따옴표·쉼표·줄바꿈 포함 필드 처리) */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.length > 1 || r[0] !== '');
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

async function download(urls: string[], dest: string) {
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
      console.log(`  내려받음: ${url}`);
      return url;
    } catch (e) {
      console.warn(`  실패: ${url} (${(e as Error).message})`);
    }
  }
  throw new Error(`${dest} 를 내려받지 못했습니다.`);
}

/** 공항 레코드 압축 배열 — src/data/airportTypes.ts 의 순서와 같아야 한다 */
type Packed = [
  number, // 0 id
  string, // 1 ident
  string, // 2 type
  string, // 3 name
  number, // 4 lat
  number, // 5 lon
  string, // 6 municipality
  string, // 7 iata
  string, // 8 icao
  string, // 9 gps
  string, // 10 local
  0 | 1, // 11 scheduled_service
  string, // 12 keywords
  string, // 13 iso_region
];

async function main() {
  const force = process.argv.includes('--download');
  mkdirSync(RAW, { recursive: true });
  const apPath = join(RAW, 'airports.csv');
  const ctPath = join(RAW, 'countries.csv');
  let sourceUrl = 'data-raw/airports.csv (로컬 사본)';
  if (force || !existsSync(apPath) || !existsSync(ctPath)) {
    console.log('OurAirports CSV 내려받는 중…');
    sourceUrl = await download(SOURCES.airports, apPath);
    await download(SOURCES.countries, ctPath);
  }

  const airports = parseCsv(readFileSync(apPath, 'utf8'));
  const countries = parseCsv(readFileSync(ctPath, 'utf8'));
  console.log(`airports.csv ${airports.length}건, countries.csv ${countries.length}건`);

  const byCountry = new Map<string, Packed[]>();
  const typeCounts: Record<string, number> = {};
  let bad = 0;
  for (const a of airports) {
    const lat = Number(a.latitude_deg);
    const lon = Number(a.longitude_deg);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      bad++;
      continue;
    }
    const cc = a.iso_country || 'ZZ';
    const rec: Packed = [
      Number(a.id),
      a.ident,
      a.type,
      a.name,
      Math.round(lat * 1e6) / 1e6,
      Math.round(lon * 1e6) / 1e6,
      a.municipality,
      a.iata_code,
      a.icao_code,
      a.gps_code,
      a.local_code,
      a.scheduled_service === 'yes' ? 1 : 0,
      a.keywords,
      a.iso_region,
    ];
    typeCounts[a.type] = (typeCounts[a.type] ?? 0) + 1;
    if (!byCountry.has(cc)) byCountry.set(cc, []);
    byCountry.get(cc)!.push(rec);
  }

  // 인천 검증
  const kr = byCountry.get('KR') ?? [];
  const icnMatches = kr.filter((r) => r[1] === 'RKSI' || r[7] === 'ICN' || r[8] === 'RKSI');
  if (icnMatches.length !== 1) throw new Error(`인천(RKSI/ICN) 레코드가 ${icnMatches.length}개입니다.`);
  const icn = icnMatches[0];
  if (Math.abs(icn[4] - 37.4691) > 0.05 || Math.abs(icn[5] - 126.451) > 0.05) {
    throw new Error(`인천 좌표가 예상과 다릅니다: ${icn[4]}, ${icn[5]}`);
  }

  // 출력
  rmSync(join(OUT, 'airports'), { recursive: true, force: true });
  mkdirSync(join(OUT, 'airports'), { recursive: true });
  const typeRank: Record<string, number> = {
    large_airport: 0,
    medium_airport: 1,
    small_airport: 2,
    seaplane_base: 3,
    heliport: 4,
    balloonport: 5,
    closed: 6,
    closed_airport: 6,
  };
  for (const [cc, list] of byCountry) {
    list.sort((p, q) => (typeRank[p[2]] ?? 9) - (typeRank[q[2]] ?? 9) || p[3].localeCompare(q[3]));
    writeFileSync(join(OUT, 'airports', `${cc}.json`), JSON.stringify(list));
  }

  const known = new Set(countries.map((c) => c.code));
  const countryIndex = countries.map((c) => ({
    code: c.code,
    name: c.name,
    continent: c.continent,
    keywords: c.keywords,
    count: byCountry.get(c.code)?.length ?? 0,
  }));
  for (const cc of byCountry.keys()) {
    if (!known.has(cc)) countryIndex.push({ code: cc, name: `(미등록 지역 ${cc})`, continent: '', keywords: '', count: byCountry.get(cc)!.length });
  }
  countryIndex.sort((p, q) => p.name.localeCompare(q.name));
  writeFileSync(join(OUT, 'countries.json'), JSON.stringify(countryIndex));

  const meta = {
    source: 'OurAirports (https://ourairports.com/data/) — Public Domain',
    sourceUrl,
    preparedAt: new Date().toISOString(),
    totalAirports: airports.length - bad,
    skippedInvalidCoords: bad,
    countries: countryIndex.length,
    typeCounts,
    origin: { id: icn[0], ident: icn[1], iata: icn[7], name: icn[3], lat: icn[4], lon: icn[5] },
  };
  writeFileSync(join(OUT, 'meta.json'), JSON.stringify(meta, null, 2));
  console.log(`완료: 공항 ${meta.totalAirports}건 / 국가·지역 ${meta.countries}개 → public/data/`);
  console.log('유형별:', typeCounts);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
