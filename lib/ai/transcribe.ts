import OpenAI from "openai";

export type TranscriptionErrorCode =
  | "OPENAI_API_KEY_MISSING"
  | "STT_TIMEOUT"
  | "STT_PROVIDER_FAILED"
  | "STT_EMPTY_TRANSCRIPT";

export class TranscriptionError extends Error {
  readonly code: TranscriptionErrorCode;

  constructor(
    code: TranscriptionErrorCode,
    message: string,
    options: { cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "TranscriptionError";
    this.code = code;
  }
}

export interface TranscriptionConfig {
  apiKey: string | null;
  model: string;
  timeoutMs: number;
}

export function loadTranscriptionConfig(
  environment: NodeJS.ProcessEnv = process.env,
): TranscriptionConfig {
  const timeoutRaw = environment.OPENAI_TIMEOUT_MS?.trim();
  const timeoutParsed = timeoutRaw ? Number(timeoutRaw) : NaN;

  return {
    apiKey: environment.OPENAI_API_KEY?.trim() || null,
    model: environment.OPENAI_TRANSCRIBE_MODEL?.trim() || "gpt-4o-mini-transcribe",
    timeoutMs:
      Number.isInteger(timeoutParsed) && timeoutParsed >= 1_000 && timeoutParsed <= 60_000
        ? timeoutParsed
        : 15_000,
  };
}

export type TranscriptionCall = (params: {
  file: File;
  model: string;
}) => Promise<{ text: string }>;

function classifyTranscriptionError(error: unknown): TranscriptionError {
  if (error instanceof TranscriptionError) return error;
  if (
    error instanceof OpenAI.APIConnectionTimeoutError ||
    error instanceof OpenAI.APIUserAbortError ||
    (error instanceof Error &&
      (error.name === "AbortError" || error.name === "APIConnectionTimeoutError"))
  ) {
    return new TranscriptionError("STT_TIMEOUT", "음성 변환 요청 시간이 초과되었습니다.", {
      cause: error,
    });
  }
  return new TranscriptionError("STT_PROVIDER_FAILED", "음성 변환 호출에 실패했습니다.", {
    cause: error,
  });
}

export interface TranscriptionResult {
  transcript: string;
  provider_used: "openai";
  model: string;
}

export async function transcribeAudioFile(
  file: File,
  config: TranscriptionConfig = loadTranscriptionConfig(),
  call?: TranscriptionCall,
): Promise<TranscriptionResult> {
  const apiKey = config.apiKey;
  if (!apiKey) {
    throw new TranscriptionError(
      "OPENAI_API_KEY_MISSING",
      "OPENAI_API_KEY가 설정되지 않아 음성 변환을 사용할 수 없습니다.",
    );
  }

  const doCall: TranscriptionCall =
    call ??
    (async ({ file: audioFile, model }) => {
      const client = new OpenAI({
        apiKey,
        timeout: config.timeoutMs,
        maxRetries: 0,
      });
      const result = await client.audio.transcriptions.create({
        file: audioFile,
        model,
      });
      return { text: typeof result.text === "string" ? result.text : "" };
    });

  let text: string;
  try {
    ({ text } = await doCall({ file, model: config.model }));
  } catch (error) {
    throw classifyTranscriptionError(error);
  }

  const transcript = text.trim();
  if (!transcript) {
    throw new TranscriptionError(
      "STT_EMPTY_TRANSCRIPT",
      "음성에서 텍스트를 인식하지 못했습니다.",
    );
  }

  return { transcript, provider_used: "openai", model: config.model };
}
