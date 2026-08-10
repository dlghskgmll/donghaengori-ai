import type { CareProfile, Person } from "../domain/person";
import type { Visit } from "../domain/visit";
import type { DeterministicFacts } from "./deterministic";
import type { IntakeAIConfig } from "./config";
import { loadIntakeAIConfig } from "./config";
import { IntakeProviderError } from "./errors";
import type { AnalyzeIntakeInput } from "./schema";
import type { IntakeAnalysis, IntakeProviderName } from "./schema";
import { analyzeMockIntake } from "./mockProvider";
import { OpenAIIntakeAnalysisProvider } from "./openaiProvider";

export interface MatchedPersonContext {
  person: Person;
  careProfile: CareProfile | null;
  visits: Visit[];
  matchedByPhone: boolean;
  matchedByName: boolean;
}

export interface IntakeProviderContext {
  receivedAt: string;
  input: Required<Pick<AnalyzeIntakeInput, "caller_phone" | "transcript">> & {
    reference_date: string;
  };
  people: MatchedPersonContext[];
  deterministic: DeterministicFacts;
}

export interface ProviderAnalysisResult {
  analysis: IntakeAnalysis;
  warnings: string[];
}

export interface IntakeAnalysisProvider {
  readonly name: IntakeProviderName;
  readonly model: string | null;
  analyze(context: IntakeProviderContext): Promise<ProviderAnalysisResult>;
}

export class MockIntakeAnalysisProvider implements IntakeAnalysisProvider {
  readonly name = "mock" as const;
  readonly model = null;

  async analyze(context: IntakeProviderContext) {
    return { analysis: analyzeMockIntake(context), warnings: [] };
  }
}

export interface IntakeProviderRoute {
  requestedProvider: IntakeAIConfig["provider"];
  primary: IntakeAnalysisProvider;
  fallback: IntakeAnalysisProvider | null;
  initialFallbackUsed: boolean;
  warnings: string[];
  model: string | null;
}

export interface IntakeProviderFactories {
  mock?: () => IntakeAnalysisProvider;
  openai?: (config: IntakeAIConfig) => IntakeAnalysisProvider;
}

export function resolveIntakeProviderRoute(
  config: IntakeAIConfig,
  factories: IntakeProviderFactories = {},
): IntakeProviderRoute {
  const createMock = factories.mock ?? (() => new MockIntakeAnalysisProvider());
  const createOpenAI =
    factories.openai ??
    ((resolvedConfig) =>
      new OpenAIIntakeAnalysisProvider({
        apiKey: resolvedConfig.apiKey,
        model: resolvedConfig.model,
        timeoutMs: resolvedConfig.timeoutMs,
        maxRetries: resolvedConfig.maxRetries,
      }));

  if (config.provider === "mock") {
    return {
      requestedProvider: "mock",
      primary: createMock(),
      fallback: null,
      initialFallbackUsed: false,
      warnings: [],
      model: null,
    };
  }

  if (config.provider === "auto" && !config.apiKey) {
    return {
      requestedProvider: "auto",
      primary: createMock(),
      fallback: null,
      initialFallbackUsed: false,
      warnings: [],
      model: null,
    };
  }

  if (!config.apiKey) {
    if (!config.fallbackToMock) {
      throw new IntakeProviderError(
        "OPENAI_API_KEY_MISSING",
        "OPENAI_API_KEY가 설정되지 않았습니다.",
        { fallbackEligible: false },
      );
    }
    return {
      requestedProvider: config.provider,
      primary: createMock(),
      fallback: null,
      initialFallbackUsed: true,
      warnings: ["OPENAI_API_KEY_MISSING"],
      model: config.model,
    };
  }

  return {
    requestedProvider: config.provider,
    primary: createOpenAI(config),
    fallback: config.fallbackToMock ? createMock() : null,
    initialFallbackUsed: false,
    warnings: [],
    model: config.model,
  };
}

export function getIntakeAnalysisProvider(): IntakeAnalysisProvider {
  return resolveIntakeProviderRoute(loadIntakeAIConfig()).primary;
}
