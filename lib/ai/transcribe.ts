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

export type SttProviderName = "openai" | "team";

export interface TranscriptionConfig {
  provider: SttProviderName;
  apiKey: string | null;
  model: string;
  timeoutMs: number;
  teamBaseUrl: string;
  teamTimeoutMs: number;
}

function parseTimeout(raw: string | undefined, fallback: number, max: number) {
  const parsed = raw?.trim() ? Number(raw) : NaN;
  return Number.isInteger(parsed) && parsed >= 1_000 && parsed <= max
    ? parsed
    : fallback;
}

export function loadTranscriptionConfig(
  environment: NodeJS.ProcessEnv = process.env,
): TranscriptionConfig {
  const providerRaw = environment.STT_PROVIDER?.trim().toLowerCase();
  return {
    // 기본은 기존 OpenAI STT 유지 — STT_PROVIDER=team으로 팀 backend 전환,
    // STT_PROVIDER=openai로 언제든 rollback 가능하다.
    provider: providerRaw === "team" ? "team" : "openai",
    apiKey: environment.OPENAI_API_KEY?.trim() || null,
    model: environment.OPENAI_TRANSCRIBE_MODEL?.trim() || "gpt-4o-mini-transcribe",
    timeoutMs: parseTimeout(environment.OPENAI_TIMEOUT_MS, 15_000, 60_000),
    teamBaseUrl: (environment.TEAM_AI_BASE_URL?.trim() || "http://localhost:8000")
      .replace(/\/+$/, ""),
    // local faster-whisper는 첫 요청 warmup이 느릴 수 있어 별도 timeout.
    teamTimeoutMs: parseTimeout(environment.TEAM_AI_TIMEOUT_MS, 30_000, 120_000),
  };
}

export type TranscriptionCall = (params: {
  file: File;
  model: string;
}) => Promise<{ text: string; needs_review?: boolean }>;

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
  provider_used: SttProviderName;
  model: string;
  /** Team STT가 사람의 원문 검토를 요구할 때만 전달한다. */
  needs_review?: boolean;
}

// Team backend /api/stt (local faster-whisper) 호출. key가 필요 없다.
function teamTranscriptionCall(config: TranscriptionConfig): TranscriptionCall {
  return async ({ file: audioFile }) => {
    const form = new FormData();
    form.append("file", audioFile);
    let response: Response;
    try {
      response = await fetch(`${config.teamBaseUrl}/api/stt`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(config.teamTimeoutMs),
      });
    } catch (error) {
      throw classifyTranscriptionError(error);
    }
    if (!response.ok) {
      throw new TranscriptionError(
        "STT_PROVIDER_FAILED",
        "Team 음성 변환 호출에 실패했습니다.",
      );
    }
    const payload = (await response.json()) as {
      text?: unknown;
      needs_review?: unknown;
    };
    return {
      text: typeof payload.text === "string" ? payload.text : "",
      ...(typeof payload.needs_review === "boolean"
        ? { needs_review: payload.needs_review }
        : {}),
    };
  };
}

export async function transcribeAudioFile(
  file: File,
  config: TranscriptionConfig = loadTranscriptionConfig(),
  call?: TranscriptionCall,
): Promise<TranscriptionResult> {
  if (config.provider === "team") {
    const doTeamCall = call ?? teamTranscriptionCall(config);
    let teamResult: Awaited<ReturnType<TranscriptionCall>>;
    try {
      teamResult = await doTeamCall({ file, model: "faster-whisper" });
    } catch (error) {
      throw classifyTranscriptionError(error);
    }
    const teamTranscript = teamResult.text.trim();
    if (!teamTranscript) {
      throw new TranscriptionError(
        "STT_EMPTY_TRANSCRIPT",
        "음성에서 텍스트를 인식하지 못했습니다.",
      );
    }
    return {
      transcript: teamTranscript,
      provider_used: "team",
      model: "faster-whisper",
      ...(typeof teamResult.needs_review === "boolean"
        ? { needs_review: teamResult.needs_review }
        : {}),
    };
  }

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
