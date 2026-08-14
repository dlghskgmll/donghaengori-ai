import { IntakeProviderError } from "@/lib/ai/errors";
import { toSavedIntakeDetail } from "@/lib/ai/savedIntakeView";
import { fetchTeamIntakeDetail } from "@/lib/ai/teamIntakeRead";

// 저장된 접수 상세 read-only proxy.
// id는 양의 정수만 허용한다 — 임의 경로가 backend URL에 붙지 않게 한다.

function errorResponse(status: number, message: string) {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!/^[1-9]\d{0,11}$/.test(id)) {
    // 검증 실패 시 backend를 호출하지 않는다.
    return errorResponse(400, "접수 번호가 올바르지 않습니다.");
  }

  try {
    const detail = await fetchTeamIntakeDetail(Number(id));
    return Response.json(toSavedIntakeDetail(detail), {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const code =
      error instanceof IntakeProviderError ? error.code : "TEAM_READ_UNKNOWN";
    console.error("saved intake detail failed", { intake_id: id, code });
    return errorResponse(502, "요청 내용을 불러오지 못했습니다.");
  }
}
