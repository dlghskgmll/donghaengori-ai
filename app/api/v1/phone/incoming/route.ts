import {
  PhoneIncomingEventSchema,
  buildRecordCommand,
} from "@/lib/phone/types";
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
