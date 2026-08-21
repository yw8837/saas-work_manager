import type { Metadata } from "next";
import { JobDetail } from "@/components/job-detail";

export const metadata: Metadata = { title: "일감 상세" };

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <JobDetail jobId={id} />;
}
