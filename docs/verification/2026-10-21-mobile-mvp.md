# 모바일 연동 MVP 검증 기록

기준일: 2026-10-21 KST. 소스: `codex/mobile-linked-mvp`, 기준 main `cafa8b8f383ace78d502b5efe486ceb6f1313f86`.

## 현재 판정

공통 기능·보안 저장·푸시 서버 코드와 Android 테스트 APK를 만들었다. 아래 자동 검사와 Android 빌드는 통과했다. 운영 연결, 실제 휴대폰 OAuth·백그라운드 알림, iPhone 서명 빌드는 별도 게이트다. 이 문서의 통과는 스토어 출시 또는 실기기 사용 완료를 뜻하지 않는다.

사용자는 검사 통과 후 운영 테이블·앱 복귀 주소·FCM 발송 전용 자격 증명·예약 호출·PR 병합·웹 API 배포를 승인했다. 기존 고객 데이터 삭제, 유료 전환, 아가톡 변경과 테스터 연락은 승인 범위 밖이다.

## 자동 검사와 산출물

| 검사 | 결과 및 범위 |
| --- | --- |
| Vitest | 115개 파일, 708개 검사 통과 |
| TypeScript / ESLint | 통과, 오류·경고 0 |
| 브라우저 E2E | 데스크톱·모바일 4개 분리 묶음, 총 56개 통과 |
| Next / Sites | 두 빌드와 Sites 출력 구조 검사 통과 |
| 운영 의존성 | `npm audit --omit=dev` 0건 |
| SQL | PGlite에서 전체 migration, native push, 일감 삭제 회귀, 기존 RPC 권한 23개 통과 |
| Edge Function | Deno 타입 검사와 delivery 검사 1개 통과 |
| 모바일 번들 | Android·iOS Capacitor sync, 소스·번들 계약 검사 통과 |
| Android | `assembleDebug` 성공, 186 tasks. 서명 검증 및 APK package/minSDK/targetSDK 확인 |

Android APK: `com.yeolmaestudio.ilgamcheck`, versionCode 1 / versionName 1.0, minSDK 24 / targetSDK 36, Android Debug 서명.

최종 빌드 SHA-256: `cfc63395e84069cb3a0c2c81b2b91908ed435062d87a021b0c1f7a703cfbd0be`.

검증 로그는 C: 임시 검증 작업폴더의 `full-suite-final.log`, `e2e-final.log`, `mobile-sync-final.log`, `android-build-final-quoted.log`에 있다. D: 원본과 검사 복사본은 동기화 스크립트가 해시로 대조한다.

개발 의존성의 기존 ESLint → fast-glob → micromatch → braces 경로 high 5건은 운영 번들 검사와 구분한다. 강제 프레임워크 다운그레이드는 하지 않았다.

## 독립 리뷰와 수정

독립 리뷰 대상은 첫 구현 커밋 `704257c`다. 당시 Important 4건·Minor 2건을 확인했고, 메인이 각각 재현·수정·회귀 검사를 했다. 독립 리뷰어가 수정 후 최종 커밋을 다시 승인했다고 표현하지 않는다.

| 발견 사항 | 조치와 확인 |
| --- | --- |
| 재인증 중 다른 계정 세션이 SDK에 저장된 뒤 프로세스 종료 시 잘못된 계정으로 재시작 가능 | 기대 owner를 OS 보안 저장소에 먼저 기록. 세션 활성화·푸시·데이터 로드 전에 검증. sign-out 실패 시 guard 유지. 종료·잘못된 계정·실패 회귀 통과 |
| 이전 FCM 토큰의 실패 ACK가 교체된 새 토큰까지 비활성화 | ACK에 claim 토큰 포함. device→attempt 잠금 순서 유지, 현재 토큰과 다르면 재대기. SQL 회전·현재 invalid·이전 lease 회귀 통과 |
| 앱에서 복사한 고객 요청 링크가 localhost 사용 | 네이티브는 운영 origin 사용. 웹 origin 동작 유지. Android/iOS 회귀 통과 |
| 오프라인 재실행 시 마지막 일감 조회 불가 | 동일 계정의 암호화된 서버 확인 스냅샷 최대 30건을 읽기 전용 제공. 계정 불일치·초안·쓰기 기능 차단 회귀 통과 |
| 삭제되었거나 조회할 수 없는 알림 대상의 안내 없음 | 일감 목록으로 복귀하고 삭제/권한과 통신 오류를 구분해 안내 |
| 알림의 수정 기록 위치 이동이 유효하지 않음 | 실제 `revisions` 대상과 렌더 후 위치 이동 추가, 회귀 통과 |

리뷰 발견 사항 중 미뤄 둔 항목은 없다. 아래 외부 검증 조건은 코드 리뷰로 확인할 수 없는 별도 게이트다.

## 실행 결정과 검증 한계

- D: 느린 I/O로 C: 임시 분리 복사본에서 검사했다. 원본 사용자의 dirty checkout, index.lock, 기존 의존성은 보존했다. 비용은 임시 C: 저장 공간이며 최종 산출물 보존 후 해당 작업의 임시 폴더만 정리한다.
- Docker Linux engine이 실행되지 않고 메모리가 부족하여 SQL은 PGlite로 검사했다. 이는 Supabase Auth/API 통합과 다중 프로세스 잠금 검사를 대체하지 않는다.
- Deno npm 연결이 검사 복사본 의존성을 바꾼 뒤 `npm ci`로 복구하고 전체 검사를 다시 했다. 이후 Deno 전용 config는 `nodeModulesDir: none`을 사용한다.
- Android 한글 경로 사전 검사는 이 빌드 명령의 인용된 `'-Pandroid.overridePathCheck=true'`로만 해제했다. OS 암호화·TLS·인증서 검사는 완화하지 않았다.
- Windows `cap sync`의 Swift 패키지 경로 역슬래시를 동기화 후 정규화한다. Swift/Xcode 컴파일 통과로 간주하지 않는다.
- 서버 FCM 응답의 성공은 메시지 접수이며 휴대폰 표시 보장이 아니다. 현재 알림 범위는 고객 링크의 새 수정 요청이다.
- `adb devices`에 연결 기기 0대. Android 설치·실제 Google 복귀·앱 종료/잠금화면 푸시·웹↔앱 저장은 실기기 검증이 필요하다.
- Apple Developer 계정·Mac/Xcode가 없다. iOS 소스·Firebase 앱 등록까지이며 컴파일·서명·APNs 키·TestFlight는 완료가 아니다. Apple 로그인도 아직 제공하지 않는다.

## 운영 연결 기록

- Firebase `ilgamcheck-auth-20260829`: 기존 일감체크 프로젝트에 무료 Spark 추가, Analytics 해제, Android/iOS 앱 등록. client config는 gitignore 경로만 사용한다.
- 운영 Supabase `evhkpgxacpweelnmjmqh`: 2026-10-21 01시대 최초 관리 조회 시간 초과와 health 503 한 차례 관찰. 설정 변경 없이 재조회 시 health 200/ready=true, SQL·migration 목록 정상으로 복구. 원인은 확정하지 않았으며 상시 안정성 증거로 확대하지 않는다.
- 적용 전 advisor의 기존 알림: RPC SECURITY DEFINER 호출, RLS 정책 없는 서버 전용 테이블, 비밀번호 유출 방지 및 MFA. 고객 bearer RPC와 owner RPC의 의도된 권한은 기존 23개 권한 회귀로 분리 점검했다. 신규 native 테이블 적용 후 다시 비교할 것.
- 운영 DB·Auth callback·서버 비밀키·예약 호출·Edge Function·웹 배포: 아직 적용 전. 개별 적용 후 실제 응답과 ID를 이 절에 기록한다.

기존 advisor 참고: [RLS 정책](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [공개 SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [인증된 사용자 SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [비밀번호 보안](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [MFA](https://supabase.com/docs/guides/auth/auth-mfa).
