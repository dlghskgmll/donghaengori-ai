"use client";

import { useMemo } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import type { SavedIntakeSummary } from "@/lib/ai/savedIntakeView";
import {
  buildIntakeSchedule,
  formatScheduleTime,
  type ScheduleEntry,
  type ScheduleTimeState,
} from "@/lib/ui/intakeSchedule";
import { isSavedIntakeAuthMessage } from "@/lib/ui/savedIntakeClient";

interface ScheduleViewProps {
  saved: SavedIntakeSummary[];
  times: Readonly<Record<number, ScheduleTimeState>>;
  loading: boolean;
  error: string | null;
  disconnected: boolean;
  onRetry: () => void;
  /** 미로그인 상태에서 바로 로그인할 수 있게 한다. 다른 탭으로 보내지 않는다. */
  onLogin?: () => void;
  onOpenRequest: (id: number) => void;
}

function formatDateHeading(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(year, month - 1, day));
}

function hospitalLabel(item: SavedIntakeSummary): string {
  if (!item.hospital) return "병원 확인 필요";
  if (item.hospitalStatus === "INFERRED") return `${item.hospital} · 추정`;
  if (item.hospitalStatus === "NEEDS_CONFIRMATION") {
    return `${item.hospital} · 확인 필요`;
  }
  return item.hospital;
}

function ScheduleRow({
  entry,
  onOpen,
}: {
  entry: ScheduleEntry;
  onOpen: (id: number) => void;
}) {
  const time = formatScheduleTime(entry.time);
  return (
    <button
      type="button"
      className="dc-schedule-row"
      onClick={() => onOpen(entry.intake.id)}
      aria-label={`${entry.intake.target ?? "대상자 확인 필요"} 일정 열기`}
    >
      <span className={`dc-schedule-time is-${time.tone}`}>{time.text}</span>
      <span className="dc-schedule-request">
        <span className="dc-schedule-target">
          {entry.intake.target ?? "대상자 확인 필요"}
        </span>
        <span
          className={`dc-schedule-hospital is-${entry.intake.hospitalStatus.toLowerCase()}`}
        >
          {hospitalLabel(entry.intake)}
        </span>
      </span>
      <span className="dc-schedule-row-side">
        {entry.intake.needsConfirmation && !entry.intake.confirmed ? (
          <span className="dc-chip dc-chip-warn">확인 필요</span>
        ) : entry.intake.status ? (
          <span className="dc-schedule-status">{entry.intake.status}</span>
        ) : null}
        <ArrowRight size={14} aria-hidden="true" />
      </span>
    </button>
  );
}

function ScheduleRows({
  entries,
  onOpen,
}: {
  entries: ScheduleEntry[];
  onOpen: (id: number) => void;
}) {
  return (
    <div className="dc-schedule-rows">
      {entries.map((entry) => (
        <ScheduleRow key={entry.intake.id} entry={entry} onOpen={onOpen} />
      ))}
    </div>
  );
}

export function ScheduleView({
  saved,
  times,
  loading,
  error,
  disconnected,
  onRetry,
  onLogin,
  onOpenRequest,
}: ScheduleViewProps) {
  const now = useMemo(() => new Date(), []);
  const schedule = useMemo(
    () => buildIntakeSchedule(saved, times, now),
    [saved, times, now],
  );

  return (
    <main className="dc-detail">
      <div className="dc-detail-head dc-schedule-head">
        <span className="dc-detail-name">일정</span>
        <span className="dc-detail-sub">저장된 접수의 방문일 기준</span>
        <span className="dc-detail-meta">
          오늘 {schedule.today.length}건 · 다가오는 일정 {schedule.totalUpcoming}건
        </span>
      </div>

      {loading && saved.length === 0 ? (
        <div className="dc-home-state" role="status">
          <span className="dc-home-state-title">일정을 불러오고 있습니다</span>
          <span>저장된 접수의 방문일을 확인하는 중입니다.</span>
        </div>
      ) : error && saved.length === 0 ? (
        <div className="dc-home-state is-error" role="alert">
          {/* 로그인 필요와 backend 연결 실패는 다른 상황이다. 섞어서 안내하지 않는다. */}
          <span className="dc-home-state-title">
            {isSavedIntakeAuthMessage(error)
              ? "직원 로그인이 필요합니다"
              : "일정에 연결하지 못했습니다"}
          </span>
          <span>{error}</span>
          {isSavedIntakeAuthMessage(error) && onLogin ? (
            <button type="button" className="dc-btn-primary" onClick={onLogin}>
              직원 로그인
            </button>
          ) : (
            <button type="button" className="dc-btn-ghost" onClick={onRetry}>
              <RefreshCw size={14} aria-hidden="true" />
              다시 연결
            </button>
          )}
        </div>
      ) : schedule.totalUpcoming === 0 ? (
        <div
          className={`dc-home-state${disconnected ? " is-error" : ""}`}
          role={disconnected ? "alert" : undefined}
        >
          <span className="dc-home-state-title">
            {disconnected
              ? "일정을 새로 확인하지 못했습니다"
              : "오늘 이후 일정이 없습니다"}
          </span>
          <span>
            {disconnected
              ? "연결을 복구한 뒤 저장된 접수의 일정을 다시 확인해 주세요."
              : "방문일이 확인된 저장 접수가 생기면 여기에 표시됩니다."}
          </span>
          {disconnected ? (
            <button type="button" className="dc-btn-ghost" onClick={onRetry}>
              <RefreshCw size={14} aria-hidden="true" />
              다시 연결
            </button>
          ) : null}
        </div>
      ) : (
        <div className="dc-schedule">
          {disconnected ? (
            <div className="dc-home-disconnected" role="status">
              <span>
                새 데이터를 확인하지 못했습니다. 마지막으로 불러온 일정을 표시합니다.
              </span>
              <button type="button" onClick={onRetry}>
                다시 연결
              </button>
            </div>
          ) : null}

          <section className="dc-schedule-section is-today">
            <div className="dc-schedule-section-head">
              <div>
                <span className="dc-schedule-kicker">오늘</span>
                <h2>
                  {new Intl.DateTimeFormat("ko-KR", {
                    month: "long",
                    day: "numeric",
                    weekday: "long",
                  }).format(now)}
                </h2>
              </div>
              <span>{schedule.today.length}건</span>
            </div>
            {schedule.today.length > 0 ? (
              <ScheduleRows entries={schedule.today} onOpen={onOpenRequest} />
            ) : (
              <p className="dc-schedule-empty">오늘 예정된 요청이 없습니다.</p>
            )}
          </section>

          {schedule.next ? (
            <section className="dc-schedule-section is-next">
              <div className="dc-schedule-section-head">
                <div>
                  <span className="dc-schedule-kicker">다음 일정</span>
                  <h2>{formatDateHeading(schedule.next.dateKey)}</h2>
                </div>
                <span>{schedule.next.entries.length}건</span>
              </div>
              <ScheduleRows
                entries={schedule.next.entries}
                onOpen={onOpenRequest}
              />
            </section>
          ) : null}

          {schedule.later.length > 0 ? (
            <section className="dc-schedule-section is-later">
              <div className="dc-schedule-section-head">
                <div>
                  <span className="dc-schedule-kicker">이후 일정</span>
                  <h2>날짜별 요청</h2>
                </div>
              </div>
              <div className="dc-schedule-groups">
                {schedule.later.map((group) => (
                  <div className="dc-schedule-group" key={group.dateKey}>
                    <h3>{formatDateHeading(group.dateKey)}</h3>
                    <ScheduleRows entries={group.entries} onOpen={onOpenRequest} />
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </main>
  );
}
