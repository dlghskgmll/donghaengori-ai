import {
  fetchTeamProfiles,
  TeamProfileReadError,
} from "@/lib/ai/teamProfileRead";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function errorResponse(status: number, message: string) {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("query")?.trim() ?? "";
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null ? DEFAULT_LIMIT : Number(rawLimit);
  if (query.length > 100) return errorResponse(400, "검색어가 너무 깁니다.");
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return errorResponse(400, "limit 값이 올바르지 않습니다.");
  }

  try {
    const profiles = await fetchTeamProfiles(query, limit, {
      authorization: request.headers.get("authorization"),
    });
    return Response.json(
      { profiles },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof TeamProfileReadError) {
      return errorResponse(error.status, error.message);
    }
    return errorResponse(502, "대상자 목록을 불러오지 못했습니다.");
  }
}
