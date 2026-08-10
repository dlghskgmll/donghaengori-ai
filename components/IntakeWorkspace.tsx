"use client";

import { useState } from "react";
import { ClipboardCheck, Link2, LoaderCircle, ShieldCheck } from "lucide-react";
import {
  AnalyzeIntakeApiResponseSchema,
  IntakeAnalysisSchema,
  type IntakeAnalysis,
  type IntakeResponseMeta,
} from "@/lib/ai/schema";
import { IntakeCard } from "./IntakeCard";
import { IntakeForm, type IntakeFormValues } from "./IntakeForm";

export function IntakeWorkspace() {
  const [analysis, setAnalysis] = useState<IntakeAnalysis | null>(null);
  const [meta, setMeta] = useState<IntakeResponseMeta | null>(null);
  const [submittedTranscript, setSubmittedTranscript] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async (values: IntakeFormValues) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/v1/intakes/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "접수 내용을 분석하지 못했습니다.";
        throw new Error(message);
      }

      const validated = AnalyzeIntakeApiResponseSchema.safeParse(payload);
      if (!validated.success) {
        throw new Error("AI 결과 검증에 실패했습니다. 담당자에게 알려 주세요.");
      }

      setAnalysis(IntakeAnalysisSchema.parse(validated.data));
      setMeta(validated.data.meta ?? null);
      setSubmittedTranscript(values.transcript);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "알 수 없는 오류가 발생했습니다.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <Link2 size={21} />
          </div>
          <div>
            <strong>동행고리AI</strong>
            <span>CareBridge Copilot</span>
          </div>
        </div>
        <div className="topbar-context">
          <span className="workspace-name">전남 병원동행 운영센터</span>
          <span className="privacy-chip">
            <ShieldCheck size={14} aria-hidden="true" />
            가상 데이터 환경
          </span>
          <div className="operator-avatar" aria-label="사회복지사 작업자">
            복지
          </div>
        </div>
      </header>

      <div className="workspace-grid">
        <IntakeForm
          onAnalyze={handleAnalyze}
          isLoading={isLoading}
          error={error}
        />

        <section className="result-panel" aria-live="polite">
          <div className="result-panel-toolbar">
            <div>
              <span className="breadcrumb-current">접수 분석</span>
              <span className="breadcrumb-divider">/</span>
              <span>{analysis ? "AI 접수카드" : "새 접수"}</span>
            </div>
            <p>최종 저장은 담당자 확정 후 진행됩니다.</p>
          </div>

          {isLoading ? (
            <div className="result-state loading-state">
              <div className="state-icon">
                <LoaderCircle className="spin" size={26} aria-hidden="true" />
              </div>
              <h2>요청 내용을 구조화하고 있습니다</h2>
              <p>
                AI가 발화 내용과 과거 동행 기록(Care Memory)을 확인하고
                있습니다.
                <br />
                실제 AI 분석은 최대 30초 정도 걸릴 수 있습니다.
              </p>
              <div className="loading-lines" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </div>
          ) : analysis ? (
            <div className="analysis-result-stack">
              {meta?.fallback_used ? (
                <div className="fallback-banner" role="status">
                  실제 AI 연결에 실패하여 기본 분석 모드로 처리했습니다.
                </div>
              ) : null}
              {meta ? (
                <div className="provider-meta" aria-label="분석 provider와 처리시간">
                  <span>
                    Provider · {meta.fallback_used
                      ? "Fallback"
                      : meta.provider_used === "openai"
                        ? "OpenAI"
                        : "Mock"}
                  </span>
                  <span>
                    처리시간 · {(meta.total_latency_ms / 1000).toFixed(1)}초
                  </span>
                </div>
              ) : null}
              <IntakeCard
                key={`${submittedTranscript}-${analysis.summary}`}
                analysis={analysis}
                transcript={submittedTranscript}
              />
            </div>
          ) : (
            <div className="result-state empty-state">
              <div className="empty-visual" aria-hidden="true">
                <span className="orbit orbit-one" />
                <span className="orbit orbit-two" />
                <div className="state-icon">
                  <ClipboardCheck size={29} />
                </div>
              </div>
              <span className="empty-kicker">READY FOR INTAKE</span>
              <h2>접수할 내용을 입력해 주세요</h2>
              <p>
                왼쪽에 발신번호와 원문 발화를 입력하면<br />
                검토 가능한 AI 접수카드가 이곳에 표시됩니다.
              </p>
              <div className="empty-principles">
                <span>후보만 제시</span>
                <span>근거 표시</span>
                <span>사람이 최종 확정</span>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
