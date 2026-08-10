import { describe, expect, it } from "vitest";
import type { Visit } from "../lib/domain/visit";
import {
  CONFIDENCE_POLICY,
  directTextConfidence,
  historyConfidence,
  sourceConfidence,
} from "../lib/ai/confidencePolicy";

function visit(
  visitId: string,
  hospitalName = "순천가상정형외과",
  department = "정형외과",
): Visit {
  return {
    visit_id: visitId,
    person_id: "P001",
    visited_at: "2026-07-21",
    hospital_name: hospitalName,
    department,
    reason: "무릎 통증",
  };
}

describe("server-owned confidence policy", () => {
  it("직접 발화한 정확한 문자열은 0.99를 부여한다", () => {
    expect(
      directTextConfidence(
        "광주새봄병원",
        "광주새봄병원 피부과에 내일 가려고요.",
      ),
    ).toBe(CONFIDENCE_POLICY.DIRECT_EXACT);
    expect(CONFIDENCE_POLICY.DIRECT_EXACT).toBe(0.99);
  });

  it("공백 등 표기만 정규화해 일치한 직접 발화는 0.96을 부여한다", () => {
    expect(
      directTextConfidence(
        "광주 새봄 병원",
        "광주새봄병원 피부과에 내일 가려고요.",
      ),
    ).toBe(CONFIDENCE_POLICY.DIRECT_NORMALIZED);
    expect(CONFIDENCE_POLICY.DIRECT_NORMALIZED).toBe(0.96);
  });

  it("같은 병원과 진료과 방문이 복수이면 0.88을 부여한다", () => {
    const selected = visit("V001");
    const visits = [selected, visit("V002"), visit("V099", "다른병원")];

    expect(historyConfidence(visits, selected)).toBe(
      CONFIDENCE_POLICY.HISTORY_STRONG,
    );
    expect(CONFIDENCE_POLICY.HISTORY_STRONG).toBe(0.88);
  });

  it("일치하는 방문이 한 건이면 0.72를 부여한다", () => {
    const selected = visit("V007", "해남가상병원", "재활의학과");

    expect(historyConfidence([selected], selected)).toBe(
      CONFIDENCE_POLICY.HISTORY_SINGLE,
    );
    expect(CONFIDENCE_POLICY.HISTORY_SINGLE).toBe(0.72);
  });

  it("직접 발화와 이력을 결합한 부분 근거는 0.60을 부여한다", () => {
    expect(sourceConfidence("COMBINED")).toBe(
      CONFIDENCE_POLICY.COMBINED_PARTIAL,
    );
    expect(CONFIDENCE_POLICY.COMBINED_PARTIAL).toBe(0.6);
  });

  it("근거가 없거나 직접 발화가 일치하지 않으면 0을 부여한다", () => {
    expect(sourceConfidence("UNKNOWN")).toBe(CONFIDENCE_POLICY.UNKNOWN);
    expect(directTextConfidence("없는병원", "내일 병원에 가요.")).toBe(
      CONFIDENCE_POLICY.UNKNOWN,
    );
    expect(CONFIDENCE_POLICY.UNKNOWN).toBe(0);
  });
});
