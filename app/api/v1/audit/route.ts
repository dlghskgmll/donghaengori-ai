import {
  fetchTeamAudit,
  TeamPostRecordError,
} from "@/lib/ai/teamPostRecord";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

function errorResponse(status: number, message: string) {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("limit");
  const limit = raw === null ? DEFAULT_LIMIT : Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return errorResponse(400, "limit 값이 올바르지 않습니다.");
  }
  try {
    const audit = await fetchTeamAudit(limit, {
      authorization: request.headers.get("authorization"),
    });
    return Response.json(
      { audit },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof TeamPostRecordError) {
      return errorResponse(error.status, error.message);
    }
    return errorResponse(502, "처리 이력을 불러오지 못했습니다.");
  }
}
