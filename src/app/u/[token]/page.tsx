import type { Metadata } from "next";

import { BetaUnsubscribeView } from "@/components/beta-unsubscribe-view";

export const metadata: Metadata = {
  title: "수신거부 / Unsubscribe",
  robots: "noindex, nofollow, noarchive",
};

export default async function BetaUnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <BetaUnsubscribeView token={token} />;
}
