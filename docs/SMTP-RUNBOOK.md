# SMTP 외부 베타 게이트

이 문서는 특정 메일 사업자에 종속되지 않는 custom SMTP 준비 절차다. 저장소의 검사는 공개 DNS와 운영자가 수동 수집한 최소 증거를 확인할 뿐, SMTP 사업자 설정이나 실제 전달을 대신하지 않는다. 발신 DNS 전파 전에는 `smtp:dns:verify`가, 최종 도메인·수동 evidence 전에는 `check:external-beta`가 실패하는 것이 정상이다.

## 1. 비밀값 경계

- SMTP host/port/user/password와 사업자 API key는 비밀번호 관리자와 Supabase Authentication의 custom SMTP 설정에만 둔다.
- SMTP password, 수신 이메일 주소, 받은 메일 원문, `Authentication-Results` 원문, 초대·재설정 URL과 token은 Git, `.env.hosted.example`, Vercel `NEXT_PUBLIC_*`, evidence JSON, 명령 로그에 넣지 않는다.
- evidence에는 provider label, 수신 **domain**, UTC timestamp, Message-ID, 구조화된 `spf/dkim/dmarc=pass`, 최종 landing origin/path만 기록한다.
- `ILGAMCHECK_SMTP_EVIDENCE_PATH`는 저장소 밖 JSON 절대 경로여야 한다. 별도 암호화 운영 폴더에 보관하고 접근 권한을 제한한다.

## 2. 최종 도메인과 DNS

1. 최종 앱 origin과 발신 주소를 정한다. 예: 앱 `https://ilgamcheck.kr`, From `no-reply@mail.ilgamcheck.kr`.
2. SMTP 사업자가 현재 계정에 제시한 SPF/DKIM/Return-Path 레코드를 그대로 DNS에 넣는다. 문서의 예시 값을 복사하지 않는다.
3. SMTP 사업자가 지정한 envelope MAIL FROM/Return-Path domain의 SPF TXT는 `v=spf1` 레코드가 정확히 하나여야 한다. 화면에 보이는 From/DKIM domain과 다를 수 있으므로 추측해서 합치지 않는다. 기존 SPF가 있으면 사업자 지침에 따라 include를 합치고 두 개를 만들지 않는다. `+all`은 금지한다.
4. 사업자가 발급한 모든 DKIM selector의 `selector._domainkey.FROM_DOMAIN` TXT 또는 CNAME이 실제 public key로 해석되는지 확인한다.
5. 조직 domain의 `_dmarc` TXT에 `v=DMARC1; p=none|quarantine|reject`를 둔다. 처음에는 보고서를 확인하고, 운영 위험을 검토해 `quarantine`/`reject`로 강화한다.

`.env.local` 또는 실행 셸에 공개 DNS 검사값만 둔다. IDN은 ASCII punycode로 입력한다. Preview A/B 초대 전에 레코드를 게시해 전달을 확인하고, 최종 production/Auth 전환 뒤 같은 검사를 다시 실행한다.

```dotenv
ILGAMCHECK_FINAL_ORIGIN=https://YOUR_FINAL_DOMAIN
ILGAMCHECK_SMTP_FROM_DOMAIN=mail.YOUR_FINAL_DOMAIN
ILGAMCHECK_SMTP_RETURN_PATH_DOMAIN=bounce.YOUR_FINAL_DOMAIN
ILGAMCHECK_SMTP_DMARC_DOMAIN=YOUR_FINAL_DOMAIN
ILGAMCHECK_SMTP_DKIM_SELECTORS=selector1,selector2
ILGAMCHECK_SMTP_EVIDENCE_PATH=C:\ABSOLUTE\PATH\OUTSIDE_REPOSITORY\smtp-evidence.json
```

## 3. Preview A/B 준비 → Production 최종 검증 순서

### 3.1 Preview에서 전용 A/B만 준비

Preview deployment와 Preview Auth origin readback을 먼저 끝낸다. 그 뒤 Supabase Dashboard → Authentication → SMTP Settings에서 창업자 소유 custom SMTP를 활성화하고 사업자가 준 host/port/username/password, 실제 From address, sender name을 입력한다. 발신·Return-Path DNS를 게시하고 `npm run smtp:dns:verify`를 통과시킨 다음, 운영자가 통제하는 전용 A/B 사서함만 `beta:invite`로 초대해 Preview `/auth/reset` 도착·비밀번호 설정·재로그인을 확인한다. 실제 베타 사용자는 아직 초대하지 않는다. 이 Preview 전달은 최종 도메인 evidence가 아니므로 evidence JSON에 최종 통과로 기록하지 않는다.

### 3.2 Production → 최종 Auth → SMTP evidence

Preview A/B 격리가 통과하고 최종 도메인이 정해지면 `.env.local`의 `SUPABASE_AUTH_SITE_URL=https://YOUR_FINAL_DOMAIN`과 공개 지원 이메일 등 Hosted 값을 준비한다. 아직 최종 production deployment가 없는데 Auth push guard를 먼저 실행하는 순환을 만들지 않는다. 순서는 `production env push → alias 없는 현재 지문 production deploy → identity/target 검증 후 wrapper promotion → 최종 도메인 READY/health → Auth push/readback → custom SMTP/DNS 재확인 → smoke/evidence`다.

```powershell
$vercel = Get-Content .vercel/project.json -Raw | ConvertFrom-Json
$env:ILGAMCHECK_VERCEL_ENV_PUSH_ACK = "PUSH_HOSTED_ENV_TO_PRODUCTION_$($vercel.projectId)"
npm run vercel:env:push:production
Remove-Item Env:ILGAMCHECK_VERCEL_ENV_PUSH_ACK
npm run vercel:production
# Vercel에서 최종 도메인 alias, READY deployment, 유효한 인증서를 확인한 뒤
curl.exe -I https://YOUR_FINAL_DOMAIN
curl.exe https://YOUR_FINAL_DOMAIN/api/health

$ref = (Get-Content supabase/.temp/project-ref -Raw).Trim()
$env:ILGAMCHECK_AUTH_CONFIG_PUSH_ACK = "PUSH_CLOSED_BETA_AUTH_CONFIG_TO_$ref"
npm run supabase:config:push
Remove-Item Env:ILGAMCHECK_AUTH_CONFIG_PUSH_ACK
$securePat = Read-Host "auth_config_read 권한 Supabase access token" -AsSecureString
$patPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePat)
try { $env:SUPABASE_ACCESS_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($patPointer) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($patPointer); $securePat = $null }
npm run supabase:auth:readback
npm run status:domain-ready
Remove-Item Env:SUPABASE_ACCESS_TOKEN
npm run smtp:dns:verify
npm run smoke:remote -- https://YOUR_FINAL_DOMAIN
```

Vercel wrapper는 deploy 전후 현재 소스 지문을 비교하고, `status:domain-ready`는 linked Supabase ref·앱 URL ref·로그인 계정의 Seoul 프로젝트, 최종 origin의 linked Vercel project/team/READY deployment, 배포 `/api/health`의 linked Supabase ref·현재 DB contract, Management API의 현재 Site URL·정확한 `/auth/reset` 1개·전체 신규 가입 OFF·이메일 로그인 ON을 재확인한다. release fingerprint 메타는 client-side consistency assertion이지 Vercel이 서명한 암호학적 원격 attestation은 아니다. deploy 중 소스가 바뀌면 이미 생성된 deployment를 신뢰하지 말고 재배포한다. Vercel CLI 자식에는 저장된 login용 최소 OS/config 환경만 전달되고 부모의 Vercel token·Supabase 비밀·테스트 비밀번호는 상속되지 않는다. access token은 현재 셸에만 두고 즉시 제거한다.

Preview에서 연결한 custom SMTP의 활성 상태와 From/Return-Path를 Dashboard에서 다시 교차 확인한다. 사업자나 값을 바꾸었다면 secret manager/CI의 server-only 경계로만 갱신하고 요청/응답 본문을 로그에 남기지 않는다. `external_email_enabled=true` readback은 이메일 로그인 provider ON만 뜻하며 custom SMTP 활성화나 전달 성공을 증명하지 않는다. `npm run smtp:dns:verify`는 Node `dns/promises` resolver로 공개 TXT/CNAME만 읽고 shell이나 DNS 변경 API를 호출하지 않는다. SMTP password는 Vercel runtime에 필요하지 않다. 최종 전달·반송 증거는 다음 장에서 수집한다.

## 4. 수동 전달·반송 증거

custom SMTP 활성화, 공개 DNS 확인, 최종 Auth origin readback과 정책 승인이 끝난 뒤에만 이 절차를 시작한다. 최종 origin으로 발송된 invite 증거를 남기기 위해 운영자가 통제하는 서로 다른 외부 사서함 두 곳에 새 전용 검증 계정을 `beta:invite`로 만들고, 이후 이 두 계정을 최종 A/B 검증 계정으로 사용한다. Preview A/B 계정의 과거 Preview 링크를 최종 evidence로 재사용하지 않는다. 여기서 얻은 증거로 5장의 최종 게이트를 통과하기 전에는 실제 베타 사용자를 초대하지 않는다.

서로 다른 외부 메일 사업자 두 곳(수신 domain도 서로 다름)에서 아래를 각각 확인한다.

- 폐쇄 베타 invite 수신, Message-ID, header 판정 `spf=pass`, `dkim=pass`, `dmarc=pass`
- 비밀번호 reset 수신, 서로 다른 Message-ID, 같은 3개 pass
- 링크를 열었을 때 최종 `https://YOUR_FINAL_DOMAIN/auth/reset`에 도착하고 비밀번호 설정·재로그인이 성공

SMTP 사업자가 제공하는 sandbox/전용 bounce 주소 등 통제된 방법으로 hard bounce를 한 건 만들고, event와 suppression 등록을 확인한다. 임의의 실제 주소로 반송을 유발하지 않는다. suppression을 해제하거나 재발송하기 전에는 사업자 정책을 따른다.

아래 구조만 저장소 밖 JSON에 수동 기록한다. 실제 수신 주소, header 원문, URL query, token, SMTP secret을 추가하면 verifier가 schema 오류로 거절한다. 모든 시각은 실행 시점 기준 7일 안의 UTC여야 한다.

```json
{
  "schemaVersion": 2,
  "verifiedAt": "2026-08-17T04:00:00.000Z",
  "finalOrigin": "https://YOUR_FINAL_DOMAIN",
  "fromDomain": "mail.YOUR_FINAL_DOMAIN",
  "returnPathDomain": "bounce.YOUR_FINAL_DOMAIN",
  "dmarcDomain": "YOUR_FINAL_DOMAIN",
  "mailboxes": [
    {
      "provider": "provider-a",
      "recipientDomain": "mailbox-a.example-provider",
      "invite": {
        "receivedAt": "2026-08-17T03:40:00.000Z",
        "messageId": "<UNIQUE-INVITE-ID@SENDER-DOMAIN>",
        "authenticationResults": { "spf": "pass", "dkim": "pass", "dmarc": "pass" },
        "landingOrigin": "https://YOUR_FINAL_DOMAIN",
        "landingPath": "/auth/reset"
      },
      "reset": {
        "receivedAt": "2026-08-17T03:45:00.000Z",
        "messageId": "<UNIQUE-RESET-ID@SENDER-DOMAIN>",
        "authenticationResults": { "spf": "pass", "dkim": "pass", "dmarc": "pass" },
        "landingOrigin": "https://YOUR_FINAL_DOMAIN",
        "landingPath": "/auth/reset"
      }
    },
    {
      "provider": "provider-b",
      "recipientDomain": "mailbox-b.example-provider",
      "invite": {
        "receivedAt": "2026-08-17T03:50:00.000Z",
        "messageId": "<SECOND-INVITE-ID@SENDER-DOMAIN>",
        "authenticationResults": { "spf": "pass", "dkim": "pass", "dmarc": "pass" },
        "landingOrigin": "https://YOUR_FINAL_DOMAIN",
        "landingPath": "/auth/reset"
      },
      "reset": {
        "receivedAt": "2026-08-17T03:55:00.000Z",
        "messageId": "<SECOND-RESET-ID@SENDER-DOMAIN>",
        "authenticationResults": { "spf": "pass", "dkim": "pass", "dmarc": "pass" },
        "landingOrigin": "https://YOUR_FINAL_DOMAIN",
        "landingPath": "/auth/reset"
      }
    }
  ],
  "bounce": {
    "testedAt": "2026-08-17T03:30:00.000Z",
    "messageId": "<CONTROLLED-BOUNCE-ID@SENDER-DOMAIN>",
    "method": "provider-sandbox",
    "event": "hard_bounce",
    "suppressionConfirmed": true,
    "suppressionConfirmedAt": "2026-08-17T03:35:00.000Z"
  }
}
```

`provider`, domain, timestamp, Message-ID와 pass 값은 받은 메일/사업자 화면을 보고 사람이 옮긴 **수동 증거**다. 이 JSON은 메일 사업자의 서명된 독립 보증이 아니며, 운영 캡처/티켓은 별도 보존한다.

```powershell
npm run smtp:evidence:verify
```

## 5. 외부 베타 최종 게이트

전용 A/B 테스트 계정과 기존 Hosted 검증 환경을 준비한다. 마지막 단계인 `verify:hosted`는 A 계정 작업공간을 fixture로 덮어쓰므로 운영 계정을 쓰지 않는다. wrapper는 기존 파괴적 동의값을 만들거나 우회하지 않는다.

```powershell
$securePat = Read-Host "auth_config_read 권한 Supabase access token" -AsSecureString
$patPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePat)
try { $env:SUPABASE_ACCESS_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($patPointer) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($patPointer); $securePat = $null }
$env:ILGAMCHECK_HOSTED_VERIFY_ACK="OVERWRITE_DEDICATED_TEST_DATA"
npm run check:external-beta
Remove-Item Env:SUPABASE_ACCESS_TOKEN
Remove-Item Env:ILGAMCHECK_HOSTED_VERIFY_ACK
```

실행 순서는 fail-fast로 고정돼 있다.

1. Supabase/Vercel 현재 대상·DB contract·Auth config readback
2. 정책·탈퇴·backup/recovery 운영 evidence
3. deploy preflight
4. 실제 SMTP public DNS
5. 저장소 밖 SMTP 수동 evidence
6. 최종 도메인 remote smoke
7. 기존 Hosted A/B destructive verification

어느 한 단계라도 실패하면 **실제 베타 사용자** 초대를 중단한다. 통제된 증거 사서함/A·B 계정은 이 게이트를 만들기 위한 사전 검증 대상이며 베타 사용자가 아니다. 게이트 통과 후에도 실제 발송률·bounce·complaint·suppression을 SMTP 사업자에서 계속 모니터링한다.
