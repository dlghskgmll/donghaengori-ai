/**
 * U2-A의 사람 작업 상태.
 *
 * AI가 만든 원본 분석 결과와 저장 접수 read model은 수정하지 않는다. 이 상태는
 * 요청 id와 필드 key별로 별도 보관되며, 이후 persistence/Audit Log가 붙을 때
 * 사람의 행동만 명시적으로 전달할 수 있는 형태를 유지한다.
 */

export type HumanResolution =
  | { status: "accepted"; value: string }
  | { status: "edited"; value: string };

export interface IntakeFieldDraft {
  resolution: HumanResolution | null;
  /** null이면 edit mode가 아니다. 빈 문자열은 유효한 입력 중 상태다. */
  editValue: string | null;
  /** 복수의 실제 AI 후보 중 사용자가 고른 값. 선택 자체는 해결이 아니다. */
  selectedCandidate: string | null;
}

export type IntakeFieldResolutionState = Record<
  string,
  Record<string, IntakeFieldDraft>
>;

export const initialIntakeFieldResolutionState: IntakeFieldResolutionState = {};

const EMPTY_FIELD_DRAFT: IntakeFieldDraft = {
  resolution: null,
  editValue: null,
  selectedCandidate: null,
};

export type IntakeFieldResolutionAction =
  | {
      type: "candidateSelected";
      requestId: string;
      fieldKey: string;
      value: string;
    }
  | {
      type: "accept";
      requestId: string;
      fieldKey: string;
      value: string;
    }
  | {
      type: "beginEdit";
      requestId: string;
      fieldKey: string;
      value: string;
    }
  | {
      type: "editChanged";
      requestId: string;
      fieldKey: string;
      value: string;
    }
  | {
      type: "cancelEdit";
      requestId: string;
      fieldKey: string;
    }
  | {
      type: "applyEdit";
      requestId: string;
      fieldKey: string;
    };

export function getIntakeFieldDraft(
  state: IntakeFieldResolutionState,
  requestId: string,
  fieldKey: string,
): IntakeFieldDraft {
  return state[requestId]?.[fieldKey] ?? EMPTY_FIELD_DRAFT;
}

function updateField(
  state: IntakeFieldResolutionState,
  requestId: string,
  fieldKey: string,
  update: (current: IntakeFieldDraft) => IntakeFieldDraft,
): IntakeFieldResolutionState {
  const request = state[requestId] ?? {};
  const current = request[fieldKey] ?? EMPTY_FIELD_DRAFT;
  const next = update(current);
  if (next === current) return state;

  return {
    ...state,
    [requestId]: {
      ...request,
      [fieldKey]: next,
    },
  };
}

export function intakeFieldResolutionReducer(
  state: IntakeFieldResolutionState,
  action: IntakeFieldResolutionAction,
): IntakeFieldResolutionState {
  return updateField(state, action.requestId, action.fieldKey, (current) => {
    switch (action.type) {
      case "candidateSelected":
        return { ...current, selectedCandidate: action.value };

      case "accept": {
        const value = action.value.trim();
        if (!value) return current;
        return {
          resolution: { status: "accepted", value },
          editValue: null,
          selectedCandidate: current.selectedCandidate,
        };
      }

      case "beginEdit":
        return { ...current, editValue: action.value };

      case "editChanged":
        return { ...current, editValue: action.value };

      case "cancelEdit":
        return current.editValue === null
          ? current
          : { ...current, editValue: null };

      case "applyEdit": {
        const value = current.editValue?.trim() ?? "";
        if (!value) return current;
        return {
          resolution: { status: "edited", value },
          editValue: null,
          selectedCandidate: current.selectedCandidate,
        };
      }

      default:
        return current;
    }
  });
}

export function isHumanResolved(field: IntakeFieldDraft): boolean {
  return field.resolution !== null;
}

export interface ResolutionCandidate {
  value: string;
  evidence: string[];
}

const QUESTION_KEYWORDS: Record<string, string[]> = {
  date: ["날짜", "방문일", "며칠", "무슨 날"],
  time: ["시간", "몇 시", "시각", "오전", "오후"],
  hospital: ["병원", "의원", "어디"],
  department: ["진료과", "무슨 과", "어느 과"],
  dept: ["진료과", "무슨 과", "어느 과"],
  target: ["대상자", "어르신", "성함", "누구"],
  requestType: ["요청", "동행", "무엇을"],
};

/** 실제 AI 질문 중 해당 필드와 관련된 것만 연결한다. 질문을 새로 만들지 않는다. */
export function findFieldConfirmationQuestion(
  fieldKey: string,
  questions: string[],
): string | null {
  const keywords = QUESTION_KEYWORDS[fieldKey] ?? [];
  return (
    questions.find((question) =>
      keywords.some((keyword) => question.includes(keyword)),
    ) ?? null
  );
}
