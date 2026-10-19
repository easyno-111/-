# 수학 실험실 · 교사용 앱 포털

수업과 학급 운영에 쓰는 웹 도구를 한곳에 모아 둔 정적 사이트입니다. 빌드 과정 없이 HTML/JS 파일을 그대로 GitHub Pages로 배포합니다.

## 구조

```
index.html            메인 포털 (앱 카드 목록)
admin.html            관리자 페이지 (앱·카테고리·테마 편집)
offline.html          오프라인 안내 페이지
sw.js                 서비스 워커 (PWA, 온라인이면 항상 최신 파일 우선)
manifest.webmanifest  PWA 설정
js/
  portal.js, portal-enhancements.js     포털 동작
  admin.js, admin-enhancements.js       관리자 동작
  default-data.js                       기본 앱 목록·카테고리·테마 프리셋
  firebase-config.js                    Firebase 초기화
  arena/                                랜덤 아레나(random.html) ES 모듈
    main.js                             진입점 · DOM 연결 · 프리셋 · 엑셀 명단 가져오기
    state.js, core.js, util.js          공유 상태 · 싱글턴(도트 버퍼/이펙트/오디오) · 유틸
    pixel.js, palette.js, fx.js         소프트웨어 도트 래스터라이저 · 고정 팔레트 · 파티클/흔들림/히트스톱
    audio.js                            칩튠 시퀀서(4채널) · 효과음 · 심장박동
    physics.js, courses.js              핀볼 물리 · 코스 생성
    render.js                           도트 무대 + 네오둥근모 HUD 렌더러
    engines/race.js lotto.js teams.js order.js   모드별 엔진 (사진 판정·리플레이, 캡슐 공개, 팀 통, 셔플)
    roster.js, presets.js, results.js   엑셀 파싱(이름 가리기) · 프리셋 저장 · 결과 보드/PNG/복사
  vendor/xlsx.mini.min.js               SheetJS (엑셀 명단 읽기, Apache-2.0)
assets/
  portal.css, chalkboard-theme.css      포털 스타일
  arena.css                             랜덤 아레나 스타일
  fonts/neodgm.woff2                    Neo둥근모 픽셀 글꼴 (OFL-1.1)
  chalkboard-bg.webp, cleanup_scene_*.png
  images/                               앱에서 쓰는 이미지 (수업 교재 이미지, 슈팅 게임 캐릭터)
icons/                앱 아이콘 (192, 512)
*.html                개별 앱 (아래 표 참고)
```

## 개별 앱

| 분류 | 파일 | 설명 |
|---|---|---|
| 이차함수 수업 | `lesson_start.html` | 비밀 요원 훈련: 이차함수 탐구 수업 (내부에서 `quadratic.html`, `lock.html` 사용) |
| | `quadratic.html` | 이차함수 데이터 시뮬레이터 |
| | `lock.html` | 이차함수 자물쇠 방탈출 |
| | `fence.html` | 울타리 최대 넓이 시뮬레이션 |
| 교실 게임 | `pig.html`, `pig2.html` | 돼지 주사위 게임 (기본, 더블) |
| | `nunchi.html` | 눈치게임 |
| | `auction.html` | 마이너스 경매 |
| 도구 | `editor.html` | 라이브 코드 에디터 |
| | `seat.html` | 교실 올인원 배정기 (Apps Script 앱으로 이동) |
| | `random.html` | 랜덤 아레나 V7 (도트 스타일 로또 캡슐·핀볼 레이스·팀 나누기·전체 순서, 엑셀 명단 가져오기) |
| 게임 | `shooter.html` | 로그라이트 화력 슈팅 |
| | `survival.html` | Space Survivor |

교실 주식게임과 교실 마피아는 별도 Firebase 호스팅 사이트로 연결됩니다 (`js/default-data.js` 참고).

## 포털 동작 방식

- 앱 목록, 카테고리, 테마는 Firebase Realtime Database의 `portal/apps`, `portal/categories`, `portal/settings`에서 읽습니다.
- 데이터가 없으면 `js/default-data.js`의 기본값을 사용합니다.
- 관리자 페이지(`admin.html`)는 Firebase 이메일/비밀번호 로그인으로 접근하며, 앱 추가·수정·삭제·숨김과 테마 설정을 할 수 있습니다.

## 랜덤 아레나 (random.html)

- 무대는 저해상도 버퍼에 그린 뒤 정수 배율로 확대하는 도트 스타일입니다. 글꼴은 Neo둥근모를 `assets/fonts`에 포함했습니다.
- `type="module"` 스크립트를 쓰므로 파일을 직접(file://) 열면 동작하지 않습니다. GitHub Pages나 로컬 서버에서 실행하세요.
- **엑셀 명단 가져오기**: 조작 패널의 "엑셀 명단 가져오기"에 학적 현황표(.xlsx)를 올리면 머리글(`반`·`번호`·`성명`)을 찾아 반별 프리셋으로 저장합니다. 이름은 `이O후`처럼 가운데 글자를 가린 형태로만 저장되고 원본 이름은 저장되지 않습니다. `.xls`는 `.xlsx`로 다시 저장한 뒤 올리세요.
- 프리셋과 마지막 설정은 이 기기의 localStorage에만 저장됩니다.

## 관리할 때 주의할 점

- **앱 HTML 파일의 위치나 이름을 바꾸지 마세요.** 포털의 앱 링크는 Firebase DB에 `lesson_start.html` 같은 경로로 저장되어 있어서, 파일을 옮기면 카드 링크가 깨집니다. 옮기려면 관리자 페이지에서 링크도 함께 고쳐야 합니다.
- 홈 화면은 앱을 큰 아이콘 타일로 보여 주는 런처 방식입니다(`assets/chalkboard-theme.css`, `js/portal.js`). 색은 CSS 파일 맨 위 `body.portal-view`의 변수에서 바꿉니다. 이 테마는 고정 색을 쓰기 때문에, 관리자 페이지의 테마 프리셋·색상·둥근 정도·배경 사진 설정은 홈 화면에 반영되지 않습니다. 앱 아이콘은 관리자 페이지에서 앱마다 올리면 되고(정사각형, 글자 없이, 220×220 webp로 자동 압축), 아이콘이 없는 앱은 앱 이름 첫 글자가 표시됩니다.
- 새 앱을 추가하려면 HTML 파일을 올린 뒤 관리자 페이지에서 카드를 등록하세요.
- Firebase Realtime Database 보안 규칙에서 `portal/` 쓰기 권한이 로그인한 관리자에게만 열려 있는지 정기적으로 확인하세요. 규칙은 이 저장소가 아니라 Firebase 콘솔에서 관리합니다.
- 포털 카드는 Firebase에 저장되어 있어서, 이 저장소의 어떤 HTML 파일이든 카드 링크로 쓰일 수 있습니다. 파일을 지우거나 이름을 바꾸기 전에 관리자 페이지에서 카드 링크를 먼저 확인하세요. 예: `presentation.html`은 "9월 정기보고" 카드로 등록되어 있고, `assets/cleanup_scene_1~4.png`는 이 페이지에서만 사용합니다.
