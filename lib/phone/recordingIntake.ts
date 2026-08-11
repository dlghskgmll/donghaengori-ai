import { analyzeIntakeRequest } from "../ai/analyzeIntake";
import { AnalyzeIntakeInputSchema } from "../ai/schema";
import { transcribeAudioFile } from "../ai/transcribe";
import type { AnalyzeIntakeResponse } from "../ai/schema";
import type { PhoneRecordingCompleteEvent } from "./types";

// 브라우저 업로드용 /api/v1/transcriptions와 동일한 제한을 전화 녹음에도 적용한다.
export const MAX_PHONE_AUDIO_BYTES = 15 * 1024 * 1024;

const ALLOWED_AUDIO_TYPES = [
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/m4a",
  "audio/x-m4a",
  "audio/aac",
  "audio/flac",
];

export type PhoneIntakeErrorCode =
  | "RECORDING_URL_INVALID"
  | "RECORDING_EMPTY"
  | "RECORDING_TOO_LARGE"
  | "RECORDING_UNSUPPORTED_TYPE"
  | "RECORDING_DOWNLOAD_FAILED";

export class PhoneIntakeError extends Error {
  readonly code: PhoneIntakeErrorCode;

  constructor(
    code: PhoneIntakeErrorCode,
    message: string,
    options: { cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "PhoneIntakeError";
    this.code = code;
  }
}

function isAllowedAudioType(mimeType: string) {
  const baseType = mimeType.split(";")[0].trim().toLowerCase();
  return ALLOWED_AUDIO_TYPES.includes(baseType);
}

function fileNameFor(mimeType: string) {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  if (base === "audio/mp4") return "recording.mp4";
  if (base === "audio/mpeg" || base === "audio/mp3") return "recording.mp3";
  if (base === "audio/wav" || base === "audio/x-wav") return "recording.wav";
  if (base === "audio/ogg") return "recording.ogg";
  if (base === "audio/m4a" || base === "audio/x-m4a") return "recording.m4a";
  if (base === "audio/aac") return "recording.aac";
  if (base === "audio/flac") return "recording.flac";
  return "recording.webm";
}

const PRIVATE_IPV4_HOST_PATTERN =
  /^(127\.|10\.|192\.168\.|169\.254\.|0\.)|^172\.(1[6-9]|2\d|3[01])\./;

function isPrivateIPv4(address: string) {
  return PRIVATE_IPV4_HOST_PATTERN.test(address);
}

function isPrivateIPv6(address: string) {
  if (address === "::1" || address === "::") return true;

  // IPv4-mapped (::ffff:127.0.0.1 또는 정규화된 ::ffff:7f00:1) → 내부의 IPv4로 판정.
  const mapped = address.match(/^::ffff:(.+)$/);
  if (mapped) {
    const tail = mapped[1];
    if (tail.includes(".")) return isPrivateIPv4(tail);
    const parts = tail.split(":");
    if (parts.length === 2) {
      const hi = Number.parseInt(parts[0], 16);
      const lo = Number.parseInt(parts[1], 16);
      if (Number.isFinite(hi) && Number.isFinite(lo)) {
        const ipv4 = `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
        return isPrivateIPv4(ipv4);
      }
    }
  }

  // fe80::/10 link-local, fc00::/7 ULA.
  if (/^fe[89ab]/.test(address)) return true;
  if (/^f[cd]/.test(address)) return true;
  return false;
}

function isBlockedHostname(hostname: string) {
  let normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  // FQDN 루트 표기("localhost.")를 정규화한다.
  if (normalized.endsWith(".")) normalized = normalized.slice(0, -1);
  if (normalized === "localhost" || normalized.endsWith(".localhost")) return true;
  if (normalized.includes(":")) return isPrivateIPv6(normalized);
  return isPrivateIPv4(normalized);
}

// 테스트/재사용을 위해 hostname 차단 판정을 노출한다.
export function isBlockedRecordingHost(hostname: string): boolean {
  return isBlockedHostname(hostname);
}

// 외부 recording URL은 신뢰하지 않는다: https 전용, 내부망 주소 차단.
// 한계: hostname이 공개 DNS 이름이면 파싱 시점에 해석된 IP를 알 수 없어
// DNS rebinding(공개 이름 → 내부 IP)은 이 계층에서 막지 못한다. 서명 게이트와
// redirect 금지로 완화하며, 완전한 방어는 해석된 IP 검증(Phase 4B)에서 다룬다.
export function parseRecordingUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PhoneIntakeError(
      "RECORDING_URL_INVALID",
      "녹음 파일 주소가 올바르지 않습니다.",
    );
  }
  if (url.protocol !== "https:" || isBlockedHostname(url.hostname)) {
    throw new PhoneIntakeError(
      "RECORDING_URL_INVALID",
      "허용되지 않는 녹음 파일 주소입니다.",
    );
  }
  return url;
}

export interface DownloadedRecording {
  data: Blob;
  mimeType: string;
}

export type RecordingDownloader = (
  recordingUrl: URL,
) => Promise<DownloadedRecording>;

export const defaultRecordingDownloader: RecordingDownloader = async (
  recordingUrl,
) => {
  let response: Response;
  try {
    response = await fetch(recordingUrl, {
      // redirect를 따라가면 https/내부망 차단을 우회할 수 있으므로 금지한다.
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new PhoneIntakeError(
      "RECORDING_DOWNLOAD_FAILED",
      "녹음 파일을 가져오지 못했습니다.",
      { cause: error },
    );
  }
  if (!response.ok) {
    throw new PhoneIntakeError(
      "RECORDING_DOWNLOAD_FAILED",
      "녹음 파일을 가져오지 못했습니다.",
    );
  }

  // Content-Length는 녹음 서버가 제어하므로 신뢰하지 않는다. 명시적으로 초과를
  // 선언하면 조기 거부하되, 없거나 거짓이어도 실제 수신 바이트를 한도로 강제한다.
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PHONE_AUDIO_BYTES) {
    throw new PhoneIntakeError("RECORDING_TOO_LARGE", "녹음 파일이 너무 큽니다.");
  }

  const mimeType =
    response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ??
    "";

  const buffer = await readBodyWithLimit(response, MAX_PHONE_AUDIO_BYTES);
  return { data: new Blob([buffer], { type: mimeType }), mimeType };
};

async function readBodyWithLimit(
  response: Response,
  maxBytes: number,
): Promise<ArrayBuffer> {
  const reader = response.body?.getReader();
  if (!reader) {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes) {
      throw new PhoneIntakeError("RECORDING_TOO_LARGE", "녹음 파일이 너무 큽니다.");
    }
    return buffer;
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw new PhoneIntakeError(
          "RECORDING_TOO_LARGE",
          "녹음 파일이 너무 큽니다.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged.buffer;
}

export interface ProcessedCallStore {
  // true면 이번 호출이 처리 소유권을 가진다. 이미 처리했거나 처리 중이면 false.
  claim(key: string): boolean;
  // 처리 실패 시 소유권을 반환해 provider 재전송이 다시 시도될 수 있게 한다.
  release(key: string): void;
}

export class InMemoryProcessedCallStore implements ProcessedCallStore {
  private readonly keys = new Set<string>();
  private readonly insertionOrder: string[] = [];

  constructor(private readonly maxEntries = 1_000) {}

  claim(key: string): boolean {
    if (this.keys.has(key)) return false;
    this.keys.add(key);
    this.insertionOrder.push(key);
    while (this.insertionOrder.length > this.maxEntries) {
      const oldest = this.insertionOrder.shift();
      if (oldest !== undefined) this.keys.delete(oldest);
    }
    return true;
  }

  release(key: string): void {
    this.keys.delete(key);
  }
}

// TODO(Phase 4B): in-memory store는 서버 재시작·다중 인스턴스에서 유지되지 않는다.
// production 전에는 영속 저장(idempotency key 테이블 등)으로 교체해야 한다.
export const sharedProcessedCallStore = new InMemoryProcessedCallStore();

export interface PhoneRecordingIntakeDeps {
  downloadRecording: RecordingDownloader;
  transcribe: typeof transcribeAudioFile;
  analyze: typeof analyzeIntakeRequest;
  store: ProcessedCallStore;
}

export function defaultPhoneRecordingIntakeDeps(): PhoneRecordingIntakeDeps {
  return {
    downloadRecording: defaultRecordingDownloader,
    transcribe: transcribeAudioFile,
    analyze: analyzeIntakeRequest,
    store: sharedProcessedCallStore,
  };
}

export type PhoneRecordingIntakeResult =
  | { duplicate: true }
  | { duplicate: false; transcript: string; result: AnalyzeIntakeResponse };

export async function processRecordingComplete(
  event: PhoneRecordingCompleteEvent,
  deps: PhoneRecordingIntakeDeps,
): Promise<PhoneRecordingIntakeResult> {
  const recordingUrl = parseRecordingUrl(event.recording_url);
  if (event.duration_seconds <= 0) {
    throw new PhoneIntakeError(
      "RECORDING_EMPTY",
      "빈 녹음은 접수할 수 없습니다.",
    );
  }

  const idempotencyKey = `${event.call_id}::${event.recording_url}`;
  // 한계: claim은 처리 시작 즉시 소유권을 잡는다. sequential 재전송(provider의
  // 일반적 재시도 패턴)은 실패 시 release로 다시 시도 가능하지만, 원 처리가
  // 아직 진행 중일 때 도착한 concurrent 재전송은 duplicate로 응답한다.
  // 진행중/완료 상태 구분은 영속 idempotency 저장(Phase 4B)에서 다룬다.
  if (!deps.store.claim(idempotencyKey)) {
    return { duplicate: true };
  }

  try {
    const recording = await deps.downloadRecording(recordingUrl);
    if (recording.data.size === 0) {
      throw new PhoneIntakeError(
        "RECORDING_EMPTY",
        "빈 녹음은 접수할 수 없습니다.",
      );
    }
    if (recording.data.size > MAX_PHONE_AUDIO_BYTES) {
      throw new PhoneIntakeError(
        "RECORDING_TOO_LARGE",
        "녹음 파일이 너무 큽니다.",
      );
    }
    if (!isAllowedAudioType(recording.mimeType)) {
      throw new PhoneIntakeError(
        "RECORDING_UNSUPPORTED_TYPE",
        "지원하지 않는 녹음 형식입니다.",
      );
    }

    const audioFile = new File(
      [recording.data],
      fileNameFor(recording.mimeType),
      { type: recording.mimeType },
    );
    const transcription = await deps.transcribe(audioFile);
    const input = AnalyzeIntakeInputSchema.parse({
      caller_phone: event.caller_phone,
      transcript: transcription.transcript,
    });
    const result = await deps.analyze(input, {
      intakeId: `PHONE-${event.call_id}`,
    });

    return { duplicate: false, transcript: transcription.transcript, result };
  } catch (error) {
    deps.store.release(idempotencyKey);
    throw error;
  }
}
