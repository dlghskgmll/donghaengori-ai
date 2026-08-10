import { describe, expect, it } from "vitest";
import { analyzeIntakeRequest } from "../lib/ai/analyzeIntake";
import { loadIntakeAIConfig } from "../lib/ai/config";
import { resolveIntakeProviderRoute } from "../lib/ai/provider";
import { fixtures } from "./fixtures";

const hasApiKey = Boolean(process.env.OPENAI_API_KEY?.trim());

if (!hasApiKey) {
  console.log("SKIPPED: OPENAI_API_KEY is not set; no network call was made.");
}

describe.skipIf(!hasApiKey)("OpenAI 실제 API smoke test", () => {
  it(
    hasApiKey
      ? "가상 데이터 CASE 9, 10, 11, 12, 15, 16의 안전 invariant를 검증한다"
      : "SKIPPED: OPENAI_API_KEY is not set; no network call was made",
    async () => {
      const config = loadIntakeAIConfig({
        ...process.env,
        AI_PROVIDER: "openai",
        AI_FALLBACK_TO_MOCK: "false",
      });
      const route = resolveIntakeProviderRoute(config);

      const cases = [
        {
          id: "CASE 9",
          input: fixtures.case9,
          verify: (result: Awaited<ReturnType<typeof analyzeIntakeRequest>>) => {
            expect(result.analysis.hospital.candidates[0]).toMatchObject({
              name: "순천가상정형외과",
              status: "INFERRED",
            });
            expect(result.analysis.appointment.date.value).toBeNull();
          },
        },
        {
          id: "CASE 10",
          input: fixtures.case10,
          verify: (result: Awaited<ReturnType<typeof analyzeIntakeRequest>>) => {
            expect(result.analysis.hospital.candidates[0]).toMatchObject({
              name: "광주새봄병원",
              status: "CONFIRMED_BY_INPUT",
            });
            expect(result.analysis.department.status).toBe("CONFIRMED_BY_INPUT");
            expect(result.analysis.appointment.date.value).toBe("2026-08-20");
            expect(result.analysis.appointment.time.value).toBe("15:00");
          },
        },
        {
          id: "CASE 11",
          input: fixtures.case11,
          verify: (result: Awaited<ReturnType<typeof analyzeIntakeRequest>>) => {
            expect(result.analysis.hospital.candidates[0]).toMatchObject({
              name: "보성가상안과",
              status: "INFERRED",
            });
            expect(result.analysis.appointment.date.value).toBeNull();
          },
        },
        {
          id: "CASE 12",
          input: fixtures.case12,
          verify: (result: Awaited<ReturnType<typeof analyzeIntakeRequest>>) => {
            expect(result.analysis.hospital.candidates).toEqual([]);
            expect(result.analysis.appointment.date.value).toBe("2026-08-11");
          },
        },
        {
          id: "CASE 15",
          input: fixtures.case15,
          verify: (result: Awaited<ReturnType<typeof analyzeIntakeRequest>>) => {
            expect(result.analysis.safety.signal_detected).toBe(true);
            expect(result.analysis.safety.human_escalation_required).toBe(true);
            expect(result.analysis.safety.medical_judgement).toBe(false);
          },
        },
        {
          id: "CASE 16",
          input: fixtures.case16,
          verify: (result: Awaited<ReturnType<typeof analyzeIntakeRequest>>) => {
            expect(result.status).toBe("DRAFT_AI");
            expect(result.analysis.caller.person_candidates).toEqual([]);
            expect(result.analysis.appointment.date.value).toBe("2026-08-11");
            expect(result.analysis.department.value).toBe("정형외과");
            expect(result.analysis.human_review_required).toBe(true);
          },
        },
      ];

      for (const scenario of cases) {
        const result = await analyzeIntakeRequest(scenario.input, {
          route,
          intakeId: `SMOKE-${scenario.id.replace(" ", "-")}`,
        });
        expect(result.meta.provider_used).toBe("openai");
        expect(result.meta.fallback_used).toBe(false);
        scenario.verify(result);
        console.log(`${scenario.id}: PASS`);
      }
    },
  );
});
