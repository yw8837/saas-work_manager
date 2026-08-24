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

## 모바일 MVP에서 바로 되는 일

1. 패키지·옵션을 만든다.
2. 새 일감을 만들고, 마감·Todo·수정 한도를 자동 생성한다.
3. 오늘 할 일·고객 대기·수정 기록을 모바일 하단 내비게이션으로 처리한다.
4. 고객용 수정 요청 링크는 휴대폰 브라우저에서도 제출된다.
5. 이메일/비밀번호로 로그인한 계정은 웹과 앱에서 같은 작업공간을 사용한다.

## 매번 동기화하는 방법

실제 Supabase 공개 환경값을 현재 셸에 설정한 뒤 실행한다. 공개 URL과 publishable key는 클라이언트 번들에 포함되어도 되는 값이지만, service-role key나 결제 키는 절대로 넣지 않는다.

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

도메인을 바꾸더라도 앱 식별자는 유지한다. 웹에서 쓰는 최종 도메인을 Supabase Auth의 Site URL·redirect allow list에 반영한 뒤 위 과정을 다시 실행해 새 번들을 제출한다.

## 스토어 제출 전 외부 준비물

- Google Play Console 개발자 계정과 Android SDK/서명 키
- Apple Developer Program 계정, macOS/Xcode, 팀 서명 인증서·프로비저닝 프로파일
- Google·Kakao OAuth 앱 등록 및 각 플랫폼 딥링크 설정
- FCM/APNs 자격 증명과 실제 기기 푸시 검증
- 결제 도입 시 PortOne 웹훅 검증과 환불·구독 정책 확정

위 항목은 계정 권한과 실제 기기 증명이 필요한 외부 작업이다. 현재 Windows 환경에서는 Android/iOS 프로젝트 구조·번들 동기화·설정만 검증한다. Android 실제 APK/AAB와 단말 검증에는 Android SDK·에뮬레이터 또는 실기기가, iOS 빌드·서명·실기기 검증에는 macOS/Xcode가 필요하다. 현재 MVP에는 네이티브 Google/Kakao 로그인과 예약 푸시를 구현했다고 표시하지 않는다.
