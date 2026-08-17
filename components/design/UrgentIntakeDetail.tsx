"use client";

import { getUrgentPresentation } from "@/lib/ui/urgentIntake";

interface UrgentIntakeDetailProps {
  target: string | null;
  receivedLabel: string;
  channelLabel: string;
  transcript: string;
  sourceLabel: string;
  urgentConfidence: boolean | null | undefined;
  onReanalyze?: () => void;
}

export function UrgentIntakeDetail({
  target,
  receivedLabel,
  channelLabel,
  transcript,
  sourceLabel,
  urgentConfidence,
  onReanalyze,
}: UrgentIntakeDetailProps) {
  const presentation = getUrgentPresentation(true, urgentConfidence);
  if (!presentation) return null;

  return (
    <main className="dc-detail">
      <div className="dc-detail-head">
        <span className="dc-detail-name">{target ?? "대상자 확인 필요"}</span>
        <span className="dc-detail-sub">어르신 정보</span>
        <span className="dc-detail-meta">{receivedLabel}</span>
        <span className={`dc-chip dc-chip-${presentation.tone}`}>
          {presentation.label}
        </span>
      </div>

      <div className="dc-detail-body dc-urgent-layout">
        <div className="dc-detail-left">
          <div className="dc-block">
            <span className="dc-block-title">
              요청 내용 <span className="dc-block-title-sub">{channelLabel}</span>
            </span>
            <div className="dc-utterance">
              <span className="dc-utterance-meta">{receivedLabel}</span>
              <span className="dc-utterance-text">
                {transcript || "원문이 저장되지 않았습니다."}
              </span>
            </div>
          </div>

          <div className="dc-needs">
            <span className="dc-needs-label">사람 확인 우선</span>
            <span className="dc-needs-text">
              일반 접수카드를 만들지 않고 담당자 확인으로 넘깁니다.
            </span>
          </div>
        </div>

        <div className="dc-divider" aria-hidden="true" />

        <div className="dc-detail-right">
          <section
            className={`dc-urgent-panel is-${presentation.tone}`}
            role="alert"
            aria-labelledby="urgent-result-title"
          >
            <span className="dc-urgent-label">{presentation.label}</span>
            <h2 id="urgent-result-title" className="dc-urgent-title">
              {presentation.title}
            </h2>
            <p className="dc-urgent-description">{presentation.description}</p>

            <div className="dc-urgent-guide">
              <span className="dc-urgent-guide-title">담당자 확인 순서</span>
              <ol>
                {presentation.guidance.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            </div>
          </section>
        </div>
      </div>

      <div className="dc-actionbar">
        <span className="dc-actionbar-note">
          AI는 긴급 가능성을 알리고 사람에게 연결하는 데까지만 사용합니다.
        </span>
        <span className="dc-actionbar-provider">{sourceLabel}</span>
        {onReanalyze ? (
          <button type="button" className="dc-btn-ghost" onClick={onReanalyze}>
            원문 확인하고 다시 분석
          </button>
        ) : null}
      </div>
    </main>
  );
}
