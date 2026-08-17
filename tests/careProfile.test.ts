import { describe, expect, it } from "vitest";
import type { TeamProfileDetail } from "../lib/ai/teamProfileRead";
import {
  maskProfilePhone,
  pastHospitalLabel,
  profileSupportFacts,
  sortedProfileHistory,
} from "../lib/ui/careProfile";
import {
  clearTeamSession,
  readTeamSession,
  TEAM_SESSION_STORAGE_KEY,
  writeTeamSession,
} from "../lib/ui/teamSession";

function detail(overrides: Partial<TeamProfileDetail> = {}): TeamProfileDetail {
  return {
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
    care_program: "중점돌봄군",
    history: [],
    ...overrides,
  };
}

describe("U7 Care Profile read model", () => {
  it("U7-01 목록 전화번호를 최소 노출 형태로 가린다", () => {
    expect(maskProfilePhone("010-1234-5678")).toBe("010-••••-5678");
  });

  it("U7-02 과거 동행 이력을 최근 날짜부터 보여준다", () => {
    const history = sortedProfileHistory([
      { date: "2026-03-05", hospital: "A병원", pharmacy: false },
      { date: "2026-06-20", hospital: "B병원", pharmacy: true },
    ]);
    expect(history.map((entry) => entry.date)).toEqual([
      "2026-06-20",
      "2026-03-05",
    ]);
  });

  it("U7-03 과거 병원을 이번 병원 확정처럼 표현하지 않는다", () => {
    expect(
      pastHospitalLabel({
        date: "2026-06-20",
        hospital: "과거 방문 병원",
        pharmacy: false,
      }),
    ).toBe("과거 방문 병원 · 과거 동행");
  });

  it("U7-04 계약에 실제로 있는 이동·돌봄 값만 만든다", () => {
    expect(profileSupportFacts(detail()).map((fact) => fact.label)).toEqual([
      "이동 지원",
      "선호 시간",
      "생활지원사",
      "장기요양등급",
      "돌봄 서비스",
    ]);
    expect(profileSupportFacts(detail({ mobility: null }))).not.toContainEqual(
      expect.objectContaining({ label: "이동 지원" }),
    );
  });

  it("U7-05 Team 세션은 지정된 session storage 값으로만 읽고 쓴다", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const session = {
      token: "session-token",
      user: {
        id: "U001",
        name: "김복지 사회복지사",
        role: "사회복지사",
        permissions: ["intake.view"],
      },
    };

    writeTeamSession(storage, session);
    expect(values.has(TEAM_SESSION_STORAGE_KEY)).toBe(true);
    expect(readTeamSession(storage)).toEqual(session);
    clearTeamSession(storage);
    expect(readTeamSession(storage)).toBeNull();
  });

  it("U7-06 손상된 세션은 인증된 상태로 받아들이지 않는다", () => {
    const storage = { getItem: () => "not-json" };
    expect(readTeamSession(storage)).toBeNull();
  });
});
