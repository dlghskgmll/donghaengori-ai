import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTeamPostRecord,
  decideTeamPostRecord,
  fetchTeamAudit,
  fetchTeamPostRecords,
} from "../lib/ai/teamPostRecord";

describe("U8 Team post-record contract", () => {
  beforeEach(() => {
    process.env.TEAM_AI_BASE_URL = "https://team.example";
  });

  afterEach(() => {
    delete process.env.TEAM_AI_BASE_URL;
  });

  it("U8-10 목록 read가 Bearer 인증과 실제 limit 계약을 사용한다", async () => {
    let calledUrl = "";
    let calledHeaders: HeadersInit | undefined;
    const records = await fetchTeamPostRecords(50, {
      authorization: "Bearer session-token",
      fetchImpl: async (url, init) => {
        calledUrl = String(url);
        calledHeaders = init?.headers;
        return Response.json([
          {
            id: 7,
            intake_id: 74,
            phone: "01012345678",
            created_at: "2026-08-17 14:20",
            memo_raw: "메모 원문",
            treatment: "진료 초안",
            next_visit: null,
            pharmacy: null,
            cautions: null,
            guardian_msg: null,
            profile_update: null,
            approved: 0,
          },
        ]);
      },
    });
    expect(calledUrl).toBe("https://team.example/api/post-records?limit=50");
    expect(new Headers(calledHeaders).get("Authorization")).toBe(
      "Bearer session-token",
    );
    expect(records[0].approved).toBe(false);
  });

  it("U8-11 인증 없이는 read/write 전에 차단한다", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(
      fetchTeamPostRecords(50, { authorization: null, fetchImpl }),
    ).rejects.toMatchObject({ status: 401, code: "TEAM_AUTH_REQUIRED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("U8-12 승인 endpoint에 approved boolean만 전달한다", async () => {
    let sentBody = "";
    const result = await decideTeamPostRecord(7, true, {
      authorization: "Bearer session-token",
      fetchImpl: async (url, init) => {
        expect(String(url)).toBe(
          "https://team.example/api/post-records/7/approve",
        );
        sentBody = String(init?.body);
        return Response.json({
          ok: true,
          approved: true,
          changed: false,
          applied: false,
          reason: "이미 같은 상태",
        });
      },
    });
    expect(JSON.parse(sentBody)).toEqual({ approved: true });
    expect(result.changed).toBe(false);
  });

  it("U8-13 AI 초안 생성 응답의 schedule/source/notes를 그대로 보존한다", async () => {
    const response = await createTeamPostRecord(
      {
        intake_id: 74,
        phone: "01012345678",
        memo: "다음 진료는 2주 뒤",
        dept: "정형외과",
        target: "박순자 어르신",
      },
      {
        authorization: "Bearer session-token",
        fetchImpl: async () =>
          Response.json({
            record_id: 7,
            draft: {
              treatment: null,
              next_visit: "약 2주 뒤",
              pharmacy: null,
              cautions: null,
              guardian_msg: "오늘 동행 잘 마쳤습니다.",
              profile_update: null,
            },
            needs_schedule_check: true,
            source: "규칙",
            notes: ["상대 날짜는 확정하지 않음"],
          }),
      },
    );
    expect(response.needs_schedule_check).toBe(true);
    expect(response.draft.next_visit).toBe("약 2주 뒤");
  });

  it("U8-14 Audit 계약의 actor/role/action/target을 읽는다", async () => {
    const entries = await fetchTeamAudit(500, {
      authorization: "Bearer session-token",
      fetchImpl: async () =>
        Response.json([
          {
            id: 20,
            at: "2026-08-17 14:30",
            actor: "김복지 사회복지사",
            role: "사회복지사",
            action: "승인",
            target_type: "post_record",
            target_id: "7",
            detail: "계단 이동 곤란",
          },
        ]),
    });
    expect(entries[0]).toMatchObject({
      actor: "김복지 사회복지사",
      role: "사회복지사",
      action: "승인",
      target_type: "post_record",
      target_id: "7",
    });
  });
});
