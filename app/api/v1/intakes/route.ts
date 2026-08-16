import { IntakeProviderError } from "@/lib/ai/errors";
import { toSavedIntakeSummary } from "@/lib/ai/savedIntakeView";
import { fetchTeamIntakes } from "@/lib/ai/teamIntakeRead";

// 저장된 접수 목록 read-only proxy.
// 브라우저는 TEAM_AI_BASE_URL을 알 필요가 없다 — 서버에서만 읽는다.

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200; // 팀 API가 le=200으로 제한한다.

// UI가 5초마다 이 경로를 다시 읽는다. backend가 꺼져 있는 동안 같은 실패를
// 매번 찍으면 로그가 의미를 잃는다 — 상태가 바뀔 때만 남긴다.
let lastFailureCode: string | null = null;

function logFailureOnce(code: string) {
  if (lastFailureCode === code) return;
  lastFailureCode = code;
  // backend URL·stack은 남기지 않는다.
  console.error("saved intake list failed", { code });
}

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
    lastFailureCode = null;
    return Response.json(
      { intakes: rows.map(toSavedIntakeSummary) },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const code =
      error instanceof IntakeProviderError ? error.code : "TEAM_READ_UNKNOWN";
    logFailureOnce(code);
    return errorResponse(502, "요청 목록을 불러오지 못했습니다.");
  }
}
