"use client";

import type { SavedIntakeDetailView, SavedIntakeField } from "@/lib/ai/savedIntakeView";
import {
  findFieldConfirmationQuestion,
  getIntakeFieldDraft,
  isHumanResolved,
  type IntakeFieldResolutionAction,
  type IntakeFieldResolutionState,
} from "@/lib/ui/intakeFieldResolution";
import {
  ResolvableFieldRow,
  type ResolvableField,
} from "./ResolvableFieldRow";
import { isVerifiableField, type IntakeAuditState } from "@/lib/ui/intakeFinalization";
import {
  SavedIntakeAuditSection,
  SavedIntakeFinalization,
} from "./SavedIntakeReviewShell";
import { UrgentIntakeDetail } from "./UrgentIntakeDetail";

interface SavedIntakeDetailProps {
  detail: SavedIntakeDetailView;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  requestId: string;
  resolutions: IntakeFieldResolutionState;
  onResolutionAction: (action: IntakeFieldResolutionAction) => void;
  auditState: IntakeAuditState;
  onAuditRetry?: () => void;
  onConfirm?: (acknowledge: boolean, reason: string | null) => void;
  onVerify?: (field: string, value: string) => void;
  confirmBusy?: boolean;
  confirmError?: string | null;
}

function toResolvableField(
  field: SavedIntakeField,
  questions: string[],
  editable: boolean,
): ResolvableField {
  return {
    key: field.key,
    label: field.label,
    display: field.value ?? "확인 필요",
    status: field.status,
    evidence: field.evidence,
    sub: field.spoken ? `어르신 표현: ‘${field.spoken}’` : undefined,
    editable,
    confirmationQuestion: findFieldConfirmationQuestion(field.key, questions),
  };
}

export function SavedIntakeDetail({
  detail,
  isLoading,
  error,
  onRetry,
  requestId,
  resolutions,
  onResolutionAction,
  auditState,
  onAuditRetry,
  onConfirm,
  onVerify,
  confirmBusy,
  confirmError,
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

  if (detail.urgent) {
    return (
      <UrgentIntakeDetail
        target={detail.target}
        receivedLabel={detail.createdAt ?? "접수 시각 미상"}
        channelLabel={detail.channel ?? "경로 미상"}
        transcript={detail.utterance}
        sourceLabel={`저장된 접수 · #${detail.id}`}
        urgentConfidence={detail.urgentConfidence}
      />
    );
  }

  const fields = detail.fields.map((field) =>
    toResolvableField(field, detail.confirmQuestions, !detail.confirmed),
  );
  const attachedQuestions = new Set(
    fields
      .filter((field) => field.status === "NEEDS_CONFIRMATION")
      .map((field) => field.confirmationQuestion)
      .filter((question): question is string => Boolean(question)),
  );
  const remainingQuestions = detail.confirmQuestions.filter(
    (question) => !attachedQuestions.has(question),
  );
  const pendingLabels = fields
    .filter(
      (field) =>
        field.status === "NEEDS_CONFIRMATION" &&
        !isHumanResolved(
          getIntakeFieldDraft(resolutions, requestId, field.key),
        ),
    )
    .map((field) => field.label);
  const needs =
    pendingLabels.length > 0
      ? `${pendingLabels.join(" · ")} 확인이 필요합니다`
      : null;

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

          <SavedIntakeAuditSection state={auditState} onRetry={onAuditRetry} />

          <SavedIntakeFinalization
            confirmed={detail.confirmed}
            gate={detail.gate}
            onConfirm={onConfirm}
            onVerify={onVerify}
            busy={confirmBusy}
            error={confirmError}
          />
        </div>

        <div className="dc-divider" aria-hidden="true" />

        <div className="dc-detail-right">
          <div className="dc-group">
            <span className="dc-group-name">동행 정보</span>
            {fields
              .filter((field) => field.key !== "target")
              .map((field) => (
                <ResolvableFieldRow
                  requestId={requestId}
                  field={field}
                  draft={getIntakeFieldDraft(
                    resolutions,
                    requestId,
                    field.key,
                  )}
                  onAction={onResolutionAction}
                  onVerify={
                    onVerify && isVerifiableField(field.key)
                      ? (value) => onVerify(field.key, value)
                      : undefined
                  }
                  verifyBusy={confirmBusy}
                  key={`${requestId}-${field.key}`}
                />
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
            {fields
              .filter((field) => field.key === "target")
              .map((field) => (
                <ResolvableFieldRow
                  requestId={requestId}
                  field={field}
                  draft={getIntakeFieldDraft(
                    resolutions,
                    requestId,
                    field.key,
                  )}
                  onAction={onResolutionAction}
                  onVerify={
                    onVerify && isVerifiableField(field.key)
                      ? (value) => onVerify(field.key, value)
                      : undefined
                  }
                  verifyBusy={confirmBusy}
                  key={`${requestId}-${field.key}`}
                />
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
          최종 확정 가능 여부는 local 작업값이 아니라 server gate가 결정합니다.
        </span>
        <span className="dc-actionbar-provider">저장된 접수 · #{detail.id}</span>
      </div>
    </main>
  );
}
