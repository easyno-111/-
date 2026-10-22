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
  portal-preview.js                    앱 설명 미리보기
  portal-reorder.js                    기기별 앱 배치
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
  portal-interactions.css, portal-reorder.css  앱 설명·배치 편집 스타일
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


## 앱 설명과 기기별 배치

- PC에서 앱 위에 마우스를 잠깐 올리면 아이콘이 확대되고 설명 카드가 나타납니다. 카드의 버튼으로 실행하거나, 앱을 눌러 설명 창을 열 수 있습니다. 키보드로 앱에 이동한 뒤 Enter/Space를 눌러도 설명 창이 열립니다.
- 모바일·태블릿에서는 앱을 한 번 누르면 아래에서 설명 패널이 열립니다. `사용하기`를 눌러 실행하고, 링크가 두 개인 앱은 등록된 이름대로 실행 버튼 두 개를 표시합니다. 설명은 관리자가 등록한 앱 설명을 그대로 사용합니다.
- `자주 쓰는 앱`은 기존처럼 바로 실행합니다. 두 링크가 있으면 설명과 선택 버튼을 함께 표시합니다.
- 앱을 약 0.55초 누르거나 `앱 배치`를 누르면 편집 모드가 됩니다. 터치 화면에서는 길게 누른 손을 뗀 다음 앱을 다시 끌어 이동하세요. 일반 모드에서 손가락을 움직이면 스크롤하고, 편집 모드에서는 앱을 끌어 이동합니다. 앱 사이 빈 공간에서는 스크롤할 수 있습니다.
- 같은 카테고리 안에서만 이동할 수 있습니다. 다른 카테고리에 놓거나 드래그를 취소하면 원래 위치로 돌아갑니다. 편집 모드에서는 방향키로도 순서를 바꿀 수 있고 `완료` 또는 Escape로 나갑니다.
- 순서는 이 사이트를 여는 **현재 브라우저의 localStorage**(`teacherPortalAppOrderV1`)에만 저장합니다. 다른 기기·다른 브라우저·Firebase의 공통 순서는 바뀌지 않습니다. 브라우저 데이터를 지우면 초기화됩니다. 저장이 제한된 환경은 안내 문구를 표시합니다.
- 검색 중에 배치를 바꾸어도 검색에서 빠진 앱은 보존합니다. 새 앱은 해당 카테고리의 기존 개인 배치 뒤에 추가됩니다. `기본 순서`는 현재 브라우저의 전체 개인 배치를 초기화합니다.
- 브라우저 검증 실행 방법은 `tests/README.md`를 참고하세요.
