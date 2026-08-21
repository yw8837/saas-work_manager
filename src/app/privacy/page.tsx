import type { Metadata } from "next";

import { PolicyPage } from "@/components/policy-page";
import { POLICY_PUBLICATION_MANIFEST } from "@/lib/policies";

const document = POLICY_PUBLICATION_MANIFEST.documents.privacy;

export const metadata: Metadata = {
  title: document.title,
  description: document.metadataDescription,
};

export default function PrivacyPage() {
  return <PolicyPage document={document} />;
}
