"use client";

import { useState } from "react";
import type { SavedIntakeDetailView, SavedIntakeField } from "@/lib/ai/savedIntakeView";

interface SavedIntakeDetailProps {
  detail: SavedIntakeDetailView;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
}

function FieldRow({ field }: { field: SavedIntakeField }) {
  const [evOpen, setEvOpen] = useState(false);
  const inferred = field.status === "INFERRED";
  const needs = field.status === "NEEDS_CONFIRMATION";
  const hasEvidence = field.evidence.length > 0;

  return (
    <div className="dc-field">
      <span className="dc-field-label">{field.label}</span>
      <span className="dc-field-body">
        <span className="dc-field-value-row">
          <span className={`dc-field-value${needs ? " is-missing" : ""}`}>
            {field.value ?? "확인 필요"}
          </span>
          {inferred ? (
            <>
              <span className="dc-inferred-mark">· 추정</span>
              {hasEvidence ? (
                <button
                  type="button"
                  className="dc-ev-toggle"
                  aria-expanded={evOpen}
                  onClick={() => setEvOpen((open) => !open)}
                >
                  {evOpen ? "근거 접기" : "근거 보기"}
                </button>
              ) : null}
            </>
          ) : null}
          {needs ? <span className="dc-need-badge">확인 필요</span> : null}
        </span>

        {field.spoken ? (
          <span className="dc-field-sub">어르신 표현: ‘{field.spoken}’</span>
        ) : null}

        {hasEvidence && (needs || evOpen) ? (
          <span className="dc-evidence">
            {field.evidence.map((item, index) => (
              <span key={`${field.key}-ev-${index}`}>{item}</span>
            ))}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export function SavedIntakeDetail({
  detail,
  isLoading,
  error,
  onRetry,
}: SavedIntakeDetailProps) {
  if (isLoading) {
    return (
      <main className="dc-detail">
        <div className="dc-loading">
          <h2>요청 내용을 불러오고 있습니다</h2>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="dc-detail">
        <div className="dc-loading">
          <h2>요청 내용을 불러오지 못했습니다</h2>
          <p>{error}</p>
          <button type="button" className="dc-btn-ghost" onClick={onRetry}>
            다시 시도
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="dc-detail">
      <div className="dc-detail-head">
        <span className="dc-detail-name">{detail.target ?? "대상자 확인 필요"}</span>
        <span className="dc-detail-sub">어르신 정보</span>
        <span className="dc-detail-meta">
          {detail.createdAt ?? "접수 시각 미상"}
        </span>
        {detail.status ? (
          <span className="dc-chip dc-chip-neutral">{detail.status}</span>
        ) : null}
      </div>

      {detail.urgent ? (
        <div className="dc-alert" role="alert">
          <span className="dc-alert-text">
            긴급으로 접수된 요청입니다. 담당자가 직접 확인해 주세요.
          </span>
          <span className="dc-alert-note">AI는 응급 여부를 판단하지 않습니다.</span>
        </div>
      ) : null}

      <div className="dc-detail-body">
        <div className="dc-detail-left">
          <div className="dc-block">
            <span className="dc-block-title">
              요청 내용{" "}
              <span className="dc-block-title-sub">
                {detail.channel ?? "경로 미상"}
              </span>
            </span>
            <div className="dc-utterance">
              <span className="dc-utterance-meta">
                {detail.createdAt ?? "접수 시각 미상"}
              </span>
              <span className="dc-utterance-text">
                {detail.utterance || "원문이 저장되지 않았습니다."}
              </span>
            </div>
          </div>

          {detail.confirmQuestions.length > 0 ? (
            <div className="dc-block">
              <span className="dc-block-title">확인 과정</span>
              <div className="dc-checks">
                {detail.confirmQuestions.map((question, index) => (
                  <div className="dc-check" key={`q-${index}`}>
                    <span className="dc-check-who">담당자 확인 질문</span>
                    <span className="dc-check-text">{question}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="dc-divider" aria-hidden="true" />

        <div className="dc-detail-right">
          <div className="dc-group">
            <span className="dc-group-name">동행 정보</span>
            {detail.fields
              .filter((field) => field.key !== "target")
              .map((field) => (
                <FieldRow field={field} key={field.key} />
              ))}
          </div>

          <div className="dc-group">
            <span className="dc-group-name">요청 정보</span>
            {detail.intent ? (
              <div className="dc-field">
                <span className="dc-field-label">요청 유형</span>
                <span className="dc-field-body">
                  <span className="dc-field-value-row">
                    <span className="dc-field-value">{detail.intent}</span>
                  </span>
                </span>
              </div>
            ) : null}
            {detail.fields
              .filter((field) => field.key === "target")
              .map((field) => (
                <FieldRow field={field} key={field.key} />
              ))}
          </div>

          {detail.notes.length > 0 ? (
            <div className="dc-group">
              <span className="dc-group-name">이동 지원</span>
              {detail.notes.map((note, index) => (
                <div className="dc-field" key={`note-${index}`}>
                  <span className="dc-field-label">{index === 0 ? "참고" : ""}</span>
                  <span className="dc-field-body">
                    <span className="dc-field-value-row">
                      <span className="dc-field-value">{note}</span>
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="dc-actionbar">
        <span className="dc-actionbar-note">
          AI는 후보와 근거까지만 제시합니다. 최종 확정은 담당자가 합니다.
        </span>
        <span className="dc-actionbar-provider">저장된 접수 · #{detail.id}</span>
        <button type="button" className="dc-btn-primary" disabled>
          접수카드 확정
        </button>
      </div>
    </main>
  );
}
