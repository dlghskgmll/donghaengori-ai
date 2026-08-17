import type { EvidenceStatus } from "@/lib/domain/intake";
import type {
  SavedIntakeDetailView,
  SavedIntakeSummary,
} from "@/lib/ai/savedIntakeView";
import { dateKeyOf, localDateKey } from "./homeDashboard";

export type ScheduleTimeState =
  | { state: "loading" }
  | { state: "error" }
  | { state: "loaded"; value: string | null; status: EvidenceStatus };

export interface ScheduleEntry {
  intake: SavedIntakeSummary;
  dateKey: string;
  time: ScheduleTimeState;
}

export interface ScheduleDateGroup {
  dateKey: string;
  entries: ScheduleEntry[];
}

export interface IntakeScheduleModel {
  today: ScheduleEntry[];
  next: ScheduleDateGroup | null;
  later: ScheduleDateGroup[];
  totalUpcoming: number;
}

export function timeStateFromDetail(
  detail: SavedIntakeDetailView,
): ScheduleTimeState {
  const time = detail.fields.find((field) => field.key === "time");
  return {
    state: "loaded",
    value: time?.value ?? null,
    status: time?.status ?? "NEEDS_CONFIRMATION",
  };
}

function timeSortValue(time: ScheduleTimeState): string {
  if (time.state !== "loaded" || !time.value) return "99:99";
  return /^\d{2}:\d{2}$/.test(time.value) ? time.value : "99:98";
}

/** 실제 날짜가 있는 비긴급 saved intake만 오늘 이후 일정으로 묶는다. */
export function buildIntakeSchedule(
  saved: SavedIntakeSummary[],
  times: Readonly<Record<number, ScheduleTimeState>>,
  now: Date = new Date(),
): IntakeScheduleModel {
  const todayKey = localDateKey(now);
  const entries = saved
    .flatMap((intake) => {
      const dateKey = dateKeyOf(intake.appointmentDate);
      if (!dateKey || dateKey < todayKey || intake.urgent) return [];
      return [
        {
          intake,
          dateKey,
          time: times[intake.id] ?? ({ state: "loading" } as const),
        },
      ];
    })
    .sort((a, b) => {
      const byDate = a.dateKey.localeCompare(b.dateKey);
      if (byDate) return byDate;
      const byTime = timeSortValue(a.time).localeCompare(timeSortValue(b.time));
      return byTime || b.intake.id - a.intake.id;
    });

  const today = entries.filter((entry) => entry.dateKey === todayKey);
  const future = entries.filter((entry) => entry.dateKey > todayKey);
  const grouped = new Map<string, ScheduleEntry[]>();
  for (const entry of future) {
    const group = grouped.get(entry.dateKey) ?? [];
    group.push(entry);
    grouped.set(entry.dateKey, group);
  }
  const groups = [...grouped.entries()].map(([dateKey, groupEntries]) => ({
    dateKey,
    entries: groupEntries,
  }));

  return {
    today,
    next: groups[0] ?? null,
    later: groups.slice(1),
    totalUpcoming: entries.length,
  };
}

export function formatScheduleTime(time: ScheduleTimeState): {
  text: string;
  tone: "normal" | "warn" | "muted";
} {
  if (time.state === "loading") {
    return { text: "시간 확인 중", tone: "muted" };
  }
  if (time.state === "error") {
    return { text: "시간 정보를 불러오지 못함", tone: "warn" };
  }
  if (!time.value) {
    return { text: "시간 확인 필요", tone: "warn" };
  }
  if (time.status === "INFERRED") {
    return { text: `${time.value} · 추정`, tone: "warn" };
  }
  if (time.status === "NEEDS_CONFIRMATION") {
    return { text: `${time.value} · 확인 필요`, tone: "warn" };
  }
  return { text: time.value, tone: "normal" };
}
