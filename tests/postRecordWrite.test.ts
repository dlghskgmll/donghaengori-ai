import { describe, expect, it, vi } from "vitest";
import {
  createSavedIntakePostRecord,
  SavedIntakeReadError,
} from "../lib/ui/savedIntakeClient";
import { TeamPostRecordCreateSchema } from "../lib/ai/teamPostRecord";
import {
  ACCOMPANIMENT_COMPLETE,
  isAccompanimentComplete,
} from "../lib/ui/intakeFinalization";
import { TEAM_SESSION_STORAGE_KEY } from "../lib/ui/teamSession";

// 사후기록을 '만드는' 경로. 검토 화면은 있었지만 만드는 자리가 없었고,
// 없던 이유가 계약이었다 — phone 이 필수라 마스킹된 번호만 가진 직원
// 화면에서는 요청 자체를 만들 수 없었다. 그 두 가지를 여기서 고정한다.

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function storageWith(session: unknown): Storage {
  const raw = session === null ? null : JSON.stringify(session);
  return {
    getItem: (key: string) => (key === TEAM_SESSION_STORAGE_KEY ? raw : null),
    removeItem: () => {},
    setItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  } as unknown as Storage;
}

const SESSION = {
  token: "session-token",
  user: {
    id: "U002",
    name: "이○○",
    role: "동행매니저",
    permissions: ["post.write"],
  },
};

const DRAFT = {
  treatment: "무릎 주사 처치",
  next_visit: "2주 뒤",
  pharmacy: "앞 약국 3일치",
  cautions: "",
  guardian_msg: "잘 다녀오셨습니다",
  profile_update: "",
};

const CREATED = {
  record_id: 12,
  draft: DRAFT,
  needs_schedule_check: false,
  source: "rules",
  notes: [],
};

describe("사후기록 작성", () => {
  it("phone 없이 intake_id 와 메모만으로 요청한다", async () => {
    const spy = vi.fn().mockResolvedValue(jsonResponse(CREATED));
    const result = await createSavedIntakePostRecord(75, "무릎 주사 맞았어요", {
      fetchImpl: spy,
      storage: storageWith(SESSION),
    });

    expect(spy.mock.calls[0][0]).toBe("/api/v1/post-records");
    const sent = JSON.parse(spy.mock.calls[0][1].body as string);
    expect(sent).toEqual({ intake_id: 75, memo: "무릎 주사 맞았어요" });
    // 연락처는 브라우저에서 나가지 않는다 — 서버가 접수에서 찾는다.
    expect(sent).not.toHaveProperty("phone");
    expect(result.draft.treatment).toBe("무릎 주사 처치");
  });

  it("직원 세션을 Authorization 으로 싣는다", async () => {
    const spy = vi.fn().mockResolvedValue(jsonResponse(CREATED));
    await createSavedIntakePostRecord(75, "메모", {
      fetchImpl: spy,
      storage: storageWith(SESSION),
    });
    expect(spy.mock.calls[0][1].headers).toMatchObject({
      Authorization: "Bearer session-token",
    });
    expect(spy.mock.calls[0][0]).not.toContain("session-token");
  });

  it("로그인 세션이 없으면 요청을 보내지 않는다", async () => {
    const spy = vi.fn();
    await expect(
      createSavedIntakePostRecord(75, "메모", {
        fetchImpl: spy,
        storage: storageWith(null),
      }),
    ).rejects.toBeInstanceOf(SavedIntakeReadError);
    expect(spy).not.toHaveBeenCalled();
  });

  it("초안 모양이 계약과 다르면 화면에 흘리지 않는다", async () => {
    const spy = vi
      .fn()
      .mockResolvedValue(jsonResponse({ record_id: 12, draft: null }));
    await expect(
      createSavedIntakePostRecord(75, "메모", {
        fetchImpl: spy,
        storage: storageWith(SESSION),
      }),
    ).rejects.toBeInstanceOf(SavedIntakeReadError);
  });

  it("계약에서 phone 은 선택이다", () => {
    expect(
      TeamPostRecordCreateSchema.safeParse({ intake_id: 1, memo: "메모" })
        .success,
    ).toBe(true);
    // 빈 메모로는 기록을 만들 수 없다.
    expect(
      TeamPostRecordCreateSchema.safeParse({ intake_id: 1, memo: "" }).success,
    ).toBe(false);
  });

  it("동행 완료 여부는 status 로만 갈린다", () => {
    expect(isAccompanimentComplete(ACCOMPANIMENT_COMPLETE)).toBe(true);
    expect(isAccompanimentComplete(" 동행 완료 ")).toBe(true);
    expect(isAccompanimentComplete("확정")).toBe(false);
    expect(isAccompanimentComplete(null)).toBe(false);
  });
});
