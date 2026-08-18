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
  /** 확정을 실제로 보낸다. 없으면 확정 영역이 준비 중 상태로 그려진다. */
  onConfirm?: (acknowledge: boolean, reason: string | null) => void;
  /** blocker 하나를 통화로 확인해 게이트를 푼다. */
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

/** 상단 제목 — 누구의 어떤 요청인지 한 줄로. */
export function savedIntakeTitle(
  target: string | null,
  intent: string | null,
): string {
  if (!target) return "대상자 확인이 필요한 요청";
  if (intent && intent !== "긴급") return `${target} 어르신의 ${intent} 요청`;
  return `${target} 어르신의 요청`;
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
  // 생년월일은 어르신 신원 참고값이고 server gate가 확정 조건으로 요구하지 않는다.
  // 헤더의 "확인할 정보 N개"는 지금 해야 할 일을 세는 숫자이므로 여기서 빼둔다 —
  // 넣으면 전화 접수마다 처리할 일이 하나 더 있는 것처럼 보인다.
  const pendingCount = fields.filter(
    (field) =>
      field.key !== "birth" &&
      field.status === "NEEDS_CONFIRMATION" &&
      !isHumanResolved(getIntakeFieldDraft(resolutions, requestId, field.key)),
  ).length;

  const ELDER_KEYS = new Set(["target", "birth"]);
  const visitFields = fields.filter((field) => !ELDER_KEYS.has(field.key));
  // 대상자와 생년월일은 둘 다 어르신 본인 정보라 같은 묶음으로 보여준다.
  const elderFields = fields.filter((field) => ELDER_KEYS.has(field.key));

  const renderField = (field: ResolvableField) => (
    <ResolvableFieldRow
      requestId={requestId}
      field={field}
      draft={getIntakeFieldDraft(resolutions, requestId, field.key)}
      onAction={onResolutionAction}
      // 서버가 받는 항목에만 확인 버튼을 준다 — 받지 않는 항목에 그려 두면
      // 눌러도 422만 나고 왜 안 되는지 알 방법이 없다.
      onVerify={
        onVerify && isVerifiableField(field.key)
          ? (value) => onVerify(field.key, value)
          : undefined
      }
      verifyBusy={confirmBusy}
      key={`${requestId}-${field.key}`}
    />
  );

  return (
    <main className="dc-detail">
      <div className="dcw-scroll">
        <div className="dcw-inner">
          <header className="dcw-head">
            <div className="dcw-head-top">
              <h1 className="dcw-head-title">
                {savedIntakeTitle(detail.target, detail.intent)}
              </h1>
              {detail.confirmed ? (
                <span className="dc-chip dc-chip-good">확정</span>
              ) : detail.status ? (
                <span className="dc-chip dc-chip-neutral">{detail.status}</span>
              ) : null}
            </div>
            <p className="dcw-head-meta">
              {[detail.channel ?? "경로 미상", detail.createdAt ?? "접수 시각 미상"].join(
                " · ",
              )}
            </p>
            {/* 확정된 접수는 편집이 잠기므로 확인 안내를 반복하지 않는다. */}
            {!detail.confirmed && pendingCount > 0 ? (
              <p className="dcw-head-attn">확인할 정보 {pendingCount}개 있어요</p>
            ) : null}
          </header>

          <section className="dcw-section" aria-label="요청 내용">
            <h2 className="dcw-section-title">요청 내용</h2>
            <p className="dcw-utterance">
              {detail.utterance || "원문이 저장되지 않았습니다."}
            </p>
          </section>

          <section className="dcw-section" aria-label="동행 정보">
            <h2 className="dcw-section-title">동행 정보</h2>
            <div className="dcw-rows">{visitFields.map(renderField)}</div>
          </section>

          <section className="dcw-section" aria-label="어르신 정보">
            <h2 className="dcw-section-title">어르신 정보</h2>
            <div className="dcw-rows">
              {detail.intent ? (
                <div className="dcw-row">
                  <div className="dcw-row-main">
                    <span className="dcw-row-label">요청 유형</span>
                    <span className="dcw-row-value-wrap">
                      <span className="dcw-row-value">{detail.intent}</span>
                    </span>
                  </div>
                </div>
              ) : null}
              {elderFields.map(renderField)}
            </div>
          </section>

          {detail.notes.length > 0 ? (
            <section className="dcw-section" aria-label="이동 지원">
              <h2 className="dcw-section-title">이동 지원</h2>
              <div className="dcw-rows">
                {detail.notes.map((note, index) => (
                  <div className="dcw-row" key={`note-${index}`}>
                    <div className="dcw-row-main">
                      <span className="dcw-row-label">
                        {index === 0 ? "참고" : ""}
                      </span>
                      <span className="dcw-row-value-wrap">
                        <span className="dcw-row-value">{note}</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

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

          <SavedIntakeAuditSection state={auditState} onRetry={onAuditRetry} />
        </div>
      </div>

      <SavedIntakeFinalization
        confirmed={detail.confirmed}
        gate={detail.gate}
        onConfirm={onConfirm}
        busy={confirmBusy}
        error={confirmError}
      />
    </main>
  );
}
