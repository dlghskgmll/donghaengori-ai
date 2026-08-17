import type { SavedIntakeSummary } from "@/lib/ai/savedIntakeView";

export interface HomeScheduleItem {
  intake: SavedIntakeSummary;
  dateKey: string;
}

export interface HomeDashboardModel {
  todayIncomingCount: number;
  needsReviewCount: number;
  confirmedCount: number;
  priority: SavedIntakeSummary[];
  needsReview: SavedIntakeSummary[];
  upcoming: HomeScheduleItem[];
  recent: SavedIntakeSummary[];
}

const DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateKeyOf(value: string | null): string | null {
  const match = value?.match(DATE_PREFIX);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

export function isCompletedIntake(item: SavedIntakeSummary): boolean {
  return item.confirmed || item.status === "긴급 처리됨";
}

/** 목록에 실제로 있는 필드만으로 홈의 작은 업무 요약을 만든다. */
export function buildHomeDashboard(
  saved: SavedIntakeSummary[],
  now: Date = new Date(),
): HomeDashboardModel {
  const today = localDateKey(now);
  const active = saved.filter((item) => !isCompletedIntake(item));
  const needsReview = active.filter((item) => item.needsConfirmation);

  const upcoming = saved
    .flatMap((intake) => {
      const dateKey = dateKeyOf(intake.appointmentDate);
      return intake.confirmed && dateKey && dateKey >= today
        ? [{ intake, dateKey }]
        : [];
    })
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || b.intake.id - a.intake.id)
    .slice(0, 4);

  const recent = saved
    .filter((item) => dateKeyOf(item.createdAt) !== null)
    .sort((a, b) => {
      const byCreated = (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
      return byCreated || b.id - a.id;
    })
    .slice(0, 4);

  return {
    todayIncomingCount: saved.filter(
      (item) => dateKeyOf(item.createdAt) === today,
    ).length,
    needsReviewCount: needsReview.length,
    confirmedCount: saved.filter((item) => item.confirmed).length,
    priority: active.slice(0, 5),
    needsReview: needsReview.slice(0, 4),
    upcoming,
    recent,
  };
}

export function formatDashboardDate(dateKey: string, today: string): string {
  if (dateKey === today) return "오늘";
  const [, month, day] = dateKey.split("-");
  return `${Number(month)}월 ${Number(day)}일`;
}
