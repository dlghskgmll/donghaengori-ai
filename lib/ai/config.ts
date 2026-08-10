import type { IntakeProviderMode } from "./schema";
import { IntakeProviderError } from "./errors";

export interface IntakeAIConfig {
  provider: IntakeProviderMode;
  apiKey: string | null;
  model: string;
  timeoutMs: number;
  maxRetries: number;
  fallbackToMock: boolean;
}

function parseProvider(value: string | undefined): IntakeProviderMode {
  const provider = value?.trim() || "mock";
  if (provider === "mock" || provider === "openai" || provider === "auto") {
    return provider;
  }

  throw new IntakeProviderError(
    "AI_PROVIDER_CONFIG",
    `지원하지 않는 AI_PROVIDER 값입니다: ${provider}`,
    { fallbackEligible: false },
  );
}

function parseInteger(
  name: string,
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new IntakeProviderError(
      "AI_PROVIDER_CONFIG",
      `${name}은 ${minimum}~${maximum} 범위의 정수여야 합니다.`,
      { fallbackEligible: false },
    );
  }
  return parsed;
}

function parseBoolean(name: string, value: string | undefined, fallback: boolean) {
  if (value === undefined || value.trim() === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new IntakeProviderError(
    "AI_PROVIDER_CONFIG",
    `${name}은 true 또는 false여야 합니다.`,
    { fallbackEligible: false },
  );
}

export function loadIntakeAIConfig(
  environment: NodeJS.ProcessEnv = process.env,
): IntakeAIConfig {
  const apiKey = environment.OPENAI_API_KEY?.trim() || null;
  const model = environment.OPENAI_MODEL?.trim() || "gpt-5-mini";

  return {
    provider: parseProvider(environment.AI_PROVIDER),
    apiKey,
    model,
    timeoutMs: parseInteger(
      "OPENAI_TIMEOUT_MS",
      environment.OPENAI_TIMEOUT_MS,
      15_000,
      1_000,
      60_000,
    ),
    maxRetries: parseInteger(
      "OPENAI_MAX_RETRIES",
      environment.OPENAI_MAX_RETRIES,
      1,
      0,
      1,
    ),
    fallbackToMock: parseBoolean(
      "AI_FALLBACK_TO_MOCK",
      environment.AI_FALLBACK_TO_MOCK,
      true,
    ),
  };
}
