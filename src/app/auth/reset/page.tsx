import type { Metadata } from "next";

import { PasswordResetForm } from "@/components/password-reset-form";

export const metadata: Metadata = { title: "비밀번호 재설정" };

export default function PasswordResetPage() {
  return <PasswordResetForm />;
}
