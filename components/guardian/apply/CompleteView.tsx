"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckIcon } from "@/components/guardian/ui/Icons";
import { CopyButton } from "@/components/guardian/ui/CopyButton";
import { CompleteHill } from "@/components/guardian/home/Scenery";

export function CompleteView() {
  const params = useSearchParams();
  const applicationNumber = params.get("number");

  // 신청번호 없이 이 화면에 직접 들어온 경우 — 가짜 신청을 보여주지 않는다.
  if (!applicationNumber) {
    return (
      <div className="center-screen">
        <h2 className="center-screen__title">신청 정보를 찾지 못했어요.</h2>
        <p className="center-screen__body">
          신청 완료 화면은 신청을 마친 직후에만 열 수 있어요.
          <br />
          신청번호가 있으시면 조회 화면에서 확인해 주세요.
        </p>
        <div className="center-screen__actions">
          <Link href="/applications/lookup" className="btn btn--primary btn--md">
            신청 내역 확인하기
          </Link>
          <Link href="/" className="btn btn--quiet">
            홈으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "linear-gradient(180deg,#FDF9F0 0%,#F2EFCF 100%)",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "60px 20px 20px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            background: "var(--orange)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 5px 0 var(--orange-shadow)",
          }}
        >
          <CheckIcon size={34} strokeWidth={3} />
        </div>
        <h2 style={{ margin: "26px 0 0", fontSize: 26, fontWeight: 800, letterSpacing: "-0.015em" }}>
          신청이 접수됐어요
        </h2>
        <p className="center-screen__body">
          병원동행 신청을 받았어요.
          <br />
          담당자가 내용을 확인한 뒤 알려드릴게요.
        </p>

        <div
          style={{
            marginTop: 28,
            border: "1.5px solid var(--line-strong)",
            background: "#fff",
            borderRadius: 14,
            padding: "18px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 14, color: "var(--text-faint)" }}>신청번호</span>
          <strong style={{ fontSize: 22, fontWeight: 800, letterSpacing: ".04em" }}>{applicationNumber}</strong>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
            <CopyButton value={applicationNumber} />
          </div>
        </div>

        <p style={{ margin: "16px 0 0", fontSize: 14, lineHeight: 1.6, color: "var(--text-muted)", maxWidth: "24em" }}>
          신청번호를 저장해두면 다른 기기에서도 진행 상황을 확인할 수 있어요.
        </p>

        <div className="center-screen__actions">
          <Link
            href={`/applications/${encodeURIComponent(applicationNumber)}`}
            className="btn btn--primary btn--md"
          >
            신청 내역 확인하기
          </Link>
          <Link href="/" className="btn btn--quiet">
            홈으로 돌아가기
          </Link>
        </div>
      </div>
      <CompleteHill />
    </div>
  );
}
