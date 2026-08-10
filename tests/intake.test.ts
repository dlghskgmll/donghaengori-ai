import { describe, expect, it } from "vitest";
import { analyzeIntake } from "../lib/ai/analyzeIntake";
import { IntakeAnalysisSchema } from "../lib/ai/schema";
import { fixtures } from "./fixtures";

describe("동행고리AI mock intake analyzer", () => {
  it("CASE 1: 명확한 발화를 확인된 접수 정보로 구조화한다", async () => {
    const result = await analyzeIntake(fixtures.case1);

    expect(result.caller.person_candidates[0]?.name).toBe("김영자");
    expect(result.appointment.date).toMatchObject({
      value: "2026-08-11",
      status: "CONFIRMED_BY_INPUT",
    });
    expect(result.appointment.time).toMatchObject({
      value: "10:00",
      status: "CONFIRMED_BY_INPUT",
    });
    expect(result.hospital.candidates[0]).toMatchObject({
      name: "순천가상병원",
      status: "CONFIRMED_BY_INPUT",
    });
    expect(result.department).toMatchObject({
      value: "정형외과",
      status: "CONFIRMED_BY_INPUT",
    });
    expect(IntakeAnalysisSchema.safeParse(result).success).toBe(true);
  });

  it("CASE 2: 저번 병원 표현을 방문 이력과 결합해 후보로만 제시한다", async () => {
    const result = await analyzeIntake(fixtures.case2);
    const hospital = result.hospital.candidates[0];

    expect(result.caller.person_candidates[0]?.name).toBe("박순자");
    expect(result.appointment.date).toMatchObject({
      value: "2026-08-12",
      status: "CONFIRMED_BY_INPUT",
    });
    expect(hospital).toMatchObject({
      name: "순천가상정형외과",
      status: "INFERRED",
    });
    expect(hospital?.evidence.some((item) => item.includes("3회 방문"))).toBe(
      true,
    );
    expect(hospital?.evidence.some((item) => item.includes("무릎 통증"))).toBe(
      true,
    );
    expect(result.appointment.time.status).toBe("NEEDS_CONFIRMATION");
    expect(result.confirmation_questions.length).toBeGreaterThan(0);
  });

  it("CASE 3: 과거 이력이 없으면 병원을 임의로 만들지 않는다", async () => {
    const result = await analyzeIntake(fixtures.case3);

    expect(result.caller.person_candidates[0]?.name).toBe("문정자");
    expect(result.hospital.candidates).toEqual([]);
    expect(result.department.status).toBe("NEEDS_CONFIRMATION");
    expect(
      result.confirmation_questions.some((question) =>
        question.includes("어느 병원"),
      ),
    ).toBe(true);
  });

  it("CASE 4: 자기 수정에서는 마지막 날짜 표현을 최종 의도로 사용한다", async () => {
    const result = await analyzeIntake(fixtures.case4);

    expect(result.appointment.date.value).toBe("2026-08-12");
    expect(result.appointment.date.status).toBe("CONFIRMED_BY_INPUT");
    expect(result.appointment.date.evidence[0]).toContain("모레");
    expect(result.appointment.date.evidence[1]).toContain("마지막 발화");
  });

  it("CASE 5: 위험 표현은 판단하지 않고 사람 확인 신호만 올린다", async () => {
    const result = await analyzeIntake(fixtures.case5);

    expect(result.safety.signal_detected).toBe(true);
    expect(result.safety.human_escalation_required).toBe(true);
    expect(result.safety.medical_judgement).toBe(false);
    expect(result.human_review_required).toBe(true);
  });

  it("CASE 6: 데이터에 없는 명시적 병원명도 직접 발화로 추출한다", async () => {
    const result = await analyzeIntake(fixtures.case6);

    expect(result.hospital.candidates[0]).toMatchObject({
      name: "광주새봄병원",
      status: "CONFIRMED_BY_INPUT",
    });
    expect(result.department).toMatchObject({
      value: "피부과",
      status: "CONFIRMED_BY_INPUT",
    });
    expect(result.appointment.date).toMatchObject({
      value: "2026-08-11",
      status: "CONFIRMED_BY_INPUT",
    });
  });

  it("CASE 7: 다른 필드가 없어도 직접 말한 날짜와 진료과를 확인 상태로 둔다", async () => {
    const result = await analyzeIntake(fixtures.case7);

    expect(result.appointment.date).toMatchObject({
      value: "2026-08-11",
      status: "CONFIRMED_BY_INPUT",
    });
    expect(result.department).toMatchObject({
      value: "정형외과",
      status: "CONFIRMED_BY_INPUT",
    });
    expect(result.hospital.candidates).toEqual([]);
    expect(
      result.confirmation_questions.some((question) =>
        question.includes("어느 병원"),
      ),
    ).toBe(true);
  });

  it("CASE 8: 날짜 자기 수정 후 최종 날짜도 직접 발화 상태를 유지한다", async () => {
    const result = await analyzeIntake(fixtures.case8);

    expect(result.appointment.date).toMatchObject({
      value: "2026-08-12",
      status: "CONFIRMED_BY_INPUT",
    });
  });
});
