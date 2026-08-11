import { PhoneStatusEventSchema } from "@/lib/phone/types";
import { readVerifiedWebhookBody } from "@/lib/phone/webhook";

function errorResponse(status: number, message: string) {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const verified = await readVerifiedWebhookBody(request);
  if (!verified.ok) {
    return errorResponse(verified.status, verified.message);
  }

  let event;
  try {
    event = PhoneStatusEventSchema.parse(JSON.parse(verified.rawBody));
  } catch {
    return errorResponse(400, "webhook payload가 올바르지 않습니다.");
  }

  // TODO(Phase 4B): 상태 이벤트 영속 저장. 지금은 검증 후 안전 응답까지만 담당한다.
  if (event.status === "failed" || event.status === "busy") {
    console.warn("phone call did not complete", {
      call_id: event.call_id,
      status: event.status,
    });
  } else {
    console.info("phone call status", {
      call_id: event.call_id,
      status: event.status,
    });
  }

  return Response.json(
    { received: true, call_id: event.call_id, status: event.status },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
