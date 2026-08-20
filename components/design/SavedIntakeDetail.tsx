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
  isNewRequestType,
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
    // '요청 내용' 은 확인 버튼이 없다 — 서버 verify 가 받지 않는 항목이고,
    // 눌러서 없앨 것도 아니다. 그런데 게이트는 막고 있어서, 안내가 없으면
    // 복지사에게는 확정할 방법이 없는 막다른 길로 보인다. 무엇을 해야
    // 열리는지 그 자리에 적는다.
    sub:
      field.key === "request"
        ? "직접 통화해 확인한 뒤, 아래 ‘확인 없이 접수’에서 사유를 남기고 접수하세요."
        : field.spoken
          ? `어르신 표현: ‘${field.spoken}’`
          : undefined,
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
      field.status === "NEEDS_CONFIRMATION" &&
      !isHumanResolved(getIntakeFieldDraft(resolutions, requestId, field.key)),
  ).length;

  // 말한 성함·주소는 '누구인가' 에 속한다 — 방문 정보가 아니라 어르신 쪽에
  // 붙어야 복지사가 대상자 확인을 한자리에서 한다.
  const ELDER_KEYS = new Set([
    "target", "spoken_name", "spoken_region",
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

            {/* 기존 흐름이 감당하지 못하는 요청. **병원·진료과가 빈 것은 못
                찾은 게 아니라 만들지 않은 것이다** — 복지사가 그걸 알고 봐야
                한다. 모르고 보면 "AI가 실패했네" 로 읽히고, 빈 칸을 직접
                채워 넣게 된다. */}
            {isNewRequestType(detail.requestType) ? (
              <p className="dcw-head-new" role="status">
                새로운 유형의 요청이에요 — 어떤 도움이 필요하신지 직접 확인해
                주세요. 병원과 진료과는 <strong>추측하지 않고 비워 두었어요.</strong>
              </p>
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

              {/* 등록된 케어 프로필에서 그대로 오는 사실들. 확신도 배지를
                  붙이지 않는다 — AI 가 추정한 값이 아니라 기관이 등록해 둔
                  것이다. '확인 필요' 를 달면 복지사가 자기 기관 기록을
                  의심하게 된다. */}
              {detail.profileFacts.map((fact) => (
                <div className="dcw-row" key={`fact-${fact.label}`}>
                  <div className="dcw-row-main">
                    <span className="dcw-row-label">{fact.label}</span>
                    <span className="dcw-row-value-wrap">
                      <span className="dcw-row-value">{fact.value}</span>
                    </span>
                  </div>
                </div>
              ))}
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

          {/* 통화 중에 AI 가 되물은 질문과 어르신의 답.
              **후속답변은 별도 녹음이라 원문에 없다** — 이 영역이 없으면
              값이 어디서 왔는지 복지사가 확인할 방법이 아예 없다. 값만
              바뀌어 있고 근거를 못 대면 그 값을 믿을 수 없다. */}
          {detail.followups.length > 0 ? (
            <section className="dcw-section" aria-label="통화 중 되물은 것">
              <h2 className="dcw-section-title">통화 중 되물은 것</h2>
              <div className="dcw-post">
                {detail.followups.map((f, index) => (
                  <div className="dcw-fu" key={`fu-${index}`}>
                    <p className="dcw-fu-q">{f.question}</p>
                    {/* 답이 없는 경우가 실제로 있다(무응답·전사 실패). 빈칸으로
                        두면 "안 물어봤다" 와 "물었는데 답을 못 얻었다" 가
                        구분되지 않는다. */}
                    <p className="dcw-fu-a">{f.answer || "답변 없음"}</p>
                    <p className="dcw-fu-r">
                      {f.result
                        ? `반영: ${f.result}`
                        : "확인 필요 그대로 — 사회복지사가 다시 확인"}
                      {f.at ? ` · ${f.at}` : ""}
                    </p>
                  </div>
                ))}
                {/* 왜 하나만 물었는지 답할 수 있어야 한다. */}
                {detail.followupStopped ? (
                  <p className="dcw-quiet">
                    되묻기를 그만둔 이유: {detail.followupStopped}
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}

          {/* 외출 전 참고 — 기상·대기.
              **판단하지 않고 참고만 적는다.** "가지 마세요" 는 우리가 할 말이
              아니다. 비가 오는지 미세먼지가 나쁜지를 알려주면 우산·마스크를
              챙길지는 복지사가 정한다.
              서버가 못 채우면 빈 배열이라 이 영역 자체가 안 나온다 — 외부
              API 가 미연동이거나 좌표를 못 찾는 경우다. */}
          {detail.outingChecklist.length > 0 ? (
            <section className="dcw-section" aria-label="외출 전 참고">
              <h2 className="dcw-section-title">외출 전 참고</h2>
              <ul className="dcw-checklist">
                {detail.outingChecklist.map((line, index) => (
                  <li key={`outing-${index}`}>{line}</li>
                ))}
              </ul>
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
