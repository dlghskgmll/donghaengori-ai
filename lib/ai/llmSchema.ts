import { z } from "zod";

export const LlmEvidenceSourceSchema = z.enum([
  "DIRECT_INPUT",
  "CARE_HISTORY",
  "COMBINED",
  "UNKNOWN",
]);

const EvidenceRefsSchema = z.array(z.string());

export const LlmIntakeAnalysisSchema = z
  .object({
    request_type: z
      .object({
        value: z.enum([
          "HOSPITAL_COMPANION",
          "PHARMACY",
          "GUARDIAN_CONTACT",
          "UNKNOWN",
        ]),
        source: LlmEvidenceSourceSchema,
        evidence_refs: EvidenceRefsSchema,
      })
      .strict(),
    hospital: z
      .object({
        name: z.string().nullable(),
        source: LlmEvidenceSourceSchema,
        matched_visit_id: z.string().nullable(),
        evidence_refs: EvidenceRefsSchema,
      })
      .strict(),
    department: z
      .object({
        value: z.string().nullable(),
        source: LlmEvidenceSourceSchema,
        evidence_refs: EvidenceRefsSchema,
      })
      .strict(),
    additional_requests: z.array(
      z
        .object({
          type: z.enum(["PHARMACY", "GUARDIAN_CONTACT", "OTHER"]),
          description: z.string(),
          source: z.enum(["DIRECT_INPUT", "COMBINED"]),
          evidence_refs: EvidenceRefsSchema,
        })
        .strict(),
    ),
    proxy_request: z
      .object({
        detected: z.boolean(),
        relationship: z.string().nullable(),
        evidence_refs: EvidenceRefsSchema,
      })
      .strict(),
    confirmation_needs: z.array(
      z
        .object({
          field: z.enum([
            "IDENTITY",
            "DATE",
            "TIME",
            "HOSPITAL",
            "DEPARTMENT",
            "OTHER",
          ]),
          reason: z.string(),
        })
        .strict(),
    ),
    confirmation_questions: z.array(z.string()),
    safety: z
      .object({
        signal_detected: z.boolean(),
        signal_type: z.enum([
          "BREATHING_DIFFICULTY",
          "CHEST_PAIN",
          "FALL",
          "BLEEDING",
          "LOSS_OF_CONSCIOUSNESS",
          "SELF_HARM",
          "ABUSE_SUSPECTED",
          "OTHER",
          "NONE",
        ]),
        human_escalation_required: z.boolean(),
      })
      .strict(),
    summary: z.string(),
  })
  .strict();

export type LlmEvidenceSource = z.infer<typeof LlmEvidenceSourceSchema>;
export type LlmIntakeAnalysis = z.infer<typeof LlmIntakeAnalysisSchema>;
