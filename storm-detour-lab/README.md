# 태풍 회피 최단 항로 — 수학 시뮬레이터 (초안 v0.1)

인천국제공항(ICN/RKSI)에서 전 세계 공항까지의 항로를 고르고, 가상의 원형 태풍을 피하는 **최단 우회 경로**를
고1 좌표기하와 중3 삼각비표로 구하는 교육용 웹 앱입니다.

핵심 아이디어: 목적지를 고를 때마다 좌표축을 평행이동·회전해 **O = (0, 0), A = (t, t)** 로 정규화합니다.
기본 항로는 언제나 직선 `y = x` 가 되므로 교점·우회 방향·접선 계산이 단순해집니다.

## 실행

```bash
npm install
npm run prepare-airports   # OurAirports CSV → public/data/ (이미 들어 있으면 생략 가능)
npm run dev                # http://localhost:5173
```

| 명령 | 하는 일 |
|---|---|
| `npm run prepare-airports` | `data-raw/`의 CSV로 국가별 인덱스 생성. CSV가 없으면 내려받음 |
| `npm run prepare-airports -- --download` | OurAirports 최신 CSV를 새로 내려받아 다시 생성 |
| `npm test` | 수학·지리·데이터·재생 상태 자동 테스트 (vitest) |
| `npm run build` | 타입 검사 + 정적 빌드 → `dist/` |
| `npm run preview` | 빌드 결과 미리 보기 |

### 배포

`npm run build` 후 `dist/` 폴더 전체를 정적 호스팅(GitHub Pages, Netlify, Vercel, 학교 웹서버 등)에 올리면 됩니다.
`base: './'` 로 빌드하므로 하위 경로에 올려도 동작합니다. 지도 타일 서버가 필요 없습니다(국경선 데이터를 앱에 포함).
글꼴(Noto Sans KR)만 Google Fonts에서 불러오며, 오프라인이면 시스템 글꼴로 대체됩니다.

## 사용 흐름

1. **국가 → 공항** 순서로 목적지 선택 (또는 상단 '빠른 예시')
2. 태풍이 OA 중점 근처에 자동 배치됨 → ✛ 를 끌거나 반지름을 바꾸며 교점 I−, I+ 변화 관찰
3. 태풍이 선분 OA를 두 점에서 가로지를 때만 **비행 시작** 버튼이 켜짐
4. 비행이 OP(접선) → PQ(원호) → QA(접선) 단계로 진행되며, 오른쪽 수학 패널에서 같은 단계가 강조됨
5. 오른쪽 아래 **수학 좌표계 미니뷰**에서 정확한 비율의 원·y=x·P·Q·R 확인, 상단에서 지구본 보기·반대쪽 후보 표시 전환

## 구조

```
src/
  math/                    ← React와 무관한 순수 수학 엔진 (모든 화면이 이 결과만 사용)
    geoProjection.ts       지리 ↔ 인천 중심 방위정거리 평면 (GeographicLib, WGS84)
    frame45.ts             45° 정규화 좌표계와 역변환            (명세 3장)
    intersections.ts       직선 y=x·선분 OA와 원의 교점 판정      (명세 4장)
    tangents.ts            원 밖의 점에서 그은 접점 T±            (명세 7장)
    angleTable.ts          코사인표 생성·역조회·이분 탐색 (acos 미사용) (명세 9-2)
    detour.ts              우회 방향·R·α·원호·Lmin, 경로 매개화   (명세 5~10장)
    scenario.ts            입력 → 단일 결과 객체 (좌표·검사·경로·렌더·경고)  (명세 17장)
  state/flight.ts          비행 재생 리듀서 (시나리오 바뀌면 자동 초기화)
  data/airportTypes.ts     공항 레코드 형식·검색 점수
  components/              CountryAirportSearch, WorldFlightMap, MathPlaneInset, StormCreator,
                           FlightPlayer, MathProcessPanel, CosineLookupTable, ComparisonSummary
scripts/prepare-airports.ts  CSV 검증·전처리 (인천 레코드 검증 포함)
tests/                     자동 테스트 (명세 15장 시나리오)
public/data/               전처리된 공항 데이터 (국가별 JSON)
```

### 계산 파이프라인

```
공항 경위도 ──측지선 역문제──▶ (D, β) ──▶ A₀ = (D sin β, D cos β)
          ──축 회전 e, n──▶ A = (t, t), C = (a, b)
          ──▶ 교점 u± · 상태 판정 ──▶ b−a 로 우회 방향
          ──▶ 접점 P, Q ──▶ OP, AQ (피타고라스) ──▶ 접선 교점 R, d = CR
          ──▶ cos α = r/d → 코사인표 역조회로 α ──▶ 호 = πrα/90 ──▶ Lmin
          ──▶ 경로 샘플 ──역회전·측지선 정문제──▶ 지도 좌표 (지도·미니뷰·비행기 모두 같은 샘플 사용)
```

## 테스트가 확인하는 것

- 명세 11장 예제 (O=(0,0), A=(6,6), C=(3,3), r=√2): 교점 (2,2)·(4,4), OP=AQ=4, CR=3/2,
  α≈19.471221°, 중심각≈38.942441°, 호≈0.961204, Lmin≈8.961204, ΔL≈0.475923
- b>a / b<a / b=a 의 우회 방향, 무작위 유효 태풍 500개에서 'b−a 규칙 = 두 후보 실제 비교'
- 닿지 않음·접함·선분 밖 교차·출발/도착 침범·반지름 0
- 중심이 제2~4사분면, 접점 공식의 |T−C|=r·반지름⟂접선
- 반대편 후보가 180°를 넘는 큰 호일 때 360°−2α′ 로 보정
- 임의 방향 목적지 300개에서 A=(t,t), 거리·직교성 보존, 역변환 왕복
- 실제 공항(나리타·JFK·히스로·상파울루·요하네스버그·오클랜드·산티아고·나디·호놀룰루·스발바르·몬테비데오·김포):
  측지 거리 = 평면 거리, 경로가 원 안에 들어가지 않음, 날짜변경선에서 선이 끊기지 않음, 대척점 경고
- 데이터: 모든 레코드·시설 유형 포함, 인천 식별, IATA 없는 소형 비행장 검색, 폐쇄 공항 유지
- 비행 중 태풍 변경 시 재생 초기화, 배속, 단계 넘기기

## 모델의 한계

- 태풍은 실제 기상이 아니라 **원형 진입 금지 구역**이며, 영공·연료·풍향·고도·운항 제한은 반영하지 않습니다.
- 방위정거리 평면은 **인천에서의 거리·방위만** 정확합니다. 태풍 주변의 거리·원호 길이는 이 평면 위의 값입니다.
  그래서 지도(메르카토르·지구본)에서는 태풍이 동그랗지 않게 보일 수 있습니다 — 오류가 아니라 투영 차이입니다.
- 인천의 대척점(우루과이·브라질 남부 앞바다) 근처 목적지는 방위가 불안정해 경고를 표시합니다.
  태풍이 대척점 한계(평면 반지름 ≈ 20,004 km)를 넘으면 지도로 되돌릴 수 없어 비행을 막습니다.

## 데이터 출처

- 공항: [OurAirports](https://ourairports.com/data/) (Public Domain) — 정확성·현실 시설의 존재·정기 노선 여부는 보장되지 않습니다.
  전처리 시각과 건수는 `public/data/meta.json` 과 앱의 '정보' 창에 표시됩니다.
- 국경선: Natural Earth (`world-atlas` 패키지)
- 측지 계산: [GeographicLib](https://geographiclib.sourceforge.io/)
- 지도 엔진: [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/)
