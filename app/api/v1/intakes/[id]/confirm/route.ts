import {
  confirmTeamIntake,
  TeamConfirmInputSchema,
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
    return errorResponse(400, "확정 요청을 확인해 주세요.");
  }

  const parsed = TeamConfirmInputSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "확정 입력값을 확인해 주세요.");
  }

  try {
    const result = await confirmTeamIntake(Number(id), parsed.data, {
      authorization: request.headers.get("authorization"),
    });
    return Response.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof TeamIntakeWriteError) {
      // 409 는 gate 를 함께 돌려준다 — 화면이 무엇이 막는지 다시 그린다.
      return errorResponse(error.status, error.message, error.gate);
    }
    return errorResponse(502, "접수를 확정하지 못했습니다.");
  }
}
