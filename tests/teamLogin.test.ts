import { describe, expect, it, vi } from "vitest";
import {
  loginTeamSession,
  logoutTeamSession,
  teamSessionLabel,
  TeamLoginError,
} from "../lib/ui/teamLogin";
import { TEAM_SESSION_STORAGE_KEY, readTeamSession } from "../lib/ui/teamSession";

// U9.6 — 로그인 진입점이 여러 곳이어도 세션 정책은 하나여야 한다.

function memoryStorage(): Storage & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage & { store: Map<string, string> };
}

const SESSION = {
  token: "tok-1",
  user: {
    id: "U001",
    name: "김○○ 사회복지사",
    role: "사회복지사",
    permissions: ["intake.view", "post.approve"],
  },
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("U9.6 공통 로그인 경계", () => {
  it("U9.6-01 로그인 성공이면 세션을 이 브라우저 탭에 저장한다", async () => {
    const storage = memoryStorage();
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(SESSION));
    const session = await loginTeamSession("U001", "pw", { storage, fetchImpl });

    expect(session.token).toBe("tok-1");
    expect(readTeamSession(storage)?.token).toBe("tok-1");
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/v1/auth/login");
    expect(fetchImpl.mock.calls[0][1].method).toBe("POST");
  });

  it("U9.6-02 비밀번호는 URL이 아니라 body로만 나간다", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(SESSION));
    await loginTeamSession("U001", "secret-pw", {
      storage: memoryStorage(),
      fetchImpl,
    });
    expect(String(fetchImpl.mock.calls[0][0])).not.toContain("secret-pw");
    expect(fetchImpl.mock.calls[0][1].body).toContain("secret-pw");
  });

  it("U9.6-03 로그인 실패는 status와 서버 문구를 보존하고 저장하지 않는다", async () => {
    const storage = memoryStorage();
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ error: "아이디 또는 비밀번호가 올바르지 않습니다" }, 401),
      );
    const error = await loginTeamSession("U001", "bad", {
      storage,
      fetchImpl,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(TeamLoginError);
    expect((error as TeamLoginError).status).toBe(401);
    expect((error as TeamLoginError).message).toBe(
      "아이디 또는 비밀번호가 올바르지 않습니다",
    );
    expect(storage.store.has(TEAM_SESSION_STORAGE_KEY)).toBe(false);
  });

  it("U9.6-04 rate limit(429)도 그대로 알린다", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "로그인 시도가 너무 많습니다" }, 429));
    await expect(
      loginTeamSession("U001", "pw", { storage: memoryStorage(), fetchImpl }),
    ).rejects.toMatchObject({ status: 429 });
  });

  it("U9.6-05 로그아웃은 서버 세션을 끊고 로컬 세션을 지운다", async () => {
    const storage = memoryStorage();
    storage.setItem(TEAM_SESSION_STORAGE_KEY, JSON.stringify(SESSION));
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));

    await logoutTeamSession(SESSION, { storage, fetchImpl });

    expect(fetchImpl.mock.calls[0][0]).toBe("/api/v1/auth/logout");
    expect(fetchImpl.mock.calls[0][1].headers).toMatchObject({
      Authorization: "Bearer tok-1",
    });
    expect(readTeamSession(storage)).toBeNull();
  });

  it("U9.6-06 서버 연결이 실패해도 로컬 세션은 반드시 지운다", async () => {
    const storage = memoryStorage();
    storage.setItem(TEAM_SESSION_STORAGE_KEY, JSON.stringify(SESSION));
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));

    await logoutTeamSession(SESSION, { storage, fetchImpl });

    expect(readTeamSession(storage)).toBeNull();
  });

  it("U9.6-07 세션이 없으면 서버를 부르지 않고 로컬만 정리한다", async () => {
    const storage = memoryStorage();
    const fetchImpl = vi.fn();
    await logoutTeamSession(null, { storage, fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(readTeamSession(storage)).toBeNull();
  });

  it("U9.6-08 nav 표기는 이름·역할만 쓰고 권한 목록을 노출하지 않는다", () => {
    const label = teamSessionLabel(SESSION);
    expect(label).toEqual({ name: "김○○ 사회복지사", role: "사회복지사" });
    expect(JSON.stringify(label)).not.toContain("post.approve");
    expect(JSON.stringify(label)).not.toContain("tok-1");
  });

  it("U9.6-09 이름이 비어 있으면 직원 아이디로 대신 표기한다", () => {
    expect(
      teamSessionLabel({
        token: "t",
        user: { id: "U007", name: "", role: "", permissions: [] },
      }).name,
    ).toBe("U007");
  });
});
