export type VoiceRecorderState = "idle" | "recording" | "transcribing";

export interface TrackLike {
  stop(): void;
}

export interface MediaStreamLike {
  getTracks(): TrackLike[];
}

export interface MediaRecorderLike {
  state: "inactive" | "recording" | "paused";
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  start(): void;
  stop(): void;
}

export interface VoiceTranscription {
  transcript: string;
  needsReview: boolean | null;
}

export interface VoiceRecorderOptions {
  maxDurationMs: number;
  // 아래 세 함수는 실패 시 사용자에게 그대로 보여줄 한국어 메시지를 담은 Error를 던진다.
  acquireStream(): Promise<MediaStreamLike>;
  createRecorder(stream: MediaStreamLike): MediaRecorderLike;
  transcribe(audio: Blob, mimeType: string): Promise<VoiceTranscription>;
}

export interface VoiceRecorderCallbacks {
  onStateChange(state: VoiceRecorderState): void;
  onElapsedSeconds(seconds: number): void;
  onTranscript(result: VoiceTranscription): void;
  onError(message: string): void;
}

const GENERIC_MIC_ERROR = "마이크를 사용할 수 없습니다. 내용을 직접 입력해 주세요.";
const GENERIC_STT_ERROR =
  "음성 변환에 실패했습니다. 다시 시도하거나 직접 입력해 주세요.";

export class VoiceRecorderController {
  private state: VoiceRecorderState = "idle";
  private starting = false;
  private cancelled = false;
  private recorder: MediaRecorderLike | null = null;
  private stream: MediaStreamLike | null = null;
  private chunks: Blob[] = [];
  private elapsedSeconds = 0;
  private maxTimer: ReturnType<typeof setTimeout> | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly options: VoiceRecorderOptions,
    private readonly callbacks: VoiceRecorderCallbacks,
  ) {}

  getState(): VoiceRecorderState {
    return this.state;
  }

  async start(): Promise<void> {
    // 녹음/변환 중이거나 시작 처리 중이면 무시한다 — 이중 시작 방지.
    if (this.state !== "idle" || this.starting) return;
    this.starting = true;

    try {
      const stream = await this.options.acquireStream();
      let recorder: MediaRecorderLike;
      try {
        recorder = this.options.createRecorder(stream);
      } catch (error) {
        stream.getTracks().forEach((track) => track.stop());
        throw error;
      }

      this.stream = stream;
      this.recorder = recorder;
      this.chunks = [];
      this.cancelled = false;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.chunks.push(event.data);
      };
      recorder.onstop = () => this.handleRecorderStop();

      recorder.start();
      this.setState("recording");
      this.elapsedSeconds = 0;
      this.callbacks.onElapsedSeconds(0);
      this.tickTimer = setInterval(() => {
        this.elapsedSeconds += 1;
        this.callbacks.onElapsedSeconds(this.elapsedSeconds);
      }, 1_000);
      this.maxTimer = setTimeout(() => this.stop(), this.options.maxDurationMs);
    } catch (error) {
      this.callbacks.onError(
        error instanceof Error && error.message ? error.message : GENERIC_MIC_ERROR,
      );
      this.setState("idle");
    } finally {
      this.starting = false;
    }
  }

  stop(): void {
    if (this.state !== "recording") return;
    if (this.recorder && this.recorder.state !== "inactive") {
      this.recorder.stop();
    }
  }

  cancel(): void {
    if (this.state !== "recording") return;
    this.cancelled = true;
    if (this.recorder && this.recorder.state !== "inactive") {
      this.recorder.stop();
    }
  }

  dispose(): void {
    this.clearTimers();
    this.releaseMedia();
  }

  private setState(state: VoiceRecorderState) {
    this.state = state;
    this.callbacks.onStateChange(state);
  }

  private clearTimers() {
    if (this.maxTimer !== null) {
      clearTimeout(this.maxTimer);
      this.maxTimer = null;
    }
    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  private releaseMedia() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.recorder = null;
  }

  private handleRecorderStop() {
    this.clearTimers();
    const recordedType = this.recorder?.mimeType || "audio/webm";
    const blob = new Blob(this.chunks, { type: recordedType });
    this.chunks = [];
    this.releaseMedia();

    if (this.cancelled) {
      // 취소된 녹음은 STT를 호출하지 않고 그대로 폐기한다.
      this.cancelled = false;
      this.setState("idle");
      return;
    }

    if (blob.size === 0) {
      this.callbacks.onError("녹음된 음성이 없습니다. 다시 녹음해 주세요.");
      this.setState("idle");
      return;
    }

    this.setState("transcribing");
    void this.runTranscription(blob, recordedType);
  }

  private async runTranscription(blob: Blob, mimeType: string) {
    try {
      const result = await this.options.transcribe(blob, mimeType);
      this.callbacks.onTranscript(result);
    } catch (error) {
      this.callbacks.onError(
        error instanceof Error && error.message ? error.message : GENERIC_STT_ERROR,
      );
    } finally {
      this.setState("idle");
    }
  }
}
