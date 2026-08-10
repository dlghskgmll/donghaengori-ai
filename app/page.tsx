import type { Metadata } from "next";
import { IntakeWorkspace } from "@/components/IntakeWorkspace";

export const metadata: Metadata = {
  title: "병원동행 접수 분석",
  description: "사회복지사를 위한 병원동행 운영 Copilot",
};

export default function Home() {
  return <IntakeWorkspace />;
}
