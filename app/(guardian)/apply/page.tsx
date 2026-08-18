import type { Metadata } from "next";
import { ApplicationForm } from "@/components/guardian/apply/ApplicationForm";

export const metadata: Metadata = { title: "병원동행 신청" };

export default function ApplyPage() {
  return <ApplicationForm />;
}
