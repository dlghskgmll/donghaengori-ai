"use client";

import type { SavedIntakeDetailView, SavedIntakeField } from "@/lib/ai/savedIntakeView";
import type { TeamPostDraft } from "@/lib/ai/teamPostRecord";
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
import {
  acceptLabelFor,
  isAccompanimentComplete,
  isReadOnlyField,
  verifyFieldFor,
  type IntakeAuditState,
} from "@/lib/ui/intakeFinalization";
import {
  SavedIntakeAuditSection,
  SavedIntakeFinalization,
  SavedIntakePostRecord,
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
  onComplete?: () => void;
  /** 다녀온 이야기로 기록 초안을 만든다. 완료된 접수에서만 내려온다. */
  onWriteRecord?: (memo: string) => Promise<TeamPostDraft>;
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
  onComplete,
  onWriteRecord,
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

  const completed = isAccompanimentComplete(detail.status);
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

  // 말한 성함·주소는 '누구인가' 에 속한다 — 방문 정보가 아니라 어르신 쪽에
  // 붙어야 복지사가 대상자 확인을 한자리에서 한다.
  const ELDER_KEYS = new Set([
    "target", "birth", "spoken_name", "spoken_region",
  ]);
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
      //
      // **'말한 성함'은 예외다.** 그 줄 자체는 서버가 받지 않지만, 들은
      // 이름을 대상자로 올리는 것이 복지사가 그 줄을 보고 할 일 그 자체다.
      // 그래서 target 으로 보낸다 — 그러지 않으면 이름을 눈으로 읽고 대상자
      // 칸에 손으로 다시 옮겨 적어야 한다.
      onVerify={(() => {
        const to = verifyFieldFor(field.key);
        return onVerify && to ? (value: string) => onVerify(to, value) : undefined;
      })()}
      acceptLabel={acceptLabelFor(field.key)}
      readOnly={isReadOnlyField(field.key)}
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

          {/* 다녀온 뒤에야 적을 것이 생긴다. 그 전에 칸을 띄워 두면
              가지도 않은 동행의 기록을 쓰게 된다. */}
          {completed && onWriteRecord ? (
            <SavedIntakePostRecord onCreate={onWriteRecord} />
          ) : null}

          <SavedIntakeAuditSection state={auditState} onRetry={onAuditRetry} />
        </div>
      </div>

      <SavedIntakeFinalization
        confirmed={detail.confirmed}
        completed={completed}
        gate={detail.gate}
        onConfirm={onConfirm}
        onComplete={onComplete}
        busy={confirmBusy}
        error={confirmError}
      />
    </main>
  );
}
