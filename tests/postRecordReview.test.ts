import { describe, expect, it } from "vitest";
import type {
  TeamAuditEntry,
  TeamPostRecord,
} from "../lib/ai/teamPostRecord";
import {
  decisionFeedback,
  isRelativeSchedule,
  postRecordAudit,
  postRecordReviewState,
} from "../lib/ui/postRecordReview";

function record(overrides: Partial<TeamPostRecord> = {}): TeamPostRecord {
  return {
    id: 7,
    intake_id: 74,
    phone: "01012345678",
    created_at: "2026-08-17 14:20",
    memo_raw: "다음 진료는 2주 뒤입니다.",
    treatment: "무릎 진료 (매니저 진술 기준)",
    next_visit: "약 2주 뒤",
    pharmacy: "완료",
    cautions: null,
    guardian_msg: "오늘 동행 잘 마쳤습니다.",
    profile_update: "계단 이동 곤란",
    approved: false,
    ...overrides,
  };
}

function audit(
  id: number,
  action: "승인" | "거절",
  targetId = "7",
): TeamAuditEntry {
  return {
    id,
    at: "2026-08-17 14:30",
    actor: "김복지 사회복지사",
    role: "사회복지사",
    action,
    target_type: "post_record",
    target_id: targetId,
    detail: "계단 이동 곤란",
  };
}

describe("U8 post record review model", () => {
  it("U8-01 audit가 없으면 approved=0을 검토 대기로 단정하지 않는다", () => {
    expect(postRecordReviewState(record(), [], false)).toBe("unknown");
  });

  it("U8-02 audit 확인 후 처리 이력이 없는 초안만 pending이다", () => {
    expect(postRecordReviewState(record(), [], true)).toBe("pending");
  });

  it("U8-03 approved=1은 승인 완료로 표시한다", () => {
    expect(postRecordReviewState(record({ approved: true }), [], false)).toBe(
      "approved",
    );
  });

  it("U8-04 거절 audit가 있는 approved=0 기록을 거절됨으로 구분한다", () => {
    expect(postRecordReviewState(record(), [audit(12, "거절")], true)).toBe(
      "rejected",
    );
  });

  it("U8-05 해당 post_record의 승인·거절 audit만 최근 순으로 읽는다", () => {
    expect(
      postRecordAudit(7, [
        audit(10, "승인"),
        audit(12, "거절"),
        audit(13, "승인", "8"),
        { ...audit(14, "승인"), target_type: "intake" },
      ]).map((entry) => entry.id),
    ).toEqual([12, 10]);
  });

  it("U8-06 상대 날짜를 실제 날짜로 계산하지 않고 재확인 대상으로 둔다", () => {
    expect(isRelativeSchedule("약 2주 뒤")).toBe(true);
    expect(isRelativeSchedule("2026-09-01")).toBe(false);
  });

  it("U8-07 applied=true만 Care Profile 실제 반영으로 표현한다", () => {
    expect(
      decisionFeedback({
        ok: true,
        approved: true,
        changed: true,
        applied: true,
      }),
    ).toContain("실제 반영");
  });

  it("U8-08 changed=false 승인 재요청은 오류가 아니다", () => {
    expect(
      decisionFeedback({
        ok: true,
        approved: true,
        changed: false,
        applied: false,
        reason: "이미 같은 상태",
      }),
    ).toBe(
      "이미 승인된 상태입니다. 이번 요청에서 Care Profile 추가 반영은 없었습니다.",
    );
  });

  it("U8-09 승인됐지만 applied=false이면 반영 항목 없음으로 구분한다", () => {
    expect(
      decisionFeedback({
        ok: true,
        approved: true,
        changed: true,
        applied: false,
      }),
    ).toContain("반영할 제안 항목은 없었습니다");
  });
});
