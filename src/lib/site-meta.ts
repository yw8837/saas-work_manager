import type { Metadata } from "next";
import { BUSINESS_IDENTITY } from "./business-identity";
import { deploymentOrigin } from "./deployment-origin";
import { PLAN_LIMITS } from "./domain";

/**
 * 검색·공유 미리보기 값을 한 곳에 둔다(layout·page 파일은 허용된 이름만 내보낼 수 있어 따로 둔다).
 * 공유 미리보기(카톡·슬랙 등)는 Vite Sites 빌드의 index.html과 같은 값이다.
 * 페이지에서 openGraph를 다시 쓰면 통째로 바뀌므로 SITE_OPEN_GRAPH를 펼쳐 쓴다.
 */

export const SITE_NAME = "일감체크";
export const SITE_SOCIAL_TITLE = "일감체크 · 운영은 덜고 작업에 집중하세요";
export const SITE_SOCIAL_DESCRIPTION = "주문 뒤의 할 일, 마감, 수정 요청을 한곳에서 정리해요.";
export const SITE_OG_IMAGE = {
  url: "/og/ilgamcheck-social.png",
  width: 1200,
  height: 630,
  alt: "일감체크 소개 이미지",
};

/** 랜딩 전용 검색 제목·설명('외주'를 넣음). 히어로 본문 문구는 바꾸지 않는다(카피는 사용자 몫). */
export const LANDING_TITLE = "일감체크 — 외주 작업, 주문부터 수정 횟수까지 한곳에서";
export const LANDING_DESCRIPTION =
  "크몽·숨고·소개로 받은 외주 작업을 패키지 기준으로 등록하고 마감·할 일·남은 수정 횟수를 한곳에서 봐요. 고객은 로그인 없이 링크로 수정을 요청해요.";

export const SITE_OPEN_GRAPH = {
  type: "website",
  locale: "ko_KR",
  siteName: SITE_NAME,
  title: SITE_SOCIAL_TITLE,
  description: SITE_SOCIAL_DESCRIPTION,
  images: [SITE_OG_IMAGE],
} satisfies NonNullable<Metadata["openGraph"]>;

export const SITE_TWITTER = {
  card: "summary_large_image",
  title: SITE_SOCIAL_TITLE,
  description: SITE_SOCIAL_DESCRIPTION,
  images: [SITE_OG_IMAGE.url],
} satisfies NonNullable<Metadata["twitter"]>;

/**
 * 고객 링크(/r/…)와 체험(/demo/r)의 공유 미리보기. 고객이 광고로 오해하지 않게 소개용 슬로건·그림 대신 차분한 값을 쓴다.
 * 그림이 없으니 트위터 카드는 작은 카드(summary)로 둔다.
 */
export const CUSTOMER_LINK_SHARE_TITLE = "수정 요청 링크";
export const CUSTOMER_LINK_SHARE_DESCRIPTION = "작업자가 보낸 수정 요청 페이지예요. 로그인 없이 열려요.";

export const CUSTOMER_LINK_OPEN_GRAPH = {
  type: "website",
  locale: "ko_KR",
  siteName: SITE_NAME,
  title: CUSTOMER_LINK_SHARE_TITLE,
  description: CUSTOMER_LINK_SHARE_DESCRIPTION,
} satisfies NonNullable<Metadata["openGraph"]>;

export const CUSTOMER_LINK_TWITTER = {
  card: "summary",
  title: CUSTOMER_LINK_SHARE_TITLE,
  description: CUSTOMER_LINK_SHARE_DESCRIPTION,
} satisfies NonNullable<Metadata["twitter"]>;

/**
 * Vite Sites 빌드는 모든 화면이 같은 첫 화면(index.html)을 쓰므로, 고객 링크·체험 응답에서만 공유 미리보기 태그를 바꾼다.
 * 소개 그림과 첫 화면 주소(og:url)는 뺀다. og:url이 첫 화면을 가리키면 미리보기가 첫 화면 것으로 바뀔 수 있다.
 */
export function withCustomerLinkShareMeta(html: string): string {
  const contents: Array<[RegExp, string]> = [
    [/(<meta\s+property="og:title"\s+content=")[^"]*(")/, CUSTOMER_LINK_SHARE_TITLE],
    [/(<meta\s+property="og:description"\s+content=")[^"]*(")/, CUSTOMER_LINK_SHARE_DESCRIPTION],
    [/(<meta\s+name="twitter:card"\s+content=")[^"]*(")/, CUSTOMER_LINK_TWITTER.card],
    [/(<meta\s+name="twitter:title"\s+content=")[^"]*(")/, CUSTOMER_LINK_SHARE_TITLE],
    [/(<meta\s+name="twitter:description"\s+content=")[^"]*(")/, CUSTOMER_LINK_SHARE_DESCRIPTION],
  ];
  let result = html.replace(/<meta\s+(?:property="og:(?:url|image(?::\w+)?)"|name="twitter:image")[^>]*>\s*/g, "");
  for (const [pattern, value] of contents) {
    result = result.replace(pattern, (_match, open: string, close: string) => `${open}${value}${close}`);
  }
  return result;
}

/** script 안에 넣을 JSON. `<`를 <로 바꿔 글 속 `</script>`가 태그를 닫지 못하게 한다. */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/**
 * 랜딩 구조화 데이터: 조직 + 무료 소프트웨어. 후기·평점이 없어 리치 결과는 안 나오지만 지어내지 않는다.
 * 전화·주소는 넣지 않는다. 결제 전이라 유료 요금제는 offers에 넣지 않는다.
 */
export function landingJsonLd(origin = deploymentOrigin()): string {
  const home = `${origin}/`;
  return serializeJsonLd({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${origin}/#org`, name: BUSINESS_IDENTITY.businessName, url: home },
      {
        "@type": "SoftwareApplication",
        "@id": `${origin}/#app`,
        name: SITE_NAME,
        url: home,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        inLanguage: "ko-KR",
        publisher: { "@id": `${origin}/#org` },
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "KRW",
          description: `무료 플랜: 동시 ${PLAN_LIMITS.free.activeJobs}건·누적 ${PLAN_LIMITS.free.totalJobs}건`,
        },
      },
    ],
  });
}
