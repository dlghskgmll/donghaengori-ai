import {
  TeamIntakeWriteError,
  TeamVerifyInputSchema,
  verifyTeamIntakeField,
} from "@/lib/ai/teamIntakeWrite";

function errorResponse(status: number, message: string) {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * **이 경로는 "통화로 확인함" 을 뜻한다.**
 *
 * 화면에서 값을 고른 것(local 작업값)과 다르다. 부르면 감사 로그에 항목확인이
 * 남고 카드 근거에 "통화로 확인함" 이 붙는다 — 사회복지사가 어르신에게 전화를
 * 걸어 직접 확인했다는 기록이다.
 *
 * 그래서 화면의 '이 값 사용'(local)과 이 경로를 같은 버튼에 묶지 않는다.
 * 확인 전화를 마치고 들은 값을 적는 자리에서만 부른다.
 */
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
    return errorResponse(400, "확인 요청을 확인해 주세요.");
  }

  const parsed = TeamVerifyInputSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "확인 항목과 값을 확인해 주세요.");
  }

  try {
    const result = await verifyTeamIntakeField(Number(id), parsed.data, {
      authorization: request.headers.get("authorization"),
    });
    return Response.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof TeamIntakeWriteError) {
      return errorResponse(error.status, error.message);
    }
    return errorResponse(502, "확인 결과를 반영하지 못했습니다.");
  }
}
