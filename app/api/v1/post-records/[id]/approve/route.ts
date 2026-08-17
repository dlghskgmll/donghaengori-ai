import {
  decideTeamPostRecord,
  TeamPostRecordError,
} from "@/lib/ai/teamPostRecord";

function errorResponse(status: number, message: string) {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!/^[1-9]\d{0,11}$/.test(id)) {
    return errorResponse(400, "사후기록 번호가 올바르지 않습니다.");
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "처리 요청을 확인해 주세요.");
  }
  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as { approved?: unknown }).approved !== "boolean"
  ) {
    return errorResponse(400, "승인 여부가 올바르지 않습니다.");
  }

  try {
    const result = await decideTeamPostRecord(
      Number(id),
      (body as { approved: boolean }).approved,
      { authorization: request.headers.get("authorization") },
    );
    return Response.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof TeamPostRecordError) {
      return errorResponse(error.status, error.message);
    }
    return errorResponse(502, "사후기록을 처리하지 못했습니다.");
  }
}
