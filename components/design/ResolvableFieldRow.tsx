"use client";

import { useId, useState } from "react";
import type { EvidenceStatus } from "@/lib/domain/intake";
import type {
  IntakeFieldDraft,
  IntakeFieldResolutionAction,
  ResolutionCandidate,
} from "@/lib/ui/intakeFieldResolution";
import { pickerKindForField } from "@/lib/ui/fieldPickers";
import {
  DateFieldPicker,
  DepartmentFieldPicker,
  TimeFieldPicker,
  type PickerCandidate,
} from "./FieldPickers";

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
   * undefined). 이 프롭이 있으면 로컬 '적용'은 사라지고 [확인함] 하나가
   * 반영까지 한다 — "통화로 확인했다"는 진술이라 감사 로그에 남는다.
   */
  onVerify?: (value: string) => void;
  verifyBusy?: boolean;
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
  date: "날짜 선택",
  time: "시간 선택",
  hospital: "병원 입력",
  dept: "진료과 선택",
  department: "진료과 선택",
  target: "대상자 입력",
  birth: "생년월일 입력",
};

export function entryActionLabel(fieldKey: string): string {
  return ENTRY_ACTION_LABELS[fieldKey] ?? "입력";
}

/**
 * 필드의 시각 상태 — CONFIRMED / CANDIDATE / UNRESOLVED.
 *
 * 병원처럼 아직 structured candidate 계약이 없는 필드도 이 세 상태로
 * 그릴 수 있게 분리해 둔다. 후보(candidate)는 **구조화된 값이 실제로
 * 존재할 때만** 성립한다 — confirm question 자연어에서 값을 parsing해
 * 후보를 만들지 않는다.
 */
export type FieldVisualState = "confirmed" | "candidate" | "unresolved";

export function fieldVisualState(
  status: EvidenceStatus,
  hasValue: boolean,
  humanResolved: boolean,
): FieldVisualState {
  if (humanResolved || status === "CONFIRMED_BY_INPUT") return "confirmed";
  if (hasValue) return "candidate";
  return "unresolved";
}

export function ResolvableFieldRow({
  requestId,
  field,
  draft,
  onAction,
  onVerify,
  verifyBusy,
}: ResolvableFieldRowProps) {
  const [evOpen, setEvOpen] = useState(false);
  // picker가 있는 필드에서 자유 입력으로 내려가는 fallback 스위치.
  const [manualEntry, setManualEntry] = useState(false);
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
  const visualState = fieldVisualState(
    field.status,
    !missingValue || Boolean(resolved),
    Boolean(resolved),
  );
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

  // 편집이 끝나면(적용·확인·취소 어느 경로든) fallback 스위치를 되돌린다.
  // effect가 아니라 렌더 중 조정 — 닫힌 다음 편집에서 picker가 다시 기본이 된다.
  const [wasEditing, setWasEditing] = useState(editing);
  if (wasEditing !== editing) {
    setWasEditing(editing);
    if (!editing) setManualEntry(false);
  }

  const pickerKind = pickerKindForField(field.key);
  const pickerOpen = editing && pickerKind !== null && !manualEntry;

  /** picker에서 새로 고른 값 — 기존 편집 적용과 같은 경로로 보낸다. */
  const confirmPicked = (value: string) => {
    if (onVerify) {
      onVerify(value);
      return;
    }
    dispatch({ type: "editChanged", value });
    dispatch({ type: "applyEdit" });
  };

  /** picker의 후보 확인 — row의 [이 값 확인함]과 같은 의미다. */
  const confirmCandidate = (value: string) => {
    if (onVerify) {
      onVerify(value);
      return;
    }
    dispatch({ type: "accept", value });
  };

  // AI가 이미 뽑아 둔 단일 값이 있으면 picker가 확인 단계를 먼저 보여준다.
  // 복수 후보 필드(병원·대상자)는 picker가 없으므로 여기 오지 않는다.
  const pickerCandidate: PickerCandidate | null =
    !resolved && (inferred || needs) && canAccept && !hasMultipleCandidates
      ? { value: acceptValue, note: field.sub ?? null }
      : null;

  const pickerInitialValue =
    resolved?.value ?? (missingValue ? null : field.display);

  const renderPicker = () => {
    const shared = {
      fieldLabel: field.label,
      candidate: pickerCandidate,
      initialValue: pickerInitialValue,
      verifyMode: Boolean(onVerify),
      busy: verifyBusy,
      onCancel: () => dispatch({ type: "cancelEdit" }),
      onManualEntry: () => setManualEntry(true),
    };
    if (pickerKind === "date") {
      return (
        <DateFieldPicker
          {...shared}
          onConfirm={(value) =>
            pickerCandidate?.value === value
              ? confirmCandidate(value)
              : confirmPicked(value)
          }
        />
      );
    }
    if (pickerKind === "time") {
      return (
        <TimeFieldPicker
          {...shared}
          onConfirm={(value) =>
            pickerCandidate?.value === value
              ? confirmCandidate(value)
              : confirmPicked(value)
          }
        />
      );
    }
    return (
      <DepartmentFieldPicker
        {...shared}
        onConfirm={(value) =>
          pickerCandidate?.value === value
            ? confirmCandidate(value)
            : confirmPicked(value)
        }
      />
    );
  };

  if (pickerOpen) {
    // picker는 popover로 띄운다 — row 자체는 현재 값을 그대로 보여주고
    // 높이도 유지한다. 취소·확인은 popover 안에서 처리한다.
    return (
      <div className={`dcw-row is-${visualState} is-picking`}>
        <div className="dcw-row-main">
          <span className="dcw-row-label">{field.label}</span>
          <span className="dcw-row-value-wrap">
            <span
              className={`dcw-row-value${unresolvedNow && missingValue ? " is-empty" : ""}`}
            >
              {unresolvedNow && missingValue ? UNRESOLVED_TEXT : displayedValue}
            </span>
          </span>
        </div>
        {renderPicker()}
      </div>
    );
  }

  return (
    <div
      className={`dcw-row is-${visualState}${unresolvedNow ? " is-unresolved" : ""}`}
    >
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
            {onVerify ? (
              // 버튼 하나로 끝낸다 — 적용(화면 작업값)과 확인(서버 반영)을
              // 나눠 두니 같은 값을 두 번 다루게 됐다. verify 가능한 항목에서는
              // 확인함이 곧 반영이다.
              <button
                type="button"
                className="dcw-action is-verify"
                disabled={!draft.editValue?.trim() || verifyBusy}
                onClick={() => {
                  const value = draft.editValue?.trim();
                  if (value) onVerify(value);
                }}
              >
                {verifyBusy ? "반영 중…" : "확인함"}
              </button>
            ) : (
              <button
                type="button"
                className="dcw-action is-primary"
                disabled={!draft.editValue?.trim()}
                onClick={() => dispatch({ type: "applyEdit" })}
              >
                저장
              </button>
            )}
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
                    className={`dcw-action ${onVerify ? "is-verify" : "is-primary"}`}
                    disabled={
                      (hasMultipleCandidates && !selectedCandidate) ||
                      (onVerify ? verifyBusy : false)
                    }
                    onClick={() =>
                      onVerify
                        ? onVerify(acceptValue)
                        : dispatch({ type: "accept", value: acceptValue })
                    }
                  >
                    {onVerify
                      ? verifyBusy
                        ? "반영 중…"
                        : "이 값 확인함"
                      : "이 값 사용"}
                  </button>
                ) : null}
                <button type="button" className="dcw-action" onClick={beginEdit}>
                  {unresolvedNow && missingValue
                    ? entryActionLabel(field.key)
                    : "수정"}
                </button>
                {/* 화면에서 고친 값을 통화로 확인했다고 서버에 알리는 자리. */}
                {onVerify && resolved ? (
                  <button
                    type="button"
                    className="dcw-action is-verify"
                    disabled={verifyBusy}
                    onClick={() => onVerify(resolved.value)}
                  >
                    {verifyBusy ? "반영 중…" : "이 값 확인함"}
                  </button>
                ) : null}
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
