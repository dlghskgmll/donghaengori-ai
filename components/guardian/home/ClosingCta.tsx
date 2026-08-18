import Link from "next/link";
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_HREF } from "@/lib/guardian/constants";
import { PhoneIcon } from "@/components/guardian/ui/Icons";
import { ClosingHill } from "./Scenery";

export function ClosingCta() {
  return (
    <section style={{ background: "#fff", position: "relative", overflow: "hidden" }}>
      <ClosingHill />
      <div style={{ background: "var(--grass)", textAlign: "center", padding: "8px 20px 64px", marginTop: -2 }}>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#fff", letterSpacing: "-0.015em" }}>
          지금 바로 신청해 보세요
        </h2>
        <p style={{ margin: "10px 0 22px", fontSize: 15, color: "rgba(255,255,255,.92)" }}>
          3분이면 충분해요. 나머지는 담당자가 함께합니다.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
          <Link href="/guardian/apply" className="btn btn--primary btn--lg" style={{ padding: "0 34px" }}>
            병원동행 신청하기
          </Link>
          <a
            href={SUPPORT_PHONE_HREF}
            className="btn"
            style={{ height: 56, padding: "0 26px", background: "#fff", color: "var(--ink)", fontSize: 16, fontWeight: 700 }}
          >
            <span style={{ color: "var(--orange)", display: "inline-flex" }}>
              <PhoneIcon size={18} strokeWidth={2} />
            </span>
            {SUPPORT_PHONE_DISPLAY}
          </a>
        </div>
      </div>
    </section>
  );
}
