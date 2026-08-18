"use client";

import { useState } from "react";
import type { SavedIntakeGate, SavedIntakeGateBlocker } from "@/lib/ai/savedIntakeView";
import {
  intakeAuditTone,
  intakeFinalizationMode,
  isVerifiableField,
  type IntakeAuditState,
} from "@/lib/ui/intakeFinalization";

/**
 * 활동 기록.
 * 개발 용어(Team Audit Log)를 쓰지 않고, 데이터가 없거나 아직 연결되지
 * 않았을 때는 조용한 안내 한 줄로 처리한다. fake 기록을 만들지 않는다.
 */
export function SavedIntakeAuditSection({
  state,
  onRetry,
}: {
  state: IntakeAuditState;
  onRetry?: () => void;
}) {
  return (
    <section className="dcw-section" aria-labelledby="intake-audit-title">
      <h2 className="dcw-section-title" id="intake-audit-title">
        활동 기록
      </h2>

      {state.status === "loading" ? (
        <p className="dcw-quiet" role="status">
          활동 기록을 불러오고 있어요.
        </p>
      ) : state.status === "empty" ? (
        <p className="dcw-quiet">아직 활동 기록이 없어요.</p>
      ) : state.status === "error" ? (
        <p className="dcw-quiet">
          활동 기록을 아직 불러올 수 없어요.
          {onRetry ? (
            <button type="button" className="dcw-action" onClick={onRetry}>
              다시 시도
            </button>
          ) : null}
        </p>
      ) : (
        <div className="dcw-timeline">
          {state.entries.map((entry) => (
            <div
              className={`dcw-timeline-item${
                intakeAuditTone(entry.action) === "warning" ? " is-warning" : ""
              }`}
              key={entry.id}
            >
              <span className="dcw-timeline-dot" aria-hidden="true" />
              <div className="dcw-timeline-body">
                <div className="dcw-timeline-head">
                  <strong>{entry.action}</strong>
                  <time>{entry.at ?? "시각 미등록"}</time>
                </div>
                <span className="dcw-timeline-actor">
                  {[entry.actor, entry.role].filter(Boolean).join(" · ") ||
                    "담당자 미상"}
                </span>
                {entry.detail ? <p>{entry.detail}</p> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * blocker 하나를 푸는 입력.
 *
 * **이 버튼은 "통화로 확인했다"는 뜻이다.** 위 항목 목록에서 값을 고치는 것과
 * 다르다 — 그 구분이 무너지면 사고가 났을 때 누가 실제로 확인했는지 답할 수
 * 없다. 그래서 라벨을 '통화로 확인함'으로 두고, 확인 전화를 마친 뒤 쓰라고 적는다.
 * 서버가 받지 않는 항목(isVerifiableField 밖)은 입력을 그리지 않는다 — 그려 두면
 * 눌러도 422만 나고 복지사는 왜 안 되는지 알 수 없다.
 */
function VerifyBlockerRow({
  blocker,
  busy,
  onVerify,
}: {
  blocker: SavedIntakeGateBlocker;
  busy: boolean;
  onVerify: (field: string, value: string) => void;
}) {
  const [value, setValue] = useState(blocker.value ?? blocker.spoken ?? "");
  const ready = value.trim().length > 0 && !busy;
  return (
    <div className="dcw-verify-row">
      <span className="dcw-verify-label">{blocker.label}</span>
      <span className="dcw-verify-input">
        <input
          type="text"
          className="dcw-row-input"
          value={value}
          disabled={busy}
          aria-label={`${blocker.label} 확인 결과`}
          placeholder="통화로 확인한 값"
          onChange={(event) => setValue(event.target.value)}
        />
        <button
          type="button"
          className="dcw-action is-primary"
          disabled={!ready}
          onClick={ready ? () => onVerify(blocker.field, value.trim()) : undefined}
        >
          {busy ? "반영 중…" : "통화로 확인함"}
        </button>
      </span>
      {blocker.question ? (
        <p className="dcw-verify-question">{blocker.question}</p>
      ) : null}
    </div>
  );
}

/**
 * 미확인 확정 사유 — **왜 넘어가는지를 받는다.**
 * 사고가 났을 때 "연락이 닿지 않았다"와 "물어볼 필요 없다고 봤다"는 책임이
 * 전혀 다른데, 기록에 '미확인 확정'만 남으면 그 둘을 구분할 수 없다.
 * 사유를 고르기 전에는 버튼이 눌리지 않는다.
 */
const ACK_REASONS = [
  "연락이 닿지 않음",
  "이미 알고 있음",
  "물어볼 필요 없음",
  "기타",
] as const;

/**
 * 작업공간 하단 고정 확정 영역.
 *
 * 확정 가능 여부는 server gate가 정한다. 게이트를 푸는 유일한 경로는 verify이며
 * (onVerify), 그 수단이 화면에 없으면 걸린 접수를 영영 확정할 수 없다.
 * 확정은 실제 API로 전송된다(onConfirm).
 */
export function SavedIntakeFinalization({
  confirmed,
  gate,
  onConfirm,
  onVerify,
  busy = false,
  error = null,
}: {
  confirmed: boolean;
  gate: SavedIntakeGate | null;
  /** 확정을 실제로 보낸다. 없으면 준비 중 상태로 비활성 표시한다. */
  onConfirm?: (acknowledge: boolean, reason: string | null) => void;
  /** blocker를 통화 확인으로 푼다. 없으면 확인 입력을 그리지 않는다. */
  onVerify?: (field: string, value: string) => void;
  busy?: boolean;
  error?: string | null;
}) {
  const mode = intakeFinalizationMode(confirmed, gate);
  const connected = typeof onConfirm === "function";
  const [ackOpen, setAckOpen] = useState(false);
  const [ackReason, setAckReason] = useState("");
  const [verifyOpen, setVerifyOpen] = useState(false);

  if (mode === "confirmed") {
    return (
      <div className="dcw-cta">
        <span className="dcw-cta-done">✓ 접수가 확정됐어요</span>
      </div>
    );
  }

  const blockers = gate?.blockers ?? [];
  const verifiable = onVerify ? blockers.filter((b) => isVerifiableField(b.field)) : [];
  const blockerCount = blockers.length;
  const helper =
    mode === "gate-unavailable"
      ? "확정 조건을 불러오지 못해 지금은 접수할 수 없어요."
      : mode === "regular"
        ? "필수 정보를 모두 확인했어요."
        : mode === "hard-block"
          ? "남은 정보를 통화로 확인해야 접수할 수 있어요."
          : blockerCount > 0
            ? `필수 정보 ${blockerCount}개를 확인하면 접수할 수 있어요.`
            : "필수 정보를 모두 확인하면 접수할 수 있어요.";
  const note = !connected
    ? "접수 확정 기능은 준비 중이에요."
    : "확정은 되돌릴 수 없어요. 누른 사람과 시각이 활동 기록에 남아요.";

  return (
    <div className="dcw-cta-stack">
      {/* 게이트를 푸는 유일한 경로 — 통화로 확인한 값만 서버가 받는다. */}
      {verifyOpen && verifiable.length > 0 ? (
        <div className="dcw-verify" role="group" aria-label="통화로 확인">
          <div className="dcw-verify-head">
            <span className="dcw-verify-title">통화로 확인한 값 넣기</span>
            <button
              type="button"
              className="dcw-action"
              disabled={busy}
              onClick={() => setVerifyOpen(false)}
            >
              닫기
            </button>
          </div>
          <div className="dcw-verify-rows">
            {verifiable.map((blocker) => (
              <VerifyBlockerRow
                key={`${blocker.field}-${blocker.label}`}
                blocker={blocker}
                busy={busy}
                onVerify={onVerify!}
              />
            ))}
          </div>
          <p className="dcw-verify-note">
            확인 전화를 마친 뒤 들은 값을 넣으세요. 위 항목에서 고친 값이 아니라{" "}
            <strong>통화로 확인한 값</strong>만 확정을 열어줍니다.
          </p>
        </div>
      ) : null}

      {/* 미확인 확정은 예외 행동 — 사유를 고른 사람만 진행할 수 있다. */}
      {ackOpen && mode === "soft-block" ? (
        <div className="dcw-ack" role="group" aria-label="확인 없이 접수">
          <label className="dcw-ack-label" htmlFor="dcw-ack-reason">
            확인 없이 넘어가는 이유
          </label>
          <select
            id="dcw-ack-reason"
            className="dcw-ack-select"
            value={ackReason}
            disabled={!connected || busy}
            onChange={(event) => setAckReason(event.target.value)}
          >
            <option value="">이유를 고르세요</option>
            {ACK_REASONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="dcw-btn-warning"
            disabled={!connected || busy || !ackReason}
            onClick={
              connected && ackReason
                ? () => onConfirm?.(true, ackReason)
                : undefined
            }
          >
            {busy ? "확정하는 중…" : "미확인 상태로 확정"}
          </button>
          <button
            type="button"
            className="dcw-action"
            disabled={busy}
            onClick={() => {
              setAckOpen(false);
              setAckReason("");
            }}
          >
            돌아가기
          </button>
        </div>
      ) : null}

      <div className="dcw-cta">
        <div className="dcw-cta-text">
          <span className="dcw-cta-helper">{helper}</span>
          {error ? (
            <span className="dcw-cta-error" role="alert">
              {error}
            </span>
          ) : (
            <span className="dcw-cta-note">{note}</span>
          )}
        </div>
        <div className="dcw-cta-actions">
          {verifiable.length > 0 && !verifyOpen ? (
            <button
              type="button"
              className="dcw-btn-ghost"
              disabled={busy}
              onClick={() => setVerifyOpen(true)}
            >
              통화로 확인 입력
            </button>
          ) : null}
          {mode === "soft-block" && !ackOpen ? (
            <button
              type="button"
              className="dcw-btn-ghost"
              disabled={!connected || busy}
              onClick={() => setAckOpen(true)}
            >
              확인 없이 접수
            </button>
          ) : null}
          <button
            type="button"
            className="dcw-btn-primary"
            disabled={!connected || busy || mode !== "regular"}
            onClick={
              connected && mode === "regular"
                ? () => onConfirm?.(false, null)
                : undefined
            }
          >
            {busy ? "확정하는 중…" : "접수 확정"}
          </button>
        </div>
      </div>
    </div>
  );
}
