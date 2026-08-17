import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchTeamIntakeDetail,
  fetchTeamIntakes,
  TeamIntakeReadError,
} from "../lib/ai/teamIntakeRead";
import {
  fetchSavedDetail,
  fetchSavedList,
  savedIntakeAuthHeader,
  SavedIntakeReadError,
  SAVED_INTAKE_LOGIN_REQUIRED,
  SAVED_INTAKE_SESSION_EXPIRED,
} from "../lib/ui/savedIntakeClient";
import { TEAM_SESSION_STORAGE_KEY } from "../lib/ui/teamSession";
import { SavedIntakePoller } from "../lib/ui/savedIntakePolling";

// U9.5 — Team이 /api/intakes 계열에 intake.view를 요구한다.
// read 경로가 세션을 실어 보내는지, 401/403을 502로 뭉개지 않는지 고정한다.

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function storageWith(session: unknown): Storage {
  const raw = session === null ? null : JSON.stringify(session);
  const removed: string[] = [];
  return {
    getItem: (key: string) =>
      key === TEAM_SESSION_STORAGE_KEY && !removed.includes(key) ? raw : null,
    removeItem: (key: string) => {
      removed.push(key);
    },
    setItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  } as unknown as Storage;
}

const SESSION = {
  token: "session-token",
  user: { id: "U001", name: "김○○", role: "사회복지사", permissions: ["intake.view"] },
};

const teamRow = {
  id: 75,
  target: "박순자",
  hospital: "○○정형외과의원",
  hospital_status: "추정",
  channel: "전화",
  status: "접수 대기",
  created_at: "2026-08-17 09:10",
  confirmed: 0,
  raw_utterance: "병원에 같이 가주세요",
};

describe("U9.5 Team intake read auth", () => {
  it("U9.5-01 목록 fetch가 Authorization 헤더를 Team에 전달한다", async () => {
    const spy = vi.fn().mockResolvedValue(jsonResponse([teamRow]));
    await fetchTeamIntakes(50, {
      fetchImpl: spy,
      baseUrl: "http://team.local",
      authorization: "Bearer abc",
    });
    expect(spy.mock.calls[0][1].headers).toMatchObject({
      Authorization: "Bearer abc",
    });
    // token은 URL·query에 실리지 않는다.
    expect(spy.mock.calls[0][0]).toBe("http://team.local/api/intakes?limit=50");
    expect(spy.mock.calls[0][0]).not.toContain("abc");
  });

  it("U9.5-02 상세 fetch도 같은 세션을 전달한다", async () => {
    const spy = vi.fn().mockResolvedValue(
      jsonResponse({ ...teamRow, raw_utterance: "병원 동행", card: null }),
    );
    await fetchTeamIntakeDetail(75, {
      fetchImpl: spy,
      baseUrl: "http://team.local",
      authorization: "Bearer abc",
    });
    expect(spy.mock.calls[0][1].headers).toMatchObject({
      Authorization: "Bearer abc",
    });
    expect(spy.mock.calls[0][0]).not.toContain("abc");
  });

  it("U9.5-03 인증이 없으면 Team을 부르기 전에 401로 막는다", async () => {
    const spy = vi.fn();
    await expect(
      fetchTeamIntakes(50, { fetchImpl: spy, authorization: null }),
    ).rejects.toMatchObject({ status: 401 });
    expect(spy).not.toHaveBeenCalled();
  });

  it("U9.5-04 형식이 틀린 Bearer도 backend를 부르지 않는다", async () => {
    const spy = vi.fn();
    for (const bad of ["abc", "Bearer", "Bearer ", "Basic abc", ""]) {
      await expect(
        fetchTeamIntakes(50, { fetchImpl: spy, authorization: bad }),
      ).rejects.toBeInstanceOf(TeamIntakeReadError);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("U9.5-05 Team 401·403·404를 502로 뭉개지 않는다", async () => {
    for (const [status, code] of [
      [401, "TEAM_SESSION_INVALID"],
      [403, "TEAM_INTAKE_FORBIDDEN"],
      [404, "TEAM_INTAKE_NOT_FOUND"],
    ] as const) {
      const spy = vi.fn().mockResolvedValue(jsonResponse({}, status));
      await expect(
        fetchTeamIntakeDetail(75, { fetchImpl: spy, authorization: "Bearer a" }),
      ).rejects.toMatchObject({ status, code });
    }
  });

  it("U9.5-06 Team 5xx는 502로 유지한다", async () => {
    const spy = vi.fn().mockResolvedValue(jsonResponse({}, 503));
    await expect(
      fetchTeamIntakes(50, { fetchImpl: spy, authorization: "Bearer a" }),
    ).rejects.toMatchObject({ status: 502 });
  });
});

describe("U9.5 Next saved-intake proxy auth passthrough", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function routes() {
    const list = await import("../app/api/v1/intakes/route");
    const detail = await import("../app/api/v1/intakes/[id]/route");
    return { list, detail };
  }

  it("U9.5-07 인증 없는 목록 요청은 401이고 backend를 부르지 않는다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { list } = await routes();
    const response = await list.GET(
      new Request("http://localhost/api/v1/intakes"),
    );
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("U9.5-08 인증 없는 상세 요청도 401이다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { detail } = await routes();
    const response = await detail.GET(
      new Request("http://localhost/api/v1/intakes/75"),
      { params: Promise.resolve({ id: "75" }) },
    );
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("U9.5-09 Team 403은 403으로, 404는 404로 보존한다", async () => {
    for (const status of [403, 404] as const) {
      vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, status)));
      const { detail } = await routes();
      const response = await detail.GET(
        new Request("http://localhost/api/v1/intakes/75", {
          headers: { Authorization: "Bearer a" },
        }),
        { params: Promise.resolve({ id: "75" }) },
      );
      expect(response.status).toBe(status);
    }
  });

  it("U9.5-10 인증된 상세는 server gate를 그대로 실어 보낸다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          ...teamRow,
          confirmed: 1,
          card: null,
          gate: {
            allowed: false,
            acknowledged: false,
            hard_block: true,
            blockers: [
              {
                field: "hospital",
                label: "병원",
                value: null,
                spoken: null,
                evidence: [],
                question: "어느 병원으로 모실까요?",
              },
            ],
          },
        }),
      ),
    );
    const { detail } = await routes();
    const response = await detail.GET(
      new Request("http://localhost/api/v1/intakes/75", {
        headers: { Authorization: "Bearer a" },
      }),
      { params: Promise.resolve({ id: "75" }) },
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as Record<string, unknown>;
    expect(payload.confirmed).toBe(true);
    expect(payload.gate).toMatchObject({
      allowed: false,
      hardBlock: true,
      blockers: [{ field: "hospital", question: "어느 병원으로 모실까요?" }],
    });
  });
});

describe("U9.5 browser saved-intake client", () => {
  it("U9.5-11 세션이 없으면 헤더를 만들지 않는다", () => {
    expect(savedIntakeAuthHeader(storageWith(null))).toBeNull();
    expect(savedIntakeAuthHeader(null)).toBeNull();
    expect(savedIntakeAuthHeader(storageWith(SESSION))).toBe(
      "Bearer session-token",
    );
  });

  it("U9.5-12 세션이 없으면 network를 부르지 않고 로그인 안내로 실패한다", async () => {
    const fetchImpl = vi.fn();
    await expect(
      fetchSavedList(undefined, { storage: storageWith(null), fetchImpl }),
    ).rejects.toMatchObject({
      status: 401,
      message: SAVED_INTAKE_LOGIN_REQUIRED,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("U9.5-13 세션이 있으면 Bearer를 붙여 읽는다", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ intakes: [{ id: 75 }] }));
    const list = await fetchSavedList(undefined, {
      storage: storageWith(SESSION),
      fetchImpl,
    });
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/v1/intakes");
    expect(fetchImpl.mock.calls[0][1].headers).toMatchObject({
      Authorization: "Bearer session-token",
    });
    expect(list).toEqual([{ id: 75 }]);
  });

  it("U9.5-14 상세도 같은 세션으로 읽고 gate를 그대로 돌려준다", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ id: 75, gate: { allowed: true, blockers: [] } }),
      );
    const detail = await fetchSavedDetail(75, undefined, {
      storage: storageWith(SESSION),
      fetchImpl,
    });
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/v1/intakes/75");
    expect(fetchImpl.mock.calls[0][1].headers).toMatchObject({
      Authorization: "Bearer session-token",
    });
    expect(detail.gate).toMatchObject({ allowed: true });
  });

  it("U9.5-15 401은 세션 만료로 알리고 이 브라우저 세션을 지운다", async () => {
    const storage = storageWith(SESSION);
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 401));
    await expect(
      fetchSavedList(undefined, { storage, fetchImpl }),
    ).rejects.toMatchObject({
      status: 401,
      message: SAVED_INTAKE_SESSION_EXPIRED,
    });
    expect(savedIntakeAuthHeader(storage)).toBeNull();
  });

  it("U9.5-16 403은 권한 없음으로 남기고 세션을 지우지 않는다", async () => {
    const storage = storageWith(SESSION);
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "접수 조회 권한이 없습니다." }, 403));
    await expect(
      fetchSavedList(undefined, { storage, fetchImpl }),
    ).rejects.toMatchObject({
      status: 403,
      message: "접수 조회 권한이 없습니다.",
    });
    // 살아 있는 토큰이다 — 권한 문제로 로그아웃시키지 않는다.
    expect(savedIntakeAuthHeader(storage)).toBe("Bearer session-token");
  });

  it("U9.5-17 502(backend 꺼짐)는 401과 다른 상태로 남는다", async () => {
    const storage = storageWith(SESSION);
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ error: "요청 목록을 불러오지 못했습니다." }, 502),
      );
    const error = await fetchSavedList(undefined, { storage, fetchImpl }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(SavedIntakeReadError);
    expect((error as SavedIntakeReadError).status).toBe(502);
    expect(savedIntakeAuthHeader(storage)).toBe("Bearer session-token");
  });
});

describe("U9.5 polling auth behavior", () => {
  it("U9.5-18 미로그인 fetcher는 poll마다 backend를 때리지 않는다", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn();
      const updates: string[] = [];
      const poller = new SavedIntakePoller({
        fetchList: (signal) =>
          fetchSavedList(signal, { storage: storageWith(null), fetchImpl }),
        onUpdate: (update) => updates.push(update.type),
        intervalMs: 5000,
      });
      poller.start();
      await vi.advanceTimersByTimeAsync(15_000);
      poller.stop();
      // tick마다 실패는 알리되, 실제 network 호출은 한 번도 나가지 않는다.
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(updates.every((type) => type === "failed")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("U9.5-19 세션이 생기면 같은 fetcher가 정상 조회로 돌아온다", async () => {
    let storage = storageWith(null);
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ intakes: [{ id: 75 }] }));
    const fetcher = (signal: AbortSignal) =>
      fetchSavedList(signal, { storage, fetchImpl });

    await expect(fetcher(new AbortController().signal)).rejects.toMatchObject({
      status: 401,
    });
    storage = storageWith(SESSION);
    await expect(fetcher(new AbortController().signal)).resolves.toEqual([
      { id: 75 },
    ]);
  });
});
