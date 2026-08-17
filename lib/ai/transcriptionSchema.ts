import { z } from "zod";

// client 번들에서도 import되므로 이 파일에는 zod 외 의존성을 두지 않는다.
export const TranscriptionApiResponseSchema = z.object({
  transcript: z.string().min(1),
  provider_used: z.enum(["openai", "team"]),
  model: z.string(),
  latency_ms: z.number().int().nonnegative(),
  /** provider가 판단 근거를 주지 않으면 추측하지 않고 null로 둔다. */
  needs_review: z.boolean().nullable(),
});

export type TranscriptionApiResponse = z.infer<
  typeof TranscriptionApiResponseSchema
>;
