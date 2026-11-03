import type { Metadata } from "next";
import { FeedbackPanel } from "@/components/feedback-panel";

export const metadata: Metadata = { title: "의견 보내기" };

export default function FeedbackPage() {
  return <FeedbackPanel />;
}
