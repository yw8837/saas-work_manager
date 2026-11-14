"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { captureAcquisitionFromLocation } from "@/lib/acquisition-link";

/**
 * 어느 화면으로 들어오든 링크의 유입 경로 표시를 받아 두고 주소에서 지운다. 화면에는 아무것도 그리지 않는다.
 * 새로 열 때뿐 아니라 화면 안에서 다른 화면으로 넘어올 때도 받는다(고객 화면의 소개 링크처럼 유입 표시가 붙은 내부 링크).
 */
export function AcquisitionCapture() {
  const pathname = usePathname();
  useEffect(() => {
    captureAcquisitionFromLocation();
  }, [pathname]);
  return null;
}
