import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { metadata as workspaceMetadata } from "@/app/(workspace)/layout";
import { metadata as guideMetadata } from "@/app/guide/page";
import { metadata as rootMetadata } from "@/app/layout";
import { metadata as landingMetadata } from "@/app/page";
import { metadata as privacyMetadata } from "@/app/privacy/page";
import { metadata as termsMetadata } from "@/app/terms/page";
import { renderDeploymentHtml } from "./deployment-origin";
import {
  LANDING_DESCRIPTION,
  LANDING_TITLE,
  landingJsonLd,
  serializeJsonLd,
  SITE_OG_IMAGE,
  SITE_OPEN_GRAPH,
  SITE_TWITTER,
} from "./site-meta";

const ORIGIN = "https://ilgam.studioyeolmae.com";
const publicPages = [
  ["/", landingMetadata],
  ["/guide", guideMetadata],
  ["/privacy", privacyMetadata],
  ["/terms", termsMetadata],
] as const;

describe("작업 화면 검색 차단 메타", () => {
  it("작업 화면 묶음 layout은 noindex·nofollow 메타를 단다", () => {
    expect(workspaceMetadata.robots).toEqual({ index: false, follow: false });
  });

  it("루트 layout과 공개 페이지(/, /guide, /privacy, /terms)에는 noindex가 없다", () => {
    expect(rootMetadata.robots).toBeUndefined();
    for (const [path, metadata] of publicPages) expect(metadata.robots, path).toBeUndefined();
  });
});

describe("공유 미리보기·대표 주소", () => {
  it("루트 layout은 운영 주소 기준과 공유 미리보기를 site-meta 상수에서 받고, 대표 주소(canonical)는 두지 않는다", () => {
    expect(String(rootMetadata.metadataBase)).toBe(`${ORIGIN}/`);
    expect(rootMetadata.openGraph).toBe(SITE_OPEN_GRAPH);
    expect(rootMetadata.twitter).toBe(SITE_TWITTER);
    expect(rootMetadata.alternates).toBeUndefined();
    expect(SITE_OPEN_GRAPH).toMatchObject({
      type: "website",
      locale: "ko_KR",
      siteName: "일감체크",
      images: [{ url: "/og/ilgamcheck-social.png", width: 1200, height: 630 }],
    });
    expect(SITE_TWITTER).toMatchObject({ card: "summary_large_image", images: ["/og/ilgamcheck-social.png"] });
  });

  it("공개 페이지는 저마다 자기 주소를 대표 주소로 둔다", () => {
    for (const [path, metadata] of publicPages) expect(metadata.alternates, path).toEqual({ canonical: path });
  });

  it("랜딩만의 제목·설명에 '외주'가 들어가고, 공유 미리보기는 상수를 펼쳐 쓴다", () => {
    expect(LANDING_TITLE).toContain("외주");
    expect(LANDING_DESCRIPTION).toContain("외주");
    expect(landingMetadata.title).toEqual({ absolute: LANDING_TITLE });
    expect(landingMetadata.description).toBe(LANDING_DESCRIPTION);
    expect(landingMetadata.openGraph).toEqual({ ...SITE_OPEN_GRAPH, url: "/" });
  });

  it("Vite Sites 빌드(index.html)와 같은 공유 미리보기 값을 쓴다", () => {
    const html = renderDeploymentHtml(readFileSync(resolve(process.cwd(), "index.html"), "utf8"));
    expect(html).toContain(`property="og:title" content="${SITE_OPEN_GRAPH.title}"`);
    expect(html).toContain(`property="og:description" content="${SITE_OPEN_GRAPH.description}"`);
    expect(html).toContain(`property="og:image" content="${ORIGIN}${SITE_OG_IMAGE.url}"`);
    expect(html).toContain(`property="og:image:width" content="${SITE_OG_IMAGE.width}"`);
    expect(html).toContain(`property="og:image:height" content="${SITE_OG_IMAGE.height}"`);
    expect(html).toContain(`property="og:image:alt" content="${SITE_OG_IMAGE.alt}"`);
    expect(html).toContain(`name="twitter:card" content="${SITE_TWITTER.card}"`);
  });
});

describe("랜딩 구조화 데이터(JSON-LD)", () => {
  it("조직과 무료 소프트웨어만 알리고 평점·후기·연락처는 넣지 않는다", () => {
    const data = JSON.parse(landingJsonLd(ORIGIN));
    expect(data["@context"]).toBe("https://schema.org");
    const [organization, app] = data["@graph"];
    expect(organization).toEqual({ "@type": "Organization", "@id": `${ORIGIN}/#org`, name: "열매스튜디오", url: `${ORIGIN}/` });
    expect(app).toMatchObject({
      "@type": "SoftwareApplication",
      "@id": `${ORIGIN}/#app`,
      name: "일감체크",
      url: `${ORIGIN}/`,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      inLanguage: "ko-KR",
      publisher: { "@id": `${ORIGIN}/#org` },
      offers: { "@type": "Offer", price: "0", priceCurrency: "KRW", description: "무료 플랜: 동시 2건·누적 10건" },
    });
    expect(JSON.stringify(data)).not.toMatch(/aggregateRating|review|telephone|address|email/i);
  });

  it("<는 \\u003c로 바꿔 script 태그를 닫지 못하게 한다", () => {
    const value = { name: "</script><script>alert(1)</script>" };
    const serialized = serializeJsonLd(value);
    expect(serialized).not.toContain("<");
    expect(serialized).toContain("\\u003c/script>");
    expect(JSON.parse(serialized)).toEqual(value);
    expect(landingJsonLd(ORIGIN)).not.toContain("<");
  });
});

describe("robots.txt · sitemap.xml · llms.txt", () => {
  const read = (file: string) => readFileSync(resolve(process.cwd(), "public", file), "utf8");

  it("robots.txt는 모두 허용하고 사이트맵만 알린다(작업 화면은 Disallow 하지 않고 noindex로 막는다)", () => {
    const robots = read("robots.txt");
    expect(robots).toMatch(/^User-agent: \*\r?$/m);
    expect(robots).toMatch(/^Allow: \/\r?$/m);
    expect(robots).not.toMatch(/^Disallow:/im);
    expect(robots).toMatch(/^Sitemap: https:\/\/ilgam\.studioyeolmae\.com\/sitemap\.xml\r?$/m);
  });

  it("sitemap.xml은 공개 페이지 4개만 절대 https 주소로 담는다", () => {
    const sitemap = read("sitemap.xml");
    expect(sitemap.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(sitemap).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    expect(locations).toEqual([`${ORIGIN}/`, `${ORIGIN}/guide`, `${ORIGIN}/privacy`, `${ORIGIN}/terms`]);
  });

  it("llms.txt는 소개·핵심 페이지와 지금 되는 것·아직 안 되는 것을 나눠 적는다", () => {
    const llms = read("llms.txt");
    expect(llms).toMatch(/^# 일감체크\r?$/m);
    expect(llms).toMatch(/^> .*외주.*/m);
    expect(llms).toContain("## 지금 되는 것");
    expect(llms).toContain("## 아직 안 되는 것");
    for (const path of ["/guide", "/terms", "/privacy"]) expect(llms).toContain(`${ORIGIN}${path}`);
    // 작업 화면·고객 링크·체험 주소는 알리지 않는다.
    expect(llms).not.toMatch(/\/(?:today|jobs|packages|settings|feedback|r|demo)(?:\/|\)|\s|$)/m);
  });
});
