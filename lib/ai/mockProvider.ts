import { parseRelativeDate } from "../date/parseRelativeDate";
import type { EvidenceStatus, RequestType } from "../domain/intake";
import type { Visit } from "../domain/visit";
import type { IntakeProviderContext } from "./provider";
import type { IntakeAnalysis } from "./schema";

const KNOWN_DEPARTMENTS = [
  "정형외과",
  "재활의학과",
  "신경외과",
  "산부인과",
  "이비인후과",
  "피부과",
  "안과",
  "내과",
  "외과",
];

const FACILITY_SUFFIXES = [
  "대학교병원",
  "종합병원",
  "재활의학과",
  "이비인후과",
  "정형외과",
  "신경외과",
  "산부인과",
  "의료원",
  "보건소",
  "클리닉",
  "피부과",
  "병원",
  "의원",
  "센터",
  "안과",
  "내과",
  "외과",
];

const FACILITY_NAME_PATTERN = new RegExp(
  `[가-힣A-Za-z0-9·]+(?:${FACILITY_SUFFIXES.join("|")})`,
  "g",
);

const GENERIC_FACILITY_REFERENCES = new Set([
  "저번병원",
  "지난번병원",
  "그병원",
  "예전병원",
  "전에갔던병원",
  "저번에갔던병원",
]);

const PRIOR_VISIT_PHRASES = [
  "저번",
  "전에",
  "보던 데",
  "봐준 데",
  "갔던 데",
  "그 병원",
];

function detectRequestType(transcript: string): {
  value: RequestType;
  confidence: number;
} {
  if (transcript.includes("약국")) {
    return { value: "PHARMACY", confidence: 0.94 };
  }
  if (transcript.includes("보호자") && transcript.includes("연락")) {
    return { value: "GUARDIAN_CONTACT", confidence: 0.9 };
  }
  if (
    /(병원|진료|정형외과|내과|안과|재활의학과|무릎|눈 보)/.test(
      transcript,
    ) || PRIOR_VISIT_PHRASES.some((phrase) => transcript.includes(phrase))
  ) {
    return { value: "HOSPITAL_COMPANION", confidence: 0.91 };
  }
  return { value: "UNKNOWN", confidence: 0.35 };
}

function parseTime(transcript: string) {
  const match = transcript.match(
    /(오전|오후)?\s*(\d{1,2})시(?:\s*(?:(\d{1,2})분|(반)))?/,
  );
  if (!match) return null;

  const meridiem = match[1];
  let hour = Number(match[2]);
  const minute = match[4] === "반" ? 30 : Number(match[3] ?? 0);

  if (hour > 23 || minute > 59) return null;
  if (meridiem === "오후" && hour < 12) hour += 12;
  if (meridiem === "오전" && hour === 12) hour = 0;

  return {
    value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    source: match[0].trim(),
  };
}

function findExplicitValue(transcript: string, values: string[]) {
  return values.find((value) => transcript.includes(value)) ?? null;
}

function findExplicitHospital(transcript: string) {
  const candidates = transcript.match(FACILITY_NAME_PATTERN) ?? [];

  return (
    candidates.find(
      (candidate) =>
        !KNOWN_DEPARTMENTS.includes(candidate) &&
        !GENERIC_FACILITY_REFERENCES.has(candidate) &&
        !/^(저번에?|지난번|예전|전에갔던|저번에갔던)/.test(candidate),
    ) ?? null
  );
}

function findSafetySignals(transcript: string) {
  const signals = [
    { pattern: /(숨쉬기|숨 쉬기).{0,8}(힘들|어렵|답답)/, label: "호흡 곤란 표현" },
    { pattern: /가슴.{0,6}(아프|통증|조이)/, label: "흉부 통증 표현" },
    { pattern: /(쓰러|의식|정신을 잃)/, label: "의식 저하 표현" },
    { pattern: /(피가|출혈).{0,6}(많|멈추지)/, label: "심한 출혈 표현" },
    { pattern: /어지러/, label: "어지러움 표현" },
  ];

  return signals
    .filter((signal) => signal.pattern.test(transcript))
    .map((signal) => signal.label);
}

function visitEvidence(visits: Visit[], selected: Visit) {
  const sameFacility = visits.filter(
    (visit) =>
      visit.hospital_name === selected.hospital_name &&
      visit.department === selected.department,
  );
  const evidence = [
    `과거 동행 이력: ${selected.hospital_name} ${selected.department} ${sameFacility.length}회 방문`,
  ];
  if (selected.reason) {
    evidence.push(`최근 방문 사유: ${selected.reason}`);
  }
  return evidence;
}

function appointmentDate(
  transcript: string,
  referenceDate: string,
): IntakeAnalysis["appointment"]["date"] {
  const parsed = parseRelativeDate(transcript, referenceDate);
  if (!parsed.value || !parsed.source) {
    return {
      value: null,
      status: "NEEDS_CONFIRMATION",
      confidence: 0,
      evidence: ["원문에서 방문 날짜를 확인할 수 없음"],
    };
  }

  const status: EvidenceStatus = "CONFIRMED_BY_INPUT";
  const evidence = [`사용자가 '${parsed.source}'이라고 직접 발화`];
  if (parsed.selfCorrected) {
    evidence.push("앞선 날짜 표현보다 마지막 발화를 최종 의도로 반영");
  }

  return {
    value: parsed.value,
    status,
    confidence: 0.97,
    evidence,
  };
}

export function analyzeMockIntake(
  context: IntakeProviderContext,
): IntakeAnalysis {
  const { transcript, reference_date: referenceDate } = context.input;
  const explicitHospital = findExplicitHospital(transcript);
  const explicitDepartment = findExplicitValue(transcript, KNOWN_DEPARTMENTS);
  const parsedTime = parseTime(transcript);
  const primaryPerson = context.people[0] ?? null;
  const latestVisit = primaryPerson?.visits[0] ?? null;
  const refersToPriorVisit = PRIOR_VISIT_PHRASES.some((phrase) =>
    transcript.includes(phrase),
  );

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

  const date = appointmentDate(transcript, referenceDate);
  const time: IntakeAnalysis["appointment"]["time"] = parsedTime
    ? {
        value: parsedTime.value,
        status: "CONFIRMED_BY_INPUT",
        confidence: 0.98,
        evidence: [`원문에서 “${parsedTime.source}”을 직접 말함`],
      }
    : {
        value: null,
        status: "NEEDS_CONFIRMATION",
        confidence: 0,
        evidence: ["원문에서 방문 시간을 확인할 수 없음"],
      };

  let hospitalCandidates: IntakeAnalysis["hospital"]["candidates"] = [];
  if (explicitHospital) {
    hospitalCandidates = [
      {
        name: explicitHospital,
        status: "CONFIRMED_BY_INPUT",
        confidence: 0.99,
        evidence: [`원문에서 “${explicitHospital}”을 직접 언급`],
      },
    ];
  } else if (refersToPriorVisit && latestVisit) {
    hospitalCandidates = [
      {
        name: latestVisit.hospital_name,
        status: "INFERRED",
        confidence: 0.82,
        evidence: visitEvidence(primaryPerson.visits, latestVisit),
      },
    ];
  }

  let department: IntakeAnalysis["department"];
  if (explicitDepartment) {
    department = {
      value: explicitDepartment,
      status: "CONFIRMED_BY_INPUT",
      confidence: 0.99,
      evidence: [`원문에서 “${explicitDepartment}”를 직접 언급`],
    };
  } else if (hospitalCandidates[0]?.status === "INFERRED" && latestVisit) {
    department = {
      value: latestVisit.department,
      status: "INFERRED",
      confidence: 0.8,
      evidence: visitEvidence(primaryPerson.visits, latestVisit),
    };
  } else {
    department = {
      value: null,
      status: "NEEDS_CONFIRMATION",
      confidence: 0,
      evidence: ["원문과 과거 이력만으로 진료과를 확인할 수 없음"],
    };
  }

  const confirmationQuestions: string[] = [];
  if (personCandidates.length === 0) {
    confirmationQuestions.push("동행 대상자의 성함과 연락처를 확인해 주세요.");
  }
  if (date.status === "NEEDS_CONFIRMATION") {
    confirmationQuestions.push("병원에 가실 날짜가 언제인가요?");
  }
  if (time.status === "NEEDS_CONFIRMATION") {
    confirmationQuestions.push("몇 시 진료 또는 출발을 원하시나요?");
  }
  if (hospitalCandidates.length === 0) {
    confirmationQuestions.push("어느 병원으로 가실 예정인가요?");
  }
  if (department.status === "NEEDS_CONFIRMATION") {
    confirmationQuestions.push("어느 진료과 방문인가요?");
  }

  const safetySignals = findSafetySignals(transcript);
  if (safetySignals.length > 0) {
    confirmationQuestions.unshift(
      "위험 신호 표현이 감지되었습니다. 담당자가 현재 상태를 즉시 직접 확인해 주세요.",
    );
  }

  const careNotes = primaryPerson?.careProfile?.mobility_notes ?? [];
  const requestType = detectRequestType(transcript);
  const personLabel = personCandidates[0]?.name ?? "대상자 확인 필요";
  const hospitalLabel = hospitalCandidates[0]?.name ?? "병원 확인 필요";
  const dateLabel = date.value ?? "날짜 확인 필요";
  const timeLabel = time.value ?? "시간 확인 필요";

  return {
    schema_version: "1.0",
    request_type: requestType,
    caller: {
      person_candidates: personCandidates,
      identity_status: personCandidates.length > 0 ? "CANDIDATE" : "UNKNOWN",
    },
    appointment: { date, time },
    hospital: { candidates: hospitalCandidates },
    department,
    additional_requests: transcript.includes("약도")
      ? ["병원 위치 안내 요청"]
      : [],
    proxy_request: {
      detected: false,
      relationship: null,
    },
    care_context: { mobility_notes: careNotes },
    confirmation_questions: confirmationQuestions,
    safety: {
      signal_detected: safetySignals.length > 0,
      signal_type: safetySignals.length > 0 ? safetySignals.join(", ") : null,
      medical_judgement: false,
      human_escalation_required: safetySignals.length > 0,
    },
    summary: `${personLabel}님의 ${dateLabel} ${timeLabel} ${hospitalLabel} 병원동행 요청 후보입니다. 사회복지사 확인 후 확정해 주세요.`,
    human_review_required: true,
  };
}
