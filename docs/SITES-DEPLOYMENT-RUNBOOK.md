# Sites 배포 전환 기록

## 현재 결론

일감체크는 Supabase Auth·Postgres를 데이터 계층으로 유지하고, Sites에는 Vite 클라이언트 번들과 Worker를 배포한다. 정적 화면만 배포하지 않는다. Worker는 SPA 경로 fallback, `/api/health`, 계정 삭제 API를 맡고, 고객 수정 링크와 작업공간 데이터는 브라우저 Supabase 클라이언트가 RLS를 거쳐 처리한다.

`npm run build:sites`는 `dist/`의 정적 자산과 `dist/server/index.js` Worker를 함께 생성한다. 브라우저에 들어가는 값은 `NEXT_PUBLIC_*`만 빌드 시 주입하며, 서비스 역할 키는 Sites의 비밀 환경변수로만 Worker에 전달한다.

## 재개 기준

`@openai/sites-vite-plugin` 기반 런타임으로 이전을 완료했다. 다음 재개 기준은 환경값과 실제 배포 URL 검증이다.

## 배포가 가능해진 뒤 순서

1. Sites 프로젝트를 한 번만 만들고 `.openai/hosting.json`에는 project ID만 기록한다.
2. Supabase URL, publishable browser key, secret server key와 운영자 정보를 Sites 환경변수로 설정한다. 비밀값은 Git에 넣지 않는다.
3. 검증할 버전을 저장하고 배포한다.
4. 배포 URL에서 `/api/health`, Google 로그인, A/B RLS, 고객 수정 링크와 계정 삭제 재인증을 검사한다.
5. Supabase Auth의 Site URL을 최종 origin으로 두고 허용 redirect는 정확한 `/today`와 `/settings` 두 개만 둔다.
6. 다시 원격 검증을 통과한 뒤 외부 베타 초대를 시작한다.

PortOne 결제와 실제 요금제 부여는 이 단계 뒤에도 별도 구현·검증 항목이다.
