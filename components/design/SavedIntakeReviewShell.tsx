"use client";

import { useState } from "react";
import type { SavedIntakeGate } from "@/lib/ai/savedIntakeView";
import {
  intakeAuditTone,
  intakeFinalizationMode,
  type IntakeAuditState,
} from "@/lib/ui/intakeFinalization";

export function SavedIntakeAuditSection({
  state,
  onRetry,
}: {
  state: IntakeAuditState;
  onRetry?: () => void;
}) {
  return (
    <section className="dc-block dc-intake-audit" aria-labelledby="intake-audit-title">
      <div className="dc-intake-review-head">
        <h2 className="dc-block-title" id="intake-audit-title">처리 이력</h2>
        <span>Team Audit Log</span>
      </div>

      {state.status === "loading" ? (
        <p className="dc-intake-review-state" role="status">
          처리 이력을 불러오는 중입니다.
        </p>
      ) : state.status === "empty" ? (
        <p className="dc-intake-review-state">아직 처리 이력이 없습니다.</p>
      ) : state.status === "error" ? (
        <div className="dc-intake-review-state is-error" role="alert">
          <span>{state.message}</span>
          {onRetry ? <button type="button" onClick={onRetry}>다시 시도</button> : null}
        </div>
      ) : (
        <div className="dc-intake-audit-list">
          {state.entries.map((entry) => (
            <article
              className={`dc-intake-audit-entry${intakeAuditTone(entry.action) === "warning" ? " is-warning" : ""}`}
              key={entry.id}
            >
              <div>
                <strong>{entry.action}</strong>
                <time>{entry.at ?? "시각 미등록"}</time>
              </div>
              <span>
                {[entry.actor, entry.role].filter(Boolean).join(" · ") || "담당자 미상"}
              </span>
              {entry.detail ? <p>{entry.detail}</p> : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function GateBlockers({ gate }: { gate: SavedIntakeGate }) {
  if (gate.blockers.length === 0) return null;
  return (
    <div className="dc-final-blockers">
      <strong>확정 전 확인할 항목</strong>
      {gate.blockers.map((blocker) => (
        <div key={`${blocker.field}-${blocker.label}`}>
          <span>{blocker.label}</span>
          <p>{blocker.question ?? "담당자 확인이 필요합니다."}</p>
          {blocker.spoken ? <small>원문 표현: {blocker.spoken}</small> : null}
        </div>
      ))}
    </div>
  );
}

/**
 * 미확인 확정 — **왜 넘어가는지를 받는다.**
 *
 * 사고가 났을 때 "연락이 닿지 않았다" 와 "물어볼 필요 없다고 봤다" 는 책임이
 * 전혀 다른데, 감사 로그에 '미확인 확정' 만 남으면 그 둘을 구분할 수 없다.
 * 사유를 고르기 전에는 버튼이 눌리지 않는다.
 */
const ACK_REASONS = [
  "연락이 닿지 않음",
  "이미 알고 있음",
  "물어볼 필요 없음",
  "기타",
] as const;

function AcknowledgeAction({
  connected,
  busy,
  onConfirm,
}: {
  connected: boolean;
  busy: boolean;
  onConfirm?: (acknowledge: boolean, reason: string | null) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="dc-final-ack">
      <label className="dc-final-ack-label" htmlFor="ack-reason">
        넘어가는 이유
      </label>
      <select
        id="ack-reason"
        value={reason}
        disabled={!connected || busy}
        onChange={(event) => setReason(event.target.value)}
      >
        <option value="">이유를 고르세요</option>
        {ACK_REASONS.map((value) => (
          <option key={value} value={value}>{value}</option>
        ))}
      </select>
      <button
        type="button"
        className="dc-btn-warning"
        disabled={!connected || busy || !reason}
        onClick={connected && reason ? () => onConfirm?.(true, reason) : undefined}
      >
        {busy ? "확정하는 중…" : "미확인 상태로 확정"}
      </button>
    </div>
  );
}

export function SavedIntakeFinalization({
  confirmed,
  gate,
  onConfirm,
  busy = false,
  error = null,
}: {
  confirmed: boolean;
  gate: SavedIntakeGate | null;
  /** 확정을 실제로 보낸다. 없으면 예전처럼 비활성으로 그린다. */
  onConfirm?: (acknowledge: boolean, reason: string | null) => void;
  busy?: boolean;
  error?: string | null;
}) {
  const mode = intakeFinalizationMode(confirmed, gate);
  const connected = typeof onConfirm === "function";

  if (mode === "confirmed") {
    return (
      <section className="dc-block dc-finalization" aria-labelledby="finalization-title">
        <div className="dc-intake-review-head">
          <h2 className="dc-block-title" id="finalization-title">최종 확정</h2>
          <span>서버 상태</span>
        </div>
        <div className="dc-final-complete">
          <strong>접수 확정 완료</strong>
          <span>서버에 저장된 확정 상태입니다.</span>
        </div>
      </section>
    );
  }

  if (mode === "hard-block" && gate) {
    return (
      <section className="dc-block dc-finalization" aria-labelledby="finalization-title">
        <div className="dc-intake-review-head">
          <h2 className="dc-block-title" id="finalization-title">최종 확정</h2>
          <span>Server gate</span>
        </div>
        <div className="dc-final-hard-block" role="note">
          <strong>확인 전에는 확정할 수 없습니다</strong>
          <span>기관 정책에 따라 미확인 확정도 허용되지 않습니다.</span>
        </div>
        <GateBlockers gate={gate} />
      </section>
    );
  }

  return (
    <section className="dc-block dc-finalization" aria-labelledby="finalization-title">
      <div className="dc-intake-review-head">
        <h2 className="dc-block-title" id="finalization-title">최종 확정</h2>
        <span>{gate ? "Server gate" : "연결 준비 중"}</span>
      </div>

      {mode === "gate-unavailable" ? (
        <p className="dc-final-gate-note">
          서버 확정 조건이 연결되지 않아 확정 가능 여부를 판단하지 않습니다.
        </p>
      ) : gate ? (
        <GateBlockers gate={gate} />
      ) : null}

      <div className="dc-final-actions">
        <div className="dc-final-action">
          <div>
            <strong>일반 확정</strong>
            <span>
              {mode === "regular"
                ? "서버 확정 조건을 통과했습니다."
                : "확인 필요 항목이 없어야 진행할 수 있습니다."}
            </span>
          </div>
          <button
            type="button"
            className="dc-btn-primary"
            disabled={!connected || busy || mode !== "regular"}
            onClick={connected ? () => onConfirm(false, null) : undefined}
          >
            {busy ? "확정하는 중…" : "접수카드 확정"}
          </button>
        </div>

        {mode !== "regular" ? (
          <div className="dc-final-action is-warning">
            <div>
              <strong>미확인 확정</strong>
              <span>
                남은 blocker와 위험을 확인한 담당자가 별도로 선택하는 예외 행동입니다.
              </span>
            </div>
            <AcknowledgeAction
              connected={connected}
              busy={busy}
              onConfirm={onConfirm}
            />
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="dc-final-write-note" role="alert">{error}</p>
      ) : connected ? (
        <p className="dc-final-write-note">
          확정은 되돌릴 수 없습니다. 누른 사람과 시각이 처리 이력에 남습니다.
        </p>
      ) : (
        <p className="dc-final-write-note">
          확정 API가 연결되지 않아 두 행동 모두 비활성화되어 있습니다.
        </p>
      )}
    </section>
  );
}
