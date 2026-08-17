import { describe, expect, it } from "vitest";
import { parseDeterministicFacts } from "../lib/ai/deterministic";
import { IntakeAnalysisSchema } from "../lib/ai/schema";
import {
  toSavedIntakeSummary,
} from "../lib/ai/savedIntakeView";
import {
  normalizeTeamResponse,
  type TeamIntakeResponse,
} from "../lib/ai/teamProvider";
import { normalizeSavedHospitalStatus } from "../lib/ai/teamIntakeRead";
import type { IntakeProviderContext } from "../lib/ai/provider";
import { getUrgentPresentation } from "../lib/ui/urgentIntake";

const REFERENCE_DATE = "2026-08-17";
const URGENT_UTTERANCE = "숨쉬기가 너무 힘들어요.";

function context(): IntakeProviderContext {
  return {
    receivedAt: `${REFERENCE_DATE}T09:00:00.000Z`,
    input: {
      caller_phone: "010-1111-1111",
      transcript: URGENT_UTTERANCE,
      reference_date: REFERENCE_DATE,
    },
    people: [],
    deterministic: parseDeterministicFacts(URGENT_UTTERANCE, REFERENCE_DATE),
  };
}

function normalizeUrgent(urgentConfident: boolean) {
  const response: TeamIntakeResponse = {
    urgent: true,
    urgent_confident: urgentConfident,
    urgent_message: null,
    intent: "긴급",
    intent_confidence: 0.92,
    card: null,
    policy: {
      medical_judgement: false,
      human_review_required: true,
    },
  };
  return normalizeTeamResponse(response, context());
}

describe("U3 urgent confidence UX", () => {
  it("U3-01 confident urgent는 긴급 의미와 danger tone을 유지한다", () => {
    const result = normalizeUrgent(true);
    const presentation = getUrgentPresentation(
      result.analysis.safety.signal_detected,
      result.analysis.safety.urgent_confident,
    );

    expect(result.analysis.safety.urgent_confident).toBe(true);
    expect(result.warnings).toContain("TEAM_URGENT_CONFIDENT");
    expect(presentation).toMatchObject({ label: "긴급", tone: "danger" });
  });

  it("U3-02 low-confidence urgent는 확인 필요와 warning tone으로 내린다", () => {
    const result = normalizeUrgent(false);
    const presentation = getUrgentPresentation(
      result.analysis.safety.signal_detected,
      result.analysis.safety.urgent_confident,
    );

    expect(result.analysis.safety.urgent_confident).toBe(false);
    expect(result.warnings).toContain("TEAM_URGENT_NEEDS_REVIEW");
    expect(presentation).toMatchObject({ label: "확인 필요", tone: "warn" });
  });

  it("U3-03 두 urgent 상태의 visual·semantic 표현이 같지 않다", () => {
    const confident = getUrgentPresentation(true, true);
    const needsReview = getUrgentPresentation(true, false);

    expect(confident?.tone).not.toBe(needsReview?.tone);
    expect(confident?.label).not.toBe(needsReview?.label);
    expect(confident?.title).not.toBe(needsReview?.title);
  });

  it("U3-04 card=null urgent를 카드 값 없이 안전하게 정규화한다", () => {
    const result = normalizeUrgent(true);

    expect(result.analysis.hospital.candidates).toEqual([]);
    expect(result.analysis.appointment.date.value).toBeNull();
    expect(result.analysis.safety.human_escalation_required).toBe(true);
  });

  it("U3-05 normal intake에는 urgent presentation을 만들지 않는다", () => {
    expect(getUrgentPresentation(false, true)).toBeNull();
    expect(getUrgentPresentation(false, false)).toBeNull();
  });

  it("U3-06 preview는 confidence를 보존하고 saved는 없는 값을 추측하지 않는다", () => {
    const preview = IntakeAnalysisSchema.parse(normalizeUrgent(false).analysis);
    const savedWithValue = toSavedIntakeSummary({
      id: 81,
      status: "긴급",
      intent: "긴급",
      urgent_confident: true,
    } as never);
    const savedWithoutValue = toSavedIntakeSummary({
      id: 82,
      status: "긴급",
      intent: "긴급",
    } as never);

    expect(preview.safety.urgent_confident).toBe(false);
    expect(savedWithValue.urgentConfidence).toBe(true);
    expect(savedWithoutValue.urgentConfidence).toBeNull();
  });

  it("U3-07 urgent 변경 후에도 history-only 병원을 확정으로 올리지 않는다", () => {
    expect(
      normalizeSavedHospitalStatus({
        hospital: "순천가상정형외과",
        teamStatus: "확인됨",
        evidence: ["최근 동행 이력 기반 후보"],
        utterance: "저번에 무릎 봐준 데 가야겄어.",
      }),
    ).toEqual({ status: "INFERRED", downgraded: true });
  });

  it("U3-08 의료 진단을 주장하는 문구를 만들지 않는다", () => {
    const copies = [
      getUrgentPresentation(true, true),
      getUrgentPresentation(true, false),
      getUrgentPresentation(true, null),
    ]
      .flatMap((item) =>
        item ? [item.title, item.description, ...item.guidance] : [],
      )
      .join(" ");

    expect(copies).not.toContain("AI가 응급을 진단했습니다");
    expect(normalizeUrgent(true).analysis.safety.medical_judgement).toBe(false);
  });
});
