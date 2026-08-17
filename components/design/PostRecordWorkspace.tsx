"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowRight } from "lucide-react";
import type { TeamSession } from "@/lib/ai/teamProfileRead";
import type {
  TeamAuditEntry,
  TeamPostRecord,
  TeamPostRecordDecision,
} from "@/lib/ai/teamPostRecord";
import { maskProfilePhone } from "@/lib/ui/careProfile";
import {
  decisionFeedback,
  isRelativeSchedule,
  postRecordAudit,
  postRecordReviewState,
  postRecordStateLabel,
  type PostRecordReviewState,
} from "@/lib/ui/postRecordReview";
import { TeamLoginPanel } from "./TeamLoginPanel";
import { clearTeamSession, readTeamSession } from "@/lib/ui/teamSession";
import { loginTeamSession } from "@/lib/ui/teamLogin";

interface ApiErrorPayload {
  error?: string;
}

class PostRecordApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

async function responseJson<T>(response: Response, fallback: string): Promise<T> {
  let payload: ApiErrorPayload & Partial<T> = {};
  try {
    payload = (await response.json()) as ApiErrorPayload & Partial<T>;
  } catch {
    // 안정된 fallback 문구를 사용한다.
  }
  if (!response.ok) {
    throw new PostRecordApiError(response.status, payload.error ?? fallback);
  }
  return payload as T;
}

function authHeaders(session: TeamSession): HeadersInit {
  return { Authorization: `Bearer ${session.token}` };
}

function PostRecordLogin({
  error,
  busy,
  onSubmit,
}: {
  error: string | null;
  busy: boolean;
  onSubmit: (userId: string, password: string) => Promise<void>;
}) {
  return (
    <main className="dc-detail">
      <div className="dc-detail-head dc-post-head">
        <span className="dc-detail-name">사후기록</span>
        <span className="dc-detail-sub">AI 초안 검토 · 사회복지사 승인</span>
      </div>
      <TeamLoginPanel
        heading="직원 로그인이 필요합니다"
        description="사후기록 조회와 승인은 권한이 확인된 직원만 할 수 있습니다."
        error={error}
        busy={busy}
        onSubmit={onSubmit}
      />
    </main>
  );
}

function stateTone(state: PostRecordReviewState) {
  if (state === "approved") return "is-approved";
  if (state === "rejected") return "is-rejected";
  if (state === "unknown") return "is-unknown";
  return "is-pending";
}

function PostRecordList({
  records,
  audit,
  auditLoaded,
  selectedId,
  loading,
  error,
  onSelect,
  onRetry,
}: {
  records: TeamPostRecord[];
  audit: TeamAuditEntry[];
  auditLoaded: boolean;
  selectedId: number | null;
  loading: boolean;
  error: string | null;
  onSelect: (id: number) => void;
  onRetry: () => void;
}) {
  return (
    <aside className="dc-elder-list dc-post-list" aria-label="사후기록 목록">
      <div className="dc-elder-list-head">
        <div className="dc-elder-list-title-row">
          <div>
            <strong>AI 초안</strong>
            <span>{loading ? "확인 중" : `${records.length}건`}</span>
          </div>
        </div>
        <p className="dc-post-list-note">저장된 초안을 검토한 뒤 승인합니다.</p>
      </div>
      <div className="dc-elder-list-body">
        {loading ? (
          <div className="dc-elder-list-state" role="status">사후기록을 불러오는 중입니다.</div>
        ) : error ? (
          <div className="dc-elder-list-state is-error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={onRetry}>다시 시도</button>
          </div>
        ) : records.length === 0 ? (
          // 비었다는 사실도 loading·error와 똑같이 읽혀야 한다(어르신 목록과 동일).
          <div className="dc-elder-list-state" role="status">
            검토할 사후기록이 없습니다.
          </div>
        ) : (
          records.map((record) => {
            const state = postRecordReviewState(record, audit, auditLoaded);
            return (
              <button
                type="button"
                key={record.id}
                className={`dc-post-row${selectedId === record.id ? " is-selected" : ""}`}
                onClick={() => onSelect(record.id)}
                aria-pressed={selectedId === record.id}
              >
                <span className="dc-post-row-main">
                  <strong>사후기록 #{record.id}</strong>
                  <span>{record.intake_id === null ? "접수 연결 없음" : `접수 #${record.intake_id}`}</span>
                  <small>{[record.created_at, record.phone ? maskProfilePhone(record.phone) : null].filter(Boolean).join(" · ") || "기록 정보 미등록"}</small>
                </span>
                <span className="dc-post-row-side">
                  <em className={stateTone(state)}>{postRecordStateLabel(state)}</em>
                  <ArrowRight size={13} aria-hidden="true" />
                </span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}

const DRAFT_FIELDS: Array<{
  key: keyof Pick<
    TeamPostRecord,
    | "treatment"
    | "next_visit"
    | "pharmacy"
    | "cautions"
    | "guardian_msg"
    | "profile_update"
  >;
  label: string;
}> = [
  { key: "treatment", label: "진료 내용" },
  { key: "next_visit", label: "다음 진료" },
  { key: "pharmacy", label: "약국 방문" },
  { key: "cautions", label: "다음 동행 주의사항" },
  { key: "guardian_msg", label: "보호자 공유 메시지 초안" },
  { key: "profile_update", label: "Care Profile 반영 제안" },
];

function PostRecordDetail({
  record,
  state,
  audit,
  auditLoaded,
  auditError,
  canApprove,
  busy,
  confirming,
  actionError,
  feedback,
  onBeginApprove,
  onCancelApprove,
  onConfirmApprove,
}: {
  record: TeamPostRecord | null;
  state: PostRecordReviewState | null;
  audit: TeamAuditEntry[];
  auditLoaded: boolean;
  auditError: string | null;
  canApprove: boolean;
  busy: boolean;
  confirming: boolean;
  actionError: string | null;
  feedback: string | null;
  onBeginApprove: () => void;
  onCancelApprove: () => void;
  onConfirmApprove: () => void;
}) {
  if (!record || !state) {
    return (
      <main className="dc-detail">
        <div className="dc-detail-head dc-post-head">
          <span className="dc-detail-name">사후기록</span>
          <span className="dc-detail-sub">AI 초안 검토 · 사회복지사 승인</span>
        </div>
        <div className="dc-home-state">
          <span className="dc-home-state-title">검토할 기록을 선택해 주세요</span>
          <span>AI 초안은 선택만으로 승인되거나 Care Profile에 반영되지 않습니다.</span>
        </div>
      </main>
    );
  }

  const recordAudit = postRecordAudit(record.id, audit);
  const isPending = state === "pending";

  return (
    <main className="dc-detail">
      <div className="dc-detail-head dc-post-head">
        <span className="dc-detail-name">사후기록 #{record.id}</span>
        <span className="dc-detail-sub">
          {record.intake_id === null ? "접수 연결 없음" : `접수 #${record.intake_id}`}
        </span>
        <span className={`dc-post-status ${stateTone(state)}`}>
          {postRecordStateLabel(state)}
        </span>
      </div>

      <div className={`dc-post-principle ${stateTone(state)}`} role="note">
        <strong>{isPending ? "AI 초안 · 검토 필요" : postRecordStateLabel(state)}</strong>
        <span>
          저장된 초안과 Care Profile 반영은 다릅니다. 승인 성공 응답에서만 반영 여부를 확인합니다.
        </span>
      </div>

      <div className="dc-detail-body dc-post-detail-body">
        <div className="dc-detail-left">
          <section className="dc-block">
            <h2 className="dc-block-title">동행 매니저 원문</h2>
            <blockquote className="dc-post-memo">
              {record.memo_raw ?? "원문 메모가 없습니다."}
            </blockquote>
            <dl className="dc-care-facts">
              <div><dt>작성 시각</dt><dd>{record.created_at ?? "미등록"}</dd></div>
              <div><dt>대상 연락처</dt><dd>{record.phone ? maskProfilePhone(record.phone) : "미등록"}</dd></div>
            </dl>
          </section>

          <section className="dc-block">
            <div className="dc-care-history-head">
              <div>
                <h2 className="dc-block-title">처리 이력</h2>
                <p>Team Audit Log 기준</p>
              </div>
            </div>
            {!auditLoaded ? (
              <p className="dc-care-empty-copy">{auditError ?? "처리 상태를 확인하는 중입니다."}</p>
            ) : recordAudit.length === 0 ? (
              <p className="dc-care-empty-copy">아직 승인·거절 이력이 없습니다.</p>
            ) : (
              <div className="dc-post-audit">
                {recordAudit.slice(0, 4).map((entry) => (
                  <div key={entry.id}>
                    <strong>{entry.action}</strong>
                    <span>{[entry.actor, entry.role].filter(Boolean).join(" · ") || "담당자 미상"}</span>
                    <time>{entry.at ?? "시각 미등록"}</time>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="dc-divider" />

        <div className="dc-detail-right">
          <section className="dc-block">
            <div className="dc-post-draft-head">
              <div>
                <h2 className="dc-block-title">검토할 AI 초안</h2>
                <p>원문에 없는 내용이 추가되지 않았는지 확인해 주세요.</p>
              </div>
            </div>
            <div className="dc-post-draft">
              {DRAFT_FIELDS.map(({ key, label }) => {
                const value = record[key];
                const profileSuggestion = key === "profile_update";
                const relativeSchedule = key === "next_visit" && isRelativeSchedule(value);
                return (
                  <div
                    className={`dc-post-draft-row${profileSuggestion ? " is-profile" : ""}`}
                    key={key}
                  >
                    <div className="dc-post-draft-label">
                      <span>{label}</span>
                      {relativeSchedule ? <em>일정 재확인</em> : null}
                    </div>
                    <p>{value ?? "초안 내용 없음"}</p>
                    {profileSuggestion ? (
                      <small>제안 항목이며 승인 전에는 Care Profile에 반영되지 않습니다.</small>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      <div className="dc-actionbar dc-post-actionbar">
        {confirming ? (
          <>
            <span className="dc-actionbar-note">
              이 AI 초안을 승인합니다. 반영 제안이 있으면 Care Profile에 적용될 수 있습니다.
            </span>
            <button type="button" className="dc-btn-ghost" onClick={onCancelApprove} disabled={busy}>
              취소
            </button>
            <button type="button" className="dc-btn-primary" onClick={onConfirmApprove} disabled={busy}>
              {busy ? "처리 중" : "승인 확정"}
            </button>
          </>
        ) : (
          <>
            <div className="dc-post-action-message">
              {feedback ? <span className="is-success" role="status">{feedback}</span> : null}
              {actionError ? <span className="is-error" role="alert">{actionError}</span> : null}
              {!feedback && !actionError ? (
                <>
                  <span>
                    {isPending
                      ? "사람의 명시적 승인 전에는 Care Profile이 변경되지 않습니다."
                      : state === "unknown"
                        ? "처리 이력을 확인할 수 없어 승인할 수 없습니다."
                      : "처리가 완료된 기록입니다."}
                  </span>
                  {isPending ? (
                    <small>거절 기록은 backend 상태 계약 보완 후 연결됩니다.</small>
                  ) : null}
                </>
              ) : null}
            </div>
            <button
              type="button"
              className="dc-btn-ghost"
              disabled
              title="현재 backend는 검토 대기와 거절을 구분해 저장하지 않습니다."
            >
              거절
            </button>
            <button
              type="button"
              className="dc-btn-primary"
              onClick={onBeginApprove}
              disabled={!isPending || !canApprove || busy}
            >
              승인
            </button>
          </>
        )}
      </div>
    </main>
  );
}

export function PostRecordWorkspace() {
  const [sessionReady, setSessionReady] = useState(false);
  const [session, setSession] = useState<TeamSession | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [records, setRecords] = useState<TeamPostRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [audit, setAudit] = useState<TeamAuditEntry[]>([]);
  const [auditLoaded, setAuditLoaded] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<number, string>>({});
  // disabled는 다음 렌더에서야 걸린다. 같은 tick 연타는 여기서 막는다.
  const decisionLockRef = useRef(false);

  const expireSession = useCallback((message: string) => {
    clearTeamSession(window.sessionStorage);
    setSession(null);
    setRecords([]);
    setAudit([]);
    setSelectedId(null);
    setAuthError(message);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSession(readTeamSession(window.sessionStorage));
      setSessionReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    const headers = authHeaders(session);
    const recordsRequest = fetch("/api/v1/post-records?limit=50", {
      headers,
      signal: controller.signal,
    }).then((response) =>
      responseJson<{ records: TeamPostRecord[] }>(
        response,
        "사후기록 목록을 불러오지 못했습니다.",
      ),
    );
    const auditRequest = fetch("/api/v1/audit?limit=500", {
      headers,
      signal: controller.signal,
    }).then((response) =>
      responseJson<{ audit: TeamAuditEntry[] }>(
        response,
        "처리 이력을 불러오지 못했습니다.",
      ),
    );

    void Promise.allSettled([recordsRequest, auditRequest]).then(
      ([recordsResult, auditResult]) => {
        if (controller.signal.aborted) return;
        const rejected = [recordsResult, auditResult].find(
          (result) =>
            result.status === "rejected" &&
            result.reason instanceof PostRecordApiError &&
            result.reason.status === 401,
        );
        if (rejected) {
          expireSession("세션이 만료되었습니다. 다시 로그인해 주세요.");
          return;
        }

        if (recordsResult.status === "fulfilled") {
          setRecords(recordsResult.value.records);
          setRecordsError(null);
        } else {
          setRecordsError(
            recordsResult.reason instanceof Error
              ? recordsResult.reason.message
              : "사후기록 목록을 불러오지 못했습니다.",
          );
        }
        setRecordsLoading(false);

        if (auditResult.status === "fulfilled") {
          setAudit(auditResult.value.audit);
          setAuditLoaded(true);
          setAuditError(null);
        } else {
          setAudit([]);
          setAuditLoaded(false);
          setAuditError(
            auditResult.reason instanceof Error
              ? auditResult.reason.message
              : "처리 이력을 불러오지 못했습니다.",
          );
        }
      },
    );

    return () => controller.abort();
  }, [session, refreshNonce, expireSession]);

  const login = async (userId: string, password: string) => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const nextSession = await loginTeamSession(userId, password);
      setRecordsLoading(true);
      setSession(nextSession);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "로그인하지 못했습니다.");
    } finally {
      setAuthBusy(false);
    }
  };

  const selectedRecord = useMemo(
    () => records.find((record) => record.id === selectedId) ?? null,
    [records, selectedId],
  );
  const selectedState = useMemo(
    () =>
      selectedRecord
        ? postRecordReviewState(selectedRecord, audit, auditLoaded)
        : null,
    [selectedRecord, audit, auditLoaded],
  );
  const canApprove = Boolean(
    auditLoaded && session?.user.permissions.includes("post.approve"),
  );

  const approve = async () => {
    if (!session || !selectedRecord || !canApprove) return;
    if (decisionLockRef.current) return;
    decisionLockRef.current = true;
    setDecisionBusy(true);
    setActionError(null);
    try {
      const response = await fetch(
        `/api/v1/post-records/${selectedRecord.id}/approve`,
        {
          method: "POST",
          headers: {
            ...authHeaders(session),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ approved: true }),
        },
      );
      const result = await responseJson<TeamPostRecordDecision>(
        response,
        "사후기록을 승인하지 못했습니다.",
      );
      setRecords((current) =>
        current.map((record) =>
          record.id === selectedRecord.id
            ? { ...record, approved: result.approved }
            : record,
        ),
      );
      setFeedback((current) => ({
        ...current,
        [selectedRecord.id]: decisionFeedback(result),
      }));
      setRefreshNonce((value) => value + 1);
    } catch (error) {
      if (error instanceof PostRecordApiError && error.status === 401) {
        expireSession("세션이 만료되었습니다. 다시 로그인해 주세요.");
        return;
      }
      setActionError(
        error instanceof Error ? error.message : "사후기록을 승인하지 못했습니다.",
      );
    } finally {
      decisionLockRef.current = false;
      setDecisionBusy(false);
      // 실패해도 확인 단계를 벗어나야 actionError가 화면에 나온다.
      setConfirming(false);
    }
  };

  if (!sessionReady) {
    return (
      <main className="dc-detail">
        <div className="dc-home-state" role="status">직원 권한을 확인하고 있습니다.</div>
      </main>
    );
  }
  if (!session) {
    return <PostRecordLogin error={authError} busy={authBusy} onSubmit={login} />;
  }

  return (
    <>
      <PostRecordList
        records={records}
        audit={audit}
        auditLoaded={auditLoaded}
        selectedId={selectedId}
        loading={recordsLoading}
        error={recordsError}
        onSelect={(id) => {
          setSelectedId(id);
          setConfirming(false);
          setActionError(null);
        }}
        onRetry={() => {
          setRecordsLoading(true);
          setAuditLoaded(false);
          setRefreshNonce((value) => value + 1);
        }}
      />
      <PostRecordDetail
        record={selectedRecord}
        state={selectedState}
        audit={audit}
        auditLoaded={auditLoaded}
        auditError={auditError}
        canApprove={canApprove}
        busy={decisionBusy}
        confirming={confirming}
        actionError={actionError}
        feedback={selectedId === null ? null : (feedback[selectedId] ?? null)}
        onBeginApprove={() => setConfirming(true)}
        onCancelApprove={() => setConfirming(false)}
        onConfirmApprove={() => void approve()}
      />
    </>
  );
}
