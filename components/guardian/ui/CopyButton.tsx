"use client";

import { useEffect, useState } from "react";

// 신청번호 복사. 외부 toast 라이브러리를 추가하지 않고
// 버튼 옆 인라인 피드백으로 처리한다.
export function CopyButton({ value, label = "복사" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!copied && !failed) return;
    const timer = setTimeout(() => {
      setCopied(false);
      setFailed(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, [copied, failed]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setFailed(false);
    } catch {
      // 클립보드 권한이 없거나 비보안 컨텍스트인 경우 — 성공한 척하지 않는다.
      setFailed(true);
      setCopied(false);
    }
  }

  return (
    <>
      <button type="button" className="copybtn" onClick={copy}>
        {label}
      </button>
      <span className="copy-feedback" role="status" aria-live="polite">
        {copied ? "신청번호를 복사했어요." : failed ? "복사하지 못했어요. 길게 눌러 복사해 주세요." : ""}
      </span>
    </>
  );
}
