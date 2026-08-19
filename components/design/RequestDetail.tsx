"use client";

import type { IntakeAnalysis, IntakeResponseMeta } from "@/lib/ai/schema";
import {
  getIntakeFieldDraft,
  isHumanResolved,
  type IntakeFieldResolutionAction,
  type IntakeFieldResolutionState,
} from "@/lib/ui/intakeFieldResolution";
import { buildDesignGroups } from "./analysisFields";
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

const REQUEST_TITLE_LABELS: Partial<
  Record<IntakeAnalysis["request_type"]["value"], string>
> = {
  HOSPITAL_COMPANION: "병원동행",
  PHARMACY: "약국 동행",
  GUARDIAN_CONTACT: "보호자 연락",
};

export function RequestDetail({
  analysis,
  transcript,
  channelLabel,
  receivedLabel,
  onReanalyze,
  requestId,
  resolutions,
  onResolutionAction,
}: RequestDetailProps) {
  const person = analysis.caller.person_candidates[0] ?? null;

  if (analysis.safety.signal_detected) {
    return (
      <UrgentIntakeDetail
        target={person?.name ?? null}
        receivedLabel={receivedLabel}
        channelLabel={channelLabel}
        transcript={transcript}
        sourceLabel="분석 미리보기"
        urgentConfidence={analysis.safety.urgent_confident}
        onReanalyze={onReanalyze}
      />
    );
  }

  const groups = buildDesignGroups(analysis);
  const allFields = groups.flatMap((group) => group.fields);
  const pendingCount = allFields.filter(
    (field) =>
      field.status === "NEEDS_CONFIRMATION" &&
      !isHumanResolved(getIntakeFieldDraft(resolutions, requestId, field.key)),
  ).length;
  const attachedQuestions = new Set(
    allFields
      .filter((field) => field.status === "NEEDS_CONFIRMATION")
      .map((field) => field.confirmationQuestion)
      .filter((question): question is string => Boolean(question)),
  );
  const remainingQuestions = analysis.confirmation_questions.filter(
    (question) => !attachedQuestions.has(question),
  );

  const intentLabel = REQUEST_TITLE_LABELS[analysis.request_type.value];
  const title = person
    ? intentLabel
      ? `${person.name} 어르신의 ${intentLabel} 요청`
      : `${person.name} 어르신의 요청`
    : "대상자 확인이 필요한 요청";

  return (
    <main className="dc-detail">
      <div className="dcw-scroll">
        <div className="dcw-inner">
          <header className="dcw-head">
            <div className="dcw-head-top">
              <h1 className="dcw-head-title">{title}</h1>
              <span className="dc-chip dc-chip-neutral">미리보기</span>
            </div>
            <p className="dcw-head-meta">
              {[channelLabel, receivedLabel].join(" · ")}
            </p>
            {pendingCount > 0 ? (
              <p className="dcw-head-attn">확인할 정보 {pendingCount}개 있어요</p>
            ) : null}
          </header>

          <section className="dcw-section" aria-label="요청 내용">
            <h2 className="dcw-section-title">요청 내용</h2>
            <p className="dcw-utterance">{transcript}</p>
          </section>

          {groups.map((group) => (
            <section className="dcw-section" aria-label={group.name} key={group.name}>
              <h2 className="dcw-section-title">{group.name}</h2>
              <div className="dcw-rows">
                {group.fields.map((field) => (
                  <ResolvableFieldRow
                    requestId={requestId}
                    field={field}
                    draft={getIntakeFieldDraft(resolutions, requestId, field.key)}
                    onAction={onResolutionAction}
                    key={`${requestId}-${field.key}`}
                  />
                ))}
              </div>
            </section>
          ))}

          {remainingQuestions.length > 0 ? (
            <section className="dcw-section" aria-label="함께 확인해 주세요">
              <h2 className="dcw-section-title">함께 확인해 주세요</h2>
              <div className="dcw-rows">
                {remainingQuestions.map((question, index) => (
                  <p className="dcw-quiet" key={`q-${index}`}>
                    {question}
                  </p>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>

      <div className="dcw-cta">
        <div className="dcw-cta-text">
          <span className="dcw-cta-helper">
            저장 전 미리보기예요. AI는 후보와 근거까지만 제시합니다.
          </span>
          <span className="dcw-cta-note">
            미리보기는 저장되지 않아 접수할 수 없어요.
          </span>
        </div>
        <div className="dcw-cta-actions">
          <button type="button" className="dcw-btn-ghost" onClick={onReanalyze}>
            내용 수정하고 다시 분석
          </button>
          <button type="button" className="dcw-btn-primary" disabled>
            접수 확정
          </button>
        </div>
      </div>
    </main>
  );
}
