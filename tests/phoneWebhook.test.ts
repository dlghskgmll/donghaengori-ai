import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeIntakeRequest } from "../lib/ai/analyzeIntake";
import {
  InMemoryProcessedCallStore,
  MAX_PHONE_AUDIO_BYTES,
  PhoneIntakeError,
  defaultRecordingDownloader,
  isBlockedRecordingHost,
  parseRecordingUrl,
  processRecordingComplete,
  type PhoneRecordingIntakeDeps,
} from "../lib/phone/recordingIntake";
import {
  PHONE_GREETING_DEFAULT,
  PhoneRecordCommandSchema,
  type PhoneRecordingCompleteEvent,
} from "../lib/phone/types";

const routeDownloadMock = vi.hoisted(() => vi.fn());
const routeTranscribeMock = vi.hoisted(() => vi.fn());
const routeAnalyzeMock = vi.hoisted(() => vi.fn());
const routeStore = vi.hoisted(
  () => ({ current: null as unknown as { claim(k: string): boolean; release(k: string): void } }),
);

vi.mock("@/lib/phone/recordingIntake", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../lib/phone/recordingIntake")>();
  routeStore.current = new actual.InMemoryProcessedCallStore();
  return {
    ...actual,
    defaultPhoneRecordingIntakeDeps: () => ({
      downloadRecording: routeDownloadMock,
      transcribe: routeTranscribeMock,
      analyze: routeAnalyzeMock,
      store: routeStore.current,
    }),
  };
});

const { POST: incomingPost } = await import("../app/api/v1/phone/incoming/route");
const { POST: recordingCompletePost } = await import(
  "../app/api/v1/phone/recording-complete/route"
);
const { POST: statusPost } = await import("../app/api/v1/phone/status/route");

const TEST_SECRET = "test-phone-webhook-secret";

function sign(rawBody: string, secret = TEST_SECRET) {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

function webhookRequest(
  path: string,
  body: unknown,
  options: { signature?: string | null } = {},
) {
  const rawBody = JSON.stringify(body);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const signature =
    options.signature === undefined ? sign(rawBody) : options.signature;
  if (signature !== null) headers["x-phone-signature"] = signature;
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers,
    body: rawBody,
  });
}

function fakeAudio(bytes: number, mimeType = "audio/mpeg") {
  return {
    data: new Blob([new Uint8Array(bytes).fill(7)], { type: mimeType }),
    mimeType,
  };
}

function fakeAnalyzeResponse() {
  return {
    intake_id: "PHONE-TEST",
    status: "DRAFT_AI" as const,
    analysis: { human_review_required: true },
    meta: { provider_used: "mock" },
  };
}

let callCounter = 0;
function uniqueCallId() {
  callCounter += 1;
  return `call-${callCounter}-${Math.abs(Math.sin(callCounter)) * 1e9 | 0}`;
}

beforeEach(() => {
  vi.stubEnv("PHONE_WEBHOOK_SECRET", TEST_SECRET);
  vi.stubEnv("AI_PROVIDER", "mock");
  routeTranscribeMock.mockResolvedValue({
    transcript: "내일 병원에 가려고요",
    provider_used: "openai",
    model: "test",
  });
  routeAnalyzeMock.mockResolvedValue(fakeAnalyzeResponse());
  routeDownloadMock.mockResolvedValue(fakeAudio(2048));
});

afterEach(() => {
  vi.unstubAllEnvs();
  routeDownloadMock.mockReset();
  routeTranscribeMock.mockReset();
  routeAnalyzeMock.mockReset();
});

describe("phone incoming webhook", () => {
  it("CASE 35: 유효한 수신 webhook은 provider 중립 record command를 반환한다", async () => {
    const response = await incomingPost(
      webhookRequest("/api/v1/phone/incoming", {
        call_id: uniqueCallId(),
        caller_phone: "010-1111-1111",
      }),
    );
    const payload: unknown = await response.json();
    const command = PhoneRecordCommandSchema.parse(payload);

    expect(response.status).toBe(200);
    expect(command.action).toBe("record");
    expect(command.language).toBe("ko-KR");
    expect(command.greeting).toBe(PHONE_GREETING_DEFAULT);
    expect(command.max_duration_seconds).toBe(30);
    expect(command.callback_path).toBe("/api/v1/phone/recording-complete");
  });

  it("CASE 36: 서명이 잘못된 수신 webhook은 401로 거절한다", async () => {
    const response = await incomingPost(
      webhookRequest(
        "/api/v1/phone/incoming",
        { call_id: uniqueCallId() },
        { signature: "0".repeat(64) },
      ),
    );
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(401);
    expect(payload.error).toBe("요청 서명이 유효하지 않습니다.");
    expect(JSON.stringify(payload)).not.toContain(TEST_SECRET);
  });

  it("CASE 36-보강: secret 미설정이면 503으로 전부 거부한다", async () => {
    vi.stubEnv("PHONE_WEBHOOK_SECRET", "");
    const response = await incomingPost(
      webhookRequest("/api/v1/phone/incoming", { call_id: uniqueCallId() }),
    );
    expect(response.status).toBe(503);
  });

  it("CASE 36-보강: call_id 없는 payload는 400으로 거절한다", async () => {
    const response = await incomingPost(
      webhookRequest("/api/v1/phone/incoming", { caller_phone: "010" }),
    );
    expect(response.status).toBe(400);
  });
});

describe("phone recording-complete webhook (route boundary)", () => {
  it("CASE 38: duration 0인 빈 녹음은 다운로드 없이 400으로 거절한다", async () => {
    const response = await recordingCompletePost(
      webhookRequest("/api/v1/phone/recording-complete", {
        call_id: uniqueCallId(),
        recording_url: "https://recordings.example.com/a.mp3",
        duration_seconds: 0,
      }),
    );

    expect(response.status).toBe(400);
    expect(routeDownloadMock).not.toHaveBeenCalled();
    expect(routeAnalyzeMock).not.toHaveBeenCalled();
  });

  it("CASE 39: 초과 크기 녹음은 413, 미지원 형식은 415로 거절한다", async () => {
    routeDownloadMock.mockResolvedValueOnce(
      fakeAudio(MAX_PHONE_AUDIO_BYTES + 1),
    );
    const oversized = await recordingCompletePost(
      webhookRequest("/api/v1/phone/recording-complete", {
        call_id: uniqueCallId(),
        recording_url: "https://recordings.example.com/big.mp3",
        duration_seconds: 10,
      }),
    );
    expect(oversized.status).toBe(413);

    routeDownloadMock.mockResolvedValueOnce(fakeAudio(2048, "text/html"));
    const unsupported = await recordingCompletePost(
      webhookRequest("/api/v1/phone/recording-complete", {
        call_id: uniqueCallId(),
        recording_url: "https://recordings.example.com/page.html",
        duration_seconds: 10,
      }),
    );
    expect(unsupported.status).toBe(415);
    expect(routeAnalyzeMock).not.toHaveBeenCalled();
  });

  it("CASE 39-보강: http/내부망 recording URL은 400으로 거절한다", async () => {
    for (const recording_url of [
      "http://recordings.example.com/a.mp3",
      "https://127.0.0.1/a.mp3",
      "https://localhost/a.mp3",
      "https://192.168.0.10/a.mp3",
    ]) {
      const response = await recordingCompletePost(
        webhookRequest("/api/v1/phone/recording-complete", {
          call_id: uniqueCallId(),
          recording_url,
          duration_seconds: 10,
        }),
      );
      expect(response.status, recording_url).toBe(400);
    }
    expect(routeDownloadMock).not.toHaveBeenCalled();
  });

  it("CASE 40: 동일 call_id+recording 재전송은 분석을 다시 실행하지 않는다", async () => {
    const event = {
      call_id: uniqueCallId(),
      recording_url: "https://recordings.example.com/dup.mp3",
      duration_seconds: 8,
    };

    const first = await recordingCompletePost(
      webhookRequest("/api/v1/phone/recording-complete", event),
    );
    const firstPayload = (await first.json()) as { duplicate: boolean };
    const second = await recordingCompletePost(
      webhookRequest("/api/v1/phone/recording-complete", event),
    );
    const secondPayload = (await second.json()) as { duplicate: boolean };

    expect(first.status).toBe(200);
    expect(firstPayload.duplicate).toBe(false);
    expect(second.status).toBe(200);
    expect(secondPayload.duplicate).toBe(true);
    expect(routeAnalyzeMock).toHaveBeenCalledTimes(1);
    expect(routeDownloadMock).toHaveBeenCalledTimes(1);
  });

  it("CASE 40-보강: 처리 실패한 이벤트는 재전송 시 다시 시도할 수 있다", async () => {
    const event = {
      call_id: uniqueCallId(),
      recording_url: "https://recordings.example.com/retry.mp3",
      duration_seconds: 8,
    };
    routeAnalyzeMock.mockRejectedValueOnce(new Error("transient"));

    const first = await recordingCompletePost(
      webhookRequest("/api/v1/phone/recording-complete", event),
    );
    const second = await recordingCompletePost(
      webhookRequest("/api/v1/phone/recording-complete", event),
    );
    const secondPayload = (await second.json()) as { duplicate: boolean };

    expect(first.status).toBe(500);
    expect(second.status).toBe(200);
    expect(secondPayload.duplicate).toBe(false);
    expect(routeAnalyzeMock).toHaveBeenCalledTimes(2);
  });

  it("CASE 41: 서명이 잘못된 recording callback은 AI를 호출하지 않는다", async () => {
    const response = await recordingCompletePost(
      webhookRequest(
        "/api/v1/phone/recording-complete",
        {
          call_id: uniqueCallId(),
          recording_url: "https://recordings.example.com/a.mp3",
          duration_seconds: 8,
        },
        { signature: sign("{}", "wrong-secret") },
      ),
    );

    expect(response.status).toBe(401);
    expect(routeDownloadMock).not.toHaveBeenCalled();
    expect(routeTranscribeMock).not.toHaveBeenCalled();
    expect(routeAnalyzeMock).not.toHaveBeenCalled();
  });

  it("정상 recording callback은 안전한 요약만 반환한다", async () => {
    const call_id = uniqueCallId();
    const response = await recordingCompletePost(
      webhookRequest("/api/v1/phone/recording-complete", {
        call_id,
        recording_url: "https://recordings.example.com/ok.mp3",
        duration_seconds: 8,
        caller_phone: "010-1111-1111",
      }),
    );
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      call_id,
      duplicate: false,
      intake_id: "PHONE-TEST",
      status: "DRAFT_AI",
      human_review_required: true,
    });
    // 원문 transcript는 응답에 노출하지 않는다(provider 로그 유출 방지).
    expect(Object.keys(payload).sort()).toEqual([
      "call_id",
      "duplicate",
      "human_review_required",
      "intake_id",
      "status",
    ]);
    expect(payload).not.toHaveProperty("transcript");
    expect(JSON.stringify(payload)).not.toMatch(/sk-[A-Za-z0-9]|stack/);
  });

  it("CASE 41-보강: 서명 검증 전 과대 body는 413으로 거절한다", async () => {
    const rawBody = JSON.stringify({
      call_id: uniqueCallId(),
      recording_url: "https://recordings.example.com/a.mp3",
      duration_seconds: 8,
    });
    const request = new Request(
      "http://localhost/api/v1/phone/recording-complete",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "content-length": String(200 * 1024),
          "x-phone-signature": sign(rawBody),
        },
        body: rawBody,
      },
    );
    const response = await recordingCompletePost(request);

    expect(response.status).toBe(413);
    expect(routeDownloadMock).not.toHaveBeenCalled();
  });

  it("로그 위생: 서버 로그에 전화번호·recording URL·transcript·secret을 남기지 않는다", async () => {
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    routeAnalyzeMock.mockRejectedValueOnce(new Error("boom"));

    const secretPhone = "010-9876-5432";
    const secretUrl = "https://recordings.example.com/secret-file.mp3";
    routeTranscribeMock.mockResolvedValueOnce({
      transcript: "민감한 원문 발화 내용",
      provider_used: "openai",
      model: "test",
    });

    await recordingCompletePost(
      webhookRequest("/api/v1/phone/recording-complete", {
        call_id: uniqueCallId(),
        recording_url: secretUrl,
        duration_seconds: 8,
        caller_phone: secretPhone,
      }),
    );

    const logged = [...logSpy.mock.calls, ...infoSpy.mock.calls]
      .map((args) => JSON.stringify(args))
      .join(" ");
    expect(logged).not.toContain(secretPhone);
    expect(logged).not.toContain(secretUrl);
    expect(logged).not.toContain("secret-file");
    expect(logged).not.toContain("민감한 원문 발화");
    expect(logged).not.toContain(TEST_SECRET);

    logSpy.mockRestore();
    infoSpy.mockRestore();
  });
});

describe("phone status webhook", () => {
  it("CASE 42: completed 상태는 안전하게 수신 처리한다", async () => {
    const call_id = uniqueCallId();
    const response = await statusPost(
      webhookRequest("/api/v1/phone/status", { call_id, status: "completed" }),
    );
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ received: true, call_id, status: "completed" });
  });

  it("CASE 43: failed/busy 상태도 크래시 없이 안전 처리한다", async () => {
    for (const status of ["failed", "busy"] as const) {
      const response = await statusPost(
        webhookRequest("/api/v1/phone/status", {
          call_id: uniqueCallId(),
          status,
        }),
      );
      expect(response.status).toBe(200);
    }

    const unknown = await statusPost(
      webhookRequest("/api/v1/phone/status", {
        call_id: uniqueCallId(),
        status: "exploded",
      }),
    );
    expect(unknown.status).toBe(400);
  });
});

describe("phone recording intake orchestration (unit)", () => {
  function unitDeps(overrides: Partial<PhoneRecordingIntakeDeps> = {}) {
    const callOrder: string[] = [];
    const deps: PhoneRecordingIntakeDeps = {
      downloadRecording: vi.fn(async () => {
        callOrder.push("download");
        return fakeAudio(2048);
      }),
      transcribe: vi.fn(async () => {
        callOrder.push("transcribe");
        return {
          transcript: "내일 병원 가려고요",
          provider_used: "openai" as const,
          model: "test",
        };
      }),
      analyze: vi.fn(async () => {
        callOrder.push("analyze");
        return fakeAnalyzeResponse() as never;
      }),
      store: new InMemoryProcessedCallStore(),
      ...overrides,
    };
    return { deps, callOrder };
  }

  function event(
    overrides: Partial<PhoneRecordingCompleteEvent> = {},
  ): PhoneRecordingCompleteEvent {
    return {
      call_id: uniqueCallId(),
      recording_url: "https://recordings.example.com/unit.mp3",
      duration_seconds: 8,
      caller_phone: "",
      ...overrides,
    };
  }

  it("CASE 37: downloader → STT → Analyze 순서로 기존 파이프라인을 재사용한다", async () => {
    const { deps, callOrder } = unitDeps();
    const outcome = await processRecordingComplete(event(), deps);

    expect(callOrder).toEqual(["download", "transcribe", "analyze"]);
    expect(outcome.duplicate).toBe(false);
  });

  it("CASE 44: 모호한 발화는 phone 경로에서도 기존 safety를 유지한다", async () => {
    const { deps } = unitDeps({
      transcribe: vi.fn(async () => ({
        transcript: "나 모레 저번에 무릎 봐준 데 가야겄어.",
        provider_used: "openai" as const,
        model: "test",
      })),
      analyze: analyzeIntakeRequest,
    });

    const outcome = await processRecordingComplete(
      event({ caller_phone: "010-1111-1111" }),
      deps,
    );

    expect(outcome.duplicate).toBe(false);
    if (outcome.duplicate) throw new Error("unreachable");
    const analysis = outcome.result.analysis;
    expect(analysis.hospital.candidates[0]).toMatchObject({
      status: "INFERRED",
    });
    expect(analysis.human_review_required).toBe(true);
    expect(analysis.safety.medical_judgement).toBe(false);
    expect(outcome.result.meta.provider_used).toBe("mock");
  });

  it("CASE 44-보강: 복수 시간 발화는 phone 경로에서도 시간을 확정하지 않는다", async () => {
    const { deps } = unitDeps({
      transcribe: vi.fn(async () => ({
        transcript: "10시에 진료 보고 9시에 출발해요",
        provider_used: "openai" as const,
        model: "test",
      })),
      analyze: analyzeIntakeRequest,
    });

    const outcome = await processRecordingComplete(event(), deps);

    expect(outcome.duplicate).toBe(false);
    if (outcome.duplicate) throw new Error("unreachable");
    expect(outcome.result.analysis.appointment.time).toMatchObject({
      value: null,
      status: "NEEDS_CONFIRMATION",
    });
  });

  it("빈 다운로드 결과는 STT 없이 RECORDING_EMPTY로 거절한다", async () => {
    const { deps } = unitDeps({
      downloadRecording: vi.fn(async () => fakeAudio(0)),
    });

    await expect(processRecordingComplete(event(), deps)).rejects.toMatchObject({
      code: "RECORDING_EMPTY",
    });
    expect(deps.transcribe).not.toHaveBeenCalled();
  });
});

describe("recording URL SSRF blocklist (unit)", () => {
  it("내부망/loopback 주소는 IPv4·IPv6 표기 모두 차단한다", () => {
    const blocked = [
      "127.0.0.1",
      "10.0.0.5",
      "192.168.0.10",
      "169.254.1.1",
      "172.16.5.5",
      "localhost",
      "localhost.",
      "api.localhost",
      "[::1]",
      "[::ffff:127.0.0.1]",
      "[::ffff:10.0.0.5]",
      "[fe80::1]",
      "[fc00::1]",
      "[fd12:3456::1]",
    ];
    for (const host of blocked) {
      expect(isBlockedRecordingHost(host), host).toBe(true);
    }
  });

  it("공개 호스트는 허용한다", () => {
    for (const host of ["recordings.example.com", "8.8.8.8", "[2606:4700::1]"]) {
      expect(isBlockedRecordingHost(host), host).toBe(false);
    }
  });

  it("parseRecordingUrl은 http·내부망·IPv4-mapped IPv6를 거절하고 https 공개주소만 통과시킨다", () => {
    for (const url of [
      "http://recordings.example.com/a.mp3",
      "https://127.0.0.1/a.mp3",
      "https://localhost./a.mp3",
      "https://[::ffff:127.0.0.1]/a.mp3",
      "https://[fe80::1]/a.mp3",
    ]) {
      expect(() => parseRecordingUrl(url), url).toThrowError(PhoneIntakeError);
    }
    expect(() =>
      parseRecordingUrl("https://recordings.example.com/ok.mp3"),
    ).not.toThrow();
  });
});

describe("defaultRecordingDownloader (unit)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function streamResponse(
    chunks: Uint8Array[],
    init: { headers?: Record<string, string>; ok?: boolean } = {},
  ) {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    });
    return new Response(body, {
      status: init.ok === false ? 502 : 200,
      headers: init.headers ?? {},
    });
  }

  const url = new URL("https://recordings.example.com/a.mp3");

  it("선언된 content-length가 한도를 넘으면 다운로드 없이 RECORDING_TOO_LARGE로 거절한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamResponse([new Uint8Array(8)], {
          headers: {
            "content-type": "audio/mpeg",
            "content-length": String(MAX_PHONE_AUDIO_BYTES + 1),
          },
        }),
      ),
    );

    await expect(defaultRecordingDownloader(url)).rejects.toMatchObject({
      code: "RECORDING_TOO_LARGE",
    });
  });

  it("content-length가 없어도 실제 수신 바이트가 한도를 넘으면 스트리밍 중 차단한다", async () => {
    // content-length 헤더 없이 한도 초과 분량을 청크로 전송(거짓/부재 시나리오).
    const chunk = new Uint8Array(1024 * 1024).fill(1);
    const oversizedChunks = Array.from({ length: 16 }, () => chunk);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamResponse(oversizedChunks, {
          headers: { "content-type": "audio/mpeg" },
        }),
      ),
    );

    await expect(defaultRecordingDownloader(url)).rejects.toMatchObject({
      code: "RECORDING_TOO_LARGE",
    });
  });

  it("정상 응답은 mime과 함께 blob으로 반환한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamResponse([new Uint8Array(2048).fill(3)], {
          headers: {
            "content-type": "audio/mpeg; codecs=mp3",
            "content-length": "2048",
          },
        }),
      ),
    );

    const result = await defaultRecordingDownloader(url);
    expect(result.mimeType).toBe("audio/mpeg");
    expect(result.data.size).toBe(2048);
  });

  it("비정상 HTTP 응답은 RECORDING_DOWNLOAD_FAILED로 처리한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => streamResponse([], { ok: false })),
    );

    await expect(defaultRecordingDownloader(url)).rejects.toMatchObject({
      code: "RECORDING_DOWNLOAD_FAILED",
    });
  });
});
