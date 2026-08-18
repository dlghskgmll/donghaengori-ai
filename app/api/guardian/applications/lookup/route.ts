// 신청 조회. 신청번호 + 보호자 전화번호가 모두 맞아야 한다.
//
// 보안 규칙(§6):
//  - GET이 아니라 POST를 쓴다. 전화번호가 URL·쿼리스트링·referrer·로그에 남지 않는다.
//  - "번호는 있는데 전화번호가 틀림"과 "번호 자체가 없음"을 구분하지 않는다.
//    두 경우 모두 같은 404 + 같은 문구를 돌려준다(신청 존재 여부 비노출).

import { LookupSchema } from "@/lib/guardian/domain/validation";
import { getApplicationRepository, PersistenceNotConfiguredError } from "@/lib/guardian/repository";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const NOT_FOUND_MESSAGE =
  "신청 정보를 찾지 못했어요. 신청번호와 휴대폰 번호를 다시 확인해주세요.";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: NOT_FOUND_MESSAGE }, { status: 404, headers: NO_STORE });
  }

  const parsed = LookupSchema.safeParse(body);
  if (!parsed.success) {
    // 입력 형식이 틀린 경우도 같은 문구로 응답한다 — 어느 쪽이 틀렸는지 알리지 않는다.
    return Response.json({ error: NOT_FOUND_MESSAGE }, { status: 404, headers: NO_STORE });
  }

  try {
    const repository = getApplicationRepository();
    const application = await repository.findByApplicationNumberAndPhone(
      parsed.data.applicationNumber,
      parsed.data.guardianPhone,
    );
    if (!application) {
      return Response.json({ error: NOT_FOUND_MESSAGE }, { status: 404, headers: NO_STORE });
    }
    return Response.json({ application }, { status: 200, headers: NO_STORE });
  } catch (error) {
    if (error instanceof PersistenceNotConfiguredError) {
      return Response.json(
        { error: "신청 내역을 조회할 수 없습니다. 관리자에게 문의해 주세요.", code: error.code },
        { status: 503, headers: NO_STORE },
      );
    }
    console.error("application lookup failed");
    return Response.json(
      { error: "잠시 문제가 발생했어요. 조금 뒤 다시 시도해주세요." },
      { status: 500, headers: NO_STORE },
    );
  }
}
