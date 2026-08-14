import { IntakeProviderError } from "@/lib/ai/errors";
import { toSavedIntakeSummary } from "@/lib/ai/savedIntakeView";
import { fetchTeamIntakes } from "@/lib/ai/teamIntakeRead";

// 저장된 접수 목록 read-only proxy.
// 브라우저는 TEAM_AI_BASE_URL을 알 필요가 없다 — 서버에서만 읽는다.

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200; // 팀 API가 le=200으로 제한한다.

function errorResponse(status: number, message: string) {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("limit");
  const parsed = raw === null ? DEFAULT_LIMIT : Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
    return errorResponse(400, "limit 값이 올바르지 않습니다.");
  }

  try {
    const rows = await fetchTeamIntakes(parsed);
    return Response.json(
      { intakes: rows.map(toSavedIntakeSummary) },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const code =
      error instanceof IntakeProviderError ? error.code : "TEAM_READ_UNKNOWN";
    // backend URL·stack은 남기지 않는다.
    console.error("saved intake list failed", { code });
    return errorResponse(502, "요청 목록을 불러오지 못했습니다.");
  }
}
