"use client";

import { useState } from "react";
import type { IntakeAnalysis, IntakeResponseMeta } from "@/lib/ai/schema";
import {
  buildDesignGroups,
  summarizeNeeds,
  type DesignField,
} from "./analysisFields";

interface RequestDetailProps {
  analysis: IntakeAnalysis;
  transcript: string;
  meta: IntakeResponseMeta | null;
  channelLabel: string;
  receivedLabel: string;
  onReanalyze: () => void;
}

function FieldRow({ field }: { field: DesignField }) {
  const [evOpen, setEvOpen] = useState(false);
  const inferred = field.status === "INFERRED";
  const needs = field.status === "NEEDS_CONFIRMATION";
  const hasEvidence = field.evidence.length > 0;

  return (
    <div className="dc-field">
      <span className="dc-field-label">{field.label}</span>
      <span className="dc-field-body">
        <span className="dc-field-value-row">
          <span
            className={`dc-field-value${needs ? " is-missing" : ""}`}
          >
            {field.display}
          </span>

          {/* 추정은 badge를 크게 두지 않고 값 옆 텍스트 + 근거 펼치기로 표현한다. */}
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

        {field.sub ? <span className="dc-field-sub">{field.sub}</span> : null}

        {inferred && evOpen ? (
          <span className="dc-evidence">
            {field.evidence.map((item, index) => (
              <span key={`${field.key}-ev-${index}`}>{item}</span>
            ))}
          </span>
        ) : null}

        {/* 확인 필요 항목은 근거를 접지 않고 바로 보여준다 — 담당자가 물어볼 내용이다. */}
        {needs && hasEvidence ? (
          <span className="dc-evidence">
            {field.evidence.map((item, index) => (
              <span key={`${field.key}-need-${index}`}>{item}</span>
            ))}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export function RequestDetail({
  analysis,
  transcript,
  meta,
  channelLabel,
  receivedLabel,
  onReanalyze,
}: RequestDetailProps) {
  const groups = buildDesignGroups(analysis);
  const needs = summarizeNeeds(groups);
  const person = analysis.caller.person_candidates[0] ?? null;
  const providerLabel = meta?.fallback_used
    ? "기본 분석"
    : meta?.provider_used === "team"
      ? "Team AI"
      : meta?.provider_used === "openai"
        ? "OpenAI"
        : "Mock";

  return (
    <main className="dc-detail">
      <div className="dc-detail-head">
        <span className="dc-detail-name">
          {person ? person.name : "대상자 확인 필요"}
        </span>
        <span className="dc-detail-sub">어르신 정보</span>
        <span className="dc-detail-meta">{receivedLabel}</span>
        <span className="dc-chip dc-chip-neutral">AI 초안</span>
      </div>

      {analysis.safety.signal_detected ? (
        <div className="dc-alert" role="alert">
          <span className="dc-alert-text">
            위험 신호가 감지되었습니다. 담당자가 직접 확인해 주세요.
            {analysis.safety.signal_type ? ` (${analysis.safety.signal_type})` : ""}
          </span>
          <span className="dc-alert-note">AI는 응급 여부를 판단하지 않습니다.</span>
        </div>
      ) : null}

      <div className="dc-detail-body">
        <div className="dc-detail-left">
          <div className="dc-block">
            <span className="dc-block-title">
              요청 내용 <span className="dc-block-title-sub">{channelLabel}</span>
            </span>
            <div className="dc-utterance">
              <span className="dc-utterance-meta">{receivedLabel}</span>
              <span className="dc-utterance-text">{transcript}</span>
            </div>
          </div>

          {analysis.confirmation_questions.length > 0 ? (
            <div className="dc-block">
              <span className="dc-block-title">확인 과정</span>
              <div className="dc-checks">
                {analysis.confirmation_questions.map((question, index) => (
                  <div className="dc-check" key={`q-${index}`}>
                    <span className="dc-check-who">담당자 확인 질문</span>
                    <span className="dc-check-text">{question}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {needs ? (
            <div className="dc-needs">
              <span className="dc-needs-label">남은 확인</span>
              <span className="dc-needs-text">{needs}</span>
            </div>
          ) : null}
        </div>

        <div className="dc-divider" aria-hidden="true" />

        <div className="dc-detail-right">
          {groups.map((group) => (
            <div className="dc-group" key={group.name}>
              <span className="dc-group-name">{group.name}</span>
              {group.fields.map((field) => (
                <FieldRow field={field} key={field.key} />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="dc-actionbar">
        <span className="dc-actionbar-note">
          AI는 후보와 근거까지만 제시합니다. 최종 확정은 담당자가 합니다.
        </span>
        <span className="dc-actionbar-provider">분석 · {providerLabel}</span>
        <button type="button" className="dc-btn-ghost" onClick={onReanalyze}>
          내용 수정하고 다시 분석
        </button>
        <button type="button" className="dc-btn-primary" disabled>
          접수카드 확정
        </button>
      </div>
    </main>
  );
}
