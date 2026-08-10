import { describe, expect, it, vi } from "vitest";
import { parseDeterministicFacts } from "../lib/ai/deterministic";
import type { LlmIntakeAnalysis } from "../lib/ai/llmSchema";
import {
  OpenAIIntakeAnalysisProvider,
  type OpenAIParseResponseLike,
  type ParseOpenAIIntakeResponse,
} from "../lib/ai/openaiProvider";
import type { IntakeProviderContext } from "../lib/ai/provider";

const REFERENCE_DATE = "2026-08-10";
const TRANSCRIPT =
  "박순자인데 내일 오전 10시에 순천가상정형외과 정형외과에 가려고요.";

function createContext(): IntakeProviderContext {
  return {
    receivedAt: "2026-08-10T08:00:00+09:00",
    input: {
      caller_phone: "010-1111-1111",
      transcript: TRANSCRIPT,
      reference_date: REFERENCE_DATE,
    },
    people: [
      {
        person: {
          person_id: "P001",
          name: "박순자",
          phone: "010-1111-1111",
          birth_year: 1947,
          address: "전남 순천시 별량면 가상로 123",
        },
        careProfile: {
          person_id: "P001",
          mobility_notes: ["지팡이 사용"],
          preferences: ["오전 진료 선호"],
          contact_notes: ["보호자 전화 010-9999-9999"],
        },
        visits: [
          {
            visit_id: "V001",
            person_id: "P001",
            visited_at: "2026-07-21",
            hospital_name: "순천가상정형외과",
            department: "정형외과",
            reason: "무릎 통증",
          },
        ],
        matchedByPhone: true,
        matchedByName: true,
      },
    ],
    deterministic: parseDeterministicFacts(TRANSCRIPT, REFERENCE_DATE),
  };
}

function createValidLlmAnalysis(): LlmIntakeAnalysis {
  return {
    request_type: {
      value: "HOSPITAL_COMPANION",
      source: "DIRECT_INPUT",
      evidence_refs: ["transcript:original"],
    },
    hospital: {
      name: "순천가상정형외과",
      source: "DIRECT_INPUT",
      matched_visit_id: null,
      evidence_refs: ["transcript:original"],
    },
    department: {
      value: "정형외과",
      source: "DIRECT_INPUT",
      evidence_refs: ["transcript:original"],
    },
    additional_requests: [],
    proxy_request: {
      detected: false,
      relationship: null,
      evidence_refs: [],
    },
    confirmation_needs: [],
    confirmation_questions: [],
    safety: {
      signal_detected: false,
      signal_type: "NONE",
      human_escalation_required: false,
    },
    summary: "내일 순천가상정형외과 동행 요청 후보입니다.",
  };
}

function completedResponse(
  outputParsed: unknown = createValidLlmAnalysis(),
): OpenAIParseResponseLike {
  return {
    status: "completed",
    output_parsed: outputParsed,
    output: [],
    incomplete_details: null,
    error: null,
  };
}

function createProvider(
  parseResponse: ParseOpenAIIntakeResponse,
  apiKey: string | null = "test-api-key",
) {
  return new OpenAIIntakeAnalysisProvider({
    apiKey,
    model: "gpt-5-mini",
    timeoutMs: 1_500,
    maxRetries: 1,
    parseResponse,
  });
}

async function expectProviderError(
  provider: OpenAIIntakeAnalysisProvider,
  code: string,
) {
  await expect(provider.analyze(createContext())).rejects.toMatchObject({ code });
}

describe("OpenAIIntakeAnalysisProvider", () => {
  it("structured output을 한 번만 호출하고 비식별화된 요청을 최종 결과로 조립한다", async () => {
    const parseResponse = vi.fn<ParseOpenAIIntakeResponse>(async () =>
      completedResponse(),
    );
    const provider = createProvider(parseResponse);

    const result = await provider.analyze(createContext());

    expect(parseResponse).toHaveBeenCalledTimes(1);
    const [request, options] = parseResponse.mock.calls[0];
    expect(request).toMatchObject({
      model: "gpt-5-mini",
      store: false,
      background: false,
      stream: false,
      tools: [],
      parallel_tool_calls: false,
      text: {
        format: {
          type: "json_schema",
          name: "donghaeng_intake_semantics",
          strict: true,
        },
      },
    });
    expect(options).toMatchObject({ timeout: 1_500, maxRetries: 1 });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(request.instructions).toContain(
      "COMBINED는 transcript:original과 해당 visit ID를 모두 포함한다",
    );

    const minimizedInput = JSON.parse(request.input as string) as Record<
      string,
      unknown
    >;
    const serializedInput = JSON.stringify(minimizedInput);
    expect(minimizedInput).toMatchObject({
      reference_time: "2026-08-10T08:00:00+09:00",
      reference_date: "2026-08-10",
      person_candidates: [
        {
          person_id: "P001",
          display_name: "박순자",
          region: "전남 순천시",
          match_reason: "등록 발신번호와 원문 이름 언급이 모두 일치",
        },
      ],
    });
    expect(serializedInput).not.toContain("010-1111-1111");
    expect(serializedInput).not.toContain("010-9999-9999");
    expect(serializedInput).not.toContain("별량면 가상로 123");
    expect(serializedInput).not.toContain("1947");
    expect(serializedInput).not.toContain("caller_phone");
    expect(serializedInput).not.toContain("contact_notes");
    expect(serializedInput).not.toContain("birth_year");

    expect(result.analysis.hospital.candidates[0]).toMatchObject({
      name: "순천가상정형외과",
      status: "CONFIRMED_BY_INPUT",
    });
    expect(result.analysis.appointment.date).toMatchObject({
      value: "2026-08-11",
      status: "CONFIRMED_BY_INPUT",
    });
    expect(result.analysis.safety.medical_judgement).toBe(false);
    expect(result.analysis.human_review_required).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("원문 안의 민감정보 형태도 OpenAI 입력 전에 마스킹한다", async () => {
    const context = createContext();
    const fakeSecret = ["sk", "proj", "secretvalue12345"].join("-");
    context.input.transcript = `${TRANSCRIPT} 연락처 010-7777-8888, 주소 전남 순천시 별량면 가상로 123, test@example.com, ${fakeSecret}`;
    const parseResponse = vi.fn<ParseOpenAIIntakeResponse>(async () =>
      completedResponse(),
    );
    const provider = createProvider(parseResponse);

    await provider.analyze(context);

    const request = parseResponse.mock.calls[0]?.[0];
    const serializedInput = String(request?.input);
    expect(serializedInput).not.toContain("010-7777-8888");
    expect(serializedInput).not.toContain("별량면 가상로 123");
    expect(serializedInput).not.toContain("test@example.com");
    expect(serializedInput).not.toContain(fakeSecret);
    expect(serializedInput).toContain("[전화번호 제거]");
    expect(serializedInput).toContain("전남 순천시");
  });

  it("중간 structured output 스키마가 틀리면 검증 오류로 분류한다", async () => {
    const invalid = {
      ...createValidLlmAnalysis(),
      request_type: {
        value: "DIAGNOSIS",
        source: "DIRECT_INPUT",
        evidence_refs: ["transcript:original"],
      },
    };
    const provider = createProvider(async () => completedResponse(invalid));

    await expectProviderError(provider, "OPENAI_SCHEMA_VALIDATION");
  });

  it("structured output JSON이 손상되면 malformed 오류로 분류한다", async () => {
    const provider = createProvider(async () => {
      throw new SyntaxError("invalid JSON");
    });

    await expectProviderError(provider, "OPENAI_MALFORMED_OUTPUT");
  });

  it("AbortError를 timeout 오류로 분류한다", async () => {
    const abortError = new Error("request aborted");
    abortError.name = "AbortError";
    const provider = createProvider(async () => {
      throw abortError;
    });

    await expectProviderError(provider, "OPENAI_TIMEOUT");
  });

  it("provider 자체 watchdog이 멈춘 요청을 중단하고 timeout으로 분류한다", async () => {
    vi.useFakeTimers();
    try {
      const parseResponse = vi.fn<ParseOpenAIIntakeResponse>(
        () => new Promise<OpenAIParseResponseLike>(() => undefined),
      );
      const provider = new OpenAIIntakeAnalysisProvider({
        apiKey: "test-api-key",
        model: "gpt-5-mini",
        timeoutMs: 10,
        maxRetries: 0,
        parseResponse,
      });
      const rejection = expect(provider.analyze(createContext())).rejects.toMatchObject({
        code: "OPENAI_TIMEOUT",
      });

      await vi.advanceTimersByTimeAsync(2_011);
      await rejection;

      const options = parseResponse.mock.calls[0]?.[1];
      expect(options?.signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("모델 refusal을 별도 오류로 분류한다", async () => {
    const provider = createProvider(async () => ({
      ...completedResponse(null),
      output: [
        {
          type: "message",
          content: [{ type: "refusal", refusal: "요청을 처리할 수 없습니다." }],
        },
      ],
    }));

    await expectProviderError(provider, "OPENAI_REFUSAL");
  });

  it("incomplete 응답을 별도 오류로 분류한다", async () => {
    const provider = createProvider(async () => ({
      status: "incomplete",
      output_parsed: null,
      output: [],
      incomplete_details: { reason: "max_output_tokens" },
      error: null,
    }));

    await expectProviderError(provider, "OPENAI_INCOMPLETE");
  });

  it("HTTP 429를 rate limit 오류로 분류한다", async () => {
    const provider = createProvider(async () => {
      throw { status: 429 };
    });

    await expectProviderError(provider, "OPENAI_RATE_LIMIT");
  });

  it("HTTP 401을 auth 오류로 분류한다", async () => {
    const provider = createProvider(async () => {
      throw { status: 401 };
    });

    await expectProviderError(provider, "OPENAI_AUTH");
  });

  it("SDK connection 오류를 network 오류로 분류한다", async () => {
    const connectionError = new Error("connection failed");
    connectionError.name = "APIConnectionError";
    const provider = createProvider(async () => {
      throw connectionError;
    });

    await expectProviderError(provider, "OPENAI_NETWORK");
  });

  it("허용 목록에 없는 evidence ref 하나를 제거하고 warning을 남긴다", async () => {
    const llm = createValidLlmAnalysis();
    llm.hospital.evidence_refs.push("visit:FORGED");
    const provider = createProvider(async () => completedResponse(llm));

    const result = await provider.analyze(createContext());

    expect(result.warnings).toContain("EVIDENCE_REF_REMOVED");
    expect(result.analysis.hospital.candidates[0]?.confidence).toBe(0.6);
    expect(
      result.analysis.hospital.candidates[0]?.evidence.join(" "),
    ).not.toContain("FORGED");
  });

  it("모델 입력과 evidence whitelist를 동일한 최근 방문 10건으로 제한한다", async () => {
    const context = createContext();
    context.people[0].visits = Array.from({ length: 11 }, (_, index) => ({
      visit_id: `V${String(index + 1).padStart(3, "0")}`,
      person_id: "P001",
      visited_at: `2026-07-${String(index + 1).padStart(2, "0")}`,
      hospital_name: "순천가상정형외과",
      department: "정형외과",
      reason: "무릎 통증",
    }));
    const parseResponse = vi.fn<ParseOpenAIIntakeResponse>(async () =>
      completedResponse(),
    );
    const provider = createProvider(parseResponse);

    await provider.analyze(context);

    const request = parseResponse.mock.calls[0]?.[0];
    const minimizedInput = JSON.parse(request?.input ?? "{}") as {
      recent_visits?: Array<{ visit_id: string }>;
      allowed_evidence_refs?: string[];
    };
    expect(minimizedInput.recent_visits).toHaveLength(10);
    expect(minimizedInput.recent_visits?.map((visit) => visit.visit_id)).not.toContain(
      "V001",
    );
    expect(minimizedInput.allowed_evidence_refs).not.toContain("visit:V001");
    expect(minimizedInput.allowed_evidence_refs).toContain("visit:V011");
  });

  it("모델에 보내지 않은 오래된 matched_visit_id는 근거 위반으로 거절한다", async () => {
    const context = createContext();
    context.people[0].visits = Array.from({ length: 11 }, (_, index) => ({
      visit_id: `V${String(index + 1).padStart(3, "0")}`,
      person_id: "P001",
      visited_at: `2026-07-${String(index + 1).padStart(2, "0")}`,
      hospital_name: "순천가상정형외과",
      department: "정형외과",
      reason: "무릎 통증",
    }));
    const llm = createValidLlmAnalysis();
    llm.hospital = {
      name: "순천가상정형외과",
      source: "CARE_HISTORY",
      matched_visit_id: "V001",
      evidence_refs: ["visit:V001"],
    };
    const provider = createProvider(async () => completedResponse(llm));

    await expect(provider.analyze(context)).rejects.toMatchObject({
      code: "EVIDENCE_REF_VIOLATION",
    });
  });

  it("허용되지 않은 evidence ref가 반복되면 심각한 위반으로 거절한다", async () => {
    const llm = createValidLlmAnalysis();
    llm.request_type.evidence_refs.push(
      "visit:FORGED-1",
      "visit:FORGED-2",
      "visit:FORGED-3",
    );
    const provider = createProvider(async () => completedResponse(llm));

    await expectProviderError(provider, "EVIDENCE_REF_VIOLATION");
  });

  it("API key가 없으면 parse를 호출하지 않고 설정 오류를 반환한다", async () => {
    const parseResponse = vi.fn<ParseOpenAIIntakeResponse>(async () =>
      completedResponse(),
    );
    const provider = createProvider(parseResponse, null);

    await expectProviderError(provider, "OPENAI_API_KEY_MISSING");
    expect(parseResponse).not.toHaveBeenCalled();
  });
});
