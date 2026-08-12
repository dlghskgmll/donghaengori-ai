import { ZodError } from "zod";
import { IntakeProviderError } from "@/lib/ai/errors";
import { TranscriptionError } from "@/lib/ai/transcribe";
import { runAfterResponse } from "@/lib/phone/backgroundTask";
import {
  CLAWOPS_MESSAGES,
  buildClawOpsSayHangupVoiceML,
  clawOpsXmlResponse,
  isClawOpsEnabled,
  normalizeCallerPhone,
  readClawOpsWebhook,
  resolveCallerLookupPhone,
} from "@/lib/phone/clawops";
import {
  PhoneIntakeError,
  defaultPhoneRecordingIntakeDeps,
  parseRecordingUrl,
  processRecordingComplete,
} from "@/lib/phone/recordingIntake";
import {
  PhoneRecordingCompleteEventSchema,
  RECORDING_COMPLETE_CALLBACK_PATH,
  type PhoneRecordingCompleteEvent,
} from "@/lib/phone/types";
import { readVerifiedWebhookBody } from "@/lib/phone/webhook";

function errorResponse(status: number, message: string) {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

const PHONE_INTAKE_ERROR_STATUS: Record<PhoneIntakeError["code"], number> = {
  RECORDING_URL_INVALID: 400,
  RECORDING_EMPTY: 400,
  RECORDING_TOO_LARGE: 413,
  RECORDING_UNSUPPORTED_TYPE: 415,
  RECORDING_DOWNLOAD_FAILED: 502,
};

function classifyIntakeFailureCode(error: unknown): string {
  if (
    error instanceof PhoneIntakeError ||
    error instanceof TranscriptionError ||
    error instanceof IntakeProviderError
  ) {
    return error.code;
  }
  if (error instanceof ZodError) return "PHONE_INTAKE_INPUT_INVALID";
  return "PHONE_INTAKE_UNKNOWN";
}

// 전화 제어 경로(FAST)와 AI 처리 경로(BACKGROUND)를 분리한다.
// 실전화 E2E에서 동기 download→STT→Analyze(~17초)가 ClawOps <Record action>
// callback timeout을 초과해 통화가 오류로 끊겼다("The operation was aborted
// due to timeout"). ClawOps에는 서명/parse/저비용 검증 후 즉시 VoiceML을
// 반환하고, AI 파이프라인은 응답 이후 after()로 이어서 실행한다.
async function handleClawOpsRecordingComplete(request: Request) {
  const read = await readClawOpsWebhook(
    request,
    RECORDING_COMPLETE_CALLBACK_PATH,
  );
  if (!read.ok) return read.response;

  const callId = read.params.CallId?.trim();
  const recordingUrl = read.params.RecordingUrl?.trim();
  const duration = Number(read.params.RecordingDuration?.trim());
  if (!callId || !recordingUrl || !Number.isInteger(duration) || duration < 0) {
    return errorResponse(400, "webhook payload가 올바르지 않습니다.");
  }

  // 무발화 녹음은 background AI를 시작하지 않고 바로 안내 후 종료한다.
  if (duration === 0) {
    return clawOpsXmlResponse(
      buildClawOpsSayHangupVoiceML(CLAWOPS_MESSAGES.noSpeech),
    );
  }

  // recording URL 안전성은 저비용 동기 검증이므로 schedule 전에 확인한다.
  try {
    parseRecordingUrl(recordingUrl);
  } catch (error) {
    console.error("phone recording intake failed", {
      call_id: callId,
      code: classifyIntakeFailureCode(error),
    });
    return clawOpsXmlResponse(
      buildClawOpsSayHangupVoiceML(CLAWOPS_MESSAGES.failure),
    );
  }

  const callerPhone = await resolveCallerLookupPhone(
    normalizeCallerPhone(read.params.From ?? ""),
  );

  let event: PhoneRecordingCompleteEvent;
  try {
    event = PhoneRecordingCompleteEventSchema.parse({
      call_id: callId,
      recording_url: recordingUrl,
      duration_seconds: duration,
      caller_phone: callerPhone,
    });
  } catch {
    return errorResponse(400, "webhook payload가 올바르지 않습니다.");
  }

  // 응답 이후 기존 파이프라인을 그대로 실행한다. idempotency claim은
  // processRecordingComplete 내부에 있으므로 중복 callback이 여러 개
  // schedule되어도 분석은 1회만 실행된다.
  runAfterResponse(async () => {
    try {
      const outcome = await processRecordingComplete(
        event,
        defaultPhoneRecordingIntakeDeps(),
      );
      console.info("phone recording intake completed", {
        call_id: callId,
        duplicate: outcome.duplicate,
      });
    } catch (error) {
      // background 실패는 이미 반환된 통화 응답에 영향을 주지 않는다.
      console.error("phone recording intake failed", {
        call_id: callId,
        code: classifyIntakeFailureCode(error),
      });
    }
  });

  // 접수 확정·분석 성공을 의미하지 않는 안내이며, 최종 판단은 사람이 한다.
  return clawOpsXmlResponse(
    buildClawOpsSayHangupVoiceML(CLAWOPS_MESSAGES.accepted),
  );
}

export async function POST(request: Request) {
  if (isClawOpsEnabled()) {
    return handleClawOpsRecordingComplete(request);
  }

  const verified = await readVerifiedWebhookBody(request);
  if (!verified.ok) {
    return errorResponse(verified.status, verified.message);
  }

  let event;
  try {
    event = PhoneRecordingCompleteEventSchema.parse(JSON.parse(verified.rawBody));
  } catch {
    return errorResponse(400, "webhook payload가 올바르지 않습니다.");
  }

  try {
    const outcome = await processRecordingComplete(
      event,
      defaultPhoneRecordingIntakeDeps(),
    );

    if (outcome.duplicate) {
      // provider의 webhook 재전송은 성공으로 응답해 재시도 루프를 끊는다.
      return Response.json(
        { call_id: event.call_id, duplicate: true },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }

    // 원문 transcript는 응답에 담지 않는다. 전화 provider가 webhook 응답 body를
    // 로그·대시보드에 보관하면 고령 발화자의 건강 관련 원문이 앱 외부에 남는다.
    // provider는 콜백 확인에 transcript가 필요하지 않다.
    return Response.json(
      {
        call_id: event.call_id,
        duplicate: false,
        intake_id: outcome.result.intake_id,
        status: outcome.result.status,
        human_review_required: outcome.result.analysis.human_review_required,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const code =
      error instanceof PhoneIntakeError ||
      error instanceof TranscriptionError ||
      error instanceof IntakeProviderError
        ? error.code
        : error instanceof ZodError
          ? "PHONE_INTAKE_INPUT_INVALID"
          : "PHONE_INTAKE_UNKNOWN";
    console.error("phone recording intake failed", {
      call_id: event.call_id,
      code,
    });

    if (error instanceof PhoneIntakeError) {
      return errorResponse(PHONE_INTAKE_ERROR_STATUS[error.code], error.message);
    }
    if (error instanceof TranscriptionError) {
      if (error.code === "OPENAI_API_KEY_MISSING") {
        return errorResponse(503, "음성 변환 기능을 사용할 수 없습니다.");
      }
      if (error.code === "STT_EMPTY_TRANSCRIPT") {
        return errorResponse(422, "음성에서 접수 내용을 인식하지 못했습니다.");
      }
      return errorResponse(502, "음성 변환에 실패했습니다.");
    }
    if (error instanceof ZodError) {
      return errorResponse(422, "분석 입력이 올바르지 않습니다.");
    }
    if (error instanceof IntakeProviderError) {
      return errorResponse(503, "접수 분석에 실패했습니다.");
    }
    return errorResponse(500, "접수 처리 중 오류가 발생했습니다.");
  }
}
