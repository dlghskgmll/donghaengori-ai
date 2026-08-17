import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as listProfiles } from "../app/api/v1/profiles/route";
import { GET as getProfile } from "../app/api/v1/profiles/[phone]/route";

describe("U7 Next profile proxies", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("U7-13 인증 헤더가 없으면 backend보다 먼저 401로 막는다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await listProfiles(
      new Request("http://localhost/api/v1/profiles"),
    );
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("U7-14 profile 목록 proxy가 no-store와 최소 응답 구조를 유지한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json([
          {
            phone: "01012345678",
            id: "P001",
            name: "박순자",
            age: 81,
            region: "전남 고흥군",
            visits: 3,
            last_visit: "2026-06-20",
          },
        ]),
      ),
    );
    const response = await listProfiles(
      new Request("http://localhost/api/v1/profiles", {
        headers: { Authorization: "Bearer token" },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      profiles: [{ name: "박순자", visits: 3 }],
    });
  });

  it("U7-15 잘못된 phone route는 backend를 호출하지 않는다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await getProfile(
      new Request("http://localhost/api/v1/profiles/not-a-phone", {
        headers: { Authorization: "Bearer token" },
      }),
      { params: Promise.resolve({ phone: "not-a-phone" }) },
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
