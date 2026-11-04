import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isClosed, matchScore, unpack, type CountryEntry, type DataMeta, type PackedAirport } from '../src/data/airportTypes';
import { parseCsv } from '../scripts/prepare-airports';

const DATA = join(__dirname, '..', 'public', 'data');
const hasData = existsSync(join(DATA, 'meta.json'));

const load = (cc: string) =>
  (JSON.parse(readFileSync(join(DATA, 'airports', `${cc}.json`), 'utf8')) as PackedAirport[]).map((p) => unpack(p, cc));

describe('CSV 파서', () => {
  it('따옴표 안의 쉼표·줄바꿈·이중 따옴표', () => {
    const rows = parseCsv('a,b,c\n1,"x, y","he said ""hi"""\n2,"line\nbreak",\n');
    expect(rows).toEqual([
      { a: '1', b: 'x, y', c: 'he said "hi"' },
      { a: '2', b: 'line\nbreak', c: '' },
    ]);
  });
});

describe.runIf(hasData)('전처리된 공항 데이터 (npm run prepare-airports 이후)', () => {
  const meta = hasData ? (JSON.parse(readFileSync(join(DATA, 'meta.json'), 'utf8')) as DataMeta) : null!;
  const countries = hasData ? (JSON.parse(readFileSync(join(DATA, 'countries.json'), 'utf8')) as CountryEntry[]) : [];

  it('모든 레코드가 국가 파일에 들어감 (누락 없음)', () => {
    const sum = countries.reduce((s, c) => s + c.count, 0);
    expect(sum).toBe(meta.totalAirports);
    expect(meta.totalAirports).toBeGreaterThan(80000);
  });
  it('모든 시설 유형 포함', () => {
    for (const ty of ['large_airport', 'medium_airport', 'small_airport', 'heliport', 'seaplane_base', 'balloonport']) {
      expect(meta.typeCounts[ty]).toBeGreaterThan(0);
    }
    expect((meta.typeCounts.closed ?? 0) + (meta.typeCounts.closed_airport ?? 0)).toBeGreaterThan(0);
  });
  it('인천 RKSI/ICN 식별', () => {
    expect(meta.origin.ident).toBe('RKSI');
    expect(meta.origin.iata).toBe('ICN');
    const kr = load('KR');
    expect(kr.filter((a) => a.ident === 'RKSI')).toHaveLength(1);
  });
  it('IATA 없는 소형 비행장도 ident로 검색 가능', () => {
    const us = load('US');
    const small = us.find((a) => a.type === 'small_airport' && !a.iata && !isClosed(a))!;
    expect(small).toBeTruthy();
    expect(matchScore(small, small.ident)).toBe(100);
  });
  it('폐쇄 공항은 검색 결과에 남아 있음', () => {
    const us = load('US');
    expect(us.some(isClosed)).toBe(true);
  });
  it('예시 국가들(한·일·미·영·브라질·남아공·뉴질랜드·칠레·피지) 데이터 존재', () => {
    for (const cc of ['KR', 'JP', 'US', 'GB', 'BR', 'ZA', 'NZ', 'CL', 'FJ']) {
      expect(load(cc).length).toBeGreaterThan(0);
    }
  });
});
