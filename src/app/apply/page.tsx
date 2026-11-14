import type { Metadata } from "next";

import { BetaApplyForm } from "@/components/beta-apply-form";

export const metadata: Metadata = {
  title: "인터뷰·베타 신청",
  description: "일감체크 인터뷰·베타 참여 신청(스튜디오열매)",
};

export default function BetaApplyPage() {
  return <BetaApplyForm />;
}
