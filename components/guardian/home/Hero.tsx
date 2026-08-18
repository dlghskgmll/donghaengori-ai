import Link from "next/link";
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_HREF } from "@/lib/guardian/constants";
import { HeroDecor, HeroScenery } from "./Scenery";

export function Hero() {
  return (
    <section
      style={{
        position: "relative",
        overflow: "hidden",
        background: "linear-gradient(180deg,#CBE8EF 0%,#E3F2E9 55%,#F2EFCF 100%)",
      }}
    >
      <HeroDecor />
      <div
        className="wrap"
        style={{
          position: "relative",
          paddingTop: 64,
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "var(--amber)",
            borderRadius: 999,
            padding: "8px 18px",
            fontSize: 14,
            fontWeight: 700,
            color: "var(--amber-ink)",
          }}
        >
          전남 어르신 병원동행 서비스
        </div>
        <h1 className="hero-h" style={{ marginTop: 20 }}>
          병원 가는 길,
          <br />
          혼자 준비하지 마세요.
        </h1>
        <p style={{ margin: "18px 0 0", fontSize: 17, lineHeight: 1.65, color: "var(--text-soft)", textWrap: "pretty" }}>
          어르신의 병원 일정과 필요한 도움을 알려주세요.
          <br />
          동행고리AI가 신청 내용을 정리하고, 담당 사회복지사가 확인합니다.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 30, justifyContent: "center" }}>
          <Link href="/apply" className="btn btn--primary btn--lg">
            병원동행 신청하기
          </Link>
          <Link href="/applications/lookup" className="btn btn--outline">
            신청 내용 확인
          </Link>
        </div>
        <p style={{ margin: "18px 0 0", fontSize: 15, color: "var(--text-soft)" }}>
          전화로도 문의하실 수 있어요 ·{" "}
          <a href={SUPPORT_PHONE_HREF} style={{ fontWeight: 750, color: "var(--orange-ink)" }}>
            {SUPPORT_PHONE_DISPLAY}
          </a>
        </p>
      </div>
      <HeroScenery />
    </section>
  );
}
