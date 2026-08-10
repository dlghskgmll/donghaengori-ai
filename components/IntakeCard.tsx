"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  Hospital,
  MapPin,
  PencilLine,
  Quote,
  ShieldCheck,
  Stethoscope,
  UserRound,
  UsersRound,
} from "lucide-react";
import type { IntakeAnalysis } from "@/lib/ai/schema";
import type { EvidenceStatus, IntakeStatus } from "@/lib/domain/intake";
import { EvidenceList } from "./EvidenceList";
import { StatusBadge } from "./StatusBadge";

interface IntakeCardProps {
  analysis: IntakeAnalysis;
  transcript: string;
}

interface EditableValues {
  date: string;
  time: string;
  hospital: string;
  department: string;
}

const REQUEST_LABELS: Record<IntakeAnalysis["request_type"]["value"], string> = {
  HOSPITAL_COMPANION: "병원동행",
  PHARMACY: "약국 동행",
  GUARDIAN_CONTACT: "보호자 연락",
  UNKNOWN: "유형 확인 필요",
};

const formatDate = (date: string | null) => {
  if (!date) return "날짜 확인 필요";
  const [year, month, day] = date.split("-");
  return `${year}. ${month}. ${day}.`;
};

function ConfidenceRing({ value }: { value: number }) {
  const percentage = Math.round(value * 100);
  return (
    <div
      className="confidence-ring"
      style={{ "--confidence": `${percentage * 3.6}deg` } as React.CSSProperties}
      aria-label={`근거 신뢰도 ${percentage}%`}
    >
      <span>{percentage}</span>
      <small>%</small>
    </div>
  );
}

interface DataFieldProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  status: EvidenceStatus;
  confidence: number;
  evidence: string[];
  editing?: boolean;
  inputType?: "text" | "date" | "time";
  onChange?: (value: string) => void;
}

function DataField({
  icon,
  label,
  value,
  status,
  confidence,
  evidence,
  editing,
  inputType = "text",
  onChange,
}: DataFieldProps) {
  return (
    <div className="data-field">
      <div className="data-field-head">
        <span className="data-label">
          {icon}
          {label}
        </span>
        <StatusBadge status={status} />
      </div>
      {editing ? (
        <input
          className="edit-input"
          type={inputType}
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          aria-label={`${label} 수정`}
        />
      ) : (
        <div className={`data-value ${status === "NEEDS_CONFIRMATION" ? "is-missing" : ""}`}>
          {value}
        </div>
      )}
      <div className="confidence-inline">
        근거 신뢰도 {Math.round(confidence * 100)}%
      </div>
      <EvidenceList items={evidence} />
    </div>
  );
}

export function IntakeCard({ analysis, transcript }: IntakeCardProps) {
  const hospitalCandidate = analysis.hospital.candidates[0] ?? null;
  const personCandidate = analysis.caller.person_candidates[0] ?? null;
  const [intakeStatus, setIntakeStatus] = useState<IntakeStatus>("DRAFT_AI");
  const [isEditing, setIsEditing] = useState(false);
  const [isModified, setIsModified] = useState(false);
  const initialValues: EditableValues = {
    date: analysis.appointment.date.value ?? "",
    time: analysis.appointment.time.value ?? "",
    hospital: hospitalCandidate?.name ?? "",
    department: analysis.department.value ?? "",
  };
  const [values, setValues] = useState<EditableValues>(initialValues);

  const updateValue = (key: keyof EditableValues, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setIsModified(true);
  };

  return (
    <article className="result-card" aria-labelledby="result-card-heading">
      <div className="result-card-header">
        <div>
          <div className="result-kicker">
            <span className="live-indicator" aria-hidden="true" />
            ANALYSIS COMPLETE
          </div>
          <h2 id="result-card-heading">AI 접수카드</h2>
          <p>구조화된 결과 · Schema v{analysis.schema_version}</p>
        </div>
        <StatusBadge status={intakeStatus} />
      </div>

      {analysis.safety.signal_detected ? (
        <div className="safety-alert" role="alert">
          <div className="safety-alert-icon">
            <AlertTriangle size={20} aria-hidden="true" />
          </div>
          <div>
            <strong>담당자의 즉시 확인이 필요한 표현</strong>
            <p>
              {analysis.safety.signal_type}. AI는 응급 여부를 판단하지 않습니다.
              현재 상태를 사람이 직접 확인해 주세요.
            </p>
          </div>
        </div>
      ) : null}

      <section className="identity-strip" aria-label="대상자 후보와 분석 요약">
        <div className="candidate-summary">
          <div className="avatar-mark" aria-hidden="true">
            {personCandidate?.name.slice(0, 1) ?? "?"}
          </div>
          <div>
            <span className="section-micro-label">대상자 후보</span>
            <div className="candidate-name-row">
              <strong>{personCandidate?.name ?? "대상자 확인 필요"}</strong>
              {personCandidate ? (
                <span>{Math.round(personCandidate.confidence * 100)}% 후보</span>
              ) : null}
            </div>
            <p>
              {personCandidate
                ? `프로필 ID ${personCandidate.person_id} · 발신정보 기반 후보`
                : "일치하는 가상 프로필 후보가 없습니다."}
            </p>
          </div>
        </div>
        <div className="request-summary">
          <div>
            <span className="section-micro-label">요청 유형</span>
            <strong>{REQUEST_LABELS[analysis.request_type.value]}</strong>
          </div>
          <ConfidenceRing value={analysis.request_type.confidence} />
        </div>
      </section>

      {personCandidate ? (
        <div className="candidate-evidence">
          <EvidenceList items={personCandidate.evidence} />
          <span className="candidate-disclaimer">
            <UsersRound size={14} aria-hidden="true" />
            후보이며 확정된 대상자가 아닙니다.
          </span>
        </div>
      ) : null}

      <section className="transcript-quote" aria-labelledby="transcript-heading">
        <Quote size={18} aria-hidden="true" />
        <div>
          <span id="transcript-heading" className="section-micro-label">
            원문 발화
          </span>
          <blockquote>“{transcript}”</blockquote>
        </div>
      </section>

      <section className="card-section" aria-labelledby="appointment-heading">
        <div className="card-section-title">
          <div>
            <span className="section-index">01</span>
            <h3 id="appointment-heading">동행 요청 정보</h3>
          </div>
          {isModified ? <span className="edited-chip">담당자 수정됨</span> : null}
        </div>
        <div className="data-grid">
          <DataField
            icon={<CalendarDays size={16} aria-hidden="true" />}
            label="날짜"
            value={isEditing ? values.date : formatDate(values.date || null)}
            status={analysis.appointment.date.status}
            confidence={analysis.appointment.date.confidence}
            evidence={analysis.appointment.date.evidence}
            editing={isEditing}
            inputType="date"
            onChange={(value) => updateValue("date", value)}
          />
          <DataField
            icon={<Clock3 size={16} aria-hidden="true" />}
            label="시간"
            value={values.time || "시간 확인 필요"}
            status={analysis.appointment.time.status}
            confidence={analysis.appointment.time.confidence}
            evidence={analysis.appointment.time.evidence}
            editing={isEditing}
            inputType="time"
            onChange={(value) => updateValue("time", value)}
          />
          <DataField
            icon={<Hospital size={16} aria-hidden="true" />}
            label="병원 후보"
            value={values.hospital || "병원 확인 필요"}
            status={hospitalCandidate?.status ?? "NEEDS_CONFIRMATION"}
            confidence={hospitalCandidate?.confidence ?? 0}
            evidence={
              hospitalCandidate?.evidence ?? ["과거 이력이 없어 병원을 추측하지 않음"]
            }
            editing={isEditing}
            onChange={(value) => updateValue("hospital", value)}
          />
          <DataField
            icon={<Stethoscope size={16} aria-hidden="true" />}
            label="진료과"
            value={values.department || "진료과 확인 필요"}
            status={analysis.department.status}
            confidence={analysis.department.confidence}
            evidence={analysis.department.evidence}
            editing={isEditing}
            onChange={(value) => updateValue("department", value)}
          />
        </div>
      </section>

      <section className="card-section" aria-labelledby="review-heading">
        <div className="card-section-title">
          <div>
            <span className="section-index">02</span>
            <h3 id="review-heading">현장 확인 사항</h3>
          </div>
        </div>
        <div className="review-grid">
          <div className="review-box questions-box">
            <div className="review-box-heading">
              <CircleHelp size={17} aria-hidden="true" />
              <strong>확인 질문</strong>
              <span>{analysis.confirmation_questions.length}</span>
            </div>
            {analysis.confirmation_questions.length > 0 ? (
              <ol>
                {analysis.confirmation_questions.map((question, index) => (
                  <li key={`${question}-${index}`}>
                    <span>{index + 1}</span>
                    <p>{question}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="review-empty">
                <CheckCircle2 size={17} aria-hidden="true" />
                자동 생성된 추가 질문이 없습니다.
              </div>
            )}
          </div>

          <div className="review-box mobility-box">
            <div className="review-box-heading">
              <MapPin size={17} aria-hidden="true" />
              <strong>이동 주의사항</strong>
            </div>
            {analysis.care_context.mobility_notes.length > 0 ? (
              <ul>
                {analysis.care_context.mobility_notes.map((note) => (
                  <li key={note}>
                    <ChevronRight size={14} aria-hidden="true" />
                    {note}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted-copy">등록된 이동 주의사항이 없습니다.</p>
            )}
          </div>
        </div>
      </section>

      <section className="summary-band" aria-label="AI 요약과 안전 상태">
        <div>
          <span className="section-micro-label">AI 요약</span>
          <p>{analysis.summary}</p>
        </div>
        <div className={`safety-status ${analysis.safety.signal_detected ? "is-alert" : "is-safe"}`}>
          {analysis.safety.signal_detected ? (
            <AlertTriangle size={17} aria-hidden="true" />
          ) : (
            <ShieldCheck size={17} aria-hidden="true" />
          )}
          <span>
            <small>Safety</small>
            <strong>
              {analysis.safety.signal_detected ? "사람 확인 필요" : "감지 신호 없음"}
            </strong>
          </span>
        </div>
      </section>

      <footer className="card-actions">
        <div className="human-review-note">
          <UserRound size={17} aria-hidden="true" />
          <span>
            <strong>사람의 최종 검토가 필수입니다.</strong>
            AI는 접수 후보를 생성했으며 의료 판단을 하지 않았습니다.
          </span>
        </div>
        <div className="action-buttons">
          {isEditing ? (
            <button className="secondary-button" onClick={() => setIsEditing(false)}>
              <Check size={16} aria-hidden="true" />
              수정 저장
            </button>
          ) : (
            <button className="secondary-button" onClick={() => setIsEditing(true)}>
              <PencilLine size={16} aria-hidden="true" />
              수정
            </button>
          )}
          <button
            className="confirm-button"
            onClick={() => {
              setIsEditing(false);
              setIntakeStatus("CONFIRMED");
            }}
            disabled={intakeStatus === "CONFIRMED"}
          >
            <CheckCircle2 size={17} aria-hidden="true" />
            {intakeStatus === "CONFIRMED" ? "접수 확정됨" : "접수 확정"}
          </button>
        </div>
      </footer>
    </article>
  );
}
