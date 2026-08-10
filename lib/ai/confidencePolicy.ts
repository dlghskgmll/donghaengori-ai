import type { Visit } from "../domain/visit";
import type { LlmEvidenceSource } from "./llmSchema";

export const CONFIDENCE_POLICY = {
  DIRECT_EXACT: 0.99,
  DIRECT_NORMALIZED: 0.96,
  HISTORY_STRONG: 0.88,
  HISTORY_SINGLE: 0.72,
  COMBINED_PARTIAL: 0.6,
  UNKNOWN: 0,
} as const;

const normalize = (value: string) =>
  value.normalize("NFKC").replace(/[\s.,!?"'“”‘’·()\-]/g, "").toLowerCase();

export function directTextConfidence(value: string, transcript: string) {
  if (transcript.includes(value)) return CONFIDENCE_POLICY.DIRECT_EXACT;
  if (normalize(transcript).includes(normalize(value))) {
    return CONFIDENCE_POLICY.DIRECT_NORMALIZED;
  }
  return CONFIDENCE_POLICY.UNKNOWN;
}

export function historyConfidence(visits: Visit[], selected: Visit) {
  const matchingVisits = visits.filter(
    (visit) =>
      visit.person_id === selected.person_id &&
      visit.hospital_name === selected.hospital_name &&
      visit.department === selected.department,
  );
  return matchingVisits.length >= 2
    ? CONFIDENCE_POLICY.HISTORY_STRONG
    : CONFIDENCE_POLICY.HISTORY_SINGLE;
}

export function sourceConfidence(
  source: LlmEvidenceSource,
  options: { directValue?: string; transcript?: string; visits?: Visit[]; visit?: Visit } = {},
) {
  if (source === "DIRECT_INPUT" && options.directValue && options.transcript) {
    return directTextConfidence(options.directValue, options.transcript);
  }
  if (source === "CARE_HISTORY" && options.visits && options.visit) {
    return historyConfidence(options.visits, options.visit);
  }
  if (source === "COMBINED") return CONFIDENCE_POLICY.COMBINED_PARTIAL;
  return CONFIDENCE_POLICY.UNKNOWN;
}
