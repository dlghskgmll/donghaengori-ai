// CASE 7 — "추가 확인 필요"는 고정 진행 단계가 아니다.

import { describe, expect, it } from "vitest";
import {
  PROGRESS_STEPS,
  progressIndexFor,
  statusBadgeLabel,
} from "@/lib/guardian/domain/application";

describe("진행 상태 모델", () => {
  it("기본 진행 경로는 4단계이고 '추가 확인 필요'가 없다", () => {
    expect(PROGRESS_STEPS.map((step) => step.label)).toEqual([
      "접수 완료",
      "담당자 확인",
      "일정 확정",
      "동행 완료",
    ]);
    expect(PROGRESS_STEPS.some((step) => step.label.includes("추가 확인"))).toBe(false);
  });

  it("NEEDS_INFO는 자체 단계 없이 담당자 확인 위치에 머문다", () => {
    expect(progressIndexFor("NEEDS_INFO")).toBe(progressIndexFor("REVIEWING"));
  });

  it("상태 배지 문구", () => {
    expect(statusBadgeLabel("REVIEWING")).toBe("담당자 확인 중");
    expect(statusBadgeLabel("NEEDS_INFO")).toBe("추가 확인 필요");
  });
});
