# 일감체크 빠른 초안 MVP 구현 구조

## 로컬 실행 흐름

| 단계 | 책임 | 실제 동작 |
|---|---|---|
| 1. 카탈로그 | 패키지/옵션 템플릿 | Basic·Standard·Deluxe와 옵션을 localStorage에서 편집·보관한다. |
| 2. 자동합성 | 순수 도메인 함수 `composeJob` | 고객 별칭, 시작일, 패키지, 옵션을 입력받아 금액·원가·마감·수정한도·Todo와 업무별 기한을 즉시 계산한다. |
| 3. 실행 | Workspace 상태 | 일감의 Todo 상태, 고객대기, 외부 링크, 수정 타임라인, 추가요청 초안을 저장한다. |
| 4. 추가요청 | 순수 도메인 함수 `confirmAddon` | 초안 추가요청을 확정할 때만 금액·원가·마감·추가 Todo를 일감에 반영한다. |
| 5. 알림 | 순수 파생 큐 + 설정 | 마감 D-2/D-1/당일/지연, 대기 2/5일, 새 수정요청을 현재 상태에서 계산해 Today와 상단 알림에 표시한다. |
| 6. 고객 수정 | 동일 브라우저 공개 경로 | `/r/[token]`은 localStorage에 있는 일감에만 요청 원문과 접수시각을 기록하며, 수동 기록과 같은 도메인 경로를 사용한다. |

## 보존할 불변조건

패키지와 옵션은 일감 생성 시 깊은 스냅샷으로 복제한다. 따라서 이후 카탈로그를 수정해도 기존 일감의 금액·Todo·수정 한도는 변경되지 않는다. 수정요청 원문은 삭제하지 않으며, 한도 이후의 요청은 `extra_scope`로 남긴다. 추가요청은 `draft` 상태에서는 숫자나 Todo를 바꾸지 않고, `confirmed` 상태에서만 합계와 마감에 반영한다.

## Supabase 및 푸시 이관 경계

| 항목 | 초안 상태 | 후속 이관 방식 |
|---|---|---|
| 데이터 저장 | localStorage | 창업자 소유 Supabase PostgreSQL 프로젝트를 Seoul(`ap-northeast-2`) 리전에 만들고 기존 migration/RLS/RPC를 적용한다. |
| 로그인·격리 | 없음 | Supabase Auth와 `owner_id = auth.uid()` RLS를 활성화한다. |
| 고객 공개 링크 | 같은 브라우저만 | raw token을 저장하지 않는 공개 RPC와 서버 측 rate limit을 활성화한다. |
| 예약 푸시 | 인앱 큐 및 사용자 클릭 테스트만 | FCM Web Push 어댑터가 서비스 계정·VAPID·구독 암호화를 서버 측에서 처리한다. |
| 알림 재시도/중복 방지 | 없음 | `notification_deliveries`와 `notification_attempts`를 서비스 역할 worker가 처리한다. |

`NEXT_PUBLIC_*`에는 공개 Supabase URL과 anon key 외의 비밀값을 넣지 않는다. FCM 서비스 계정, VAPID private key, 암호화 키, Supabase service-role key는 서버/Edge Function 전용이다. 실제 외부 공개 링크와 예약 Web Push는 이 작업에서 **BLOCKED_EXTERNAL**이다.
