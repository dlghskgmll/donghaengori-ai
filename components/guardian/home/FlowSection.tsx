import { FormIcon, PersonCheckIcon, PinCheckIcon } from "@/components/guardian/ui/Icons";

const STEPS = [
  { no: "01", Icon: FormIcon, title: "필요한 내용을 알려주세요", body: "어르신과 병원 방문 정보를 간단하게 입력합니다." },
  { no: "02", Icon: PersonCheckIcon, title: "담당자가 확인해요", body: "신청 내용을 담당 사회복지사가 확인하고 필요한 내용을 다시 확인합니다." },
  { no: "03", Icon: PinCheckIcon, title: "확정된 일정에 맞춰 함께해요", body: "확정된 일정에 맞춰 병원동행이 진행됩니다." },
];

export function FlowSection() {
  return (
    <section style={{ background: "var(--butter)", padding: "64px 0 76px", position: "relative", overflow: "hidden" }}>
      <div className="wrap" style={{ textAlign: "center" }}>
        <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-0.015em" }}>신청은 이렇게 진행돼요</h2>
        <p style={{ margin: "12px 0 44px", fontSize: 15, color: "#7C7261" }}>
          복잡한 절차 없이, 휴대폰으로 몇 분이면 충분해요.
        </p>
        <div className="flow-grid">
          <svg
            aria-hidden="true"
            className="desk-only"
            style={{ position: "absolute", top: 56, left: "12%", width: "76%", height: 60, zIndex: 0 }}
            viewBox="0 0 800 60"
            preserveAspectRatio="none"
          >
            <path d="M0,30 C130,-10 270,70 400,30 S670,-10 800,30" fill="none" stroke="#F0B24A" strokeWidth="3.5" strokeDasharray="12 14" strokeLinecap="round" />
          </svg>
          {STEPS.map(({ no, Icon, title, body }) => (
            <div key={no} style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div
                style={{
                  position: "relative",
                  width: 112,
                  height: 112,
                  borderRadius: "50%",
                  background: "#fff",
                  border: "3px solid var(--butter-line)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--orange)",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: -8,
                    left: -8,
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: "var(--orange)",
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 800,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 3px 0 var(--orange-shadow)",
                  }}
                >
                  {no}
                </span>
                <Icon />
              </div>
              <div style={{ fontSize: 19, fontWeight: 750, marginTop: 18 }}>{title}</div>
              <p style={{ margin: "10px 0 0", fontSize: 15, lineHeight: 1.6, color: "var(--text-muted)", maxWidth: "24em", textWrap: "pretty" }}>
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
