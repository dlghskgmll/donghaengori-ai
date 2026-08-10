export type EvidenceStatus =
  | "CONFIRMED_BY_INPUT"
  | "INFERRED"
  | "NEEDS_CONFIRMATION";

export type IntakeStatus = "DRAFT_AI" | "CONFIRMED";

export type RequestType =
  | "HOSPITAL_COMPANION"
  | "PHARMACY"
  | "GUARDIAN_CONTACT"
  | "UNKNOWN";
