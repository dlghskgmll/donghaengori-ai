"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle } from "lucide-react";
import {
  AnalyzeIntakeApiResponseSchema,
  IntakeAnalysisSchema,
  type IntakeAnalysis,
  type IntakeResponseMeta,
} from "@/lib/ai/schema";
import type {
  SavedIntakeDetailView,
  SavedIntakeSummary,
} from "@/lib/ai/savedIntakeView";
import { AppShell, type ShellTab } from "./design/AppShell";
import { IntakeComposer, type IntakeComposerValues } from "./design/IntakeComposer";
import { PlaceholderTab } from "./design/PlaceholderTab";
import { RequestDetail } from "./design/RequestDetail";
import { SavedIntakeDetail } from "./design/SavedIntakeDetail";
import {
  RequestList,
  type RequestFilter,
  type RequestRow,
} from "./design/RequestList";
import { summarizeNeeds, buildDesignGroups } from "./design/analysisFields";

/** 브라우저에서 방금 분석한 결과. save:false라 backend에 저장되지 않는다. */
interface PreviewRecord {
  kind: "preview";
  id: string;
  analysis: IntakeAnalysis;
  meta: IntakeResponseMeta | null;
  transcript: string;
  callerPhone: string;
  receivedAt: Date;
}

/** 저장된 접수 목록을 가져온다. state를 건드리지 않는 순수 함수다. */
async function fetchSavedList(): Promise<{
  list: SavedIntakeSummary[];
  error: string | null;
}> {
  try {
    const response = await fetch("/api/v1/intakes");
    const payload: unknown = await response.json();
    if (!response.ok) {
      const message =
        typeof payload === "object" &&
        payload !== null &&
        "error" in payload &&
        typeof payload.error === "string"
          ? payload.error
          : "요청 목록을 불러오지 못했습니다.";
      throw new Error(message);
    }
    const list =
      typeof payload === "object" && payload !== null && "intakes" in payload
        ? ((payload as { intakes: SavedIntakeSummary[] }).intakes ?? [])
        : [];
    return { list, error: null };
  } catch (error) {
    return {
      list: [],
      error:
        error instanceof Error
          ? error.message
          : "요청 목록을 불러오지 못했습니다.",
    };
  }
}

function timeLabel(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function previewRow(record: PreviewRecord): RequestRow {
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
    meta: `${timeLabel(record.receivedAt)} 분석`,
    // 저장된 접수와 헷갈리지 않게 미리보기임을 항상 표시한다.
    badge: "미리보기",
    badgeTone: "neutral",
    statusText: needs ? "확인 필요" : null,
    alert: record.analysis.safety.signal_detected
      ? "위험 신호 — 담당자 직접 확인"
      : null,
    unread: true,
  };
}

function savedRow(item: SavedIntakeSummary): RequestRow {
  return {
    id: `saved-${item.id}`,
    title: item.target ?? "대상자 확인 필요",
    line2: item.hospital
      ? `${item.hospital}${item.hospitalStatus === "INFERRED" ? " · 추정" : ""}`
      : "병원 확인 필요",
    meta: [item.createdAt, item.channel].filter(Boolean).join(" · ") || "접수 시각 미상",
    badge: item.urgent ? "긴급" : item.needsConfirmation ? "확인 필요" : null,
    badgeTone: item.urgent ? "danger" : "warn",
    statusText: item.status,
    alert: item.urgent ? "긴급 접수 — 담당자 직접 확인" : null,
    unread: false,
  };
}

export function IntakeWorkspace() {
  const [tab, setTab] = useState<ShellTab>("request");

  const [saved, setSaved] = useState<SavedIntakeSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [previews, setPreviews] = useState<PreviewRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [composerSeed, setComposerSeed] = useState<IntakeComposerValues>();
  const [filter, setFilter] = useState<RequestFilter>("all");

  const [detail, setDetail] = useState<SavedIntakeDetailView | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const applyList = useCallback(
    (result: { list: SavedIntakeSummary[]; error: string | null }) => {
      setSaved(result.list);
      setListError(result.error);
      setListLoading(false);
    },
    [],
  );

  const loadList = useCallback(async () => {
    setListLoading(true);
    applyList(await fetchSavedList());
  }, [applyList]);

  useEffect(() => {
    let cancelled = false;
    // state 변경은 await 이후에만 일어난다 — effect 안에서 동기 setState를 하면
    // 연쇄 렌더가 발생한다.
    void fetchSavedList().then((result) => {
      if (!cancelled) applyList(result);
    });
    return () => {
      cancelled = true;
    };
  }, [applyList]);

  const loadDetail = useCallback(async (savedId: number) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const response = await fetch(`/api/v1/intakes/${savedId}`);
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "요청 내용을 불러오지 못했습니다.";
        throw new Error(message);
      }
      setDetail(payload as SavedIntakeDetailView);
    } catch (error) {
      setDetail(null);
      setDetailError(
        error instanceof Error
          ? error.message
          : "요청 내용을 불러오지 못했습니다.",
      );
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // 저장된 접수와 미리보기를 함께 보여주되 id 체계를 분리해 중복되지 않게 한다.
  const rows = useMemo(() => {
    const all = [...previews.map(previewRow), ...saved.map(savedRow)];
    if (filter === "todo") {
      return all.filter((row) => row.badge === "확인 필요" || row.badge === "긴급");
    }
    if (filter === "done") {
      return all.filter((row) => row.badge === null);
    }
    return all;
  }, [previews, saved, filter]);

  const selectedPreview =
    previews.find((record) => record.id === selectedId) ?? null;
  const pendingCount = rows.filter(
    (row) => row.badge === "확인 필요" || row.badge === "긴급",
  ).length;

  const handleAnalyze = async (values: IntakeComposerValues) => {
    setIsAnalyzing(true);
    setAnalyzeError(null);

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

      const record: PreviewRecord = {
        kind: "preview",
        id: `preview-${validated.data.intake_id ?? previews.length + 1}`,
        analysis: IntakeAnalysisSchema.parse(validated.data),
        meta: validated.data.meta ?? null,
        transcript: values.transcript,
        callerPhone: values.caller_phone,
        receivedAt: new Date(),
      };

      setPreviews((current) => [record, ...current]);
      setSelectedId(record.id);
      setIsComposing(false);
      setComposerSeed(undefined);
    } catch (error) {
      setAnalyzeError(
        error instanceof Error
          ? error.message
          : "알 수 없는 오류가 발생했습니다.",
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setIsComposing(false);
    if (id.startsWith("saved-")) {
      void loadDetail(Number(id.slice("saved-".length)));
    } else {
      setDetail(null);
      setDetailError(null);
    }
  };

  const renderRequestPane = () => {
    if (isAnalyzing) {
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

    if (isComposing || selectedId === null) {
      return (
        <IntakeComposer
          onAnalyze={handleAnalyze}
          isLoading={isAnalyzing}
          error={analyzeError}
          initialValues={composerSeed}
        />
      );
    }

    if (selectedId.startsWith("saved-")) {
      if (detail || detailLoading || detailError) {
        return (
          <SavedIntakeDetail
            detail={detail ?? ({} as SavedIntakeDetailView)}
            isLoading={detailLoading}
            error={detailError}
            onRetry={() =>
              void loadDetail(Number(selectedId.slice("saved-".length)))
            }
          />
        );
      }
      return null;
    }

    if (selectedPreview) {
      return (
        <RequestDetail
          analysis={selectedPreview.analysis}
          transcript={selectedPreview.transcript}
          meta={selectedPreview.meta}
          channelLabel="미리보기 · 저장되지 않음"
          receivedLabel={`${timeLabel(selectedPreview.receivedAt)} 분석`}
          onReanalyze={() => {
            setComposerSeed({
              caller_phone: selectedPreview.callerPhone,
              transcript: selectedPreview.transcript,
            });
            setIsComposing(true);
          }}
        />
      );
    }

    return (
      <IntakeComposer
        onAnalyze={handleAnalyze}
        isLoading={isAnalyzing}
        error={analyzeError}
        initialValues={composerSeed}
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
            summary={
              listLoading
                ? "불러오는 중"
                : `저장 ${saved.length}건${previews.length > 0 ? ` · 미리보기 ${previews.length}건` : ""}`
            }
            listError={listError}
            onRefresh={() => void loadList()}
            onFilter={setFilter}
            onSelect={handleSelect}
            onNewIntake={() => {
              setComposerSeed(undefined);
              setAnalyzeError(null);
              setSelectedId(null);
              setIsComposing(true);
            }}
            isComposing={isComposing}
          />
          {renderRequestPane()}
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
