"use client";

import { useState } from "react";
import type { SavedIntakeGate } from "@/lib/ai/savedIntakeView";
import type { TeamPostDraft } from "@/lib/ai/teamPostRecord";
import {
  intakeAuditTone,
  intakeFinalizationMode,
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
 * 미확인 확정 사유 — **왜 넘어가는지를 받는다.**
 * 사고가 났을 때 "연락이 닿지 않았다"와 "물어볼 필요 없다고 봤다"는 책임이
 * 전혀 다른데, 기록에 '미확인 확정'만 남으면 그 둘을 구분할 수 없다.
 * 사유를 고르기 전에는 버튼이 눌리지 않는다.
 */
const ACK_REASONS = [
  // '직접 응대함' 이 맨 앞이다. 새로운 유형의 요청은 이 사유가 정상 경로다 —
  // 서버가 '요청 내용' 칸을 verify 로 받지 않아서, 복지사가 통화로 처리한 뒤
  // 여기서 접수한다. 목록 맨 아래 두면 '기타' 를 고르게 된다.
  //
  // 나머지 넷과 성격이 다르다. 저쪽은 "확인을 못 했거나 안 했다" 인데
  // 이것은 "사람이 통화해서 처리했다" 다. '물어볼 필요 없음' 으로 적으면
  // 그 사유가 곧 '쓸모없던 질문' 의 집계라(확인 질문 유효율) 지표가
  // 반대로 읽힌다.
  "직접 응대함",
  "연락이 닿지 않음",
  "이미 알고 있음",
  "물어볼 필요 없음",
  "기타",
] as const;

/** 초안에서 사람이 읽을 칸만, 적힌 것만 보여준다. */
const DRAFT_LABELS: ReadonlyArray<[keyof TeamPostDraft, string]> = [
  ["treatment", "진료 내용"],
  ["next_visit", "다음 진료"],
  // 서버가 넣는 값은 '완료' 하나다(약국에 들렀는지 여부). '약국: 완료' 는
  // 무엇이 완료됐다는 건지 읽히지 않아서, 라벨에 동작을 담는다.
  ["pharmacy", "약국 방문"],
  ["cautions", "주의사항"],
  ["guardian_msg", "보호자 안내"],
];

/**
 * 다녀온 이야기를 적는 자리.
 *
 * **동행을 다녀온 접수에서만 나온다.** 그동안 사후기록은 만들어진 것을
 * 검토하는 화면만 있었고, 만드는 자리는 어디에도 없었다 — 매니저가 다녀와서
 * 할 일이 화면에 없었다는 뜻이다.
 *
 * 여기서 나오는 것은 초안이다. 승인은 사후기록 화면에서 사람이 한다. 그래서
 * 버튼도 '기록 만들기' 라고 쓴다 — 누르면 끝나는 것처럼 보이면 안 된다.
 */
export function SavedIntakePostRecord({
  onCreate,
}: {
  onCreate: (memo: string) => Promise<TeamPostDraft>;
}) {
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<TeamPostDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const text = memo.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      setDraft(await onCreate(text));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "사후기록 초안을 만들지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  };

  const filled = draft
    ? DRAFT_LABELS.filter(([key]) => (draft[key] ?? "").trim().length > 0)
    : [];

  return (
    <section className="dcw-section" aria-labelledby="post-record-title">
      <h2 className="dcw-section-title" id="post-record-title">
        다녀온 기록
      </h2>

      {draft ? (
        <div className="dcw-post">
          <p className="dcw-quiet">
            초안이 만들어졌어요. 사후기록 화면에서 확인하고 승인해 주세요.
          </p>
          {filled.length > 0 ? (
            <dl className="dcw-draft">
              {filled.map(([key, label]) => (
                <div className="dcw-draft-row" key={key}>
                  <dt>{label}</dt>
                  <dd>{draft[key]}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="dcw-quiet">
              적어 주신 내용에서 나눠 담을 항목을 찾지 못했어요. 사후기록
              화면에서 직접 고쳐 주세요.
            </p>
          )}
        </div>
      ) : (
        <div className="dcw-post">
          <label className="dcw-verify-label" htmlFor="post-record-memo">
            오늘 어떠셨는지 편하게 적어주세요
          </label>
          <textarea
            id="post-record-memo"
            className="dc-textarea dcw-post-memo"
            rows={4}
            value={memo}
            disabled={busy}
            placeholder="예: 무릎 주사 맞으시고 2주 뒤에 다시 오라고 하셨어요. 약은 앞 약국에서 3일치 받았습니다."
            onChange={(event) => setMemo(event.target.value)}
          />
          <div className="dcw-cta-actions">
            <button
              type="button"
              className="dcw-btn-primary"
              disabled={busy || memo.trim().length === 0}
              onClick={submit}
            >
              {busy ? "정리하는 중…" : "기록 만들기"}
            </button>
          </div>
          <p className="dcw-quiet">
            적어주신 말에서 진료 내용·다음 진료·약국·주의사항을 나눠 담아
            초안을 만들어요. 승인 전까지는 어디에도 반영되지 않아요.
          </p>
          {error ? (
            <p className="dcw-quiet" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

/**
 * 작업공간 하단 고정 확정 영역.
 *
 * 역할을 나눈다 — **항목 확인/수정은 각 필드 행이**, 전체 접수 확정은 이 바가
 * 담당한다. 같은 확인 동작을 두 곳에 두면 사회복지사가 어디서 눌러야 하는지
 * 판단해야 하고, 감사 로그상 같은 행동이 두 경로로 들어온다.
 *
 * 확정 가능 여부는 항상 server gate가 정한다(local 작업값이 아니다).
 */
export function SavedIntakeFinalization({
  confirmed,
  completed = false,
  gate,
  onConfirm,
  onComplete,
  busy = false,
  error = null,
}: {
  confirmed: boolean;
  /** 이미 다녀온 접수. 다녀왔다는 버튼 대신 그 사실만 남긴다. */
  completed?: boolean;
  gate: SavedIntakeGate | null;
  /** 확정을 실제로 보낸다. 없으면 준비 중 상태로 비활성 표시한다. */
  onConfirm?: (acknowledge: boolean, reason: string | null) => void;
  /** 동행을 다녀왔다고 표시한다. 확정된 접수에서만 내려온다. */
  onComplete?: () => void;
  busy?: boolean;
  error?: string | null;
}) {
  const mode = intakeFinalizationMode(confirmed, gate);
  const connected = typeof onConfirm === "function";
  const [ackOpen, setAckOpen] = useState(false);
  const [ackReason, setAckReason] = useState("");

  if (mode === "confirmed") {
    // 확정에서 끝나지 않는다. 다녀왔다는 표시가 있어야 목록에서 "아직 안 간
    // 것" 과 갈리고, 그 방문이 다음 접수의 병원 근거가 된다.
    return (
      <div className="dcw-cta-stack">
        <div className="dcw-cta">
          <span className="dcw-cta-done">
            {completed ? "✓ 동행을 다녀왔어요" : "✓ 접수가 확정됐어요"}
          </span>
        </div>
        {onComplete && !completed ? (
          <>
            <div className="dcw-cta-actions">
              <button
                type="button"
                className="dcw-btn-primary"
                disabled={busy}
                onClick={busy ? undefined : onComplete}
              >
                {busy ? "반영하는 중…" : "동행 다녀왔어요"}
              </button>
            </div>
            <p className="dcw-cta-note">
              누르면 이번 방문이 어르신 기록에 쌓여요. 다음 접수 때 이 병원이
              후보로 먼저 나와요.
            </p>
          </>
        ) : null}
        {error ? (
          <p className="dcw-cta-note" role="alert">{error}</p>
        ) : null}
      </div>
    );
  }

  const blockerCount = gate?.blockers.length ?? 0;
  const helper =
    mode === "gate-unavailable"
      ? "확정 조건을 불러오지 못해 지금은 접수할 수 없어요."
      : mode === "regular"
        ? "필수 정보를 모두 확인했어요."
        : blockerCount > 0
          ? `필수 정보 ${blockerCount}개가 아직 확인되지 않았어요.`
          : "필수 정보를 모두 확인하면 접수할 수 있어요.";
  const note = !connected
    ? "접수 확정 기능은 준비 중이에요."
    : "확정은 되돌릴 수 없어요. 누른 사람과 시각이 활동 기록에 남아요.";

  return (
    <div className="dcw-cta-stack">
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
