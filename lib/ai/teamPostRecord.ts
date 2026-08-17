import { z } from "zod";
import { loadIntakeAIConfig } from "./config";

const nullableText = z.string().nullable().optional().transform((value) => value ?? null);

export const TeamPostDraftSchema = z.object({
  treatment: nullableText,
  next_visit: nullableText,
  pharmacy: nullableText,
  cautions: nullableText,
  guardian_msg: nullableText,
  profile_update: nullableText,
});

export const TeamPostRecordSchema = z
  .object({
    id: z.number().int().nonnegative(),
    intake_id: z.number().int().nullable().optional().transform((value) => value ?? null),
    phone: nullableText,
    created_at: nullableText,
    memo_raw: nullableText,
    treatment: nullableText,
    next_visit: nullableText,
    pharmacy: nullableText,
    cautions: nullableText,
    guardian_msg: nullableText,
    profile_update: nullableText,
    approved: z
      .union([z.boolean(), z.number().int()])
      .transform((value) => value === true || value === 1),
  })
  .loose();

export const TeamPostRecordCreateSchema = z.object({
  intake_id: z.number().int().nonnegative(),
  phone: z.string().min(1),
  memo: z.string().min(1),
  dept: z.string().nullable().optional(),
  target: z.string().nullable().optional(),
});

export const TeamPostRecordCreateResponseSchema = z.object({
  record_id: z.number().int().nonnegative(),
  draft: TeamPostDraftSchema,
  needs_schedule_check: z.boolean(),
  source: z.string(),
  notes: z.array(z.string()),
});

export const TeamPostRecordDecisionSchema = z.object({
  ok: z.literal(true),
  approved: z.boolean(),
  changed: z.boolean(),
  applied: z.boolean(),
  reason: z.string().optional(),
});

export const TeamAuditEntrySchema = z
  .object({
    id: z.number().int().nonnegative(),
    at: nullableText,
    actor: nullableText,
    role: nullableText,
    action: z.string(),
    target_type: z.string(),
    target_id: z.string(),
    detail: nullableText,
  })
  .loose();

export type TeamPostDraft = z.infer<typeof TeamPostDraftSchema>;
export type TeamPostRecord = z.infer<typeof TeamPostRecordSchema>;
export type TeamPostRecordCreate = z.infer<typeof TeamPostRecordCreateSchema>;
export type TeamPostRecordCreateResponse = z.infer<
  typeof TeamPostRecordCreateResponseSchema
>;
export type TeamPostRecordDecision = z.infer<typeof TeamPostRecordDecisionSchema>;
export type TeamAuditEntry = z.infer<typeof TeamAuditEntrySchema>;

export class TeamPostRecordError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "TeamPostRecordError";
  }
}

interface TeamPostOptions {
  authorization?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function bearerHeader(value: string | null | undefined): string {
  const header = value?.trim() ?? "";
  if (!/^Bearer\s+\S+$/i.test(header)) {
    throw new TeamPostRecordError(401, "TEAM_AUTH_REQUIRED", "로그인이 필요합니다.");
  }
  return header;
}

function responseError(status: number): TeamPostRecordError {
  if (status === 401) {
    return new TeamPostRecordError(
      401,
      "TEAM_SESSION_INVALID",
      "세션이 만료되었거나 유효하지 않습니다.",
    );
  }
  if (status === 403) {
    return new TeamPostRecordError(
      403,
      "TEAM_POST_FORBIDDEN",
      "사후기록 처리 권한이 없습니다.",
    );
  }
  if (status === 404) {
    return new TeamPostRecordError(
      404,
      "TEAM_POST_NOT_FOUND",
      "사후기록을 찾을 수 없습니다.",
    );
  }
  if (status === 422) {
    return new TeamPostRecordError(
      422,
      "TEAM_POST_INPUT_INVALID",
      "사후기록 입력값을 확인해 주세요.",
    );
  }
  return new TeamPostRecordError(
    502,
    "TEAM_POST_UNAVAILABLE",
    "사후기록 서비스에 연결하지 못했습니다.",
  );
}

async function requestTeam(
  path: string,
  init: RequestInit,
  options: TeamPostOptions,
): Promise<unknown> {
  const config = loadIntakeAIConfig();
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${config.teamBaseUrl}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: bearerHeader(options.authorization),
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(options.timeoutMs ?? config.teamTimeoutMs),
    });
  } catch (error) {
    if (error instanceof TeamPostRecordError) throw error;
    throw responseError(502);
  }
  if (!response.ok) throw responseError(response.status);
  try {
    return await response.json();
  } catch {
    throw new TeamPostRecordError(
      502,
      "TEAM_POST_RESPONSE_INVALID",
      "사후기록 응답을 해석하지 못했습니다.",
    );
  }
}

function parseOrThrow<T>(schema: z.ZodType<T>, payload: unknown, message: string): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new TeamPostRecordError(502, "TEAM_POST_RESPONSE_INVALID", message);
  }
  return parsed.data;
}

export async function fetchTeamPostRecords(
  limit: number,
  options: TeamPostOptions = {},
): Promise<TeamPostRecord[]> {
  const payload = await requestTeam(
    `/api/post-records?limit=${limit}`,
    { method: "GET" },
    options,
  );
  return parseOrThrow(
    z.array(TeamPostRecordSchema),
    payload,
    "사후기록 목록 응답을 해석하지 못했습니다.",
  );
}

export async function createTeamPostRecord(
  input: TeamPostRecordCreate,
  options: TeamPostOptions = {},
): Promise<TeamPostRecordCreateResponse> {
  const body = TeamPostRecordCreateSchema.parse(input);
  const payload = await requestTeam(
    "/api/post-records",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    options,
  );
  return parseOrThrow(
    TeamPostRecordCreateResponseSchema,
    payload,
    "사후기록 초안 응답을 해석하지 못했습니다.",
  );
}

export async function decideTeamPostRecord(
  recordId: number,
  approved: boolean,
  options: TeamPostOptions = {},
): Promise<TeamPostRecordDecision> {
  const payload = await requestTeam(
    `/api/post-records/${recordId}/approve`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved }),
    },
    options,
  );
  return parseOrThrow(
    TeamPostRecordDecisionSchema,
    payload,
    "사후기록 처리 응답을 해석하지 못했습니다.",
  );
}

export async function fetchTeamAudit(
  limit: number,
  options: TeamPostOptions = {},
): Promise<TeamAuditEntry[]> {
  const payload = await requestTeam(
    `/api/audit?limit=${limit}`,
    { method: "GET" },
    options,
  );
  return parseOrThrow(
    z.array(TeamAuditEntrySchema),
    payload,
    "처리 이력 응답을 해석하지 못했습니다.",
  );
}
