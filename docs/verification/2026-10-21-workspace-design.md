# 작업 화면 리디자인 검증

기준: 2026-10-21, `codex/mobile-workspace-design`, 모바일 기반 커밋 `6c75674`.

## 범위

AppShell·오늘·일감 목록·새 일감·상세·패키지·설정의 공통 웹 UI. Android·iOS가 같은 웹 자산을 사용한다. 랜딩·공개 수정 요청 폼·운영 데이터·DB/Auth 설정은 이번 디자인 변경 범위에 포함하지 않는다.

흰색·흑연색 작업 목록, 제한된 체리색 주의 표시로 변경했다. 선택·진행·완료·고객 대기는 색만으로 구분하지 않는다. 상세 방향과 공식 참고 자료는 `docs/design/workspace-direction.md`.

## 자동 검사

- Today 일감 범위 신규 3개 및 동일 고객 대기 식별 1개 회귀: 구현 전 실패를 확인했고 최종 8개 전체 통과.
- 전체 Vitest: 115개 파일 / 712개 통과 (`--maxWorkers=2`, 82.67초).
- ESLint / TypeScript: 통과.
- Next production build: 통과.
- Sites client/worker build: 통과. 기존 500KB chunk 및 Vite 향후 native config loader 경고는 남는다.
- 전체 브라우저 회귀: 데스크톱 29 + 모바일 29 = 58개 통과.
- 시각 회귀 추가 실행: 4개 통과. 12개 합성 일감, 동일 고객의 서로 다른 주문, 완료 처리, 검색, 320·761·1265px 넘침을 검사했다.
- 디자인 detector: 변경한 CSS·컴포넌트 대상 1회 실행, 결과 `[]`.
- native 자산 sync / mobile:verify / Android assembleDebug / APK 서명 검사: 통과. Android는 186 task, 31초, APK v2 서명 검증 성공.

처음 E2E에서 안내 라벨을 광범위하게 숨기는 규칙 때문에 ‘아직 준비 중인 기능’이 보이지 않는 회귀가 발견됐다. 의미 있는 안내 라벨은 유지하고 장식용 pageEyebrow에만 숨김을 적용한 뒤 전체 58개를 다시 통과했다.

최종 리뷰 수정 후에는 새 테스트의 문자열 공백·변경한 제목 기대값·중복 일감 fixture 선택자를 바로잡았다. 테스트 입력 타입도 `todo`에 한정되지 않게 명시했다. 최종 소스로 전체 712개와 E2E 58개를 다시 통과했다. 중간에 테스트 worker 시작 timeout이 발생했고, 당시 남은 물리 메모리는 약 440MB였다. 이 작업의 미리보기와 Gradle daemon을 중지하고 제한된 worker 수로 재검사했다. timeout 실행은 통과로 계산하지 않았다.

기존 경고: Vitest의 localstorage-file 경고, 일부 계정 링크 테스트의 React act 경고, 테스트 간 Capacitor 플러그인 중복 등록 안내, Android flatDir/SDK XML 버전 안내가 남는다. 검사 실패를 숨기거나 이 경고를 새로 해결했다고 주장하지 않는다.

## 화면 검수

`.impeccable/review/`에 오늘·일감·상세·새 일감·패키지·설정의 desktop/mobile 전체 화면과 viewport 캡처가 있다. `workspace-user-1265.png`는 사용자 창 폭을 반영한다.

표시되는 고객·일감은 격리된 브라우저 테스트의 합성 자료다. 실제 고객 사례, 가입자 수 또는 사용 실적이 아니다. 운영 데이터에는 넣지 않았다.

메인 검수에서 목록의 6개 요소/5개 열 불일치, 잘린 진행률, 이니셜 정렬, 상세 하단 버튼 위치, 시간 입력 폭을 보완했다. 이후 독립 리뷰의 판단과 수정 내역을 아래에 이어 기록한다.

## 독립 리뷰

전용 `impeccable_finish_reviewer` 역할이 도구 목록에 없어, 대화 이력을 전달하지 않은 별도 리뷰 에이전트 `workspace_design_finish`에 스킬의 리뷰 계약·사용자 요청·화면·코드만 전달했다. 모델은 전역 정책에 따라 GPT‑6.1 Sol / high.

첫 판정: `fix`. 동일 고객 대기 행의 일감명 누락, 진행 캡션의 어두운 배경, 설정의 주황색, 장식성 소제목, 근거 없는 ‘평균 30초’, 디자인 문서의 구 정책 충돌을 지적했다.

한 차례 수정 묶음으로 UI 지적 5건을 반영하고 동일 25개 캡처를 재생성했다. 재검토에서 UI 5건 해결 및 해당 수정에 따른 시각 회귀 없음이 확인됐다. 별도 documenter가 DESIGN.md·PRODUCT.md의 작업 화면 정책을 갱신하고 `.impeccable/design.json`을 기록했다(JSON schemaVersion 2, 컴포넌트 8개). JSON 구문 검증과 diff 검사는 통과했고 정식 YAML 스키마 검증은 도구가 없어 수행하지 않았다.

최종 독립 판정: `ship`, `remaining: clear`. **앞서 제시한 6개 material finding의 해결에 한정**하며 전체 제품 전수 승인, 운영 배포 승인, 네이티브 OS·실기기 검증이 아니다.

## 저장 산출물

- 폴더: `D:/SaaS/01_일감체크/release-artifacts/2026-10-21-workspace-design`
- Android 테스트 APK: `일감체크-디자인검증.apk`
- SHA-256: `7A8883B2D8B206E9506899CBC06FD318C15D3AEB94295B4EAA23098BD620D672`
- 확인용 이미지: `모바일-오늘.png`, `웹-일감.png`
- 로컬 미리보기: `http://127.0.0.1:4121/today` — 빈 로컬 작업공간, 운영 계정 자료 아님.

## 검증 경계

- 운영 사이트에는 아직 이 디자인을 배포하지 않았다.
- 브라우저 모바일 화면 검사는 실제 휴대폰 설치·OAuth 복귀·푸시 수신 검증과 다르다.
- Android는 테스트 APK이며 스토어 출시본이 아니다.
- iOS는 공통 자산 동기화까지만 해당한다. Mac/Xcode·Apple Developer가 없어 서명·TestFlight 단계는 별도다.
- PR #13의 모바일 운영 연결 작업(Auth callback·발송 키·예약 호출·운영 배포)은 `2026-10-21-mobile-mvp.md`의 상태를 유지한다.
