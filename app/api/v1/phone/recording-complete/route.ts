import { ZodError } from "zod";
import { IntakeProviderError } from "@/lib/ai/errors";
import { TranscriptionError } from "@/lib/ai/transcribe";
import {
  PhoneIntakeError,
  defaultPhoneRecordingIntakeDeps,
  processRecordingComplete,
} from "@/lib/phone/recordingIntake";
import { PhoneRecordingCompleteEventSchema } from "@/lib/phone/types";
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

export async function POST(request: Request) {
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
