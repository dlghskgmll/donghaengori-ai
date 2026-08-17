import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as listPostRecords } from "../app/api/v1/post-records/route";
import { POST as decidePostRecord } from "../app/api/v1/post-records/[id]/approve/route";
import { GET as listAudit } from "../app/api/v1/audit/route";

describe("U8 Next post-record proxies", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("U8-15 인증 없는 사후기록 조회를 Team 호출 전에 막는다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await listPostRecords(
      new Request("http://localhost/api/v1/post-records"),
    );
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("U8-16 잘못된 record id의 승인 요청은 backend를 호출하지 않는다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await decidePostRecord(
      new Request("http://localhost/api/v1/post-records/x/approve", {
        method: "POST",
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ approved: true }),
      }),
      { params: Promise.resolve({ id: "x" }) },
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("U8-17 승인 proxy가 changed=false 응답을 200으로 보존한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          ok: true,
          approved: true,
          changed: false,
          applied: false,
          reason: "이미 같은 상태",
        }),
      ),
    );
    const response = await decidePostRecord(
      new Request("http://localhost/api/v1/post-records/7/approve", {
        method: "POST",
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ approved: true }),
      }),
      { params: Promise.resolve({ id: "7" }) },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      changed: false,
      applied: false,
    });
  });

  it("U8-18 Audit proxy도 Bearer 없이는 401이다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await listAudit(
      new Request("http://localhost/api/v1/audit"),
    );
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
