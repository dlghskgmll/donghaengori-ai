// 신청 생성. 신청번호는 여기(서버)에서만 발급된다.

import { NewApplicationSchema } from "@/lib/guardian/domain/validation";
import { getApplicationRepository, PersistenceNotConfiguredError } from "@/lib/guardian/repository";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "요청을 해석하지 못했습니다." }, { status: 400, headers: NO_STORE });
  }

  const parsed = NewApplicationSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "신청 내용을 다시 확인해 주세요." },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const repository = getApplicationRepository();
    const application = await repository.create(parsed.data);
    // 생성 직후에는 방금 만든 본인이므로 상세를 그대로 돌려준다.
    return Response.json(
      { application, persistence: { provider: repository.provider, durable: repository.durable } },
      { status: 201, headers: NO_STORE },
    );
  } catch (error) {
    if (error instanceof PersistenceNotConfiguredError) {
      return Response.json(
        { error: "신청을 저장할 수 없습니다. 관리자에게 문의해 주세요.", code: error.code },
        { status: 503, headers: NO_STORE },
      );
    }
    console.error("application create failed");
    return Response.json(
      { error: "잠시 문제가 발생했어요. 조금 뒤 다시 시도해주세요." },
      { status: 500, headers: NO_STORE },
    );
  }
}
