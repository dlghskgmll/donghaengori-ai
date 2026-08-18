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
}

type LocalResolutionAction = IntakeFieldResolutionAction extends infer Action
  ? Action extends { requestId: string; fieldKey: string }
    ? Omit<Action, "requestId" | "fieldKey">
    : never
  : never;

/** 값이 없을 때 사용자에게 보여줄 문구. 내부 상태 용어를 그대로 노출하지 않는다. */
const UNRESOLVED_TEXT = "아직 확인되지 않았어요";

/** 필드별 입력 행동 라벨 — CTA만 읽어도 다음 행동을 알 수 있게 한다. */
const ENTRY_ACTION_LABELS: Record<string, string> = {
  date: "날짜 입력",
  time: "시간 입력",
  hospital: "병원 입력",
  dept: "진료과 입력",
  department: "진료과 입력",
  target: "대상자 입력",
  birth: "생년월일 입력",
};

export function entryActionLabel(fieldKey: string): string {
  return ENTRY_ACTION_LABELS[fieldKey] ?? "입력";
}

export function ResolvableFieldRow({
  requestId,
  field,
  draft,
  onAction,
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
  const unresolvedNow = needs && !resolved;
  const missingValue = field.display === "확인 필요";
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
    <div className={`dcw-row${unresolvedNow ? " is-unresolved" : ""}`}>
      {editing ? (
        <div className="dcw-row-main">
          <span className="dcw-row-label">{field.label}</span>
          <span className="dcw-row-editor">
            <label className="dcw-visually-hidden" htmlFor={inputId}>
              {field.label} 입력
            </label>
            <input
              id={inputId}
              className="dcw-row-input"
              value={draft.editValue ?? ""}
              autoFocus
              onChange={(event) =>
                dispatch({ type: "editChanged", value: event.target.value })
              }
              onKeyDown={(event) => {
                if (event.key === "Escape") dispatch({ type: "cancelEdit" });
              }}
            />
            <button
              type="button"
              className="dcw-action"
              onClick={() => dispatch({ type: "cancelEdit" })}
            >
              취소
            </button>
            <button
              type="button"
              className="dcw-action is-primary"
              disabled={!draft.editValue?.trim()}
              onClick={() => dispatch({ type: "applyEdit" })}
            >
              저장
            </button>
          </span>
        </div>
      ) : (
        <>
          <div className="dcw-row-main">
            <span className="dcw-row-label">{field.label}</span>
            <span className="dcw-row-value-wrap">
              <span
                className={`dcw-row-value${unresolvedNow && missingValue ? " is-empty" : ""}`}
              >
                {unresolvedNow && missingValue ? UNRESOLVED_TEXT : displayedValue}
              </span>
              {resolved ? (
                <span className="dcw-mark is-human">{humanLabel}</span>
              ) : inferred ? (
                <span className="dcw-mark">AI 추정</span>
              ) : unresolvedNow && !missingValue ? (
                <span className="dcw-mark is-attn">확인 전</span>
              ) : null}
            </span>
            {actionable ? (
              <span className="dcw-row-actions">
                {!resolved && canAccept ? (
                  <button
                    type="button"
                    className="dcw-action is-primary"
                    disabled={hasMultipleCandidates && !selectedCandidate}
                    onClick={() =>
                      dispatch({ type: "accept", value: acceptValue })
                    }
                  >
                    이 값 사용
                  </button>
                ) : null}
                <button type="button" className="dcw-action" onClick={beginEdit}>
                  {unresolvedNow && missingValue
                    ? entryActionLabel(field.key)
                    : "수정"}
                </button>
              </span>
            ) : null}
          </div>

          {/* 보조 정보는 필요한 경우에만 행 하단 한 줄로 보여준다. */}
          {!resolved && unresolvedNow && field.confirmationQuestion ? (
            <p className="dcw-row-sub is-question">{field.confirmationQuestion}</p>
          ) : null}
          {field.sub && !resolved ? (
            <p className="dcw-row-sub">{field.sub}</p>
          ) : null}
          {resolved ? (
            <p className="dcw-row-sub">
              AI 초안: {field.display === "확인 필요" ? "값 없음" : field.display}
              {inferred ? " · 추정" : needs ? " · 확인 필요였음" : ""}
            </p>
          ) : null}

          {!resolved && (inferred || needs) && hasMultipleCandidates ? (
            <fieldset className="dcw-candidates">
              <legend>AI가 제시한 후보</legend>
              {candidates.map((candidate) => (
                <label
                  className="dcw-candidate"
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
                    <span className="dcw-candidate-value">{candidate.value}</span>
                    {candidate.evidence.map((item, index) => (
                      <span
                        className="dcw-candidate-evidence"
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

          {hasEvidence ? (
            <div className="dcw-row-evidence-wrap">
              <button
                type="button"
                className="dcw-ev-toggle"
                aria-expanded={evOpen}
                onClick={() => setEvOpen((open) => !open)}
              >
                {evOpen ? "근거 접기" : "근거 보기"}
              </button>
              {evOpen ? (
                <div className="dcw-evidence">
                  {field.evidence.map((item, index) => (
                    <span key={`${field.key}-ev-${index}`}>{item}</span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
