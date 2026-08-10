import { describe, expect, it, vi } from "vitest";
import { analyzeIntakeRequest } from "../lib/ai/analyzeIntake";
import { IntakeProviderError } from "../lib/ai/errors";
import {
  MockIntakeAnalysisProvider,
  type IntakeAnalysisProvider,
  type IntakeProviderRoute,
} from "../lib/ai/provider";
import type { IntakeAnalysis } from "../lib/ai/schema";
import { fixtures } from "./fixtures";

function routeWith(
  primary: IntakeAnalysisProvider,
  fallback: IntakeAnalysisProvider | null,
): IntakeProviderRoute {
  return {
    requestedProvider: "openai",
    primary,
    fallback,
    initialFallbackUsed: false,
    warnings: [],
    model: "gpt-5-mini",
  };
}

function failingProvider(code: "OPENAI_TIMEOUT" | "OPENAI_RATE_LIMIT") {
  return {
    name: "openai" as const,
    model: "gpt-5-mini",
    analyze: vi.fn(async () => {
      throw new IntakeProviderError(code, "test provider failure");
    }),
  };
}

describe("OpenAI provider fallback", () => {
  it("timeout이면 mock을 정확히 한 번 호출하고 metadata에 fallback을 기록한다", async () => {
    const primary = failingProvider("OPENAI_TIMEOUT");
    const mock = new MockIntakeAnalysisProvider();
    const fallbackSpy = vi.spyOn(mock, "analyze");

    const result = await analyzeIntakeRequest(fixtures.case7, {
      route: routeWith(primary, mock),
      intakeId: "INT-FALLBACK-1",
    });

    expect(primary.analyze).toHaveBeenCalledTimes(1);
    expect(fallbackSpy).toHaveBeenCalledTimes(1);
    expect(result.meta).toMatchObject({
      requested_provider: "openai",
      provider_used: "mock",
      model: "gpt-5-mini",
      fallback_used: true,
    });
    expect(result.meta.warnings).toContain("OPENAI_TIMEOUT");
    expect(result.meta.provider_latency_ms).toBeGreaterThanOrEqual(0);
    expect(result.meta.total_latency_ms).toBeGreaterThanOrEqual(0);
  });

  it("최종 스키마가 잘못된 OpenAI 결과도 mock으로 격리한다", async () => {
    const primary: IntakeAnalysisProvider = {
      name: "openai",
      model: "gpt-5-mini",
      analyze: vi.fn(async () => ({
        analysis: {} as IntakeAnalysis,
        warnings: [],
      })),
    };

    const result = await analyzeIntakeRequest(fixtures.case7, {
      route: routeWith(primary, new MockIntakeAnalysisProvider()),
      intakeId: "INT-FALLBACK-2",
    });

    expect(result.meta.provider_used).toBe("mock");
    expect(result.meta.warnings).toContain("OPENAI_SCHEMA_VALIDATION");
  });

  it("fallback이 비활성화되면 typed provider error를 그대로 전달한다", async () => {
    const primary = failingProvider("OPENAI_RATE_LIMIT");

    await expect(
      analyzeIntakeRequest(fixtures.case7, {
        route: routeWith(primary, null),
        intakeId: "INT-NO-FALLBACK",
      }),
    ).rejects.toMatchObject({ code: "OPENAI_RATE_LIMIT" });
  });
});
