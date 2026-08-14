"use client";

import { useMemo, useState } from "react";
import { LoaderCircle } from "lucide-react";
import {
  AnalyzeIntakeApiResponseSchema,
  IntakeAnalysisSchema,
  type IntakeAnalysis,
  type IntakeResponseMeta,
} from "@/lib/ai/schema";
import { AppShell, type ShellTab } from "./design/AppShell";
import { IntakeComposer, type IntakeComposerValues } from "./design/IntakeComposer";
import { PlaceholderTab } from "./design/PlaceholderTab";
import { RequestDetail } from "./design/RequestDetail";
import {
  RequestList,
  type RequestFilter,
  type RequestRow,
} from "./design/RequestList";
import { summarizeNeeds, buildDesignGroups } from "./design/analysisFields";

interface IntakeRecord {
  id: string;
  analysis: IntakeAnalysis;
  meta: IntakeResponseMeta | null;
  transcript: string;
  callerPhone: string;
  receivedAt: Date;
}

function timeLabel(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function buildRow(record: IntakeRecord): RequestRow {
  const groups = buildDesignGroups(record.analysis);
  const needs = summarizeNeeds(groups);
  const person = record.analysis.caller.person_candidates[0] ?? null;
  const hospital = record.analysis.hospital.candidates[0] ?? null;

  return {
    id: record.id,
    title: person ? person.name : "대상자 확인 필요",
    line2: hospital
      ? `${hospital.name}${hospital.status === "INFERRED" ? " · 추정" : ""}`
      : "병원 확인 필요",
    meta: `${timeLabel(record.receivedAt)} 접수`,
    badge: record.analysis.safety.signal_detected ? "주의" : needs ? "확인 필요" : null,
    badgeTone: record.analysis.safety.signal_detected ? "danger" : "warn",
    alert: record.analysis.safety.signal_detected
      ? "위험 신호 — 담당자 직접 확인"
      : null,
    unread: true,
  };
}

export function IntakeWorkspace() {
  const [tab, setTab] = useState<ShellTab>("request");
  const [records, setRecords] = useState<IntakeRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isComposing, setIsComposing] = useState(true);
  const [composerSeed, setComposerSeed] = useState<IntakeComposerValues>();
  const [filter, setFilter] = useState<RequestFilter>("all");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => {
    const all = records.map(buildRow);
    if (filter === "todo") {
      return all.filter((row) => row.badge !== null);
    }
    if (filter === "done") {
      return all.filter((row) => row.badge === null);
    }
    return all;
  }, [records, filter]);

  const selected = records.find((record) => record.id === selectedId) ?? null;
  const pendingCount = records
    .map(buildRow)
    .filter((row) => row.badge !== null).length;

  const handleAnalyze = async (values: IntakeComposerValues) => {
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

      const record: IntakeRecord = {
        id: validated.data.intake_id ?? `intake-${records.length + 1}`,
        analysis: IntakeAnalysisSchema.parse(validated.data),
        meta: validated.data.meta ?? null,
        transcript: values.transcript,
        callerPhone: values.caller_phone,
        receivedAt: new Date(),
      };

      setRecords((current) => [record, ...current]);
      setSelectedId(record.id);
      setIsComposing(false);
      setComposerSeed(undefined);
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

  const renderRequestTab = () => {
    if (isLoading) {
      return (
        <main className="dc-detail">
          <div className="dc-loading">
            <LoaderCircle className="spin" size={26} aria-hidden="true" />
            <h2>요청 내용을 정리하고 있습니다</h2>
            <p>
              AI가 발화 내용과 이전 기록을 확인하고 있습니다.
              <br />
              수십 초가 걸릴 수 있습니다.
            </p>
          </div>
        </main>
      );
    }

    if (isComposing || !selected) {
      return (
        <IntakeComposer
          onAnalyze={handleAnalyze}
          isLoading={isLoading}
          error={error}
          initialValues={composerSeed}
        />
      );
    }

    return (
      <RequestDetail
        analysis={selected.analysis}
        transcript={selected.transcript}
        meta={selected.meta}
        channelLabel="앱·웹 접수"
        receivedLabel={`${timeLabel(selected.receivedAt)} 접수`}
        onReanalyze={() => {
          setComposerSeed({
            caller_phone: selected.callerPhone,
            transcript: selected.transcript,
          });
          setIsComposing(true);
        }}
      />
    );
  };

  return (
    <AppShell
      active={tab}
      onSelect={setTab}
      requestBadge={pendingCount > 0 ? String(pendingCount) : null}
    >
      {tab === "request" ? (
        <>
          <RequestList
            rows={rows}
            selectedId={selectedId}
            filter={filter}
            summary={`전체 ${records.length}건`}
            onFilter={setFilter}
            onSelect={(id) => {
              setSelectedId(id);
              setIsComposing(false);
            }}
            onNewIntake={() => {
              setComposerSeed(undefined);
              setError(null);
              setIsComposing(true);
            }}
            isComposing={isComposing}
          />
          {renderRequestTab()}
        </>
      ) : tab === "home" ? (
        <PlaceholderTab
          title="오늘의 동행"
          description="오늘 처리할 일과 일정을 모아 보는 화면입니다."
        />
      ) : tab === "schedule" ? (
        <PlaceholderTab
          title="일정"
          description="확정된 동행 일정을 날짜별로 보는 화면입니다."
        />
      ) : tab === "elder" ? (
        <PlaceholderTab
          title="어르신"
          description="대상자 프로필과 과거 동행 이력을 보는 화면입니다."
        />
      ) : tab === "record" ? (
        <PlaceholderTab
          title="사후기록"
          description="동행 결과와 다음 동행 참고사항을 남기는 화면입니다."
        />
      ) : (
        <PlaceholderTab
          title="설정"
          description="기관 정보와 담당자 계정을 관리하는 화면입니다."
        />
      )}
    </AppShell>
  );
}
