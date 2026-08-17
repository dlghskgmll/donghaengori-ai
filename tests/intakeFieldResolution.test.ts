import { describe, expect, it } from "vitest";
import type { IntakeAnalysis } from "../lib/ai/schema";
import type { SavedIntakeSummary } from "../lib/ai/savedIntakeView";
import {
  buildDesignGroups,
  summarizeNeeds,
} from "../components/design/analysisFields";
import {
  getIntakeFieldDraft,
  initialIntakeFieldResolutionState,
  intakeFieldResolutionReducer,
  isHumanResolved,
  type IntakeFieldResolutionAction,
  type IntakeFieldResolutionState,
} from "../lib/ui/intakeFieldResolution";
import {
  initialRequestInboxState,
  requestInboxReducer,
  type PreviewRecord,
} from "../lib/ui/requestInbox";

const analysis: IntakeAnalysis = {
  schema_version: "1.0",
  request_type: { value: "HOSPITAL_COMPANION", confidence: 0.96 },
  caller: {
    person_candidates: [
      {
        person_id: "person-1",
        name: "김영자",
        confidence: 0.82,
        evidence: ["등록된 발신번호와 일치하는 후보"],
      },
    ],
    identity_status: "CANDIDATE",
  },
  appointment: {
    date: {
      value: "2026-08-19",
      status: "CONFIRMED_BY_INPUT",
      confidence: 0.99,
      evidence: ["현재 발화에서 모레라고 말함"],
    },
    time: {
      value: null,
      status: "NEEDS_CONFIRMATION",
      confidence: 0.4,
      evidence: ["오전쯤이라고 말함"],
    },
  },
  hospital: {
    candidates: [
      {
        name: "순천○○병원",
        status: "INFERRED",
        confidence: 0.84,
        evidence: ["최근 무릎 진료 이력"],
      },
      {
        name: "전남○○병원",
        status: "INFERRED",
        confidence: 0.62,
        evidence: ["2025년 정형외과 방문 이력"],
      },
    ],
  },
  department: {
    value: null,
    status: "NEEDS_CONFIRMATION",
    confidence: 0.3,
    evidence: [],
  },
  additional_requests: [],
  care_context: { mobility_notes: [] },
  confirmation_questions: [
    "몇 시쯤 방문하실 예정인가요?",
    "어느 진료과로 방문하시나요?",
    "동행 대상자 성함을 확인해 주세요.",
  ],
  safety: {
    signal_detected: false,
    signal_type: null,
    medical_judgement: false,
    human_escalation_required: false,
  },
  summary: "병원 동행 요청",
  human_review_required: true,
};

function summary(id: number): SavedIntakeSummary {
  return {
    id,
    target: `대상자 ${id}`,
    hospital: "순천○○병원",
    hospitalStatus: "INFERRED",
    channel: "전화",
    status: "접수 대기",
    createdAt: "2026-08-17 09:00",
    urgent: false,
    needsConfirmation: true,
  };
}

type ResolutionActionWithoutRequestId =
  IntakeFieldResolutionAction extends infer Action
    ? Action extends { requestId: string }
      ? Omit<Action, "requestId">
      : never
    : never;

function resolve(
  state: IntakeFieldResolutionState,
  action: ResolutionActionWithoutRequestId,
): IntakeFieldResolutionState {
  return intakeFieldResolutionReducer(state, {
    ...action,
    requestId: "preview-1",
  } as IntakeFieldResolutionAction);
}

describe("U2-A intake field resolution", () => {
  it("U2A-01 INFERRED 후보는 사람의 명시적 선택 뒤 accepted 상태가 된다", () => {
    const selected = resolve(initialIntakeFieldResolutionState, {
      type: "candidateSelected",
      fieldKey: "hospital",
      value: "전남○○병원",
    });
    const accepted = resolve(selected, {
      type: "accept",
      fieldKey: "hospital",
      value: "전남○○병원",
    });

    expect(getIntakeFieldDraft(accepted, "preview-1", "hospital").resolution).toEqual(
      { status: "accepted", value: "전남○○병원" },
    );
    // 사람 작업 상태를 만들 뿐 AI 원본의 첫 후보와 status는 바꾸지 않는다.
    expect(analysis.hospital.candidates[0]).toMatchObject({
      name: "순천○○병원",
      status: "INFERRED",
    });
  });

  it("U2A-02 INFERRED 값을 직접 수정하고 적용할 수 있다", () => {
    const editing = resolve(initialIntakeFieldResolutionState, {
      type: "beginEdit",
      fieldKey: "hospital",
      value: "순천○○병원",
    });
    const changed = resolve(editing, {
      type: "editChanged",
      fieldKey: "hospital",
      value: "순천중앙병원",
    });
    const applied = resolve(changed, {
      type: "applyEdit",
      fieldKey: "hospital",
    });

    expect(getIntakeFieldDraft(applied, "preview-1", "hospital")).toMatchObject({
      editValue: null,
      resolution: { status: "edited", value: "순천중앙병원" },
    });
  });

  it("U2A-03 NEEDS_CONFIRMATION 값을 직접 입력하고 실제 확인 질문을 연결한다", () => {
    const timeField = buildDesignGroups(analysis)
      .flatMap((group) => group.fields)
      .find((field) => field.key === "time");
    expect(timeField?.confirmationQuestion).toBe(
      "몇 시쯤 방문하실 예정인가요?",
    );

    const editing = resolve(initialIntakeFieldResolutionState, {
      type: "beginEdit",
      fieldKey: "time",
      value: "",
    });
    const changed = resolve(editing, {
      type: "editChanged",
      fieldKey: "time",
      value: "10:30",
    });
    const applied = resolve(changed, {
      type: "applyEdit",
      fieldKey: "time",
    });

    expect(getIntakeFieldDraft(applied, "preview-1", "time").resolution).toEqual(
      { status: "edited", value: "10:30" },
    );
  });

  it("U2A-04 필드 작업값을 바꿔도 원본 발화는 변경되지 않는다", () => {
    const preview: PreviewRecord = {
      kind: "preview",
      id: "preview-1",
      analysis,
      meta: null,
      transcript: "나 모레 저번에 무릎 봐준 데 가야겄어.",
      callerPhone: "010-1111-1111",
      receivedAt: new Date("2026-08-17T09:00:00+09:00"),
    };

    let state = resolve(initialIntakeFieldResolutionState, {
      type: "beginEdit",
      fieldKey: "hospital",
      value: "순천○○병원",
    });
    state = resolve(state, {
      type: "editChanged",
      fieldKey: "hospital",
      value: "순천중앙병원",
    });
    state = resolve(state, { type: "applyEdit", fieldKey: "hospital" });

    expect(preview.transcript).toBe("나 모레 저번에 무릎 봐준 데 가야겄어.");
    expect(preview.analysis).toBe(analysis);
    expect(getIntakeFieldDraft(state, preview.id, "hospital").resolution).toEqual(
      { status: "edited", value: "순천중앙병원" },
    );
  });

  it("U2A-05 한 필드를 해결해도 다른 확인 필요 필드는 남는다", () => {
    let state = resolve(initialIntakeFieldResolutionState, {
      type: "beginEdit",
      fieldKey: "time",
      value: "10:30",
    });
    state = resolve(state, { type: "applyEdit", fieldKey: "time" });
    const groups = buildDesignGroups(analysis);
    const needs = summarizeNeeds(groups, (field) =>
      isHumanResolved(getIntakeFieldDraft(state, "preview-1", field.key)),
    );

    expect(needs).not.toContain("예약 시간");
    expect(needs).toContain("진료과");
    expect(needs).toContain("대상자");
  });

  it("U2A-06 신규 saved polling 결과가 현재 selectedId를 바꾸지 않는다", () => {
    const before = {
      ...initialRequestInboxState,
      listLoading: false,
      saved: [summary(74)],
      selectedId: "saved-74",
    };
    const after = requestInboxReducer(before, {
      type: "poll",
      update: {
        type: "loaded",
        saved: [summary(76), summary(74)],
        newIds: [76],
      },
    });

    expect(after.selectedId).toBe("saved-74");
  });

  it("U2A-07 신규 saved polling 중에도 현재 field edit draft가 유지된다", () => {
    const editing = resolve(initialIntakeFieldResolutionState, {
      type: "beginEdit",
      fieldKey: "hospital",
      value: "입력 중인 병원",
    });
    requestInboxReducer(
      {
        ...initialRequestInboxState,
        listLoading: false,
        selectedId: "preview-1",
      },
      {
        type: "poll",
        update: { type: "loaded", saved: [summary(76)], newIds: [76] },
      },
    );

    expect(getIntakeFieldDraft(editing, "preview-1", "hospital").editValue).toBe(
      "입력 중인 병원",
    );
  });

  it("U2A-08 polling이 preview를 제거하거나 saved로 바꾸지 않는다", () => {
    const preview: PreviewRecord = {
      kind: "preview",
      id: "preview-1",
      analysis,
      meta: null,
      transcript: "병원에 가고 싶어요.",
      callerPhone: "",
      receivedAt: new Date("2026-08-17T09:00:00+09:00"),
    };
    const before = {
      ...initialRequestInboxState,
      listLoading: false,
      previews: [preview],
      selectedId: preview.id,
    };
    const after = requestInboxReducer(before, {
      type: "poll",
      update: { type: "loaded", saved: [summary(76)], newIds: [76] },
    });

    expect(after.previews).toBe(before.previews);
    expect(after.previews[0]).toMatchObject({ kind: "preview", id: "preview-1" });
    expect(after.saved.some((item) => `saved-${item.id}` === preview.id)).toBe(false);
  });

  it("U2A-09 실제 후보가 없는 필드에 프론트 후보를 만들지 않는다", () => {
    const withoutHospitalCandidates: IntakeAnalysis = {
      ...analysis,
      hospital: { candidates: [] },
    };
    const hospital = buildDesignGroups(withoutHospitalCandidates)
      .flatMap((group) => group.fields)
      .find((field) => field.key === "hospital");

    expect(hospital?.display).toBe("확인 필요");
    expect(hospital?.candidates).toEqual([]);
  });

  it("U2A-10 AI의 INFERRED 값은 사람 행동 없이 resolved가 되지 않는다", () => {
    const hospital = buildDesignGroups(analysis)
      .flatMap((group) => group.fields)
      .find((field) => field.key === "hospital");
    const draft = getIntakeFieldDraft(
      initialIntakeFieldResolutionState,
      "preview-1",
      "hospital",
    );

    expect(hospital?.status).toBe("INFERRED");
    expect(draft.resolution).toBeNull();
    expect(isHumanResolved(draft)).toBe(false);
  });
});
