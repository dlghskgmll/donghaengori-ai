"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Mic, Square } from "lucide-react";
import { TranscriptionApiResponseSchema } from "@/lib/ai/transcriptionSchema";

type VoiceState = "idle" | "recording" | "transcribing";

interface VoiceInputProps {
  disabled: boolean;
  onTranscript: (transcript: string) => void;
}

const PREFERRED_MIME_TYPES = ["audio/webm", "audio/mp4", "audio/ogg"];

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

export function VoiceInput({ disabled, onTranscript }: VoiceInputProps) {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const releaseStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  };

  const sendForTranscription = async (blob: Blob, mimeType: string) => {
    setState("transcribing");
    try {
      const form = new FormData();
      form.append(
        "audio",
        new File([blob], fileNameFor(mimeType), { type: mimeType }),
      );
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

      onTranscript(validated.data.transcript.trim());
    } catch (caughtError) {
      setError(
        caughtError instanceof Error && caughtError.message
          ? caughtError.message
          : "음성 변환에 실패했습니다. 다시 시도하거나 직접 입력해 주세요.",
      );
    } finally {
      setState("idle");
    }
  };

  const startRecording = async () => {
    setError(null);
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError(
        "이 브라우저에서는 음성 입력을 사용할 수 없습니다. 내용을 직접 입력해 주세요.",
      );
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (caughtError) {
      const denied =
        caughtError instanceof DOMException &&
        (caughtError.name === "NotAllowedError" ||
          caughtError.name === "PermissionDeniedError");
      setError(
        denied
          ? "마이크 권한이 거부되었습니다. 브라우저 설정에서 허용하거나 내용을 직접 입력해 주세요."
          : "마이크를 사용할 수 없습니다. 내용을 직접 입력해 주세요.",
      );
      return;
    }

    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setError("이 브라우저에서는 음성 녹음을 사용할 수 없습니다. 내용을 직접 입력해 주세요.");
      return;
    }

    chunksRef.current = [];
    streamRef.current = stream;
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const recordedType = recorder.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: recordedType });
      chunksRef.current = [];
      releaseStream();

      if (blob.size === 0) {
        setError("녹음된 음성이 없습니다. 다시 녹음해 주세요.");
        setState("idle");
        return;
      }
      void sendForTranscription(blob, recordedType);
    };

    recorder.start();
    setState("recording");
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  };

  return (
    <div className="voice-input">
      {state === "recording" ? (
        <button
          type="button"
          className="voice-button voice-button-stop"
          onClick={stopRecording}
        >
          <Square size={14} aria-hidden="true" />
          <span>녹음 종료</span>
          <span className="recording-dot" aria-hidden="true" />
        </button>
      ) : (
        <button
          type="button"
          className="voice-button"
          onClick={startRecording}
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
              <span>음성 입력 시작</span>
            </>
          )}
        </button>
      )}
      <span className="voice-help">
        변환된 문장은 아래 입력창에 표시되며, 확인·수정 후 분석 버튼을 눌러
        주세요.
      </span>
      {error ? (
        <div className="voice-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
