import type { Metadata } from "next";
import { ApplicationLookup } from "@/components/guardian/lookup/ApplicationLookup";

export const metadata: Metadata = { title: "신청 확인" };

export default function LookupPage() {
  return <ApplicationLookup />;
}
