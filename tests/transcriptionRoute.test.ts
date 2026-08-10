import { afterEach, describe, expect, it, vi } from "vitest";
import { TranscriptionError, loadTranscriptionConfig } from "../lib/ai/transcribe";
import { TranscriptionApiResponseSchema } from "../lib/ai/transcriptionSchema";

const transcribeAudioFileMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai/transcribe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/ai/transcribe")>();
  return { ...actual, transcribeAudioFile: transcribeAudioFileMock };
});

const { POST } = await import("../app/api/v1/transcriptions/route");
const { transcribeAudioFile } = await vi.importActual<
  typeof import("../lib/ai/transcribe")
>("../lib/ai/transcribe");

afterEach(() => {
  transcribeAudioFileMock.mockReset();
  vi.unstubAllEnvs();
});

function audioRequest(file: File | null) {
  const form = new FormData();
  if (file) form.append("audio", file);
  return new Request("http://localhost/api/v1/transcriptions", {
    method: "POST",
    body: form,
  });
}

function fakeWebmFile(bytes: number) {
  return new File([new Uint8Array(bytes).fill(1)], "recording.webm", {
    type: "audio/webm",
  });
}

describe("transcriptions route", () => {
  it("CASE 17: 정상 STT 요청은 transcript와 provider metadata만 반환한다", async () => {
    transcribeAudioFileMock.mockResolvedValue({
      transcript: "김영자인데 내일 오전 10시에 순천 OO병원 정형외과 가려고요",
      provider_used: "openai",
      model: "gpt-4o-mini-transcribe",
    });

    const response = await POST(audioRequest(fakeWebmFile(2048)));
    const payload: unknown = await response.json();
    const parsed = TranscriptionApiResponseSchema.parse(payload);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(parsed.transcript).toBe(
      "김영자인데 내일 오전 10시에 순천 OO병원 정형외과 가려고요",
    );
    expect(parsed.provider_used).toBe("openai");
    expect(Object.keys(payload as object).sort()).toEqual([
      "latency_ms",
      "model",
      "provider_used",
      "transcript",
    ]);
    expect(JSON.stringify(payload)).not.toMatch(/sk-[A-Za-z0-9]|stack|api_key/i);
  });

  it("CASE 18: provider 실패 시 raw error와 secret 없이 안전한 오류를 반환한다", async () => {
    transcribeAudioFileMock.mockRejectedValue(
      new TranscriptionError("STT_PROVIDER_FAILED", "음성 변환 호출에 실패했습니다.", {
        cause: new Error("boom sk-FAKE1234567890 secret stack trace"),
      }),
    );

    const response = await POST(audioRequest(fakeWebmFile(2048)));
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(502);
    expect(payload.error).toBe(
      "음성 변환에 실패했습니다. 다시 시도하거나 직접 입력해 주세요.",
    );
    expect(JSON.stringify(payload)).not.toMatch(/sk-[A-Za-z0-9]|boom|stack/);
  });

  it("CASE 19: 빈 오디오 파일은 provider를 호출하지 않고 거절한다", async () => {
    const response = await POST(audioRequest(fakeWebmFile(0)));
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe(
      "빈 오디오 파일은 변환할 수 없습니다. 다시 녹음해 주세요.",
    );
    expect(transcribeAudioFileMock).not.toHaveBeenCalled();
  });

  it("CASE 19-보강: audio 파일 자체가 없으면 400으로 거절한다", async () => {
    const response = await POST(audioRequest(null));
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe("audio 파일이 필요합니다.");
    expect(transcribeAudioFileMock).not.toHaveBeenCalled();
  });

  it("CASE 19-보강: 지원하지 않는 MIME type은 415로 거절한다", async () => {
    const file = new File([new Uint8Array(64).fill(1)], "notes.txt", {
      type: "text/plain",
    });
    const response = await POST(audioRequest(file));

    expect(response.status).toBe(415);
    expect(transcribeAudioFileMock).not.toHaveBeenCalled();
  });

  it("CASE 20: provider가 빈 transcript를 반환하면 성공으로 처리하지 않는다", async () => {
    transcribeAudioFileMock.mockResolvedValue({
      transcript: "   ",
      provider_used: "openai",
      model: "gpt-4o-mini-transcribe",
    });

    const response = await POST(audioRequest(fakeWebmFile(2048)));
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(422);
    expect(payload.error).toBe(
      "음성을 인식하지 못했습니다. 다시 녹음하거나 직접 입력해 주세요.",
    );
  });
});

describe("transcribeAudioFile provider unit", () => {
  it("key가 없으면 provider를 호출하지 않고 OPENAI_API_KEY_MISSING을 던진다", async () => {
    const call = vi.fn();
    await expect(
      transcribeAudioFile(
        fakeWebmFile(64),
        { apiKey: null, model: "gpt-4o-mini-transcribe", timeoutMs: 15_000 },
        call,
      ),
    ).rejects.toMatchObject({ code: "OPENAI_API_KEY_MISSING" });
    expect(call).not.toHaveBeenCalled();
  });

  it("빈 transcript는 STT_EMPTY_TRANSCRIPT 오류로 처리한다", async () => {
    await expect(
      transcribeAudioFile(
        fakeWebmFile(64),
        { apiKey: "test-key", model: "gpt-4o-mini-transcribe", timeoutMs: 15_000 },
        async () => ({ text: "  " }),
      ),
    ).rejects.toMatchObject({ code: "STT_EMPTY_TRANSCRIPT" });
  });

  it("provider 예외는 TranscriptionError로 분류되고 transcript를 만들어내지 않는다", async () => {
    await expect(
      transcribeAudioFile(
        fakeWebmFile(64),
        { apiKey: "test-key", model: "gpt-4o-mini-transcribe", timeoutMs: 15_000 },
        async () => {
          throw new Error("network down");
        },
      ),
    ).rejects.toMatchObject({ code: "STT_PROVIDER_FAILED" });
  });

  it("환경변수 기본값으로 gpt-4o-mini-transcribe 모델을 사용한다", () => {
    const config = loadTranscriptionConfig({} as NodeJS.ProcessEnv);
    expect(config.model).toBe("gpt-4o-mini-transcribe");
    expect(config.apiKey).toBeNull();
    expect(config.timeoutMs).toBe(15_000);
  });
});
