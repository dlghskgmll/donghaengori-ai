import {
  completeTeamIntake,
  TeamCompleteInputSchema,
  TeamIntakeWriteError,
} from "@/lib/ai/teamIntakeWrite";

function errorResponse(status: number, message: string, gate?: unknown) {
  return Response.json(
    gate === undefined ? { error: message } : { error: message, gate },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!/^[1-9]\d{0,11}$/.test(id)) {
    return errorResponse(400, "접수 번호가 올바르지 않습니다.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "동행 완료 요청을 확인해 주세요.");
  }

  const parsed = TeamCompleteInputSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "동행 완료 입력값을 확인해 주세요.");
  }

  try {
    const result = await completeTeamIntake(Number(id), parsed.data, {
      authorization: request.headers.get("authorization"),
    });
    return Response.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof TeamIntakeWriteError) {
      // 409 는 확정 전이거나 이미 완료 — 요청이 틀린 것이 아니라 상태다.
      return errorResponse(error.status, error.message, error.gate);
    }
    return errorResponse(502, "동행 완료를 반영하지 못했습니다.");
  }
}
