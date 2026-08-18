import Image from "next/image";
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_HREF } from "@/lib/guardian/constants";

export function SiteFooter() {
  return (
    <footer style={{ background: "#3F362C" }}>
      <div
        className="wrap"
        style={{ padding: "40px 20px 48px", display: "flex", flexDirection: "column", gap: 14 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Image src="/guardian/logo.png" alt="동행고리 심볼" width={24} height={27} style={{ objectFit: "contain" }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: "#FFF6DE" }}>동행고리AI</span>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: "#D8CDBB" }}>
          전화 문의{" "}
          <a href={SUPPORT_PHONE_HREF} style={{ color: "var(--sun)", fontWeight: 700 }}>
            {SUPPORT_PHONE_DISPLAY}
          </a>
        </p>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: "#B8AC9B" }}>
          동행고리AI는 의료적 진단이나 판단을 하지 않습니다. 최종 일정과 지원 내용은 담당자가 확인합니다.
          <br />
          신청 확인과 연락을 위해 필요한 정보만 수집합니다.
        </p>
        <p style={{ margin: 0, fontSize: 13, color: "#8F8373" }}>© 동행고리AI</p>
      </div>
    </footer>
  );
}
