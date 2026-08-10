export type ProviderErrorCode =
  | "AI_PROVIDER_CONFIG"
  | "OPENAI_API_KEY_MISSING"
  | "OPENAI_TIMEOUT"
  | "OPENAI_NETWORK"
  | "OPENAI_RATE_LIMIT"
  | "OPENAI_AUTH"
  | "OPENAI_PERMISSION"
  | "OPENAI_REFUSAL"
  | "OPENAI_INCOMPLETE"
  | "OPENAI_RESPONSE_FAILED"
  | "OPENAI_MALFORMED_OUTPUT"
  | "OPENAI_SCHEMA_VALIDATION"
  | "EVIDENCE_REF_VIOLATION"
  | "OPENAI_UNKNOWN";

export class IntakeProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly fallbackEligible: boolean;

  constructor(
    code: ProviderErrorCode,
    message: string,
    options: { fallbackEligible?: boolean; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "IntakeProviderError";
    this.code = code;
    this.fallbackEligible = options.fallbackEligible ?? true;
  }
}

export function asProviderError(error: unknown): IntakeProviderError {
  if (error instanceof IntakeProviderError) return error;

  return new IntakeProviderError(
    "OPENAI_UNKNOWN",
    "OpenAI provider에서 분류되지 않은 오류가 발생했습니다.",
    { cause: error },
  );
}
