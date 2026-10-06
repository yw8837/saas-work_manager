# 일감체크 운영 도메인 전환

2026-09-26. 새 주소를 연결하는 동안 심사용 기존 주소를 유지한다.

## 주소와 설정의 출처

- 기존: `https://ilgamcheck-beta.bsfire1237.chatgpt.site`
- 예정: `https://ilgam.studioyeolmae.com`
- 빌드 설정: `NEXT_PUBLIC_SITE_ORIGIN` (2026-09-30부터 미설정 시 새 주소 `https://ilgam.studioyeolmae.com`)
- 단일 기본값: `src/lib/deployment-origin.ts`
- 이 설정은 Sites HTML의 OG/Twitter 이미지·URL, CSP의 모바일 API 연결 대상, 네이티브 앱 public-config 부트스트랩에 사용된다. 런타임 설정 변경만으로 정적 HTML은 바뀌지 않는다. 반드시 재빌드한다.
- 일반 웹의 API, Google OAuth 복귀, 고객 수정 링크는 접속한 origin을 사용한다. 새 주소는 새 주소로, 기존 주소는 기존 주소로 동작한다. 토큰을 재발급하거나 DB를 옮기지 않는다.

## 하드코딩 조사 결과

- `index.html`: 공유 메타데이터와 connect-src의 기존 주소를 빌드용 치환자로 변경.
- `src/sites/public-config-client.ts`: 모바일 전용 기존 URL을 공용 설정 함수로 변경.
- `supabase/config.toml`: 2026-09-30 site_url을 새 주소로 바꾸고 Redirect URLs에 새 주소를 추가했다. 기존 주소 항목은 남겼다. config push는 명시한 현재/이전 origin을 렌더링한다.
- `scripts/sites-remote-smoke.mjs`: 원래부터 명령 인수로 주소를 받는다. 변경 불필요.
- `scripts/runtime-contract-readback.mjs`: 명령 인수 또는 SUPABASE_AUTH_SITE_URL/DEPLOYMENT_URL을 사용한다. 변경 불필요.
- 정책 publication manifest와 DB digest: 주소 전환을 이유로 임의 변경하지 않았다.
- 과거 검증 기록 및 테스트 fixture의 기존 URL은 역사적 근거·회귀 조건이므로 보존한다.

## DNS: Sites가 반환한 실제 레코드

Sites custom domain ID: `appgdom_6ab7b1326a6c819196975d0f4e2b8355`.
등록 직후 상태 pending, TLS initializing. DNS 조회는 NXDOMAIN이었다.

| 종류 | 전체 이름 | 값 |
|---|---|---|
| CNAME | ilgam.studioyeolmae.com | custom-domains.chatgpt.site. |
| TXT | _openai-site-verification.ilgam.studioyeolmae.com | openai-site-verification=yQHwqJQUZsMkODtwri4q79XFLoIAr4kEAKDut_Qu20o |
| TXT | _cf-custom-hostname.ilgam.studioyeolmae.com | 36bede6c-0be9-48dc-8e69-b39c0fef5a6e |

예스닉이 도메인을 자동으로 붙이면 이름 칸에는 각각 `ilgam`, `_openai-site-verification.ilgam`, `_cf-custom-hostname.ilgam`만 입력한다. 다른 레코드는 삭제하지 않는다.

## DNS/TLS 활성화 후 인증 설정

Supabase 프로젝트는 `evhkpgxacpweelnmjmqh`를 유지한다.

```dotenv
SUPABASE_AUTH_SITE_URL=https://ilgam.studioyeolmae.com
SUPABASE_AUTH_LEGACY_ORIGIN=https://ilgamcheck-beta.bsfire1237.chatgpt.site
ILGAMCHECK_SITES_ORIGIN=https://ilgam.studioyeolmae.com
NEXT_PUBLIC_SITE_ORIGIN=https://ilgam.studioyeolmae.com
```

Redirect URLs는 아래 4개를 정확히 명시한다. 관리화면에서 추가한 순서는 달라도 되지만 중복·추가 주소·와일드카드는 허용하지 않는다.

1. https://ilgam.studioyeolmae.com/today
2. https://ilgam.studioyeolmae.com/settings
3. https://ilgamcheck-beta.bsfire1237.chatgpt.site/today
4. https://ilgamcheck-beta.bsfire1237.chatgpt.site/settings

Google OAuth에서 Supabase가 사용하는 승인된 리디렉션 URI는 **`https://evhkpgxacpweelnmjmqh.supabase.co/auth/v1/callback`** 이다. 앱 도메인의 `/today`나 `/settings`를 Google의 callback으로 대체하지 않는다. Supabase 프로젝트 도메인을 바꾸는 작업이 아니므로 기존 callback은 유지한다. Google 승인된 JavaScript 원본/앱 홈페이지·정책 URL은 실제 OAuth 클라이언트 구성을 확인한 뒤 필요에 맞게 새 원본을 추가하고 기존 원본을 보존한다.

근거: [Supabase Google OAuth](https://supabase.com/docs/guides/auth/social-login/auth-google), [Auth Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

## 완료 기준

- DNS와 Sites TLS active.
- 새 주소와 기존 주소의 `npm run smoke:sites -- URL` 통과.
- runtime readback에서 동일 프로젝트·정책·runtime contract 확인.
- `npm run supabase:auth:readback`에서 새/기존 callback 목록 일치.
- 새 주소 Google 로그인, 기존 주소 Google 로그인 모두 Today 진입.
- 기존 고객 수정요청 링크 유지 및 새 주소에서 만든 링크 조회·제출 확인.
- 위 항목 전에는 새 도메인 연결 완료로 보고하거나 기존 주소를 폐기하지 않는다.
