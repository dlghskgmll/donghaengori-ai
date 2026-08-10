import { ZodError } from "zod";
import { analyzeIntake } from "@/lib/ai/analyzeIntake";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const analysis = await analyzeIntake(body);

    return Response.json(analysis, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        {
          error: "입력 또는 AI 분석 결과의 형식이 올바르지 않습니다.",
          details: error.issues.map((issue) => issue.message),
        },
        { status: 400 },
      );
    }

    console.error("intake analysis failed", error);
    return Response.json(
      { error: "분석 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }
}
