"use client";

import { useEffect, useRef, useState } from "react";
import {
  CircleCheck,
  LoaderCircle,
  Mic,
  Square,
  TriangleAlert,
  X,
} from "lucide-react";
import { TranscriptionApiResponseSchema } from "@/lib/ai/transcriptionSchema";
import { getSttReviewMessage } from "@/lib/ui/sttReview";
import {
  VoiceRecorderController,
  type MediaRecorderLike,
  type MediaStreamLike,
  type VoiceRecorderState,
} from "@/lib/voice/recorderController";

interface VoiceInputProps {
  disabled: boolean;
  onTranscript: (transcript: string) => void;
}

export const MAX_RECORDING_MS = 30_000;

const PREFERRED_MIME_TYPES = ["audio/webm", "audio/mp4", "audio/ogg"];

export function SttReviewNotice({
  needsReview,
}: {
  needsReview: boolean | null | undefined;
}) {
  const message = getSttReviewMessage(needsReview);
  if (!message) return null;

  return (
    <div className="voice-review-warning" role="status" aria-live="polite">
      <TriangleAlert size={14} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const type of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

function fileNameFor(mimeType: string) {
  const base = mimeType.split(";")[0];
  if (base === "audio/mp4") return "recording.mp4";
  if (base === "audio/ogg") return "recording.ogg";
  return "recording.webm";
}

function formatSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

async function acquireMicrophoneStream(): Promise<MediaStreamLike> {
  if (
    !navigator.mediaDevices?.getUserMedia ||
    typeof MediaRecorder === "undefined"
  ) {
    throw new Error(
      "이 브라우저에서는 음성 입력을 사용할 수 없습니다. 내용을 직접 입력해 주세요.",
    );
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (caughtError) {
    const denied =
      caughtError instanceof DOMException &&
      (caughtError.name === "NotAllowedError" ||
        caughtError.name === "PermissionDeniedError");
    throw new Error(
      denied
        ? "마이크 권한이 거부되었습니다. 브라우저 설정에서 허용하거나 내용을 직접 입력해 주세요."
        : "마이크를 사용할 수 없습니다. 내용을 직접 입력해 주세요.",
    );
  }
}

function createMicrophoneRecorder(stream: MediaStreamLike): MediaRecorderLike {
  const mimeType = pickMimeType();
  let recorder: MediaRecorder;
  try {
    recorder = mimeType
      ? new MediaRecorder(stream as MediaStream, { mimeType })
      : new MediaRecorder(stream as MediaStream);
  } catch {
    throw new Error(
      "이 브라우저에서는 음성 녹음을 사용할 수 없습니다. 내용을 직접 입력해 주세요.",
    );
  }

  const adapter: MediaRecorderLike = {
    get state() {
      return recorder.state;
    },
    get mimeType() {
      return recorder.mimeType;
    },
    ondataavailable: null,
    onstop: null,
    start: () => recorder.start(),
    stop: () => recorder.stop(),
  };
  recorder.ondataavailable = (event) => adapter.ondataavailable?.(event);
  recorder.onstop = () => adapter.onstop?.();
  return adapter;
}

export async function requestTranscription(audio: Blob, mimeType: string) {
  const form = new FormData();
  form.append("audio", new File([audio], fileNameFor(mimeType), { type: mimeType }));
  const response = await fetch("/api/v1/transcriptions", {
    method: "POST",
    body: form,
  });
  const payload: unknown = await response.json();

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "음성 변환에 실패했습니다. 다시 시도하거나 직접 입력해 주세요.";
    throw new Error(message);
  }

  const validated = TranscriptionApiResponseSchema.safeParse(payload);
  if (!validated.success || !validated.data.transcript.trim()) {
    throw new Error("음성을 인식하지 못했습니다. 다시 녹음하거나 직접 입력해 주세요.");
  }
  return {
    transcript: validated.data.transcript,
    needsReview: validated.data.needs_review,
  };
}

export function VoiceInput({ disabled, onTranscript }: VoiceInputProps) {
  const [state, setState] = useState<VoiceRecorderState>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [transcriptReady, setTranscriptReady] = useState(false);
  const [needsReview, setNeedsReview] = useState<boolean | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const controllerRef = useRef<VoiceRecorderController | null>(null);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    const controller = new VoiceRecorderController(
      {
        maxDurationMs: MAX_RECORDING_MS,
        acquireStream: acquireMicrophoneStream,
        createRecorder: createMicrophoneRecorder,
        transcribe: requestTranscription,
      },
      {
        onStateChange: setState,
        onElapsedSeconds: setElapsedSeconds,
        onTranscript: (result) => {
          setTranscriptReady(true);
          setNeedsReview(result.needsReview);
          // Team이 돌려준 문장을 그대로 입력창에 옮긴다. 자동 보정·분석하지 않는다.
          onTranscriptRef.current(result.transcript);
        },
        onError: setError,
      },
    );
    controllerRef.current = controller;
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, []);

  const handleStart = () => {
    setError(null);
    setTranscriptReady(false);
    setNeedsReview(null);
    void controllerRef.current?.start();
  };

  return (
    <div className="voice-input">
      {state === "recording" ? (
        <div className="voice-recording-row">
          <button
            type="button"
            className="voice-button voice-button-stop"
            onClick={() => controllerRef.current?.stop()}
          >
            <Square size={14} aria-hidden="true" />
            <span>녹음 종료</span>
          </button>
          <button
            type="button"
            className="voice-button voice-button-cancel"
            onClick={() => controllerRef.current?.cancel()}
          >
            <X size={14} aria-hidden="true" />
            <span>녹음 취소</span>
          </button>
          <span className="voice-timer" role="status">
            <span className="recording-dot" aria-hidden="true" />
            녹음 중 {formatSeconds(elapsedSeconds)} / 최대{" "}
            {formatSeconds(MAX_RECORDING_MS / 1000)}
          </span>
        </div>
      ) : (
        <button
          type="button"
          className="voice-button"
          onClick={handleStart}
          disabled={disabled || state === "transcribing"}
        >
          {state === "transcribing" ? (
            <>
              <LoaderCircle className="spin" size={14} aria-hidden="true" />
              <span>음성을 텍스트로 변환 중…</span>
            </>
          ) : (
            <>
              <Mic size={14} aria-hidden="true" />
              <span>{transcriptReady ? "다시 녹음하기" : "음성 입력 시작"}</span>
            </>
          )}
        </button>
      )}
      {transcriptReady && state === "idle" && needsReview === true ? (
        <SttReviewNotice needsReview={needsReview} />
      ) : transcriptReady && state === "idle" ? (
        <div className="voice-success" role="status">
          <CircleCheck size={13} aria-hidden="true" />
          음성을 문자로 변환했습니다. 아래 내용을 확인하거나 수정한 뒤 ‘AI
          접수카드 만들기’를 눌러 주세요.
        </div>
      ) : (
        <span className="voice-help">
          변환된 문장은 아래 입력창에 표시되며, 확인·수정 후 분석 버튼을 눌러
          주세요.
        </span>
      )}
      {error ? (
        <div className="voice-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
