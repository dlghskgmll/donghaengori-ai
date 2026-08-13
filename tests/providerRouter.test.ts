import { describe, expect, it } from "vitest";
import {
  loadIntakeAIConfig,
  type IntakeAIConfig,
} from "../lib/ai/config";
import { IntakeProviderError } from "../lib/ai/errors";
import {
  MockIntakeAnalysisProvider,
  resolveIntakeProviderRoute,
  type IntakeAnalysisProvider,
  type IntakeProviderFactories,
} from "../lib/ai/provider";

function createFactories() {
  const mock = new MockIntakeAnalysisProvider();
  const openai = {
    name: "openai" as const,
    model: "gpt-5-mini",
    async analyze() {
      throw new Error("Router tests must not call a provider.");
    },
  } satisfies IntakeAnalysisProvider;

  const factories: IntakeProviderFactories = {
    mock: () => mock,
    openai: () => openai,
  };

  return { factories, mock, openai };
}

function config(overrides: Partial<IntakeAIConfig> = {}): IntakeAIConfig {
  return {
    provider: "mock",
    apiKey: null,
    model: "gpt-5-mini",
    timeoutMs: 15_000,
    maxRetries: 1,
    fallbackToMock: true,
    teamBaseUrl: "http://localhost:8000",
    teamTimeoutMs: 30_000,
    ...overrides,
  };
}

describe("intake provider router", () => {
  it("AI_PROVIDER=mock이면 Mock provider만 선택한다", () => {
    const { factories, mock } = createFactories();
    const route = resolveIntakeProviderRoute(config(), factories);

    expect(route.requestedProvider).toBe("mock");
    expect(route.primary).toBe(mock);
    expect(route.fallback).toBeNull();
    expect(route.initialFallbackUsed).toBe(false);
  });

  it("AI_PROVIDER=auto이고 API key가 없으면 Mock provider를 선택한다", () => {
    const { factories, mock } = createFactories();
    const route = resolveIntakeProviderRoute(
      config({ provider: "auto", apiKey: null }),
      factories,
    );

    expect(route.requestedProvider).toBe("auto");
    expect(route.primary).toBe(mock);
    expect(route.fallback).toBeNull();
    expect(route.initialFallbackUsed).toBe(false);
  });

  it("AI_PROVIDER=auto이고 API key가 있으면 OpenAI와 Mock fallback을 선택한다", () => {
    const { factories, mock, openai } = createFactories();
    const route = resolveIntakeProviderRoute(
      config({ provider: "auto", apiKey: "test-key" }),
      factories,
    );

    expect(route.primary).toBe(openai);
    expect(route.fallback).toBe(mock);
    expect(route.model).toBe("gpt-5-mini");
    expect(route.initialFallbackUsed).toBe(false);
  });

  it("AI_PROVIDER=openai이고 API key가 있으면 OpenAI를 선택한다", () => {
    const { factories, openai } = createFactories();
    const route = resolveIntakeProviderRoute(
      config({ provider: "openai", apiKey: "test-key", fallbackToMock: false }),
      factories,
    );

    expect(route.requestedProvider).toBe("openai");
    expect(route.primary).toBe(openai);
    expect(route.fallback).toBeNull();
  });

  it("AI_PROVIDER=openai이지만 key가 없고 fallback이 켜져 있으면 Mock으로 안전하게 전환한다", () => {
    const { factories, mock } = createFactories();
    const route = resolveIntakeProviderRoute(
      config({ provider: "openai", apiKey: null, fallbackToMock: true }),
      factories,
    );

    expect(route.primary).toBe(mock);
    expect(route.initialFallbackUsed).toBe(true);
    expect(route.warnings).toContain("OPENAI_API_KEY_MISSING");
  });

  it("지원하지 않는 AI_PROVIDER는 명시적인 설정 오류로 거부한다", () => {
    let caught: unknown;

    try {
      loadIntakeAIConfig({ NODE_ENV: "test", AI_PROVIDER: "unsupported" });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(IntakeProviderError);
    expect((caught as IntakeProviderError).code).toBe("AI_PROVIDER_CONFIG");
    expect((caught as IntakeProviderError).fallbackEligible).toBe(false);
  });
});
