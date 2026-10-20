# 일감체크 Android·iPhone 연동 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 웹 계정·일감을 공유하고 수정 요청 알림을 받는 Android APK와 iPhone 테스트 앱을 만든다.

**Architecture:** React 업무 화면과 Supabase 저장·권한·중복 방지 로직은 공유한다. 네이티브 인증·암호화 저장소·앱 생명주기·푸시는 작은 플랫폼 어댑터로 분리한다. 서버가 수정 요청을 확정한 뒤 발송 대기 기록을 만들고, 푸시는 상태 변경 없이 알림만 전달한다.

**Tech Stack:** 저장소 최신 main의 React/Vite/TypeScript, Capacitor 8, Supabase, Android Java/Keystore, iOS Swift/Keychain, FCM 및 APNs.

**Spec:** `docs/superpowers/specs/2026-10-20-android-linked-mvp-design.md` — Android 승인 후 사용자 요청으로 iPhone 범위를 추가한 문서.

## Global Constraints

- 앱 ID는 양쪽 모두 `com.yeolmaestudio.ilgamcheck`, 이름은 `일감체크`.
- 앱 복귀 URI는 `com.yeolmaestudio.ilgamcheck://auth/callback`으로 한정한다.
- 별도 앱 DB·크몽 주문 수집·요금 변경·광고 SDK·정식 스토어 출시는 범위 밖이다.
- 현재 모집 후보에게 이메일·쪽지·TestFlight 초대 등 어떤 연락도 하지 않는다.
- APK는 Android 설치본이며, iPhone은 Mac/Xcode 서명과 TestFlight 처리·설치를 별도로 검증한다.
- iOS 추가 범위와 이 계획에 대한 사용자 검토 및 실행 방식 선택 전 제품 코드·의존성 설치를 시작하지 않는다.
- 현재 D 저장소의 사용자 문서 변경·미추적 자료를 보존한다. 최신 main을 기반으로 작업하되 reset·stash·일괄 삭제하지 않는다.
- 현재 `.git/index.lock`은 2026-09-28 생성, 읽기 확인 시 Git 프로세스는 발견되지 않았다. 잠금을 임의 삭제하지 않았고 설계 커밋은 실패했다. 실행 전 잠금 소유 여부를 확인한다.
- Next.js 관련 코드 수정 전 해당 체크아웃의 `node_modules/next/dist/docs/`에서 관련 가이드를 읽는다.
- public env만 앱에 포함한다. service-role 키·FCM/APNs 서버키·앱 서명키는 앱 번들·Git·보고서에 기록하지 않는다.

## Review Focus

1. 로그인 도중 앱 재시작·두 번 탭·재전송 callback: 한 번만 세션을 만들고 잘못된 계정으로 바꾸지 않는다. Task 1~2에서 시험한다.
2. 저장 중 다른 기기가 변경하고 앱이 재개됨: 로컬 초안을 잃거나 원격 최신본을 덮어쓰지 않는다. Task 3에서 시험한다.
3. 계정 A의 푸시가 로그아웃·B 로그인 이후 도착: A 데이터가 열리거나 토큰이 B로 잘못 연결되지 않는다. Task 4~5에서 시험한다.
4. FCM 접수 뒤 서버 재시도·앱 강제 종료: 중복 횟수 반영이 없고 재시작 재조회로 복구한다. Task 4~5에서 시험한다.
5. iPhone 비공개 이메일·Keychain 재설치 잔존·삭제 재인증: 동일인 추측 병합 없이 계정을 격리하고 삭제 기능이 막히지 않는다. Task 1~2에서 시험한다.

## 파일과 책임

| 파일/영역 | 책임 |
| --- | --- |
| `src/lib/native/platform.ts` | 웹/Android/iOS 구분 및 허용한 API origin |
| `src/lib/native/secure-storage.ts` | Supabase가 사용할 비동기 저장 인터페이스 |
| `src/lib/native/auth.ts` | PKCE 시작·복귀·취소·중복 방지 |
| `src/lib/native/lifecycle.ts` | 앱 재개·online 이벤트 등록과 해제 |
| `src/lib/native/push.ts` | 권한·토큰·알림 탭의 앱 측 처리 |
| `src/lib/native/bridge.ts` | 네이티브 기능 인터페이스. 비즈니스 규칙은 넣지 않음 |
| `src/components/workspace-provider.tsx` | 기존 저장/충돌 로직에 인증·재개 어댑터 연결 |
| `src/components/workspace-auth-gate.tsx` | 플랫폼별 로그인 상태·취소·실패 표시 |
| `src/components/settings-panel.tsx` | 알림 허용/거절/서버 연결 상태 표시 |
| `src/sites/entry-server.tsx`, `account-delete.ts` | 허용한 네이티브 요청의 인증·CORS 및 기존 웹 회귀 방지 |
| Android의 앱 전용 plugin Java 파일 | Keystore·알림 FCM 연결 |
| iOS의 앱 전용 plugin Swift 파일 | Keychain·Firebase Messaging/APNs 연결 |
| `supabase/migrations/202610200001_native_revision_push.sql` | 기기·outbox·제한 RPC·동일 트랜잭션 접수 트리거 |
| `supabase/functions/native-revision-push/` | 보호된 발송 실행기·재시도 |
| `scripts/mobile-verify.mjs`, `docs/MOBILE-MVP.md` | 실제 검증 범위와 전달 안내 |

모든 새 TS 어댑터는 같은 디렉터리의 `.test.ts`에서 테스트한다. 기존 provider·설정·인증 테스트를 확장한다. 큰 provider 전체를 무관하게 재작성하지 않는다.

---

## Task 1: 공통 플랫폼 경계와 안전한 세션 보관

**Files:** 새 `src/lib/native/{platform,bridge,secure-storage}.ts` 및 각 테스트. 새 Android `android/app/src/main/java/com/yeolmaestudio/ilgamcheck/SecureSessionPlugin.java`. 새 iOS `ios/App/App/SecureSessionPlugin.swift`. 수정 `MainActivity.java`, iOS 프로젝트 plugin 등록, `src/lib/supabase/client.ts`, `src/sites/public-config-client.ts`.

**Interfaces**

- `NativePlatform = "web" | "android" | "ios"`.
- `nativeApiUrl(path: "/api/public-config" | "/api/account/delete", platform: NativePlatform): string`.
- `SecureSessionStore`는 `getItem(key: string): Promise<string|null>`, `setItem(key: string, value: string): Promise<void>`, `removeItem(key: string): Promise<void>`를 제공한다.
- 공개 설정 응답은 기존 `parsePublicEnvironment` allowlist를 그대로 통과한다.

- [ ] Fail 테스트: 웹은 상대 API 주소, 네이티브는 검증된 `deploymentOrigin()` HTTPS URL을 사용한다. 잘못된 path·`//evil.example`·인증키 노출 응답은 거절한다.
- [ ] Fail 테스트: secure storage 쓰기 실패는 성공으로 삼지 않는다. 로그아웃 후 이전 세션을 반환하지 않는다. iOS 신규 설치 식별자와 잔존 Keychain 세션이 다르면 세션을 삭제한다.
- [ ] `npx vitest run src/lib/native/platform.test.ts src/lib/native/secure-storage.test.ts src/sites/public-config-client.test.ts`로 실패 원인을 확인한다.
- [ ] 네이티브 저장소를 구현한다. Android는 Keystore AES-GCM, iOS는 해당 기기 전용 Keychain 접근성을 사용한다. 웹은 기존 저장 방식을 유지한다.
- [ ] 동일 테스트 및 네이티브 저장·재시작·삭제의 플랫폼 테스트를 통과한다. iOS 실행 증거는 Mac에서만 확보한다.
- [ ] 변경 파일만 커밋한다. 기존 사용자 문서는 포함하지 않는다.

## Task 2: OAuth와 앱 복귀, 계정 수명주기

**Files:** 새 `src/lib/native/auth.ts`·테스트. 수정 Supabase client, workspace provider/auth gate 및 테스트, Android Manifest, iOS Info.plist/SceneDelegate, `src/sites/account-delete.ts`, `src/lib/supabase/recent-google-authentication.ts`와 관련 테스트. Apple 로그인 도입 시 새 `src/lib/supabase/recent-authentication.ts`로 공급자 검증 책임을 분리한다.

**Interfaces**

- `NativeAuthCallback = { code: string } | { error: string }`.
- `parseNativeAuthCallback(url: string): NativeAuthCallback | null`.
- `startNativeOAuth(provider: "google" | "apple", redirectPath: string): Promise<void>`.
- `completeNativeOAuth(url: string): Promise<"handled" | "ignored">`.
- `disposeNativeAuth(): Promise<void>`로 리스너·미완료 요청을 정리한다.
- 세션 생성은 Supabase `flowType: "pkce"`, `skipBrowserRedirect: true`, `exchangeCodeForSession`을 사용한다. 네이티브에서는 URL 자동 감지를 꺼 직접 callback과 중복하지 않는다.

- [ ] Fail 테스트: 허용된 URI+code만 수락한다. 다른 scheme/host/path, token fragment, 중복 code, 진행 중 요청 없는 callback, 취소·만료를 시험한다.
- [ ] Fail 테스트: 로그인 연속 탭은 OAuth 한 번만 연다. cold launch와 URL 이벤트에 같은 callback이 와도 교환은 한 번이다. A 계정 삭제 재인증에서 B 로그인은 삭제를 거절한다.
- [ ] 해당 native/auth 및 기존 workspace-auth-gate/session 테스트를 실행해 실패를 확인한다.
- [ ] 호환되는 공식 Capacitor App/Browser 플러그인을 설치·버전 고정하고 시스템 브라우저 흐름을 구현한다. Android intent-filter, iOS URL scheme 및 기존 SceneDelegateProxy에 연결한다.
- [ ] iOS 심사용 Apple 로그인 추가 범위를 사용자 계획 검토에 포함한다. 활성화 시 웹·앱에서도 같은 공급자로 다시 로그인할 수 있도록 하고, 이메일 유사성으로 임의 계정 병합하지 않는다.
- [ ] Apple 계정 삭제에는 최근 인증 검증과 공급자 토큰 철회 의무를 검토·구현한다. 기존 Google 재인증 보안을 삭제하거나 우회하지 않는다.
- [ ] 자동 테스트 통과 후 테스트 계정으로 각 OS의 로그인·취소·재시작·로그아웃·재인증을 확인한다. Auth provider/redirect 변경은 정확한 diff를 보여주고 반영한다.
- [ ] 변경 파일만 커밋한다.

## Task 3: 재개 동기화와 여러 일감 UX

**Files:** 새 `src/lib/native/lifecycle.ts`·테스트. 수정 workspace-provider, `jobs-overview.tsx`, `today-dashboard.tsx`, `job-detail.tsx`, `new-job-form.tsx`, `src/styles/theme.css` 및 관련 테스트.

**Interfaces**

- `subscribeNativeResume(onResume: () => Promise<void>): Promise<() => void>`.
- provider 내부 `refreshHostedWorkspace(reason: "resume" | "online" | "realtime"): Promise<void>`를 기존 로딩·버전·초안 병합 코드와 공유한다.
- 기존 `createJob`·`recordRevision`·저장 RPC 인터페이스는 유지한다.

- [ ] Fail 테스트: 저장 대기 중 resume, A 로그아웃 뒤 늦은 A 응답, 연속 resume/online, 원격 버전 충돌에서 로컬 입력이 사라지지 않는다.
- [ ] Fail 테스트: 같은 고객 일감 2개·총 15개에서 검색/필터→상세→뒤로가기 조건 보존, 새 일감 중복 탭 한 번 생성, 실패 입력 보존을 확인한다.
- [ ] native/lifecycle, workspace-provider-session, today-dashboard, job-detail 테스트를 실행해 실패를 확인한다.
- [ ] 앱 재개를 기존 서버 재조회·save chain·conflict 경로에 연결한다. 전역 last-write-wins를 새로 만들지 않는다.
- [ ] 기존 승인 시안의 목록 중심 스타일을 필요한 화면에 적용한다. 웹 데스크톱 레이아웃은 유지한다.
- [ ] 자동 테스트와 360/390px·데스크톱 렌더 확인. Android 키보드/뒤로가기 및 iPhone safe area/키보드는 각 플랫폼에서 확인한다.
- [ ] 변경 파일만 커밋한다.

## Task 4: 기기 등록과 수정 요청 outbox

**Files:** 새 SQL migration·`supabase/tests/native_revision_push.sql`. 새 `src/lib/native/push-contract.ts`·테스트. 기존 현재 workspace RPC는 필요 최소 변경만 한다.

**Interfaces**

- 기기 등록 RPC `register_native_push_device(p_installation_id uuid, p_platform text, p_token text)`는 `auth.uid()` 소유 계정에만 등록한다.
- 해제 RPC `revoke_native_push_device(p_installation_id uuid)`는 인증 사용자 소유 등록만 해제한다.
- `native_push_devices`: owner_id, installation_id, platform, token, enabled, updated_at. 일반 클라이언트 직접 SELECT/DML은 금지하고 제한 RPC만 허용한다.
- `native_revision_outbox`: request_id, owner_id, job_key, created_at. `request_id` unique.
- `native_push_attempts`: request_id, device_id, 상태·시도 수·재시도 시각·lease. `(request_id, device_id)` unique.
- `workspace_revision_requests` INSERT 후 트리거로 outbox를 만든다. 기존 접수 RPC의 원자성·idempotency와 같은 DB 트랜잭션을 사용한다.

- [ ] Fail SQL 테스트: 미인증 등록, A가 B 토큰 조회/해제, 임의 outbox 작성, 잘못된 플랫폼/과도한 token 길이를 거절한다.
- [ ] Fail SQL 테스트: 요청 재시도 두 번에도 outbox와 사용 횟수 한 번. 계정·일감 삭제 시 발송 대상이 남지 않는다.
- [ ] 로컬 Supabase 테스트 DB에 migration과 `supabase test db`를 실행해 실패를 확인한다. Docker/테스트 DB 없으면 검사 통과로 처리하지 않는다.
- [ ] 테이블·RLS·RPC·트리거를 구현한다. 기기 토큰을 로그나 사용자 화면에 반환하지 않는다. raw token은 서버 전달 용도이며 암호화-at-rest와 권한을 확인한다.
- [ ] SQL 검증·기존 workspace_job_deletion/rpc_execution_surface 검증 통과 후 rollback/재적용을 로컬에서 확인한다.
- [ ] migration을 커밋한다. 운영 DB에는 이 단계만으로 적용하지 않는다.

## Task 5: 양쪽 OS 푸시와 보호된 발송 실행기

**Files:** 새 `src/lib/native/push.ts`·테스트, `supabase/functions/native-revision-push/{index,delivery}.ts`·Deno 테스트. 새 iOS `NativeMessagingPlugin.swift`, entitlements 및 Firebase Messaging 설정. Android 앱 설정과 settings-panel 및 테스트 수정.

**Interfaces**

- `enableNativePush(): Promise<"enabled" | "denied" | "unavailable">`.
- `disableNativePush(): Promise<void>`.
- `parseRevisionNotification(data: unknown): { requestId: string; jobKey: string } | null`.
- 발송 함수 `deliverBatch(now: Date, limit: number): Promise<{sent: number; retrying: number; discarded: number}>`.
- FCM 접수만으로 `displayed` 상태를 만들지 않는다. 재시도는 최대 5회, 1/5/15/60분 후로 제한하고 무효 토큰은 비활성화한다.

- [ ] Fail 테스트: 권한 거절·토큰 갱신·한 기기 계정 전환·알림 딥링크 외부 URL·타 계정 payload를 안전하게 처리한다.
- [ ] Fail 테스트: 두 worker 동시 claim, FCM timeout·429·invalid token, 성공 후 응답 유실 시 같은 수정 횟수를 다시 반영하지 않는다. 늦은 알림 탭은 서버 최신 권한을 재확인한다.
- [ ] native/push 테스트 및 `deno test supabase/functions/native-revision-push/`를 실행해 실패를 확인한다.
- [ ] Android는 공식 Push Notifications의 FCM 등록을 사용한다. iOS는 Firebase Messaging SDK로 FCM 토큰을 얻고 APNs와 연결한다. APNs raw token을 FCM token인 것처럼 등록하지 않는다.
- [ ] 발송 함수는 서버 전용 인증·제한된 batch·lease 기반 claim으로 보호한다. 타 사용자 지정 발송 endpoint를 공개하지 않는다. 새 analytics SDK는 설치하지 않는다.
- [ ] 기본 문구는 “새 수정 요청이 도착했어요”. 이름·원문을 payload에 싣지 않는다. 서버 요청의 성공 여부와 알림 성공 여부를 분리한다.
- [ ] 각 OS 권한 허용/거절·포그라운드·백그라운드·일반 종료 수신·탭 이동을 실제로 검증한다. Android force-stop 및 iOS OS 제한은 별도 기록한다.
- [ ] 변경 파일만 커밋한다.

## Task 6: API 보안과 전체 회귀

**Files:** `src/sites/entry-server.tsx`, `account-delete.ts`, 각 테스트, `scripts/mobile-verify{,.test}.mjs`, `docs/MOBILE-MVP.md`.

**Interfaces**

- 네이티브 origin은 `https://localhost`와 `capacitor://localhost`만 필요한 API에 허용한다. CORS는 인증을 대신하지 않는다.
- 네이티브 계정 삭제는 기존 확인 헤더·최근 인증·access token 검사 유지. credentials나 origin만으로 통과시키지 않는다.

- [ ] Fail 테스트: OPTIONS 허용 경로/헤더, 임의 origin/누락 token/잘못된 확인값/오래된 인증을 거절한다.
- [ ] Fail 테스트: mobile-verify가 앱 폴더 존재만 보고 “production ready”를 출력하지 않도록 로그인·plugin·callback·알림 설정 검사와 실기기 미검증 표기를 구분한다.
- [ ] 대상 테스트를 실행해 실패를 확인하고 최소 수정을 구현한다.
- [ ] `npm test`, `npm run typecheck`, `npm run lint`, `npm run build:sites`, `npm run build:mobile`, `npm run mobile:verify` 통과. 최신 main에서 이미 깨진 검사는 먼저 원인 분리한다.
- [ ] 독립 리뷰어가 로그인 우회·토큰 누출·동시 저장·다중 기기·서버 권한과 실제 앱 UX를 검토한다. 발견한 결함은 회귀 테스트 후 수정한다.
- [ ] 변경 파일만 커밋하고 검사 증거를 `work/mobile-mvp/`에 기록한다.

## Task 7: Android 설치 APK

**Files:** Android Gradle 설정, 기존 서명 설정 확인, `docs/MOBILE-MVP.md`, 새 `docs/verification/2026-10-20-mobile-mvp.md`.

- [ ] 기존 APK·서명키 사용 여부를 파일명/설정으로 확인한다. 키 내용을 출력하거나 다른 프로젝트 키를 재사용하지 않는다.
- [ ] `npm run build:mobile`, `npx cap sync android`, `android/gradlew.bat -p android assembleDebug`를 실행한다. 테스트 서명임을 명시한다.
- [ ] APK manifest의 ID/권한/cleartext/backup, 서명 인증서 지문, 버전, SHA-256을 확인한다.
- [ ] 전용 에뮬레이터 또는 승인된 테스트 기기에 설치해 시작·Google 복귀·일감 CRUD·서버 동기화·알림을 확인한다.
- [ ] D 프로젝트의 전달 폴더에 `일감체크-Android-테스트.apk`와 설치 안내를 보관한다. 사용자의 실제 휴대폰 검증 결과를 별도 기록한다.

## Task 8: iPhone 빌드·서명·TestFlight

**Files:** iOS 프로젝트·entitlements·Info.plist, `docs/MOBILE-MVP.md`, 검증 기록. CI를 사용할 경우 새 `.github/workflows/mobile-ios.yml`은 수동 실행 전용으로 작성한다.

- [ ] 사용자의 Apple Developer 계정·App Store Connect 권한·Mac 환경 답변을 확인한다. 신규 결제·CI 과금·키 등록 승인을 추정하지 않는다.
- [ ] 공식 Capacitor 8 문서 및 실제 package의 iOS 최소 버전을 대조해 deployment target을 맞춘다. 2026-10-20 확인한 기존 설정은 iOS 15.0이다.
- [ ] Mac에서 `npm ci`, `npm run build:mobile`, `npx cap sync ios`를 수행한다.
- [ ] `xcodebuild -list -project ios/App/App.xcodeproj`로 scheme을 확인한 후 해당 scheme의 simulator build와 실행을 검증한다. Mac 없이 Windows 정적 검사만으로 이 항목을 체크하지 않는다.
- [ ] Apple Team·Bundle ID·서명·APNs·Firebase iOS 설정을 확인하고 서명 archive를 만든다. 키·인증서·프로비저닝은 비공개 저장소/CI secret으로만 다룬다.
- [ ] Apple 로그인 정책 4.8, 계정 삭제, 개인정보 표시, beta review 정보, 로그인 가능한 심사 계정/데모를 점검한다. 지원하지 않는 결제나 존재하지 않는 기능을 기재하지 않는다.
- [ ] 사용자 승인된 App Store Connect 앱에 업로드하고 처리 결과를 확인한다. 외부 테스터용 첫 빌드는 beta review 통과 후에만 설치 가능으로 표시한다.
- [ ] 실제 iPhone에서 설치·로그인·웹 동기화·푸시를 확인한다. 모집 후보의 이메일을 무단 업로드하거나 초대하지 않는다.

## 실행 전 검토 결과

- 설계의 계정·데이터·알림·UX·두 OS 전달 조건을 Task 1~8에 연결했다.
- Android APK와 iOS TestFlight는 별도 완료 증거를 요구한다.
- 서명/FCM/Auth/운영 migration/외부 tester 초대는 로컬 구현과 분리했다.
- 현재 설계·계획만 작성됐고 제품 코드는 변경하지 않았다.
- 실행 방식 권장: **메인이 이 세션에서 순서대로 구현하고 마지막에 독립 리뷰(추천)**. 인증·저장·푸시의 인터페이스 의존성이 커서 한 사람이 연결을 유지하는 편이 낫다. 후보 조사는 별도로 계속한다.
- 사용자 계획 승인 전 체크박스를 완료로 바꾸지 않는다.
