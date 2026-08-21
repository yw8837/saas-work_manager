import type { Metadata } from "next";

import { PublicRevisionForm } from "@/components/public-revision-form";

export const metadata: Metadata = {
  robots: "noindex, nofollow, noarchive",
};

export default async function RevisionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicRevisionForm token={token} />;
}
