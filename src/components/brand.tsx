import Link from "next/link";
import { Check } from "lucide-react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="brand" aria-label="일감체크 홈">
      <span className="brandMark" aria-hidden="true">
        <Check size={17} strokeWidth={3} />
      </span>
      {!compact && <span>일감체크</span>}
    </Link>
  );
}
