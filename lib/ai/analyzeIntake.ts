import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { personRepository } from "../data/personRepository";
import { visitRepository } from "../data/visitRepository";
import { loadIntakeAIConfig } from "./config";
import { parseDeterministicFacts } from "./deterministic";
import { asProviderError, IntakeProviderError } from "./errors";
import {
  getIntakeAnalysisProvider,
  resolveIntakeProviderRoute,
  type IntakeAnalysisProvider,
  type IntakeProviderContext,
  type IntakeProviderRoute,
  type MatchedPersonContext,
} from "./provider";
import {
  AnalyzeIntakeResponseSchema,
  AnalyzeIntakeInputSchema,
  IntakeAnalysisSchema,
  type IntakeAnalysis,
} from "./schema";

function todayInKorea() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function buildPersonContext(
  callerPhone: string,
  transcript: string,
): Promise<MatchedPersonContext[]> {
  const [phoneMatches, nameMatches] = await Promise.all([
    personRepository.findByPhone(callerPhone),
    personRepository.findByTranscript(transcript),
  ]);
  const peopleById = new Map(
    [...phoneMatches, ...nameMatches].map((person) => [person.person_id, person]),
  );

  return Promise.all(
    [...peopleById.values()].map(async (person) => ({
      person,
      careProfile: await personRepository.getCareProfile(person.person_id),
      visits: await visitRepository.findByPersonId(person.person_id),
      matchedByPhone: phoneMatches.some(
        (match) => match.person_id === person.person_id,
      ),
      matchedByName: nameMatches.some(
        (match) => match.person_id === person.person_id,
      ),
    })),
  );
}

async function buildProviderContext(
  input: ReturnType<typeof AnalyzeIntakeInputSchema.parse>,
  receivedAt: string,
): Promise<IntakeProviderContext> {
  const referenceDate = input.reference_date ?? todayInKorea();
  return {
    receivedAt,
    input: {
      caller_phone: input.caller_phone,
      transcript: input.transcript,
      reference_date: referenceDate,
    },
    people: await buildPersonContext(input.caller_phone, input.transcript),
    deterministic: parseDeterministicFacts(input.transcript, referenceDate),
  };
}

async function runProvider(
  provider: IntakeAnalysisProvider,
  context: IntakeProviderContext,
) {
  const result = await provider.analyze(context);
  return {
    analysis: IntakeAnalysisSchema.parse(result.analysis),
    warnings: result.warnings,
  };
}

export async function analyzeIntake(
  rawInput: unknown,
  provider: IntakeAnalysisProvider = getIntakeAnalysisProvider(),
) {
  const input = AnalyzeIntakeInputSchema.parse(rawInput);
  const context = await buildProviderContext(input, new Date().toISOString());
  return (await runProvider(provider, context)).analysis;
}

export interface AnalyzeIntakeRequestOptions {
  route?: IntakeProviderRoute;
  intakeId?: string;
  now?: () => number;
  receivedAt?: string;
}

export async function analyzeIntakeRequest(
  rawInput: unknown,
  options: AnalyzeIntakeRequestOptions = {},
) {
  const now = options.now ?? (() => performance.now());
  const totalStartedAt = now();
  const input = AnalyzeIntakeInputSchema.parse(rawInput);
  const context = await buildProviderContext(
    input,
    options.receivedAt ?? new Date().toISOString(),
  );
  const route =
    options.route ?? resolveIntakeProviderRoute(loadIntakeAIConfig());
  const providerStartedAt = now();
  let providerUsed = route.primary;
  let fallbackUsed = route.initialFallbackUsed;
  const warnings = [...route.warnings];
  let analysis: IntakeAnalysis;

  try {
    const result = await runProvider(route.primary, context);
    analysis = result.analysis;
    warnings.push(...result.warnings);
  } catch (error) {
    const providerError =
      error instanceof ZodError && route.primary.name === "openai"
        ? new IntakeProviderError(
            "OPENAI_SCHEMA_VALIDATION",
            "OpenAI 최종 분석 결과가 스키마를 통과하지 못했습니다.",
            { cause: error },
          )
        : asProviderError(error);

    if (
      route.primary.name !== "openai" ||
      !route.fallback ||
      !providerError.fallbackEligible
    ) {
      throw providerError;
    }

    fallbackUsed = true;
    warnings.push(providerError.code);
    providerUsed = route.fallback;
    const fallbackResult = await runProvider(route.fallback, context);
    analysis = fallbackResult.analysis;
    warnings.push(...fallbackResult.warnings);
  }

  const providerLatencyMs = Math.max(0, now() - providerStartedAt);
  const totalLatencyMs = Math.max(0, now() - totalStartedAt);

  return AnalyzeIntakeResponseSchema.parse({
    intake_id: options.intakeId ?? randomUUID(),
    status: "DRAFT_AI",
    analysis,
    meta: {
      requested_provider: route.requestedProvider,
      provider_used: providerUsed.name,
      model: route.model,
      fallback_used: fallbackUsed,
      provider_latency_ms: providerLatencyMs,
      total_latency_ms: totalLatencyMs,
      warnings: [...new Set(warnings)],
    },
  });
}
