import { ShieldCheckIcon } from "@/components/guardian/ui/Icons";

export function TrustSection() {
  return (
    <section style={{ background: "#fff", borderTop: "1px solid var(--line)" }}>
      <div className="wrap" style={{ maxWidth: 760, paddingTop: 64, paddingBottom: 72, textAlign: "center" }}>
        <ShieldCheckIcon />
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.015em" }}>
          신청했다고 바로 확정되는 것은 아니에요.
        </h2>
        <p style={{ margin: "16px 0 0", fontSize: 16, lineHeight: 1.7, color: "var(--text-muted)", textWrap: "pretty" }}>
          입력한 내용은 담당 사회복지사가 확인한 뒤 최종 일정과 지원 내용을 확정합니다.
          <br />
          확인이 필요한 부분이 있으면 보호자님께 먼저 연락드려요.
        </p>
        <p style={{ margin: "14px 0 0", fontSize: 14, lineHeight: 1.6, color: "var(--text-faint)" }}>
          AI는 신청 내용을 정리하는 역할을 하며, 의료적 판단이나 진단을 하지 않습니다.
        </p>
      </div>
    </section>
  );
}
