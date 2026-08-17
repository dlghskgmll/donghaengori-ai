import {
  TranscriptionError,
  transcribeAudioFile,
} from "@/lib/ai/transcribe";
import { TranscriptionApiResponseSchema } from "@/lib/ai/transcriptionSchema";

const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

const ALLOWED_AUDIO_TYPES = [
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/m4a",
  "audio/x-m4a",
  "audio/aac",
  "audio/flac",
];

function isAllowedAudioType(mimeType: string) {
  const baseType = mimeType.split(";")[0].trim().toLowerCase();
  return ALLOWED_AUDIO_TYPES.includes(baseType);
}

function errorResponse(status: number, message: string) {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  let audio: File;
  try {
    const form = await request.formData();
    const candidate = form.get("audio");
    if (!(candidate instanceof File)) {
      return errorResponse(400, "audio 파일이 필요합니다.");
    }
    audio = candidate;
  } catch {
    return errorResponse(400, "multipart/form-data 형식의 요청이어야 합니다.");
  }

  if (audio.size === 0) {
    return errorResponse(400, "빈 오디오 파일은 변환할 수 없습니다. 다시 녹음해 주세요.");
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return errorResponse(413, "오디오 파일이 너무 큽니다. 짧게 나누어 녹음해 주세요.");
  }
  if (!isAllowedAudioType(audio.type)) {
    return errorResponse(415, "지원하지 않는 오디오 형식입니다.");
  }

  const startedAt = Date.now();
  try {
    const result = await transcribeAudioFile(audio);
    if (!result.transcript.trim()) {
      throw new TranscriptionError(
        "STT_EMPTY_TRANSCRIPT",
        "음성에서 텍스트를 인식하지 못했습니다.",
      );
    }
    const responseBody = TranscriptionApiResponseSchema.parse({
      transcript: result.transcript,
      provider_used: result.provider_used,
      model: result.model,
      latency_ms: Date.now() - startedAt,
      needs_review: result.needs_review ?? null,
    });

    return Response.json(responseBody, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const code =
      error instanceof TranscriptionError ? error.code : "STT_UNKNOWN";
    console.error("stt transcription failed", { code });

    if (code === "OPENAI_API_KEY_MISSING") {
      return errorResponse(
        503,
        "음성 변환 기능을 사용할 수 없습니다. 내용을 직접 입력해 주세요.",
      );
    }
    if (code === "STT_EMPTY_TRANSCRIPT") {
      return errorResponse(
        422,
        "음성을 인식하지 못했습니다. 다시 녹음하거나 직접 입력해 주세요.",
      );
    }
    return errorResponse(
      502,
      "음성 변환에 실패했습니다. 다시 시도하거나 직접 입력해 주세요.",
    );
  }
}
