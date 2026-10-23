# 모바일 베타 운영 검증 — 2026-10-23

## 판정

코드·웹/API 배포 준비와 실제 외부 모바일 이용 승인은 다르다. 본 기록에서 확인한 자동 검사·서버 응답은 통과했다. 실제 Android 설치·OAuth 복귀·웹↔앱 저장·잠금화면 알림과 iOS 서명 빌드는 별도 증거가 필요하다. 외부 모집이나 APK 배포는 수행하지 않았다.

## 수정과 검증

| 항목 | 증거 |
| --- | --- |
| 계정 전환 경쟁 조건 | owner 검증·채널 종료 대기·잘못된 재인증 계정의 3개 RED 회귀를 수정. 이벤트 즉시 owner/화면 차단, 비동기 generation 검사 |
| Today 범위 | 일감 필터를 URL에 유지. 화면 재마운트 회귀 RED→GREEN |
| 의존성 | Next16.4.2/Vite8.3.5/Vitest4.1.12. 운영 audit 0. 개발 전용 braces 경로 high5는 공급자 미패치로 별도 잔존 |
| 자동 release | 116파일719검사, typecheck/lint, 운영 audit, local/hosted 빌드 통과 |
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

GitHub CI 및 Sites 배포 후 이 절에 실제 commit/version/deployment와 공개 응답을 추가한다. 저장만 된 파일·열린 PR을 운영 반영으로 표시하지 않는다.
