import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchTeamProfile,
  fetchTeamProfiles,
  loginTeamProfile,
} from "../lib/ai/teamProfileRead";

describe("U7 Team profile contract", () => {
  beforeEach(() => {
    process.env.TEAM_AI_BASE_URL = "https://team.example";
  });

  afterEach(() => {
    delete process.env.TEAM_AI_BASE_URL;
  });

  it("U7-07 profile 목록 요청에 Bearer 권한과 실제 query 계약을 전달한다", async () => {
    let calledUrl = "";
    let calledInit: RequestInit | undefined;
    const profiles = await fetchTeamProfiles("박순자", 50, {
      authorization: "Bearer real-session",
      fetchImpl: async (url, init) => {
        calledUrl = String(url);
        calledInit = init;
        return Response.json([
          {
            phone: "01012345678",
            id: "P001",
            name: "박순자",
            age: 81,
            region: "전남 고흥군",
            visits: 3,
            last_visit: "2026-06-20",
          },
        ]);
      },
    });

    expect(calledUrl).toBe(
      "https://team.example/api/profiles?limit=50&query=%EB%B0%95%EC%88%9C%EC%9E%90",
    );
    expect(new Headers(calledInit?.headers).get("Authorization")).toBe(
      "Bearer real-session",
    );
    expect(profiles[0].visits).toBe(3);
  });

  it("U7-08 인증 없이 민감한 profile endpoint를 호출하지 않는다", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(
      fetchTeamProfiles("", 50, { authorization: null, fetchImpl }),
    ).rejects.toMatchObject({ status: 401, code: "TEAM_AUTH_REQUIRED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("U7-09 상세 응답의 Care Profile과 history만 계약대로 읽는다", async () => {
    const profile = await fetchTeamProfile("01012345678", {
      authorization: "Bearer real-session",
      fetchImpl: async () =>
        Response.json({
          phone: "01012345678",
          id: "P001",
          name: "박순자",
          age: 81,
          region: "전남 고흥군",
          guardian: null,
          caregiver: "김복지 생활지원사",
          mobility: "보행기 사용",
          fall_risk: true,
          lives_alone: true,
          preferred_time: "오전",
          notes: null,
          ltci_grade: "2",
          care_program: null,
          history: [
            {
              date: "2026-06-20",
              hospital: "과거 병원",
              dept: "내과",
              symptom: "정기 진료",
              pharmacy: true,
            },
          ],
        }),
    });
    expect(profile.history).toHaveLength(1);
    expect(profile.history[0].hospital).toBe("과거 병원");
  });

  it("U7-10 로그인은 Team의 user_id/password 계약을 그대로 사용한다", async () => {
    let sentBody = "";
    const session = await loginTeamProfile("U001", "password", {
      fetchImpl: async (_url, init) => {
        sentBody = String(init?.body);
        return Response.json({
          token: "real-token",
          user: {
            id: "U001",
            name: "김복지 사회복지사",
            role: "사회복지사",
            permissions: ["intake.view"],
          },
        });
      },
    });
    expect(JSON.parse(sentBody)).toEqual({
      user_id: "U001",
      password: "password",
    });
    expect(session.token).toBe("real-token");
  });

  it("U7-11 Team의 403을 권한 오류로 보존한다", async () => {
    await expect(
      fetchTeamProfiles("", 50, {
        authorization: "Bearer real-session",
        fetchImpl: async () => new Response(null, { status: 403 }),
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        status: 403,
        code: "TEAM_PROFILE_FORBIDDEN",
      }),
    );
  });

  it("U7-12 schema가 다른 응답을 실제 profile로 오인하지 않는다", async () => {
    await expect(
      fetchTeamProfiles("", 50, {
        authorization: "Bearer real-session",
        fetchImpl: async () => Response.json([{ name: "이름만 있음" }]),
      }),
    ).rejects.toMatchObject({ code: "TEAM_PROFILE_RESPONSE_INVALID" });
  });
});
