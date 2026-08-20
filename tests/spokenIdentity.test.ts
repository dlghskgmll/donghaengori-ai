import { describe, expect, it } from "vitest";
import {
  elderProfileFacts,
  toSavedIntakeDetail,
} from "../lib/ai/savedIntakeView";
import { TeamConfirmInputSchema } from "../lib/ai/teamIntakeWrite";
import {
  acceptLabelFor,
  isNewRequestType,
  isReadOnlyField,
  verifyFieldFor,
} from "../lib/ui/intakeFinalization";

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

// ── 들은 이름을 대상자로 올리는 경로 ──────────────────────────
//
// 화면에 '말한 성함: 조예원' 이 떠도 대상자는 '신규 대상자(미등록 번호)'
// 그대로였다. 그 줄의 버튼이 로컬에서 자기 줄만 확인 표시하고 끝나서,
// 복지사는 이름을 눈으로 읽고 대상자 칸에 손으로 다시 옮겨 적어야 했다.

describe("말한 성함 → 대상자", () => {
  it("말한 성함의 확인은 target 으로 나간다", () => {
    expect(verifyFieldFor("spoken_name")).toBe("target");
    expect(acceptLabelFor("spoken_name")).toBe("대상자로 확인");
  });

  it("보통 항목은 자기 자신으로 나간다", () => {
    for (const key of ["target", "hospital", "dept", "date", "time"]) {
      expect(verifyFieldFor(key)).toBe(key);
      expect(acceptLabelFor(key)).toBeUndefined();
    }
  });

  it("서버가 받지 않는 항목에는 확인 버튼을 주지 않는다", () => {
    // 눌러도 422 만 나고 왜 안 되는지 알 방법이 없다.
    expect(verifyFieldFor("birth")).toBeNull();
    expect(verifyFieldFor("spoken_region")).toBeNull();
  });

  it("말한 주소는 읽기 전용이다", () => {
    // 카드에 채울 칸이 없다. 로컬로만 도는 버튼을 남기면 눌러서 확인됨으로
    // 보이는데 서버는 모르는 상태가 된다.
    expect(isReadOnlyField("spoken_region")).toBe(true);
    expect(isReadOnlyField("spoken_name")).toBe(false);
    expect(isReadOnlyField("target")).toBe(false);
  });
});

// ── 외출 전 참고 (기상·대기) ─────────────────────────────
//
// 백엔드가 카드에 outing_checklist 를 실어 보내는데 화면이 그 칸을 아예
// 그리지 않았다. 공공데이터(기상청·에어코리아)를 붙여 놓고 복지사에게는
// 한 줄도 안 보여주고 있었다.

describe("외출 전 참고", () => {
  const 기본 = {
    id: 9,
    target: "박순자",
    channel: "전화",
    status: "임시 접수",
    created_at: "2026-08-20 09:00",
    confirmed: 0,
    raw_utterance: "낼 병원 가야 해",
  };

  it("서버가 준 기상·대기 문구를 그대로 싣는다", () => {
    const view = toSavedIntakeDetail({
      ...기본,
      card: {
        raw_utterance: 기본.raw_utterance,
        outing_checklist: [
          "미세먼지 보통 이하 (PM10 14 · PM2.5 5㎍/㎥) — 특이사항 없음",
          "비 예보 있음 → 우산·미끄럼 주의",
        ],
      },
    } as never);
    expect(view.outingChecklist).toHaveLength(2);
    expect(view.outingChecklist[0]).toContain("PM10 14");
  });

  it("서버가 못 채우면 빈 배열이다", () => {
    // 외부 API 미연동이거나 좌표를 못 찾으면 서버가 조용히 건너뛴다.
    // 그때 화면은 이 영역 자체를 그리지 않아야 한다 — 빈 상자를 두면
    // 복지사가 "정보가 없다"와 "아직 안 불러왔다"를 구분할 수 없다.
    const view = toSavedIntakeDetail({
      ...기본,
      card: { raw_utterance: 기본.raw_utterance },
    } as never);
    expect(view.outingChecklist).toEqual([]);
  });
});

// ── 새로운 유형의 요청 ────────────────────────────────────
//
// "허리가 아픈데 우리 집 주변에 어떤 병원이 있는지 모르겠어" 같은 말은
// 기존 흐름(이력 → 병원 후보 → 확정)이 감당하지 못한다. 서버는 병원·진료과를
// **만들지 않고** 조건만 구조화해 넘긴다.
//
// 화면이 이걸 모르면 병원 빈 칸이 "AI가 못 찾았네" 로 읽히고, 복지사가
// 직접 채워 넣는다 — 지어내지 않으려고 비운 자리가 지어낸 값으로 채워진다.

describe("새로운 유형의 요청", () => {
  it("기존재방문과 null 은 평소와 같다", () => {
    expect(isNewRequestType("기존재방문")).toBe(false);
    expect(isNewRequestType(null)).toBe(false);
    expect(isNewRequestType(undefined)).toBe(false);
    expect(isNewRequestType("  ")).toBe(false);
  });

  it("새 유형은 물론, 모르는 값도 새 유형으로 본다", () => {
    for (const v of ["신규병원탐색", "진료과기반탐색", "돌봄인력요청", "기타불분명"]) {
      expect(isNewRequestType(v)).toBe(true);
    }
    // 서버가 유형을 늘렸는데 화면이 조용히 평소처럼 그리면 안 된다.
    expect(isNewRequestType("나중에생길유형")).toBe(true);
  });

  it("요청 칸을 항목으로 싣되 확인 버튼은 주지 않는다", () => {
    const view = toSavedIntakeDetail({
      id: 3,
      target: "박순자",
      channel: "전화",
      status: "임시 접수",
      created_at: "2026-08-20 10:00",
      confirmed: 0,
      raw_utterance: "허리가 아픈데 우리 집 주변에 어떤 병원이 있는지를 모르겠어",
      card: {
        raw_utterance: "허리가 아픈데 우리 집 주변에 어떤 병원이 있는지를 모르겠어",
        request_type: "신규병원탐색",
        hospital: null,
        fields: {
          request: {
            label: "요청 내용",
            value: "신규병원탐색 · 위치조건 우리 집 주변 · 사유 허리",
            status: "확인 필요" as const,
            evidence: ["AI는 이 요청의 병원·진료과·인력 정보를 만들지 않습니다"],
          },
        },
      },
    } as never);

    expect(view.requestType).toBe("신규병원탐색");
    const req = view.fields.find((f) => f.key === "request");
    expect(req?.value).toContain("신규병원탐색");
    // 서버 verify 가 받지 않는다 — 눌러도 422 만 난다.
    expect(verifyFieldFor("request")).toBeNull();
    expect(isReadOnlyField("request")).toBe(true);
  });

  it("평소 접수에는 요청 칸을 만들지 않는다", () => {
    const view = toSavedIntakeDetail({
      id: 4,
      target: "박순자",
      channel: "전화",
      status: "임시 접수",
      created_at: "2026-08-20 10:00",
      confirmed: 0,
      raw_utterance: "모레 정형외과 가야겄어",
      card: { raw_utterance: "모레 정형외과 가야겄어", request_type: "기존재방문" },
    } as never);
    expect(view.fields.some((f) => f.key === "request")).toBe(false);
  });
});

// ── 어르신 정보에 주소가 없었다 ──────────────────────────
//
// 백엔드는 카드에 pickup(모시러 갈 곳)·mobility·caregiver·guardian 을 계속
// 보내고 있었는데 화면이 하나도 그리지 않았다. 동행 매니저가 제일 먼저
// 알아야 하는 "어디로 가느냐" 가 어디에도 없었다.

describe("어르신 프로필 사실", () => {
  it("주소가 맨 앞이다", () => {
    const rows = elderProfileFacts({
      pickup: "전남 고흥군 ○○면",
      mobility: "거동 불편(보행기 사용)",
      caregiver: "김복지 생활지원사",
      guardian: {
        name: "이지현", relation: "딸",
        phone: "010-9876-5432", available: "평일 18시 이후",
      },
    });
    expect(rows[0]).toEqual({ label: "주소", value: "전남 고흥군 ○○면" });
    expect(rows.map((r) => r.label)).toEqual([
      "주소", "이동 지원", "생활지원사", "보호자",
    ]);
    // 매니저가 걸어야 하는 번호라 가리지 않는다.
    expect(rows[3].value).toBe("이지현 · 딸 · 010-9876-5432 · 평일 18시 이후");
  });

  it("없는 값은 줄을 만들지 않는다", () => {
    expect(elderProfileFacts({ pickup: "전남 고흥군 ○○면" })).toEqual([
      { label: "주소", value: "전남 고흥군 ○○면" },
    ]);
    expect(elderProfileFacts({ pickup: "  ", mobility: null })).toEqual([]);
    expect(elderProfileFacts(null)).toEqual([]);
  });

  it("보호자 정보가 일부만 있어도 있는 것만 잇는다", () => {
    const rows = elderProfileFacts({ guardian: { name: "이지현", relation: "딸" } });
    expect(rows).toEqual([{ label: "보호자", value: "이지현 · 딸" }]);
  });
});

// ── 확정 사유 계약 ────────────────────────────────────────
//
// 새 유형(신규병원탐색 등)은 '요청 내용' 칸이 게이트를 막고 서버 verify 가
// 그 칸을 받지 않는다. 정상 경로가 acknowledge 확정이라, 사람이 통화로
// 처리했다는 사유가 목록에 있어야 한다.

describe("확정 사유", () => {
  it("'직접 응대함' 을 서버가 받는 값으로 보낸다", () => {
    const ok = TeamConfirmInputSchema.safeParse({
      hospital: "백병원", date: "2026-08-20", level: "일반",
      acknowledge: true, acknowledge_reason: "직접 응대함",
    });
    expect(ok.success).toBe(true);
  });

  it("계약 밖의 사유는 화면에서 막는다", () => {
    // 여기서 안 막으면 서버까지 가서 422 가 되고, 복지사는 왜 안 되는지
    // 알 방법이 없다.
    const bad = TeamConfirmInputSchema.safeParse({
      hospital: "백병원", date: "2026-08-20", level: "일반",
      acknowledge: true, acknowledge_reason: "그냥",
    });
    expect(bad.success).toBe(false);
  });
});

// ── 통화 중 되물은 것 ─────────────────────────────────────
//
// 후속답변은 별도 녹음이라 원문(raw_utterance)에 없다. 화면이 이 칸을 안
// 그리면 값이 어디서 왔는지 복지사가 확인할 방법이 아예 없다.

describe("통화 중 되물은 것", () => {
  const 기본 = {
    id: 11, target: "박순자", channel: "전화", status: "임시 접수",
    created_at: "2026-08-20 10:00", confirmed: 0,
    raw_utterance: "모레 세시에 정형외과 가야겄어",
  };

  it("질문·답·반영결과를 싣는다", () => {
    const view = toSavedIntakeDetail({
      ...기본,
      card: {
        raw_utterance: 기본.raw_utterance,
        followups: [
          { field: "time", question: "말씀하신 3시, 오전인가요 오후인가요?",
            answer: "오후요", result: "15:00 [확인됨]", status: "확인됨",
            at: "2026-08-20 10:01" },
        ],
      },
    } as never);
    expect(view.followups).toHaveLength(1);
    expect(view.followups[0].answer).toBe("오후요");
    expect(view.followups[0].result).toBe("15:00 [확인됨]");
  });

  it("답을 못 얻은 건도 남긴다", () => {
    // '안 물어봤다' 와 '물었는데 답을 못 얻었다' 는 다르다.
    const view = toSavedIntakeDetail({
      ...기본,
      card: {
        raw_utterance: 기본.raw_utterance,
        followups: [{ field: "time", question: "오전인가요 오후인가요?" }],
        followup_stopped: "어르신이 사람을 찾으심",
      },
    } as never);
    expect(view.followups[0].answer).toBeNull();
    expect(view.followups[0].result).toBeNull();
    expect(view.followupStopped).toBe("어르신이 사람을 찾으심");
  });

  it("질문이 없는 항목은 버린다", () => {
    const view = toSavedIntakeDetail({
      ...기본,
      card: { raw_utterance: 기본.raw_utterance, followups: [{ field: "time" }] },
    } as never);
    expect(view.followups).toEqual([]);
  });

  it("어르신 정보에 생년월일을 만들지 않는다", () => {
    const view = toSavedIntakeDetail({
      ...기본,
      card: { raw_utterance: 기본.raw_utterance, fields: {} },
    } as never);
    expect(view.fields.some((f) => f.key === "birth")).toBe(false);
  });
});

// ── 주변 병원 후보 ────────────────────────────────────────
//
// 심평원에서 조회한 후보를 백엔드가 두 경로로 준다 — 새 유형에서 조건으로
// 찾은 것(lookup_candidates)과, 이력이 없어 거리로 찾은 것
// (reference_candidates). 화면이 둘 다 안 그려서 "추천 병원이 안 뜬다"가 됐다.

describe("주변 병원 후보", () => {
  const 기본 = {
    id: 21, target: "박순자", channel: "전화", status: "임시 접수",
    created_at: "2026-08-20 10:00", confirmed: 0, raw_utterance: "낼 병원 가야 해",
  };
  const 한곳 = {
    name: "광주병원", kind: "종합병원",
    address: "광주광역시 북구 면앙로139번길 51,  (두암동)",
    phone: "062-260-7100", distance_m: 1891.4177,
    matched_by: "정형외과 진료과목 보유",
  };

  it("두 경로를 하나로 합쳐 싣는다", () => {
    const view = toSavedIntakeDetail({
      ...기본,
      card: {
        raw_utterance: 기본.raw_utterance,
        lookup_candidates: [한곳],
        reference_candidates: [{ ...한곳, name: "광주현대병원", distance_m: 850 }],
      },
    } as never);
    expect(view.hospitalCandidates.map((h) => h.name))
      .toEqual(["광주병원", "광주현대병원"]);
  });

  it("거리를 사람이 읽는 단위로 바꾼다", () => {
    const view = toSavedIntakeDetail({
      ...기본,
      card: {
        raw_utterance: 기본.raw_utterance,
        reference_candidates: [한곳, { ...한곳, name: "가까운의원", distance_m: 850 }],
      },
    } as never);
    expect(view.hospitalCandidates[0].distance).toBe("1.9km");
    expect(view.hospitalCandidates[1].distance).toBe("850m");
    // 주소의 겹친 공백을 정리한다 — 공공데이터에 그대로 들어 있다.
    expect(view.hospitalCandidates[0].address).not.toContain("  ");
  });

  it("이름 없는 항목은 버리고, 없으면 빈 배열", () => {
    const view = toSavedIntakeDetail({
      ...기본,
      card: { raw_utterance: 기본.raw_utterance, lookup_candidates: [{ kind: "의원" }] },
    } as never);
    expect(view.hospitalCandidates).toEqual([]);
  });
});
