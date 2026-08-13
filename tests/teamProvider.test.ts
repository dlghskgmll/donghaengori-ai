import { describe, expect, it } from "vitest";
import { analyzeIntakeRequest } from "../lib/ai/analyzeIntake";
import { parseDeterministicFacts } from "../lib/ai/deterministic";
import {
  MockIntakeAnalysisProvider,
  resolveIntakeProviderRoute,
  type IntakeProviderContext,
} from "../lib/ai/provider";
import { IntakeAnalysisSchema } from "../lib/ai/schema";
import { transcribeAudioFile } from "../lib/ai/transcribe";
import {
  TEAM_INTAKE_CHANNEL,
  TeamIntakeAnalysisProvider,
  normalizeTeamHospital,
} from "../lib/ai/teamProvider";
import type { IntakeAIConfig } from "../lib/ai/config";

const REFERENCE_DATE = "2026-08-14";

function contextFor(
  transcript: string,
  callerPhone = "010-1111-1111",
): IntakeProviderContext {
  return {
    receivedAt: `${REFERENCE_DATE}T00:00:00.000Z`,
    input: {
      caller_phone: callerPhone,
      transcript,
      reference_date: REFERENCE_DATE,
    },
    people: [],
    deterministic: parseDeterministicFacts(transcript, REFERENCE_DATE),
  };
}

// 팀 backend hospital.py / card.py에서 확인한 실제 형태의 응답 fixture.
function teamCard(overrides: Record<string, unknown> = {}) {
  return {
    target: "박순자",
    phone_masked: "010-****-1111",
    raw_utterance: "나 모레 저번에 무릎 봐준 데 가야겄어.",
    summary: "모레 정형외과 동행 요청",
    intent: "병원동행",
    hospital: "순천가상정형외과",
    hospital_status: "확인됨",
    dept: "정형외과",
    date_label: "모레",
    date_value: "2026-08-16",
    time_label: null,
    time_value: null,
    reasons: [],
    confirm_questions: ["몇 시에 방문하시겠어요?"],
    need_level: "동행 2단계",
    need_reasons: ["보행 속도가 느림"],
    need_basis: "과거 동행 기록",
    need_official: false,
    guardian_contact: false,
    manager_notes: [],
    flags: [],
    requester: "본인",
    proxy_relation: null,
    fields: {
      target: {
        label: "대상자",
        value: "박순자",
        status: "확인됨",
        evidence: ["발신번호가 등록 프로필과 일치"],
      },
      hospital: {
        label: "병원",
        value: "순천가상정형외과",
        status: "확인됨",
        evidence: [
          "최근 6개월 내 순천가상정형외과(정형외과) 3회 방문 — 단골로 확인됨",
        ],
      },
      dept: {
        label: "진료과",
        value: "정형외과",
        status: "추정",
        evidence: ["과거 동행 이력 기반"],
      },
      date: {
        label: "방문일",
        value: "2026-08-16",
        status: "확인됨",
        evidence: ["'모레'라고 직접 발화"],
        spoken: "모레",
      },
      time: {
        label: "방문 시각",
        value: null,
        status: "확인 필요",
        evidence: [],
        spoken: null,
      },
    },
    ...overrides,
  };
}

function teamResponse(overrides: Record<string, unknown> = {}) {
  return {
    urgent: false,
    urgent_confident: true,
    urgent_message: null,
    channel: TEAM_INTAKE_CHANNEL,
    intent: "병원동행",
    intent_source: "BERT",
    intent_confidence: 0.93,
    dept: "정형외과",
    symptom: "무릎",
    date: "2026-08-16",
    profile: { name: "박순자" },
    facilities: [],
    card: teamCard(),
    intake_id: 42,
    policy: {
      medical_judgement: false,
      human_review_required: true,
      ai_scope: "후보·근거 제시까지",
    },
    ...overrides,
  };
}

function providerWith(
  payload: unknown,
  options: { status?: number; capture?: { url?: string; body?: unknown } } = {},
) {
  return new TeamIntakeAnalysisProvider({
    baseUrl: "http://team.local:8000",
    timeoutMs: 5_000,
    fetchImpl: async (url, init) => {
      if (options.capture) {
        options.capture.url = url;
        options.capture.body = JSON.parse(String(init.body));
      }
      return new Response(JSON.stringify(payload), {
        status: options.status ?? 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
}

describe("Team AI backend provider", () => {
  it("TEAM-01: 유효한 /api/intakes 응답을 기존 도메인 계약으로 normalize한다", async () => {
    const capture: { url?: string; body?: unknown } = {};
    const provider = providerWith(teamResponse(), { capture });
    const result = await provider.analyze(
      contextFor("나 모레 저번에 무릎 봐준 데 가야겄어."),
    );

    // 요청 계약: phone/utterance/channel/save — Analyze는 미리보기이므로 save:false.
    expect(capture.url).toBe("http://team.local:8000/api/intakes");
    expect(capture.body).toMatchObject({
      phone: "010-1111-1111",
      utterance: "나 모레 저번에 무릎 봐준 데 가야겄어.",
      channel: TEAM_INTAKE_CHANNEL,
      save: false,
    });

    // 응답이 기존 IntakeAnalysis 스키마를 그대로 만족한다.
    const analysis = IntakeAnalysisSchema.parse(result.analysis);
    expect(analysis.request_type.value).toBe("HOSPITAL_COMPANION");
    expect(analysis.summary).toBe("모레 정형외과 동행 요청");
    expect(analysis.appointment.date).toMatchObject({
      value: "2026-08-16",
      status: "CONFIRMED_BY_INPUT",
    });
    expect(analysis.confirmation_questions).toContain("몇 시에 방문하시겠어요?");
    expect(analysis.caller.identity_status).toBe("CANDIDATE");
    expect(analysis.caller.person_candidates[0]).toMatchObject({
      name: "박순자",
    });
    expect(
      analysis.care_context.mobility_notes.join(" "),
    ).toContain("동행 2단계");
  });

  it("TEAM-02: 발화에 직접 언급된 병원은 CONFIRMED_BY_INPUT을 유지한다", async () => {
    const provider = providerWith(
      teamResponse({
        card: teamCard({
          raw_utterance:
            "안녕하세요 김영자인데 내일 오전 10시에 순천OO병원 정형외과에 가려고요.",
          hospital: "순천OO병원",
          hospital_status: "확인됨",
          fields: {
            ...teamCard().fields,
            hospital: {
              label: "병원",
              value: "순천OO병원",
              status: "확인됨",
              evidence: ["원문에서 '순천OO병원'을 직접 언급"],
            },
          },
        }),
      }),
    );
    const result = await provider.analyze(
      contextFor(
        "안녕하세요 김영자인데 내일 오전 10시에 순천OO병원 정형외과에 가려고요.",
        "010-2222-2222",
      ),
    );

    expect(result.analysis.hospital.candidates[0]).toMatchObject({
      name: "순천OO병원",
      status: "CONFIRMED_BY_INPUT",
    });
    expect(result.warnings).not.toContain("TEAM_HOSPITAL_STATUS_DOWNGRADED");
  });

  it("TEAM-03: 이력 기반 '확인됨'(단골)은 INFERRED로 강등한다", async () => {
    // 기본 fixture가 정확히 이 케이스다: 발화에 병원명이 없고
    // evidence가 "최근 6개월 내 ... 단골로 확인됨" 형태.
    const provider = providerWith(teamResponse());
    const result = await provider.analyze(
      contextFor("나 모레 저번에 무릎 봐준 데 가야겄어."),
    );

    expect(result.analysis.hospital.candidates[0]).toMatchObject({
      name: "순천가상정형외과",
      status: "INFERRED",
    });
    expect(result.warnings).toContain("TEAM_HOSPITAL_STATUS_DOWNGRADED");
    expect(
      result.analysis.hospital.candidates[0].evidence.join(" "),
    ).toContain("직접 확인 전까지 추정으로 표시");
  });

  it("TEAM-04: 팀 status '추정'은 INFERRED로 매핑한다", async () => {
    const provider = providerWith(
      teamResponse({
        card: teamCard({
          hospital_status: "추정",
          fields: {
            ...teamCard().fields,
            hospital: {
              label: "병원",
              value: "순천가상정형외과",
              status: "추정",
              evidence: ["과거 이력상 1회 방문 — 추정(확정 전 확인 권장)"],
            },
          },
        }),
      }),
    );
    const result = await provider.analyze(
      contextFor("나 모레 저번에 무릎 봐준 데 가야겄어."),
    );

    expect(result.analysis.hospital.candidates[0]).toMatchObject({
      status: "INFERRED",
    });
    expect(result.warnings).not.toContain("TEAM_HOSPITAL_STATUS_DOWNGRADED");
  });

  it("TEAM-05: 팀 status '확인 필요'는 NEEDS_CONFIRMATION으로 처리한다", async () => {
    // 병원명이 없는 신규 대상자 케이스 → 후보 없음.
    const noHospital = providerWith(
      teamResponse({
        card: teamCard({ hospital: null, hospital_status: "확인 필요" }),
      }),
    );
    const emptyResult = await noHospital.analyze(
      contextFor("내일 병원 가야 하는데 저번 데로 가면 돼."),
    );
    expect(emptyResult.analysis.hospital.candidates).toEqual([]);

    // 후보가 애매해 이름은 있지만 확인 필요인 케이스.
    const ambiguous = providerWith(
      teamResponse({
        card: teamCard({
          hospital: "보성가상안과",
          hospital_status: "확인 필요",
          fields: {
            ...teamCard().fields,
            hospital: {
              label: "병원",
              value: "보성가상안과",
              status: "확인 필요",
              evidence: ["비슷한 후보가 둘 이상 — 어느 병원인지 확인 필요"],
            },
          },
        }),
      }),
    );
    const ambiguousResult = await ambiguous.analyze(
      contextFor("나 모레 저번에 무릎 봐준 데 가야겄어."),
    );
    expect(ambiguousResult.analysis.hospital.candidates[0]).toMatchObject({
      status: "NEEDS_CONFIRMATION",
      confidence: 0,
    });
  });

  it("TEAM-06: 복수 시간 발화는 팀이 시간을 확정해도 NEEDS_CONFIRMATION으로 내린다", async () => {
    const provider = providerWith(
      teamResponse({
        card: teamCard({
          raw_utterance: "10시에 진료 보고 9시에 출발해요",
          time_value: "10:00",
          time_label: "10시",
          fields: {
            ...teamCard().fields,
            time: {
              label: "방문 시각",
              value: "10:00",
              status: "확인됨",
              evidence: ["원문에서 '10시' 직접 발화"],
              spoken: "10시",
            },
          },
        }),
      }),
    );
    const result = await provider.analyze(
      contextFor("10시에 진료 보고 9시에 출발해요"),
    );

    expect(result.analysis.appointment.time).toMatchObject({
      value: null,
      status: "NEEDS_CONFIRMATION",
    });
    expect(result.warnings).toContain("TEAM_TIME_DOWNGRADED");
  });

  it("TEAM-06-보강: 명시적 시간 정정은 마지막 값(11:00)을 채택한다", async () => {
    // 팀 응답에 시간이 없어도 우리 결정론 파서가 Phase 3C 정책으로 보완한다.
    const provider = providerWith(teamResponse());
    const result = await provider.analyze(
      contextFor("내일 아니고 모레요. 열 시, 아니 열한 시에 가려고."),
    );

    expect(result.analysis.appointment.time).toMatchObject({
      value: "11:00",
      status: "CONFIRMED_BY_INPUT",
    });

    // 선택지 발화 regression: "10시나 11시 중에 가능해요" → 확인 필요.
    const choice = await providerWith(teamResponse()).analyze(
      contextFor("10시나 11시 중에 가능해요"),
    );
    expect(choice.analysis.appointment.time).toMatchObject({
      value: null,
      status: "NEEDS_CONFIRMATION",
    });
  });

  it("TEAM-07: medical_judgement=false·human_review_required=true를 항상 유지한다", async () => {
    const normal = await providerWith(teamResponse()).analyze(
      contextFor("나 모레 저번에 무릎 봐준 데 가야겄어."),
    );
    expect(normal.analysis.human_review_required).toBe(true);
    expect(normal.analysis.safety.medical_judgement).toBe(false);

    // 팀 policy가 훼손된 응답이 와도 우리 값은 안전값으로 고정되고 경고만 남긴다.
    const tampered = await providerWith(
      teamResponse({
        policy: { medical_judgement: true, human_review_required: false },
      }),
    ).analyze(contextFor("나 모레 저번에 무릎 봐준 데 가야겄어."));
    expect(tampered.analysis.human_review_required).toBe(true);
    expect(tampered.analysis.safety.medical_judgement).toBe(false);
    expect(tampered.warnings).toContain("TEAM_POLICY_MISMATCH");
  });

  it("TEAM-08: backend 미가동이면 안전한 오류로 분류되고 mock fallback이 동작한다", async () => {
    const failing = new TeamIntakeAnalysisProvider({
      baseUrl: "http://team.local:8000",
      timeoutMs: 5_000,
      fetchImpl: async () => {
        throw new Error("connect ECONNREFUSED");
      },
    });
    await expect(
      failing.analyze(contextFor("내일 병원 가려고요")),
    ).rejects.toMatchObject({ code: "TEAM_BACKEND_UNAVAILABLE" });

    const timingOut = new TeamIntakeAnalysisProvider({
      baseUrl: "http://team.local:8000",
      timeoutMs: 5_000,
      fetchImpl: async () => {
        const error = new Error("timeout");
        error.name = "TimeoutError";
        throw error;
      },
    });
    await expect(
      timingOut.analyze(contextFor("내일 병원 가려고요")),
    ).rejects.toMatchObject({ code: "TEAM_BACKEND_TIMEOUT" });

    // router 수준: team 실패 → 기존 fallback 정책으로 mock 분석 제공.
    const route = {
      requestedProvider: "team" as const,
      primary: failing,
      fallback: new MockIntakeAnalysisProvider(),
      initialFallbackUsed: false,
      warnings: [],
      model: "team-backend",
    };
    const result = await analyzeIntakeRequest(
      { caller_phone: "010-1111-1111", transcript: "나 모레 저번에 무릎 봐준 데 가야겄어." },
      { route, intakeId: "TEAM-08" },
    );
    expect(result.meta.provider_used).toBe("mock");
    expect(result.meta.fallback_used).toBe(true);
    expect(result.meta.warnings).toContain("TEAM_BACKEND_UNAVAILABLE");
    expect(result.analysis.hospital.candidates[0]?.status).toBe("INFERRED");
  });

  it("TEAM-09: 계약을 벗어난 JSON은 TEAM_RESPONSE_INVALID로 거절한다", async () => {
    const provider = providerWith({ nonsense: true });
    await expect(
      provider.analyze(contextFor("내일 병원 가려고요")),
    ).rejects.toMatchObject({ code: "TEAM_RESPONSE_INVALID" });

    const httpError = providerWith(teamResponse(), { status: 500 });
    await expect(
      httpError.analyze(contextFor("내일 병원 가려고요")),
    ).rejects.toMatchObject({ code: "TEAM_BACKEND_UNAVAILABLE" });
  });

  it("긴급 응답(card=null)은 분석을 만들지 않고 안전 골격만 반환한다", async () => {
    const provider = providerWith(
      teamResponse({
        urgent: true,
        urgent_message: "긴급 신호 감지 — 즉시 담당자 연결이 필요합니다.",
        intent: "긴급",
        card: null,
      }),
    );
    const result = await provider.analyze(contextFor("숨쉬기가 너무 힘들어"));

    expect(result.analysis.safety).toMatchObject({
      signal_detected: true,
      human_escalation_required: true,
      medical_judgement: false,
    });
    expect(result.analysis.hospital.candidates).toEqual([]);
    expect(result.analysis.appointment.date.status).toBe("NEEDS_CONFIRMATION");
    expect(result.warnings).toContain("TEAM_URGENT");
  });

  it("provider router: AI_PROVIDER=team이면 team primary + mock fallback을 구성한다", () => {
    const config: IntakeAIConfig = {
      provider: "team",
      apiKey: null,
      model: "gpt-5-mini",
      timeoutMs: 15_000,
      maxRetries: 1,
      fallbackToMock: true,
      teamBaseUrl: "http://team.local:8000",
      teamTimeoutMs: 30_000,
    };
    const route = resolveIntakeProviderRoute(config);
    expect(route.primary.name).toBe("team");
    expect(route.fallback?.name).toBe("mock");
    expect(route.model).toBe("team-backend");

    const noFallback = resolveIntakeProviderRoute({
      ...config,
      fallbackToMock: false,
    });
    expect(noFallback.fallback).toBeNull();
  });

  it("TEAM-SAVE-01: Analyze 요청 body는 save:false로 팀 DB 저장을 요청하지 않는다", async () => {
    const capture: { url?: string; body?: unknown } = {};
    await providerWith(teamResponse(), { capture }).analyze(
      contextFor("내일 병원 가려고요"),
    );
    expect((capture.body as { save: boolean }).save).toBe(false);
  });

  it("TEAM-SAVE-02: Analyze를 여러 번 실행해도 persistence 요청이 없다", async () => {
    const bodies: Array<{ save: boolean }> = [];
    const provider = new TeamIntakeAnalysisProvider({
      baseUrl: "http://team.local:8000",
      timeoutMs: 5_000,
      fetchImpl: async (_url, init) => {
        bodies.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify(teamResponse()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    });

    const context = contextFor("나 모레 저번에 무릎 봐준 데 가야겄어.");
    await provider.analyze(context);
    await provider.analyze(context);

    expect(bodies).toHaveLength(2);
    expect(bodies.every((body) => body.save === false)).toBe(true);
  });

  it("normalizeTeamHospital 단위: 판단 불확실 시 아래로만 내린다", () => {
    // 직접 언급 evidence 없음 + 발화에 병원명 없음 + '확인됨' → INFERRED
    const downgraded = normalizeTeamHospital(
      teamCard() as Parameters<typeof normalizeTeamHospital>[0],
    );
    expect(downgraded.candidates[0].status).toBe("INFERRED");
    expect(downgraded.downgraded).toBe(true);

    // raw_utterance에 병원명이 실제로 포함되면 확인됨 유지
    const direct = normalizeTeamHospital(
      teamCard({
        raw_utterance: "내일 순천가상정형외과 가려고요",
      }) as Parameters<typeof normalizeTeamHospital>[0],
    );
    expect(direct.candidates[0].status).toBe("CONFIRMED_BY_INPUT");
    expect(direct.downgraded).toBe(false);
  });
});

describe("TEAM-10: Team STT provider", () => {
  const teamSttConfig = {
    provider: "team" as const,
    apiKey: null,
    model: "gpt-4o-mini-transcribe",
    timeoutMs: 15_000,
    teamBaseUrl: "http://team.local:8000",
    teamTimeoutMs: 30_000,
  };

  function audioFile() {
    return new File([new Uint8Array(64).fill(1)], "recording.webm", {
      type: "audio/webm",
    });
  }

  it("팀 /api/stt 응답의 text를 transcript로 반환한다 (key 불필요)", async () => {
    const result = await transcribeAudioFile(audioFile(), teamSttConfig, async () => ({
      text: "모레 정형외과 가야겄어",
    }));
    expect(result).toMatchObject({
      transcript: "모레 정형외과 가야겄어",
      provider_used: "team",
      model: "faster-whisper",
    });
  });

  it("빈 text는 성공으로 처리하지 않는다", async () => {
    await expect(
      transcribeAudioFile(audioFile(), teamSttConfig, async () => ({ text: " " })),
    ).rejects.toMatchObject({ code: "STT_EMPTY_TRANSCRIPT" });
  });

  it("팀 STT 실패는 안전한 STT 오류로 분류된다", async () => {
    await expect(
      transcribeAudioFile(audioFile(), teamSttConfig, async () => {
        throw new Error("connect ECONNREFUSED");
      }),
    ).rejects.toMatchObject({ code: "STT_PROVIDER_FAILED" });
  });
});
