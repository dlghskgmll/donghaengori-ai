"use client";

import { useMemo } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import type { SavedIntakeSummary } from "@/lib/ai/savedIntakeView";
import {
  buildHomeDashboard,
  formatDashboardDate,
  localDateKey,
} from "@/lib/ui/homeDashboard";
import { getUrgentPresentation } from "@/lib/ui/urgentIntake";
import { isSavedIntakeAuthMessage } from "@/lib/ui/savedIntakeClient";

interface HomeDashboardProps {
  saved: SavedIntakeSummary[];
  loading: boolean;
  error: string | null;
  disconnected: boolean;
  onRetry: () => void;
  /** 미로그인 상태에서 바로 로그인할 수 있게 한다. 다른 탭으로 보내지 않는다. */
  onLogin?: () => void;
  onNewIntake: () => void;
  onOpenRequest: (id: number) => void;
}

function requestLabel(item: SavedIntakeSummary) {
  return item.target ?? "대상자 확인 필요";
}

function requestContext(item: SavedIntakeSummary) {
  return item.hospital ?? (item.urgent ? "사람 확인 우선" : "병원 확인 필요");
}

function RequestLink({
  item,
  onOpen,
  dateLabel,
}: {
  item: SavedIntakeSummary;
  onOpen: (id: number) => void;
  dateLabel?: string;
}) {
  const urgent = getUrgentPresentation(item.urgent, item.urgentConfidence);
  const badge = urgent?.label ?? (item.needsConfirmation ? "확인 필요" : null);

  return (
    <button
      type="button"
      className="dc-home-request"
      onClick={() => onOpen(item.id)}
      aria-label={`${requestLabel(item)} 요청 열기`}
    >
      <span className="dc-home-request-main">
        <span className="dc-home-request-title">{requestLabel(item)}</span>
        <span className="dc-home-request-context">{requestContext(item)}</span>
      </span>
      <span className="dc-home-request-side">
        {dateLabel ? <span className="dc-home-date">{dateLabel}</span> : null}
        {badge ? (
          <span className={`dc-chip dc-chip-${urgent?.tone ?? "warn"}`}>
            {badge}
          </span>
        ) : item.status ? (
          <span className="dc-home-status">{item.status}</span>
        ) : null}
        <ArrowRight size={14} aria-hidden="true" />
      </span>
    </button>
  );
}

function EmptySection({ children }: { children: string }) {
  return <p className="dc-home-section-empty">{children}</p>;
}

export function HomeDashboard({
  saved,
  loading,
  error,
  disconnected,
  onRetry,
  onLogin,
  onNewIntake,
  onOpenRequest,
}: HomeDashboardProps) {
  const now = useMemo(() => new Date(), []);
  const today = localDateKey(now);
  const dashboard = useMemo(() => buildHomeDashboard(saved, now), [saved, now]);

  return (
    <main className="dc-detail">
      <div className="dc-detail-head dc-home-head">
        <span className="dc-detail-name">오늘의 동행</span>
        <span className="dc-detail-sub">저장된 접수 기준</span>
        <span className="dc-detail-meta">
          {new Intl.DateTimeFormat("ko-KR", {
            month: "long",
            day: "numeric",
            weekday: "short",
          }).format(now)}
        </span>
      </div>

      {loading && saved.length === 0 ? (
        <div className="dc-home-state" role="status">
          <span className="dc-home-state-title">오늘의 요청을 불러오고 있습니다</span>
          <span>저장된 접수 목록을 확인하는 중입니다.</span>
        </div>
      ) : error && saved.length === 0 ? (
        <div className="dc-home-state is-error" role="alert">
          {/* 로그인 필요와 backend 연결 실패는 다른 상황이다. 섞어서 안내하지 않는다. */}
          <span className="dc-home-state-title">
            {isSavedIntakeAuthMessage(error)
              ? "직원 로그인이 필요합니다"
              : "요청 목록에 연결하지 못했습니다"}
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
      ) : saved.length === 0 ? (
        <div className="dc-home-state">
          <span className="dc-home-state-title">아직 저장된 요청이 없습니다</span>
          <span>새 요청을 접수하면 처리할 항목이 여기에 표시됩니다.</span>
          <button type="button" className="dc-btn-primary" onClick={onNewIntake}>
            새 요청 접수
          </button>
        </div>
      ) : (
        <div className="dc-home">
          {disconnected ? (
            <div className="dc-home-disconnected" role="status">
              <span>
                새 데이터를 확인하지 못했습니다. 마지막으로 불러온 요청을 표시합니다.
              </span>
              <button type="button" onClick={onRetry}>
                다시 연결
              </button>
            </div>
          ) : null}

          <dl className="dc-home-summary" aria-label="저장 접수 요약">
            <div>
              <dt>오늘 접수</dt>
              <dd>{dashboard.todayIncomingCount}건</dd>
            </div>
            <div>
              <dt>확인 필요</dt>
              <dd>{dashboard.needsReviewCount}건</dd>
            </div>
            <div>
              <dt>확정 완료</dt>
              <dd>{dashboard.confirmedCount}건</dd>
            </div>
          </dl>

          <section className="dc-home-section is-priority">
            <div className="dc-home-section-head">
              <div>
                <h2>오늘 처리할 요청</h2>
                <p>서버의 긴급·대기 우선순위를 그대로 따릅니다.</p>
              </div>
              <span>{dashboard.priority.length}건 표시</span>
            </div>
            <div className="dc-home-list">
              {dashboard.priority.length > 0 ? (
                dashboard.priority.map((item) => (
                  <RequestLink key={item.id} item={item} onOpen={onOpenRequest} />
                ))
              ) : (
                <EmptySection>현재 처리 대기 중인 요청이 없습니다.</EmptySection>
              )}
            </div>
          </section>

          <div className="dc-home-columns">
            <section className="dc-home-section">
              <div className="dc-home-section-head">
                <div>
                  <h2>확인이 필요한 요청</h2>
                  <p>사람이 원문이나 항목을 확인해야 합니다.</p>
                </div>
              </div>
              <div className="dc-home-list">
                {dashboard.needsReview.length > 0 ? (
                  dashboard.needsReview.map((item) => (
                    <RequestLink key={item.id} item={item} onOpen={onOpenRequest} />
                  ))
                ) : (
                  <EmptySection>확인이 필요한 요청이 없습니다.</EmptySection>
                )}
              </div>
            </section>

            <section className="dc-home-section">
              <div className="dc-home-section-head">
                <div>
                  <h2>가까운 일정</h2>
                  <p>확정된 요청의 방문일만 표시합니다.</p>
                </div>
              </div>
              <div className="dc-home-list">
                {dashboard.upcoming.length > 0 ? (
                  dashboard.upcoming.map(({ intake, dateKey }) => (
                    <RequestLink
                      key={intake.id}
                      item={intake}
                      onOpen={onOpenRequest}
                      dateLabel={formatDashboardDate(dateKey, today)}
                    />
                  ))
                ) : (
                  <EmptySection>확정된 가까운 일정이 없습니다.</EmptySection>
                )}
              </div>
            </section>
          </div>

          <section className="dc-home-section is-recent">
            <div className="dc-home-section-head">
              <div>
                <h2>최근 들어온 요청</h2>
                <p>접수 시각이 확인되는 최신 요청입니다.</p>
              </div>
            </div>
            <div className="dc-home-list">
              {dashboard.recent.length > 0 ? (
                dashboard.recent.map((item) => (
                  <RequestLink
                    key={item.id}
                    item={item}
                    onOpen={onOpenRequest}
                    dateLabel={item.createdAt ?? undefined}
                  />
                ))
              ) : (
                <EmptySection>접수 시각이 있는 요청이 없습니다.</EmptySection>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
