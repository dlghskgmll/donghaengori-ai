import { afterEach, describe, expect, it, vi } from "vitest";
import {
  toSavedIntakeDetail,
  toSavedIntakeSummary,
} from "../lib/ai/savedIntakeView";
import { normalizeSavedHospitalStatus } from "../lib/ai/teamIntakeRead";

const teamFetch = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai/teamIntakeRead", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../lib/ai/teamIntakeRead")>();
  return {
    ...actual,
    fetchTeamIntakes: (limit: number) =>
      actual.fetchTeamIntakes(limit, { fetchImpl: teamFetch }),
    fetchTeamIntakeDetail: (id: number) =>
      actual.fetchTeamIntakeDetail(id, { fetchImpl: teamFetch }),
  };
});

const { GET: listGet } = await import("../app/api/v1/intakes/route");
const { GET: detailGet } = await import("../app/api/v1/intakes/[id]/route");

afterEach(() => {
  teamFetch.mockReset();
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// 실제 GET /api/intakes 응답에서 확인한 필드 구성(팀 db.intakes 테이블 기준).
function teamRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 75,
    created_at: "2026-08-14 14:59",
    channel: "전화",
    phone: "010-1234-5678",
    target: "박순자",
    raw_utterance: "나 모레 저번에 무릎 봐준 데 가야겄어.",
    intent: "병원동행",
    hospital: "○○정형외과의원",
    hospital_status: "추정",
    dept: "정형외과",
    date_value: "2026-08-16",
    date_label: "모레",
    need_level: "휠체어·부축 동행",
    status: "접수 대기",
    confirmed: 0,
    transfer_status: null,
    ...overrides,
  };
}

function teamDetail(overrides: Record<string, unknown> = {}) {
  return {
    ...teamRow(),
    card: {
      target: "박순자",
      phone_masked: "010-****-5678",
      raw_utterance: "나 모레 저번에 무릎 봐준 데 가야겄어.",
      summary: "모레 정형외과 동행 요청",
      intent: "병원동행",
      hospital: "○○정형외과의원",
      hospital_status: "추정",
      dept: "정형외과",
      reasons: ["최근 6개월 내 ○○정형외과의원(정형외과) 2회 방문 — 과거 이력 기반 후보"],
      confirm_questions: ["어르신, 지난번 가셨던 ○○정형외과의원 맞으실까요?"],
      need_level: "휠체어·부축 동행",
      need_basis: "관찰 특성",
      need_official: false,
      flags: [],
      manager_notes: [],
      fields: {
        date: {
          label: "방문일",
          value: "2026-08-16",
          status: "확인됨",
          evidence: ["'모레'라고 직접 발화"],
          spoken: "모레",
        },
        time: { label: "방문 시각", value: null, status: "확인 필요", evidence: [] },
        hospital: {
          label: "병원",
          value: "○○정형외과의원",
          status: "추정",
          evidence: ["최근 6개월 내 ○○정형외과의원(정형외과) 2회 방문 — 과거 이력 기반 후보"],
        },
        dept: { label: "진료과", value: "정형외과", status: "추정", evidence: [] },
        target: { label: "대상자", value: "박순자", status: "확인됨", evidence: [] },
      },
    },
    ...overrides,
  };
}

describe("saved intake list proxy", () => {
  it("INTAKE-LIST-01: Team 목록을 UI read model로 정규화해 전달한다", async () => {
    teamFetch.mockResolvedValue(jsonResponse([teamRow()]));

    const response = await listGet(
      new Request("http://localhost/api/v1/intakes"),
    );
    const payload = (await response.json()) as {
      intakes: Array<Record<string, unknown>>;
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(payload.intakes).toHaveLength(1);
    expect(payload.intakes[0]).toMatchObject({
      id: 75,
      target: "박순자",
      hospital: "○○정형외과의원",
      hospitalStatus: "INFERRED",
      channel: "전화",
      status: "접수 대기",
      createdAt: "2026-08-14 14:59",
      urgent: false,
    });
    // backend URL·내부 필드가 새어 나가지 않는다.
    expect(JSON.stringify(payload)).not.toMatch(/localhost:8000|card_json|phone/);
  });

  it("INTAKE-LIST-02: Team 5xx는 안전한 오류로 바뀐다", async () => {
    teamFetch.mockResolvedValue(jsonResponse({ detail: "boom" }, 500));

    const response = await listGet(
      new Request("http://localhost/api/v1/intakes"),
    );
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(502);
    expect(payload.error).toBe("요청 목록을 불러오지 못했습니다.");
    expect(JSON.stringify(payload)).not.toMatch(/boom|8000|stack/);
  });

  it("INTAKE-LIST-03: 계약을 벗어난 JSON은 가짜 데이터를 만들지 않고 실패한다", async () => {
    teamFetch.mockResolvedValue(jsonResponse({ nonsense: true }));

    const response = await listGet(
      new Request("http://localhost/api/v1/intakes"),
    );
    const payload = (await response.json()) as { error?: string; intakes?: unknown };

    expect(response.status).toBe(502);
    expect(payload.intakes).toBeUndefined();
  });

  it("INTAKE-LIST-03-보강: 잘못된 limit은 backend 호출 없이 400", async () => {
    const response = await listGet(
      new Request("http://localhost/api/v1/intakes?limit=999"),
    );
    expect(response.status).toBe(400);
    expect(teamFetch).not.toHaveBeenCalled();
  });

  it("Team이 필드를 추가해도 목록 파싱이 깨지지 않는다", async () => {
    teamFetch.mockResolvedValue(
      jsonResponse([teamRow({ brand_new_field: "미래 확장" })]),
    );
    const response = await listGet(
      new Request("http://localhost/api/v1/intakes"),
    );
    expect(response.status).toBe(200);
  });
});

describe("saved intake detail proxy", () => {
  function detailRequest(id: string) {
    return detailGet(new Request(`http://localhost/api/v1/intakes/${id}`), {
      params: Promise.resolve({ id }),
    });
  }

  it("INTAKE-DETAIL-01: 유효한 id는 상세를 정규화해 반환한다", async () => {
    teamFetch.mockResolvedValue(jsonResponse(teamDetail()));

    const response = await detailRequest("75");
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      id: 75,
      target: "박순자",
      channel: "전화",
      status: "접수 대기",
      urgent: false,
    });
    expect(payload.utterance).toBe("나 모레 저번에 무릎 봐준 데 가야겄어.");
    expect(payload.confirmQuestions).toEqual([
      "어르신, 지난번 가셨던 ○○정형외과의원 맞으실까요?",
    ]);
  });

  it("INTAKE-DETAIL-02: 잘못된 id는 backend 호출 없이 400으로 거절한다", async () => {
    for (const id of ["abc", "0", "-1", "1.5", "../secret", "999999999999999"]) {
      const response = await detailRequest(id);
      expect(response.status, id).toBe(400);
    }
    expect(teamFetch).not.toHaveBeenCalled();
  });

  it("상세 backend 실패도 안전한 오류로 바뀐다", async () => {
    teamFetch.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:8000"));

    const response = await detailRequest("75");
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(502);
    expect(payload.error).toBe("요청 내용을 불러오지 못했습니다.");
    expect(JSON.stringify(payload)).not.toMatch(/ECONNREFUSED|8000/);
  });
});

describe("saved intake safety", () => {
  it("INTAKE-SAFETY-01: 저장된 '확인됨'이 이력 기반이면 읽을 때 추정으로 내린다", async () => {
    // 안전 패치 전 배포본이 남긴 데이터를 가정한다.
    const legacy = teamDetail({
      hospital_status: "확인됨",
      card: {
        ...teamDetail().card,
        hospital_status: "확인됨",
        reasons: ["최근 6개월 내 ○○정형외과의원(정형외과) 2회 방문 — 단골로 확인됨"],
        fields: {
          ...teamDetail().card.fields,
          hospital: {
            label: "병원",
            value: "○○정형외과의원",
            status: "확인됨",
            evidence: ["최근 6개월 내 ○○정형외과의원(정형외과) 2회 방문 — 단골로 확인됨"],
          },
        },
      },
    });

    const view = toSavedIntakeDetail(legacy as never);
    const hospital = view.fields.find((field) => field.key === "hospital");

    expect(hospital?.status).toBe("INFERRED");
    expect(view.hospitalDowngraded).toBe(true);
    expect(hospital?.evidence.join(" ")).toContain("직접 확인 전까지 추정");

    // 목록 행에서도 같은 규칙이 적용된다.
    const summary = toSavedIntakeSummary(
      teamRow({ hospital_status: "확인됨" }) as never,
    );
    expect(summary.hospitalStatus).toBe("INFERRED");
  });

  it("INTAKE-SAFETY-01-보강: 발화에 직접 나온 병원은 확정을 유지한다", () => {
    const spoken = toSavedIntakeSummary(
      teamRow({
        raw_utterance: "내일 순천정형외과의원 정형외과 가려고요",
        hospital: "순천정형외과의원",
        hospital_status: "확인됨",
      }) as never,
    );
    expect(spoken.hospitalStatus).toBe("CONFIRMED_BY_INPUT");

    expect(
      normalizeSavedHospitalStatus({
        hospital: "순천정형외과의원",
        teamStatus: "확인됨",
        evidence: ["원문에서 '순천정형외과의원'을 직접 언급"],
        utterance: "",
      }),
    ).toMatchObject({ status: "CONFIRMED_BY_INPUT", downgraded: false });
  });

  it("대상자는 저장값이 확인됨이어도 항상 확인 필요로 표시한다", () => {
    const view = toSavedIntakeDetail(teamDetail() as never);
    const target = view.fields.find((field) => field.key === "target");
    expect(target?.status).toBe("NEEDS_CONFIRMATION");
  });

  it("긴급 접수는 목록·상세 모두 urgent로 표시된다", () => {
    const summary = toSavedIntakeSummary(
      teamRow({ status: "긴급", intent: "긴급" }) as never,
    );
    expect(summary.urgent).toBe(true);
    expect(summary.needsConfirmation).toBe(true);
  });

  it("값이 없으면 지어내지 않고 확인 필요로 남긴다", () => {
    const view = toSavedIntakeDetail(
      teamDetail({
        hospital: null,
        card: { ...teamDetail().card, hospital: null, fields: {} },
      }) as never,
    );
    const hospital = view.fields.find((field) => field.key === "hospital");
    expect(hospital?.value).toBeNull();
    expect(hospital?.status).toBe("NEEDS_CONFIRMATION");
  });
});

describe("fetch 계층", () => {
  it("목록/상세 fetch는 base URL + 고정 경로로 GET만 호출한다", async () => {
    // 위 describe들은 route를 통해 mock된 모듈을 쓰므로, 여기서는 실제 구현을 본다.
    const actual = await vi.importActual<typeof import("../lib/ai/teamIntakeRead")>(
      "../lib/ai/teamIntakeRead",
    );
    const spy = vi.fn();

    spy.mockResolvedValue(jsonResponse([teamRow()]));
    await actual.fetchTeamIntakes(50, {
      fetchImpl: spy,
      baseUrl: "http://team.local",
    });
    expect(spy.mock.calls[0][0]).toBe("http://team.local/api/intakes?limit=50");
    expect(spy.mock.calls[0][1].method).toBe("GET");

    spy.mockResolvedValue(jsonResponse(teamDetail()));
    await actual.fetchTeamIntakeDetail(75, {
      fetchImpl: spy,
      baseUrl: "http://team.local",
    });
    expect(spy.mock.calls[1][0]).toBe("http://team.local/api/intakes/75");
    expect(spy.mock.calls[1][1].method).toBe("GET");
  });
});
