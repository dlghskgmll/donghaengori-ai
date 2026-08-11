import { createHmac, timingSafeEqual } from "node:crypto";

// provider 확정 전의 generic 서명 방식: HMAC-SHA256(hex) over raw body.
// 실제 provider가 정해지면 그 provider의 서명 방식을 구현한
// PhoneWebhookVerifier adapter로 교체한다 (interface는 유지).
export const PHONE_SIGNATURE_HEADER = "x-phone-signature";

export interface PhoneWebhookVerifier {
  verify(rawBody: string, signature: string | null): boolean;
}

export class HmacPhoneWebhookVerifier implements PhoneWebhookVerifier {
  constructor(private readonly secret: string) {}

  verify(rawBody: string, signature: string | null): boolean {
    if (!signature) return false;
    const expected = createHmac("sha256", this.secret)
      .update(rawBody)
      .digest("hex");
    const expectedBuffer = Buffer.from(expected, "utf8");
    const receivedBuffer = Buffer.from(signature.trim().toLowerCase(), "utf8");
    if (expectedBuffer.length !== receivedBuffer.length) return false;
    return timingSafeEqual(expectedBuffer, receivedBuffer);
  }
}

export function loadPhoneWebhookVerifier(
  environment: NodeJS.ProcessEnv = process.env,
): PhoneWebhookVerifier | null {
  const secret = environment.PHONE_WEBHOOK_SECRET?.trim();
  return secret ? new HmacPhoneWebhookVerifier(secret) : null;
}

// webhook JSON payload의 합리적 상한. 서명 검증 전에 대용량 body가 메모리로
// 들어오는 것을 막는 1차 방어선이다.
export const MAX_WEBHOOK_BODY_BYTES = 64 * 1024;

export type VerifiedWebhookBody =
  | { ok: true; rawBody: string }
  | { ok: false; status: 401 | 413 | 503; message: string };

export async function readVerifiedWebhookBody(
  request: Request,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<VerifiedWebhookBody> {
  const verifier = loadPhoneWebhookVerifier(environment);
  if (!verifier) {
    // secret 미설정 상태에서 endpoint가 열려 있으면 안 되므로 전부 거부한다.
    return {
      ok: false,
      status: 503,
      message: "전화 접수가 아직 준비되지 않았습니다.",
    };
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BODY_BYTES) {
    return { ok: false, status: 413, message: "요청 본문이 너무 큽니다." };
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BODY_BYTES) {
    return { ok: false, status: 413, message: "요청 본문이 너무 큽니다." };
  }

  const signature = request.headers.get(PHONE_SIGNATURE_HEADER);
  if (!verifier.verify(rawBody, signature)) {
    return { ok: false, status: 401, message: "요청 서명이 유효하지 않습니다." };
  }
  return { ok: true, rawBody };
}
