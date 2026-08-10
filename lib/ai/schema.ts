import { z } from "zod";

export const EvidenceStatusSchema = z.enum([
  "CONFIRMED_BY_INPUT",
  "INFERRED",
  "NEEDS_CONFIRMATION",
]);

const ConfidenceSchema = z.number().min(0).max(1);
const EvidenceSchema = z.array(z.string().min(1));

export const IntakeAnalysisSchema = z.object({
  schema_version: z.literal("1.0"),
  request_type: z.object({
    value: z.enum([
      "HOSPITAL_COMPANION",
      "PHARMACY",
      "GUARDIAN_CONTACT",
      "UNKNOWN",
    ]),
    confidence: ConfidenceSchema,
  }),
  caller: z.object({
    person_candidates: z.array(
      z.object({
        person_id: z.string().min(1),
        name: z.string().min(1),
        confidence: ConfidenceSchema,
        evidence: EvidenceSchema,
      }),
    ),
    identity_status: z.enum(["CANDIDATE", "UNKNOWN"]),
  }),
  appointment: z.object({
    date: z.object({
      value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
      status: EvidenceStatusSchema,
      confidence: ConfidenceSchema,
      evidence: EvidenceSchema,
    }),
    time: z.object({
      value: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
      status: EvidenceStatusSchema,
      confidence: ConfidenceSchema,
      evidence: EvidenceSchema,
    }),
  }),
  hospital: z.object({
    candidates: z.array(
      z.object({
        name: z.string().min(1),
        status: EvidenceStatusSchema,
        confidence: ConfidenceSchema,
        evidence: EvidenceSchema,
      }),
    ),
  }),
  department: z.object({
    value: z.string().nullable(),
    status: EvidenceStatusSchema,
    confidence: ConfidenceSchema,
    evidence: EvidenceSchema,
  }),
  additional_requests: z.array(z.string()),
  proxy_request: z
    .object({
      detected: z.boolean(),
      relationship: z.string().nullable(),
    })
    .optional(),
  care_context: z.object({
    mobility_notes: z.array(z.string()),
  }),
  confirmation_questions: z.array(z.string()),
  safety: z.object({
    signal_detected: z.boolean(),
    signal_type: z.string().nullable(),
    medical_judgement: z.literal(false),
    human_escalation_required: z.boolean(),
  }),
  summary: z.string().min(1),
  human_review_required: z.literal(true),
});

export const AnalyzeIntakeInputSchema = z.object({
  caller_phone: z.string().trim().max(30).optional().default(""),
  transcript: z.string().trim().min(1, "원문 발화를 입력해 주세요.").max(4000),
  reference_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const IntakeProviderModeSchema = z.enum(["mock", "openai", "auto"]);
export const IntakeProviderNameSchema = z.enum(["mock", "openai"]);

export const IntakeResponseMetaSchema = z.object({
  requested_provider: IntakeProviderModeSchema,
  provider_used: IntakeProviderNameSchema,
  model: z.string().min(1).nullable(),
  fallback_used: z.boolean(),
  provider_latency_ms: z.number().finite().min(0),
  total_latency_ms: z.number().finite().min(0),
  warnings: z.array(z.string().min(1)),
});

export const AnalyzeIntakeResponseSchema = z.object({
  intake_id: z.string().min(1),
  status: z.literal("DRAFT_AI"),
  analysis: IntakeAnalysisSchema,
  meta: IntakeResponseMetaSchema,
});

export const AnalyzeIntakeApiResponseSchema = IntakeAnalysisSchema.extend({
  intake_id: z.string().min(1).optional(),
  status: z.literal("DRAFT_AI").optional(),
  meta: IntakeResponseMetaSchema.optional(),
});

export type IntakeAnalysis = z.infer<typeof IntakeAnalysisSchema>;
export type AnalyzeIntakeInput = z.infer<typeof AnalyzeIntakeInputSchema>;
export type IntakeProviderMode = z.infer<typeof IntakeProviderModeSchema>;
export type IntakeProviderName = z.infer<typeof IntakeProviderNameSchema>;
export type IntakeResponseMeta = z.infer<typeof IntakeResponseMetaSchema>;
export type AnalyzeIntakeResponse = z.infer<typeof AnalyzeIntakeResponseSchema>;
export type AnalyzeIntakeApiResponse = z.infer<
  typeof AnalyzeIntakeApiResponseSchema
>;
