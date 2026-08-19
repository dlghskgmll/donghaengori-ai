import { describe, expect, it } from "vitest";
import { toSavedIntakeDetail } from "../lib/ai/savedIntakeView";

// 미등록 번호로 걸려온 통화는 앞에서 "성함과 사시는 읍면동을 말씀해 주세요"
// 로 20초를 따로 쓴다. 백엔드는 그 답을 카드의 spoken_name·spoken_region 으로
// 실어 보내는데, 화면이 그 칸을 아예 그리지 않아 복지사에게는 '신규
// 대상자(미등록 번호)' 한 줄만 남았다 — 물어본 보람 없이 발신번호로 되걸어
// "누구세요" 부터 물어야 했다.

/** 백엔드가 실제로 내려주는 모양(core/card.py FIELD_LABELS). */
function detailWith(fields: Record<string, unknown>) {
  return {
    id: 1,
    target: "신규 대상자(미등록 번호)",
    phone_masked: "010-****-0000",
    raw_utterance: "무릎이 아파서 낼 송정병원 가야 하는디",
    channel: "전화",
    status: "임시 접수",
    created_at: "2026-08-19 21:00",
    confirmed: 0,
    card: {
      target: "신규 대상자(미등록 번호)",
      raw_utterance: "무릎이 아파서 낼 송정병원 가야 하는디",
      hospital: "송정병원",
      hospital_status: "확인됨" as const,
      fields,
    },
  };
}

const 대상자 = {
  label: "대상자",
  value: "신규 대상자(미등록 번호)",
  status: "확인 필요" as const,
  evidence: ["발신번호가 등록된 대상자와 일치하지 않음"],
};

describe("말한 성함·주소", () => {
  it("따로 받은 성함과 주소가 화면 항목으로 나온다", () => {
    const view = toSavedIntakeDetail(
      detailWith({
        target: 대상자,
        spoken_name: {
          label: "말한 성함",
          value: "이영희",
          status: "확인 필요" as const,
          evidence: ["통화에서 성함을 따로 여쭤 받음"],
        },
        spoken_region: {
          label: "말한 주소",
          value: "목포시 용당동",
          status: "확인 필요" as const,
          evidence: [],
        },
      }) as never,
    );

    const name = view.fields.find((f) => f.key === "spoken_name");
    const region = view.fields.find((f) => f.key === "spoken_region");
    expect(name?.value).toBe("이영희");
    expect(region?.value).toBe("목포시 용당동");
    // 사람이 확인하기 전에는 확인 필요다 — STT 로 들은 말이지 확정이 아니다.
    expect(name?.status).toBe("NEEDS_CONFIRMATION");
  });

  it("등록된 어르신에게는 빈 줄을 만들지 않는다", () => {
    // 등록 번호는 성함을 되묻지 않으므로 카드에 칸 자체가 없다. 빈 줄로
    // 그리면 모든 접수에 '말한 성함 — 확인 필요' 가 붙어 잡음이 된다.
    const view = toSavedIntakeDetail(detailWith({ target: 대상자 }) as never);
    expect(view.fields.some((f) => f.key === "spoken_name")).toBe(false);
    expect(view.fields.some((f) => f.key === "spoken_region")).toBe(false);
    // 다른 항목은 그대로 남는다.
    expect(view.fields.some((f) => f.key === "target")).toBe(true);
    expect(view.fields.some((f) => f.key === "hospital")).toBe(true);
  });

  it("값이 빈 문자열이어도 줄을 만들지 않는다", () => {
    const view = toSavedIntakeDetail(
      detailWith({
        target: 대상자,
        spoken_name: { label: "말한 성함", value: "  ", status: "확인 필요" as const },
      }) as never,
    );
    expect(view.fields.some((f) => f.key === "spoken_name")).toBe(false);
  });
});
