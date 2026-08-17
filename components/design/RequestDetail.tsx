"use client";

import type { IntakeAnalysis, IntakeResponseMeta } from "@/lib/ai/schema";
import {
  getIntakeFieldDraft,
  isHumanResolved,
  type IntakeFieldResolutionAction,
  type IntakeFieldResolutionState,
} from "@/lib/ui/intakeFieldResolution";
import {
  buildDesignGroups,
  summarizeNeeds,
} from "./analysisFields";
import { ResolvableFieldRow } from "./ResolvableFieldRow";
import { UrgentIntakeDetail } from "./UrgentIntakeDetail";

interface RequestDetailProps {
  analysis: IntakeAnalysis;
  transcript: string;
  meta: IntakeResponseMeta | null;
  channelLabel: string;
  receivedLabel: string;
  onReanalyze: () => void;
  requestId: string;
  resolutions: IntakeFieldResolutionState;
  onResolutionAction: (action: IntakeFieldResolutionAction) => void;
}

export function RequestDetail({
  analysis,
  transcript,
  meta,
  channelLabel,
  receivedLabel,
  onReanalyze,
  requestId,
  resolutions,
  onResolutionAction,
}: RequestDetailProps) {
  const person = analysis.caller.person_candidates[0] ?? null;
  const providerLabel = meta?.fallback_used
    ? "기본 분석"
    : meta?.provider_used === "team"
      ? "Team AI"
      : meta?.provider_used === "openai"
        ? "OpenAI"
        : "Mock";

  if (analysis.safety.signal_detected) {
    return (
      <UrgentIntakeDetail
        target={person?.name ?? null}
        receivedLabel={receivedLabel}
        channelLabel={channelLabel}
        transcript={transcript}
        sourceLabel={`분석 · ${providerLabel}`}
        urgentConfidence={analysis.safety.urgent_confident}
        onReanalyze={onReanalyze}
      />
    );
  }

  const groups = buildDesignGroups(analysis);
  const needs = summarizeNeeds(groups, (field) =>
    isHumanResolved(getIntakeFieldDraft(resolutions, requestId, field.key)),
  );
  const attachedQuestions = new Set(
    groups
      .flatMap((group) => group.fields)
      .filter((field) => field.status === "NEEDS_CONFIRMATION")
      .map((field) => field.confirmationQuestion)
      .filter((question): question is string => Boolean(question)),
  );
  const remainingQuestions = analysis.confirmation_questions.filter(
    (question) => !attachedQuestions.has(question),
  );

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

          {remainingQuestions.length > 0 ? (
            <div className="dc-block">
              <span className="dc-block-title">확인 과정</span>
              <div className="dc-checks">
                {remainingQuestions.map((question, index) => (
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
                <ResolvableFieldRow
                  requestId={requestId}
                  field={field}
                  draft={getIntakeFieldDraft(
                    resolutions,
                    requestId,
                    field.key,
                  )}
                  onAction={onResolutionAction}
                  key={`${requestId}-${field.key}`}
                />
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
