import type { IntakeProviderContext } from "./provider";
import { selectRecentVisits, type EvidenceCatalogue } from "./evidence";

function coarseRegion(address: string) {
  return address.split(/\s+/).slice(0, 2).join(" ");
}

function redactSensitiveTranscript(
  transcript: string,
  context: IntakeProviderContext,
) {
  let redacted = transcript
    .replace(
      /(?:01[016789]|0\d{1,2})[-.\s]?\d{3,4}[-.\s]?\d{4}/g,
      "[전화번호 제거]",
    )
    .replace(/\b\d{6}-?[1-4]\d{6}\b/g, "[주민번호 제거]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[이메일 제거]")
    .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, "[비밀값 제거]");

  for (const item of context.people) {
    const fullAddress = item.person.address.trim();
    if (fullAddress) {
      redacted = redacted.replaceAll(fullAddress, coarseRegion(fullAddress));
    }
  }

  return redacted;
}

function matchReason(item: IntakeProviderContext["people"][number]) {
  if (item.matchedByPhone && item.matchedByName) {
    return "등록 발신번호와 원문 이름 언급이 모두 일치";
  }
  if (item.matchedByPhone) return "등록 발신번호와 일치";
  return "원문 이름 언급과 일치";
}

export function buildMinimizedOpenAIInput(
  context: IntakeProviderContext,
  catalogue: EvidenceCatalogue,
) {
  const recentVisits = selectRecentVisits(context).map((visit) => ({
      visit_id: visit.visit_id,
      person_id: visit.person_id,
      visited_at: visit.visited_at,
      hospital_name: visit.hospital_name,
      department: visit.department,
      purpose: visit.reason,
  }));

  return {
    reference_time: context.receivedAt,
    reference_date: context.input.reference_date,
    transcript: {
      id: "transcript:original",
      text: redactSensitiveTranscript(context.input.transcript, context),
    },
    deterministic_facts: {
      explicit_date: {
        value: context.deterministic.explicitDate.value,
        source_text: context.deterministic.explicitDate.sourceText,
        evidence_ref: context.deterministic.explicitDate.evidenceRef,
        uncertain: context.deterministic.explicitDate.uncertain,
      },
      explicit_time: {
        value: context.deterministic.explicitTime.value,
        source_text: context.deterministic.explicitTime.sourceText,
        evidence_ref: context.deterministic.explicitTime.evidenceRef,
      },
      safety_signals: context.deterministic.safetySignals,
    },
    person_candidates: context.people.map((item) => ({
      person_id: item.person.person_id,
      display_name: item.person.name,
      region: coarseRegion(item.person.address),
      match_reason: matchReason(item),
    })),
    care_context: context.people.map((item) => ({
      person_id: item.person.person_id,
      mobility_notes: item.careProfile?.mobility_notes ?? [],
      preferences: item.careProfile?.preferences ?? [],
    })),
    recent_visits: recentVisits,
    allowed_evidence_refs: [...catalogue.keys()],
  };
}
