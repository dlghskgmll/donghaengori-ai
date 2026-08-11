import { z } from "zod";

// 전화 provider가 확정되지 않았으므로 여기의 모든 타입은 provider 중립이다.
// provider-specific payload(TwiML 등) 변환이 필요해지면 얇은 adapter 파일 하나로 격리한다.

export const PHONE_GREETING_DEFAULT =
  "안녕하세요. 동행고리 병원동행 접수입니다. 병원에 가실 내용을 편하게 말씀해 주세요.";

// 브라우저 음성 입력(Phase 3B)과 동일한 데모 기준 최대 녹음 시간.
export const PHONE_MAX_RECORDING_SECONDS = 30;

export const RECORDING_COMPLETE_CALLBACK_PATH =
  "/api/v1/phone/recording-complete";

export const PhoneRecordCommandSchema = z.object({
  action: z.literal("record"),
  language: z.literal("ko-KR"),
  greeting: z.string().min(1),
  max_duration_seconds: z.number().int().positive(),
  callback_path: z.string().min(1),
});

export type PhoneRecordCommand = z.infer<typeof PhoneRecordCommandSchema>;

export function buildRecordCommand(): PhoneRecordCommand {
  return {
    action: "record",
    language: "ko-KR",
    greeting: PHONE_GREETING_DEFAULT,
    max_duration_seconds: PHONE_MAX_RECORDING_SECONDS,
    callback_path: RECORDING_COMPLETE_CALLBACK_PATH,
  };
}

const CallIdSchema = z.string().trim().min(1).max(120);

export const PhoneIncomingEventSchema = z.object({
  call_id: CallIdSchema,
  caller_phone: z.string().trim().max(30).optional().default(""),
});

export type PhoneIncomingEvent = z.infer<typeof PhoneIncomingEventSchema>;

export const PhoneRecordingCompleteEventSchema = z.object({
  call_id: CallIdSchema,
  recording_url: z.string().trim().min(1).max(2000),
  duration_seconds: z.number().int().min(0).max(3600),
  caller_phone: z.string().trim().max(30).optional().default(""),
});

export type PhoneRecordingCompleteEvent = z.infer<
  typeof PhoneRecordingCompleteEventSchema
>;

export const PhoneCallStatusSchema = z.enum([
  "ringing",
  "answered",
  "completed",
  "busy",
  "failed",
]);

export type PhoneCallStatus = z.infer<typeof PhoneCallStatusSchema>;

export const PhoneStatusEventSchema = z.object({
  call_id: CallIdSchema,
  status: PhoneCallStatusSchema,
});

export type PhoneStatusEvent = z.infer<typeof PhoneStatusEventSchema>;
