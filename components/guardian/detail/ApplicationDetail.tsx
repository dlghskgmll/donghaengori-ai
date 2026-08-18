"use client";

// 신청 상세 화면.
//
// 데이터 소스는 오직 서버 조회 결과(GuardianApplication)다.
// - URL에는 신청번호만 있고 전화번호는 없다. 전화번호는 세션 힌트에서 읽어
//   POST body로 보내 서버에서 대조한다.
// - 힌트가 없으면(새 브라우저에서 URL만 열었을 때) 데이터를 보여주지 않고
//   조회 화면으로 안내한다 — 신청번호만으로 개인정보를 공개하지 않는다.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeftIcon, DocumentIcon } from "@/components/guardian/ui/Icons";
import { CopyButton } from "@/components/guardian/ui/CopyButton";
import { StatusTimeline } from "./StatusTimeline";
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_HREF } from "@/lib/guardian/constants";
import {
  statusBadgeLabel,
  type GuardianApplication,
} from "@/lib/guardian/domain/application";
import {
  ageFromBirthDate,
  formatDateCompact,
  formatHospitalLine,
  formatScheduleLine,
  NOT_PROVIDED,
} from "@/lib/guardian/domain/format";
import { readApplicationHint } from "@/lib/guardian/recentApplication";

type ViewState =
  | { kind: "loading" }
  | { kind: "needs-lookup" }
  | { kind: "error"; message: string }
  | { kind: "ready"; application: GuardianApplication };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--cream)" }}>
      <div className="gd-topbar">
        <div className="gd-topbar__inner">
          <Link href="/guardian" className="iconbtn" aria-label="홈으로">
            <ChevronLeftIcon />
          </Link>
          <span className="gd-topbar__title">신청 확인</span>
          <span className="gd-topbar__spacer" />
        </div>
      </div>
      {children}
    </div>
  );
}

export function ApplicationDetail({ applicationNumber }: { applicationNumber: string }) {
  const router = useRouter();
  const [state, setState] = useState<ViewState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const hint = readApplicationHint();
      // 힌트가 없거나 다른 신청의 힌트라면 조회 화면을 거쳐야 한다.
      if (!hint || hint.applicationNumber.toUpperCase() !== applicationNumber.toUpperCase()) {
        setState({ kind: "needs-lookup" });
        return;
      }
      try {
        const response = await fetch("/api/guardian/applications/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ applicationNumber, guardianPhone: hint.phone }),
        });
        const payload = await response.json().catch(() => null);
        if (cancelled) return;
        if (response.status === 404) {
          setState({ kind: "needs-lookup" });
          return;
        }
        if (!response.ok || !payload?.application) {
          setState({ kind: "error", message: payload?.error ?? "잠시 문제가 발생했어요. 조금 뒤 다시 시도해주세요." });
          return;
        }
        setState({ kind: "ready", application: payload.application });
      } catch {
        if (!cancelled) {
          setState({ kind: "error", message: "잠시 문제가 발생했어요. 조금 뒤 다시 시도해주세요." });
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [applicationNumber]);

  if (state.kind === "loading") {
    return (
      <Shell>
        <div className="form-shell" style={{ paddingBottom: 80 }}>
          <p style={{ fontSize: 15, color: "var(--text-muted)" }} role="status">
            신청 내역을 확인하고 있어요.
          </p>
        </div>
      </Shell>
    );
  }

  if (state.kind === "needs-lookup") {
    return (
      <Shell>
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "88px 20px 80px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div style={{ width: 60, height: 60, borderRadius: "50%", border: "1.5px solid #E0D6C4", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-disabled)" }}>
            <DocumentIcon />
          </div>
          <h2 style={{ margin: "22px 0 0", fontSize: 20, fontWeight: 750 }}>본인 확인이 필요해요.</h2>
          <p style={{ margin: "12px 0 0", fontSize: 15, lineHeight: 1.6, color: "var(--text-muted)" }}>
            신청 내용을 보호하기 위해
            <br />
            신청번호와 보호자 휴대폰 번호로 확인해 주세요.
          </p>
          <button
            type="button"
            className="btn btn--primary btn--md"
            style={{ marginTop: 28, padding: "0 28px" }}
            onClick={() => router.push("/guardian/applications/lookup")}
          >
            신청 내역 확인하기
          </button>
        </div>
      </Shell>
    );
  }

  if (state.kind === "error") {
    return (
      <Shell>
        <div className="form-shell" style={{ paddingBottom: 80 }}>
          <p role="alert" style={{ fontSize: 15, lineHeight: 1.6, color: "var(--danger)" }}>
            {state.message}
          </p>
          <button type="button" className="btn btn--primary btn--md" style={{ marginTop: 20 }} onClick={() => router.refresh()}>
            다시 시도하기
          </button>
        </div>
      </Shell>
    );
  }

  const application = state.application;
  const { elder, visit, assistance, note, status, infoRequest } = application;
  const age = ageFromBirthDate(elder.birthDate);
  const headline = [
    visit.dateUnknown ? null : formatDateCompact(visit.date),
    visit.hospital,
  ]
    .filter(Boolean)
    .join(" · ");

  const summaryRows: Array<{ label: string; value: string }> = [
    { label: "병원", value: formatHospitalLine(visit) },
    { label: "일정", value: formatScheduleLine(visit) },
    { label: "필요한 도움", value: assistance.length > 0 ? assistance.join(", ") : NOT_PROVIDED },
    ...(elder.region ? [{ label: "거주 지역", value: elder.region }] : []),
    ...(note ? [{ label: "추가 내용", value: note }] : []),
  ];

  return (
    <Shell>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "28px 20px 80px" }}>
        {/* 상단: 사용자가 가장 알고 싶은 "지금 상태"를 먼저 보여준다. */}
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--text-faint)" }}>병원동행 신청</p>
        <h2 style={{ margin: "8px 0 0", fontSize: 24, fontWeight: 800, letterSpacing: "-0.015em", overflowWrap: "anywhere" }}>
          {elder.name} 어르신
          {age !== null ? (
            <span style={{ marginLeft: 8, fontSize: 15, fontWeight: 600, color: "var(--text-faint)" }}>
              {age}세
            </span>
          ) : null}
        </h2>
        {headline ? (
          <p style={{ margin: "8px 0 0", fontSize: 15, color: "var(--text-muted)", overflowWrap: "anywhere" }}>{headline}</p>
        ) : null}
        <div style={{ marginTop: 14 }}>
          <span className="gd-status-badge">{statusBadgeLabel(status)}</span>
        </div>

        {/* 신청번호는 secondary 정보로 내린다. */}
        <div className="appno" style={{ marginTop: 16 }}>
          신청번호 <span className="appno__value">{application.applicationNumber}</span>
          <CopyButton value={application.applicationNumber} />
        </div>

        <div className="card" style={{ marginTop: 24 }}>
          {summaryRows.map((row) => (
            <div key={row.label} className="card__row">
              <span className="card__label">{row.label}</span>
              <span className="card__value">{row.value}</span>
            </div>
          ))}
        </div>

        <h3 style={{ margin: "36px 0 18px", fontSize: 17, fontWeight: 750 }}>진행 상태</h3>
        <StatusTimeline status={status} infoRequest={infoRequest} />

        <p className="footnote">
          일정과 지원 내용은 담당자 확인 후 확정됩니다. 궁금하신 점은{" "}
          <a href={SUPPORT_PHONE_HREF} style={{ color: "var(--orange-ink)", fontWeight: 600 }}>
            {SUPPORT_PHONE_DISPLAY}
          </a>
          으로 문의해 주세요.
        </p>
      </div>
    </Shell>
  );
}
