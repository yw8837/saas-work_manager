# 일감체크 Sites 런타임 전환 설계

## 목적과 현재 상태

일감체크는 Supabase Auth, RLS가 적용된 작업공간 데이터, 고객 수정 링크와 계정 삭제 서버 API를 가진 동적 SaaS다. 정적 랜딩으로 축소하지 않고 Sites에 배포 가능한 Worker 형식으로 전환한다.

현재 Next/OpenNext 산출물은 `.open-next/worker.js`이며, Sites 패키지는 `dist/server/index.js`를 요구한다. OpenNext 파일을 이름만 바꿔 넣는 방식은 지원 계약이 아니며, 인증과 API를 검증할 수 없으므로 사용하지 않는다.

2026-08-23에 서울 리전의 전용 Supabase 프로젝트 `ilgamcheck`을 만들고 초기 migration 8개를 적용했다. 읽기 전용 집계 결과 Auth 사용자, 작업공간 문서, 작업, 수정 요청은 모두 0건이다.

## 결정

Sites가 지원하는 Vite Worker 산출물로 앱 런타임을 이식한다. Supabase는 유지하고, Cloudflare D1/R2나 Sites 자체 데이터베이스는 추가하지 않는다.

### 데이터와 인증 경계

- Supabase PostgreSQL: 작업공간, 작업, 패키지, 수정 요청, 플랜·구독 데이터.
- Supabase Auth: 외부 베타 사용자의 이메일 로그인과 사용자 UUID.
- 브라우저: Supabase URL과 anon/publishable key만 사용한다. RLS는 계속 최종 권한 경계다.
- Sites Worker: `/api/health`, 계정 삭제처럼 서버 권한이 필요한 API만 제공한다.
- Sites 비공개 환경변수: `SUPABASE_SERVICE_ROLE_KEY`와 운영자 설정. 브라우저 번들·Git·문서에 넣지 않는다.
- 도메인 전환: Sites URL이 확정된 뒤 Supabase Auth의 Site URL 및 `/auth/reset` 허용 주소를 바꾼다. 기존 레코드·UUID·수정 요청 링크는 이동하거나 변환하지 않는다.

## 구현 방식

### 1. 지원 런타임 검증

`@openai/sites-vite-plugin`을 사용하는 Vite Worker 출력을 만든다. 시작 전에 작은 헬스 엔드포인트와 정적 랜딩이 `dist/server/index.js`에서 구동되는지 확인한다. 이 단계가 통과하지 않으면 기존 Next 코드를 무리하게 감싸지 않고 중단한다.

### 2. 브라우저 앱 이식

현재 React 화면과 Supabase 브라우저 클라이언트를 재사용하되 Next 전용 routing, metadata, API route 의존성을 Vite 호환 경계로 바꾼다. 공개 랜딩과 로그인 이후 작업공간을 각각 유지한다. URL 구조와 고객 수정 링크는 호환성을 유지한다.

### 3. 서버 API 이식

`/api/health`는 현재의 runtime/policy/service-role contract를 계속 확인한다. `/api/account/delete`는 토큰 검증·동일 출처 확인·최근 비밀번호 인증·service-role 삭제 순서를 보존한다. Worker는 원격 Supabase HTTP API만 호출하며 raw TCP DB 연결을 만들지 않는다.

### 4. 환경변수와 배포

새 Supabase 프로젝트의 public URL, anon key, service-role key는 Sites 환경변수로 구분한다. 로컬은 `.env.local`로만 사용하고 Git에 추가하지 않는다. 먼저 비공개 Sites URL에 배포하고, health·로그인·RLS A/B·수정 링크·계정 삭제·보안 헤더를 검증한 뒤 도메인을 연결한다.

## 사용자 데이터 처리

현재 DB는 빈 초기 상태이므로 데이터 이관은 없다. 초기 migration만 한 번 적용됐다. 베타 시작 뒤에는 다음 원칙을 고정한다.

1. 호스팅을 바꿔도 Supabase 프로젝트와 테이블을 재생성하지 않는다.
2. 신규 migration은 append-only로 적용한다. 이미 적용된 migration은 수정·삭제하지 않는다.
3. 규모 있는 DB 변경 전에는 암호화된 논리 백업과 별도 복구 검증을 실행한다. Auth와 Storage는 별도 백업 범위로 다룬다.
4. 사용자 삭제는 계정 삭제 API를 통한 개별 요청만 허용한다. 배포 작업은 사용자 데이터를 삭제하지 않는다.

## 검증 기준

- Vite/Sites build가 `dist/server/index.js`를 만든다.
- public key만 포함된 브라우저 번들에 service-role 문자열이 없다.
- Supabase runtime 및 service-role contract가 migration `202608230008`과 일치한다.
- 익명 사용자는 다른 사용자의 workspace row를 읽거나 수정할 수 없다.
- 배포 URL에서 health, 로그인, 비밀번호 재설정, 고객 수정 링크, 계정 삭제가 각각 기대한 상태 코드로 동작한다.
- Sites는 비공개 URL로 먼저 배포하고, 도메인 연결은 위 검증 이후에만 한다.

## 제외 범위

PortOne 결제 웹훅, 실제 월 구독 청구, 외부 SMTP 발송, FCM Web Push는 이 런타임 전환과 별도 기능이다. 이 설계는 이를 구현했다고 주장하지 않는다.
