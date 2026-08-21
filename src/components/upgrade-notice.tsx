"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";

/**
 * 무료 플랜 한도에 걸렸을 때 보여주는 업그레이드 안내 블록.
 * CTA는 설정의 플랜 섹션으로 연결한다. 결제(Stripe)는 이후 hosted 모드에서 붙는다.
 */
export function UpgradeNotice({
  title,
  description,
  ctaLabel = "Pro 업그레이드",
  href = "/settings#plan",
}: {
  title: string;
  description: string;
  ctaLabel?: string;
  href?: string;
}) {
  return (
    <div className="upgradeNotice" role="note">
      <span className="upgradeNoticeIcon">
        <Sparkles size={18} />
      </span>
      <div className="upgradeNoticeBody">
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <Link href={href} className="upgradeNoticeCta">
        {ctaLabel}
      </Link>
    </div>
  );
}
