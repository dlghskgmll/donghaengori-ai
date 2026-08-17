import { describe, expect, it } from "vitest";
import type { SavedIntakeSummary } from "../lib/ai/savedIntakeView";
import {
  buildHomeDashboard,
  dateKeyOf,
  formatDashboardDate,
} from "../lib/ui/homeDashboard";

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
    appointmentDate: null,
    confirmed: false,
    urgent: false,
    urgentConfidence: null,
    needsConfirmation: false,
    ...overrides,
  };
}

describe("U5 saved intake home dashboard", () => {
  it("U5-01 오늘 접수는 실제 createdAt 날짜로만 센다", () => {
    const model = buildHomeDashboard(
      [
        intake(1),
        intake(2, { createdAt: "2026-08-16 23:59" }),
        intake(3, { createdAt: null }),
      ],
      NOW,
    );

    expect(model.todayIncomingCount).toBe(1);
  });

  it("U5-02 확인 필요는 완료되지 않은 실제 요청만 센다", () => {
    const model = buildHomeDashboard(
      [
        intake(1, { needsConfirmation: true }),
        intake(2, { needsConfirmation: false }),
        intake(3, {
          needsConfirmation: true,
          confirmed: true,
          status: "확정",
        }),
      ],
      NOW,
    );

    expect(model.needsReviewCount).toBe(1);
    expect(model.needsReview.map((item) => item.id)).toEqual([1]);
  });

  it("U5-03 확정 완료는 backend confirmed 값으로 센다", () => {
    const model = buildHomeDashboard(
      [intake(1, { confirmed: true, status: "확정" }), intake(2)],
      NOW,
    );
    expect(model.confirmedCount).toBe(1);
  });

  it("U5-04 오늘 처리할 요청은 server 우선순서를 바꾸지 않는다", () => {
    const model = buildHomeDashboard(
      [intake(9, { urgent: true }), intake(7), intake(3)],
      NOW,
    );
    expect(model.priority.map((item) => item.id)).toEqual([9, 7, 3]);
  });

  it("U5-05 가까운 일정은 확정되고 오늘 이후인 날짜만 표시한다", () => {
    const model = buildHomeDashboard(
      [
        intake(1, { confirmed: true, appointmentDate: "2026-08-18" }),
        intake(2, { confirmed: false, appointmentDate: "2026-08-17" }),
        intake(3, { confirmed: true, appointmentDate: "2026-08-16" }),
        intake(4, { confirmed: true, appointmentDate: "2026-08-17" }),
      ],
      NOW,
    );

    expect(model.upcoming.map(({ intake: item }) => item.id)).toEqual([4, 1]);
  });

  it("U5-06 최근 요청은 실제 접수 시각 최신순이며 없는 시각은 제외한다", () => {
    const model = buildHomeDashboard(
      [
        intake(1, { createdAt: "2026-08-17 08:00" }),
        intake(2, { createdAt: "2026-08-17 10:30" }),
        intake(3, { createdAt: null }),
      ],
      NOW,
    );
    expect(model.recent.map((item) => item.id)).toEqual([2, 1]);
  });

  it("U5-07 날짜가 없거나 잘못되면 일정이나 오늘 수치로 추측하지 않는다", () => {
    expect(dateKeyOf(null)).toBeNull();
    expect(dateKeyOf("모레")).toBeNull();
    const model = buildHomeDashboard(
      [intake(1, { createdAt: "방금", appointmentDate: "모레", confirmed: true })],
      NOW,
    );
    expect(model.todayIncomingCount).toBe(0);
    expect(model.upcoming).toEqual([]);
  });

  it("U5-08 비어 있는 목록은 가짜 KPI나 일정을 만들지 않는다", () => {
    expect(buildHomeDashboard([], NOW)).toEqual({
      todayIncomingCount: 0,
      needsReviewCount: 0,
      confirmedCount: 0,
      priority: [],
      needsReview: [],
      upcoming: [],
      recent: [],
    });
  });

  it("날짜 표시도 exact date만 사용한다", () => {
    expect(formatDashboardDate("2026-08-17", "2026-08-17")).toBe("오늘");
    expect(formatDashboardDate("2026-08-18", "2026-08-17")).toBe("8월 18일");
  });
});
