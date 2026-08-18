import type { Metadata } from "next";
import { ApplicationDetail } from "@/components/guardian/detail/ApplicationDetail";

export const metadata: Metadata = { title: "신청 상세" };

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ applicationNumber: string }>;
}) {
  const { applicationNumber } = await params;
  return <ApplicationDetail applicationNumber={decodeURIComponent(applicationNumber)} />;
}
