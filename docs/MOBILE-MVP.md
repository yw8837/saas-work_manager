# 일감체크 Android · iOS 모바일 MVP

일감체크는 웹·Android·iOS가 동일한 React 화면과 Supabase 작업공간을 사용한다. 기능을 세 번 구현하지 않고, Capacitor 8이 검증된 `dist/client` 웹 번들을 각 네이티브 프로젝트에 넣는 구조다.

## 현재 포함

- Android 프로젝트: `android/`
- iOS 프로젝트: `ios/`
- 앱 식별자: `com.yeolmaestudio.ilgamcheck`
- 앱 이름: `일감체크`
- 모바일 메타데이터: 설치용 manifest, Apple 터치 아이콘, 노치·홈 인디케이터 안전 영역(`viewport-fit=cover` + CSS safe-area)
- 모바일 웹 UX: 하단 내비게이션, 새 일감 고정 행동 버튼, 한 열 폼, 고객 수정 요청 공개 링크
- Android: 키보드 `adjustResize`, 평문 통신 차단, 앱 데이터 자동 백업 차단
- iOS/iPadOS: 세로·가로 회전 선언, Safe Area 대응, 공통 웹 번들 동기화
- 배포 전 번들을 Android/iOS에 동기화하는 `npm run mobile:sync`

## 이번 구현 범위 — 배포·실기기 검증과 구분

1. 패키지·옵션을 만든다.
2. 새 일감을 만들고, 마감·Todo·수정 한도를 자동 생성한다.
3. 오늘 할 일·고객 대기·수정 기록을 모바일 하단 내비게이션으로 처리한다.
4. 고객용 수정 요청 링크는 휴대폰 브라우저에서도 제출된다.
5. Google OAuth는 시스템 브라우저에서 실행하고 앱 callback으로 돌아와 PKCE 세션을 교환한다.
6. 앱 복귀 시 저장 대기열을 먼저 완료한 뒤 최신 서버 상태를 읽는다. 충돌한 초안을 덮어쓰지 않는다.
7. 일감 검색·필터와 상세에서 돌아갈 위치를 유지한다. 등록 실패 시 입력을 보존한다.
8. 고객 링크로 접수된 수정 요청은 서버 outbox에서 FCM으로 발송한다. 알림 탭은 현재 계정 권한을 재확인하며 수정 횟수를 다시 증가시키지 않는다.

위 5~8은 이번 분리 브랜치의 구현이다. 운영 서버 반영과 실제 휴대폰 검증 전에는 설치·로그인·푸시 완료로 안내하지 않는다.

## 계정·알림 구조

- 웹/Supabase 계정·데이터를 그대로 사용한다. Firebase Auth/Firestore로 옮기지 않는다.
- Android: Android Keystore AES-GCM으로 세션/verifier 저장, 공식 Capacitor Push Notifications로 FCM 등록.
- iPhone: device-only Keychain으로 세션/verifier 저장, Firebase Messaging과 APNs 연결용 브리지 포함.
- Firebase 프로젝트: `ilgamcheck-auth-20260829` (`Ilgamcheck Auth`), 무료 Spark. Android/iOS 앱은 등록했고 Analytics는 활성화하지 않았다.
- 알림 payload에는 고객명·본문을 넣지 않는다. 종류·요청 ID·일감 ID만 전달한다.
- 서버 기기 등록이 성공해야 UI를 ‘기기 등록됨’으로 표시한다. 이는 잠금화면 표시를 보장하는 지표가 아니다.
- 로그아웃 전 서버 기기 등록을 해제한다. 서버 revoke 실패를 숨기고 로그아웃하지 않는다.
- 알림 해제·계정 전환·탈퇴 시 늦은 callback이 다른 계정의 기기를 등록하지 않게 generation을 확인한다.
- 현재 네이티브 푸시 범위는 **고객 링크의 새 수정 요청**이다. 수동 기록·마감·매일 브리핑은 인앱 표시이며 예약 푸시가 아니다.

## 운영 반영 게이트

1. 검토가 끝난 `20261020151338_native_revision_push.sql`을 대상 Supabase 프로젝트에 적용한다.
2. Supabase redirect allow list에 `com.yeolmaestudio.ilgamcheck://auth/callback`만 추가한다. 기존 웹 redirect와 Site URL을 덮어쓰지 않는다.
3. 발송 전용 최소권한 FCM 서비스 계정과 비밀키, 호출용 32자 이상의 secret을 준비한다. 신규 권한·키 생성은 별도 승인 대상이다.
4. `native-revision-push` Edge Function과 제한된 주기의 서버 호출을 설정한다. 공개 클라이언트에서 발송기를 호출하거나 비밀키를 번들에 넣지 않는다.
5. 네이티브 `/api/account/delete`의 명시적 CORS 변경을 웹 서버에 반영한다. JWT·최근 OAuth·확인 헤더/본문 검사는 유지한다.
6. Android 실기기로 Google 복귀·앱 종료 후 푸시·웹↔앱 저장을 검증한다.
7. iPhone은 Apple Developer·Mac/Xcode·APNs 키와 서명이 준비된 후 별도로 빌드·검증한다.

FCM 프로젝트 생성 승인과 위 운영 DB·Auth·키·배포 승인은 서로 다르다. 현재 운영 데이터에 테스트 일감을 만들거나 모집 대상에게 연락하지 않는다.

## 매번 동기화하는 방법

기본 앱은 `https://ilgam.studioyeolmae.com/api/public-config`에서 허용된 공개 설정만 받아온다. 명시적 빌드 환경값을 사용할 수도 있지만 service-role key나 결제 키는 절대로 넣지 않는다.

```powershell
$env:NEXT_PUBLIC_STORAGE_MODE = "hosted"
$env:NEXT_PUBLIC_SUPABASE_URL = "https://<project-ref>.supabase.co"
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = "<publishable-key>"
$env:NEXT_PUBLIC_BETA_SIGNUP_ENABLED = "true"
$env:NEXT_PUBLIC_BUSINESS_NAME = "열매스튜디오"
$env:NEXT_PUBLIC_OPERATOR_NAME = "열매스튜디오"
$env:NEXT_PUBLIC_SUPPORT_EMAIL = "bsfire1234@mail.com"
npm run mobile:sync
npm run mobile:verify
```

도메인을 바꾸더라도 앱 식별자와 custom callback은 유지한다. `deploymentOrigin()`과 운영 API 허용 설정을 검토한 후 번들을 다시 빌드한다.

Firebase 공개 앱 설정 파일은 저장소에서 제외한다:

- Android: `android/app/google-services.json`
- iPhone: `ios/App/App/GoogleService-Info.plist`

서버 FCM 서비스 계정 JSON은 위 client config와 전혀 다르며, 앱 폴더·Git·문서·로그에 저장하지 않는다.

Windows의 한글 사용자 경로에서 Gradle 사전 검사만 실패하면 다음과 같이 이 실행에만 경로 검사를 재정의할 수 있다.

```powershell
npm run build:mobile
npx cap sync android
./android/gradlew.bat -p android assembleDebug --no-daemon --max-workers=1 -Pandroid.overridePathCheck=true
```

기본 debug 서명은 내부 설치 검증용이다. 스토어 출시용 서명으로 재사용하지 않는다.

Windows에서 `npx cap sync ios`를 별도로 실행했다면 `node scripts/normalize-ios-spm.mjs`도 실행한다. Capacitor가 생성한 Windows 경로 구분자를 Swift 패키지용 `/`로 정규화한다. `npm run mobile:sync`에는 이 단계가 포함돼 있다.

SQL 검사는 `node scripts/test-native-push-db.mjs`로 in-memory PostgreSQL 엔진에서 수행한다. 이 검사는 Supabase Auth/API와 다중 프로세스 잠금 통합 검사를 대체하지 않는다.

```powershell
npx --yes deno@2.9.6 check --config supabase/functions/native-revision-push/deno.json supabase/functions/native-revision-push/index.ts
npx --yes deno@2.9.6 test --config supabase/functions/native-revision-push/deno.json supabase/functions/native-revision-push/delivery_test.ts
```

## 스토어 제출 전 외부 준비물

- Google Play Console 개발자 계정과 Android SDK/서명 키
- Apple Developer Program 계정, macOS/Xcode, 팀 서명 인증서·프로비저닝 프로파일
- Google OAuth 및 각 플랫폼 딥링크 설정
- iOS 공개 배포 전 Apple 로그인·계정 삭제/토큰 폐기 흐름과 App Review 4.8 검토. Apple 로그인은 현재 제공하지 않는다.
- FCM/APNs 자격 증명과 실제 기기 푸시 검증
- 결제 도입 시 PortOne 웹훅 검증과 환불·구독 정책 확정

위 항목은 계정 권한과 실제 기기 증명이 필요한 외부 작업이다. `mobile:verify`는 소스·번들 검사이며 ‘서비스 사용 가능’, ‘푸시 표시 성공’, ‘iOS 빌드 성공’을 보증하지 않는다. 현재 Windows PC에는 Android SDK가 있지만 연결된 승인 테스트 단말은 없고, Apple 개발자 계정과 Mac도 없다. TestFlight 설치 가능으로 표시하지 않는다.
