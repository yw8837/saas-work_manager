# 일감체크 배포·운영 인계서

이 문서는 창업자가 소유한 Supabase·Vercel 값을 연결해 Preview를 만들고, 검증한 뒤 운영으로 전환하는 절차다. 외부 계정 없이 코드만으로 Hosted 성공을 주장하지 않는다.

## 빠른 Preview 경로

프로젝트 루트가 이 폴더라면 외부값을 받은 뒤 아래 순서만 실행한다.

중간에 멈췄거나 현재 단계를 모르면 `npm run hosted:bootstrap`을 실행한다. `.env.local`이 없을 때만 안전하게 초안을 만들고, 이후에는 원격 상태를 읽어 다음 행동만 안내한다. Supabase 프로젝트 생성·DB 비밀번호·결제와 외부 계정 로그인은 자동 승인하지 않는다.

`npm run check:external-inputs -- --json`은 어느 단계에서든 실행할 수 있다. 값이나 비밀을 출력하지 않고 최종 도메인, SMTP DNS·evidence, 운영 evidence, 전용 A/B 계정, 현재 셸 전용 PAT·파괴적 ACK, Supabase/Vercel link와 실행 receipt의 준비 여부·입력 위치를 한 번에 보여준다. 준비 초반에는 `blocked`가 정상이며, 이 명령의 입력 형식 PASS가 원격 상태·법률 검토·메일 전달 성공을 대신하지 않는다.

```powershell
npm run hosted:env:init
# 위 명령은 기존 .env.local을 절대 덮어쓰지 않는다.
# Dashboard에서 Supabase Seoul(ap-northeast-2) 프로젝트를 만든 뒤
# .env.local의 URL·browser key·server secret·운영자명·지원메일을 실제 값으로 수정한다.
# 첫 Preview 전 SUPABASE_AUTH_SITE_URL은 https://bootstrap.invalid 그대로 두고
# 이 상태로 Auth config push·초대·재설정 메일을 실행하지 않는다.
npm ci
npm run supabase:login
npm run supabase:link -- --project-ref abcdefghijklmnopqrst
npm run supabase:push:dry
$ref = (Get-Content supabase/.temp/project-ref -Raw).Trim()
$env:ILGAMCHECK_DB_PUSH_ACK = "APPLY_MIGRATIONS_TO_$ref"
npm run supabase:push
Remove-Item Env:ILGAMCHECK_DB_PUSH_ACK
npm run supabase:migrations
npm run policy:manifest:verify
npm run check:release
npm run vercel:login
npm run vercel:link
$vercel = Get-Content .vercel/project.json -Raw | ConvertFrom-Json
$env:ILGAMCHECK_VERCEL_ENV_PUSH_ACK = "PUSH_HOSTED_ENV_TO_PREVIEW_$($vercel.projectId)"
npm run vercel:env:push:preview
Remove-Item Env:ILGAMCHECK_VERCEL_ENV_PUSH_ACK
npm run vercel:preview
```

Git이 없어도 위 wrapper로 첫 Preview를 만들 수 있다. `vercel:preview`는 linked project를 원격 재검증하고, 현재 `src`·`public`·migration·`supabase/config.toml`·`scripts`·빌드 설정·`.gitignore`와 존재하는 `.vercelignore`의 결정론적 SHA-256 지문을 배포 메타데이터에 넣으며 `--target preview`를 명시한다. 첫 Preview URL이 나온 뒤에야 그 정확한 origin을 **로컬 `.env.local`의** `SUPABASE_AUTH_SITE_URL`로 바꾸고 Auth 설정을 민다. 이 변수는 config push와 초대 CLI 전용이며 Vercel runtime에는 등록하지 않는다.

guard/deploy의 Vercel CLI 자식 프로세스에는 PATH·사용자 config/cache 경로·CA 경로 등 최소 OS baseline만 전달한다. 부모 셸의 `VERCEL_TOKEN`, Supabase service/PAT, 테스트 계정 비밀번호, 일반 `*_SECRET`은 상속하지 않는다. 따라서 `npm run vercel:login`으로 저장된 창업자 계정 세션을 사용하고, 배포 wrapper를 실행하는 셸에 다른 서비스 비밀값을 둘 이유가 없다.

```powershell
# .env.local의 SUPABASE_AUTH_SITE_URL을 첫 Preview의 정확한 origin으로 교체한 뒤
$ref = (Get-Content supabase/.temp/project-ref -Raw).Trim()
$env:ILGAMCHECK_AUTH_CONFIG_PUSH_ACK = "PUSH_CLOSED_BETA_AUTH_CONFIG_TO_$ref"
npm run supabase:config:push
Remove-Item Env:ILGAMCHECK_AUTH_CONFIG_PUSH_ACK
$securePat = Read-Host "auth_config_read 권한 Supabase access token" -AsSecureString
$patPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePat)
try { $env:SUPABASE_ACCESS_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($patPointer) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($patPointer); $securePat = $null }
npm run status:domain-ready
Remove-Item Env:SUPABASE_ACCESS_TOKEN
npm run smoke:remote -- https://YOUR_PREVIEW.vercel.app
```

원격 대상 guard는 Supabase ref=앱 URL ref, 로그인 계정의 Seoul region, Auth origin=연결된 Vercel project/team의 READY deployment/alias, 배포 메타의 소스 지문=현재 로컬 소스 지문을 확인한다. 배포 `/api/health`는 공개 browser key의 runtime/policy contract뿐 아니라 **현재 Vercel runtime의 server key**로 service-role 전용 무데이터 RPC를 다시 호출하며, 정확한 현재 contract가 아니면 503을 반환한다. 이 지문 메타데이터는 배포 wrapper가 제출하는 **client-side consistency assertion**이지 Vercel이 서명한 암호학적 원격 attestation이 아니다. wrapper는 deploy 명령 전후 지문도 다시 비교하며 중간에 소스가 바뀌면 성공으로 인정하지 않는다. 그때 이미 생성된 deployment는 신뢰하지 말고 현재 소스로 재배포한다. 이 장치는 실수로 예전 소스나 다른 project를 검사하는 것을 막지만, Vercel 배포 권한자가 같은 값을 위조하는 공격까지 증명하지는 않는다. Vercel 권한 최소화·감사 로그와 commit provenance를 별도로 보존한다. 첫 Preview와 Supabase Dashboard에서 Site URL·정확한 `/auth/reset` 허용 URL 1개를 맞추고 custom SMTP·DNS·정책 승인을 먼저 끝낸다. 그 뒤 SMTP 증거와 A/B 검증에 사용할 **통제된 테스트 사서함만** `beta:invite`로 초대할 수 있다. 실제 베타 사용자 초대는 [SMTP 외부 베타 게이트](./SMTP-RUNBOOK.md) 전체 통과 뒤에만 한다.

Git 저장소 연결은 소스 보관·commit provenance 용도로 사용할 수 있다. 다만 현재 release fingerprint 메타를 넣는 유일한 지원 배포 경로는 `npm run vercel:preview`와 `npm run vercel:production` wrapper다. Vercel Git 자동 배포로 생성된 deployment는 이 메타가 없어 `status:domain-ready`의 검증된 릴리스 후보가 될 수 없다. Preview가 나오면 다음 명령으로 Hosted 상태·DB contract·핵심 URL·보안 헤더·PWA 자산을 확인한다.

```powershell
npm run smoke:remote -- https://YOUR_PREVIEW.vercel.app
```

이 smoke는 로그인 없는 배포 표면만 검사한다. 계정 A/B RLS, Realtime, 이메일 재설정, 공개 수정요청 실제 저장은 4장의 실계정 검증까지 통과해야 한다.

전용 테스트 계정 A/B를 Supabase에 만든 뒤 `.env.local`에는 계정 값만 넣고, 파괴적 검증 동의값은 실행 직전 현재 셸에만 두면 핵심 Hosted 계약을 자동 실증할 수 있다. **A 계정 작업공간은 검증 fixture로 덮어쓰므로 운영 계정은 쓰지 않는다.**

```powershell
npm run verify:hosted
```

자동 검사는 로그인, 최신 `202608200007` runtime contract, 배포 manifest와 DB의 privacy/terms 버전·bundle digest 일치, A 저장, B의 A 조회 0건, 직접 DML 거부, 익명 수정요청 idempotency 1건, 토큰 교체, Realtime UPDATE를 확인한다. 이메일 재설정 메일의 실제 전달·링크 사용은 여전히 사람이 확인한다.

## 0. 배포 판정

현재 저장소에는 다음 코드가 있다.

- Supabase 이메일/비밀번호 가입·로그인·로그아웃
- 사용자별 JSON 작업공간 저장, 버전 충돌 감지와 idempotency
- `auth.uid()` 기반 RLS와 직접 DML 차단
- 작업공간 Realtime 갱신
- 256-bit 토큰 기반 익명 고객 수정요청 요약·접수 RPC
- 운영 보안 헤더와 Hosted 환경변수 검사

실제 Supabase 프로젝트·외부 사용자·Vercel·DNS가 없으므로 **Hosted 운영 성공은 아직 미검증**이다. 아래 Preview 검증이 모두 통과하기 전에는 유료 고객 데이터를 넣지 않는다.

## 1. 준비물과 소유권

창업자 개인 또는 법인 명의 계정으로 준비한다.

- Supabase 계정과 Seoul(`ap-northeast-2`) 프로젝트
- Vercel 계정. Git 저장소는 선택적인 소스 보관·commit provenance 용도이며 검증된 배포는 CLI wrapper로 실행
- 도메인과 DNS 변경 권한
- A/B 격리용 서로 다른 이메일 계정 2개
- 실제 수신을 확인할 서로 다른 외부 메일 사업자 2개와 SMTP 사업자의 controlled bounce/suppression 확인 수단
- 고객 폼 확인용 시크릿 창 또는 별도 휴대폰
- 저장소 밖의 암호화된 백업 위치
- 저장소 밖의 암호화된 SMTP 수동 evidence JSON 위치
- logical backup용 Docker Desktop 또는 Supabase CLI가 지원하는 호환 컨테이너 런타임

기록할 공개값:

- Supabase Project ref
- Project URL: `https://PROJECT_REF.supabase.co`
- 브라우저용 anon 또는 publishable key
- Vercel Preview URL
- 최종 운영 URL

비밀값인 DB 비밀번호, personal access token, `service_role`/secret key는 비밀번호 관리자에 보관한다. 실제 값은 Git·문서·`NEXT_PUBLIC_*`에 넣지 않는다. 탈퇴 API용 `SUPABASE_SERVICE_ROLE_KEY`만 Git에서 제외된 로컬 env와 Vercel 암호 환경변수에 둔다.

## 2. 소스 사전 점검

프로젝트 루트(`01_일감체크/app`)에서 실행한다.

```powershell
npm ci
npm test
npm run lint
npm run typecheck
npm run build
npm run test:e2e
npm run audit:prod
```

모든 명령의 exit code가 0이어야 한다. 실패한 상태에서 Supabase나 도메인을 연결하지 않는다. 로컬 기본 모드는 `NEXT_PUBLIC_STORAGE_MODE=local`이며 단일 브라우저 데모만 검증한다.

`.github/workflows/release-gate.yml`도 main push와 PR에서 Node 22·Chromium으로 `npm run check:release`를 실행한다. CI의 Supabase 값은 **빌드 fail-closed 계약만 확인하는 가짜 공개값**이며 실제 Hosted 로그인·RLS·Realtime 성공 증거가 아니다. 실제 A/B 증거는 `npm run verify:hosted`와 4장의 수동 검증에서 따로 남긴다.

## 3. Supabase 프로젝트와 migration

### 3.1 프로젝트 생성

1. Supabase Dashboard에서 새 프로젝트를 Seoul(`ap-northeast-2`)에 만든다.
2. migration을 적용하기 전에 Database password를 비밀번호 관리자에 저장한다.
3. 프로젝트 API 설정에서 URL과 browser-safe anon/publishable key만 복사한다.
4. 먼저 migration을 적용하고, 테스트 사용자는 그 다음에 만든다. `auth.users` 생성 trigger가 `profiles`를 함께 만들기 때문이다.

### 3.2 CLI 적용 — 권장

저장소의 `supabase/config.toml`과 아래 wrapper는 Supabase CLI `2.114.0`을 고정한다. 원격 project ref는 Git에서 제외된 `supabase/.temp`에만 저장된다.

```powershell
npm run supabase:login
npm run supabase:link -- --project-ref PROJECT_REF
npm run supabase:push:dry
$ref = (Get-Content supabase/.temp/project-ref -Raw).Trim()
$env:ILGAMCHECK_DB_PUSH_ACK = "APPLY_MIGRATIONS_TO_$ref"
npm run supabase:push
Remove-Item Env:ILGAMCHECK_DB_PUSH_ACK
npm run supabase:migrations
```

wrapper는 linked ref, `NEXT_PUBLIC_SUPABASE_URL` ref, 현재 로그인 계정의 실제 프로젝트와 Seoul region이 모두 일치할 때만 진행한다. `--dry-run`에서 아래 일곱 파일만 순서대로 표시되는지 확인하고 출력된 ref 결합 확인값을 현재 셸에 넣은 뒤 실제 push를 실행한다. 성공 뒤 비밀값 없는 ref·runtime receipt를 Git 제외 경로 `supabase/.temp/ilgamcheck-deploy-state.json`에 원자 저장해 `hosted:bootstrap`이 재개 지점을 판정한다. migration receipt에는 적용 시점의 파일별 SHA-256 manifest가 포함된다. receipt에 기록된 migration은 수정·삭제하지 않고, DB 변경은 더 큰 timestamp의 새 migration 파일로만 추가한다. receipt는 schema·시각을 검사하는 30일 이내 로컬 실행 이력이지 원격 현재 상태 증명이 아니다. 첫 Preview 뒤 `status:domain-ready`가 같은 origin의 `/api/health`에서 DB contract `202608200007`과 배포 정책 manifest·DB policy contract의 exact 버전/bundle digest를 다시 감지해야 현재 migration PASS다. Auth config push는 placeholder origin에서 실행하지 않고 **첫 Vercel Preview가 READY가 된 뒤** 3.5 순서로만 실행한다.

1. `202608140001_initial.sql`
2. `202608150002_workspace_documents.sql`
3. `202608160003_runtime_contract.sql`
4. `202608160004_workspace_save_receipt_retention.sql`
5. `202608160005_policy_acceptances.sql`
6. `202608170006_policy_publication_contract.sql`
7. `202608200007_plan_entitlements.sql`

`202608200007`은 서버측 요금제 한도(`plan_limits`·`subscriptions`·`workspace_job_ledger`)와 초대 코드를 도입하고 runtime·service-role 계약을 함께 올린다. 두 계약은 같은 상수와 비교되므로 반드시 한 단위로 올린다.

`202608170006`은 현재 앱 manifest의 privacy/terms 버전·bundle digest·`finalized=false`를 데이터 없는 공개 RPC로 고정한다. 실제 운영자·국외 이전 내용을 법률 검토해 privacy/terms 본문이나 버전, `finalized`를 바꾸면 다음을 한 단위로 반영한다.

1. `src/lib/policy-publication-manifest.json`의 공개 본문·버전·시행일·`finalized`를 갱신한다. 운영자명, 지원 이메일, 사용자/고객 정보, 비밀값은 digest manifest에 넣거나 hash하지 않는다.
2. `node scripts/policy-publication-manifest.mjs --print-digests`로 본문/bundle digest를 재계산해 manifest에 기록하고 `npm run policy:manifest:verify`를 통과시킨다.
3. 새 timestamp migration에서 policy contract RPC와 runtime contract를 새 값으로 갱신하고 앱의 runtime constant도 같이 올린다. 정책 버전이 바뀌면 동의 RPC·가입 trigger가 새 버전만 받도록 해당 migration에서 갱신한다.
4. 이미 receipt에 기록되었거나 원격에 적용된 migration은 수정하지 않는다. 새 migration push·Preview 재배포 뒤 `/api/health`의 app/DB policy 계약이 일치해야 한다.

기존 데이터가 있는 프로젝트에 재적용할 때는 먼저 6장의 백업을 완료한다. `db push`와 SQL Editor 수동 적용을 섞지 않는다.

### 3.3 SQL Editor — migration 적용 경로로 비지원

이 릴리스 절차에서는 신규/변경 migration을 SQL Editor로 수동 적용하지 않는다. CLI를 사용할 수 없으면 배포를 중단하고 원인을 해결한다. SQL Editor는 7.2장의 공개 RPC 긴급 차단처럼 명시된 장애 대응 SQL에만 쓴다. 이미 migration SQL을 수동 실행한 프로젝트는 이 문서의 정상 상태가 아니므로 receipt를 손으로 만들거나 `db push`를 바로 재실행하지 않는다. 먼저 Supabase 공식 절차로 원격 migration history를 실제 적용 버전과 대조·복구한 뒤, guarded `npm run supabase:push:dry`와 `npm run supabase:push`가 변경 0건과 exact ref·파일 SHA-256 receipt를 확인할 때만 릴리스 흐름으로 돌아온다.

### 3.4 구조 확인

SQL Editor에서 아래 조회가 모두 이름을 반환해야 한다.

```sql
select
  to_regclass('public.profiles') as profiles,
  to_regclass('public.workspace_documents') as workspace_documents,
  to_regclass('public.workspace_revision_portals') as workspace_revision_portals,
  to_regclass('public.workspace_revision_requests') as workspace_revision_requests;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'save_workspace_document',
    'register_workspace_revision_portal',
    'get_workspace_revision_summary',
    'submit_workspace_revision_request'
  )
order by routine_name;
```

Dashboard의 관리자 SQL Editor는 RLS를 우회할 수 있으므로 이 조회 성공을 A/B 격리 증거로 사용하면 안 된다.

### 3.5 Auth URL·폐쇄 베타 설정

`.env.local`의 `SUPABASE_AUTH_SITE_URL`을 정확한 Preview origin으로 바꾼다. 안내된 `PUSH_CLOSED_BETA_AUTH_CONFIG_TO_PROJECT_REF` 형식의 확인값을 현재 셸에만 넣고 `npm run supabase:config:push`를 실행한다. 이 push wrapper 자체가 linked Supabase Seoul 프로젝트와 해당 origin의 연결된 Vercel READY deployment를 먼저 확인하므로, 아직 Auth 원격값이 바뀌기 전 실패하는 `status:domain-ready`를 선행조건으로 두지 않는다. wrapper는 별도 임시 config로 Site URL과 해당 origin의 `/auth/reset` 1개, 전체 신규 가입 OFF, 초대·기존 계정용 이메일 로그인 ON만 반영하며 체크인된 로컬 URL은 바꾸지 않는다. 성공하면 ref·origin·가입 정책만 담은 30일 이내 실행 receipt를 같은 Git 제외 파일에 기록한다. 그 뒤 `auth_config_read` 권한의 Supabase personal/fine-grained access token을 **현재 셸에만** 넣고 `status:domain-ready`를 실행한다. 이 명령은 고정 Management API endpoint에서 현재 `site_url`, `uri_allow_list`의 정확한 `/auth/reset` 1개, `disable_signup=true`, `external_email_enabled=true`를 직접 읽는다. 여기서 `external_email_enabled=true`는 이메일 로그인 provider가 켜졌다는 뜻일 뿐 custom SMTP 활성화나 외부 전달 성공의 증거가 아니다. receipt가 있더라도 원격 현재값 readback이 실패하면 계속 BLOCKED이며, SMTP는 별도 runbook의 DNS·수신·반송 증거로 판정한다.

```powershell
$securePat = Read-Host "auth_config_read 권한 Supabase access token" -AsSecureString
$patPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePat)
try { $env:SUPABASE_ACCESS_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($patPointer) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($patPointer); $securePat = $null }
npm run supabase:auth:readback
npm run status:domain-ready
Remove-Item Env:SUPABASE_ACCESS_TOKEN
```

`SUPABASE_ACCESS_TOKEN`은 `.env.local`, Vercel, Git, 명령행 인수에 넣지 않는다. `domain-ready-status`는 env 파일을 읽기 전에 현재 셸 값을 별도로 캡처하므로 파일에 적은 PAT를 원격 요청에 쓰지 않는다. 공식 Management API 인증·scope는 [Supabase Management API 안내](https://supabase.com/docs/reference/api/getting-started)를 따른다.

Supabase Dashboard → Authentication에서 결과를 교차 확인한다.

- Site URL: 검증 중에는 정확한 Vercel Preview URL, 운영 전환 뒤에는 `https://최종도메인`
- Redirect URLs: 현재 검증 중인 origin의 정확한 `/auth/reset` **1개만**. Preview를 검증할 때는 Preview URL 1개, 운영 전환 뒤에는 최종 운영 도메인 URL 1개로 교체한다. localhost·이전 Preview·wildcard를 함께 남기지 않는다.
- 폐쇄 베타 통과선: 앱 `NEXT_PUBLIC_BETA_SIGNUP_ENABLED=false`, 원격 Auth 전체 신규 가입 OFF, 이메일 로그인 제공자 ON이 모두 일치
- 테스트 사용자: 일반 가입이나 Dashboard의 기본 목적지 초대를 쓰지 않고 아래 wrapper로 한 명씩 만든다.
- Preview A/B 검증 전: 창업자 소유 custom SMTP를 먼저 Supabase에 연결하고, 사업자가 지정한 발신·Return-Path DNS를 게시한 뒤 통제된 테스트 사서함의 전달을 확인한다. 이때 `SUPABASE_AUTH_SITE_URL`은 현재 Preview이고, 아래 wrapper로 만든 전용 A/B만 허용한다. 이 예비 전달은 최종 도메인 SMTP evidence나 실제 베타 사용자 초대를 대신하지 않는다.
- 실제 외부 테스터 초대 전: 최종 도메인 Auth 전환 뒤 [SMTP runbook](./SMTP-RUNBOOK.md)에 따라 통제된 외부 사서함 2곳의 invite/reset·SPF/DKIM/DMARC pass·최종 링크·controlled bounce/suppression 증거를 다시 만든다. 이 증거 수집 계정은 실제 베타 사용자가 아니다. Supabase 기본 SMTP는 조직 Team 밖 주소 발송이 제한되므로 폐쇄베타도 예외가 아니다.
- 공개 베타 전환: 위 SMTP 검증 후 앱/원격 가입 설정을 함께 변경하고 셀프가입 정책을 별도로 승인한다.

원격 config push, Management API 현재값 readback과 Dashboard 교차 확인이 끝난 뒤, `.env.local`에 `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_AUTH_SITE_URL`, 서버 전용 `SUPABASE_SERVICE_ROLE_KEY`를 넣고 실행 직전 현재 PowerShell 셀에만 확인값을 둔다.

```powershell
$env:ILGAMCHECK_BETA_INVITE_ACK="I_CONFIRMED_POLICY_AND_SMTP_SEND_ONE_INVITE"
npm run beta:invite -- --email tester@example.com
Remove-Item Env:ILGAMCHECK_BETA_INVITE_ACK
```

wrapper는 Supabase Admin `inviteUserByEmail`을 서버 키로 호출하고 목적지를 정확히 `${SUPABASE_AUTH_SITE_URL}/auth/reset`으로 고정한다. 실행 전 linked Supabase Seoul ref와 연결된 READY Vercel deployment·현재 release fingerprint를 재확인하며, 확인 ACK는 `.env.local`이 아니라 **현재 실행 셸 값만** 인정한다. ACK는 운영자의 확인 행위일 뿐 법률 검토나 SMTP 전달 증거를 대신하지 않는다. 성공·실패 로그에 이메일, 서버 키, 초대 링크를 출력하지 않는다. 초대받은 사용자는 메일 링크 열기 → `/auth/reset`에서 8자 이상 비밀번호 저장 → 로그아웃 → 새 비밀번호 로그인을 실기기로 확인한다. Supabase는 허용 목록에 없는 `redirectTo`를 오류 없이 Site URL로 대체할 수 있으므로 config push/Dashboard 교차 확인을 생략하면 안 된다. custom SMTP 제한과 설정은 [Supabase 공식 SMTP 안내](https://supabase.com/docs/guides/auth/auth-smtp)를 따르고, 운영 증거 형식과 통합 명령은 [SMTP runbook](./SMTP-RUNBOOK.md)을 따른다.

불필요하게 넓은 wildcard 도메인을 허용하지 않는다. Preview와 최종 도메인에서 재설정 메일 요청 → 링크 열기 → 새 비밀번호 저장 → 새 비밀번호 로그인을 각각 시험한다.

## 4. Hosted Preview와 A/B 검증

### 4.1 로컬 Hosted 실행

`.env.local`에 공개 설정과 서버 전용 키를 구분해 넣는다.

```dotenv
NEXT_PUBLIC_STORAGE_MODE=hosted
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=SUPABASE_BROWSER_SAFE_ANON_OR_PUBLISHABLE_KEY
NEXT_PUBLIC_OPERATOR_NAME=PUBLIC_LEGAL_OR_BUSINESS_OPERATOR_NAME
NEXT_PUBLIC_SUPPORT_EMAIL=support@YOUR_DOMAIN
NEXT_PUBLIC_BETA_SIGNUP_ENABLED=false
SUPABASE_SERVICE_ROLE_KEY=SERVER_ONLY_SECRET
```

```powershell
npm run check:deploy
npm run dev
```

Hosted를 요청했는데 값이 빠지면 앱은 local로 조용히 대체되지 않고 설정 오류 화면을 보여야 한다.

기존 local 데모 상태를 Hosted 계정으로 자동 가져오지는 않는다. 베타 운영 데이터는 Hosted 테스트가 끝난 새 계정에서 입력하고, local 데이터 이관이 필요하면 별도 내보내기·검토·가져오기 기능을 만든 뒤 수행한다.

### 4.2 두 계정 격리

다음 이름을 그대로 쓰지 말고 실행 시각이 포함된 고유 문자열을 사용한다.

1. Preview custom SMTP로 받은 전용 초대 링크에서 A 비밀번호를 설정한 뒤 브라우저 프로필 A로 로그인하고 `A_ONLY_<시각>` 일감을 만든다.
2. 저장 상태가 완료로 바뀐 뒤 새로고침하고 일감이 남는지 확인한다.
3. 완전히 다른 브라우저 프로필 B에서 별도 초대 계정 B로 로그인한다.
4. B에게 A 일감·고객 별칭·링크·수정 원문이 하나도 보이지 않는지 확인한다.
5. B에서 `B_ONLY_<시각>`을 만들고, A를 다시 열어 B 데이터가 보이지 않는지 확인한다.
6. 한 브라우저에서 A 로그아웃 → B 로그인을 반복해 이전 사용자의 local cache가 노출되지 않는지 확인한다.
7. Dashboard에서 관리자 권한으로 `workspace_documents.owner_id`가 서로 다른 두 행인지 확인한다. 관리자로 보인다는 사실은 정상이며 RLS 실패가 아니다.
8. A의 재설정 메일을 요청하고 새 비밀번호로만 로그인되는지, 만료되거나 이미 사용한 링크가 거부되는지 확인한다.

UI 격리와 함께 migration의 실제 Postgres RLS/DML 회귀 테스트도 보관한다. `workspace_documents`와 일감·수정 증거 같은 런타임 table 직접 쓰기는 거부되고 `save_workspace_document` 등 허용 RPC만 자기 기록을 변경해야 한다.

### 4.3 공개 수정 링크

1. A의 활성 일감에서 고객 수정요청 URL을 복사한다.
2. 로그인되지 않은 시크릿 창 또는 별도 휴대폰에서 URL을 연다.
3. 화면에 작업 제목·패키지·포함/사용/남은 횟수만 나타나는지 확인한다.
4. 연락처·작업 링크·금액·다른 일감이 응답이나 화면에 노출되지 않는지 확인한다.
5. 2~4,000자 범위의 요청을 제출한다.
6. A 작업 화면에 새 요청과 카운터가 Realtime으로 반영되는지 확인한다.
7. 응답 유실을 재현해 같은 이름+본문을 다시 보내도 폼이 같은 idempotency UUID를 유지하고 중복 증거를 만들지 않는지 확인한다. 이름이나 본문을 바꾸면 의도한 새 요청으로 처리돼야 한다.
8. Preview에서 두 탭으로 3초 안에 연속 제출해 두 번째가 제한되는지 확인한다. 운영 데이터로 부하 테스트하지 않는다.
9. 일감을 완료한 뒤 같은 URL의 조회·제출이 거부되는지 확인한다.
10. 임의 토큰과 잘린 토큰에서 일감 존재 여부나 내부 오류가 노출되지 않는지 확인한다.
11. 링크를 끄고 Hosted 저장 완료 표시를 확인하면 기존 URL이 거부되고, 다시 켜 저장하면 현재 URL만 복구되는지 확인한다.
12. 링크를 재발급하고 Hosted 저장 완료 표시를 확인하면 새 URL만 성공하고 이전 URL은 계속 거부되는지 확인한다.

공개 링크 원문은 소유자 작업공간 JSON에, 포털 lookup은 SHA-256 hash로 저장된다. URL을 아는 사람이 요청할 수 있으므로 링크 자체를 비밀로 취급한다.

## 5. Vercel Preview와 운영 빌드

1. Git 없이 시작하면 `npm run vercel:login`, `npm run vercel:link`로 빈 Preview Project를 먼저 만들고 현재 폴더에 연결한다. 아직 env가 없으므로 이 단계에서는 deployment를 만들지 않는다.
2. `.vercel/project.json`의 project ID가 들어간 확인값을 현재 셸에 넣고 `npm run vercel:env:push:preview`를 실행한다. wrapper는 먼저 linked Seoul ref와 정확히 같은 Supabase origin의 고정 `get_ilgamcheck_service_role_contract` RPC를 서버 키로 읽는다. 이 RPC는 데이터에 접근하지 않고 `service_role`만 실행할 수 있다. redirect 없이 현재 runtime contract가 반환되어야만 그때 검사한 동일한 URL·키 사본을 Vercel 자식에 넘긴다. 따라서 형식만 맞는 다른 프로젝트의 service-role/secret key, anon key, 응답 origin 변경, timeout·과대 응답은 env 쓰기 전에 실패한다. 아래 7개만 stdin으로 전송하며 값·응답 본문·server secret을 argv나 로그에 넣지 않는다.
3. `npm run vercel:preview`로 첫 Preview를 만든다. wrapper가 `--target preview`를 명시하고 linked project를 원격 재확인한 뒤 현재 소스 지문을 배포 메타데이터에 기록한다. 지문 입력에는 `src`·`public`·migration·`supabase/config.toml`·`scripts` 전체·배포 설정·`.gitignore`와 존재하는 `.vercelignore`가 포함된다. 저장소의 `vercel.json`이 `npm ci`와 fail-closed `npm run check:deploy`를 적용하므로 env가 빠지거나 공개 변수에 secret/service_role이 있으면 배포가 실패한다.
4. Git 저장소/Vercel 연동은 소스 보관과 commit provenance에 쓸 수 있다. 그러나 자동 Git deployment에는 wrapper의 release fingerprint meta가 없으므로 현재 검증된 배포 경로로 지원하지 않는다. 릴리스 후보는 반드시 `npm run vercel:preview` 또는 `npm run vercel:production`으로 만든다.
5. Framework Preset은 Next.js, Node.js는 20 이상으로 지정한다. `vercel.json`은 서버 함수를 Supabase Seoul과 가까운 `icn1`에 고정한다. CDN·Vercel/Supabase 지원 로그 등 국외 처리는 개인정보처리방침 고지를 별도로 유지한다.
6. Preview와 Production 환경에는 각각 아래 값만 등록한다.
   - `NEXT_PUBLIC_STORAGE_MODE=hosted`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_OPERATOR_NAME`
   - `NEXT_PUBLIC_SUPPORT_EMAIL`
   - `NEXT_PUBLIC_BETA_SIGNUP_ENABLED=false`
   - `SUPABASE_SERVICE_ROLE_KEY` — server-only, 절대 `NEXT_PUBLIC_*` 금지
7. 첫 Preview를 만든 뒤 정확한 origin으로 3.5 Auth config push를 실행하고, guard가 deployment의 linked project 소속과 READY 상태를 검증하게 한다.
8. 4장의 A/B·공개 링크 검증과 `npm run smoke:remote -- https://YOUR_PREVIEW.vercel.app`을 통과시킨다.
9. Preview 검증 증거를 남긴 후에만 Production 배포를 승인한다. Git 없는 CLI 경로의 필수 소스 증거는 `deployment ID + release fingerprint + UTC timestamp`다. Vercel Git 연동 경로에서만 여기에 commit SHA를 추가로 요구한다. 테스트 계정 UUID·시각·결과도 함께 남긴다.

`NEXT_PUBLIC_*`는 빌드 시 브라우저 번들에 들어간다. Vercel에서 값을 바꾸기만 하고 기존 배포를 재사용하면 안 되며, 반드시 새 build를 만든다. DB password, SMTP password, PG secret은 Vercel에 넣지 않는다.

## 6. 도메인·DNS·HTTPS

아래 순서는 Auth push와 아직 존재하지 않는 production deployment가 서로를 기다리는 순환을 피하기 위해 고정한다.

Production 전에는 실제 운영 주체와 처리자·국외 이전 내용을 법률·운영 검토한 뒤 3.2의 정책 manifest/새 migration 절차를 끝내야 한다. 현재 체크인된 `finalized=false`는 테스트용 준비본이며 외부 베타 승인이 아니다. 법률 내용은 코드나 이 문서에서 추측해 채우지 않는다.

1. Vercel Project → Domains에 최종 도메인을 추가하고, Vercel 화면이 제시하는 DNS record를 그대로 설정한다. A/CNAME 값을 문서에서 추측해 고정하지 않는다.
2. apex와 `www` 중 하나를 canonical로 정하고 나머지는 redirect한다. `.env.local`의 `SUPABASE_AUTH_SITE_URL`은 최종 origin으로, 공개 지원 이메일 등 Hosted 값도 최종값으로 준비한다. `SUPABASE_AUTH_SITE_URL` 자체는 Vercel runtime env가 아니다.
3. linked Vercel production project ID 확인값을 현재 셸에 넣고 `npm run vercel:env:push:production`을 실행한다. Preview와 동일하게 exact linked Supabase RPC에서 service-role key와 현재 DB contract의 결합을 다시 확인하므로, Production push 시점에 key를 교체했다면 새 검증 없이는 진행되지 않는다.
4. 즉시 `npm run vercel:production`으로 **현재 release fingerprint**가 메타데이터에 든 새 production build를 만든다. Wrapper는 먼저 `--skip-domain`으로 기존 도메인을 건드리지 않는 production deployment를 만들고, 배포 ID·project/team·`target=production`·READY·release fingerprint를 authenticated API로 확인한 뒤에만 그 ID를 promote한다. 검증 실패 시 기존 production alias는 그대로 남는다. 기존 Preview/Production deployment를 재사용하지 않는다.
5. 최종 도메인이 그 deployment alias로 연결되고 Vercel의 DNS가 Valid Configuration, 인증서와 deployment가 READY가 될 때까지 기다린다. 아래 HTTPS·`/api/health`를 먼저 확인한다.
6. 이제야 ref 결합 ACK로 `npm run supabase:config:push`를 실행해 Supabase Auth Site URL과 정확한 `/auth/reset` 1개를 최종 origin으로 바꾼다. 현재 셸의 `auth_config_read` PAT로 `npm run supabase:auth:readback`과 `npm run status:domain-ready`를 실행한 뒤 PAT를 제거한다.
7. Preview A/B에 사용한 custom SMTP 설정과 발신 DNS를 다시 확인하고 `npm run smtp:dns:verify`를 통과시킨다. `external_email_enabled=true`만으로 custom SMTP 준비나 전달 성공을 판정하지 않는다.
8. 마지막으로 `npm run smoke:remote -- https://YOUR_DOMAIN`, 최종 origin으로 새로 보낸 외부 두 사업자 invite/reset·controlled bounce 수동 evidence, 운영 evidence와 `npm run check:external-beta`를 순서대로 통과시킨다.

`smoke:remote`는 `/privacy`·`/terms`의 동일 origin HTTP 200(예상 밖 redirect 없음)와 health의 정책 bundle/DB 버전 일치를 확인한다. `check:external-beta`가 호출하는 최종 domain smoke는 추가로 `finalized=true`를 강제하므로 draft·placeholder·다른 배포 digest·DB policy 버전 불일치를 모두 거부한다.

```powershell
curl.exe -I https://YOUR_DOMAIN
curl.exe https://YOUR_DOMAIN/api/health
```

최소한 HTTPS 성공, `content-security-policy`, `strict-transport-security`, `x-content-type-options: nosniff`, `x-frame-options: DENY`, `referrer-policy`를 확인한다. 로그인·저장·새로고침·공개 링크를 최종 도메인에서 한 번 더 시험하고, 수동 SMTP evidence와 [정책·탈퇴·복원 운영 evidence](./OPERATIONAL-EVIDENCE.md)를 만든 뒤 현재 셸에 `auth_config_read` PAT와 전용 A/B 동의값을 넣고 `npm run check:external-beta`를 실행한다. 이 최종 gate는 처음과 모든 검증이 끝난 마지막에 `domain-ready`를 실행하며, 두 단계 모두 authenticated deployment detail의 `target=production`과 현재 release fingerprint를 정확히 요구한다. 두 JSON 결과의 project·team·deployment ID·origin·fingerprint·target snapshot도 전부 같아야 한다. 따라서 READY Preview로 대체하거나 검사 도중 최종 alias를 다른 deployment로 바꾸면 전체가 실패한다. PAT는 첫·마지막 `domain-ready` 자식에만 전달되고 중간 자식 환경에서는 제거되며, 명령 종료 직후 셸에서도 제거한다. 이 명령은 실제 Supabase/Vercel 대상 상태부터 확인하고 기존 `verify:hosted`의 A 계정 덮어쓰기 동의값을 우회하지 않는다. evidence verifier는 기록의 형식·최신성만 확인하며 법률적 충분성과 기록의 진실성을 대신하지 않는다.

최종 gate 직전에는 먼저 `npm run check:external-inputs -- --json`을 실행해 모든 입력 위치가 `pass`인지 확인한다. 이어서 `npm run check:external-beta`가 원격 current-state와 정책 `finalized=true`, 실제 evidence를 별도로 검증해야 출시 통과다.

## 7. 장애 롤백과 긴급 차단

### 7.1 프런트엔드 회귀

1. Vercel에서 직전 정상 deployment ID·release fingerprint·배포 시각을 확인한다. Git 연동 배포일 때만 commit SHA도 확인한다.
2. 직전 deployment를 Production으로 되돌린다.
3. Supabase migration은 그대로 둔다. 프런트 롤백이 DB 롤백을 의미하지 않는다.
4. 장애 commit의 새 쓰기 형식이 DB에 들어갔다면 쓰기를 멈추고 데이터 영향부터 확인한다.

### 7.2 공개 수정 폼 긴급 전체 차단

링크 유출이나 익명 접수 공격이 발생하면 Supabase SQL Editor에서 공개 함수 실행 권한을 일시 회수한다.

```sql
revoke execute on function public.get_workspace_revision_summary(text)
  from anon, authenticated;
revoke execute on function public.submit_workspace_revision_request(text, text, text, uuid)
  from anon, authenticated;
revoke execute on function public.submit_revision_request(text, text, text, uuid, text)
  from anon, authenticated;
```

원인과 영향을 확인한 뒤 재개할 때만 원래 권한을 복원한다.

```sql
grant execute on function public.get_workspace_revision_summary(text)
  to anon, authenticated;
grant execute on function public.submit_workspace_revision_request(text, text, text, uuid)
  to anon, authenticated;
grant execute on function public.submit_revision_request(text, text, text, uuid, text)
  to anon, authenticated;
```

단일 링크 유출은 해당 일감 상세에서 먼저 `링크 끄기` 또는 `링크 재발급`을 누르고 Hosted 저장 완료까지 확인한다. 전역 revoke는 다수 링크 공격이나 앱 전체 장애 때만 사용한다.

### 7.3 DB migration 또는 데이터 장애

이 여섯 migration에는 자동 down migration이 없다. 운영 DB에서 table/function을 수동 drop해 되돌리지 않는다.

1. Vercel 접근 또는 쓰기를 중지하고 장애 시각을 기록한다.
2. 현재 DB와 로그를 보존한다.
3. Supabase 관리 백업/PITR로 **별도 recovery 프로젝트**를 만든다.
4. Auth 사용자 UUID와 `profiles.id`, `workspace_documents.owner_id`가 유지되는지 확인한다.
5. recovery 프로젝트에서 A/B·공개 링크 검증을 통과시킨다.
6. Vercel의 Supabase URL/key를 recovery 프로젝트 값으로 바꾸고 새 build를 만든다.
7. 원본 프로젝트는 원인 분석이 끝날 때까지 덮어쓰지 않는다.

## 8. 백업과 복원 훈련

### 8.1 백업

- Supabase Dashboard에서 현재 요금제가 제공하는 관리 백업/PITR 보존 기간과 마지막 성공 시각을 확인한다.
- 첫 운영 데이터 입력 전, 각 migration 전, 대량 데이터 변경 전에 복구 지점을 만든다.
- 월 1회 이상 별도 프로젝트로 실제 복원 훈련을 한다.
- 보조용 logical dump는 저장소 밖의 암호화된 경로에 둔다. 작업공간 dump에는 고객 정보와 공개 링크 원문이 포함될 수 있어 Git·공유 Drive에 평문으로 두면 안 된다.

연결된 프로젝트의 `public` schema와 data는 저장소 밖의 미리 만든 암호화 폴더에 wrapper로 보존한다. wrapper는 Supabase CLI의 containerized `pg_dump`를 사용하므로 Docker Desktop 또는 호환 런타임이 먼저 실행 중이어야 한다. 기존 파일을 덮어쓰지 않고 exact project ref·Seoul region·파일 SHA-256과 **이 소스가 기대하는** runtime contract 식별자를 manifest에 함께 만든다. `expectedRuntimeContract`는 원격 DB에서 읽은 실제 적용값이 아니므로 관리 백업/PITR 상태와 `/api/health`의 실제 contract를 별도로 대조한다.

```powershell
$env:ILGAMCHECK_BACKUP_DIR = "D:\EncryptedBackups\ilgamcheck"
$env:ILGAMCHECK_BACKUP_ACK = "I_UNDERSTAND_EXPORT_CONTAINS_CUSTOMER_DATA"
npm run supabase:backup
```

경로를 실제 저장소 밖 암호화 위치로 바꾼 뒤 실행한다. logical `public` dump만으로는 Supabase가 관리하는 Auth 사용자까지 완전 복구되지 않으므로 관리 백업/PITR을 대체하지 않는다.

### 8.2 복원 판정

복원은 라이브 프로젝트 위에 덮어쓰지 않고 별도 recovery 프로젝트에서 한다.

- Auth 사용자와 UUID 보존
- 계정 A/B의 owner 격리
- 작업공간 document version과 최신 일감 수
- 공개 수정 증거 수와 JSON 타임라인 일치
- 활성 링크만 접수 가능
- Realtime 반영
- 로그인·로그아웃·새로고침

위 항목이 모두 통과한 recovery 프로젝트만 새 운영 대상으로 전환한다. logical dump만 있는 경우 Auth UUID와 FK를 먼저 복원해야 하므로 Supabase 공식 복구 절차 또는 지원을 사용하고, 임의 UUID 재생성으로 맞추지 않는다.

전용 recovery Supabase/Preview와 A/B 테스트 계정을 준비한다. 운영 폴더의 `.vercel/project.json`을 다른 project로 relink하거나 Preview env를 recovery 값으로 바꾸지 않는다. 권장 경로는 **같은 동결 소스의 별도 깨끗한 작업 복사본 + 전용 recovery Vercel project**다. 복사본에는 이름이 `.env`로 시작하는 파일 전체, `.vercel`, `.next`, `node_modules`, `supabase/.temp`, `.omc`를 가져오지 않고 소스 바이트는 수정하지 않는다. 그 복사본에서 `npm ci` 후 recovery Supabase URL/browser key/server key와 동일한 공개 운영자명·지원메일·signup=false를 새 `.env.local`에 넣고 다음 순서로 recovery Preview를 만든다.

```powershell
$recoveryRef = "RECOVERY_PROJECT_REF_20_CHARS"
npm run supabase:login
npm run supabase:link -- --project-ref $recoveryRef  # 이 recovery 복사본만 연결
npm run vercel:login
npm run vercel:link  # 전용 recovery Vercel project 선택
$recoveryVercel = Get-Content .vercel/project.json -Raw | ConvertFrom-Json
$env:ILGAMCHECK_VERCEL_ENV_PUSH_ACK = "PUSH_HOSTED_ENV_TO_PREVIEW_$($recoveryVercel.projectId)"
npm run vercel:env:push:preview
Remove-Item Env:ILGAMCHECK_VERCEL_ENV_PUSH_ACK
npm run vercel:preview
```

`vercel:env:push:preview`는 위 recovery 복사본의 `supabase/.temp/project-ref`와 `.env.local`의 recovery URL이 같은 프로젝트인지 먼저 검사한다. 이렇게 만든 READY URL만 `ILGAMCHECK_RECOVERY_DEPLOYMENT_URL`로 쓴다. recovery 복사본과 Vercel project에는 운영 service-role/운영 Supabase URL을 넣지 않는다. production 폴더의 Supabase/Vercel link·Production env·deployment는 이 훈련에서 변경하지 않는다.

복구 Preview를 만든 뒤에는 **기존 production Supabase ref가 연결된 원래 앱 폴더**로 돌아온다. 검증은 그 폴더의 `.env.local`을 덮어쓰지 말고 별도 PowerShell 세션의 환경값으로 recovery runtime을 가리킨다. wrapper는 원래 폴더의 `supabase/.temp/project-ref`를 로그인 계정·Seoul region과 다시 확인하고, 이것이 `ILGAMCHECK_PRODUCTION_PROJECT_REF`와 정확히 같고 recovery ref와 다른 경우에만 진행한다. 다음 값이 모두 필요하며 `SUPABASE_SERVICE_ROLE_KEY`는 복원 **검증** 자식에 전달하지 않는다.

```powershell
Set-Location "C:\ABSOLUTE\PATH\TO\PRODUCTION_LINKED\01_일감체크\app"
$env:NEXT_PUBLIC_STORAGE_MODE="hosted"
$env:NEXT_PUBLIC_SUPABASE_URL="https://RECOVERY_PROJECT_REF.supabase.co"
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY="RECOVERY_BROWSER_SAFE_KEY"
$env:NEXT_PUBLIC_OPERATOR_NAME="현재 공개 운영자명"
$env:NEXT_PUBLIC_SUPPORT_EMAIL="support@YOUR_DOMAIN"
$env:NEXT_PUBLIC_BETA_SIGNUP_ENABLED="false"
$env:ILGAMCHECK_TEST_A_EMAIL="recovery-a@example.com"
$env:ILGAMCHECK_TEST_A_PASSWORD="RECOVERY_A_PASSWORD"
$env:ILGAMCHECK_TEST_B_EMAIL="recovery-b@example.com"
$env:ILGAMCHECK_TEST_B_PASSWORD="RECOVERY_B_PASSWORD"
$env:ILGAMCHECK_HOSTED_VERIFY_ACK="OVERWRITE_DEDICATED_TEST_DATA"
$env:ILGAMCHECK_PRODUCTION_PROJECT_REF="PRODUCTION_REF_20_CHARS"
$env:ILGAMCHECK_RECOVERY_PROJECT_REF="DIFFERENT_RECOVERY_REF_20_CHARS"
$env:ILGAMCHECK_RECOVERY_DEPLOYMENT_URL="https://RECOVERY_PREVIEW_ORIGIN"
$env:ILGAMCHECK_RECOVERY_VERIFY_ACK="VERIFY_DEDICATED_RECOVERY_PROJECT"
npm run supabase:restore:verify:dry
# 실제 관리 백업/PITR 복원과 수동 건수 대조를 끝낸 뒤
npm run supabase:restore:verify
```

guard는 두 ref가 모두 유효하고 서로 다름을 먼저 강제하고, `NEXT_PUBLIC_SUPABASE_URL`과 recovery ref도 일치시킨다. 그 뒤 recovery `/api/health`의 실제 Supabase ref·public config digest·DB contract, RLS·공개 수정·Realtime 계약을 확인한다. 복원 자체와 과거 Auth UUID·건수 일치도를 대신 증명하지 않는다. recovery 프로젝트가 없으면 `BLOCKED_EXTERNAL`로 실패하는 것이 정상이다.

## 9. 운영 승인 체크리스트

- [ ] 로컬 test/lint/typecheck/build/E2E/audit가 통과했다.
- [ ] migration 001·002·003·004·005·006이 순서대로 적용되고 runtime·policy publication contract가 배포 manifest와 일치한다.
- [ ] Auth Site URL/정확한 `/auth/reset` 1개/원격 전체 신규 가입 OFF·이메일 로그인 ON이 config push·Management API readback·Dashboard에서 일치한다.
- [ ] `beta:invite`로 받은 초대 링크가 `/auth/reset`을 열고, 비밀번호 설정·재로그인이 성공한다.
- [ ] SMTP Return-Path domain의 SPF 1개·From domain의 모든 DKIM key·DMARC 정책, 외부 사업자 2곳 invite/reset pass, 최종-domain landing, controlled bounce/suppression 수동 증거가 있고 `check:external-beta`가 통과했다.
- [ ] 저장소 밖 운영 evidence에 확정 정책·국외 이전 고지, 실제 탈퇴 cascade, 관리 백업/PITR·recovery 복원 결과가 있고 `operational:evidence:verify`가 통과했다.
- [ ] 계정 A/B 교차 노출이 없다.
- [ ] 작업공간·런타임 table 직접 DML은 막히고 허용 RPC만 성공한다.
- [ ] 다른 기기의 공개 수정 링크·Realtime·완료 후 차단을 확인했다.
- [ ] Vercel Preview와 최종 도메인에서 보안 헤더를 확인했다.
- [ ] 관리 백업과 별도 recovery 복원 훈련을 확인했다.
- [ ] 장애 담당자, Vercel 롤백, 공개 RPC 긴급 차단 권한을 확인했다.
- [ ] 개인정보처리방침·이용약관·보존/삭제 정책을 운영 주체가 확정했고 manifest `finalized=true`·새 DB migration·배포 health digest가 일치한다.

## 10. BLOCKED_EXTERNAL / 미구현

| 항목 | 분류 | 운영 전 필요한 것 |
|---|---|---|
| 실제 Hosted A/B·다른 기기 테스트 | **BLOCKED_EXTERNAL** | 창업자 Supabase 프로젝트·테스트 계정·Preview URL |
| 예약 Web Push | **BLOCKED_EXTERNAL + 미구현** | FCM/VAPID, 암호화 구독, Edge Function, Cron, retry/dedupe, 실기기 |
| SMTP 전달성 | **검사 구현 / BLOCKED_EXTERNAL** | `SMTP-RUNBOOK.md`와 DNS/evidence/통합 gate는 구현; 창업자 도메인·SMTP 자격증명·외부 2개 사업자 수신·반송 증거 필요 |
| 실결제·구독 | **BLOCKED_EXTERNAL + 미구현** | PG 계약/심사, 서버 checkout, 서명 검증 webhook, idempotency, 환불, 서버 entitlement |
| local → Hosted 데이터 가져오기 | **일부 구현** | 비밀 공개링크 토큰을 제외한 JSON 내보내기는 구현; import·owner 귀속 검증은 미구현 |
| 데이터 내보내기 | **구현** | 설정에서 비밀 공개링크 토큰을 제외한 JSON 다운로드 가능; 재가져오기는 지원하지 않음 |
| 계정 탈퇴 | **코드 구현 / BLOCKED_EXTERNAL 검증** | 재인증·server-only admin 삭제·cascade를 실제 Preview에서 확인 |
| 저장 receipt 보존·정리 | **구현** | 30일 경과 receipt를 다음 저장 때 batch 정리; 유휴 데이터는 service-role cleanup 실행·용량 모니터링 |
| 관리 백업·복원 | **BLOCKED_EXTERNAL** | wrapper는 public logical dump만 생성; Supabase 관리 백업/PITR와 별도 recovery 실증 필요 |

도메인을 가져오는 것만으로는 위 항목이 자동 해결되지 않는다. 다만 현재 MVP의 로그인·계정별 저장·공개 수정 접수는 Supabase 프로젝트와 Vercel env를 연결하고 이 문서의 실증을 통과하면 사용할 수 있다.
