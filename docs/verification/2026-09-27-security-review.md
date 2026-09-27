# 2026-09-27 보안 재점검 및 요청 본문 제한 보완

## 범위와 결론

- 기준 소스: main `7c58cde` / 제품 배포 v28 `4f1d4cc`.
- 대상: Sites·Next 계정 삭제 API, Google 재인증, 공개 설정 노출, 보안 헤더, 서비스워커 캐시, Supabase RLS/함수 실행 권한, 고객 수정 요청 RPC, 의존성.
- 운영 데이터 생성·삭제, 실제 계정 탈퇴, 고부하 공격, DB 스키마 변경은 수행하지 않았다.
- 이번 범위에서 재현한 신규 문제는 **요청 본문 크기 제한을 수신 완료 후 적용하는 자원 소모 위험 1건(중간)**이다. 두 서버 경로에 동일한 수정과 회귀 검사를 적용했다. 인증 우회나 다른 사용자 데이터 유출을 입증한 것은 아니다.
- 알려진 의존성 취약점 0건은 `npm audit`의 현재 데이터 기준이다. 모든 취약점이나 제로데이 부재를 보장하지 않는다.

## SEC-20260927-01 — 본문 제한 전에 전체 요청을 메모리에 읽음 [중간, 수정]

### 원인 및 영향

기존 `src/sites/account-delete.ts`와 `src/app/api/account/delete/route.ts`는 `request.text()`가 끝난 뒤 UTF-8 바이트 수를 비교했다. Content-Length가 없거나 작게 표시된 스트림은 1KB를 초과해도 끝까지 읽었고, 전송이 끝나지 않으면 응답도 끝나지 않았다.

외부 HTTP 클라이언트는 Origin·Sec-Fetch-Site·확인 헤더와 임의 형식의 Bearer 문자열을 구성할 수 있으므로 이 경계는 실제 사용자 인증 전에 적용되어야 한다. 로그인 우회는 아니지만, 큰 요청의 메모리·연결 점유를 애플리케이션 자체에서 제한하지 못했다. 호스팅 제공자의 상위 업로드 제한은 별도이며 운영에서 자원 고갈 공격을 실행하지 않았다.

### 수정

- `src/lib/security/account-delete-body.ts`: 고정 1,024바이트 버퍼로 읽고, 초과 청크를 복사하기 전에 413 반환 및 스트림 취소.
- 최초 읽기 시작 후 총 5초 제한. 취소가 끝나지 않는 공급자도 기다리지 않고 408 반환.
- 완성된 바이트를 엄격한 UTF-8로 해석. 손상된 바이트는 400으로 거절.
- Sites와 Next가 같은 함수를 사용하며 기존 Origin·확인 문구·서버 토큰 검증·최근 OAuth·검증된 계정만 삭제하는 절차는 유지.

### 재현 및 회귀 근거

`src/lib/security/account-delete-body.test.ts`의 10개 검사 중 수정 전 8개 실패, 수정 후 10개 통과. 길이 헤더 없음/거짓 값, 1,025바이트에서 중단, 멈춘 스트림, 끝나지 않는 취소, 정확히 1,024바이트, 청크 경계에 걸린 한글, 잘못된 UTF-8을 검사했다. 외부 인증·삭제를 호출하지 않는 테스트 환경이다.

독립 리뷰: Critical/Important 0건, 병합 가능. 관련 28개 테스트를 별도로 재실행했다. 실제 Node 스트림에 750ms마다 청크를 전달한 별도 검사도 약 5,013ms에 408·취소·잠금 해제를 확인했다. 이 slow-drip 사례의 고정 회귀 테스트와 Sites 외부 호출 spy 보강은 경미한 후속 권고로 남긴다.

## 운영 읽기 전용 점검

- 공개 테이블 31개 모두 RLS 활성화. 이것만으로 모든 정책의 완전성을 주장하지 않는다.
- `supabase/tests/rpc_execution_surface.sql`: 운영 권한 계약 23개 모두 true.
- 익명 `save_workspace_document`: HTTP 401 / PostgreSQL 42501.
- 존재하지 않는 합성 고객 토큰 조회: HTTP 200, 빈 결과. 실제 고객 토큰을 출력하지 않았다.
- 외부 Origin의 계정 삭제 요청: HTTP 403, 실제 삭제 없음.
- `/api/health`: HTTP 200, ready=true, DB 계약 `202608250011`, 정책 finalized=false.
- 고객 요청 함수는 토큰 형식·해시 조회·현재 문서 토큰 일치·활성 상태를 검사하며 3초/시간당20/일100 제출 제한을 유지한다. 문서→포털 잠금 순서와 삭제 정리 트리거도 유지한다. 실제 병렬 부하 시험은 하지 않았다.
- 서비스워커는 문서/API/인증/고객 데이터를 캐시하지 않고 허용된 정적 파일만 캐시한다.
- 공개 설정은 명시한 공개 키 목록만 직렬화하며 서비스 역할 키는 제외한다. HTML 주입 시 `<`를 이스케이프한다.

## 자동 경고의 판단과 남은 경계

- RLS 정책 없는 내부 테이블 3개: invite_attempts, invite_codes, workspace_save_requests. 거부가 기본인 내부 저장소이므로 경고를 없애려고 공개 정책을 추가하지 않았다. [Supabase 설명](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- 공개 SECURITY DEFINER 3개 / 인증 사용자용 18개: 의도된 고객 토큰·소유자 RPC와 일치. 실제 ACL 검사를 병행했으며 경고가 있다는 이유로 고객 링크를 막지 않았다. [공개 함수 경고](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
- 유출 비밀번호 보호 비활성 / MFA 옵션 부족 경고가 남아 있다. 현재 Google-only 정책이므로 비밀번호 로그인을 켜거나 로그인 방식을 임의 변경하지 않았다. 별도 서비스 MFA를 적용하려면 사용자 흐름을 설계해야 한다. [비밀번호 보호](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [MFA](https://supabase.com/docs/guides/auth/auth-mfa)
- 기존 CSP의 script-src unsafe-inline은 남아 있다. 실제 XSS 경로는 이번 검사에서 재현하지 못했지만, nonce/hash 기반 전환은 별도 방어 강화 과제다. 정적 문서·런타임 주입을 함께 바꿔야 하므로 문자열만 제거해 서비스를 깨뜨리지 않았다.
- 약관/개인정보 정책 finalized=false, 실제 계정 탈퇴 및 백업 복원 운영 증거는 이번 점검으로 충족되지 않는다. 유료 결제 기능은 준비 중이다.
- 인프라 전체 DoS 방어, Google 계정 자체의 보안, Supabase 공급자 내부, 전 코드 경로에 대한 완전한 침투 검사는 범위 밖이다.

## 검증·배포 영수증

- 새 경계 테스트 10/10, 기존 계정 삭제 포함 28/28 PASS.
- 전체 단위 테스트 94파일 / 531개 PASS. 기존 Node localstorage 경고가 있으며 일부 순차 실행에서는 기존 React act 경고도 발생한다. 실패를 숨기거나 경고 없는 실행으로 표현하지 않는다.
- lint / typecheck PASS.
- 전체 출시 게이트와 운영 반영 결과는 완료 후 인수인계 영수증에 기록한다.
