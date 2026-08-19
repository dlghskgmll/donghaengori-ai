import type {
  SavedIntakeDetailView,
  SavedIntakeSummary,
} from "@/lib/ai/savedIntakeView";
import { clearTeamSession, readTeamSession } from "./teamSession";

// 저장된 접수 read 경로의 브라우저 경계.
//
// Team이 /api/intakes 계열에 intake.view 권한을 요구하므로, 요청·홈·일정·상세가
// 모두 같은 직원 세션(sessionStorage)의 Bearer를 써야 한다. 여기 한 곳에서만
// 헤더를 만들어 붙인다 — 화면마다 따로 만들면 어디는 붙고 어디는 빠진다.
//
// 읽기 전용이다. 여기서 확정·수정·재분석을 하지 않는다.

export const SAVED_INTAKE_LOGIN_REQUIRED =
  "저장된 접수는 권한이 확인된 직원만 조회할 수 있습니다.";

export const SAVED_INTAKE_SESSION_EXPIRED =
  "세션이 만료되었습니다. 다시 로그인해 주세요.";

/** proxy가 준 실제 status를 들고 다닌다 — 401·403·502를 화면이 구분해야 한다. */
export class SavedIntakeReadError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "SavedIntakeReadError";
  }
}

/** 로그인이 필요해서 실패한 read인지. 화면이 "backend 꺼짐"과 구분해 안내한다. */
export function isSavedIntakeAuthMessage(
  message: string | null | undefined,
): boolean {
  return (
    message === SAVED_INTAKE_LOGIN_REQUIRED ||
    message === SAVED_INTAKE_SESSION_EXPIRED
  );
}

type ReadableStorage = Pick<Storage, "getItem">;
type ClearableStorage = Pick<Storage, "removeItem">;

/** 직원 세션에서 Authorization 헤더를 만든다. 세션이 없으면 null. */
export function savedIntakeAuthHeader(
  storage: ReadableStorage | null | undefined,
): string | null {
  if (!storage) return null;
  const session = readTeamSession(storage);
  return session ? `Bearer ${session.token}` : null;
}

function browserStorage(): (ReadableStorage & ClearableStorage) | null {
  return typeof window === "undefined" ? null : window.sessionStorage;
}

function errorMessageOf(payload: unknown, fallback: string): string {
  return typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
    ? payload.error
    : fallback;
}

async function readJson(response: Response, fallback: string): Promise<unknown> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // 아래의 안정된 fallback 문구를 쓴다.
  }
  if (!response.ok) {
    throw new SavedIntakeReadError(
      response.status,
      errorMessageOf(payload, fallback),
    );
  }
  return payload;
}

/**
 * 세션이 죽었으면 이 브라우저에서 지운다 — U7 profile과 같은 만료 처리다.
 * 살아 있는 토큰으로 받은 403(권한 없음)은 세션 문제가 아니므로 지우지 않는다.
 */
function expireDeadSession(
  status: number,
  storage: ClearableStorage | null,
): void {
  if (status !== 401 || !storage) return;
  clearTeamSession(storage);
}

interface SavedIntakeRequestOptions {
  signal?: AbortSignal;
  storage?: (ReadableStorage & ClearableStorage) | null;
  fetchImpl?: typeof fetch;
}

async function authorizedGet(
  path: string,
  fallback: string,
  options: SavedIntakeRequestOptions,
): Promise<unknown> {
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const authorization = savedIntakeAuthHeader(storage);
  // 세션이 없으면 backend를 부르지 않는다. 5초마다 401을 만들 이유가 없다.
  if (!authorization) {
    throw new SavedIntakeReadError(401, SAVED_INTAKE_LOGIN_REQUIRED);
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(path, {
    headers: { Authorization: authorization },
    signal: options.signal,
  });
  try {
    return await readJson(response, fallback);
  } catch (error) {
    if (error instanceof SavedIntakeReadError) {
      expireDeadSession(error.status, storage);
      if (error.status === 401) {
        throw new SavedIntakeReadError(401, SAVED_INTAKE_SESSION_EXPIRED);
      }
    }
    throw error;
  }
}

/** 저장된 접수 목록을 읽는다. 실패하면 던진다 — 판단은 poller가 한다. */
export async function fetchSavedList(
  signal?: AbortSignal,
  options: Omit<SavedIntakeRequestOptions, "signal"> = {},
): Promise<SavedIntakeSummary[]> {
  const payload = await authorizedGet(
    "/api/v1/intakes",
    "요청 목록을 불러오지 못했습니다.",
    { ...options, signal },
  );
  return typeof payload === "object" && payload !== null && "intakes" in payload
    ? ((payload as { intakes: SavedIntakeSummary[] }).intakes ?? [])
    : [];
}

export async function fetchSavedDetail(
  savedId: number,
  signal?: AbortSignal,
  options: Omit<SavedIntakeRequestOptions, "signal"> = {},
): Promise<SavedIntakeDetailView> {
  const payload = await authorizedGet(
    `/api/v1/intakes/${savedId}`,
    "요청 내용을 불러오지 못했습니다.",
    { ...options, signal },
  );
  return payload as SavedIntakeDetailView;
}

/**
 * 저장된 접수에 대한 **쓰기** — 확정과 통화 확인.
 *
 * 읽기와 달리 실패를 조용히 넘기지 않는다. poller 는 실패해도 기존 목록을
 * 유지하지만, 여기는 사람이 누른 행동이라 결과를 반드시 화면에 말해야 한다.
 */
async function authorizedPost(
  path: string,
  body: unknown,
  fallback: string,
  options: SavedIntakeRequestOptions,
): Promise<unknown> {
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const authorization = savedIntakeAuthHeader(storage);
  if (!authorization) {
    throw new SavedIntakeReadError(401, SAVED_INTAKE_LOGIN_REQUIRED);
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(path, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });
  try {
    return await readJson(response, fallback);
  } catch (error) {
    if (error instanceof SavedIntakeReadError) {
      expireDeadSession(error.status, storage);
      if (error.status === 401) {
        throw new SavedIntakeReadError(401, SAVED_INTAKE_SESSION_EXPIRED);
      }
    }
    throw error;
  }
}

export interface ConfirmSavedIntakeInput {
  hospital: string;
  date: string;
  level: string;
  acknowledge?: boolean;
  acknowledgeReason?: string | null;
}

/**
 * 최종 확정. **409 는 오류가 아니라 상태다** — 확인 필요가 남았거나 긴급이라
 * 확정 대상이 아닌 경우다. 화면이 그 메시지를 그대로 보여주고, 게이트가 함께
 * 오면 무엇이 막는지 다시 그린다.
 */
export async function confirmSavedIntake(
  savedId: number,
  input: ConfirmSavedIntakeInput,
  options: Omit<SavedIntakeRequestOptions, "signal"> = {},
): Promise<void> {
  await authorizedPost(
    `/api/v1/intakes/${savedId}/confirm`,
    {
      hospital: input.hospital,
      date: input.date,
      level: input.level,
      acknowledge: input.acknowledge ?? false,
      acknowledge_reason: input.acknowledgeReason ?? null,
    },
    "접수를 확정하지 못했습니다.",
    options,
  );
}

/**
 * 동행을 다녀왔다 — 확정 → 동행 완료.
 *
 * 확정은 "일정을 정했다" 이고 이것은 "실제로 다녀왔다" 다. 이 호출이 있어야
 * 목록에서 다녀온 건이 구분되고, 보호자 타임라인이 끝까지 가고, 다음 접수의
 * 병원 후보가 이 방문을 근거로 쓴다.
 */
export async function completeSavedIntake(
  savedId: number,
  note?: string,
  options: Omit<SavedIntakeRequestOptions, "signal"> = {},
): Promise<void> {
  await authorizedPost(
    `/api/v1/intakes/${savedId}/complete`,
    note ? { note } : {},
    "동행 완료를 반영하지 못했습니다.",
    options,
  );
}

/**
 * 통화로 확인한 값을 반영한다 — 게이트를 푸는 유일한 경로.
 *
 * **화면에서 값을 고른 것과 다르다.** 이 호출은 감사 로그에 '항목확인' 으로
 * 남고 카드 근거에 "통화로 확인함" 이 붙는다. 확인 전화를 마치고 들은 값을
 * 적는 자리에서만 부른다.
 */
export async function verifySavedIntakeField(
  savedId: number,
  field: "target" | "hospital" | "dept" | "date" | "time",
  value: string,
  options: Omit<SavedIntakeRequestOptions, "signal"> = {},
): Promise<void> {
  await authorizedPost(
    `/api/v1/intakes/${savedId}/verify`,
    { field, value },
    "확인 결과를 반영하지 못했습니다.",
    options,
  );
}
