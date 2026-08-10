"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, FlaskConical, Phone, Sparkles } from "lucide-react";
import { VoiceInput } from "./VoiceInput";

export interface IntakeFormValues {
  caller_phone: string;
  transcript: string;
}

interface IntakeFormProps {
  onAnalyze: (values: IntakeFormValues) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

const SCENARIOS: Array<
  IntakeFormValues & { id: string; label: string; hint: string }
> = [
  {
    id: "CASE 1",
    label: "정보 명확",
    hint: "날짜·시간·병원 직접 발화",
    caller_phone: "010-2222-2222",
    transcript:
      "안녕하세요 김영자인데 내일 오전 10시에 순천가상병원 정형외과에 가려고요.",
  },
  {
    id: "CASE 2",
    label: "과거 이력",
    hint: "‘저번 병원’ 후보 추론",
    caller_phone: "010-1111-1111",
    transcript: "나 모레 저번에 무릎 봐준 데 가야겄어.",
  },
  {
    id: "CASE 3",
    label: "이력 없음",
    hint: "추측 없이 확인 질문 생성",
    caller_phone: "010-5555-5555",
    transcript: "내일 병원 가야 하는데 저번 데로 가면 돼.",
  },
  {
    id: "CASE 4",
    label: "자기 수정",
    hint: "마지막 날짜 의도 반영",
    caller_phone: "",
    transcript: "내일 아니고 모레 가야 해.",
  },
  {
    id: "CASE 5",
    label: "Safety",
    hint: "위험 표현 담당자 확인",
    caller_phone: "",
    transcript: "숨쉬기가 너무 힘들고 어지러워.",
  },
];

export function IntakeForm({ onAnalyze, isLoading, error }: IntakeFormProps) {
  const [values, setValues] = useState<IntakeFormValues>({
    caller_phone: "",
    transcript: "",
  });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onAnalyze(values);
  };

  const handleTranscript = (transcript: string) => {
    setValues((current) => ({
      ...current,
      transcript: current.transcript.trim()
        ? `${current.transcript.trimEnd()}\n${transcript}`
        : transcript,
    }));
  };

  return (
    <section className="intake-panel" aria-labelledby="intake-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">NEW INTAKE</p>
          <h1 id="intake-heading">병원동행 접수 분석</h1>
        </div>
        <span className="phase-chip">Phase 2 · Intake AI</span>
      </div>

      <form onSubmit={handleSubmit} className="intake-form">
        <label className="form-field">
          <span className="form-label">
            <Phone size={15} aria-hidden="true" />
            발신번호
            <span className="optional-label">선택</span>
          </span>
          <input
            type="tel"
            inputMode="tel"
            placeholder="010-0000-0000"
            value={values.caller_phone}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                caller_phone: event.target.value,
              }))
            }
          />
          <span className="field-help">후보 식별에만 사용하며 대상을 확정하지 않습니다.</span>
        </label>

        <VoiceInput disabled={isLoading} onTranscript={handleTranscript} />

        <label className="form-field transcript-field">
          <span className="form-label">
            <Sparkles size={15} aria-hidden="true" />
            원문 발화
          </span>
          <textarea
            rows={7}
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
          <span className="character-count">{values.transcript.length} / 4,000</span>
        </label>

        {error ? (
          <div className="form-error" role="alert">
            {error}
          </div>
        ) : null}

        <button
          className="analyze-button"
          type="submit"
          disabled={isLoading || values.transcript.trim().length === 0}
        >
          <span>{isLoading ? "분석 중…" : "AI 접수카드 만들기"}</span>
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      </form>

      <div className="scenario-section">
        <div className="scenario-title">
          <span>
            <FlaskConical size={15} aria-hidden="true" />
            테스트 시나리오
          </span>
          <small>Quick fill</small>
        </div>
        <div className="scenario-list">
          {SCENARIOS.map((scenario) => (
            <button
              key={scenario.id}
              type="button"
              className="scenario-button"
              onClick={() =>
                setValues({
                  caller_phone: scenario.caller_phone,
                  transcript: scenario.transcript,
                })
              }
            >
              <span className="case-id">{scenario.id}</span>
              <span className="scenario-copy">
                <strong>{scenario.label}</strong>
                <small>{scenario.hint}</small>
              </span>
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
