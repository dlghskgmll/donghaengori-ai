import { Suspense } from "react";
import type { Metadata } from "next";
import { CompleteView } from "@/components/guardian/apply/CompleteView";

export const metadata: Metadata = { title: "신청 완료" };

export default function ApplyCompletePage() {
  return (
    <Suspense fallback={<div className="center-screen"><p className="center-screen__body">신청 결과를 불러오고 있어요.</p></div>}>
      <CompleteView />
    </Suspense>
  );
}
