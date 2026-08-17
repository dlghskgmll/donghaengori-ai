import {
  fetchTeamProfile,
  TeamProfileReadError,
} from "@/lib/ai/teamProfileRead";

function errorResponse(status: number, message: string) {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ phone: string }> },
) {
  const { phone } = await context.params;
  const digits = phone.replace(/\D/g, "");
  if (!/^0\d{9,10}$/.test(digits)) {
    return errorResponse(400, "대상자 연락처가 올바르지 않습니다.");
  }

  try {
    const profile = await fetchTeamProfile(digits, {
      authorization: request.headers.get("authorization"),
    });
    return Response.json(profile, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof TeamProfileReadError) {
      return errorResponse(error.status, error.message);
    }
    return errorResponse(502, "Care Profile을 불러오지 못했습니다.");
  }
}
