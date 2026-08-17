"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { LoaderCircle } from "lucide-react";
import {
  AnalyzeIntakeApiResponseSchema,
  IntakeAnalysisSchema,
} from "@/lib/ai/schema";
import type {
  SavedIntakeDetailView,
  SavedIntakeSummary,
} from "@/lib/ai/savedIntakeView";
import {
  describeNewArrival,
  initialRequestInboxState,
  requestInboxReducer,
  type PreviewRecord,
} from "@/lib/ui/requestInbox";
import {
  SavedIntakePoller,
  type SavedIntakePollUpdate,
} from "@/lib/ui/savedIntakePolling";
import {
  fetchSavedDetail,
  fetchSavedList,
  savedIntakeAuthHeader,
  SAVED_INTAKE_LOGIN_REQUIRED,
} from "@/lib/ui/savedIntakeClient";
import { readTeamSession } from "@/lib/ui/teamSession";
import {
  loginTeamSession,
  logoutTeamSession,
  teamSessionLabel,
} from "@/lib/ui/teamLogin";
import type { TeamSession } from "@/lib/ai/teamProfileRead";
import { TeamLoginPanel } from "./design/TeamLoginPanel";
import {
  initialIntakeFieldResolutionState,
  intakeFieldResolutionReducer,
} from "@/lib/ui/intakeFieldResolution";
import { dateKeyOf, localDateKey } from "@/lib/ui/homeDashboard";
import {
  timeStateFromDetail,
  type ScheduleTimeState,
} from "@/lib/ui/intakeSchedule";
import type { IntakeAuditState } from "@/lib/ui/intakeFinalization";
import { getUrgentPresentation } from "@/lib/ui/urgentIntake";
import { AppShell, type ShellTab } from "./design/AppShell";
import { ElderWorkspace } from "./design/ElderWorkspace";
import { HomeDashboard } from "./design/HomeDashboard";
import { IntakeComposer, type IntakeComposerValues } from "./design/IntakeComposer";
import { PlaceholderTab } from "./design/PlaceholderTab";
import { PostRecordWorkspace } from "./design/PostRecordWorkspace";
import { RequestDetail } from "./design/RequestDetail";
import { ScheduleView } from "./design/ScheduleView";
import { SavedIntakeDetail } from "./design/SavedIntakeDetail";
import {
  filterRequestRows,
  RequestList,
  type RequestFilter,
  type RequestRow,
} from "./design/RequestList";
import { summarizeNeeds, buildDesignGroups } from "./design/analysisFields";

/** 새 접수 안내를 띄워 두는 시간. 읽고 넘어갈 만큼만 짧게 남긴다. */
const NEW_ARRIVAL_VISIBLE_MS = 3500;

// U9 shell: Saved Intake는 아직 직원 인증과 intake Audit read가 연결되지 않았다.
// 실제 payload가 오기 전까지 empty/loaded event를 꾸며내지 않고 명시적 오류 상태를 준다.
const INTAKE_AUDIT_NOT_CONNECTED: IntakeAuditState = {
  status: "error",
  message: "직원 인증과 접수 처리 이력 조회가 아직 연결되지 않았습니다.",
};

function errorMessageOf(payload: unknown, fallback: string): string {
  return typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
    ? payload.error
    : fallback;
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
  const urgent = getUrgentPresentation(
    record.analysis.safety.signal_detected &&
      record.analysis.safety.human_escalation_required,
    record.analysis.safety.urgent_confident,
  );

  return {
    id: record.id,
    title: person ? person.name : "대상자 확인 필요",
    line2: urgent
      ? "카드 생성 중단 · 사람 확인 우선"
      : hospital
        ? `${hospital.name}${hospital.status === "INFERRED" ? " · 추정" : ""}`
        : "병원 확인 필요",
    meta: `${timeLabel(record.receivedAt)} 분석`,
    // 긴급 의미를 badge 하나로 우선 표시하고 미리보기 여부는 작은 상태 텍스트로 둔다.
    badge: urgent?.label ?? "미리보기",
    badgeTone: urgent?.tone ?? "neutral",
    statusText: urgent ? "미리보기" : needs ? "확인 필요" : null,
    alert: urgent?.listLine ?? null,
    alertTone: urgent?.tone,
    unread: true,
  };
}

function savedRow(item: SavedIntakeSummary): RequestRow {
  const urgent = getUrgentPresentation(item.urgent, item.urgentConfidence);
  return {
    id: `saved-${item.id}`,
    title: item.target ?? "대상자 확인 필요",
    line2: urgent
      ? "카드 없음 · 사람 확인 우선"
      : item.hospital
        ? `${item.hospital}${item.hospitalStatus === "INFERRED" ? " · 추정" : ""}`
        : "병원 확인 필요",
    meta: [item.createdAt, item.channel].filter(Boolean).join(" · ") || "접수 시각 미상",
    badge: urgent?.label ?? (item.needsConfirmation ? "확인 필요" : null),
    badgeTone: urgent?.tone ?? "warn",
    statusText: urgent
      ? item.status === "긴급 처리됨"
        ? item.status
        : null
      : item.status,
    alert: urgent?.listLine ?? null,
    alertTone: urgent?.tone,
    unread: false,
    confirmed: item.confirmed,
  };
}

export function IntakeWorkspace() {
  const [tab, setTab] = useState<ShellTab>("home");

  const [inbox, dispatch] = useReducer(
    requestInboxReducer,
    initialRequestInboxState,
  );
  // 사람의 작업값은 AI 원본 및 polling 목록과 분리한다. 새 목록이 도착해도
  // 현재 입력 중인 값과 사람의 선택은 이 reducer에 그대로 남는다.
  const [fieldResolutions, resolveField] = useReducer(
    intakeFieldResolutionReducer,
    initialIntakeFieldResolutionState,
  );
  const { saved, previews, selectedId, listLoading, listError, connectionLost } =
    inbox;

  const [isComposing, setIsComposing] = useState(false);
  const [composerSeed, setComposerSeed] = useState<IntakeComposerValues>();
  const [filter, setFilter] = useState<RequestFilter>("all");

  const [detail, setDetail] = useState<SavedIntakeDetailView | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [readRefreshNonce, setReadRefreshNonce] = useState(0);
  const [scheduleTimes, setScheduleTimes] = useState<
    Record<number, ScheduleTimeState>
  >({});

  const pollerRef = useRef<SavedIntakePoller | null>(null);
  const hasSavedRef = useRef(false);

  // 직원 세션은 sessionStorage 하나를 모든 탭이 함께 본다(U9.5와 같은 경계).
  // 여기서는 shell이 표시하고 로그인 진입점을 여는 데만 쓴다.
  const [session, setSession] = useState<TeamSession | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  /** 세션이 바뀔 때마다 올린다. Elder·사후기록을 새 세션으로 다시 마운트한다. */
  const [sessionGeneration, setSessionGeneration] = useState(0);

  const handlePollUpdate = useCallback((update: SavedIntakePollUpdate) => {
    dispatch({ type: "poll", update });
  }, []);

  useEffect(() => {
    hasSavedRef.current = saved.length > 0;
  }, [saved.length]);

  // SSR과 첫 렌더를 맞추기 위해 마운트 뒤에 읽는다(어르신 탭과 같은 방식).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSession(readTeamSession(window.sessionStorage));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const applySession = useCallback((next: TeamSession | null) => {
    setSession(next);
    setSessionGeneration((value) => value + 1);
    // 로그인·로그아웃 직후 read 경로를 다시 태운다. 현재 탭은 그대로 둔다.
    setReadRefreshNonce((value) => value + 1);
    dispatch({ type: "refreshRequested" });
  }, []);

  const handleLogin = useCallback(
    async (userId: string, password: string) => {
      setLoginBusy(true);
      setLoginError(null);
      try {
        const next = await loginTeamSession(userId, password);
        applySession(next);
        setLoginOpen(false);
      } catch (error) {
        setLoginError(
          error instanceof Error ? error.message : "로그인하지 못했습니다.",
        );
      } finally {
        setLoginBusy(false);
      }
    },
    [applySession],
  );

  const handleLogout = useCallback(async () => {
    setLogoutBusy(true);
    try {
      await logoutTeamSession(session);
    } finally {
      applySession(null);
      setLogoutBusy(false);
    }
  }, [session, applySession]);

  // 홈·일정은 진입할 때 한 번만 최신 목록을 읽는다. 5초 polling은 요청 탭 전용이다.
  useEffect(() => {
    if (tab !== "home" && tab !== "schedule") return;
    const controller = new AbortController();

    void fetchSavedList(controller.signal)
      .then((list) => {
        if (!controller.signal.aborted) {
          handlePollUpdate({ type: "loaded", saved: list, newIds: [] });
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          handlePollUpdate({
            type: "failed",
            error:
              error instanceof Error
                ? error.message
                : "요청 목록을 불러오지 못했습니다.",
            hasLoaded: hasSavedRef.current,
          });
        }
      });

    return () => controller.abort();
  }, [tab, readRefreshNonce, handlePollUpdate]);

  // 요청 탭에 있는 동안만 저장 접수를 다시 읽는다.
  // 탭을 벗어나거나 화면이 사라지면 stop() — 이후 도착하는 응답은 버려진다.
  useEffect(() => {
    if (tab !== "request") return;

    // 직원 세션이 없으면 5초 polling을 시작하지 않는다. 로그인 없이 매 tick마다
    // 같은 실패를 만들 이유가 없다 — 한 번만 알리고 멈춘다.
    if (savedIntakeAuthHeader(window.sessionStorage) === null) {
      const controller = new AbortController();
      void fetchSavedList(controller.signal).catch(() => {
        if (controller.signal.aborted) return;
        handlePollUpdate({
          type: "failed",
          error: SAVED_INTAKE_LOGIN_REQUIRED,
          hasLoaded: hasSavedRef.current,
        });
      });
      return () => controller.abort();
    }

    const poller = new SavedIntakePoller({
      fetchList: fetchSavedList,
      onUpdate: handlePollUpdate,
    });
    pollerRef.current = poller;
    poller.start();

    return () => {
      poller.stop();
      if (pollerRef.current === poller) pollerRef.current = null;
    };
  }, [tab, readRefreshNonce, handlePollUpdate]);

  // 목록에는 time 컬럼이 없다. 일정 탭에서 날짜가 있는 saved intake의 상세만
  // 읽어 실제 time 값과 확인 상태를 채운다. 실패한 시간은 추측하지 않는다.
  useEffect(() => {
    if (tab !== "schedule") return;
    const controller = new AbortController();
    const todayKey = localDateKey(new Date());
    const ids = saved
      .filter((item) => {
        const dateKey = dateKeyOf(item.appointmentDate);
        return !item.urgent && dateKey !== null && dateKey >= todayKey;
      })
      .map((item) => item.id);

    if (ids.length === 0) return () => controller.abort();

    for (const id of ids) {
      void fetchSavedDetail(id, controller.signal)
        .then((savedDetail) => {
          if (!controller.signal.aborted) {
            setScheduleTimes((current) => ({
              ...current,
              [id]: timeStateFromDetail(savedDetail),
            }));
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setScheduleTimes((current) => ({
              ...current,
              [id]: { state: "error" },
            }));
          }
        });
    }

    return () => controller.abort();
  }, [tab, saved, readRefreshNonce]);

  // 새 접수 안내는 잠깐만 남긴다.
  useEffect(() => {
    if (inbox.arrived === null) return;
    const timer = setTimeout(
      () => dispatch({ type: "arrivalDismissed" }),
      NEW_ARRIVAL_VISIBLE_MS,
    );
    return () => clearTimeout(timer);
  }, [inbox.arrived]);

  const loadDetail = useCallback(async (savedId: number) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      setDetail(await fetchSavedDetail(savedId));
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
    // 미리보기는 저장조차 되지 않았으므로 확정일 수 없다.
    const all = [...previews.map(previewRow), ...saved.map(savedRow)];
    return filterRequestRows(all, filter);
  }, [previews, saved, filter]);

  const selectedPreview =
    previews.find((record) => record.id === selectedId) ?? null;
  const pendingCount = rows.filter(
    (row) => row.badge === "확인 필요" || row.badge === "긴급",
  ).length;
  const arrivalLabel = inbox.arrived ? describeNewArrival(inbox.arrived) : null;

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
        throw new Error(
          errorMessageOf(payload, "접수 내용을 분석하지 못했습니다."),
        );
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

      dispatch({ type: "previewAdded", record });
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
    dispatch({ type: "selected", id });
    setIsComposing(false);
    if (id.startsWith("saved-")) {
      void loadDetail(Number(id.slice("saved-".length)));
    } else {
      setDetail(null);
      setDetailError(null);
    }
  };

  const beginNewIntake = () => {
    setTab("request");
    setComposerSeed(undefined);
    setAnalyzeError(null);
    dispatch({ type: "selected", id: null });
    setIsComposing(true);
  };

  const openSavedRequest = (id: number) => {
    setTab("request");
    handleSelect(`saved-${id}`);
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
            requestId={selectedId}
            resolutions={fieldResolutions}
            onResolutionAction={resolveField}
            auditState={INTAKE_AUDIT_NOT_CONNECTED}
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
          requestId={selectedPreview.id}
          resolutions={fieldResolutions}
          onResolutionAction={resolveField}
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
      sessionUser={session ? teamSessionLabel(session) : null}
      onLogin={() => {
        setLoginError(null);
        setLoginOpen(true);
      }}
      onLogout={() => void handleLogout()}
      logoutBusy={logoutBusy}
    >
      {loginOpen && !session ? (
        // 보던 탭을 떠나지 않는다 — 로그인 후 같은 탭으로 돌아온다.
        <main className="dc-detail">
          <div className="dc-detail-head">
            <span className="dc-detail-name">직원 로그인</span>
            <span className="dc-detail-sub">저장된 접수 조회 권한 확인</span>
          </div>
          <TeamLoginPanel
            heading="직원 로그인이 필요합니다"
            description="저장된 접수·일정·Care Profile은 권한이 확인된 직원만 조회할 수 있습니다."
            error={loginError}
            busy={loginBusy}
            onSubmit={handleLogin}
            onCancel={() => setLoginOpen(false)}
          />
        </main>
      ) : tab === "request" ? (
        <>
          <RequestList
            rows={rows}
            selectedId={selectedId}
            filter={filter}
            summary={
              listLoading
                ? "불러오는 중"
                : connectionLost
                  ? "연결 확인 중"
                  : `저장 ${saved.length}건${previews.length > 0 ? ` · 미리보기 ${previews.length}건` : ""}`
            }
            listError={listError}
            loading={listLoading}
            newArrivalLabel={arrivalLabel}
            onRefresh={() => {
              dispatch({ type: "refreshRequested" });
              // poller가 살아 있으면 그대로 다시 읽는다(신규 접수 판별 상태 유지).
              // 로그인 전이라 poller가 없으면 effect를 다시 돌려 세션을 재확인한다.
              if (pollerRef.current) pollerRef.current.refresh();
              else setReadRefreshNonce((value) => value + 1);
            }}
            onFilter={setFilter}
            onSelect={handleSelect}
            onNewIntake={beginNewIntake}
            isComposing={isComposing}
          />
          {renderRequestPane()}
        </>
      ) : tab === "home" ? (
        <HomeDashboard
          saved={saved}
          loading={listLoading}
          error={listError}
          disconnected={connectionLost}
          onRetry={() => {
            dispatch({ type: "refreshRequested" });
            setReadRefreshNonce((value) => value + 1);
          }}
          onLogin={() => {
            setLoginError(null);
            setLoginOpen(true);
          }}
          onNewIntake={beginNewIntake}
          onOpenRequest={openSavedRequest}
        />
      ) : tab === "schedule" ? (
        <ScheduleView
          saved={saved}
          times={scheduleTimes}
          loading={listLoading}
          error={listError}
          disconnected={connectionLost}
          onRetry={() => {
            dispatch({ type: "refreshRequested" });
            setReadRefreshNonce((value) => value + 1);
          }}
          onLogin={() => {
            setLoginError(null);
            setLoginOpen(true);
          }}
          onOpenRequest={openSavedRequest}
        />
      ) : tab === "elder" ? (
        // 공통 진입점에서 로그인·로그아웃하면 같은 세션으로 다시 마운트한다.
        <ElderWorkspace key={sessionGeneration} />
      ) : tab === "record" ? (
        <PostRecordWorkspace key={sessionGeneration} />
      ) : (
        <PlaceholderTab
          title="설정"
          description="기관 정보와 담당자 계정을 관리하는 화면입니다."
        />
      )}
    </AppShell>
  );
}
