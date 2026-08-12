import {
  buildClawOpsGreetingVoiceML,
  clawOpsXmlResponse,
  isClawOpsEnabled,
  readClawOpsWebhook,
} from "@/lib/phone/clawops";
import {
  PhoneIncomingEventSchema,
  RECORDING_COMPLETE_CALLBACK_PATH,
  buildRecordCommand,
} from "@/lib/phone/types";
import { readVerifiedWebhookBody } from "@/lib/phone/webhook";

function errorResponse(status: number, message: string) {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

async function handleClawOpsIncoming(request: Request) {
  const read = await readClawOpsWebhook(request, "/api/v1/phone/incoming");
  if (!read.ok) return read.response;

  const callId = read.params.CallId?.trim();
  if (!callId) {
    return errorResponse(400, "webhook payload가 올바르지 않습니다.");
  }

  console.info("phone incoming call", { call_id: callId, provider: "clawops" });

  const actionUrl = `${read.config.baseUrl}${RECORDING_COMPLETE_CALLBACK_PATH}`;
  return clawOpsXmlResponse(buildClawOpsGreetingVoiceML({ actionUrl }));
}

export async function POST(request: Request) {
  if (isClawOpsEnabled()) {
    return handleClawOpsIncoming(request);
  }

  const verified = await readVerifiedWebhookBody(request);
  if (!verified.ok) {
    return errorResponse(verified.status, verified.message);
  }

  let event;
  try {
    event = PhoneIncomingEventSchema.parse(JSON.parse(verified.rawBody));
  } catch {
    return errorResponse(400, "webhook payload가 올바르지 않습니다.");
  }

  console.info("phone incoming call", { call_id: event.call_id });

  return Response.json(buildRecordCommand(), {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
