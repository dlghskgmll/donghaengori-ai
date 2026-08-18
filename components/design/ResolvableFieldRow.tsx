"use client";

import { useId, useState } from "react";
import type { EvidenceStatus } from "@/lib/domain/intake";
import type {
  IntakeFieldDraft,
  IntakeFieldResolutionAction,
  ResolutionCandidate,
} from "@/lib/ui/intakeFieldResolution";

export interface ResolvableField {
  key: string;
  label: string;
  display: string;
  status: EvidenceStatus;
  evidence: string[];
  sub?: string;
  editable?: boolean;
  candidates?: ResolutionCandidate[];
  confirmationQuestion?: string | null;
}

interface ResolvableFieldRowProps {
  requestId: string;
  field: ResolvableField;
  draft: IntakeFieldDraft;
  onAction: (action: IntakeFieldResolutionAction) => void;
  /**
   * 통화로 확인한 값을 서버에 반영한다 — 게이트를 푸는 유일한 경로.
   *
   * 저장된 접수의 verify 가능한 항목에만 내려온다(미리보기·검증 불가 항목은
   * undefined). '적용'과 버튼을 나눈 이유는 감사 구분이다: 적용은 화면 작업값,
   * 이 버튼은 "통화로 확인했다"는 진술이라 감사 로그에 남는다.
   */
  onVerify?: (value: string) => void;
  verifyBusy?: boolean;
}

type LocalResolutionAction = IntakeFieldResolutionAction extends infer Action
  ? Action extends { requestId: string; fieldKey: string }
    ? Omit<Action, "requestId" | "fieldKey">
    : never
  : never;

export function ResolvableFieldRow({
  requestId,
  field,
  draft,
  onAction,
  onVerify,
  verifyBusy,
}: ResolvableFieldRowProps) {
  const [evOpen, setEvOpen] = useState(false);
  const inputId = useId();
  const candidateName = useId();
  const inferred = field.status === "INFERRED";
  const needs = field.status === "NEEDS_CONFIRMATION";
  const resolved = draft.resolution;
  const hasEvidence = field.evidence.length > 0;
  const candidates = field.candidates ?? [];
  const hasMultipleCandidates = candidates.length > 1;
  const selectedCandidate = hasMultipleCandidates
    ? draft.selectedCandidate
    : candidates[0]?.value ?? null;
  const acceptValue = selectedCandidate ?? field.display;
  const canAccept =
    acceptValue.trim().length > 0 && acceptValue !== "확인 필요";
  const actionable = field.editable && (inferred || needs || resolved !== null);
  const editing = draft.editValue !== null;
  const displayedValue = resolved?.value ?? field.display;
  const humanLabel =
    resolved?.status === "accepted"
      ? "담당자가 선택함"
      : resolved?.status === "edited"
        ? "담당자가 수정함"
        : null;

  const dispatch = (action: LocalResolutionAction) => {
    onAction({
      ...action,
      requestId,
      fieldKey: field.key,
    } as IntakeFieldResolutionAction);
  };

  const beginEdit = () => {
    const current =
      resolved?.value ?? (field.display === "확인 필요" ? "" : field.display);
    dispatch({ type: "beginEdit", value: current });
  };

  return (
    <div className="dc-field">
      <span className="dc-field-label">{field.label}</span>
      <div className="dc-field-body">
        {editing ? (
          <span className="dc-field-editor">
            <label className="dc-field-edit-label" htmlFor={inputId}>
              {field.label} 작업값
            </label>
            <input
              id={inputId}
              className="dc-field-input"
              value={draft.editValue ?? ""}
              autoFocus
              onChange={(event) =>
                dispatch({ type: "editChanged", value: event.target.value })
              }
              onKeyDown={(event) => {
                if (event.key === "Escape") dispatch({ type: "cancelEdit" });
              }}
            />
            <span className="dc-field-actions">
              <button
                type="button"
                className="dc-field-action"
                onClick={() => dispatch({ type: "cancelEdit" })}
              >
                취소
              </button>
              <button
                type="button"
                className="dc-field-action is-primary"
                disabled={!draft.editValue?.trim()}
                onClick={() => dispatch({ type: "applyEdit" })}
              >
                적용
              </button>
              {onVerify ? (
                <button
                  type="button"
                  className="dc-field-action is-verify"
                  disabled={!draft.editValue?.trim() || verifyBusy}
                  onClick={() => {
                    const value = draft.editValue?.trim();
                    if (value) onVerify(value);
                  }}
                >
                  {verifyBusy ? "반영 중…" : "통화로 확인함"}
                </button>
              ) : null}
            </span>
          </span>
        ) : (
          <>
            <span className="dc-field-value-row">
              <span
                className={`dc-field-value${needs && !resolved ? " is-missing" : ""}`}
              >
                {displayedValue}
              </span>

              {resolved ? (
                <span className="dc-human-mark">{humanLabel}</span>
              ) : inferred ? (
                <span className="dc-inferred-mark">· AI가 추정</span>
              ) : null}

              {!resolved && needs ? (
                <span className="dc-need-badge">확인 필요</span>
              ) : null}

              {hasEvidence && (!needs || resolved) ? (
                <button
                  type="button"
                  className="dc-ev-toggle"
                  aria-expanded={evOpen}
                  onClick={() => setEvOpen((open) => !open)}
                >
                  {evOpen ? "근거 접기" : "근거 보기"}
                </button>
              ) : null}
            </span>

            {resolved ? (
              <span className="dc-field-original">
                AI 초안: {field.display === "확인 필요" ? "값 없음" : field.display}
                {" · "}
                {inferred ? "추정" : "확인 필요"}
              </span>
            ) : null}

            {field.sub && !resolved ? (
              <span className="dc-field-sub">{field.sub}</span>
            ) : null}

            {hasEvidence && ((needs && !resolved) || evOpen) ? (
              <span className="dc-evidence">
                {field.evidence.map((item, index) => (
                  <span key={`${field.key}-ev-${index}`}>{item}</span>
                ))}
              </span>
            ) : null}

            {!resolved && needs && field.confirmationQuestion ? (
              <span className="dc-field-question">
                <span className="dc-field-question-label">확인 질문</span>
                <span>{field.confirmationQuestion}</span>
              </span>
            ) : null}

            {!resolved && (inferred || needs) && hasMultipleCandidates ? (
              <fieldset className="dc-field-candidates">
                <legend>AI가 제시한 후보</legend>
                {candidates.map((candidate) => (
                  <label
                    className="dc-field-candidate"
                    key={`${field.key}-${candidate.value}`}
                  >
                    <input
                      type="radio"
                      name={candidateName}
                      value={candidate.value}
                      checked={draft.selectedCandidate === candidate.value}
                      onChange={() =>
                        dispatch({
                          type: "candidateSelected",
                          value: candidate.value,
                        })
                      }
                    />
                    <span>
                      <span className="dc-field-candidate-value">
                        {candidate.value}
                      </span>
                      {candidate.evidence.map((item, index) => (
                        <span
                          className="dc-field-candidate-evidence"
                          key={`${candidate.value}-ev-${index}`}
                        >
                          {item}
                        </span>
                      ))}
                    </span>
                  </label>
                ))}
              </fieldset>
            ) : null}

            {actionable ? (
              <span className="dc-field-actions">
                {!resolved && canAccept ? (
                  <button
                    type="button"
                    className="dc-field-action is-primary"
                    disabled={hasMultipleCandidates && !selectedCandidate}
                    onClick={() =>
                      dispatch({ type: "accept", value: acceptValue })
                    }
                  >
                    이 값 사용
                  </button>
                ) : null}
                <button
                  type="button"
                  className="dc-field-action"
                  onClick={beginEdit}
                >
                  {needs && !resolved ? "값 입력" : "수정"}
                </button>
                {onVerify && resolved ? (
                  <button
                    type="button"
                    className="dc-field-action is-verify"
                    disabled={verifyBusy}
                    onClick={() => onVerify(resolved.value)}
                  >
                    {verifyBusy ? "반영 중…" : "이 값 통화로 확인함"}
                  </button>
                ) : null}
              </span>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
