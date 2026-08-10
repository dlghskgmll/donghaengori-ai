import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/v1/intakes/analyze/route";
import {
  AnalyzeIntakeApiResponseSchema,
  IntakeAnalysisSchema,
} from "../lib/ai/schema";
import { fixtures } from "./fixtures";

afterEach(() => {
  vi.unstubAllEnvs();
});

function requestFor(body: unknown) {
  return new Request("http://localhost/api/v1/intakes/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("intake analyze route metadata", () => {
  it("기존 최상위 분석 구조를 유지하고 optional metadata와 no-store 헤더를 반환한다", async () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    const response = await POST(requestFor(fixtures.case1));
    const payload: unknown = await response.json();
    const parsed = AnalyzeIntakeApiResponseSchema.parse(payload);
    const legacyAnalysis = IntakeAnalysisSchema.parse(payload);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(legacyAnalysis.schema_version).toBe("1.0");
    expect(parsed.status).toBe("DRAFT_AI");
    expect(parsed.meta).toMatchObject({
      requested_provider: "mock",
      provider_used: "mock",
      fallback_used: false,
      model: null,
    });
  });

  it("openai 모드에 key가 없으면 raw 오류 없이 mock fallback metadata를 반환한다", async () => {
    vi.stubEnv("AI_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("AI_FALLBACK_TO_MOCK", "true");

    const response = await POST(requestFor(fixtures.case7));
    const payload: unknown = await response.json();
    const parsed = AnalyzeIntakeApiResponseSchema.parse(payload);

    expect(response.status).toBe(200);
    expect(parsed.meta).toMatchObject({
      requested_provider: "openai",
      provider_used: "mock",
      fallback_used: true,
    });
    expect(parsed.meta?.warnings).toEqual(["OPENAI_API_KEY_MISSING"]);
    expect(JSON.stringify(payload)).not.toMatch(/stack|sk-[A-Za-z0-9]/);
  });

  it("잘못된 입력은 분석을 시작하지 않고 400으로 거절한다", async () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    const response = await POST(requestFor({ transcript: "" }));
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe("입력 형식이 올바르지 않습니다.");
  });
});
