# 외부 베타 운영 evidence

`check:external-beta`는 법률·국외 이전 고지, 실제 계정 탈퇴, 관리 백업·복원 훈련을 실행 대신 추측하지 않는다. 운영자가 실제 절차를 마친 뒤 저장소 밖 암호화 폴더에 아래 최소 기록을 남겨야 다음 단계로 진행한다. verifier는 **schema·현재 공개 정책 manifest·현재 설정과의 일치·30일 최신성만 확인**하며 법률적 충분성이나 기록의 진실성을 대신 증명하지 않는다.

`src/lib/policy-publication-manifest.json`이 privacy/terms 공개 본문·버전·본문 digest·bundle digest·`finalized`의 단일 소스다. 현재 저장소의 `finalized=false`는 법률·운영 값이 아직 확정되지 않았다는 의미이며, 이 상태에서 evidence를 `true`로 쓰면 안 된다. 문서 digest는 해당 정적 문서의 본문·버전·표시 메타데이터를 묶고, bundle digest는 문서들과 공통 정적 문구·schemaVersion·effectiveDate·finalized까지 포함한다. 따라서 finalized만 바꿔도 bundle digest와 DB 정책 계약을 함께 갱신해야 한다. 운영자명·지원 이메일·사용자/고객 정보·비밀값은 manifest에 넣거나 hash하지 않는다.

## 저장 위치

```powershell
$env:ILGAMCHECK_OPERATIONAL_EVIDENCE_PATH = "D:\EncryptedOps\ilgamcheck\operational-evidence.json"
```

- 절대 경로의 JSON 파일만 허용한다.
- 저장소 내부, 이메일/고객명, access token, 비밀번호, 원문 로그·메일 header는 금지한다.
- `NEXT_PUBLIC_OPERATOR_NAME`, `NEXT_PUBLIC_SUPPORT_EMAIL`, `ILGAMCHECK_FINAL_ORIGIN`은 현재 배포 설정과 같아야 한다.

## schema

현재 Sites/Google-only 운영은 `ILGAMCHECK_AUTH_MODE=google-only`와 아래 schema 3을 사용한다. 과거 schema 2의 `recentPasswordAmrVerified` 증거는 Google-only 탈퇴 검증으로 인정하지 않는다. schema 2는 기존 password 경로에만 남긴다.

```json
{
  "schemaVersion": 3,
  "recordedAt": "2026-08-17T02:00:00.000Z",
  "finalOrigin": "https://YOUR_FINAL_DOMAIN",
  "operatorName": "ACTUAL_PUBLIC_OPERATOR_NAME",
  "supportEmail": "support@YOUR_FINAL_DOMAIN",
  "policy": {
    "reviewedAt": "2026-08-17T02:00:00.000Z",
    "publicationFinalized": true,
    "policyBundleDigest": "sha256:EXACT_FINAL_MANIFEST_BUNDLE_DIGEST",
    "termsVersion": "EXACT_FINAL_MANIFEST_TERMS_VERSION",
    "privacyVersion": "EXACT_FINAL_MANIFEST_PRIVACY_VERSION",
    "privacyTermsPublished": true,
    "overseasTransferNoticeFinalized": true,
    "legalReviewCompleted": true,
    "closedBetaApproved": true
  },
  "accountDeletion": {
    "testedAt": "2026-08-17T02:00:00.000Z",
    "testedOrigin": "https://YOUR_FINAL_DOMAIN",
    "authMethod": "google-oauth",
    "recentOAuthAmrVerified": true,
    "googleProviderVerified": true,
    "staleAuthenticationRejected": true,
    "wrongProviderRejected": true,
    "authUserDeletionVerified": true,
    "cascadeVerified": true
  },
  "backupRecovery": {
    "testedAt": "2026-08-17T02:00:00.000Z",
    "runtimeContract": "202608250011",
    "managedBackupOrPitrVerified": true,
    "logicalManifestVerified": true,
    "recoveryRestoreCompleted": true,
    "authLoginVerified": true,
    "abIsolationVerified": true,
    "historicalDataCompared": true
  }
}
```

위 `EXACT_FINAL_MANIFEST_*`는 문서용 placeholder다. 그대로는 verifier를 통과하지 않는다. 법률 검토를 마친 실제 본문으로 manifest를 바꾸고 `node scripts/policy-publication-manifest.mjs --print-digests`로 계산한 값을 manifest에 기록한 뒤 `npm run policy:manifest:verify`가 PASS해야 한다. 그 값과 버전을 반환하는 **새 timestamp Supabase migration**을 추가하고 원격 DB에 적용한 뒤에만 이 evidence를 작성한다. 이미 적용된 `202608170006_policy_publication_contract.sql`을 수정하면 안 된다.

## 실행

위 JSON은 완료 기록이 아닌 형식 예시다. Google 탈퇴 기록은 실제 서버가 확인한 사용자/Google 제공자와 5분 이내 `oauth` AMR로 탈퇴 성공, 오래된 OAuth·password/다른 제공자의 거부, Auth 삭제·cascade를 실제로 확인한 뒤 작성한다. 토큰 갱신 시각을 OAuth 재인증 시각으로 대신하지 않는다. 단위테스트 통과는 실제 운영 탈퇴 증거가 아니다.

```powershell
$env:ILGAMCHECK_RELEASE_PLATFORM = "sites"
$env:ILGAMCHECK_AUTH_MODE = "google-only"
npm run operational:evidence:verify
$securePat = Read-Host "auth_config_read 권한 Supabase access token" -AsSecureString
$patPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePat)
try { $env:SUPABASE_ACCESS_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($patPointer) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($patPointer); $securePat = $null }
npm run check:external-beta
Remove-Item Env:SUPABASE_ACCESS_TOKEN
```

검증을 통과하려고 사실과 다른 값을 기록하면 안 된다. 어느 항목이든 실제 완료 전이면 `false`로 남기고 외부 테스터 초대를 중단한다.

## Sites source/release identity 입력

Sites 경로는 Vercel, 커스텀 SMTP, 이메일/비밀번호를 요구하지 않는다. Google A/B 전용 계정은 `ILGAMCHECK_TEST_A_ACCESS_TOKEN`/`ILGAMCHECK_TEST_A_REFRESH_TOKEN`, B도 같은 두 변수를 사용하며 hosted 검증 단계에만 전달한다. 파괴적 검증의 shell `ILGAMCHECK_HOSTED_VERIFY_ACK`는 계속 필요하며 자동 생성하지 않는다.

Auth readback은 `NEXT_PUBLIC_SUPABASE_URL`의 실제 runtime project ref와 `supabase/.temp/project-ref`가 정확히 같은지 먼저 확인한다. 다른 프로젝트가 같은 Site URL/Google-only 설정을 가졌더라도 대신 검사하지 않으며, ref 불일치는 관리 API 요청 전에 차단한다.

Sites identity는 저장소 밖 `ILGAMCHECK_SITES_RECEIPT_PATH`(초기), `ILGAMCHECK_SITES_FINAL_RECEIPT_PATH`(최종)와 `ILGAMCHECK_SITES_ARCHIVE_PATH`(tar), 공개 기대값 `ILGAMCHECK_SITES_PROJECT_ID`/`ILGAMCHECK_SITES_SOURCE_COMMIT`를 요구한다. receipt는 trusted connector의 읽기 전용 조회 결과에서 다음 공개 필드만 옮긴 JSON이다. 토큰·provider credentials·환경변수 원문은 넣지 않는다.

```text
capturedAt: 실제 조회 UTC timestamp
site: id, current_live_url, status, access_mode, latest_version_number
version: id, project_id, version_number, source.commit_sha,
         archive_storage.content_hash, deployment_id
deployment: id, project_id, version_id, type, status, env_set_revision
```

verifier는 active/public custom domain, source SHA, version/deployment binding, succeeded publish, 환경 revision, 전체 tar의 provider SHA256 및 tar의 공개 JS/CSS와 live 바이트 일치를 확인한다. 초기·최종 identity의 모든 binding 필드가 같아야 하며, 최종 receipt는 최종 checkpoint 시작 이후 다시 조회한 5분 이내 결과여야 한다. 최종 단계는 stderr로 안내한 뒤 최대 60초 동안 새 final receipt를 기다린다. 이때 운영자/별도 read-only 조회 과정이 trusted connector로 site/version/deployment를 다시 읽어 final JSON을 갱신한다. 같은 예전 JSON 재사용은 허용하지 않는다. fresh final receipt를 공급하지 않으면 gate는 BLOCKED로 끝나며 초기 snapshot/단위테스트를 운영 release PASS로 바꾸지 않는다.

receipt의 출처/기록 진실성은 trusted connector 조회를 수행한 운영자가 보장해야 한다. 이 도구가 provider 인증을 대체하거나 tar가 그 source SHA로 재현 빌드되었음을 독립 증명하지는 않는다. Sites API에 현재 live version pointer가 없으므로 성공한 publish metadata와 live client 바이트를 묶은 증거이며, 실제 Worker 실행 바이트를 네트워크로 직접 읽었다는 의미도 아니다. 운영 readiness는 finalized 정책·탈퇴·복구 증거가 별도 통과하기 전까지 미완료다.
