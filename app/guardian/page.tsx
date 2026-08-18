import type { Metadata } from "next";
import { SiteFooter } from "@/components/guardian/SiteFooter";
import { SiteHeader } from "@/components/guardian/SiteHeader";
import { AiPhoneSection } from "@/components/guardian/home/AiPhoneSection";
import { ClosingCta } from "@/components/guardian/home/ClosingCta";
import { FlowSection } from "@/components/guardian/home/FlowSection";
import { Hero } from "@/components/guardian/home/Hero";
import { TrustSection } from "@/components/guardian/home/TrustSection";

// 루트 layout의 title template("%s | 동행고리AI")이 붙지 않도록 절대 제목을 쓴다.
export const metadata: Metadata = { title: { absolute: "동행고리AI 보호자 포털" } };

export default function HomePage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--cream)" }}>
      <SiteHeader />
      <Hero />
      <FlowSection />
      <AiPhoneSection />
      <TrustSection />
      <ClosingCta />
      <SiteFooter />
    </div>
  );
}
