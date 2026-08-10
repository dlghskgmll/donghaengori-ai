import type { IntakeProviderContext } from "./provider";
import type { Visit } from "../domain/visit";

export const TRANSCRIPT_EVIDENCE_REF = "transcript:original";

export interface EvidenceRecord {
  id: string;
  kind: "TRANSCRIPT" | "DATE" | "TIME" | "PERSON" | "CARE" | "VISIT" | "SAFETY";
}

export type EvidenceCatalogue = Map<string, EvidenceRecord>;

export function selectRecentVisits(
  context: IntakeProviderContext,
  limit = 10,
): Visit[] {
  return context.people
    .flatMap((item) => item.visits)
    .sort((a, b) => b.visited_at.localeCompare(a.visited_at))
    .slice(0, limit);
}

export function buildEvidenceCatalogue(
  context: IntakeProviderContext,
): EvidenceCatalogue {
  const records: EvidenceRecord[] = [
    { id: TRANSCRIPT_EVIDENCE_REF, kind: "TRANSCRIPT" },
  ];
  const { deterministic } = context;

  if (deterministic.explicitDate.evidenceRef) {
    records.push({ id: deterministic.explicitDate.evidenceRef, kind: "DATE" });
  }
  if (deterministic.explicitTime.evidenceRef) {
    records.push({ id: deterministic.explicitTime.evidenceRef, kind: "TIME" });
  }

  for (const item of context.people) {
    records.push({ id: `person:${item.person.person_id}`, kind: "PERSON" });
    if (item.careProfile) {
      records.push({
        id: `care:${item.person.person_id}:mobility`,
        kind: "CARE",
      });
    }
  }

  for (const visit of selectRecentVisits(context)) {
    records.push({ id: `visit:${visit.visit_id}`, kind: "VISIT" });
  }

  for (const signal of deterministic.safetySignals) {
    records.push({ id: `safety:${signal}`, kind: "SAFETY" });
  }

  return new Map(records.map((record) => [record.id, record]));
}

export function validateEvidenceRefs(
  refs: string[],
  catalogue: EvidenceCatalogue,
) {
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const ref of refs) {
    if (catalogue.has(ref)) valid.push(ref);
    else invalid.push(ref);
  }

  return { valid: [...new Set(valid)], invalid: [...new Set(invalid)] };
}
