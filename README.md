# 수학 콘텐츠 2026

심풀스터디 수업용 인터랙티브 수학 시뮬레이터 모음입니다. `main` 브랜치에 올리면 GitHub Actions가 테스트·빌드한 뒤
GitHub Pages에 자동 배포합니다.

| 콘텐츠 | 폴더 | 주소 |
|---|---|---|
| 태풍 회피 최단 항로 | [`storm-detour-lab/`](storm-detour-lab/) | https://simpulstudy26.github.io/math-content-2026/storm-detour-lab/ |

## 새 콘텐츠 추가하기

1. 새 폴더를 만들고 정적 빌드 결과가 `dist/`에 나오게 구성합니다 (Vite면 `base: './'`).
2. `.github/workflows/pages.yml`의 빌드·조립 단계에 그 폴더를 추가합니다.
3. 루트 `index.html`에 카드를 하나 추가합니다.
