import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { ZodError } from "zod";
import { buildEvidenceCatalogue } from "./evidence";
import { IntakeProviderError } from "./errors";
import { LlmIntakeAnalysisSchema } from "./llmSchema";
import { buildMinimizedOpenAIInput } from "./openaiInput";
import { assembleOpenAIAnalysis } from "./postprocess";
import { INTAKE_SYSTEM_PROMPT } from "./prompt";
import type {
  IntakeAnalysisProvider,
  IntakeProviderContext,
  ProviderAnalysisResult,
} from "./provider";

export function buildOpenAIIntakeRequest(
  model: string,
  input: ReturnType<typeof buildMinimizedOpenAIInput>,
) {
  return {
    model,
    instructions: INTAKE_SYSTEM_PROMPT,
    input: JSON.stringify(input),
    text: {
      format: zodTextFormat(LlmIntakeAnalysisSchema, "donghaeng_intake_semantics"),
    },
    store: false,
    background: false,
    stream: false as const,
    tools: [],
    parallel_tool_calls: false,
  };
}

export interface OpenAIParseResponseLike {
  status?: string | null;
  output_parsed: unknown;
  output: unknown[];
  incomplete_details?: unknown;
  error?: unknown;
}

export interface OpenAIRequestOptionsLike {
  signal?: AbortSignal;
  timeout?: number;
  maxRetries?: number;
}

export type ParseOpenAIIntakeResponse = (
  body: ReturnType<typeof buildOpenAIIntakeRequest>,
  options?: OpenAIRequestOptionsLike,
) => Promise<OpenAIParseResponseLike>;

export interface OpenAIIntakeProviderOptions {
  apiKey: string | null;
  model: string;
  timeoutMs: number;
  maxRetries: number;
  parseResponse?: ParseOpenAIIntakeResponse;
}

function responseContainsRefusal(output: unknown[]) {
  return output.some((item) => {
    if (!item || typeof item !== "object" || !("content" in item)) return false;
    const content = item.content;
    return (
      Array.isArray(content) &&
      content.some(
        (entry) =>
          entry !== null &&
          typeof entry === "object" &&
          "type" in entry &&
          entry.type === "refusal",
      )
    );
  });
}

function classifyOpenAIError(error: unknown) {
  if (error instanceof IntakeProviderError) return error;
  if (error instanceof ZodError) {
    return new IntakeProviderError(
      "OPENAI_SCHEMA_VALIDATION",
      "OpenAI structured output이 중간 스키마를 통과하지 못했습니다.",
      { cause: error },
    );
  }
  if (error instanceof SyntaxError) {
    return new IntakeProviderError(
      "OPENAI_MALFORMED_OUTPUT",
      "OpenAI structured output을 해석할 수 없습니다.",
      { cause: error },
    );
  }
  if (
    error instanceof OpenAI.APIConnectionTimeoutError ||
    error instanceof OpenAI.APIUserAbortError ||
    (error instanceof Error &&
      (error.name === "AbortError" || error.name === "APIConnectionTimeoutError"))
  ) {
    return new IntakeProviderError("OPENAI_TIMEOUT", "OpenAI 요청 시간이 초과되었습니다.", {
      cause: error,
    });
  }
  if (
    error instanceof OpenAI.RateLimitError ||
    (typeof error === "object" && error !== null && "status" in error && error.status === 429)
  ) {
    return new IntakeProviderError("OPENAI_RATE_LIMIT", "OpenAI 호출 한도를 초과했습니다.", {
      cause: error,
    });
  }
  if (
    error instanceof OpenAI.AuthenticationError ||
    (typeof error === "object" && error !== null && "status" in error && error.status === 401)
  ) {
    return new IntakeProviderError("OPENAI_AUTH", "OpenAI 인증에 실패했습니다.", {
      cause: error,
    });
  }
  if (
    error instanceof OpenAI.PermissionDeniedError ||
    (typeof error === "object" && error !== null && "status" in error && error.status === 403)
  ) {
    return new IntakeProviderError("OPENAI_PERMISSION", "OpenAI 호출 권한이 없습니다.", {
      cause: error,
    });
  }
  if (
    error instanceof OpenAI.APIConnectionError ||
    (error instanceof Error && error.name === "APIConnectionError")
  ) {
    return new IntakeProviderError("OPENAI_NETWORK", "OpenAI 네트워크 연결에 실패했습니다.", {
      cause: error,
    });
  }
  return new IntakeProviderError("OPENAI_UNKNOWN", "OpenAI 호출에 실패했습니다.", {
    cause: error,
  });
}

export class OpenAIIntakeAnalysisProvider implements IntakeAnalysisProvider {
  readonly name = "openai" as const;
  readonly model: string;
  private readonly apiKey: string | null;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly parseResponse: ParseOpenAIIntakeResponse | null;

  constructor(options: OpenAIIntakeProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.timeoutMs = options.timeoutMs;
    this.maxRetries = options.maxRetries;
    this.parseResponse = options.parseResponse ?? null;
  }

  async analyze(context: IntakeProviderContext): Promise<ProviderAnalysisResult> {
    if (!this.apiKey) {
      throw new IntakeProviderError(
        "OPENAI_API_KEY_MISSING",
        "OPENAI_API_KEY가 설정되지 않았습니다.",
      );
    }

    const catalogue = buildEvidenceCatalogue(context);
    const minimizedInput = buildMinimizedOpenAIInput(context, catalogue);
    const request = buildOpenAIIntakeRequest(this.model, minimizedInput);
    const controller = new AbortController();
    const totalTimeoutMs = this.timeoutMs * (this.maxRetries + 1) + 2_000;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    try {
      const parseResponse =
        this.parseResponse ??
        (async (body, requestOptions) => {
          const client = new OpenAI({
            apiKey: this.apiKey ?? undefined,
            timeout: this.timeoutMs,
            maxRetries: this.maxRetries,
            logLevel: "off",
          });
          const response = await client.responses.parse(body, requestOptions);
          return {
            status: response.status,
            output_parsed: response.output_parsed,
            output: response.output,
            incomplete_details: response.incomplete_details,
            error: response.error,
          };
        });

      const timeout = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          controller.abort();
          reject(
            new IntakeProviderError(
              "OPENAI_TIMEOUT",
              "OpenAI 요청 시간이 초과되었습니다.",
            ),
          );
        }, totalTimeoutMs);
      });
      const response = await Promise.race([
        parseResponse(request, {
          signal: controller.signal,
          timeout: this.timeoutMs,
          maxRetries: this.maxRetries,
        }),
        timeout,
      ]);

      if (response.status === "incomplete") {
        throw new IntakeProviderError(
          "OPENAI_INCOMPLETE",
          "OpenAI 응답이 완료되지 않았습니다.",
        );
      }
      if (response.status && response.status !== "completed") {
        throw new IntakeProviderError(
          "OPENAI_RESPONSE_FAILED",
          "OpenAI 응답 상태가 완료가 아닙니다.",
        );
      }
      if (responseContainsRefusal(response.output)) {
        throw new IntakeProviderError(
          "OPENAI_REFUSAL",
          "OpenAI가 분석 요청을 거절했습니다.",
        );
      }
      if (response.output_parsed === null || response.output_parsed === undefined) {
        throw new IntakeProviderError(
          "OPENAI_MALFORMED_OUTPUT",
          "OpenAI structured output이 비어 있습니다.",
        );
      }

      const llmAnalysis = LlmIntakeAnalysisSchema.parse(response.output_parsed);
      return assembleOpenAIAnalysis(context, llmAnalysis, catalogue);
    } catch (error) {
      throw classifyOpenAIError(error);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }
}
