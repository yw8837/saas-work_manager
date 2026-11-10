"use client";

import { useEffect } from "react";

import { captureAcquisitionFromLocation } from "@/lib/acquisition-link";

/** 어느 화면으로 들어오든 링크의 유입 경로 표시를 받아 두고 주소에서 지운다. 화면에는 아무것도 그리지 않는다. */
export function AcquisitionCapture() {
  useEffect(() => {
    captureAcquisitionFromLocation();
  }, []);
  return null;
}
