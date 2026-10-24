# 2026-10-24 앱 복귀 주소·외부 베타 운영 점검

## 판정

**앱 복귀 주소 등록과 비기기 웹/API 검증은 완료. 외부 베타 공개 승인은 보류.**
실기기 외 남은 조건은 개인정보 안내 검토·확정, 전용 Google 계정 탈퇴 실증, 별도 환경 백업·복구 실증이다. 자동 검사나 설정 화면을 이 증거로 대신하지 않는다.

## 원격 변경

- 대상: Supabase `evhkpgxacpweelnmjmqh`, 사용자 등록 승인 후 실행.
- Site URL 유지: `https://ilgam.studioyeolmae.com`.
- Redirect URLs: 새/이전 사이트 `/today`·`/settings` 4개 + `com.yeolmaestudio.ilgamcheck://auth/callback` 1개.
- 새로고침 후 총 5개를 재조회하고 화면 보관. 입력 중 잘못 생성한 문자열은 제거하고 정확한 주소만 다시 저장했다. 기존 4개는 보존.
- 고객 데이터·요금제·Analytics·다른 프로젝트·정책 승인 상태 변경 없음. 표준 CLI 로그인 재실행 없음.

## 최신 점검 결과

| 검사 | 결과 |
| --- | --- |
| Supabase 프로젝트 | ACTIVE_HEALTHY, ap-northeast-2 |
| Google/Email/Phone 로그인 | true / false / false (공개 Auth settings 재조회) |
| 새 주소 smoke | 13/13 PASS |
| 이전 주소 smoke | 13/13 PASS |
| native API | 8/8 PASS: Android·iOS Origin 허용, 비인증401, 외부 Origin403, HEADtoday200 |
| health | ready=true, runtime `202608250011`, serviceRoleContractCurrent=true |
| 정책 | finalized=false, DB와 digest/버전 일치 |
| 푸시 | Edge native-revision-push v3 ACTIVE, 매분 cron 1개 활성 |
| cron 최근 1시간 | 60 succeeded (조회 시점 집계) |
| 실제 기기/attempts/outbox | 각각 0개. 푸시 도달 실적으로 계산하지 않음 |
| 모바일·workspace 테이블 | 조회한 9개 RLS 활성 |
| 수정 전 baseline | Windows 단위 116파일 / 720 PASS |
| 복구 도구 focused | 2파일 / 11 PASS, RED→GREEN 확인 |
| 수정 후 전체 | Windows 단위 117파일 / 727 PASS |
| 린트·타입·prod audit | PASS / PASS / 취약점 0 |
| 실제 restore dry | 필요한 환경/ACK 부재로 BLOCKED_EXTERNAL, exit1. 실제 복원은 실행하지 않음 |
| APK SHA256 | `7c8035114841925e1666c359d848759d7a9f159639d96af6406fc27c1f8b3616` 일치 |
| 모바일 build/verify | 임시 폴더 빌드 산출물 부재로 첫 검사 중단 → build:mobile 재생성 → source/asset 검사 PASS. APK 재제작·설치는 아님 |
| 모바일 SQL 회귀 | 임시 PGlite에서 삭제 회귀·23 RPC 권한 검사 PASS. 운영 데이터 변경 없음 |

테스트 출력에는 기존 React act, Capacitor 중복 등록, Node localstorage 경고가 있었다. 실패는 아니며 무경고라고 표현하지 않는다. 이번 변경은 운영 검증 스크립트·문서이며 웹/앱 UI와 API 구현 변경이 아니다. 기존 Sites34 배포와 APK를 불필요하게 교체하지 않는다.

## 복구 도구 수정

기존 `supabase-restore-verify.mjs`는 Google 세션을 상위 단계에서 받아도 child allowlist에서 버렸고 Vercel용 smoke를 고정 호출했다.

- 기본 Sites smoke로 분기; 명시적 `vercel`은 이전 경로 유지.
- Google A/B access+refresh 쌍이 Sites에서 필수. 비밀번호 fallback을 사전 차단.
- public smoke에는 계정 토큰을 주지 않고 Hosted 검사에만 전달. service_role·Management PAT는 두 child 모두 제외.
- smoke 실패 시 전용 데이터 쓰기 검사를 실행하지 않음.
- 별도 production/recovery ref 일치·분리, 사용자 ACK, runtime ref/digest 확인은 그대로 유지.
- `.env.hosted.example`에 Google 세션 경로와 전용 계정만 사용할 것을 명시.

## 보안 경고와 인프라 경계

Supabase advisor에서 ERROR 수준 항목은 반환되지 않았다. WARN/INFO는 남아 있다: RLS/no-policy 6개, 익명 SECURITY DEFINER 3개, 로그인 사용자 SECURITY DEFINER 18개, leaked-password protection·MFA 안내 각1개. 공개 수정 요청 RPC와 소유자 작업 RPC는 의도된 호출면이므로 단순 경고 제거를 위해 권한을 폐쇄하지 않았다. 이번 조회는 모든 권한 상승 가능성을 새로 완전 검증한 결과가 아니다. 실제 Google A/B 격리 실증을 별도 남긴다.

공식 상태 페이지에는 Management API 오류율 증가 사건이 Monitoring으로 표시됐다. 일감체크의 직접 web/API·DB 조회는 위 검사 범위에서 정상이다. 전체 공급자 무장애를 주장하지 않는다. [Supabase 상태](https://status.supabase.com/)

## 공개 전 남은 입력

`docs/BETA-REMAINING-OPERATIONS.md` 참조. 정책·법률 검토 승인, 전용 Google 테스트 계정/삭제 대상, 별도 recovery 환경, 암호화 백업 위치가 필요하다. `pg_dump`/`psql`은 PATH에 없고 Docker Linux 엔진 연결도 실패했다. 유료 전환·새 계정 생성·고객 데이터 export/delete는 진행하지 않았다.

Supabase Free의 유휴 정지 위험은 여전히 남는다. iOS는 Apple Developer·Mac/Xcode·APNs가 필요하다. 이번 사용자 요청에서 실기기 검증은 제외했으므로 체크표를 채우지 않았다.

## 증빙 위치

- `D:/SaaS/01_일감체크/release-artifacts/2026-10-24-beta-operations/앱로그인-복귀주소-등록.png`
- `docs/BETA-REMAINING-OPERATIONS.md`
- 기존 APK: `D:/SaaS/01_일감체크/release-artifacts/2026-10-23-mobile-beta/일감체크-내부검증.apk`

독립 코드 리뷰에서 Critical/Important/Minor 수정 요구 0건. 운영 문서 리뷰의 WebView 캐시 구분 및 legacy SMTP 주석 보완 2건도 반영 후 재검토 지적 0건. Google 세션 및 데이터가 실제로 준비된 복구 성공을 의미하지 않는다.

## 최종 GitHub 영수증

- PR [#16](https://github.com/yw8837/saas-work_manager/pull/16) MERGED, 2026-10-24 02:13:26 KST.
- 검사 대상 head: `7d829c47d9d6b85f326eede637ce9728970262de`.
- [최종 CI 39992330093](https://github.com/yw8837/saas-work_manager/actions/runs/39992330093) SUCCESS. Linux 117파일, 726 PASS + Windows 전용1 skip = 총727, E2E58 PASS, lint/typecheck/prod audit0/local·hosted build PASS, PGlite23권한 검사 및 Deno3개 PASS.
- main 병합 커밋: `89543f8e53671406c58e3eb55cd701c6f256da39`. 분리 폴더도 이 커밋으로 fast-forward한 뒤 이 결과 문서를 기록했다. PR1은 병합하지 않았다.
- GitHub 전체 검사 로그는 산출물 폴더의 `GitHub-최종검사.log`에 보관했다. Actions 런타임/Ubuntu 이미지 전환 안내 경고는 남아 있으며 CI 실패가 아니다.
- 제품 소스 변경이 없어 Sites34·기존 내부 APK 유지. 이번 기록 갱신은 운영 사이트를 새 버전으로 배포한 것이 아니다.
- 브라우저 callback 증빙은 이번 운영 설정 변경의 결과이고, CI는 로컬 도구·회귀 검증의 증거다. 둘 다 실제 폰 OAuth·알림 수신이나 실제 복구 실증을 대신하지 않는다.
