import { z, ZodError } from "zod";
import { IntakeProviderError } from "./errors";
import {
  IntakeAnalysisSchema,
  type IntakeAnalysis,
} from "./schema";
import type {
  IntakeAnalysisProvider,
  IntakeProviderContext,
  ProviderAnalysisResult,
} from "./provider";

// Team AI Backend(FastAPI, cirphere/donghaenggori) 연동 provider.
// 팀 backend가 intelligence layer(local STT·intent·NLU·Care Profile·병원 후보)를,
// 이 Next.js가 product/UI layer를 담당한다. 팀 repo는 수정하지 않고,
// 우리 안전 정책과 다른 부분은 이 adapter에서 보수적으로 normalize한다.

export const TEAM_INTAKE_CHANNEL = "앱·웹(보호자)";

const TeamFieldViewSchema = z
  .object({
    label: z.string(),
    value: z.string().nullable().optional(),
    status: z.enum(["확인됨", "추정", "확인 필요"]),
    evidence: z.array(z.string()).default([]),
    spoken: z.string().nullable().optional(),
  })
  .loose();

const TeamCardSchema = z
  .object({
    target: z.string(),
    raw_utterance: z.string().default(""),
    summary: z.string().default(""),
    hospital: z.string().nullable().optional(),
    hospital_status: z.enum(["확인됨", "추정", "확인 필요"]),
    dept: z.string().nullable().optional(),
    reasons: z.array(z.string()).default([]),
    confirm_questions: z.array(z.string()).default([]),
    fields: z.record(z.string(), TeamFieldViewSchema).default({}),
    need_level: z.string().nullable().optional(),
    need_basis: z.string().nullable().optional(),
    need_official: z.boolean().optional(),
    flags: z.array(z.string()).default([]),
    manager_notes: z.array(z.string()).default([]),
    requester: z.string().optional(),
    proxy_relation: z.string().nullable().optional(),
  })
  .loose();

const TeamIntakeResponseSchema = z
  .object({
    urgent: z.boolean(),
    urgent_confident: z.boolean().optional(),
    urgent_message: z.string().nullable().optional(),
    intent: z.string().nullable().optional(),
    intent_confidence: z.number().nullable().optional(),
    card: TeamCardSchema.nullable(),
    policy: z
      .object({
        medical_judgement: z.boolean(),
        human_review_required: z.boolean(),
      })
      .loose()
      .optional(),
    intake_id: z.union([z.number(), z.string()]).nullable().optional(),
  })
  .loose();

export type TeamIntakeResponse = z.infer<typeof TeamIntakeResponseSchema>;

const INTENT_TO_REQUEST_TYPE: Record<
  string,
  IntakeAnalysis["request_type"]["value"]
> = {
  병원동행: "HOSPITAL_COMPANION",
  약국: "PHARMACY",
  보호자연락: "GUARDIAN_CONTACT",
};

const DATE_VALUE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_VALUE_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

type EvidenceStatus = IntakeAnalysis["appointment"]["date"]["status"];

function mapTeamStatus(status: "확인됨" | "추정" | "확인 필요"): EvidenceStatus {
  if (status === "확인됨") return "CONFIRMED_BY_INPUT";
  if (status === "추정") return "INFERRED";
  return "NEEDS_CONFIRMATION";
}

function confidenceFor(status: EvidenceStatus): number {
  if (status === "CONFIRMED_BY_INPUT") return 0.97;
  if (status === "INFERRED") return 0.72;
  return 0;
}

// 우리 제품 원칙: 추정 ≠ 확정. 팀 backend는 "최근 6개월 같은 병원 2회 이상"도
// 확인됨으로 반환하지만, 사용자가 현재 발화에서 직접 말한 경우에만
// CONFIRMED_BY_INPUT을 허용하고 이력 기반은 INFERRED로 내린다.
// 판단이 불확실하면 항상 아래로 내린다(unsafe upgrade 금지).
export function normalizeTeamHospital(
  card: z.infer<typeof TeamCardSchema>,
): {
  candidates: IntakeAnalysis["hospital"]["candidates"];
  downgraded: boolean;
} {
  const name = card.hospital?.trim();
  const fieldEvidence = card.fields.hospital?.evidence ?? [];
  const evidencePool = [...fieldEvidence, ...card.reasons];

  if (!name) {
    return { candidates: [], downgraded: false };
  }

  const directlyMentioned =
    evidencePool.some((entry) => entry.includes("직접 언급")) ||
    (card.raw_utterance.length > 0 && card.raw_utterance.includes(name));

  let status: EvidenceStatus;
  let downgraded = false;
  if (card.hospital_status === "확인됨" && directlyMentioned) {
    status = "CONFIRMED_BY_INPUT";
  } else if (card.hospital_status === "확인됨") {
    // history-only "확인됨"(단골) → 사용자 직접 확인 전까지 추정으로 강등.
    status = "INFERRED";
    downgraded = true;
  } else if (card.hospital_status === "추정") {
    status = "INFERRED";
  } else {
    status = "NEEDS_CONFIRMATION";
  }

  const evidence =
    evidencePool.length > 0 ? [...evidencePool] : ["팀 backend 병원 후보"];
  if (downgraded) {
    evidence.push("과거 이력 기반 후보 — 어르신 직접 확인 전까지 추정으로 표시");
  }

  return {
    candidates: [
      {
        name,
        status,
        confidence: status === "CONFIRMED_BY_INPUT" ? 0.99 : confidenceFor(status),
        evidence,
      },
    ],
    downgraded,
  };
}

function buildField(
  field: z.infer<typeof TeamFieldViewSchema> | undefined,
  pattern: RegExp,
  missingEvidence: string,
) {
  const rawValue = field?.value?.trim() || null;
  const valid = rawValue !== null && pattern.test(rawValue);
  const status: EvidenceStatus =
    valid && field ? mapTeamStatus(field.status) : "NEEDS_CONFIRMATION";
  const evidence = [...(field?.evidence ?? [])];
  if (field?.spoken) {
    evidence.push(`어르신 표현: '${field.spoken}'`);
  }
  return {
    value: valid ? rawValue : null,
    status,
    confidence: valid ? confidenceFor(status) : 0,
    evidence: evidence.length > 0 ? evidence : [missingEvidence],
  };
}

export function normalizeTeamResponse(
  team: TeamIntakeResponse,
  context: IntakeProviderContext,
): ProviderAnalysisResult {
  const warnings: string[] = [];

  if (
    team.policy &&
    (team.policy.medical_judgement !== false ||
      team.policy.human_review_required !== true)
  ) {
    // 안전 정책 불일치는 경고로 드러내되, 우리 응답은 항상 안전값으로 고정한다.
    warnings.push("TEAM_POLICY_MISMATCH");
  }

  const intent = team.intent ?? undefined;
  const requestType =
    (intent && INTENT_TO_REQUEST_TYPE[intent]) || "UNKNOWN";
  const intentConfidence =
    typeof team.intent_confidence === "number" &&
    team.intent_confidence >= 0 &&
    team.intent_confidence <= 1
      ? team.intent_confidence
      : 0.5;

  if (team.urgent || !team.card) {
    const urgentConfidence = team.urgent
      ? (team.urgent_confident ?? null)
      : null;
    if (team.urgent) {
      warnings.push("TEAM_URGENT");
      warnings.push(
        urgentConfidence === true
          ? "TEAM_URGENT_CONFIDENT"
          : urgentConfidence === false
            ? "TEAM_URGENT_NEEDS_REVIEW"
            : "TEAM_URGENT_CONFIDENCE_UNKNOWN",
      );
    } else {
      warnings.push("TEAM_CARD_MISSING");
    }

    const interruptedEvidence = team.urgent
      ? urgentConfidence === true
        ? "긴급 신호로 접수 분석을 진행하지 않음"
        : "긴급 여부를 사람이 확인하도록 접수 분석을 진행하지 않음"
      : "Team 접수카드가 없어 분석을 진행하지 않음";
    const confirmationQuestion = team.urgent
      ? urgentConfidence === true
        ? "긴급 신호가 감지되어 담당자가 직접 확인·전환해야 합니다."
        : urgentConfidence === false
          ? "긴급 여부를 바로 판단하기 어려워 담당자가 원문을 확인해야 합니다."
          : "긴급 신호의 확신도 정보가 없어 담당자가 원문을 확인해야 합니다."
      : "접수카드가 생성되지 않아 담당자가 원문을 확인해야 합니다.";

    const analysis: IntakeAnalysis = IntakeAnalysisSchema.parse({
      schema_version: "1.0",
      request_type: { value: requestType, confidence: intentConfidence },
      caller: { person_candidates: [], identity_status: "UNKNOWN" },
      appointment: {
        date: {
          value: null,
          status: "NEEDS_CONFIRMATION",
          confidence: 0,
          evidence: [interruptedEvidence],
        },
        time: {
          value: null,
          status: "NEEDS_CONFIRMATION",
          confidence: 0,
          evidence: [interruptedEvidence],
        },
      },
      hospital: { candidates: [] },
      department: {
        value: null,
        status: "NEEDS_CONFIRMATION",
        confidence: 0,
        evidence: [interruptedEvidence],
      },
      additional_requests: [],
      care_context: { mobility_notes: [] },
      confirmation_questions: [confirmationQuestion],
      safety: {
        signal_detected: Boolean(team.urgent),
        signal_type: team.urgent
          ? urgentConfidence === true
            ? "TEAM_URGENT_CONFIDENT"
            : urgentConfidence === false
              ? "TEAM_URGENT_NEEDS_REVIEW"
              : "TEAM_URGENT_CONFIDENCE_UNKNOWN"
          : null,
        urgent_confident: urgentConfidence,
        medical_judgement: false,
        human_escalation_required: Boolean(team.urgent),
      },
      summary:
        team.urgent_message?.trim() ||
        (team.urgent
          ? urgentConfidence === true
            ? "긴급 신호 감지 — 담당자 직접 확인이 필요합니다."
            : urgentConfidence === false
              ? "긴급 여부 확인 필요 — 담당자가 원문을 확인해야 합니다."
              : "긴급 확신도 정보 없음 — 담당자가 원문을 확인해야 합니다."
          : "Team 접수카드가 없어 담당자 확인이 필요합니다."),
      human_review_required: true,
    });
    return { analysis, warnings };
  }

  const card = team.card;
  const hospital = normalizeTeamHospital(card);
  if (hospital.downgraded) warnings.push("TEAM_HOSPITAL_STATUS_DOWNGRADED");

  const date = buildField(
    card.fields.date,
    DATE_VALUE_PATTERN,
    "원문에서 방문 날짜를 확인할 수 없음",
  );

  // 시간은 Phase 3C 정책(복수·선택지·범위·부정 → 확인 필요)을 우리
  // 결정론 파서로 교차 검증한다. downgrade만 하고 upgrade는 하지 않는다.
  let time = buildField(
    card.fields.time,
    TIME_VALUE_PATTERN,
    "원문에서 방문 시간을 확인할 수 없음",
  );
  const ourTime = context.deterministic.explicitTime;
  if (ourTime.uncertain) {
    if (time.value !== null) warnings.push("TEAM_TIME_DOWNGRADED");
    time = {
      value: null,
      status: "NEEDS_CONFIRMATION",
      confidence: 0,
      evidence: ["원문에서 방문 시간이 불확실하게 표현됨"],
    };
  } else if (time.value === null && ourTime.value && ourTime.sourceText) {
    time = {
      value: ourTime.value,
      status: "CONFIRMED_BY_INPUT",
      confidence: 0.97,
      evidence: [`원문에서 “${ourTime.sourceText}”을 직접 말함`],
    };
  }

  const department = card.fields.dept
    ? {
        value: card.fields.dept.value?.trim() || null,
        status: card.fields.dept.value?.trim()
          ? mapTeamStatus(card.fields.dept.status)
          : ("NEEDS_CONFIRMATION" as const),
        confidence: card.fields.dept.value?.trim()
          ? confidenceFor(mapTeamStatus(card.fields.dept.status))
          : 0,
        evidence:
          card.fields.dept.evidence.length > 0
            ? card.fields.dept.evidence
            : ["원문에서 진료과를 확인할 수 없음"],
      }
    : {
        value: null,
        status: "NEEDS_CONFIRMATION" as const,
        confidence: 0,
        evidence: ["원문에서 진료과를 확인할 수 없음"],
      };

  const hasIdentifiedTarget =
    card.target.trim().length > 0 &&
    !["미확인", "신규", "미상"].includes(card.target.trim());

  const mobilityNotes: string[] = [];
  if (card.need_level) {
    const basis = card.need_basis ? ` — 근거: ${card.need_basis}` : "";
    const official = card.need_official ? " (공식 판정 기반)" : "";
    mobilityNotes.push(`동행 지원 수준 후보: ${card.need_level}${basis}${official}`);
  }
  mobilityNotes.push(...card.flags, ...card.manager_notes);

  const analysis: IntakeAnalysis = IntakeAnalysisSchema.parse({
    schema_version: "1.0",
    request_type: { value: requestType, confidence: intentConfidence },
    caller: {
      person_candidates: hasIdentifiedTarget
        ? [
            {
              person_id: "TEAM_PROFILE",
              name: card.target.trim(),
              confidence: 0.87,
              evidence: ["발신번호 기반 팀 backend 프로필 후보 — 확정 아님"],
            },
          ]
        : [],
      identity_status: hasIdentifiedTarget ? "CANDIDATE" : "UNKNOWN",
    },
    appointment: { date, time },
    hospital: { candidates: hospital.candidates },
    department,
    additional_requests: [],
    proxy_request:
      card.requester === "대리"
        ? { detected: true, relationship: card.proxy_relation ?? null }
        : { detected: false, relationship: null },
    care_context: { mobility_notes: mobilityNotes },
    confirmation_questions: card.confirm_questions,
    safety: {
      signal_detected: false,
      signal_type: null,
      medical_judgement: false,
      human_escalation_required: false,
    },
    summary: card.summary.trim() || "접수 내용을 담당자가 확인해 주세요.",
    human_review_required: true,
  });

  return { analysis, warnings };
}

export type TeamFetch = (
  url: string,
  init: RequestInit,
) => Promise<Response>;

export interface TeamProviderOptions {
  baseUrl: string;
  timeoutMs: number;
  fetchImpl?: TeamFetch;
}

function classifyTeamError(error: unknown): IntakeProviderError {
  if (error instanceof IntakeProviderError) return error;
  if (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return new IntakeProviderError(
      "TEAM_BACKEND_TIMEOUT",
      "Team AI backend 응답 시간이 초과되었습니다.",
      { cause: error },
    );
  }
  return new IntakeProviderError(
    "TEAM_BACKEND_UNAVAILABLE",
    "Team AI backend에 연결하지 못했습니다.",
    { cause: error },
  );
}

export class TeamIntakeAnalysisProvider implements IntakeAnalysisProvider {
  readonly name = "team" as const;
  readonly model = "team-backend";
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: TeamFetch;

  constructor(options: TeamProviderOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs;
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
  }

  async analyze(context: IntakeProviderContext): Promise<ProviderAnalysisResult> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/api/intakes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // save:false — 브라우저 Analyze는 미리보기다. 접수 확정은 사람이 하며,
        // Analyze 재클릭이 팀 DB에 중복 접수를 만들면 안 된다.
        // (전화 경로는 팀 backend /api/voice/*가 자체적으로 저장을 결정한다.)
        body: JSON.stringify({
          phone: context.input.caller_phone,
          utterance: context.input.transcript,
          channel: TEAM_INTAKE_CHANNEL,
          save: false,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw classifyTeamError(error);
    }

    if (!response.ok) {
      throw new IntakeProviderError(
        "TEAM_BACKEND_UNAVAILABLE",
        `Team AI backend가 오류를 반환했습니다 (HTTP ${response.status}).`,
      );
    }

    let team: TeamIntakeResponse;
    try {
      team = TeamIntakeResponseSchema.parse(await response.json());
    } catch (error) {
      throw new IntakeProviderError(
        "TEAM_RESPONSE_INVALID",
        "Team AI backend 응답을 해석할 수 없습니다.",
        { cause: error },
      );
    }

    try {
      return normalizeTeamResponse(team, context);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new IntakeProviderError(
          "TEAM_RESPONSE_INVALID",
          "Team AI backend 응답이 접수카드 형식을 만족하지 못했습니다.",
          { cause: error },
        );
      }
      throw error;
    }
  }
}
