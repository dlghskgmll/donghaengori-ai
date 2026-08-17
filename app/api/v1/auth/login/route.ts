import { z } from "zod";
import {
  loginTeamProfile,
  TeamProfileReadError,
} from "@/lib/ai/teamProfileRead";

const LoginBody = z.object({
  userId: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
});

function errorResponse(status: number, message: string) {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "로그인 요청을 확인해 주세요.");
  }
  const parsed = LoginBody.safeParse(body);
  if (!parsed.success) return errorResponse(400, "아이디와 비밀번호를 확인해 주세요.");

  try {
    const session = await loginTeamProfile(parsed.data.userId, parsed.data.password);
    return Response.json(session, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof TeamProfileReadError) {
      return errorResponse(error.status, error.message);
    }
    return errorResponse(502, "로그인 서비스에 연결하지 못했습니다.");
  }
}
