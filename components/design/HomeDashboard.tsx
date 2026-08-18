"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  HandHeart,
  NotebookPen,
  RefreshCw,
  UsersRound,
} from "lucide-react";
import type { SavedIntakeSummary } from "@/lib/ai/savedIntakeView";
import {
  buildHomeKpis,
  buildPriorityList,
  buildTodayVisits,
  buildWeekGlance,
  countPriority,
} from "@/lib/ui/homeView";
import {
  formatScheduleTime,
  type ScheduleTimeState,
} from "@/lib/ui/intakeSchedule";
import { getUrgentPresentation } from "@/lib/ui/urgentIntake";
import { isSavedIntakeAuthMessage } from "@/lib/ui/savedIntakeClient";
import type { RequestFilter } from "./RequestList";
import { ElderAvatar } from "./ElderAvatar";
import { HomeIllustration } from "./HomeIllustration";

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
  /** 요청 탭으로 이동. filter를 주면 해당 필터가 켜진 채 열린다. */
  onOpenRequests?: (filter?: RequestFilter) => void;
  /** 일정 탭으로 이동. */
  onOpenSchedule?: () => void;
  /** 사후기록 탭으로 이동. */
  onOpenRecords?: () => void;
  /** 일정 탭과 같은 read 경로로 채워지는 실제 예약 시간. */
  times?: Readonly<Record<number, ScheduleTimeState>>;
  /** 로그인된 직원 이름 (실제 세션 값만, 없으면 생략). */
  staffName?: string | null;
}

/** 2026-08-20 → 8월 20일. 형식이 다르면 원문 그대로(지어내지 않는다). */
function shortVisitDate(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return `${Number(match[2])}월 ${Number(match[3])}일`;
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;
const WEEK_ORDINALS = ["첫째", "둘째", "셋째", "넷째", "다섯째", "여섯째"] as const;

/** 표시할 주(일~토) strip. offsetWeeks만큼 앞뒤로 넘겨볼 수 있다 — 실제 달력 계산만 한다. */
function buildWeekStrip(now: Date, offsetWeeks: number) {
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay() + offsetWeeks * 7);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      label: WEEKDAY_LABELS[index],
      day: date.getDate(),
      today:
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate(),
    };
  });
  // 주 제목은 그 주의 목요일(주의 중앙)이 속한 달과, 그 달에서 몇 번째 목요일인지로
  // 정한다. 달 라벨과 서수가 같은 기준을 쓰므로 '첫째 주'가 사라지거나 서수가
  // 한 칸씩 밀리는 일이 없다 — 두 규칙을 섞으면 1일이 금·토인 달마다 어긋난다.
  const mid = new Date(start);
  mid.setDate(start.getDate() + 4);
  const ordinal = WEEK_ORDINALS[Math.ceil(mid.getDate() / 7) - 1] ?? "";
  return { title: `${mid.getMonth() + 1}월 ${ordinal} 주`, days };
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
  onOpenRequests,
  onOpenSchedule,
  onOpenRecords,
  times = {},
  staffName,
}: HomeDashboardProps) {
  const now = useMemo(() => new Date(), []);
  const kpis = useMemo(() => buildHomeKpis(saved, now), [saved, now]);
  const priority = useMemo(() => buildPriorityList(saved), [saved]);
  // 표시용 목록은 상한이 있으므로 숫자는 전체 건수를 따로 센다.
  const priorityTotal = useMemo(() => countPriority(saved), [saved]);
  const glance = useMemo(() => buildWeekGlance(saved, now), [saved, now]);
  const [weekOffset, setWeekOffset] = useState(0);
  const week = useMemo(() => buildWeekStrip(now, weekOffset), [now, weekOffset]);

  const todayItems = useMemo(
    () => buildTodayVisits(saved, times, now),
    [saved, times, now],
  );

  const dateLine = new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(now);

  if (loading && saved.length === 0) {
    return (
      <main className="dc-detail">
        <div className="dc-home-state" role="status">
          <span className="dc-home-state-title">오늘의 요청을 불러오고 있습니다</span>
          <span>저장된 접수 목록을 확인하는 중입니다.</span>
        </div>
      </main>
    );
  }

  if (error && saved.length === 0) {
    return (
      <main className="dc-detail">
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
      </main>
    );
  }

  if (saved.length === 0) {
    return (
      <main className="dc-detail">
        <div className="dc-home-state">
          <span className="dc-home-state-title">아직 저장된 요청이 없습니다</span>
          <span>새 요청을 접수하면 처리할 항목이 여기에 표시됩니다.</span>
          <button type="button" className="dc-btn-primary" onClick={onNewIntake}>
            새 요청 접수
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="dc-detail dch-panel">
      <main className="dch-main">
        {/* Welcome — 업무가 주인공인 인사 영역. 큰 배너 대신 작은 브랜드 일러스트만. */}
        <div className="dch-welcome">
          <div className="dch-welcome-text">
            <span className="dch-title">오늘의 동행</span>
            <span className="dch-greeting">
              {staffName ? `${staffName} 님, ` : ""}오늘도 따뜻한 동행을 응원합니다.
            </span>
            <span className="dch-sub">
              {dateLine} · 지금 처리할 일 {priorityTotal}건이 남아있어요
            </span>
          </div>
          <HomeIllustration />
        </div>

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

        {/*
          KPI — 카드 4개가 아니라 divider로 나뉜 하나의 summary strip.
          읽는 순서는 숫자 → 라벨 → 설명이고, 즉시 행동이 필요한 '확인 필요'
          하나만 브랜드 색으로 강조한다(면을 칠하지 않고 숫자·점 수준으로).
        */}
        <div className="dch-kpis" role="group" aria-label="오늘의 업무 요약">
          <button type="button" className="dch-kpi" onClick={() => onOpenSchedule?.()}>
            <span className="dch-kpi-num">
              {kpis.todayVisits}
              <em>건</em>
            </span>
            <span className="dch-kpi-label">오늘 일정</span>
            <span className="dch-kpi-desc">오늘 처리할 동행</span>
          </button>
          <button
            type="button"
            className={`dch-kpi${kpis.needsReview > 0 ? " is-attn" : ""}`}
            onClick={() => onOpenRequests?.("todo")}
          >
            <span className="dch-kpi-num">
              {kpis.needsReview}
              <em>건</em>
            </span>
            <span className="dch-kpi-label">
              {kpis.needsReview > 0 ? (
                <span className="dch-kpi-dot" aria-hidden="true" />
              ) : null}
              확인 필요
            </span>
            <span className="dch-kpi-desc">사람 확인이 남은 요청</span>
          </button>
          <button
            type="button"
            className="dch-kpi"
            onClick={() => onOpenRequests?.("all")}
          >
            <span className="dch-kpi-num">
              {kpis.todayIncoming}
              <em>건</em>
            </span>
            <span className="dch-kpi-label">신규 접수</span>
            <span className="dch-kpi-desc">오늘 들어온 요청</span>
          </button>
          <button
            type="button"
            className="dch-kpi"
            onClick={() => onOpenRequests?.("done")}
          >
            <span className="dch-kpi-num">
              {kpis.confirmed}
              <em>건</em>
            </span>
            <span className="dch-kpi-label">일정 확정</span>
            <span className="dch-kpi-desc">확정된 일정</span>
          </button>
        </div>

        {/* 먼저 처리할 일 */}
        <section className="dch-todo" aria-label="먼저 처리할 일">
          <div className="dch-todo-head">
            <span className="dch-section-title">먼저 처리할 일</span>
            {priorityTotal > 0 ? (
              <span className="dch-count">
                {priorityTotal}
                <span className="dch-sr">건</span>
              </span>
            ) : null}
          </div>
          {priority.length === 0 ? (
            <div className="dch-todo-empty">
              오늘 처리할 일이 없어요. 새 요청이 오면 여기에 표시됩니다.
            </div>
          ) : (
            <>
              <div className="dch-todo-rows">
                {priority.map((item) => {
                  const urgent = getUrgentPresentation(item.urgent, item.urgentConfidence);
                  const visitDate = shortVisitDate(item.appointmentDate);
                  const sub = urgent
                    ? urgent.listLine ?? "사람 확인이 먼저 필요해요"
                    : [
                        item.hospital ?? "병원 정보가 아직 확인되지 않았어요",
                        visitDate,
                        item.channel,
                      ]
                        .filter(Boolean)
                        .join(" · ");
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="dch-todo-row"
                      onClick={() => onOpenRequest(item.id)}
                    >
                      <ElderAvatar name={item.target} size="md" />
                      <span className="dch-todo-body">
                        <span className="dch-todo-top">
                          <span className="dch-todo-name">
                            {item.target
                              ? `${item.target} 어르신`
                              : "대상자 확인 필요"}
                          </span>
                          <span
                            className={`dch-badge${urgent ? " is-red" : " is-amber"}`}
                          >
                            {urgent ? "긴급" : "확인 필요"}
                          </span>
                        </span>
                        <span className="dch-todo-sub">{sub}</span>
                      </span>
                      <span className="dch-todo-action">
                        요청 열기
                        <ChevronRight size={14} strokeWidth={2.2} aria-hidden="true" />
                      </span>
                    </button>
                  );
                })}
              </div>
              {onOpenRequests ? (
                <button
                  type="button"
                  className="dch-all"
                  onClick={() => onOpenRequests()}
                >
                  {priorityTotal > priority.length
                    ? `나머지 ${priorityTotal - priority.length}건 포함 모두 보기`
                    : "모든 요청 보기"}
                  <ChevronRight size={13} strokeWidth={2.2} aria-hidden="true" />
                </button>
              ) : null}
            </>
          )}
        </section>

        {/* 하단 CTA — 사후기록 습관을 돕는 한 줄 배너 */}
        {onOpenRecords ? (
          <div className="dch-cta-banner">
            <span className="dch-cta-icon" aria-hidden="true">
              <HandHeart size={22} strokeWidth={1.8} />
            </span>
            <span className="dch-cta-text">
              <strong>작은 기록이 큰 힘이 됩니다</strong>
              <span>사후기록을 남기면 다음 동행이 더 쉬워져요.</span>
            </span>
            <button type="button" className="dch-cta-btn" onClick={onOpenRecords}>
              <NotebookPen size={15} strokeWidth={2} aria-hidden="true" />
              사후기록 작성하기
            </button>
          </div>
        ) : null}
      </main>

      <aside className="dch-rail" aria-label="가까운 일정">
        {/* 주간 캘린더 카드 */}
        <div className="dch-card">
          <div className="dch-rail-head">
            <span className="dch-section-title">{week.title}</span>
            <span className="dch-week-nav">
              <button
                type="button"
                aria-label="이전 주"
                onClick={() => setWeekOffset((value) => value - 1)}
              >
                <ChevronLeft size={15} strokeWidth={2} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="다음 주"
                onClick={() => setWeekOffset((value) => value + 1)}
              >
                <ChevronRight size={15} strokeWidth={2} aria-hidden="true" />
              </button>
            </span>
          </div>
          <div className="dch-week-grid">
            {week.days.map((day) => (
              <span className="dch-week-day" key={`${week.title}-${day.label}`}>
                <span className="dch-week-label">{day.label}</span>
                <span className={`dch-week-num${day.today ? " is-today" : ""}`}>
                  {day.day}
                </span>
              </span>
            ))}
          </div>

          <div className="dch-today">
            <div className="dch-rail-head">
              <span className="dch-section-title">
                오늘 일정 · {todayItems.length}건
              </span>
              {onOpenSchedule ? (
                <button type="button" className="dch-rail-more" onClick={onOpenSchedule}>
                  전체 보기
                </button>
              ) : null}
            </div>

            {todayItems.length === 0 ? (
              <div className="dch-today-empty">오늘 예정된 동행이 없어요.</div>
            ) : (
              <div className="dch-today-rows">
                {todayItems.map((intake) => {
                  const time = times[intake.id] ?? { state: "loading" as const };
                  const formatted = formatScheduleTime(time);
                  const timeShort =
                    time.state === "loaded" && time.value ? time.value : "—";
                  return (
                    <button
                      key={intake.id}
                      type="button"
                      className="dch-today-row"
                      onClick={() => onOpenRequest(intake.id)}
                    >
                      <span className="dch-today-time">{timeShort}</span>
                      <span className="dch-today-dot" aria-hidden="true" />
                      <span className="dch-today-body">
                        <span className="dch-today-name">
                          {intake.target
                            ? `${intake.target} 어르신`
                            : "대상자 확인 필요"}
                        </span>
                        <span className="dch-today-sub">
                          {intake.hospital ?? "병원 확인 예정"}
                        </span>
                        {formatted.tone !== "normal" ? (
                          <span className="dch-today-status">{formatted.text}</span>
                        ) : null}
                      </span>
                      {intake.status ? (
                        <span className="dch-today-chip">{intake.status}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 이번 주 한눈에 보기 */}
        <div className="dch-card">
          <span className="dch-section-title">한눈에 보기</span>
          <div className="dch-glance-rows">
            <button
              type="button"
              className="dch-glance-row"
              onClick={() => onOpenRequests?.("todo")}
            >
              <span className="dch-glance-icon is-amber">
                <ClipboardCheck size={16} strokeWidth={1.9} aria-hidden="true" />
              </span>
              <span className="dch-glance-body">
                <span className="dch-glance-label">확인 필요</span>
                <span className="dch-glance-desc">지금 남은 요청 (기간 전체)</span>
              </span>
              <span className="dch-glance-num">{glance.needsReview}건</span>
              <ChevronRight size={14} strokeWidth={2} aria-hidden="true" className="dch-glance-arrow" />
            </button>
            <button
              type="button"
              className="dch-glance-row"
              onClick={() => onOpenRequests?.("all")}
            >
              <span className="dch-glance-icon is-mint">
                <UsersRound size={16} strokeWidth={1.9} aria-hidden="true" />
              </span>
              <span className="dch-glance-body">
                <span className="dch-glance-label">신규 접수</span>
                <span className="dch-glance-desc">이번 주 들어온 요청</span>
              </span>
              <span className="dch-glance-num">{glance.newThisWeek}건</span>
              <ChevronRight size={14} strokeWidth={2} aria-hidden="true" className="dch-glance-arrow" />
            </button>
            <button
              type="button"
              className="dch-glance-row"
              onClick={() => onOpenSchedule?.()}
            >
              <span className="dch-glance-icon is-blue">
                <CalendarDays size={16} strokeWidth={1.9} aria-hidden="true" />
              </span>
              <span className="dch-glance-body">
                <span className="dch-glance-label">일정 확정</span>
                <span className="dch-glance-desc">이번 주 확정된 동행</span>
              </span>
              <span className="dch-glance-num">{glance.confirmedThisWeek}건</span>
              <ChevronRight size={14} strokeWidth={2} aria-hidden="true" className="dch-glance-arrow" />
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
