import type { IntakeAnalysis } from "@/lib/ai/schema";
import type { EvidenceStatus } from "@/lib/domain/intake";
import {
  findFieldConfirmationQuestion,
  type ResolutionCandidate,
} from "@/lib/ui/intakeFieldResolution";

// 디자인의 "그룹 → 필드" 구조로 분석 결과를 옮긴다.
// 상태(CONFIRMED_BY_INPUT / INFERRED / NEEDS_CONFIRMATION)는 절대 합치지 않는다 —
// 화면 표현만 디자인을 따르고, 의미는 분석 결과 그대로다.

export interface DesignField {
  key: string;
  label: string;
  display: string;
  status: EvidenceStatus;
  evidence: string[];
  /** 값 아래 한 줄 보조 설명 (근거 요약이 아니라 사실 표기용) */
  sub?: string;
  editable?: boolean;
  /** AI payload에 실제로 들어온 후보만 둔다. */
  candidates?: ResolutionCandidate[];
  /** AI payload에 실제로 들어온 질문 중 이 필드와 관련된 질문만 둔다. */
  confirmationQuestion?: string | null;
}

export interface DesignGroup {
  name: string;
  fields: DesignField[];
}

const REQUEST_LABELS: Record<IntakeAnalysis["request_type"]["value"], string> = {
  HOSPITAL_COMPANION: "병원동행",
  PHARMACY: "약국 동행",
  GUARDIAN_CONTACT: "보호자 연락",
  UNKNOWN: "유형 확인 필요",
};

export function formatDateValue(date: string | null): string {
  if (!date) return "확인 필요";
  const [year, month, day] = date.split("-");
  return `${year}. ${month}. ${day}.`;
}

function orMissing(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "확인 필요";
}

// 같은 근거 문장이 여러 소스에서 겹쳐 들어오는 경우가 있다(예: 팀 adapter가
// field evidence와 reasons를 함께 싣는다). 화면에는 한 번만 보여준다.
function uniqueEvidence(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

export function buildDesignGroups(analysis: IntakeAnalysis): DesignGroup[] {
  const hospital = analysis.hospital.candidates[0] ?? null;

  const visitFields: DesignField[] = [
    {
      key: "date",
      label: "방문일",
      display: formatDateValue(analysis.appointment.date.value),
      status: analysis.appointment.date.status,
      evidence: uniqueEvidence(analysis.appointment.date.evidence),
      editable: true,
      confirmationQuestion: findFieldConfirmationQuestion(
        "date",
        analysis.confirmation_questions,
      ),
    },
    {
      key: "time",
      label: "예약 시간",
      display: orMissing(analysis.appointment.time.value),
      status: analysis.appointment.time.status,
      evidence: uniqueEvidence(analysis.appointment.time.evidence),
      editable: true,
      confirmationQuestion: findFieldConfirmationQuestion(
        "time",
        analysis.confirmation_questions,
      ),
    },
    {
      key: "hospital",
      label: "병원",
      // 후보가 없으면 이름을 지어내지 않는다.
      display: hospital ? hospital.name : "확인 필요",
      status: hospital ? hospital.status : "NEEDS_CONFIRMATION",
      evidence: hospital
        ? uniqueEvidence(hospital.evidence)
        : ["원문에서 병원을 확인할 수 없음"],
      editable: true,
      candidates: analysis.hospital.candidates.map((candidate) => ({
        value: candidate.name,
        evidence: uniqueEvidence(candidate.evidence),
      })),
      confirmationQuestion: findFieldConfirmationQuestion(
        "hospital",
        analysis.confirmation_questions,
      ),
    },
    {
      key: "department",
      label: "진료과",
      display: orMissing(analysis.department.value),
      status: analysis.department.status,
      evidence: uniqueEvidence(analysis.department.evidence),
      editable: true,
      confirmationQuestion: findFieldConfirmationQuestion(
        "department",
        analysis.confirmation_questions,
      ),
    },
  ];

  const person = analysis.caller.person_candidates[0] ?? null;
  const requestFields: DesignField[] = [
    {
      key: "requestType",
      label: "요청 유형",
      display: REQUEST_LABELS[analysis.request_type.value],
      status:
        analysis.request_type.value === "UNKNOWN"
          ? "NEEDS_CONFIRMATION"
          : "CONFIRMED_BY_INPUT",
      evidence: [],
    },
    {
      key: "target",
      label: "대상자",
      // 발신번호는 본인확정이 아니다 — 후보가 있어도 확인 필요로 표시한다.
      display: person ? person.name : "확인 필요",
      status: "NEEDS_CONFIRMATION",
      evidence: person
        ? uniqueEvidence(person.evidence)
        : ["발신정보로 대상자를 특정할 수 없음"],
      sub: person ? "후보이며 확정된 대상자가 아닙니다." : undefined,
      editable: true,
      candidates: analysis.caller.person_candidates.map((candidate) => ({
        value: candidate.name,
        evidence: uniqueEvidence(candidate.evidence),
      })),
      confirmationQuestion: findFieldConfirmationQuestion(
        "target",
        analysis.confirmation_questions,
      ),
    },
  ];

  const groups: DesignGroup[] = [
    { name: "동행 정보", fields: visitFields },
    { name: "요청 정보", fields: requestFields },
  ];

  const mobility = analysis.care_context.mobility_notes;
  if (mobility.length > 0) {
    groups.push({
      name: "이동 지원",
      fields: mobility.map((note, index) => ({
        key: `mobility-${index}`,
        label: index === 0 ? "참고" : "",
        display: note,
        status: "INFERRED" as EvidenceStatus,
        evidence: [],
      })),
    });
  }

  return groups;
}

/** 하단 바에 쓰는 "남은 확인" 요약. 확인 필요 항목만 센다. */
export function summarizeNeeds(
  groups: DesignGroup[],
  isResolved: (field: DesignField) => boolean = () => false,
): string | null {
  const pending = groups
    .flatMap((group) => group.fields)
    .filter(
      (field) =>
        field.status === "NEEDS_CONFIRMATION" && !isResolved(field),
    )
    .map((field) => field.label)
    .filter((label) => label.length > 0);
  if (pending.length === 0) return null;
  return `${pending.join(" · ")} 확인이 필요합니다`;
}
