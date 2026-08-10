import type { EvidenceStatus } from "../domain/intake";
import type { Visit } from "../domain/visit";
import {
  CONFIDENCE_POLICY,
  directTextConfidence,
  historyConfidence,
} from "./confidencePolicy";
import {
  TRANSCRIPT_EVIDENCE_REF,
  type EvidenceCatalogue,
  validateEvidenceRefs,
} from "./evidence";
import { IntakeProviderError } from "./errors";
import type { LlmEvidenceSource, LlmIntakeAnalysis } from "./llmSchema";
import type { IntakeProviderContext, ProviderAnalysisResult } from "./provider";
import { IntakeAnalysisSchema, type IntakeAnalysis } from "./schema";

const SAFETY_LABELS: Record<string, string> = {
  BREATHING_DIFFICULTY: "호흡 곤란 표현",
  CHEST_PAIN: "흉부 통증 표현",
  FALL: "낙상 또는 쓰러짐 표현",
  BLEEDING: "심한 출혈 표현",
  LOSS_OF_CONSCIOUSNESS: "의식 저하 표현",
  SELF_HARM: "자해 위험 표현",
  ABUSE_SUSPECTED: "학대 의심 표현",
  OTHER: "기타 위험 표현",
};

const FACILITY_SUFFIX_PATTERN =
  /(?:대학교병원|종합병원|재활의학과|이비인후과|정형외과|신경외과|산부인과|의료원|보건소|클리닉|피부과|병원|의원|센터|안과|내과|외과)$/;
const GENERIC_FACILITY_NAMES = new Set([
  "병원",
  "의원",
  "의료원",
  "보건소",
  "클리닉",
  "센터",
  "안과",
  "내과",
  "외과",
  "피부과",
  "정형외과",
  "저번병원",
  "지난번병원",
  "그병원",
  "예전병원",
  "전에갔던병원",
]);

function statusForSource(source: LlmEvidenceSource): EvidenceStatus {
  if (source === "DIRECT_INPUT") return "CONFIRMED_BY_INPUT";
  if (source === "CARE_HISTORY" || source === "COMBINED") return "INFERRED";
  return "NEEDS_CONFIRMATION";
}

function allVisits(context: IntakeProviderContext) {
  return context.people.flatMap((item) => item.visits);
}

function visitFromEvidence(refs: string[], visits: Visit[]) {
  const visitIds = new Set(
    refs
      .filter((ref) => ref.startsWith("visit:"))
      .map((ref) => ref.slice("visit:".length)),
  );
  return visits.find((visit) => visitIds.has(visit.visit_id)) ?? null;
}

function visitEvidence(visits: Visit[], selected: Visit) {
  const matching = visits.filter(
    (visit) =>
      visit.person_id === selected.person_id &&
      visit.hospital_name === selected.hospital_name &&
      visit.department === selected.department,
  );
  const evidence = [
    `과거 동행 이력: ${selected.hospital_name} ${selected.department} ${matching.length}회 방문`,
  ];
  if (selected.reason) evidence.push(`최근 방문 사유: ${selected.reason}`);
  return evidence;
}

function isSpecificFacilityName(name: string) {
  const normalized = name.replace(/\s+/g, "");
  return (
    FACILITY_SUFFIX_PATTERN.test(normalized) &&
    !GENERIC_FACILITY_NAMES.has(normalized) &&
    !/^(?:저번|지난번|예전|그|전에갔던|눈봤던|무릎봐준)/.test(normalized)
  );
}

function unique(values: string[]) {
  return [...new Set(values)];
}

export function assembleOpenAIAnalysis(
  context: IntakeProviderContext,
  llm: LlmIntakeAnalysis,
  catalogue: EvidenceCatalogue,
): ProviderAnalysisResult {
  const transcript = context.input.transcript;
  const visits = allVisits(context);
  const warnings = new Set<string>();
  let invalidReferenceCount = 0;

  const requestAudit = validateEvidenceRefs(
    llm.request_type.evidence_refs,
    catalogue,
  );
  const hospitalAudit = validateEvidenceRefs(
    llm.hospital.evidence_refs,
    catalogue,
  );
  const departmentAudit = validateEvidenceRefs(
    llm.department.evidence_refs,
    catalogue,
  );
  for (const audit of [requestAudit, hospitalAudit, departmentAudit]) {
    if (audit.invalid.length > 0) {
      invalidReferenceCount += audit.invalid.length;
      warnings.add("EVIDENCE_REF_REMOVED");
    }
  }
  const requestRefs = requestAudit.valid;
  const hospitalRefs = hospitalAudit.valid;
  const departmentRefs = departmentAudit.valid;
  const additionalWithRefs = llm.additional_requests.map((request) => ({
    request,
    audit: validateEvidenceRefs(request.evidence_refs, catalogue),
  }));
  for (const item of additionalWithRefs) {
    if (item.audit.invalid.length > 0) {
      invalidReferenceCount += item.audit.invalid.length;
      warnings.add("EVIDENCE_REF_REMOVED");
    }
  }
  const proxyAudit = validateEvidenceRefs(
    llm.proxy_request.evidence_refs,
    catalogue,
  );
  if (proxyAudit.invalid.length > 0) {
    invalidReferenceCount += proxyAudit.invalid.length;
    warnings.add("EVIDENCE_REF_REMOVED");
  }
  const proxyRefs = proxyAudit.valid;

  const requestedVisitRef = llm.hospital.matched_visit_id
    ? `visit:${llm.hospital.matched_visit_id}`
    : null;
  const requestedVisit =
    llm.hospital.matched_visit_id &&
    requestedVisitRef &&
    catalogue.has(requestedVisitRef)
      ? visits.find((visit) => visit.visit_id === llm.hospital.matched_visit_id) ??
        null
      : null;
  if (llm.hospital.matched_visit_id && !requestedVisit) {
    throw new IntakeProviderError(
      "EVIDENCE_REF_VIOLATION",
      "모델이 제공되지 않은 방문 이력 ID를 사용했습니다.",
    );
  }

  let requestSource = llm.request_type.source;
  let requestVisit = visitFromEvidence(requestRefs, visits);
  const requestHasEvidence =
    (requestSource === "DIRECT_INPUT" &&
      requestRefs.includes(TRANSCRIPT_EVIDENCE_REF)) ||
    (requestSource === "CARE_HISTORY" && Boolean(requestVisit)) ||
    (requestSource === "COMBINED" &&
      requestRefs.includes(TRANSCRIPT_EVIDENCE_REF) &&
      Boolean(requestVisit)) ||
    requestSource === "UNKNOWN";
  if (!requestHasEvidence) {
    requestSource = "UNKNOWN";
    requestVisit = null;
    warnings.add("EVIDENCE_CLAIM_DOWNGRADED");
  }
  const requestTypeValue =
    requestSource === "UNKNOWN" ? "UNKNOWN" : llm.request_type.value;

  let hospitalCandidate: IntakeAnalysis["hospital"]["candidates"][number] | null =
    null;
  let hospitalVisit: Visit | null = null;
  if (
    llm.hospital.name &&
    isSpecificFacilityName(llm.hospital.name) &&
    llm.hospital.source === "DIRECT_INPUT"
  ) {
    const confidence = directTextConfidence(llm.hospital.name, transcript);
    if (
      hospitalRefs.includes(TRANSCRIPT_EVIDENCE_REF) &&
      confidence > CONFIDENCE_POLICY.UNKNOWN
    ) {
      hospitalCandidate = {
        name: llm.hospital.name,
        status: statusForSource(llm.hospital.source),
        confidence:
          hospitalAudit.invalid.length > 0
            ? Math.min(confidence, CONFIDENCE_POLICY.COMBINED_PARTIAL)
            : confidence,
        evidence: [`원문에서 “${llm.hospital.name}”을 직접 언급`],
      };
    }
  } else if (
    llm.hospital.name &&
    (llm.hospital.source === "CARE_HISTORY" ||
      llm.hospital.source === "COMBINED")
  ) {
    const selected = requestedVisit ?? visitFromEvidence(hospitalRefs, visits);
    const hasVisitRef = selected
      ? hospitalRefs.includes(`visit:${selected.visit_id}`)
      : false;
    const directEvidenceValid =
      llm.hospital.source !== "COMBINED" ||
      hospitalRefs.includes(TRANSCRIPT_EVIDENCE_REF);
    if (
      selected &&
      hasVisitRef &&
      directEvidenceValid &&
      selected.hospital_name === llm.hospital.name
    ) {
      hospitalVisit = selected;
      hospitalCandidate = {
        name: selected.hospital_name,
        status: statusForSource(llm.hospital.source),
        confidence: hospitalAudit.invalid.length > 0
          ? CONFIDENCE_POLICY.COMBINED_PARTIAL
          : llm.hospital.source === "COMBINED"
            ? CONFIDENCE_POLICY.COMBINED_PARTIAL
            : historyConfidence(visits, selected),
        evidence: visitEvidence(visits, selected),
      };
    }
  }
  if (llm.hospital.source !== "UNKNOWN" && !hospitalCandidate) {
    warnings.add("EVIDENCE_CLAIM_DOWNGRADED");
  }

  let department: IntakeAnalysis["department"] = {
    value: null,
    status: "NEEDS_CONFIRMATION",
    confidence: 0,
    evidence: ["원문과 과거 이력만으로 진료과를 확인할 수 없음"],
  };
  if (llm.department.value && llm.department.source === "DIRECT_INPUT") {
    const confidence = directTextConfidence(llm.department.value, transcript);
    if (
      departmentRefs.includes(TRANSCRIPT_EVIDENCE_REF) &&
      confidence > CONFIDENCE_POLICY.UNKNOWN
    ) {
      department = {
        value: llm.department.value,
        status: statusForSource(llm.department.source),
        confidence:
          departmentAudit.invalid.length > 0
            ? Math.min(confidence, CONFIDENCE_POLICY.COMBINED_PARTIAL)
            : confidence,
        evidence: [`원문에서 “${llm.department.value}”를 직접 언급`],
      };
    }
  } else if (
    llm.department.value &&
    (llm.department.source === "CARE_HISTORY" ||
      llm.department.source === "COMBINED")
  ) {
    const selected = hospitalVisit ?? visitFromEvidence(departmentRefs, visits);
    const hasVisitRef = selected
      ? departmentRefs.includes(`visit:${selected.visit_id}`)
      : false;
    const directEvidenceValid =
      llm.department.source !== "COMBINED" ||
      departmentRefs.includes(TRANSCRIPT_EVIDENCE_REF);
    if (
      selected &&
      hasVisitRef &&
      directEvidenceValid &&
      selected.department === llm.department.value
    ) {
      department = {
        value: selected.department,
        status: statusForSource(llm.department.source),
        confidence: departmentAudit.invalid.length > 0
          ? CONFIDENCE_POLICY.COMBINED_PARTIAL
          : llm.department.source === "COMBINED"
            ? CONFIDENCE_POLICY.COMBINED_PARTIAL
            : historyConfidence(visits, selected),
        evidence: visitEvidence(visits, selected),
      };
    }
  }
  if (llm.department.source !== "UNKNOWN" && department.value === null) {
    warnings.add("EVIDENCE_CLAIM_DOWNGRADED");
  }

  const personCandidates = context.people.map((item) => {
    const evidence: string[] = [];
    if (item.matchedByPhone) {
      evidence.push("입력한 발신번호가 가상 대상자 프로필과 일치");
    }
    if (item.matchedByName) {
      evidence.push(`원문에서 “${item.person.name}” 이름을 직접 언급`);
    }
    return {
      person_id: item.person.person_id,
      name: item.person.name,
      confidence:
        item.matchedByPhone && item.matchedByName
          ? 0.99
          : item.matchedByPhone
            ? 0.96
            : 0.87,
      evidence,
    };
  });

  const date: IntakeAnalysis["appointment"]["date"] =
    context.deterministic.explicitDate.value &&
    context.deterministic.explicitDate.sourceText
      ? {
          value: context.deterministic.explicitDate.value,
          status: "CONFIRMED_BY_INPUT",
          confidence: CONFIDENCE_POLICY.DIRECT_EXACT,
          evidence: unique([
            `사용자가 '${context.deterministic.explicitDate.sourceText}'이라고 직접 발화`,
            ...(context.deterministic.explicitDate.selfCorrected
              ? ["앞선 날짜 표현보다 마지막 발화를 최종 의도로 반영"]
              : []),
          ]),
        }
      : {
          value: null,
          status: "NEEDS_CONFIRMATION",
          confidence: 0,
          evidence: [
            context.deterministic.explicitDate.uncertain
              ? "원문에서 방문 날짜가 불확실하게 표현됨"
              : "원문에서 방문 날짜를 확인할 수 없음",
          ],
        };

  const time: IntakeAnalysis["appointment"]["time"] =
    context.deterministic.explicitTime.value &&
    context.deterministic.explicitTime.sourceText
      ? {
          value: context.deterministic.explicitTime.value,
          status: "CONFIRMED_BY_INPUT",
          confidence: CONFIDENCE_POLICY.DIRECT_EXACT,
          evidence: unique([
            `원문에서 “${context.deterministic.explicitTime.sourceText}”을 직접 말함`,
            ...(context.deterministic.explicitTime.selfCorrected
              ? ["앞선 시간 표현보다 마지막 발화를 최종 의도로 반영"]
              : []),
          ]),
        }
      : {
          value: null,
          status: "NEEDS_CONFIRMATION",
          confidence: 0,
          evidence: [
            context.deterministic.explicitTime.uncertain
              ? "원문에서 방문 시간이 불확실하게 표현됨"
              : "원문에서 방문 시간을 확인할 수 없음",
          ],
        };

  const additionalRequests = additionalWithRefs.flatMap(({ request, audit }) => {
    const refs = audit.valid;
    const hasEvidence = refs.includes(TRANSCRIPT_EVIDENCE_REF);
    if (!hasEvidence || audit.invalid.length > 0) {
      warnings.add("EVIDENCE_CLAIM_DOWNGRADED");
      return [];
    }
    if (request.type === "PHARMACY") return ["병원 방문 후 약국 동행 요청"];
    if (request.type === "GUARDIAN_CONTACT") return ["보호자 연락 요청"];
    return ["추가 요청 확인 필요"];
  });

  const proxyDetected =
    llm.proxy_request.detected &&
    proxyAudit.invalid.length === 0 &&
    proxyRefs.includes(TRANSCRIPT_EVIDENCE_REF);

  const confirmationQuestions: string[] = [];
  if (personCandidates.length === 0 || proxyDetected) {
    confirmationQuestions.push("동행 대상자의 성함과 연락처를 확인해 주세요.");
  }
  if (date.status === "NEEDS_CONFIRMATION") {
    confirmationQuestions.push("병원에 가실 날짜가 언제인가요?");
  }
  if (time.status === "NEEDS_CONFIRMATION") {
    confirmationQuestions.push("몇 시 진료 또는 출발을 원하시나요?");
  }
  if (!hospitalCandidate) {
    confirmationQuestions.push("어느 병원으로 가실 예정인가요?");
  }
  if (department.status === "NEEDS_CONFIRMATION") {
    confirmationQuestions.push("어느 진료과 방문인가요?");
  }
  const questionByNeed: Record<
    LlmIntakeAnalysis["confirmation_needs"][number]["field"],
    string
  > = {
    IDENTITY: "동행 대상자의 성함과 연락처를 확인해 주세요.",
    DATE: "병원에 가실 날짜가 언제인가요?",
    TIME: "몇 시 진료 또는 출발을 원하시나요?",
    HOSPITAL: "어느 병원으로 가실 예정인가요?",
    DEPARTMENT: "어느 진료과 방문인가요?",
    OTHER: "그 밖에 필요한 지원 사항이 있는지 확인해 주세요.",
  };
  for (const need of llm.confirmation_needs) {
    confirmationQuestions.push(questionByNeed[need.field]);
  }

  const deterministicSafety = context.deterministic.safetySignals;
  const llmSafetyDetected =
    llm.safety.signal_detected || llm.safety.human_escalation_required;
  const safetyDetected = deterministicSafety.length > 0 || llmSafetyDetected;
  const safetyTypes = unique([
    ...deterministicSafety,
    ...(llmSafetyDetected && llm.safety.signal_type !== "NONE"
      ? [llm.safety.signal_type]
      : []),
  ]);
  if (safetyDetected && safetyTypes.length === 0) {
    safetyTypes.push("OTHER");
  }
  if (safetyDetected) {
    confirmationQuestions.unshift(
      "위험 신호 표현이 감지되었습니다. 담당자가 현재 상태를 즉시 직접 확인해 주세요.",
    );
  }

  if (invalidReferenceCount >= 3) {
    throw new IntakeProviderError(
      "EVIDENCE_REF_VIOLATION",
      "허용되지 않은 evidence reference가 반복되었습니다.",
    );
  }

  const personLabel = personCandidates[0]?.name ?? "대상자 확인 필요";
  const hospitalLabel = hospitalCandidate?.name ?? "병원 확인 필요";
  const dateLabel = date.value ?? "날짜 확인 필요";
  const timeLabel = time.value ?? "시간 확인 필요";
  const fallbackSummary = `${personLabel}님의 ${dateLabel} ${timeLabel} ${hospitalLabel} 병원동행 요청 후보입니다.`;
  const summary = `${fallbackSummary} 사회복지사 확인 후 확정해 주세요.`;
  const baseRequestTypeConfidence =
    requestSource === "DIRECT_INPUT"
      ? CONFIDENCE_POLICY.DIRECT_EXACT
      : requestSource === "CARE_HISTORY" && requestVisit
        ? historyConfidence(visits, requestVisit)
        : requestSource === "COMBINED"
          ? CONFIDENCE_POLICY.COMBINED_PARTIAL
          : CONFIDENCE_POLICY.UNKNOWN;
  const requestTypeConfidence =
    requestAudit.invalid.length > 0
      ? Math.min(
          baseRequestTypeConfidence,
          CONFIDENCE_POLICY.COMBINED_PARTIAL,
        )
      : baseRequestTypeConfidence;

  const analysis: IntakeAnalysis = {
    schema_version: "1.0",
    request_type: {
      value: requestTypeValue,
      confidence: requestTypeConfidence,
    },
    caller: {
      person_candidates: personCandidates,
      identity_status: personCandidates.length > 0 ? "CANDIDATE" : "UNKNOWN",
    },
    appointment: { date, time },
    hospital: { candidates: hospitalCandidate ? [hospitalCandidate] : [] },
    department,
    additional_requests: unique(additionalRequests),
    proxy_request: {
      detected: proxyDetected,
      relationship:
        proxyDetected &&
        llm.proxy_request.relationship &&
        new Set([
          "자녀",
          "딸",
          "아들",
          "배우자",
          "남편",
          "아내",
          "보호자",
          "가족",
          "며느리",
          "사위",
          "손자",
          "손녀",
        ]).has(llm.proxy_request.relationship)
          ? llm.proxy_request.relationship
          : null,
    },
    care_context: {
      mobility_notes:
        context.people.length === 1
          ? (context.people[0]?.careProfile?.mobility_notes ?? [])
          : [],
    },
    confirmation_questions: unique(confirmationQuestions).slice(0, 10),
    safety: {
      signal_detected: safetyDetected,
      signal_type: safetyDetected
        ? safetyTypes.map((type) => SAFETY_LABELS[type] ?? "기타 위험 표현").join(", ")
        : null,
      medical_judgement: false,
      human_escalation_required: safetyDetected,
    },
    summary,
    human_review_required: true,
  };

  return {
    analysis: IntakeAnalysisSchema.parse(analysis),
    warnings: [...warnings],
  };
}
