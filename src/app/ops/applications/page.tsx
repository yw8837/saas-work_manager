import type { Metadata } from "next";

import { BetaOpsApplications } from "@/components/beta-ops-applications";

export const metadata: Metadata = {
  title: "베타 신청 운영",
  robots: "noindex, nofollow, noarchive",
};

export default function BetaOpsApplicationsPage() {
  return <BetaOpsApplications />;
}
