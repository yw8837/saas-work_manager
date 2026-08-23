# 외부 베타 운영 evidence

`check:external-beta`는 법률·국외 이전 고지, 실제 계정 탈퇴, 관리 백업·복원 훈련을 실행 대신 추측하지 않는다. 운영자가 실제 절차를 마친 뒤 저장소 밖 암호화 폴더에 아래 최소 기록을 남겨야 다음 단계로 진행한다. verifier는 **schema·현재 공개 정책 manifest·현재 설정과의 일치·30일 최신성만 확인**하며 법률적 충분성이나 기록의 진실성을 대신 증명하지 않는다.

`src/lib/policy-publication-manifest.json`이 privacy/terms 공개 본문·버전·본문 digest·bundle digest·`finalized`의 단일 소스다. 현재 저장소의 `finalized=false`는 법률·운영 값이 아직 확정되지 않았다는 의미이며, 이 상태에서 evidence를 `true`로 쓰면 안 된다. `policyBundleDigest`는 **공개할 정책 정적 본문과 버전만** 묶는다. 운영자명·지원 이메일·사용자/고객 정보·비밀값은 manifest에 넣거나 hash하지 않는다.

## 저장 위치

```powershell
$env:ILGAMCHECK_OPERATIONAL_EVIDENCE_PATH = "D:\EncryptedOps\ilgamcheck\operational-evidence.json"
```

- 절대 경로의 JSON 파일만 허용한다.
- 저장소 내부, 이메일/고객명, access token, 비밀번호, 원문 로그·메일 header는 금지한다.
- `NEXT_PUBLIC_OPERATOR_NAME`, `NEXT_PUBLIC_SUPPORT_EMAIL`, `ILGAMCHECK_FINAL_ORIGIN`은 현재 배포 설정과 같아야 한다.

## schema

```json
{
  "schemaVersion": 2,
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
    "recentPasswordAmrVerified": true,
    "authUserDeletionVerified": true,
    "cascadeVerified": true
  },
  "backupRecovery": {
    "testedAt": "2026-08-17T02:00:00.000Z",
    "runtimeContract": "202608230008",
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

```powershell
npm run operational:evidence:verify
$securePat = Read-Host "auth_config_read 권한 Supabase access token" -AsSecureString
$patPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePat)
try { $env:SUPABASE_ACCESS_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($patPointer) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($patPointer); $securePat = $null }
npm run check:external-beta
Remove-Item Env:SUPABASE_ACCESS_TOKEN
```

검증을 통과하려고 사실과 다른 값을 기록하면 안 된다. 어느 항목이든 실제 완료 전이면 `false`로 남기고 외부 테스터 초대를 중단한다.
