import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { analyzeIntakeRequest } from "@/lib/ai/analyzeIntake";
import { IntakeProviderError } from "@/lib/ai/errors";
import {
  AnalyzeIntakeApiResponseSchema,
  AnalyzeIntakeInputSchema,
  type AnalyzeIntakeInput,
} from "@/lib/ai/schema";

export async function POST(request: Request) {
  const receivedAt = new Date().toISOString();
  let input: AnalyzeIntakeInput;
  try {
    const body: unknown = await request.json();
    input = AnalyzeIntakeInputSchema.parse(body);
  } catch (error) {
    const details =
      error instanceof ZodError
        ? error.issues.map((issue) => issue.message)
        : ["요청 본문은 올바른 JSON이어야 합니다."];

    return Response.json(
      {
        error: "입력 형식이 올바르지 않습니다.",
        details,
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const intakeId = randomUUID();
  try {
    const result = await analyzeIntakeRequest(input, { intakeId, receivedAt });
    const responseBody = AnalyzeIntakeApiResponseSchema.parse({
      ...result.analysis,
      intake_id: result.intake_id,
      status: result.status,
      meta: result.meta,
    });

    return Response.json(responseBody, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const errorCode =
      error instanceof IntakeProviderError ? error.code : "INTAKE_ANALYSIS_FAILED";
    console.error("intake analysis failed", {
      intake_id: intakeId,
      code: errorCode,
    });
    return Response.json(
      {
        error:
          error instanceof IntakeProviderError
            ? "실제 AI 분석에 실패했습니다. 기본 분석 모드를 사용할 수 없습니다."
            : "분석 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      },
      {
        status: error instanceof IntakeProviderError ? 503 : 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
