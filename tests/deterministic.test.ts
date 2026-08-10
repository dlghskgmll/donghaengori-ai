import { describe, expect, it } from "vitest";
import { parseDeterministicFacts } from "../lib/ai/deterministic";
import { buildEvidenceCatalogue } from "../lib/ai/evidence";
import type { LlmIntakeAnalysis } from "../lib/ai/llmSchema";
import { assembleOpenAIAnalysis } from "../lib/ai/postprocess";
import type { IntakeProviderContext } from "../lib/ai/provider";

const REFERENCE_DATE = "2026-08-10";

function contextFor(transcript: string): IntakeProviderContext {
  return {
    receivedAt: "2026-08-10T08:00:00+09:00",
    input: {
      caller_phone: "",
      transcript,
      reference_date: REFERENCE_DATE,
    },
    people: [],
    deterministic: parseDeterministicFacts(transcript, REFERENCE_DATE),
  };
}

function llmWithSafety(
  safety: LlmIntakeAnalysis["safety"],
): LlmIntakeAnalysis {
  return {
    request_type: {
      value: "UNKNOWN",
      source: "UNKNOWN",
      evidence_refs: [],
    },
    hospital: {
      name: null,
      source: "UNKNOWN",
      matched_visit_id: null,
      evidence_refs: [],
    },
    department: {
      value: null,
      source: "UNKNOWN",
      evidence_refs: [],
    },
    additional_requests: [],
    proxy_request: {
      detected: false,
      relationship: null,
      evidence_refs: [],
    },
    confirmation_needs: [],
    confirmation_questions: [],
    safety,
    summary: "담당자 확인이 필요한 접수 후보입니다.",
  };
}

describe("deterministic intake preprocessing", () => {
  it("내일을 기준일 다음 날로 계산하고 직접 발화 근거를 보존한다", () => {
    const facts = parseDeterministicFacts(
      "내일 병원에 가야 해.",
      REFERENCE_DATE,
    );

    expect(facts.explicitDate).toMatchObject({
      value: "2026-08-11",
      sourceText: "내일",
      evidenceRef: "date-parser:explicit-relative-date",
      selfCorrected: false,
      uncertain: false,
    });
  });

  it("날짜 자기 수정에서는 마지막 모레를 최종 의도로 사용한다", () => {
    const facts = parseDeterministicFacts(
      "내일 아니고 모레 가야 해.",
      REFERENCE_DATE,
    );

    expect(facts.explicitDate).toMatchObject({
      value: "2026-08-12",
      sourceText: "모레",
      selfCorrected: true,
      uncertain: false,
    });
  });

  it("CASE 9의 월요일·화요일 불확실 표현은 날짜를 임의 확정하지 않는다", () => {
    const facts = parseDeterministicFacts(
      "아이고 그때 딸이랑 갔던 데 있잖아. 무릎 때문에 갔던 데를 다음 주쯤 또 가야 한다는데 월요일인지 화요일인지는 잘 모르겠어.",
      REFERENCE_DATE,
    );

    expect(facts.explicitDate).toEqual({
      value: null,
      sourceText: null,
      evidenceRef: null,
      selfCorrected: false,
      uncertain: true,
    });
  });

  it("실제 선택지로 충돌하는 다음 주 요일은 날짜를 확정하지 않는다", () => {
    const facts = parseDeterministicFacts(
      "다음 주 월요일인지 화요일인지는 잘 모르겠어.",
      REFERENCE_DATE,
    );

    expect(facts.explicitDate).toEqual({
      value: null,
      sourceText: null,
      evidenceRef: null,
      selfCorrected: false,
      uncertain: true,
    });
  });

  it("직접 말한 월일은 별도의 요일 불확실 표현 때문에 무효화하지 않는다", () => {
    const facts = parseDeterministicFacts(
      "8월 20일인데 월요일인지는 잘 모르겠어.",
      REFERENCE_DATE,
    );

    expect(facts.explicitDate).toMatchObject({
      value: "2026-08-20",
      sourceText: "8월 20일",
      uncertain: false,
    });
  });

  it("한국어 수사로 말한 오후 세 시를 15:00으로 변환한다", () => {
    const facts = parseDeterministicFacts(
      "8월 20일 오후 세 시에 가려고요.",
      REFERENCE_DATE,
    );

    expect(facts.explicitTime).toMatchObject({
      value: "15:00",
      sourceText: "오후 세 시",
      evidenceRef: "time-parser:explicit-time",
      selfCorrected: false,
    });
  });

  it("CASE 25: '열 시 아니 열한 시'는 마지막 시간 발화를 최종 의도로 사용한다", () => {
    const facts = parseDeterministicFacts(
      "내일 아니고 모레요. 열 시, 아니 열한 시에 가려고.",
      REFERENCE_DATE,
    );

    expect(facts.explicitTime).toMatchObject({
      value: "11:00",
      sourceText: "열한 시",
      selfCorrected: true,
    });
    expect(facts.explicitDate).toMatchObject({
      value: "2026-08-12",
      selfCorrected: true,
    });
  });

  it("CASE 25-보강: 같은 시간을 반복 말한 경우는 자기수정으로 표시하지 않는다", () => {
    const facts = parseDeterministicFacts(
      "오전 10시에 갈게요. 네, 10시요.",
      REFERENCE_DATE,
    );

    expect(facts.explicitTime).toMatchObject({
      value: "10:00",
      selfCorrected: false,
      uncertain: false,
    });
  });

  it("CASE 26: '열 시 아니고 열한 시요'는 정정된 11:00을 사용한다", () => {
    const facts = parseDeterministicFacts("열 시 아니고 열한 시요", REFERENCE_DATE);

    expect(facts.explicitTime).toMatchObject({
      value: "11:00",
      sourceText: "열한 시",
      selfCorrected: true,
      uncertain: false,
    });
  });

  it("CASE 27: '열 시 말고 열한 시'는 정정된 11:00을 사용한다", () => {
    const facts = parseDeterministicFacts("열 시 말고 열한 시", REFERENCE_DATE);

    expect(facts.explicitTime).toMatchObject({
      value: "11:00",
      selfCorrected: true,
    });
  });

  it("CASE 27-보강: '열 시가 아니라 열한 시'도 정정으로 처리한다", () => {
    const facts = parseDeterministicFacts(
      "열 시가 아니라 열한 시에 가려고요.",
      REFERENCE_DATE,
    );

    expect(facts.explicitTime).toMatchObject({
      value: "11:00",
      selfCorrected: true,
    });
  });

  it("CASE 28: 선택지 '열 시나 열한 시 중에'는 시간을 확정하지 않는다", () => {
    const facts = parseDeterministicFacts(
      "열 시나 열한 시 중에 가능해요",
      REFERENCE_DATE,
    );

    expect(facts.explicitTime).toMatchObject({
      value: null,
      selfCorrected: false,
      uncertain: true,
    });
  });

  it("CASE 29: 범위 '열 시부터 열한 시 사이'는 시간을 확정하지 않는다", () => {
    const facts = parseDeterministicFacts(
      "열 시부터 열한 시 사이에 가려고요",
      REFERENCE_DATE,
    );

    expect(facts.explicitTime).toMatchObject({
      value: null,
      uncertain: true,
    });
  });

  it("CASE 30: 부정된 시간 '열 시는 아니에요'는 확정하지 않는다", () => {
    const facts = parseDeterministicFacts("열 시는 아니에요", REFERENCE_DATE);

    expect(facts.explicitTime).toMatchObject({
      value: null,
      uncertain: true,
    });
  });

  it("CASE 31: 날짜와 시간을 함께 정정하면 둘 다 마지막 발화를 사용한다", () => {
    const facts = parseDeterministicFacts(
      "내일 열 시에 가려고요. 아니, 모레 열한 시로 할게요",
      "2026-08-11",
    );

    expect(facts.explicitDate).toMatchObject({
      value: "2026-08-13",
      selfCorrected: true,
    });
    expect(facts.explicitTime).toMatchObject({
      value: "11:00",
      selfCorrected: true,
    });
  });

  it("CASE 32: 단일 시간 발화 '내일 오전 열 시'는 그대로 10:00이다", () => {
    const facts = parseDeterministicFacts(
      "내일 오전 열 시에 병원에 가려고요",
      REFERENCE_DATE,
    );

    expect(facts.explicitTime).toMatchObject({
      value: "10:00",
      selfCorrected: false,
      uncertain: false,
    });
  });

  it("CASE 33: 정정 표현 없는 복수 시간(진료 10시·출발 9시)은 확정하지 않는다", () => {
    const facts = parseDeterministicFacts(
      "10시에 진료 보고 9시에 출발해요",
      REFERENCE_DATE,
    );

    expect(facts.explicitTime).toMatchObject({
      value: null,
      selfCorrected: false,
      uncertain: true,
    });
  });

  it("CASE 34: 출발·진료 시간 병렬 발화도 schema상 구분 불가하므로 확정하지 않는다", () => {
    // 현재 schema에는 appointment.time 하나뿐이라 출발/진료 시간을 구분할 수 없다.
    // 임의로 하나를 고르지 않고 담당자 확인으로 넘기는 것이 안전하다.
    const facts = parseDeterministicFacts(
      "9시에 출발해서 10시에 진료 봐요",
      REFERENCE_DATE,
    );

    expect(facts.explicitTime).toMatchObject({
      value: null,
      uncertain: true,
    });
  });

  it("CASE 15에서 하나 이상의 결정론적 위험 신호를 감지한다", () => {
    const facts = parseDeterministicFacts(
      "숨이 너무 차고 가슴도 아파.",
      REFERENCE_DATE,
    );

    expect(facts.safetySignals).toContain("BREATHING_DIFFICULTY");
    expect(facts.safetySignals.length).toBeGreaterThan(0);
  });

  it("흉부 통증 표현도 독립적인 결정론적 위험 신호로 감지한다", () => {
    const facts = parseDeterministicFacts(
      "가슴이 아프고 답답해.",
      REFERENCE_DATE,
    );

    expect(facts.safetySignals).toContain("CHEST_PAIN");
  });

  it.each([
    {
      label: "결정론 전처리에서만 신호가 검출된 경우",
      transcript: "숨이 너무 차요.",
      llmSafety: {
        signal_detected: false,
        signal_type: "NONE" as const,
        human_escalation_required: false,
      },
    },
    {
      label: "LLM에서만 신호가 검출된 경우",
      transcript: "담당자가 현재 상태를 확인해 주세요.",
      llmSafety: {
        signal_detected: true,
        signal_type: "OTHER" as const,
        human_escalation_required: true,
      },
    },
  ])("$label에도 최종 safety는 OR로 유지한다", ({ transcript, llmSafety }) => {
    const context = contextFor(transcript);
    const result = assembleOpenAIAnalysis(
      context,
      llmWithSafety(llmSafety),
      buildEvidenceCatalogue(context),
    );

    expect(result.analysis.safety).toMatchObject({
      signal_detected: true,
      medical_judgement: false,
      human_escalation_required: true,
    });
  });

  it("복수 대상자 후보에서는 소유자가 불명확한 이동 정보를 노출하지 않는다", () => {
    const context: IntakeProviderContext = {
      ...contextFor("내일 병원에 가야 해."),
      people: [
        {
          person: {
            person_id: "P001",
            name: "박순자",
            phone: "010-0000-0001",
            birth_year: 1947,
            address: "전남 순천시",
          },
          careProfile: {
            person_id: "P001",
            mobility_notes: ["지팡이 사용"],
            preferences: [],
            contact_notes: [],
          },
          visits: [],
          matchedByPhone: true,
          matchedByName: false,
        },
        {
          person: {
            person_id: "P002",
            name: "최복례",
            phone: "010-0000-0002",
            birth_year: 1950,
            address: "전남 보성군",
          },
          careProfile: {
            person_id: "P002",
            mobility_notes: ["휠체어 사용"],
            preferences: [],
            contact_notes: [],
          },
          visits: [],
          matchedByPhone: false,
          matchedByName: true,
        },
      ],
    };

    const result = assembleOpenAIAnalysis(
      context,
      llmWithSafety({
        signal_detected: false,
        signal_type: "NONE",
        human_escalation_required: false,
      }),
      buildEvidenceCatalogue(context),
    );

    expect(result.analysis.care_context.mobility_notes).toEqual([]);
  });

  it("LLM이 위험 유형을 NONE으로 모순되게 반환해도 빈 유형을 만들지 않는다", () => {
    const context = contextFor("담당자가 현재 상태를 확인해 주세요.");
    const result = assembleOpenAIAnalysis(
      context,
      llmWithSafety({
        signal_detected: true,
        signal_type: "NONE",
        human_escalation_required: true,
      }),
      buildEvidenceCatalogue(context),
    );

    expect(result.analysis.safety).toMatchObject({
      signal_detected: true,
      signal_type: "기타 위험 표현",
      medical_judgement: false,
      human_escalation_required: true,
    });
  });
});
