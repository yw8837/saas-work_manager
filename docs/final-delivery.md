# 일감체크 MVP 인수 문서

## 현재 구성

- 실행 소스: `01_일감체크/app/`
- 프론트·서버 Worker: Sites
- 인증·DB·Realtime: Supabase
- 로그인: Google OAuth 전용
- 결제: 미구현
- 설문: Google Form 외부 링크

## 구현 범위

| 영역 | 상태 |
|---|---|
| 패키지·옵션·일감·Todo·마감 자동합성 | 구현 |
| Today 업무 처리·고객 대기·완료/재진행 | 구현 |
| 고객 수정 요청 링크·수동 기록·횟수 계산 | 구현 |
| 링크 끄기·재발급·완료 일감 잠금 | 구현 |
| 추가 요청 초안·확정·취소 | 구현 |
| Google 로그인·로그아웃 | 구현 |
| 사용자별 원격 작업공간·Realtime | 구현 |
| 저장 충돌·dirty 초안 복구 | 구현 |
| 데이터 내보내기 | 구현 |
| Google 재인증을 거친 계정 삭제 | 구현 |
| PortOne 결제·구독 webhook | 미구현 |
| 앱 종료 뒤 예약 Push | 미구현 |

## 보안 경계

- 모든 작업공간 조회는 `auth.uid()` RLS로 격리한다.
- 브라우저는 publishable key만 사용하고 서비스 역할 키는 Worker/서버에서만 사용한다.
- Supabase 서버 URL은 정확한 `https://<20자-ref>.supabase.co`만 허용한다. 다른 URL에는 관리자 키를 보내지 않는다.
- 계정 삭제 대상은 요청 본문이 아니라 서버가 검증한 access token의 사용자 ID로만 결정한다.
- 삭제 전 5분 이내 Google OAuth AMR과 기존 계정 ID 일치를 모두 요구한다.
- 고객 수정 토큰은 256-bit 난수이며 공개 테이블에는 SHA-256 hash만 저장한다.
- 고객 링크는 `/r/<token>`만 사용하고 query string에 토큰을 만들지 않는다.
- 공개 제출은 본문 길이, 간격, 시간·일 횟수, idempotency를 DB 트랜잭션에서 검사한다.
- CSP, HSTS, frame 차단, MIME sniff 차단, no-referrer와 공개 링크 noindex 헤더를 적용한다.

## 완료 판정

완료라고 보고하려면 현재 소스에서 unit, lint, typecheck, Next build, Sites build, mobile verify, 운영 의존성 audit가 모두 통과해야 한다. 이어서 운영 Supabase migration·Google OAuth 설정·Sites 배포를 마치고 다음을 실제 계정으로 확인한다.

- A/B 계정 교차 노출 없음
- 로그인 후 `/today` 복귀
- 계정 삭제 재인증 후 `/settings` 복귀와 다른 계정 선택 차단
- 다른 브라우저의 고객 수정 요청과 Realtime 반영
- 링크 끄기·재발급·완료 후 이전 링크 거절
- 배포 `/api/health`와 보안 헤더

알려진 취약점과 확인된 버그를 수정했다고 말할 수는 있지만, 알려지지 않은 제로데이가 절대 없다고 보증할 수는 없다. 의존성 감사와 운영 로그 점검은 배포 뒤에도 계속한다.
