# 현장 전력지도

현장 위치와 송전선로·변전소·발전소를 한 지도에서 보는 설치형 웹앱(PWA)입니다.
윈도우·맥·핸드폰에 설치할 수 있고 오프라인에서도 동작합니다.

https://woosups-lab.github.io/power-map/

## 구성

| 경로 | 내용 |
| --- | --- |
| `index.html` | 앱 본체 |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA (오프라인·설치) |
| `vendor/` | Leaflet, MapLibre GL(CSP 빌드), maplibre-gl-leaflet, JSZip |
| `grid.json`, `grid-meta.json` | OSM 전력설비 데이터와 날짜·해시 (자동 생성) |
| `scripts/build-grid.mjs` | 전력설비 데이터 생성 |
| `scripts/serve.mjs` | 개발용 서버 (`node scripts/serve.mjs`, http://localhost:8123/) |
| `.github/workflows/deploy.yml` | 주간 데이터 갱신과 GitHub Pages 배포 |

## 데이터 갱신

매주 월요일 03:00(KST)에 Actions가 `scripts/build-grid.mjs`를 실행합니다. 내용이 바뀌었을 때만
커밋하고 배포합니다. 개수가 이전의 70% 밑으로 줄면 서버 오류로 보고 실패 처리하여 기존 데이터를 지킵니다.
Actions 탭의 Run workflow로 바로 실행할 수도 있습니다.

앱은 저장본을 먼저 보여주고 `grid-meta.json`의 날짜가 더 새로울 때만 `grid.json`을 다시 받습니다.
`grid.json`을 받을 수 없으면 Overpass에서 직접 받습니다.

## 현장 데이터

회사 현장 정보는 이 저장소에 올리지 않습니다. 이 저장소는 공개 저장소입니다.

- 현장·기록·첨부는 Supabase(서울)에 저장됩니다. 구조와 권한 규칙은 `supabase/schema.sql`입니다.
- 권한은 서버의 `members` 표가 정합니다. admin은 읽기·쓰기, viewer는 읽기만 할 수 있고, 등록되지 않은 계정은 아무것도 할 수 없습니다.
- 이용자는 공용 계정 비밀번호로, 관리자는 자기 이메일로 로그인합니다. 신규 가입은 막혀 있습니다.
- 서버 주소, 공개 키, 이용자 계정 주소는 저장소가 아니라 GitHub Secret(SUPABASE_URL, SUPABASE_KEY, VIEWER_EMAIL)에 두고 배포할 때 `config.json`에 넣습니다.
- 무료 플랜에는 자동 백업이 없으니 관리자는 전체 백업 ZIP을 가끔 받아 둡니다.
- `keepalive.yml`이 주 2회 서버에 접속해 1주일 미사용 일시정지를 막습니다.

## 데이터 출처

- 전력설비: © OpenStreetMap 기여자, [ODbL](https://www.openstreetmap.org/copyright)
- 배경지도: [OpenFreeMap](https://openfreemap.org), © OpenMapTiles, OpenStreetMap
- 지형 음영: Mapzen Terrain Tiles (AWS Open Data)
