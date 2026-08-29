# 일감체크 배포·검증 절차

현재 운영 경계는 **Sites + Supabase + Google OAuth**다. 이메일·비밀번호 가입, 초대 메일, 비밀번호 재설정, Vercel 배포는 사용하지 않는다.

## 1. 로컬 검증

```powershell
npm ci
npm test
npm run lint
npm run typecheck
npm run build
npm run build:sites
npm run mobile:verify
npm audit --omit=dev
```

실패한 항목이 하나라도 있으면 배포하지 않는다.

## 2. Supabase 데이터베이스

연결 대상은 Seoul 리전의 정확한 프로젝트여야 한다. migration 파일은 이미 적용된 파일을 수정하지 않고 새 timestamp 파일만 추가한다.

```powershell
npm run supabase:push:dry
$env:ILGAMCHECK_DB_PUSH_ACK="APPLY_MIGRATIONS_TO_<PROJECT_REF>"
npm run supabase:push
Remove-Item Env:ILGAMCHECK_DB_PUSH_ACK
```

원격 목록이 로컬과 같고 최신 migration이 `202608260012`인지 확인한다.

## 3. Google OAuth

Google Cloud 웹 애플리케이션 클라이언트에 다음 값을 사용한다.

- Authorized JavaScript origin: 실제 Sites origin
- Authorized redirect URI: `https://<PROJECT_REF>.supabase.co/auth/v1/callback`
- 사용자 유형: 외부

Supabase Authentication provider는 Google만 켜고 이메일·비밀번호 provider는 끈다. OAuth client secret은 Google Cloud와 Supabase secret 저장소에만 두고 Git, 로그, 브라우저 환경변수에 넣지 않는다.

Auth URL 계약은 다음과 같다.

- Site URL: 실제 Sites origin
- Redirect allow list: `<origin>/today`, `<origin>/settings` 정확히 두 개
- `/today`: 일반 로그인 복귀
- `/settings`: 계정 삭제 직전 Google 재인증 복귀

`/settings` 재인증은 원래 로그인한 계정 ID를 세션에 묶는다. 다른 Google 계정을 고르면 즉시 로컬 로그아웃하고 삭제를 중단한다.

## 4. Sites 환경변수

공개값:

- `NEXT_PUBLIC_STORAGE_MODE=hosted`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_OPERATOR_NAME`
- `NEXT_PUBLIC_SUPPORT_EMAIL`
- `NEXT_PUBLIC_BETA_SIGNUP_ENABLED=true`
- `NEXT_PUBLIC_FEEDBACK_FORM_URL`

서버 비밀값:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

서비스 역할 키는 Sites secret으로만 저장한다. 브라우저 번들, `.env` 예시, Git, 명령 인수에 넣지 않는다.

## 5. 배포 후 실증

1. `/api/health`가 200이고 `ready: true`인지 확인한다.
2. Google 계정 A로 로그인해 패키지·일감·Todo·수정 링크를 만든다.
3. 시크릿 창에서 고객 수정 링크를 열어 요청을 접수한다.
4. 계정 A 화면에 요청이 반영되는지 확인한다.
5. Google 계정 B로 로그인해 A의 작업공간이 보이지 않는지 확인한다.
6. 링크를 끄고 재발급해 이전 링크가 거절되는지 확인한다.
7. 완료 일감의 수정 링크가 잠기는지 확인한다.
8. 설정에서 Google 재인증 후 본인 계정만 삭제되는지 확인한다. 테스트 전용 계정으로 수행한다.
9. `/r/<token>` 응답에 `X-Robots-Tag: noindex, nofollow, noarchive`가 있는지 확인한다.
10. CSP, HSTS, `nosniff`, `DENY`, `no-referrer` 헤더를 확인한다.

## 6. 운영 안전장치

- 공개 수정 링크는 bearer 권한이다. 검색 가능한 문서나 공개 채널에 올리지 않는다.
- 결제는 아직 구현되지 않았다. 베타에서 자동 결제나 유료 플랜 부여를 약속하지 않는다.
- 서버 오류·비정상 로그인·수정 요청 rate limit을 모니터링한다.
- 백업은 저장소 밖 암호화 경로에 두고 복원 훈련 결과를 기록한다.
- 보안 검사는 알려진 위험을 줄이는 절차이지 알려지지 않은 취약점이 0개라는 보증이 아니다.

## 7. 롤백

배포 후 핵심 흐름이 실패하면 새 사용자 모집을 중단하고 직전 정상 Sites 버전으로 되돌린다. DB migration은 파일 삭제나 강제 되돌리기를 하지 않고, 필요한 보정은 새 migration으로 작성한다. 서비스 역할 키나 OAuth secret 노출이 의심되면 즉시 회전한 뒤 새 버전을 배포한다.
