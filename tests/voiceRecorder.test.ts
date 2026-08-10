import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  VoiceRecorderController,
  type MediaRecorderLike,
  type MediaStreamLike,
  type VoiceRecorderCallbacks,
  type VoiceRecorderState,
} from "../lib/voice/recorderController";

class FakeRecorder implements MediaRecorderLike {
  state: "inactive" | "recording" | "paused" = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  private hasAudio: boolean;

  constructor(hasAudio: boolean) {
    this.hasAudio = hasAudio;
  }

  start() {
    this.state = "recording";
  }

  stop() {
    if (this.state === "inactive") {
      throw new Error("InvalidStateError: recorder is inactive");
    }
    this.state = "inactive";
    if (this.hasAudio) {
      this.ondataavailable?.({
        data: new Blob([new Uint8Array(256).fill(1)], { type: this.mimeType }),
      });
    }
    this.onstop?.();
  }
}

function makeStream(): MediaStreamLike & { stoppedTracks: number } {
  const stream = {
    stoppedTracks: 0,
    getTracks() {
      return [
        {
          stop: () => {
            stream.stoppedTracks += 1;
          },
        },
      ];
    },
  };
  return stream;
}

interface Harness {
  controller: VoiceRecorderController;
  transcribe: ReturnType<typeof vi.fn>;
  createRecorder: ReturnType<typeof vi.fn>;
  states: VoiceRecorderState[];
  transcripts: string[];
  errors: string[];
  elapsed: number[];
}

function makeHarness(options?: {
  hasAudio?: boolean;
  transcribeImpl?: () => Promise<string>;
}): Harness {
  const states: VoiceRecorderState[] = [];
  const transcripts: string[] = [];
  const errors: string[] = [];
  const elapsed: number[] = [];

  const transcribe = vi.fn(
    options?.transcribeImpl ?? (async () => "변환된 문장"),
  );
  const createRecorder = vi.fn(() => new FakeRecorder(options?.hasAudio ?? true));

  const callbacks: VoiceRecorderCallbacks = {
    onStateChange: (state) => states.push(state),
    onElapsedSeconds: (seconds) => elapsed.push(seconds),
    onTranscript: (transcript) => transcripts.push(transcript),
    onError: (message) => errors.push(message),
  };

  const controller = new VoiceRecorderController(
    {
      maxDurationMs: 30_000,
      acquireStream: async () => makeStream(),
      createRecorder,
      transcribe,
    },
    callbacks,
  );

  return { controller, transcribe, createRecorder, states, transcripts, errors, elapsed };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("voice recorder demo hardening", () => {
  it("CASE 21: 녹음 취소 시 STT를 호출하지 않고 다시 녹음 가능 상태로 돌아간다", async () => {
    const h = makeHarness();

    await h.controller.start();
    expect(h.controller.getState()).toBe("recording");

    h.controller.cancel();
    await vi.runAllTimersAsync();

    expect(h.transcribe).not.toHaveBeenCalled();
    expect(h.transcripts).toEqual([]);
    expect(h.errors).toEqual([]);
    expect(h.controller.getState()).toBe("idle");

    // 취소 후 즉시 다시 녹음을 시작할 수 있다.
    await h.controller.start();
    expect(h.controller.getState()).toBe("recording");
    expect(h.createRecorder).toHaveBeenCalledTimes(2);
  });

  it("CASE 22: 최대 녹음 시간 도달 시 자동 종료되고 STT는 1회만 호출된다", async () => {
    const h = makeHarness();

    await h.controller.start();
    expect(h.controller.getState()).toBe("recording");

    await vi.advanceTimersByTimeAsync(30_000);

    expect(h.transcribe).toHaveBeenCalledTimes(1);
    expect(h.controller.getState()).toBe("idle");
    expect(h.transcripts).toEqual(["변환된 문장"]);

    // 자동 종료 후 사용자가 종료 버튼을 다시 눌러도 중복 호출되지 않는다.
    h.controller.stop();
    await vi.runAllTimersAsync();
    expect(h.transcribe).toHaveBeenCalledTimes(1);
  });

  it("CASE 22-보강: 녹음 시간이 1초 단위로 보고된다", async () => {
    const h = makeHarness();

    await h.controller.start();
    await vi.advanceTimersByTimeAsync(3_000);

    expect(h.elapsed.slice(0, 4)).toEqual([0, 1, 2, 3]);
    h.controller.cancel();
  });

  it("CASE 23: 녹음 중 시작을 다시 요청해도 recorder가 중복 생성되지 않는다", async () => {
    const h = makeHarness();

    await h.controller.start();
    await h.controller.start();
    await h.controller.start();

    expect(h.createRecorder).toHaveBeenCalledTimes(1);

    // getUserMedia 대기 중 연타(경쟁 상태)도 이중 생성으로 이어지지 않는다.
    const h2 = makeHarness();
    await Promise.all([h2.controller.start(), h2.controller.start()]);
    expect(h2.createRecorder).toHaveBeenCalledTimes(1);
  });

  it("CASE 24: STT 오류 후 오류 메시지를 남기고 다시 녹음 가능 상태로 복귀한다", async () => {
    const h = makeHarness({
      transcribeImpl: async () => {
        throw new Error("음성 변환에 실패했습니다. 다시 시도하거나 직접 입력해 주세요.");
      },
    });

    await h.controller.start();
    h.controller.stop();
    await vi.runAllTimersAsync();

    // transcript 콜백이 호출되지 않으므로 기존 textarea 내용은 변경되지 않는다.
    expect(h.transcripts).toEqual([]);
    expect(h.errors).toEqual([
      "음성 변환에 실패했습니다. 다시 시도하거나 직접 입력해 주세요.",
    ]);
    expect(h.controller.getState()).toBe("idle");

    // 오류 후 재시도 가능.
    await h.controller.start();
    expect(h.controller.getState()).toBe("recording");
  });

  it("빈 녹음은 STT를 호출하지 않고 안내 후 idle로 복귀한다", async () => {
    const h = makeHarness({ hasAudio: false });

    await h.controller.start();
    h.controller.stop();
    await vi.runAllTimersAsync();

    expect(h.transcribe).not.toHaveBeenCalled();
    expect(h.errors).toEqual(["녹음된 음성이 없습니다. 다시 녹음해 주세요."]);
    expect(h.controller.getState()).toBe("idle");
  });

  it("마이크 획득 실패 시 사용자용 메시지를 보여주고 idle을 유지한다", async () => {
    const errors: string[] = [];
    const controller = new VoiceRecorderController(
      {
        maxDurationMs: 30_000,
        acquireStream: async () => {
          throw new Error(
            "마이크 권한이 거부되었습니다. 브라우저 설정에서 허용하거나 내용을 직접 입력해 주세요.",
          );
        },
        createRecorder: () => new FakeRecorder(true),
        transcribe: async () => "unused",
      },
      {
        onStateChange: () => {},
        onElapsedSeconds: () => {},
        onTranscript: () => {},
        onError: (message) => errors.push(message),
      },
    );

    await controller.start();
    expect(errors).toEqual([
      "마이크 권한이 거부되었습니다. 브라우저 설정에서 허용하거나 내용을 직접 입력해 주세요.",
    ]);
    expect(controller.getState()).toBe("idle");
  });
});
