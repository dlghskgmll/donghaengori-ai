import { z } from "zod";

// client 번들에서도 import되므로 이 파일에는 zod 외 의존성을 두지 않는다.
export const TranscriptionApiResponseSchema = z.object({
  transcript: z.string().min(1),
  provider_used: z.literal("openai"),
  model: z.string(),
  latency_ms: z.number().int().nonnegative(),
});

export type TranscriptionApiResponse = z.infer<
  typeof TranscriptionApiResponseSchema
>;
