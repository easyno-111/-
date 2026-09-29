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
assets/
  portal.css, chalkboard-theme.css      포털 스타일
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
| | `random.html` | 랜덤 아레나 (핀볼 랜덤 뽑기) |
| 게임 | `shooter.html` | 로그라이트 화력 슈팅 |
| | `survival.html` | Space Survivor |

교실 주식게임과 교실 마피아는 별도 Firebase 호스팅 사이트로 연결됩니다 (`js/default-data.js` 참고).

## 포털 동작 방식

- 앱 목록, 카테고리, 테마는 Firebase Realtime Database의 `portal/apps`, `portal/categories`, `portal/settings`에서 읽습니다.
- 데이터가 없으면 `js/default-data.js`의 기본값을 사용합니다.
- 관리자 페이지(`admin.html`)는 Firebase 이메일/비밀번호 로그인으로 접근하며, 앱 추가·수정·삭제·숨김과 테마 설정을 할 수 있습니다.

## 관리할 때 주의할 점

- **앱 HTML 파일의 위치나 이름을 바꾸지 마세요.** 포털의 앱 링크는 Firebase DB에 `lesson_start.html` 같은 경로로 저장되어 있어서, 파일을 옮기면 카드 링크가 깨집니다. 옮기려면 관리자 페이지에서 링크도 함께 고쳐야 합니다.
- 홈 화면 디자인(칠판 테마)은 `assets/chalkboard-theme.css`에서 정합니다. 색은 파일 맨 위 `body.portal-view`의 `--studio-*`, `--board-*` 변수에서 바꿉니다. 이 테마는 고정 색을 쓰기 때문에, 관리자 페이지의 테마 프리셋·색상·둥근 정도 설정은 홈 화면에 반영되지 않습니다.
- 새 앱을 추가하려면 HTML 파일을 올린 뒤 관리자 페이지에서 카드를 등록하세요.
- Firebase Realtime Database 보안 규칙에서 `portal/` 쓰기 권한이 로그인한 관리자에게만 열려 있는지 정기적으로 확인하세요. 규칙은 이 저장소가 아니라 Firebase 콘솔에서 관리합니다.
- 포털 카드는 Firebase에 저장되어 있어서, 이 저장소의 어떤 HTML 파일이든 카드 링크로 쓰일 수 있습니다. 파일을 지우거나 이름을 바꾸기 전에 관리자 페이지에서 카드 링크를 먼저 확인하세요. 예: `presentation.html`은 "9월 정기보고" 카드로 등록되어 있고, `assets/cleanup_scene_1~4.png`는 이 페이지에서만 사용합니다.
