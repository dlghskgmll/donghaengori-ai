// 신청 폼의 클라이언트 상태와 검증. 서버 스키마(lib/domain/validation)와 규칙을 맞춘다.

import { toIsoBirthDate } from "@/lib/guardian/domain/birthDate";
import type { NewGuardianApplication } from "@/lib/guardian/domain/application";
import { TOTAL_STEPS } from "@/lib/guardian/constants";

export interface ApplyFormState {
  name: string;
  /** 화면 표시용 1943.05.12 형식. 제출 시 ISO로 변환한다. */
  birth: string;
  region: string;
  relation: string;
  phone: string;
  date: string;
  dateUnknown: boolean;
  time: string;
  timeUnknown: boolean;
  hospital: string;
  dept: string;
  deptUnknown: boolean;
  helps: string[];
  note: string;
}

export const EMPTY_FORM: ApplyFormState = {
  name: "",
  birth: "",
  region: "",
  relation: "",
  phone: "",
  date: "",
  dateUnknown: false,
  time: "",
  timeUnknown: false,
  hospital: "",
  dept: "",
  deptUnknown: false,
  helps: [],
  note: "",
};

export type FormErrors = Partial<Record<"name" | "birth" | "phone" | "date" | "hospital" | "helps", string>>;

export function validateStep(step: number, form: ApplyFormState): FormErrors {
  const errors: FormErrors = {};
  if (step === 1) {
    if (!form.name.trim()) errors.name = "어르신 성함을 입력해 주세요.";
    if (!form.birth.trim()) errors.birth = "생년월일을 입력해 주세요.";
    else if (!toIsoBirthDate(form.birth)) errors.birth = "생년월일을 다시 확인해 주세요. (예: 1943.05.12)";
    if (!form.phone.trim()) errors.phone = "보호자 연락처를 입력해 주세요.";
    else if (!/^[0-9+\-\s]{9,}$/.test(form.phone.trim())) errors.phone = "연락처를 다시 확인해 주세요.";
  }
  if (step === 2 && !form.dateUnknown && !form.date) {
    errors.date = "날짜를 선택하거나 '아직 정해지지 않았어요'를 선택해 주세요.";
  }
  if (step === 3 && !form.hospital.trim()) errors.hospital = "병원명을 입력해 주세요.";
  if (step === 4 && form.helps.length === 0) {
    errors.helps = "필요한 도움을 하나 이상 선택해 주세요. 모르시면 '잘 모르겠어요'를 선택하시면 돼요.";
  }
  return errors;
}

/** 마지막 단계 제출 전에 모든 단계를 다시 확인한다. */
export function validateAll(form: ApplyFormState): { step: number; errors: FormErrors } | null {
  for (let step = 1; step <= TOTAL_STEPS; step += 1) {
    const errors = validateStep(step, form);
    if (Object.keys(errors).length > 0) return { step, errors };
  }
  return null;
}

const optional = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

/** 폼 상태 → 서버로 보낼 도메인 입력. 값이 없으면 undefined로 두고 지어내지 않는다. */
export function toNewApplication(form: ApplyFormState): NewGuardianApplication {
  return {
    elder: {
      name: form.name.trim(),
      birthDate: toIsoBirthDate(form.birth) ?? undefined,
      region: optional(form.region),
    },
    guardian: {
      relationship: optional(form.relation),
      phone: form.phone.trim(),
    },
    visit: {
      date: form.dateUnknown ? undefined : optional(form.date),
      time: form.timeUnknown ? undefined : optional(form.time),
      dateUnknown: form.dateUnknown,
      timeUnknown: form.timeUnknown,
      hospital: form.hospital.trim(),
      department: form.deptUnknown ? undefined : optional(form.dept),
      departmentUnknown: form.deptUnknown,
    },
    assistance: form.helps,
    note: optional(form.note),
  };
}
