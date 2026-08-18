import Image from "next/image";
import Link from "next/link";

export function SiteHeader() {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: "rgba(255,255,255,.92)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <div
        className="wrap"
        style={{ height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}
      >
        <Link href="/guardian" style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <Image src="/guardian/logo.png" alt="동행고리 심볼" width={30} height={34} style={{ objectFit: "contain" }} priority />
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em" }}>
            동행고리<span style={{ color: "var(--orange)" }}>AI</span>
          </span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* 신청 확인 → 조회 화면. 임의의 상세로 바로 가지 않는다. */}
          <Link
            href="/guardian/applications/lookup"
            style={{
              minHeight: 44,
              display: "inline-flex",
              alignItems: "center",
              padding: "0 12px",
              fontSize: 15,
              fontWeight: 600,
              color: "var(--text-muted)",
            }}
          >
            신청 확인
          </Link>
          <Link
            href="/guardian/apply"
            className="btn btn--primary"
            style={{ minHeight: 40, height: 40, padding: "0 18px", fontSize: 14, fontWeight: 700, boxShadow: "none" }}
          >
            병원동행 신청하기
          </Link>
        </div>
      </div>
    </header>
  );
}
