"use client";

import { FormEvent, useRef, useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { VoiceInput } from "../VoiceInput";

export interface IntakeComposerValues {
  caller_phone: string;
  transcript: string;
}

interface IntakeComposerProps {
  onAnalyze: (values: IntakeComposerValues) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  initialValues?: IntakeComposerValues;
}

const SCENARIOS: Array<IntakeComposerValues & { id: string; label: string }> = [
  {
    id: "명시",
    label: "날짜·시간·병원 직접 발화",
    caller_phone: "010-2222-2222",
    transcript:
      "안녕하세요 김영자인데 내일 오전 10시에 순천가상병원 정형외과에 가려고요.",
  },
  {
    id: "이력",
    label: "‘저번 병원’ 후보 추론",
    caller_phone: "010-1111-1111",
    transcript: "나 모레 저번에 무릎 봐준 데 가야겄어.",
  },
  {
    id: "시간",
    label: "복수 시간 — 확인 필요",
    caller_phone: "",
    transcript: "10시에 진료 보고 9시에 출발해요.",
  },
];

export function IntakeComposer({
  onAnalyze,
  isLoading,
  error,
  initialValues,
}: IntakeComposerProps) {
  const [values, setValues] = useState<IntakeComposerValues>(
    initialValues ?? { caller_phone: "", transcript: "" },
  );
  const transcriptRef = useRef<HTMLTextAreaElement | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onAnalyze(values);
  };

  // STT 결과는 입력창에 채우기만 한다. 자동 분석은 하지 않는다 —
  // 어르신 발화를 담당자가 눈으로 확인하고 고칠 기회를 반드시 남긴다.
  const handleTranscript = (transcript: string) => {
    setValues((current) => ({
      ...current,
      transcript: current.transcript.trim()
        ? `${current.transcript.trimEnd()}\n${transcript}`
        : transcript,
    }));
    requestAnimationFrame(() => transcriptRef.current?.focus());
  };

  return (
    <main className="dc-detail">
      <div className="dc-detail-head">
        <span className="dc-detail-name">새 요청 접수</span>
        <span className="dc-detail-meta">
          음성으로 받아 적거나 직접 입력한 뒤 분석합니다
        </span>
      </div>

      <div className="dc-compose">
        <form onSubmit={handleSubmit} className="dc-compose-form">
          <label className="dc-field-block">
            <span className="dc-block-title">
              발신번호 <span className="dc-block-title-sub">선택</span>
            </span>
            <input
              type="tel"
              inputMode="tel"
              className="dc-input"
              placeholder="010-0000-0000"
              value={values.caller_phone}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  caller_phone: event.target.value,
                }))
              }
            />
            <span className="dc-hint">
              후보 식별에만 사용하며 대상자를 확정하지 않습니다.
            </span>
          </label>

          <VoiceInput disabled={isLoading} onTranscript={handleTranscript} />

          <label className="dc-field-block">
            <span className="dc-block-title">요청 내용</span>
            <textarea
              ref={transcriptRef}
              className="dc-textarea"
              rows={8}
              required
              placeholder="어르신 또는 보호자의 요청 내용을 그대로 입력하세요."
              value={values.transcript}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  transcript: event.target.value,
                }))
              }
            />
            <span className="dc-hint">
              {values.transcript.length} / 4,000 · 내용을 확인·수정한 뒤 분석해
              주세요.
            </span>
          </label>

          {error ? (
            <div className="dc-form-error" role="alert">
              {error}
            </div>
          ) : null}

          <button
            className="dc-btn-primary dc-btn-block"
            type="submit"
            disabled={isLoading || values.transcript.trim().length === 0}
          >
            {isLoading ? (
              <>
                <LoaderCircle className="spin" size={17} aria-hidden="true" />
                <span>분석 중…</span>
              </>
            ) : (
              <>
                <span>AI 접수카드 만들기</span>
                <ArrowRight size={17} aria-hidden="true" />
              </>
            )}
          </button>
        </form>

        <div className="dc-compose-side">
          <span className="dc-block-title">테스트 발화</span>
          <div className="dc-scenarios">
            {SCENARIOS.map((scenario) => (
              <button
                key={scenario.id}
                type="button"
                className="dc-scenario"
                onClick={() =>
                  setValues({
                    caller_phone: scenario.caller_phone,
                    transcript: scenario.transcript,
                  })
                }
              >
                <span className="dc-scenario-id">{scenario.id}</span>
                <span className="dc-scenario-label">{scenario.label}</span>
              </button>
            ))}
          </div>
          <p className="dc-compose-note">
            AI가 발화 내용과 이전 기록을 확인합니다. 수십 초가 걸릴 수 있습니다.
          </p>
        </div>
      </div>
    </main>
  );
}
