export type UrgentTone = "danger" | "warn";

export interface UrgentPresentation {
  tone: UrgentTone;
  label: "긴급" | "확인 필요";
  title: string;
  description: string;
  listLine: string;
  guidance: readonly string[];
}

/**
 * Team의 urgent 결과를 사람 업무용 의미로 바꾼다.
 *
 * urgentConfidence가 없으면 true로 추정하지 않는다. 현재 Team 저장 DB에는
 * urgent_confident가 보존되지 않으므로 saved intake는 이 경로로 안전하게 내린다.
 */
export function getUrgentPresentation(
  urgent: boolean,
  urgentConfidence: boolean | null | undefined,
): UrgentPresentation | null {
  if (!urgent) return null;

  if (urgentConfidence === true) {
    return {
      tone: "danger",
      label: "긴급",
      title: "긴급 신호가 감지되어 담당자 확인이 필요합니다.",
      description:
        "AI는 응급 여부를 진단하지 않습니다. 원문을 확인하고 기관의 긴급 대응 절차에 따라 주세요.",
      listLine: "긴급 신호 · 담당자 확인 필요",
      guidance: [
        "원문을 확인하고 즉시 담당자에게 연결합니다.",
        "필요한 후속 조치는 기관의 긴급 대응 절차에 따라 사람이 결정합니다.",
      ],
    };
  }

  if (urgentConfidence === false) {
    return {
      tone: "warn",
      label: "확인 필요",
      title: "긴급 여부를 바로 판단하기 어려운 발화입니다.",
      description:
        "담당자가 원문을 확인해 주세요. 긴급 가능성을 배제하지 않고 사람에게 연결합니다.",
      listLine: "긴급 여부 확인 필요 · 원문 확인",
      guidance: [
        "STT가 옮긴 원문과 발화 맥락을 먼저 확인합니다.",
        "긴급 여부와 후속 조치는 담당자가 직접 판단합니다.",
      ],
    };
  }

  return {
    tone: "warn",
    label: "확인 필요",
    title: "긴급 신호의 확신도 정보를 확인할 수 없습니다.",
    description:
      "저장된 결과만으로 긴급 수준을 단정하지 않습니다. 담당자가 원문을 확인해 주세요.",
    listLine: "긴급 여부 확인 필요 · 확신도 정보 없음",
    guidance: [
      "원문과 현재 처리 상태를 확인합니다.",
      "긴급 여부와 후속 조치는 담당자가 직접 판단합니다.",
    ],
  };
}
