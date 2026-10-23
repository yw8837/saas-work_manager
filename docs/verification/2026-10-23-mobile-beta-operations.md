# 모바일 베타 운영 검증 — 2026-10-23

## 판정

웹/API와 푸시 서버의 운영 반영을 완료했다. 현재·기존 주소의 배포 후 검사 각13개와 모바일 API 접근 검사8개가 통과했다. Android 내부 설치 APK를 만들었지만, 실제 Android 설치·OAuth 복귀·웹↔앱 저장·잠금화면 알림과 iOS 서명 빌드의 실증은 남아 있다. 따라서 **서버 반영 완료 / Android 내부 검증본 준비 / 외부 모바일 베타 공개 보류**로 판정한다. 외부 모집이나 APK 외부 배포는 수행하지 않았다.

## 수정과 검증

| 항목 | 증거 |
| --- | --- |
| 계정 전환 경쟁 조건 | owner 검증·채널 종료 대기·잘못된 재인증 계정의 3개 RED 회귀를 수정. 이벤트 즉시 owner/화면 차단, 비동기 generation 검사 |
| Today 범위 | 일감 필터를 URL에 유지. 화면 재마운트 회귀 RED→GREEN |
| 의존성 | Next16.4.2/Vite8.3.5/Vitest4.1.12. 운영 audit 0. 개발 전용 braces 경로 high5는 공급자 미패치로 별도 잔존 |
| 자동 release | PR14 Windows 116파일719검사 통과. PR15에 회귀1개 추가 후 GitHub Linux 116파일·719통과/1조건부skip(총720), typecheck/lint·운영audit·local/hosted 빌드 통과. Windows 관련2파일41개도 통과 |
| 브라우저 | 데스크톱·모바일 합계58개 시나리오 통과. 실기기 설치 검사가 아님 |
| DB | 임시 PGlite에서 전체 migration, native push·일감 삭제·23개 RPC 권한, nonce 중복 차단·권한 통과 |
| Edge | Deno check 및3개 테스트 통과. 독립 SQL pgcrypto→실제TS 서명 검증 통과 |
| 모바일 | Android/iOS 자산 sync와 계약 검증 통과. iOS 컴파일 통과를 의미하지 않음 |
| Android | assembleDebug 186tasks 성공, APK v2서명 확인, adb기기0대 |

APK SHA-256: `7c8035114841925e1666c359d848759d7a9f159639d96af6406fc27c1f8b3616`. Android Debug 서명은 내부 검증 전용이다.

## 운영 서버 실측

- Supabase `evhkpgxacpweelnmjmqh`, Firebase `ilgamcheck-auth-20260829`. 다른 프로젝트 데이터는 변경하지 않았다.
- FCM service account의 custom role은 `cloudmessaging.messages.create` 1개. JSON 키는 서버 secret 등록·digest 대조 후 임시 파일 삭제. 앱/Git/문서에는 비밀키 없음.
- Edge `native-revision-push` v3 ACTIVE. anonymous401 / invalid401 / GET405 / signed200 / replay409. 정상 응답은 `sent=0,retrying=0,discarded=0`이다. FCM 실제 기기 전달 실적이 아니다.
- pg_net 실제 HTTP request1 → Edge200, timeout=false, 발송0. DB와Edge의 서명 프로토콜 및 네트워크 연결을 확인했다.
- cron `ilgam-native-revision-push`, 매1분, postgres 실행. 빈 큐에서는 외부 HTTP 호출 없이 null. 등록 기기0·attempts0을 확인한 뒤 서명 버전으로 활성화했다.
- dispatcher EXECUTE는 postgres만, nonce RPC는 postgres/service_role만, nonce table은 postgres만 허용한다. nonce 최소6분 보존·90초 유효 서명으로 재사용을 차단한다.

### pg_net 권한 확인에서 발견한 사항

`20261023113041_native_push_queue_acl`은 도구상 success였지만 실제 ACL은 바뀌지 않았다. 관리 객체 owner가 supabase_admin이라 postgres의 REVOKE가 효과 없는 플랫폼 제약이다. 실제 readback을 확인하여 성공으로 처리하지 않고, 장기 key를 큐에 넣지 않는 `20261023113840_native_push_signed_dispatch`로 보완했다.

키 대신 프로젝트·메서드·경로·고정 본문SHA256·timestamp·nonce를 서명한다. pg_net ACL 격리나 DB 로그인 역할의 큐조작/DoS까지 해결한 것은 아니다. 현재 기본 Data API에서 net schema를 공개한 사실은 없다.

## 독립 리뷰

최초 Important 계정 전환 경쟁 조건과 Minor Today 범위 소실을 수정했고 재검토했다. 최종 코드 및 HMAC 추가 검토에서 Critical/Important 코드 차단 요인 없음. 개인정보 FCM 처리 고지와 실기기 검증은 여전히 외부 베타 게이트다.

## 게시·운영 경계

1. 앱 callback1개 추가는 액션 시점 승인 대기. 기존 웹4주소와 Google설정은 유지.
2. 정책 finalized=false 유지. `docs/MOBILE-BETA-OPERATIONS.md`에 FCM·기기/웹캐시·삭제/보관 추가 초안과 실기기 검증표 작성. 임의 법률 승인·게시 확정 없음.
3. 전용 Google계정의 최신 실제 탈퇴·잘못된 계정·stale인증 거절 및 별도 환경 백업복구 증거는 미완료. G12~G15를 허위로 체크하지 않는다.
4. Android 실기기0대. iOS는 Mac/Xcode·Apple개발자계정·APNs 준비 필요. TestFlight/스토어 배포 없음.
5. Supabase Free 유휴정지 위험을 제거한 것으로 안내하지 않는다. 유료 전환/서비스 이전 없음.

## 실행 중 발생한 환경 변경

Supabase 표준 CLI 로그인으로 기본 계정이 일감체크 계정으로 변경됐다. 이전 인수인계의 전역 인증 교체 금지 지침과 다르게 실행된 사항이다. 다른 프로젝트 데이터 변경은 없지만 다른 프로젝트에서 CLI를 사용하기 전 계정/조직 확인이 필요하다.

## 배포 영수증

확인 시각: 2026-10-23 21:03 KST. 아래 제품 소스와 뒤이은 보고서 갱신 커밋은 구분한다.

| 구분 | 실제 결과 |
| --- | --- |
| 모바일·운영 PR | [#14](https://github.com/yw8837/saas-work_manager/pull/14), CI `39947902922` 성공 후 main 병합 |
| PR14 main merge SHA | `76af52ecf956be3ccde5b7a3fc5368c7ca6b0853` |
| 첫 배포 | Sites33, 제품소스 `34e3986f61d929c3c97ce53c2a9d9266e0a2a99a`, deployment `appgdep_6adb49bfb08881919eb66507c597e0c1`, succeeded |
| 추가 오류 수정 | [#15](https://github.com/yw8837/saas-work_manager/pull/15), CI `39949497164` 성공, main merge `9fe139f47345db2aa0092cf16cbbf61179a1ebb8` |
| 최종 제품 소스 | `4153f62d895a36a6583dabb2b9323eb3519432cc` |
| 최종 Sites 버전 | 34, `appgprj_6a8b16a27df88191b5cad3afd63a9366~appgver_35883096cbac8191aa02d5022938966d` |
| 최종 배포 | `appgdep_6adb4ccef24c81919b4dda6eee39b460`, succeeded, 2026-10-23T12:02:35.508707Z |
| 배포 범위 | 기존 public·환경 revision7·도메인 유지 |
| 배포 아카이브 | 124파일 / 6,389,760바이트, SHA256 `2786089d808c55fb718d8c5952427a7e2a8fc8d34d6b44ee6bce842363095d4b` |
| 소스 일치 | D 원본↔C 검증 복사본 472개 tracked 파일 SHA-256 일치. APK의109개 웹 자산과 검증 모바일 빌드 일치 |

### 운영에서 발견한 HEAD500 수정

v33 후 `HEAD /today`에서 HTTP500을 재현했다. Worker 로그의 `ReadableStream is disturbed`와 실제 스택을 따라가니, ASSETS가 소비한 빈 HEAD 요청 스트림을 SPA fallback에서 다시 복사하는 원인이었다. GET/HEAD fallback은 method·headers·redirect·signal만 전달하고 본문은 복사하지 않도록 수정했다. 빈 스트림 소비 회귀를 RED→GREEN으로 검증했고, 배포 smoke에 HEAD 상태·빈 본문·HTML·최종 경로 확인을 추가했다.

독립 리뷰의 HEAD 전용 redirect 검사 누락(Minor)도 `4153f62`에서 보완한 뒤 추가 지적 없음으로 재검토했다.

### 배포 후 실측

- `https://ilgam.studioyeolmae.com` 및 기존 `https://ilgamcheck-beta.bsfire1237.chatgpt.site`: 각각13/13 통과. `/`, `/today`, `/privacy`, `/terms`의 GET 및 HEAD200·빈 HEAD본문·경로 유지 확인.
- 네이티브 두 origin(`https://localhost`, `capacitor://localhost`)에 API preflight204·무인증401·public-config200/CORS 일치. 비허용 origin403. PowerShell 실제 HEAD200 포함8/8 통과. 계정 삭제 요청에는 인증을 넣지 않아 실제 삭제는 실행되지 않았다.
- 두 주소 모두 health `ready=true`, runtime `202608250011`, `serviceRoleContractCurrent=true`, 공개 설정 digest `sha256:855a25e6cb446ecc5af371438895836f6858fb4c072d6c1d6f17bd3ff48b737a` 일치.
- 정책은 두 주소·DB 모두 `finalized=false`이고 버전/digest가 일치한다. 서버가 준비됐다는 응답을 정책 승인으로 해석하지 않는다.
- 배포 후 오류 로그 조회에서 검출된3건은 위 검사의 의도된401·403이며 Worker outcome은 모두ok. 조회 범위에서 새500 예외는 검출되지 않았다. 장기간 무장애 보증이 아니다.
- 실제 브라우저의 Google 로그인 화면 표시와 수집된 console error0을 확인했다. 이번 회차의 실제 Google 로그인 완료·사용자 데이터 저장 확인을 의미하지 않는다.
- `runtime:readback` CLI는 검증 복사본에 Supabase link가 없어 BLOCKED였다. 공개 health 비교는 별도 검사이며 전체 external-beta gate 통과로 대체하지 않는다.

PR #1은 병합하지 않았다. 기존 고객 데이터·요금제·정책 승인 상태·다른 앱은 변경하지 않았다.
