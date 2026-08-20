import { describe, expect, it } from "vitest";
import type {
  SavedIntakeDetailView,
  SavedIntakeSummary,
} from "../lib/ai/savedIntakeView";
import {
  buildIntakeSchedule,
  formatScheduleTime,
  timeStateFromDetail,
  type ScheduleTimeState,
} from "../lib/ui/intakeSchedule";

const NOW = new Date("2026-08-17T09:00:00+09:00");

function intake(
  id: number,
  overrides: Partial<SavedIntakeSummary> = {},
): SavedIntakeSummary {
  return {
    id,
    target: `대상자 ${id}`,
    hospital: `병원 ${id}`,
    hospitalStatus: "CONFIRMED_BY_INPUT",
    channel: "전화",
    status: "접수 대기",
    createdAt: "2026-08-17 08:00",
    appointmentDate: "2026-08-17",
    confirmed: false,
    urgent: false,
    urgentConfidence: null,
    needsConfirmation: false,
    ...overrides,
  };
}

function detailWithTime(
  value: string | null,
  status: "CONFIRMED_BY_INPUT" | "INFERRED" | "NEEDS_CONFIRMATION",
): SavedIntakeDetailView {
  return {
    id: 1,
    target: "박순자",
    channel: "전화",
    status: "접수 대기",
    createdAt: "2026-08-17 08:00",
    utterance: "모레 10시에 병원 가요",
    summary: null,
    intent: "병원동행",
    urgent: false,
    urgentConfidence: null,
    fields: [
      { key: "time", label: "예약 시간", value, status, evidence: [] },
    ],
    confirmQuestions: [],
    notes: [],
  outingChecklist: [],
  requestType: null,
  profileFacts: [],
  followups: [],
  followupStopped: null,
  hospitalCandidates: [],
    hospitalDowngraded: false,
    confirmed: false,
    gate: null,
  };
}

describe("U6 saved intake schedule", () => {
  it("U6-01 오늘 요청을 실제 appointmentDate로 묶는다", () => {
    const model = buildIntakeSchedule(
      [intake(1), intake(2, { appointmentDate: "2026-08-18" })],
      {},
      NOW,
    );
    expect(model.today.map((entry) => entry.intake.id)).toEqual([1]);
  });

  it("U6-02 가장 가까운 미래 날짜를 다음 일정으로 둔다", () => {
    const model = buildIntakeSchedule(
      [
        intake(1, { appointmentDate: "2026-08-20" }),
        intake(2, { appointmentDate: "2026-08-18" }),
        intake(3, { appointmentDate: "2026-08-18" }),
      ],
      {},
      NOW,
    );
    expect(model.next?.dateKey).toBe("2026-08-18");
    expect(model.next?.entries).toHaveLength(2);
    expect(model.later.map((group) => group.dateKey)).toEqual(["2026-08-20"]);
  });

  it("U6-03 같은 날짜에서는 실제 HH:mm 시간이 먼저 온다", () => {
    const times: Record<number, ScheduleTimeState> = {
      1: { state: "loaded", value: null, status: "NEEDS_CONFIRMATION" },
      2: { state: "loaded", value: "14:00", status: "CONFIRMED_BY_INPUT" },
      3: { state: "loaded", value: "09:30", status: "CONFIRMED_BY_INPUT" },
    };
    const model = buildIntakeSchedule([intake(1), intake(2), intake(3)], times, NOW);
    expect(model.today.map((entry) => entry.intake.id)).toEqual([3, 2, 1]);
  });

  it("U6-04 time field의 값과 상태를 saved detail에서 그대로 읽는다", () => {
    expect(timeStateFromDetail(detailWithTime("10:30", "INFERRED"))).toEqual({
      state: "loaded",
      value: "10:30",
      status: "INFERRED",
    });
  });

  it("U6-05 시간이 없으면 임의 생성하지 않고 확인 필요로 표시한다", () => {
    const time = timeStateFromDetail(detailWithTime(null, "NEEDS_CONFIRMATION"));
    expect(formatScheduleTime(time)).toEqual({
      text: "시간 확인 필요",
      tone: "warn",
    });
  });

  it("U6-06 추정 시간은 확정 시간과 다른 문구로 표시한다", () => {
    expect(
      formatScheduleTime({ state: "loaded", value: "10:30", status: "INFERRED" }),
    ).toEqual({ text: "10:30 · 추정", tone: "warn" });
  });

  it("U6-07 detail 실패와 loading을 확정 시간처럼 표시하지 않는다", () => {
    expect(formatScheduleTime({ state: "error" }).text).toBe(
      "시간 정보를 불러오지 못함",
    );
    expect(formatScheduleTime({ state: "loading" }).text).toBe("시간 확인 중");
  });

  it("U6-08 과거·날짜 없음·긴급 요청은 업무 일정으로 만들지 않는다", () => {
    const model = buildIntakeSchedule(
      [
        intake(1, { appointmentDate: "2026-08-16" }),
        intake(2, { appointmentDate: null }),
        intake(3, { urgent: true }),
      ],
      {},
      NOW,
    );
    expect(model.totalUpcoming).toBe(0);
  });

  it("U6-09 INFERRED 병원 상태는 schedule model에서도 그대로 보존한다", () => {
    const model = buildIntakeSchedule(
      [intake(1, { hospital: "과거 방문 병원", hospitalStatus: "INFERRED" })],
      {},
      NOW,
    );
    expect(model.today[0].intake.hospitalStatus).toBe("INFERRED");
  });
});
