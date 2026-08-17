"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowRight, LogOut, RefreshCw, Search } from "lucide-react";
import type {
  TeamProfileDetail,
  TeamProfileSummary,
  TeamSession,
} from "@/lib/ai/teamProfileRead";
import {
  maskProfilePhone,
  pastHospitalLabel,
  profileSupportFacts,
  sortedProfileHistory,
} from "@/lib/ui/careProfile";
import { TeamLoginPanel } from "./TeamLoginPanel";
import { clearTeamSession, readTeamSession } from "@/lib/ui/teamSession";
import { loginTeamSession, logoutTeamSession } from "@/lib/ui/teamLogin";

interface ApiErrorPayload {
  error?: string;
}

class ProfileApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

async function responseJson<T>(response: Response, fallback: string): Promise<T> {
  let payload: ApiErrorPayload & Partial<T> = {};
  try {
    payload = (await response.json()) as ApiErrorPayload & Partial<T>;
  } catch {
    // 아래의 안정된 fallback 문구를 사용한다.
  }
  if (!response.ok) {
    throw new ProfileApiError(response.status, payload.error ?? fallback);
  }
  return payload as T;
}

function authHeaders(session: TeamSession): HeadersInit {
  return { Authorization: `Bearer ${session.token}` };
}

function ProfileLogin({
  error,
  notice,
  busy,
  onSubmit,
}: {
  error: string | null;
  notice: string | null;
  busy: boolean;
  onSubmit: (userId: string, password: string) => Promise<void>;
}) {
  return (
    <main className="dc-detail">
      <div className="dc-detail-head dc-elder-head">
        <span className="dc-detail-name">어르신</span>
        <span className="dc-detail-sub">Care Profile · 조회 전용</span>
      </div>
      <TeamLoginPanel
        heading="직원 로그인이 필요합니다"
        description="Care Profile은 권한이 확인된 직원만 조회할 수 있습니다."
        error={error}
        notice={notice}
        busy={busy}
        onSubmit={onSubmit}
      />
    </main>
  );
}

/**
 * 대상자 목록이 비었을 때의 문구.
 * 검색해서 0건인 것과 등록된 대상자가 아예 없는 것은 다른 상황이다 —
 * 검색하지 않았는데 "검색 결과가 없습니다"라고 하면 원인을 검색 탓으로 오해한다.
 */
export function profileListEmptyMessage(appliedQuery: string): string {
  return appliedQuery.trim()
    ? "검색 결과가 없습니다."
    : "등록된 대상자가 없습니다.";
}

function ProfileList({
  profiles,
  selectedPhone,
  loading,
  error,
  query,
  appliedQuery,
  onQueryChange,
  onSearch,
  onSelect,
  onRetry,
  onLogout,
}: {
  profiles: TeamProfileSummary[];
  selectedPhone: string | null;
  loading: boolean;
  error: string | null;
  query: string;
  /** 지금 보고 있는 목록을 만들 때 실제로 쓴 검색어. 입력 중인 값과 다르다. */
  appliedQuery: string;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onSelect: (phone: string) => void;
  onRetry: () => void;
  onLogout: () => void;
}) {
  return (
    <aside className="dc-elder-list" aria-label="등록 대상자 목록">
      <div className="dc-elder-list-head">
        <div className="dc-elder-list-title-row">
          <div>
            <strong>등록 대상자</strong>
            <span>{loading ? "확인 중" : `${profiles.length}명`}</span>
          </div>
          <button
            type="button"
            className="dc-icon-button"
            onClick={onLogout}
            aria-label="로그아웃"
          >
            <LogOut size={15} aria-hidden="true" />
          </button>
        </div>
        <form
          className="dc-elder-search"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch();
          }}
        >
          <Search size={14} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="이름 또는 전화번호"
            aria-label="대상자 검색"
          />
        </form>
      </div>

      <div className="dc-elder-list-body">
        {loading ? (
          <div className="dc-elder-list-state" role="status">
            대상자 목록을 불러오는 중입니다.
          </div>
        ) : error ? (
          <div className="dc-elder-list-state is-error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={onRetry}>
              다시 시도
            </button>
          </div>
        ) : profiles.length === 0 ? (
          // 검색 결과가 비었다는 사실도 loading·error와 똑같이 읽혀야 한다.
          <div className="dc-elder-list-state" role="status">
            {profileListEmptyMessage(appliedQuery)}
          </div>
        ) : (
          profiles.map((profile) => (
            <button
              type="button"
              key={profile.phone}
              className={`dc-elder-row${
                selectedPhone === profile.phone ? " is-selected" : ""
              }`}
              onClick={() => onSelect(profile.phone)}
              aria-pressed={selectedPhone === profile.phone}
            >
              <span className="dc-elder-row-main">
                <strong>{profile.name}</strong>
                <span>
                  {[
                    profile.age ? `${profile.age}세` : null,
                    profile.region,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "기본 정보 미등록"}
                </span>
                <small>{maskProfilePhone(profile.phone)}</small>
              </span>
              <span className="dc-elder-row-side">
                {profile.visits === 0 ? <em>신규</em> : <span>{profile.visits}회</span>}
                <ArrowRight size={13} aria-hidden="true" />
              </span>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}

function ProfileDetail({
  profile,
  loading,
  error,
  onRetry,
}: {
  profile: TeamProfileDetail | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const history = useMemo(
    () => sortedProfileHistory(profile?.history ?? []),
    [profile],
  );
  const supportFacts = useMemo(
    () => (profile ? profileSupportFacts(profile) : []),
    [profile],
  );

  if (loading) {
    return (
      <main className="dc-detail">
        <div className="dc-home-state" role="status">
          <span className="dc-home-state-title">Care Profile을 불러오고 있습니다</span>
          <span>선택한 대상자의 상세 정보만 안전하게 조회합니다.</span>
        </div>
      </main>
    );
  }
  if (error) {
    return (
      <main className="dc-detail">
        <div className="dc-home-state is-error" role="alert">
          <span className="dc-home-state-title">Care Profile을 불러오지 못했습니다</span>
          <span>{error}</span>
          <button type="button" className="dc-btn-ghost" onClick={onRetry}>
            <RefreshCw size={14} aria-hidden="true" /> 다시 시도
          </button>
        </div>
      </main>
    );
  }
  if (!profile) {
    return (
      <main className="dc-detail">
        <div className="dc-detail-head dc-elder-head">
          <span className="dc-detail-name">어르신</span>
          <span className="dc-detail-sub">Care Profile · 조회 전용</span>
        </div>
        <div className="dc-home-state">
          <span className="dc-home-state-title">대상자를 선택해 주세요</span>
          <span>목록 선택 전에는 민감한 상세 정보를 열지 않습니다.</span>
        </div>
      </main>
    );
  }

  return (
    <main className="dc-detail">
      <div className="dc-detail-head dc-elder-head">
        <span className="dc-detail-name">{profile.name}</span>
        <span className="dc-detail-sub">
          {[profile.age ? `${profile.age}세` : null, profile.region]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <span className="dc-detail-meta">Care Profile · 읽기 전용</span>
      </div>
      <div className="dc-care-reference" role="note">
        <strong>참고 정보</strong>
        <span>과거 동행 기록은 이번 요청의 병원·진료과·일정을 확정하지 않습니다.</span>
      </div>
      <div className="dc-detail-body dc-elder-detail-body">
        <div className="dc-detail-left">
          <section className="dc-block">
            <h2 className="dc-block-title">기본 정보</h2>
            <dl className="dc-care-facts">
              <div><dt>대상자 ID</dt><dd>{profile.id ?? "미등록"}</dd></div>
              <div><dt>연락처</dt><dd>{maskProfilePhone(profile.phone)}</dd></div>
              <div><dt>거주 지역</dt><dd>{profile.region ?? "미등록"}</dd></div>
              <div><dt>생활 형태</dt><dd>{profile.lives_alone ? "독거" : "독거 아님"}</dd></div>
              <div><dt>낙상 위험</dt><dd>{profile.fall_risk ? "등록됨 · 동행 전 확인" : "등록 없음"}</dd></div>
            </dl>
          </section>

          <section className="dc-block">
            <h2 className="dc-block-title">이동·돌봄 참고</h2>
            {supportFacts.length > 0 ? (
              <dl className="dc-care-facts">
                {supportFacts.map((fact) => (
                  <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>
                ))}
              </dl>
            ) : (
              <p className="dc-care-empty-copy">등록된 지원 정보가 없습니다.</p>
            )}
            {profile.notes ? <p className="dc-care-note">{profile.notes}</p> : null}
          </section>

          <section className="dc-block">
            <h2 className="dc-block-title">보호자 연락 참고</h2>
            {profile.guardian ? (
              <dl className="dc-care-facts">
                <div><dt>보호자</dt><dd>{[profile.guardian.name, profile.guardian.relation].filter(Boolean).join(" · ") || "미등록"}</dd></div>
                <div><dt>연락처</dt><dd>{profile.guardian.phone ? maskProfilePhone(profile.guardian.phone) : "미등록"}</dd></div>
                <div><dt>연락 가능</dt><dd>{profile.guardian.available ?? "미등록"}</dd></div>
              </dl>
            ) : (
              <p className="dc-care-empty-copy">등록된 보호자 정보가 없습니다.</p>
            )}
          </section>
        </div>

        <div className="dc-divider" />

        <div className="dc-detail-right">
          <section className="dc-block">
            <div className="dc-care-history-head">
              <div>
                <h2 className="dc-block-title">과거 동행 기록</h2>
                <p>Care Memory에서 조회한 참고 이력입니다.</p>
              </div>
              <span>{history.length}건</span>
            </div>
            {history.length === 0 ? (
              <div className="dc-care-history-empty">
                <strong>과거 동행 기록이 없습니다</strong>
                <span>신규 대상자이거나 아직 승인된 이력이 없습니다.</span>
              </div>
            ) : (
              <div className="dc-care-history">
                {history.map((entry, index) => (
                  <article
                    className="dc-care-history-row"
                    key={`${entry.date ?? "unknown"}-${index}`}
                  >
                    <time>{entry.date ?? "날짜 미등록"}</time>
                    <div>
                      <strong>{pastHospitalLabel(entry)}</strong>
                      <span>
                        {[entry.dept, entry.symptom].filter(Boolean).join(" · ") ||
                          "동행 맥락 미등록"}
                      </span>
                    </div>
                    {entry.pharmacy ? <em>약국 동행</em> : null}
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

export function ElderWorkspace() {
  const [sessionReady, setSessionReady] = useState(false);
  const [session, setSession] = useState<TeamSession | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [profiles, setProfiles] = useState<TeamProfileSummary[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [detail, setDetail] = useState<TeamProfileDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const detailRequestRef = useRef(0);

  const expireSession = useCallback((message: string) => {
    detailRequestRef.current += 1;
    clearTeamSession(window.sessionStorage);
    setSession(null);
    setProfiles([]);
    setSelectedPhone(null);
    setDetail(null);
    setAuthNotice(null);
    setAuthError(message);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSession(readTeamSession(window.sessionStorage));
      setSessionReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ limit: "50" });
    if (query) params.set("query", query);

    void fetch(`/api/v1/profiles?${params.toString()}`, {
      headers: authHeaders(session),
      signal: controller.signal,
    })
      .then((response) =>
        responseJson<{ profiles: TeamProfileSummary[] }>(
          response,
          "대상자 목록을 불러오지 못했습니다.",
        ),
      )
      .then((payload) => {
        if (controller.signal.aborted) return;
        setProfiles(payload.profiles);
        setProfilesError(null);
        setProfilesLoading(false);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error instanceof ProfileApiError && error.status === 401) {
          expireSession("세션이 만료되었습니다. 다시 로그인해 주세요.");
          return;
        }
        setProfilesError(
          error instanceof Error
            ? error.message
            : "대상자 목록을 불러오지 못했습니다.",
        );
        setProfilesLoading(false);
      });

    return () => controller.abort();
  }, [session, query, refreshNonce, expireSession]);

  const login = async (userId: string, password: string) => {
    setAuthBusy(true);
    setAuthError(null);
    setAuthNotice(null);
    try {
      const nextSession = await loginTeamSession(userId, password);
      setProfilesLoading(true);
      setSession(nextSession);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "로그인하지 못했습니다.");
    } finally {
      setAuthBusy(false);
    }
  };

  const logout = () => {
    // 서버 연결 여부와 무관하게 이 브라우저의 session은 반드시 지운다.
    void logoutTeamSession(session);
    detailRequestRef.current += 1;
    setSession(null);
    setProfiles([]);
    setSelectedPhone(null);
    setDetail(null);
    setAuthError(null);
    setAuthNotice("이 브라우저에서 로그아웃했습니다.");
  };

  const selectProfile = (phone: string) => {
    if (!session) return;
    const requestId = detailRequestRef.current + 1;
    detailRequestRef.current = requestId;
    setSelectedPhone(phone);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    void fetch(`/api/v1/profiles/${encodeURIComponent(phone)}`, {
      headers: authHeaders(session),
    })
      .then((response) =>
        responseJson<TeamProfileDetail>(
          response,
          "Care Profile을 불러오지 못했습니다.",
        ),
      )
      .then((payload) => {
        if (detailRequestRef.current !== requestId) return;
        setDetail(payload);
        setDetailLoading(false);
      })
      .catch((error) => {
        if (detailRequestRef.current !== requestId) return;
        if (error instanceof ProfileApiError && error.status === 401) {
          expireSession("세션이 만료되었습니다. 다시 로그인해 주세요.");
          return;
        }
        setDetailError(
          error instanceof Error
            ? error.message
            : "Care Profile을 불러오지 못했습니다.",
        );
        setDetailLoading(false);
      });
  };

  if (!sessionReady) {
    return (
      <main className="dc-detail">
        <div className="dc-home-state" role="status">
          직원 권한을 확인하고 있습니다.
        </div>
      </main>
    );
  }
  if (!session) {
    return (
      <ProfileLogin
        error={authError}
        notice={authNotice}
        busy={authBusy}
        onSubmit={login}
      />
    );
  }

  return (
    <>
      <ProfileList
        profiles={profiles}
        selectedPhone={selectedPhone}
        loading={profilesLoading}
        error={profilesError}
        query={queryInput}
        appliedQuery={query}
        onQueryChange={setQueryInput}
        onSearch={() => {
          setProfilesLoading(true);
          setQuery(queryInput.trim());
          setRefreshNonce((value) => value + 1);
        }}
        onSelect={selectProfile}
        onRetry={() => {
          setProfilesLoading(true);
          setRefreshNonce((value) => value + 1);
        }}
        onLogout={logout}
      />
      <ProfileDetail
        profile={detail}
        loading={detailLoading}
        error={detailError}
        onRetry={() => selectedPhone && selectProfile(selectedPhone)}
      />
    </>
  );
}
