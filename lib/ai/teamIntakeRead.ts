import { z } from "zod";
import { loadIntakeAIConfig } from "./config";
import { IntakeProviderError } from "./errors";
import type { EvidenceStatus } from "../domain/intake";

// Team backend의 저장된 접수를 읽기 전용으로 가져온다.
// 실제 계약은 donghaenggori/core/db.py(intakes 테이블)와 web/api.py를 확인해 맞췄다.
// 분석 파이프라인(TeamProvider)과 별개다 — 여기서는 이미 저장된 결과를 읽기만 한다.

const TeamStatus = z.enum(["확인됨", "추정", "확인 필요"]);

const TeamFieldSchema = z
  .object({
    label: z.string(),
    value: z.string().nullable().optional(),
    status: TeamStatus,
    evidence: z.array(z.string()).default([]),
    spoken: z.string().nullable().optional(),
  })
  .loose();

const TeamSavedCardSchema = z
  .object({
    target: z.string().optional(),
    phone_masked: z.string().optional(),
    raw_utterance: z.string().optional(),
    summary: z.string().optional(),
    intent: z.string().nullable().optional(),
    hospital: z.string().nullable().optional(),
    hospital_status: TeamStatus.optional(),
    dept: z.string().nullable().optional(),
    date_value: z.string().nullable().optional(),
    date_label: z.string().nullable().optional(),
    time_value: z.string().nullable().optional(),
    time_label: z.string().nullable().optional(),
    reasons: z.array(z.string()).default([]),
    confirm_questions: z.array(z.string()).default([]),
    fields: z.record(z.string(), TeamFieldSchema).default({}),
    need_level: z.string().nullable().optional(),
    need_basis: z.string().nullable().optional(),
    need_official: z.boolean().optional(),
    flags: z.array(z.string()).default([]),
    manager_notes: z.array(z.string()).default([]),
    requester: z.string().optional(),
    proxy_relation: z.string().nullable().optional(),
  })
  .loose();

// 목록 행에는 card_json이 실리지 않는다(팀 db.list_intakes 주석 참조).
export const TeamIntakeRowSchema = z
  .object({
    id: z.number(),
    created_at: z.string().nullable().optional(),
    channel: z.string().nullable().optional(),
    target: z.string().nullable().optional(),
    raw_utterance: z.string().nullable().optional(),
    intent: z.string().nullable().optional(),
    hospital: z.string().nullable().optional(),
    hospital_status: TeamStatus.nullable().optional(),
    dept: z.string().nullable().optional(),
    date_value: z.string().nullable().optional(),
    date_label: z.string().nullable().optional(),
    need_level: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    confirmed: z.number().nullable().optional(),
    transfer_status: z.string().nullable().optional(),
  })
  .loose();

export const TeamIntakeDetailSchema = TeamIntakeRowSchema.extend({
  card: TeamSavedCardSchema.nullable().optional(),
});

export type TeamIntakeRow = z.infer<typeof TeamIntakeRowSchema>;
export type TeamIntakeDetail = z.infer<typeof TeamIntakeDetailSchema>;
export type TeamSavedCard = z.infer<typeof TeamSavedCardSchema>;

// ── 병원 안전 정규화 ────────────────────────────────────────────────
// 팀 backend에 history-only 병원이 '확인됨'으로 저장돼 있을 수 있다
// (안전 패치가 아직 반영되지 않은 배포본). 저장된 값을 그대로 믿지 않고,
// 이번 발화에서 직접 말한 근거가 있을 때만 확정으로 인정한다.
// 불확실하면 항상 아래로 내린다 — 업그레이드는 하지 않는다.
export function mapTeamStatus(
  status: "확인됨" | "추정" | "확인 필요" | null | undefined,
): EvidenceStatus {
  if (status === "확인됨") return "CONFIRMED_BY_INPUT";
  if (status === "추정") return "INFERRED";
  return "NEEDS_CONFIRMATION";
}

export function normalizeSavedHospitalStatus(options: {
  hospital: string | null | undefined;
  teamStatus: "확인됨" | "추정" | "확인 필요" | null | undefined;
  evidence: string[];
  utterance: string;
}): { status: EvidenceStatus; downgraded: boolean } {
  const name = options.hospital?.trim();
  if (!name) return { status: "NEEDS_CONFIRMATION", downgraded: false };

  if (options.teamStatus !== "확인됨") {
    return { status: mapTeamStatus(options.teamStatus), downgraded: false };
  }

  const directlyMentioned =
    options.evidence.some((entry) => entry.includes("직접 언급")) ||
    (options.utterance.length > 0 && options.utterance.includes(name));

  if (directlyMentioned) {
    return { status: "CONFIRMED_BY_INPUT", downgraded: false };
  }
  return { status: "INFERRED", downgraded: true };
}

// ── fetch ──────────────────────────────────────────────────────────

export interface TeamReadOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>;
}

function resolveOptions(options: TeamReadOptions) {
  const config = loadIntakeAIConfig();
  return {
    baseUrl: (options.baseUrl ?? config.teamBaseUrl).replace(/\/+$/, ""),
    timeoutMs: options.timeoutMs ?? config.teamTimeoutMs,
    fetchImpl: options.fetchImpl ?? ((url: string, init: RequestInit) => fetch(url, init)),
  };
}

function classify(error: unknown): IntakeProviderError {
  if (error instanceof IntakeProviderError) return error;
  if (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return new IntakeProviderError(
      "TEAM_BACKEND_TIMEOUT",
      "Team AI backend 응답 시간이 초과되었습니다.",
      { cause: error },
    );
  }
  return new IntakeProviderError(
    "TEAM_BACKEND_UNAVAILABLE",
    "Team AI backend에 연결하지 못했습니다.",
    { cause: error },
  );
}

async function getJson(
  path: string,
  options: TeamReadOptions,
): Promise<unknown> {
  const { baseUrl, timeoutMs, fetchImpl } = resolveOptions(options);
  let response: Response;
  try {
    // path는 호출부에서 검증된 고정 형태만 들어온다(임의 URL 조립 금지).
    response = await fetchImpl(`${baseUrl}${path}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw classify(error);
  }

  if (!response.ok) {
    throw new IntakeProviderError(
      "TEAM_BACKEND_UNAVAILABLE",
      `Team AI backend가 오류를 반환했습니다 (HTTP ${response.status}).`,
    );
  }
  return response.json();
}

export async function fetchTeamIntakes(
  limit: number,
  options: TeamReadOptions = {},
): Promise<TeamIntakeRow[]> {
  const payload = await getJson(`/api/intakes?limit=${limit}`, options);
  const parsed = z.array(TeamIntakeRowSchema).safeParse(payload);
  if (!parsed.success) {
    throw new IntakeProviderError(
      "TEAM_RESPONSE_INVALID",
      "Team AI backend 접수 목록을 해석할 수 없습니다.",
      { cause: parsed.error },
    );
  }
  return parsed.data;
}

export async function fetchTeamIntakeDetail(
  id: number,
  options: TeamReadOptions = {},
): Promise<TeamIntakeDetail> {
  const payload = await getJson(`/api/intakes/${id}`, options);
  const parsed = TeamIntakeDetailSchema.safeParse(payload);
  if (!parsed.success) {
    throw new IntakeProviderError(
      "TEAM_RESPONSE_INVALID",
      "Team AI backend 접수 상세를 해석할 수 없습니다.",
      { cause: parsed.error },
    );
  }
  return parsed.data;
}
