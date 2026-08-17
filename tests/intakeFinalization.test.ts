import { describe, expect, it } from "vitest";
import type { TeamAuditEntry } from "../lib/ai/teamPostRecord";
import type { SavedIntakeGate } from "../lib/ai/savedIntakeView";
import {
  intakeAuditTone,
  intakeFinalizationMode,
  loadedIntakeAuditState,
  type IntakeAuditState,
} from "../lib/ui/intakeFinalization";

function audit(
  id: number,
  action: string,
  targetId = "75",
  targetType = "intake",
): TeamAuditEntry {
  return {
    id,
    at: `2026-08-17 14:${id}`,
    actor: "김복지",
    role: "사회복지사",
    action,
    target_type: targetType,
    target_id: targetId,
    detail: `${action} 상세`,
  };
}

function gate(overrides: Partial<SavedIntakeGate> = {}): SavedIntakeGate {
  return {
    allowed: false,
    acknowledged: false,
    hardBlock: false,
    blockers: [
      {
        field: "time",
        label: "방문 시각",
        value: null,
        spoken: "3시",
        evidence: ["오전·오후가 모호함"],
        question: "말씀하신 3시, 오전인가요 오후인가요?",
        heard: [],
      },
    ],
    ...overrides,
  };
}

describe("U9 intake audit shell", () => {
  it("U9-01 loading 상태는 가짜 event 없이 표현할 수 있다", () => {
    const state: IntakeAuditState = { status: "loading" };
    expect(state).toEqual({ status: "loading" });
  });

  it("U9-02 대상 intake event가 없으면 empty다", () => {
    expect(loadedIntakeAuditState(75, [audit(1, "확정", "76")])).toEqual({
      status: "empty",
    });
  });

  it("U9-03 intake target만 최근 순으로 loaded 처리한다", () => {
    const state = loadedIntakeAuditState(75, [
      audit(1, "항목확인"),
      audit(3, "확정"),
      audit(4, "승인", "75", "post_record"),
      audit(5, "거절", "76"),
    ]);
    expect(state.status).toBe("loaded");
    if (state.status === "loaded") {
      expect(state.entries.map((entry) => entry.action)).toEqual([
        "확정",
        "항목확인",
      ]);
    }
  });

  it("U9-04 error 상태에도 event를 만들지 않는다", () => {
    const state: IntakeAuditState = {
      status: "error",
      message: "처리 이력을 불러오지 못했습니다.",
    };
    expect("entries" in state).toBe(false);
  });

  it("U9-05 미확인 확정만 warning tone이다", () => {
    expect(intakeAuditTone("항목확인")).toBe("normal");
    expect(intakeAuditTone("확정")).toBe("normal");
    expect(intakeAuditTone("승인")).toBe("normal");
    expect(intakeAuditTone("거절")).toBe("normal");
    expect(intakeAuditTone("미확인 확정")).toBe("warning");
  });
});

describe("U9 server finalization gate", () => {
  it("U9-06 gate가 없으면 local 상태로 확정 가능을 추측하지 않는다", () => {
    expect(intakeFinalizationMode(false, null)).toBe("gate-unavailable");
  });

  it("U9-07 gate.allowed=true만 일반 확정 구조로 분류한다", () => {
    expect(
      intakeFinalizationMode(false, gate({ allowed: true, blockers: [] })),
    ).toBe("regular");
  });

  it("U9-08 soft blocker는 미확인 확정과 일반 확정을 분리한다", () => {
    expect(intakeFinalizationMode(false, gate())).toBe("soft-block");
  });

  it("U9-09 hard_block은 별도 차단 상태다", () => {
    expect(intakeFinalizationMode(false, gate({ hardBlock: true }))).toBe(
      "hard-block",
    );
  });

  it("U9-10 서버 확정 상태가 gate보다 우선한다", () => {
    expect(intakeFinalizationMode(true, null)).toBe("confirmed");
  });

  it("U9-11 기관 정책이 켜져도 server가 허용하면 차단하지 않는다", () => {
    // Team gate.check(): 막을 항목이 없으면 allowed=true에 hard_block 설정값이 함께 실린다.
    expect(
      intakeFinalizationMode(
        false,
        gate({ allowed: true, hardBlock: true, blockers: [] }),
      ),
    ).toBe("regular");
  });
});
