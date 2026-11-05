import type { Metadata } from "next";

import { BetaConfirmView } from "@/components/beta-confirm-view";

export const metadata: Metadata = {
  title: "이메일 주소 확인",
  robots: "noindex, nofollow, noarchive",
};

export default async function BetaConfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <BetaConfirmView token={token} />;
}
