# 2026-08-29 Google OAuth 베타 배포 검증

검증 대상 코드: `158691e` (`test: support hosted verification with google-only auth`)

운영 주소: `https://ilgamcheck-beta.bsfire1237.chatgpt.site`

## 실제 사용자 흐름

- Google OAuth 앱을 외부 사용자용 `프로덕션 단계`로 게시했다.
- 운영 사이트의 `Google로 계속하기`에서 Google 동의 화면과 Supabase callback을 거쳐 `/today`로 복귀했다.
- 필수 약관·개인정보처리방침 동의 뒤 베타 코드 입력 화면이 열렸다.
- 운영 코드 적용 뒤 설정 화면에서 `Pro`, `30일 남음`, 만료일을 확인했다.
- Google 비밀번호는 일감체크에 전달하거나 저장하지 않았다.

## 자동 검증

- `npm test`: 90개 파일, 495개 테스트 통과.
- `npm run lint`: 통과.
- `npm run typecheck`: 통과.
- `npm run build`: Next.js 운영 빌드 통과.
- `npm run build:sites`: Sites 클라이언트·worker 빌드 통과.
- `npm run build:mobile && npm run mobile:verify`: Android/iOS 셸과 모바일 번들 검증 통과.
- `npm audit --omit=dev --json`: 운영 의존성 취약점 0건.
- `npm run smoke:sites -- https://ilgamcheck-beta.bsfire1237.chatgpt.site`: health, public config, 주요 경로, manifest, service worker, favicon 통과.

## 운영 Supabase 계약

`node scripts/verify-hosted-runtime-ephemeral.mjs`를 운영 프로젝트에 실행해 아래를 확인했다.

- Google-only 설정에서 admin magic-link token으로 만든 임시 A/B 세션 로그인.
- 계정당 1회, 30일 Pro 베타 코드 적용과 두 번째 코드 거부.
- DB runtime contract `202608250011` 일치.
- A/B 작업공간 RLS 격리와 authenticated 직접 DML 거부.
- 공개 수정 링크 summary, idempotency 1건, Realtime UPDATE.
- token rotation 뒤 이전 링크 조회·접수 거부와 새 링크 성공.
- 임시 `VERIFYA/VERIFYB` 코드와 임시 A/B 사용자 삭제 결과를 확인하고, 정리 실패 시 전체 검증을 실패시키는 fail-closed 처리.

실행 결과 마지막 줄: `HOSTED_VERIFY PASS`

## 보안 한계

이 검증은 검사 시점에 재현 가능한 결함과 공개 취약점 데이터베이스를 확인한 것이다. 알려지지 않은 제로데이가 없다고 보증하지 않는다. 결제는 아직 열지 않았으며, 약관·개인정보처리방침의 법률적 최종 검토는 유료 출시 전에 별도로 진행한다.
