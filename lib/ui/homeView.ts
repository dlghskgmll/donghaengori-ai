// 새 홈(오늘의 동행) 화면 전용 selector.
//
// buildHomeDashboard는 기존 테스트가 반환 shape을 고정하고 있어 그대로 두고,
// 새 IA(KPI 4개 · 통합 우선 목록 · 일정 rail · 활동)는 여기서 파생한다.
// 원칙은 같다 — 목록에 실제로 있는 값만 쓰고, 없는 값은 만들지 않는다.

import type { SavedIntakeSummary } from "@/lib/ai/savedIntakeView";
import {
  dateKeyOf,
  isCompletedIntake,
  localDateKey,
  type HomeScheduleItem,
} from "./homeDashboard";
import type { ScheduleTimeState } from "./intakeSchedule";

export interface HomeKpis {
  /** 오늘 들어온 접수 (createdAt이 오늘인 것만). */
  todayIncoming: number;
  /** 사람 확인이 남은 요청. */
  needsReview: number;
  /** 서버가 확정한 접수 전체. */
  confirmed: number;
  /** 오늘 방문 예정인 확정 동행. */
  todayVisits: number;
}

export function buildHomeKpis(
  saved: SavedIntakeSummary[],
  now: Date = new Date(),
): HomeKpis {
  const today = localDateKey(now);
  const active = saved.filter((item) => !isCompletedIntake(item));
  return {
    todayIncoming: saved.filter((item) => dateKeyOf(item.createdAt) === today)
      .length,
    needsReview: active.filter((item) => item.needsConfirmation).length,
    confirmed: saved.filter((item) => item.confirmed).length,
    todayVisits: saved.filter(
      (item) => item.confirmed && dateKeyOf(item.appointmentDate) === today,
    ).length,
  };
}

/**
 * 지금 먼저 볼 요청 — 기존 홈의 "오늘 처리할 요청"과 "확인이 필요한 요청"을
 * 하나로 합친다. 같은 요청이 화면에 두 번 나오지 않게 하는 것이 목적이다.
 * 서버가 준 순서를 존중하되, 긴급만 앞으로 모은다.
 */
export function buildPriorityList(
  saved: SavedIntakeSummary[],
  limit = 6,
): SavedIntakeSummary[] {
  const active = saved.filter((item) => !isCompletedIntake(item));
  const urgent = active.filter((item) => item.urgent);
  const pending = active.filter(
    (item) => !item.urgent && item.needsConfirmation,
  );
  return [...urgent, ...pending].slice(0, limit);
}

/**
 * 우선 목록의 **전체** 건수.
 *
 * buildPriorityList는 화면 표시용으로 잘린 목록을 준다 — 그 length를 "남은 일"로
 * 쓰면 7건 이상일 때 영원히 6건으로 보인다. 헤드라인·배지 숫자는 이 값을 쓴다.
 */
export function countPriority(saved: SavedIntakeSummary[]): number {
  return saved.filter(
    (item) => !isCompletedIntake(item) && (item.urgent || item.needsConfirmation),
  ).length;
}

/** 시간이 없거나 형식이 어긋난 값은 뒤로 보낸다(추측하지 않는다). */
function timeSortKey(time: ScheduleTimeState | undefined): string {
  if (!time || time.state !== "loaded" || !time.value) return "99:99";
  return /^\d{2}:\d{2}$/.test(time.value) ? time.value : "99:98";
}

/**
 * 오늘 방문 예정인 확정 동행. 시간순으로 정렬한다.
 *
 * buildHomeDashboard.upcoming은 앞 4건만 주므로 그걸 필터링하면 오늘이 5건 이상일 때
 * KPI(전체 카운트)와 rail 숫자가 어긋난다. 그래서 목록에서 직접 고른다.
 */
export function buildTodayVisits(
  saved: SavedIntakeSummary[],
  times: Readonly<Record<number, ScheduleTimeState>> = {},
  now: Date = new Date(),
): SavedIntakeSummary[] {
  const today = localDateKey(now);
  return saved
    .filter((item) => item.confirmed && dateKeyOf(item.appointmentDate) === today)
    .sort((a, b) => {
      const byTime = timeSortKey(times[a.id]).localeCompare(timeSortKey(times[b.id]));
      return byTime !== 0 ? byTime : a.id - b.id;
    });
}

export interface ScheduleRailGroup {
  dateKey: string;
  label: string;
  items: SavedIntakeSummary[];
}

/** 가까운 일정을 날짜별로 묶는다. 시간은 목록에 없으므로 표시하지 않는다. */
export function groupUpcoming(
  upcoming: HomeScheduleItem[],
  now: Date = new Date(),
): ScheduleRailGroup[] {
  const today = localDateKey(now);
  const groups: ScheduleRailGroup[] = [];
  for (const { intake, dateKey } of upcoming) {
    const last = groups[groups.length - 1];
    if (last && last.dateKey === dateKey) {
      last.items.push(intake);
      continue;
    }
    const [, month, day] = dateKey.split("-");
    const label =
      dateKey === today
        ? `오늘 · ${Number(month)}월 ${Number(day)}일`
        : `${Number(month)}월 ${Number(day)}일`;
    groups.push({ dateKey, label, items: [intake] });
  }
  return groups;
}

export interface HomeActivityEvent {
  id: number;
  /** 실제 접수 시각 문자열 그대로. 파싱에 실패한 행은 목록에 넣지 않는다. */
  at: string;
  target: string | null;
  channel: string | null;
  urgent: boolean;
}

/**
 * 최근 활동 — 지금은 접수 이벤트만 실제 데이터(createdAt)로 만들 수 있다.
 * 확정·수정 시각은 목록에 없으므로 이벤트를 지어내지 않는다.
 * 향후 audit log가 연결되면 이 구조에 다른 이벤트가 추가된다.
 */
export function buildActivityEvents(
  saved: SavedIntakeSummary[],
  limit = 5,
): HomeActivityEvent[] {
  return saved
    .filter((item) => item.createdAt !== null)
    .sort((a, b) => {
      const byCreated = (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
      return byCreated || b.id - a.id;
    })
    .slice(0, limit)
    .map((item) => ({
      id: item.id,
      at: item.createdAt as string,
      target: item.target,
      channel: item.channel,
      urgent: item.urgent,
    }));
}

export interface WeekGlance {
  /** 사람 확인이 남은 요청 (시점 무관 — 지금 남은 것). */
  needsReview: number;
  /** 이번 주(일~토)에 들어온 접수. */
  newThisWeek: number;
  /** 이번 주 방문 예정인 확정 동행. */
  confirmedThisWeek: number;
}

/** 우측 '이번 주 한눈에 보기' — 실제 목록 값으로만 센다. */
export function buildWeekGlance(
  saved: SavedIntakeSummary[],
  now: Date = new Date(),
): WeekGlance {
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const startKey = localDateKey(start);
  const endKey = localDateKey(end);
  const inWeek = (key: string | null) =>
    key !== null && key >= startKey && key <= endKey;

  const active = saved.filter((item) => !isCompletedIntake(item));
  return {
    needsReview: active.filter((item) => item.needsConfirmation).length,
    newThisWeek: saved.filter((item) => inWeek(dateKeyOf(item.createdAt))).length,
    confirmedThisWeek: saved.filter(
      (item) => item.confirmed && inWeek(dateKeyOf(item.appointmentDate)),
    ).length,
  };
}
