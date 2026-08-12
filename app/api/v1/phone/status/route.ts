import { isClawOpsEnabled, readClawOpsWebhook } from "@/lib/phone/clawops";
import {
  PhoneStatusEventSchema,
  type PhoneCallStatus,
} from "@/lib/phone/types";
import { readVerifiedWebhookBody } from "@/lib/phone/webhook";

function errorResponse(status: number, message: string) {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

// 문서로 확인된 ClawOps CallStatus만 대응한다. initiated는 통화 시도 시작,
// rejected는 수신 거절이므로 각각 ringing/failed로 매핑한다.
const CLAWOPS_STATUS_MAP: Record<string, PhoneCallStatus> = {
  initiated: "ringing",
  ringing: "ringing",
  answered: "answered",
  completed: "completed",
  busy: "busy",
  failed: "failed",
  rejected: "failed",
};

async function handleClawOpsStatus(request: Request) {
  const read = await readClawOpsWebhook(request, "/api/v1/phone/status");
  if (!read.ok) return read.response;

  const callId = read.params.CallId?.trim();
  const rawStatus = read.params.CallStatus?.trim().toLowerCase() ?? "";
  const status = CLAWOPS_STATUS_MAP[rawStatus];
  if (!callId || !status) {
    return errorResponse(400, "webhook payload가 올바르지 않습니다.");
  }

  if (status === "failed" || status === "busy") {
    console.warn("phone call did not complete", { call_id: callId, status });
  } else {
    console.info("phone call status", { call_id: callId, status });
  }

  return Response.json(
    { received: true, call_id: callId, status },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  if (isClawOpsEnabled()) {
    return handleClawOpsStatus(request);
  }

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
