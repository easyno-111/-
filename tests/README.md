# 포털 상호작용 검증

Node.js 20 이상과 Playwright Chromium으로 메인 포털의 실제 브라우저 동작을 확인합니다.

```sh
npm install --no-save playwright
npx playwright install chromium
node tests/portal-interactions.spec.cjs
```

테스트는 임시 로컬 HTTP 서버를 직접 시작하고 종료합니다. `PORTAL_TEST_URL`을 지정하면 이미 실행 중인 로컬 서버를 사용할 수 있습니다. 별도 Chromium을 사용하려면 `CHROMIUM_EXECUTABLE`에 실행 파일 경로를 지정하세요. `PORTAL_TEST_ARTIFACTS`를 지정하면 실패한 시나리오의 화면을 해당 폴더에 저장합니다.

Firebase 초기화와 데이터 구독 모듈을 브라우저 요청 단계에서 테스트 데이터로 교체합니다. 운영 데이터베이스를 읽거나 수정하지 않으며, 외부 네트워크 요청과 서비스 워커는 차단합니다. 앱 실행 목적지도 테스트 서버가 응답합니다.

검증 범위:

- PC 설명 카드의 등장, 포인터 이동 시 유지, 앱 목록 위치 유지
- 키보드로 소개 열기, Escape 닫기와 초점 복원
- 모바일 첫 터치 시 설명 표시와 명시적인 사용하기 동작
- 교사용·학생용 링크와 자주 쓰는 앱의 바로 실행
- 키보드 순서 변경, 새로고침 유지, 기본 순서 복원
- 브라우저 프로필 간 배치 분리
- 길게 누르기 후 실행 방지, 같은 카테고리 드래그, 다른 카테고리 드롭 취소
- 실제 터치 이벤트로 스크롤, 길게 누른 뒤 드래그
- 작은 화면·동작 줄이기 설정·잘못 저장된 배치 데이터

일부 시나리오만 실행하려면 이름 일부를 전달합니다.

```sh
TEST_FILTER='mobile' node tests/portal-interactions.spec.cjs
```

검증 중에는 브라우저의 uncaught error도 실패로 처리합니다.
