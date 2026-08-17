import {
  logoutTeamProfile,
  TeamProfileReadError,
} from "@/lib/ai/teamProfileRead";

export async function POST(request: Request) {
  try {
    await logoutTeamProfile(request.headers.get("authorization"));
    return Response.json(
      { ok: true },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const status = error instanceof TeamProfileReadError ? error.status : 502;
    const message =
      error instanceof TeamProfileReadError
        ? error.message
        : "로그아웃 서비스에 연결하지 못했습니다.";
    return Response.json(
      { error: message },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
