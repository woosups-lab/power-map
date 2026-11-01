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

- 현장 정보는 각 기기의 브라우저 저장소에만 있고 서버로 전송되지 않습니다.
- 기기 간 이동과 이용자 전달은 전체 백업 ZIP(기록·첨부 포함)으로 합니다. ZIP은 암호화되지 않습니다.
- 입장 비밀번호는 서버 없이 `access.json`의 해시로 확인합니다. 화면을 나누는 장치이지 서버 수준의 권한 통제가 아닙니다.
  비밀번호 변경은 앱의 관리자 모드에서 합니다.
- `.gitignore`가 `sites*.json`, CSV, KML 등을 막고, 배포는 정해진 파일만 복사합니다.

## 데이터 출처

- 전력설비: © OpenStreetMap 기여자, [ODbL](https://www.openstreetmap.org/copyright)
- 배경지도: [OpenFreeMap](https://openfreemap.org), © OpenMapTiles, OpenStreetMap
- 지형 음영: Mapzen Terrain Tiles (AWS Open Data)
