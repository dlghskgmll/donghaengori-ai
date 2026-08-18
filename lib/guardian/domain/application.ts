// 보호자 병원동행 신청의 도메인 모델.
//
// 필드 이름은 기존 신청 폼(아티팩트의 state.form)의 실제 항목을 그대로 옮기되,
// 평평한 문자열 뭉치 대신 의미 단위(elder / guardian / visit)로 묶었다.
// UI·저장소·API가 모두 이 타입 하나만 공유한다.

/** 신청 진행 상태. NEEDS_INFO는 정상 경로가 아니라 예외 상태다. */
export type ApplicationStatus =
  | "RECEIVED"
  | "REVIEWING"
  | "NEEDS_INFO"
  | "CONFIRMED"
  | "COMPLETED";

/** 담당자가 추가 확인을 요청한 경우에만 채워진다. */
export interface ApplicationInfoRequest {
  /** 보호자에게 보여줄 안내 문구. */
  message: string;
  requestedAt: string;
}

export interface GuardianApplication {
  /** 내부 식별자. 외부에 노출하지 않는다. */
  id: string;
  /** 보호자에게 보여주는 신청번호 (DH-YYMMDD-XXXX). */
  applicationNumber: string;

  elder: {
    name: string;
    /** ISO(YYYY-MM-DD). 입력이 없으면 undefined. */
    birthDate?: string;
    region?: string;
  };

  guardian: {
    relationship?: string;
    /** 숫자만 정규화해 저장한다. 조회 시 대조 기준. */
    phone: string;
  };

  visit: {
    /** ISO(YYYY-MM-DD). dateUnknown이면 undefined. */
    date?: string;
    /** HH:mm. timeUnknown이면 undefined. */
    time?: string;
    /** 날짜를 아직 모른다고 명시한 경우. */
    dateUnknown: boolean;
    timeUnknown: boolean;
    hospital: string;
    department?: string;
    departmentUnknown: boolean;
  };

  assistance: string[];
  note?: string;

  status: ApplicationStatus;
  /** status === "NEEDS_INFO"일 때만 존재한다. */
  infoRequest?: ApplicationInfoRequest;

  createdAt: string;
  updatedAt: string;
}

/** 신청 생성 입력 — 서버가 발급하는 값(id/번호/상태/시각)은 포함하지 않는다. */
export type NewGuardianApplication = Omit<
  GuardianApplication,
  "id" | "applicationNumber" | "status" | "createdAt" | "updatedAt" | "infoRequest"
>;

/** 전화번호 비교·저장용 정규화. 하이픈·공백·국가번호 표기를 흡수한다. */
export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("82")) return `0${digits.slice(2)}`;
  return digits;
}

/** 신청번호 비교용 정규화. 대소문자·공백 차이를 흡수한다. */
export function normalizeApplicationNumber(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

/** 기본 진행 경로. NEEDS_INFO는 여기에 포함되지 않는다(예외 상태). */
export const PROGRESS_STEPS = [
  { status: "RECEIVED", label: "접수 완료", desc: "병원동행 신청이 정상적으로 접수됐어요." },
  { status: "REVIEWING", label: "담당자 확인", desc: "담당자가 신청 내용을 확인하고 있어요." },
  { status: "CONFIRMED", label: "일정 확정", desc: "확정된 일정에 맞춰 병원동행이 준비됩니다." },
  { status: "COMPLETED", label: "동행 완료", desc: "병원동행이 완료되었습니다." },
] as const satisfies ReadonlyArray<{
  status: Exclude<ApplicationStatus, "NEEDS_INFO">;
  label: string;
  desc: string;
}>;

/**
 * NEEDS_INFO는 자체 단계가 없다 — 담당자 확인 단계에 머문 채 별도 알림으로 표시한다.
 * 그래서 진행 인덱스는 REVIEWING과 같은 위치를 가리킨다.
 */
export function progressIndexFor(status: ApplicationStatus): number {
  if (status === "NEEDS_INFO") {
    return PROGRESS_STEPS.findIndex((step) => step.status === "REVIEWING");
  }
  return PROGRESS_STEPS.findIndex((step) => step.status === status);
}

/** 상단 배지 문구. */
export function statusBadgeLabel(status: ApplicationStatus): string {
  switch (status) {
    case "RECEIVED":
      return "접수 완료";
    case "REVIEWING":
      return "담당자 확인 중";
    case "NEEDS_INFO":
      return "추가 확인 필요";
    case "CONFIRMED":
      return "일정 확정";
    case "COMPLETED":
      return "동행 완료";
  }
}
