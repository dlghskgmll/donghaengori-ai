import { createHmac, timingSafeEqual } from "node:crypto";
import type { IntakeAnalysis } from "../ai/schema";
import { personRepository } from "../data/personRepository";
import { PHONE_MAX_RECORDING_SECONDS } from "./types";
import { MAX_WEBHOOK_BODY_BYTES } from "./webhook";

// ClawOps 전용 adapter. vendor 계약(form-urlencoded, X-Signature, VoiceML)은
// 이 파일과 route의 clawops 분기 안에만 존재해야 하며,
// Care Memory / AI domain layer로 침투하지 않는다.

export function isClawOpsEnabled(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return environment.PHONE_PROVIDER?.trim().toLowerCase() === "clawops";
}

export interface ClawOpsConfig {
  signingSecret: string | null;
  baseUrl: string | null;
  accountId: string | null;
}

export function loadClawOpsConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ClawOpsConfig {
  const baseUrlRaw = environment.APP_BASE_URL?.trim() ?? "";
  return {
    signingSecret: environment.PHONE_WEBHOOK_SECRET?.trim() || null,
    baseUrl: baseUrlRaw ? baseUrlRaw.replace(/\/+$/, "") : null,
    accountId: environment.CLAWOPS_ACCOUNT_ID?.trim() || null,
  };
}

// --- Signature -------------------------------------------------------------
// ClawOps 계약: webhook URL 문자열 + (key 알파벳 오름차순으로 key+value 연결)
// 을 HMAC-SHA256 후 Base64. X-Signature 헤더와 timing-safe 비교.

export function computeClawOpsSignature(
  signingSecret: string,
  url: string,
  params: Record<string, string>,
): string {
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((key) => key + params[key])
      .join("");
  return createHmac("sha256", signingSecret).update(data).digest("base64");
}

export function verifyClawOpsSignature(options: {
  signingSecret: string;
  url: string;
  params: Record<string, string>;
  signature: string | null;
}): boolean {
  if (!options.signature) return false;
  const expected = computeClawOpsSignature(
    options.signingSecret,
    options.url,
    options.params,
  );
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(options.signature.trim(), "utf8");
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

// --- Payload ---------------------------------------------------------------

export function parseFormBody(rawBody: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(rawBody)) {
    params[key] = value;
  }
  return params;
}

// 발신번호는 본인확정이 아니라 IDENTITY_CANDIDATE lookup key로만 쓴다.
// +82 국가번호를 국내 표기(0 접두)로 바꾸고, Care Memory fixture와 같은
// 하이픈 표기로 정규화한다 (repository 비교는 숫자 기준이므로 표기는 참고용).
export function normalizeCallerPhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("82") && digits.length >= 10) {
    digits = `0${digits.slice(2)}`;
  }
  if (!digits) return "";
  if (digits.length === 11 && digits.startsWith("01")) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10 && digits.startsWith("0")) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

// 본선 데모 전용 매핑: 시연자 실제 발신번호를 가상 환자 fixture의 등록번호로
// 치환해 Care Memory 후보 조회가 가능하게 한다. 본인확인이 아니며,
// env 미설정 시 일반 unknown-caller 흐름을 그대로 탄다.
export async function resolveCallerLookupPhone(
  normalizedFrom: string,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const demoPhone = environment.DEMO_CALLER_PHONE?.trim();
  const demoPatientId = environment.DEMO_CALLER_PATIENT_ID?.trim();
  if (!demoPhone || !demoPatientId || !normalizedFrom) return normalizedFrom;
  if (normalizeCallerPhone(demoPhone) !== normalizedFrom) return normalizedFrom;

  const persons = await personRepository.findAll();
  const person = persons.find((entry) => entry.person_id === demoPatientId);
  return person ? person.phone : normalizedFrom;
}

// --- VoiceML ---------------------------------------------------------------

export const CLAWOPS_GREETING =
  "안녕하세요. AI가 병원동행 접수를 도와드리는 동행고리AI입니다. 병원에 가실 내용을 편하게 말씀해 주세요.";

export const CLAWOPS_MESSAGES = {
  accepted:
    "네, 말씀해주신 내용을 접수하겠습니다. 담당자가 확인 후 연락드리겠습니다. 감사합니다.",
  needsReview:
    "네, 확인이 필요한 내용이 있습니다. 담당자가 확인 후 연락드리겠습니다. 감사합니다.",
  failure:
    "말씀해주신 내용을 바로 확인하지 못했습니다. 담당자가 확인 후 연락드리겠습니다. 감사합니다.",
} as const;

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildClawOpsGreetingVoiceML(options: {
  actionUrl: string;
  greeting?: string;
}): string {
  const greeting = options.greeting ?? CLAWOPS_GREETING;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Response>",
    `  <Say language="ko-KR">${escapeXml(greeting)}</Say>`,
    `  <Record action="${escapeXml(options.actionUrl)}" maxLength="${PHONE_MAX_RECORDING_SECONDS}" finishOnKey="#" playBeep="false"/>`,
    "</Response>",
  ].join("\n");
}

export function buildClawOpsSayHangupVoiceML(message: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Response>",
    `  <Say language="ko-KR">${escapeXml(message)}</Say>`,
    "  <Hangup/>",
    "</Response>",
  ].join("\n");
}

export function clawOpsXmlResponse(xml: string, status = 200): Response {
  return new Response(xml, {
    status,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

// 접수는 항상 사람이 최종 확정한다(human_review_required=true).
// 여기서의 구분은 "추가 확인이 필요한 항목이 남았는지"에 대한 안내 선택일 뿐이다.
export function analysisNeedsFollowUp(analysis: IntakeAnalysis): boolean {
  if (analysis.safety.signal_detected) return true;
  if (analysis.appointment.date.status !== "CONFIRMED_BY_INPUT") return true;
  if (analysis.appointment.time.status !== "CONFIRMED_BY_INPUT") return true;
  if (
    !analysis.hospital.candidates.some(
      (candidate) => candidate.status === "CONFIRMED_BY_INPUT",
    )
  ) {
    return true;
  }
  return false;
}

// --- 공통 webhook 수신 처리 --------------------------------------------------

function jsonError(status: number, message: string): Response {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export type ClawOpsWebhookRead =
  | { ok: true; params: Record<string, string>; config: ClawOpsConfig }
  | { ok: false; response: Response };

export async function readClawOpsWebhook(
  request: Request,
  callbackPath: string,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<ClawOpsWebhookRead> {
  const config = loadClawOpsConfig(environment);
  if (!config.signingSecret || !config.baseUrl) {
    // 서명 검증 URL과 secret이 모두 있어야 안전하게 열 수 있다.
    return {
      ok: false,
      response: jsonError(503, "전화 접수가 아직 준비되지 않았습니다."),
    };
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/x-www-form-urlencoded")) {
    return {
      ok: false,
      response: jsonError(400, "지원하지 않는 요청 형식입니다."),
    };
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BODY_BYTES) {
    return { ok: false, response: jsonError(413, "요청 본문이 너무 큽니다.") };
  }
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BODY_BYTES) {
    return { ok: false, response: jsonError(413, "요청 본문이 너무 큽니다.") };
  }

  const params = parseFormBody(rawBody);
  const signedUrl = `${config.baseUrl}${callbackPath}`;
  const signature = request.headers.get("x-signature");
  if (
    !verifyClawOpsSignature({
      signingSecret: config.signingSecret,
      url: signedUrl,
      params,
      signature,
    })
  ) {
    return {
      ok: false,
      response: jsonError(401, "요청 서명이 유효하지 않습니다."),
    };
  }

  if (config.accountId && params.AccountId !== config.accountId) {
    return {
      ok: false,
      response: jsonError(403, "허용되지 않은 계정의 요청입니다."),
    };
  }

  return { ok: true, params, config };
}
