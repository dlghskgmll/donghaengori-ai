import type { TeamSession } from "@/lib/ai/teamProfileRead";
import { clearTeamSession, writeTeamSession } from "./teamSession";

// 직원 로그인/로그아웃의 공통 경계.
//
// 어르신·사후기록·공통 진입점이 각자 fetch를 들고 있으면 세션 정책이 화면마다
// 갈라진다. 저장 위치(sessionStorage)와 만료 처리는 여기 한 곳에서만 정한다.
//
// 새 인증 체계를 만들지 않는다 — 기존 POST /api/v1/auth/login 계약을 그대로 쓴다.

export class TeamLoginError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "TeamLoginError";
  }
}

interface LoginOptions {
  storage?: Pick<Storage, "setItem"> | null;
  fetchImpl?: typeof fetch;
}

interface LogoutOptions {
  storage?: Pick<Storage, "removeItem"> | null;
  fetchImpl?: typeof fetch;
}

function errorMessageOf(payload: unknown, fallback: string): string {
  return typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
    ? payload.error
    : fallback;
}

/** 로그인 성공 시 이 브라우저 탭 세션에 저장하고 세션을 돌려준다. */
export async function loginTeamSession(
  userId: string,
  password: string,
  options: LoginOptions = {},
): Promise<TeamSession> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // 비밀번호는 body로만 나간다 — URL·로그에 남기지 않는다.
    body: JSON.stringify({ userId, password }),
  });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // 아래 fallback 문구를 쓴다.
  }
  if (!response.ok) {
    throw new TeamLoginError(
      response.status,
      errorMessageOf(payload, "로그인하지 못했습니다."),
    );
  }
  const session = payload as TeamSession;
  const storage =
    options.storage === undefined
      ? typeof window === "undefined"
        ? null
        : window.sessionStorage
      : options.storage;
  if (storage) writeTeamSession(storage, session);
  return session;
}

/**
 * 서버 세션을 끊고 이 브라우저 탭의 세션도 지운다.
 * 서버 응답 여부와 무관하게 로컬 세션은 반드시 지운다 — 화면에 남아 있으면
 * 로그아웃한 줄 알고 자리를 비운다.
 */
export async function logoutTeamSession(
  session: TeamSession | null,
  options: LogoutOptions = {},
): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  if (session) {
    try {
      await fetchImpl("/api/v1/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.token}` },
      });
    } catch {
      // 서버 연결 실패도 로컬 로그아웃을 막지 않는다.
    }
  }
  const storage =
    options.storage === undefined
      ? typeof window === "undefined"
        ? null
        : window.sessionStorage
      : options.storage;
  if (storage) clearTeamSession(storage);
}

/** nav에 짧게 보여 줄 직원 표기. 권한 목록까지 늘어놓지 않는다. */
export function teamSessionLabel(session: TeamSession): {
  name: string;
  role: string;
} {
  return {
    name: session.user.name || session.user.id,
    role: session.user.role || "역할 미등록",
  };
}
