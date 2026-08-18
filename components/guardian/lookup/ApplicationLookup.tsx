"use client";

// 신청 조회 화면.
//
// - 전화번호는 절대 URL로 보내지 않는다 — POST body로만 전송한다.
// - 조회 성공 시 입력값을 세션 힌트에 담아 상세 화면으로 이동한다.
//   상세 화면은 항상 서버에 다시 조회한다(브라우저 저장소를 데이터 소스로 쓰지 않는다).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronLeftIcon } from "@/components/guardian/ui/Icons";
import { PhoneInput } from "@/components/guardian/ui/PhoneInput";
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_HREF } from "@/lib/guardian/constants";
import { rememberApplication } from "@/lib/guardian/recentApplication";

export function ApplicationLookup() {
  const router = useRouter();
  const [number, setNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function lookup(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (!number.trim() || !phone.trim()) {
      setError("신청번호와 휴대폰 번호를 모두 입력해 주세요.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      // Route Handler 는 /api/guardian/ 아래에 있다. /guardian/ 을 빼먹으면
      // nginx 의 일반 /api/ 규칙에 걸려 FastAPI 로 넘어가고, 거기엔 이 라우트가
      // 없어 404 가 난다 — 신청 생성은 되는데 조회만 안 되던 원인이다.
      const response = await fetch("/api/guardian/applications/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationNumber: number, guardianPhone: phone }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.application) {
        setError(payload?.error ?? "잠시 문제가 발생했어요. 조금 뒤 다시 시도해주세요.");
        setPending(false);
        return;
      }
      // 상세 화면이 서버 재조회에 쓸 입력값. URL에는 신청번호만 노출된다.
      rememberApplication(payload.application.applicationNumber, phone);
      router.push(`/applications/${encodeURIComponent(payload.application.applicationNumber)}`);
    } catch {
      setError("잠시 문제가 발생했어요. 조금 뒤 다시 시도해주세요.");
      setPending(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--cream)" }}>
      <div className="gd-topbar">
        <div className="gd-topbar__inner">
          <Link href="/" className="iconbtn" aria-label="홈으로">
            <ChevronLeftIcon />
          </Link>
          <span className="gd-topbar__title">신청 확인</span>
          <span className="gd-topbar__spacer" />
        </div>
      </div>

      <div className="form-shell" style={{ paddingBottom: 80 }}>
        <h2 className="form-title form-title--tight">신청 내역을 확인해볼게요</h2>
        <p className="form-sub">
          신청할 때 받은 신청번호와
          <br />
          보호자 휴대폰 번호를 입력해주세요.
        </p>

        <form onSubmit={lookup} className="form-stack">
          <div>
            <label htmlFor="lookup-number" className="field-label">
              신청번호 <span className="field-req">*</span>
            </label>
            <input
              id="lookup-number"
              className="input"
              value={number}
              onChange={(event) => {
                setNumber(event.target.value.toUpperCase());
                setError(null);
              }}
              placeholder="예: DH-260818-A7K4"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
            />
          </div>

          <PhoneInput
            id="lookup-phone"
            label="보호자 휴대폰 번호"
            required
            value={phone}
            onChange={(value) => {
              setPhone(value);
              setError(null);
            }}
            hint="신청할 때 입력한 보호자 연락처예요."
          />

          {error ? (
            <p role="alert" className="field-error" style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>
              {error}
            </p>
          ) : null}

          <button type="submit" className="btn btn--primary btn--md btn--block" disabled={pending}>
            {pending ? "신청 내역을 확인하고 있어요…" : "신청 내역 확인하기"}
          </button>
        </form>

        <p className="footnote">
          신청번호를 잊으셨나요? 전화로 문의하시면 담당자가 함께 확인해 드려요 ·{" "}
          <a href={SUPPORT_PHONE_HREF} style={{ color: "var(--orange-ink)", fontWeight: 600 }}>
            {SUPPORT_PHONE_DISPLAY}
          </a>
        </p>
      </div>
    </div>
  );
}
