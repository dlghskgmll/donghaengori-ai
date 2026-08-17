import { z } from "zod";
import { loadIntakeAIConfig } from "./config";

export const TeamProfileSummarySchema = z
  .object({
    phone: z.string(),
    id: z.string().nullable().optional(),
    name: z.string(),
    age: z.number().int().nullable().optional(),
    region: z.string().nullable().optional(),
    visits: z.number().int().nonnegative(),
    last_visit: z.string().nullable(),
  })
  .loose();

export const TeamProfileHistorySchema = z
  .object({
    date: z.string().nullable().optional(),
    hospital: z.string().nullable().optional(),
    dept: z.string().nullable().optional(),
    symptom: z.string().nullable().optional(),
    pharmacy: z.boolean().default(false),
  })
  .loose();

const TeamGuardianSchema = z
  .object({
    name: z.string().nullable().optional(),
    relation: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    available: z.string().nullable().optional(),
  })
  .loose();

export const TeamProfileDetailSchema = z
  .object({
    phone: z.string(),
    id: z.string().nullable().optional(),
    name: z.string(),
    age: z.number().int().nullable().optional(),
    region: z.string().nullable().optional(),
    guardian: TeamGuardianSchema.nullable().optional(),
    caregiver: z.string().nullable().optional(),
    mobility: z.string().nullable().optional(),
    fall_risk: z.boolean().default(false),
    lives_alone: z.boolean().default(false),
    preferred_time: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    ltci_grade: z.string().nullable().optional(),
    care_program: z.string().nullable().optional(),
    history: z.array(TeamProfileHistorySchema).default([]),
  })
  .loose();

export const TeamSessionSchema = z.object({
  token: z.string().min(1),
  user: z
    .object({
      id: z.string(),
      name: z.string(),
      role: z.string(),
      permissions: z.array(z.string()).default([]),
    })
    .loose(),
});

export type TeamProfileSummary = z.infer<typeof TeamProfileSummarySchema>;
export type TeamProfileHistory = z.infer<typeof TeamProfileHistorySchema>;
export type TeamProfileDetail = z.infer<typeof TeamProfileDetailSchema>;
export type TeamSession = z.infer<typeof TeamSessionSchema>;

export class TeamProfileReadError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "TeamProfileReadError";
  }
}

interface TeamRequestOptions {
  authorization?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function bearerHeader(value: string | null | undefined): string {
  const header = value?.trim() ?? "";
  if (!/^Bearer\s+\S+$/i.test(header)) {
    throw new TeamProfileReadError(401, "TEAM_AUTH_REQUIRED", "로그인이 필요합니다.");
  }
  return header;
}

function responseError(status: number): TeamProfileReadError {
  if (status === 401) {
    return new TeamProfileReadError(
      401,
      "TEAM_SESSION_INVALID",
      "세션이 만료되었거나 유효하지 않습니다.",
    );
  }
  if (status === 403) {
    return new TeamProfileReadError(
      403,
      "TEAM_PROFILE_FORBIDDEN",
      "Care Profile 조회 권한이 없습니다.",
    );
  }
  if (status === 404) {
    return new TeamProfileReadError(
      404,
      "TEAM_PROFILE_NOT_FOUND",
      "등록된 대상자가 아닙니다.",
    );
  }
  if (status === 429) {
    return new TeamProfileReadError(
      429,
      "TEAM_LOGIN_RATE_LIMITED",
      "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    );
  }
  return new TeamProfileReadError(
    502,
    "TEAM_PROFILE_UNAVAILABLE",
    "Care Profile 서비스에 연결하지 못했습니다.",
  );
}

async function requestTeam(
  path: string,
  init: RequestInit,
  options: TeamRequestOptions,
): Promise<unknown> {
  const config = loadIntakeAIConfig();
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${config.teamBaseUrl}${path}`, {
      ...init,
      signal: AbortSignal.timeout(options.timeoutMs ?? config.teamTimeoutMs),
    });
  } catch {
    throw new TeamProfileReadError(
      502,
      "TEAM_PROFILE_UNAVAILABLE",
      "Care Profile 서비스에 연결하지 못했습니다.",
    );
  }

  if (!response.ok) throw responseError(response.status);
  try {
    return await response.json();
  } catch {
    throw new TeamProfileReadError(
      502,
      "TEAM_PROFILE_RESPONSE_INVALID",
      "Care Profile 응답을 해석하지 못했습니다.",
    );
  }
}

export async function loginTeamProfile(
  userId: string,
  password: string,
  options: TeamRequestOptions = {},
): Promise<TeamSession> {
  const payload = await requestTeam(
    "/api/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ user_id: userId, password }),
    },
    options,
  );
  const parsed = TeamSessionSchema.safeParse(payload);
  if (!parsed.success) {
    throw new TeamProfileReadError(
      502,
      "TEAM_PROFILE_RESPONSE_INVALID",
      "로그인 응답을 해석하지 못했습니다.",
    );
  }
  return parsed.data;
}

export async function logoutTeamProfile(
  authorization: string | null,
  options: TeamRequestOptions = {},
): Promise<void> {
  await requestTeam(
    "/api/auth/logout",
    {
      method: "POST",
      headers: { Authorization: bearerHeader(authorization), Accept: "application/json" },
    },
    options,
  );
}

export async function fetchTeamProfiles(
  query: string,
  limit: number,
  options: TeamRequestOptions = {},
): Promise<TeamProfileSummary[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (query.trim()) params.set("query", query.trim());
  const payload = await requestTeam(
    `/api/profiles?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: bearerHeader(options.authorization),
        Accept: "application/json",
      },
    },
    options,
  );
  const parsed = z.array(TeamProfileSummarySchema).safeParse(payload);
  if (!parsed.success) {
    throw new TeamProfileReadError(
      502,
      "TEAM_PROFILE_RESPONSE_INVALID",
      "대상자 목록 응답을 해석하지 못했습니다.",
    );
  }
  return parsed.data;
}

export async function fetchTeamProfile(
  phoneDigits: string,
  options: TeamRequestOptions = {},
): Promise<TeamProfileDetail> {
  const payload = await requestTeam(
    `/api/profiles/${encodeURIComponent(phoneDigits)}`,
    {
      method: "GET",
      headers: {
        Authorization: bearerHeader(options.authorization),
        Accept: "application/json",
      },
    },
    options,
  );
  const parsed = TeamProfileDetailSchema.safeParse(payload);
  if (!parsed.success) {
    throw new TeamProfileReadError(
      502,
      "TEAM_PROFILE_RESPONSE_INVALID",
      "Care Profile 응답을 해석하지 못했습니다.",
    );
  }
  return parsed.data;
}
