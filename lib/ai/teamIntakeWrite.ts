import { z } from "zod";
import { loadIntakeAIConfig } from "./config";

/**
 * 저장된 접수에 대한 **쓰기** 호출 — 확정(confirm)과 통화 확인(verify).
 *
 * 읽기(teamIntakeRead)와 파일을 나눈 이유는 위험이 다르기 때문이다. 읽기는
 * 틀려도 화면이 이상해질 뿐이지만, 여기는 부르는 순간 감사 로그에 사람 이름이
 * 남고 되돌릴 수 없다. 어디서 무엇을 부르는지 한 파일에서 다 보이게 둔다.
 *
 * verify 는 "통화로 확인함" 을 뜻한다. 화면에서 값을 고른 것과는 다르다 —
 * 그 구분이 무너지면 사고가 났을 때 누가 실제로 확인했는지 답할 수 없다.
 * 그래서 이 함수는 **확인 전화를 마친 뒤 입력한 값**에만 쓴다.
 */

export class TeamIntakeWriteError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    /** 409 로 막혔을 때 서버가 준 gate. 화면이 무엇이 막는지 다시 그린다. */
    public readonly gate?: unknown,
  ) {
    super(message);
    this.name = "TeamIntakeWriteError";
  }
}

export const TeamConfirmInputSchema = z.object({
  hospital: z.string().min(1),
  date: z.string().min(1),
  level: z.string().min(1),
  acknowledge: z.boolean().optional(),
  // 서버 Literal 과 같은 값이어야 한다 — 여기서 막히면 화면은 아무 말도
  // 못 하고, 서버까지 가면 422 다. 새 유형의 정상 경로가 '직접 응대함' 이다.
  acknowledge_reason: z
    .enum([
      "직접 응대함",
      "이미 알고 있음",
      "물어볼 필요 없음",
      "연락이 닿지 않음",
      "기타",
    ])
    .nullable()
    .optional(),
});

export const TeamCompleteInputSchema = z.object({
  note: z.string().optional(),
});

export const TeamVerifyInputSchema = z.object({
  field: z.enum(["target", "hospital", "dept", "date", "time"]),
  value: z.string().min(1),
});

export const TeamConfirmResultSchema = z
  .object({
    ok: z.literal(true),
    acknowledged: z.boolean().optional(),
  })
  .loose();

export const TeamVerifyResultSchema = z.object({ ok: z.literal(true) }).loose();

export const TeamCompleteResultSchema = z
  .object({
    ok: z.literal(true),
    changed: z.boolean().optional(),
    // 확정 병원·날짜가 없으면 이력을 못 쌓는다. 화면이 그 사실을 알아야
    // "다녀왔다고만 표시됐다" 를 안내할 수 있다.
    history_added: z.boolean().optional(),
  })
  .loose();

export type TeamCompleteInput = z.infer<typeof TeamCompleteInputSchema>;
export type TeamCompleteResult = z.infer<typeof TeamCompleteResultSchema>;
export type TeamConfirmInput = z.infer<typeof TeamConfirmInputSchema>;
export type TeamVerifyInput = z.infer<typeof TeamVerifyInputSchema>;
export type TeamConfirmResult = z.infer<typeof TeamConfirmResultSchema>;
export type TeamVerifyResult = z.infer<typeof TeamVerifyResultSchema>;

interface TeamWriteOptions {
  authorization?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function bearerHeader(value: string | null | undefined): string {
  const header = value?.trim() ?? "";
  if (!/^Bearer\s+\S+$/i.test(header)) {
    throw new TeamIntakeWriteError(401, "TEAM_AUTH_REQUIRED", "로그인이 필요합니다.");
  }
  return header;
}

/**
 * 409 는 "요청이 틀렸다" 가 아니라 "지금 상태에서는 못 한다" 다.
 * 확인 필요가 남았거나(gate), 긴급이라 확정 대상이 아닌 경우다. 화면이
 * 그 둘을 구분해 안내할 수 있도록 detail 을 그대로 실어 보낸다.
 */
function writeError(status: number, payload: unknown): TeamIntakeWriteError {
  const detail =
    typeof payload === "object" && payload !== null && "detail" in payload
      ? (payload as { detail: unknown }).detail
      : null;
  const message =
    typeof detail === "object" && detail !== null && "message" in detail
      ? String((detail as { message: unknown }).message)
      : null;
  const gate =
    typeof detail === "object" && detail !== null && "gate" in detail
      ? (detail as { gate: unknown }).gate
      : undefined;

  if (status === 401) {
    return new TeamIntakeWriteError(
      401,
      "TEAM_SESSION_INVALID",
      "세션이 만료되었거나 유효하지 않습니다.",
    );
  }
  if (status === 403) {
    return new TeamIntakeWriteError(403, "TEAM_WRITE_FORBIDDEN", "확정 권한이 없습니다.");
  }
  if (status === 404) {
    return new TeamIntakeWriteError(404, "TEAM_INTAKE_NOT_FOUND", "접수를 찾을 수 없습니다.");
  }
  if (status === 409) {
    return new TeamIntakeWriteError(
      409,
      "TEAM_GATE_BLOCKED",
      message ?? "확인이 필요한 항목이 남아 있습니다.",
      gate,
    );
  }
  if (status === 422) {
    return new TeamIntakeWriteError(422, "TEAM_WRITE_INPUT_INVALID", "입력값을 확인해 주세요.");
  }
  return new TeamIntakeWriteError(502, "TEAM_WRITE_UNAVAILABLE", "확정 서비스에 연결하지 못했습니다.");
}

async function postTeam(
  path: string,
  body: unknown,
  options: TeamWriteOptions,
): Promise<unknown> {
  const config = loadIntakeAIConfig();
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${config.teamBaseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: bearerHeader(options.authorization),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs ?? config.teamTimeoutMs),
    });
  } catch (error) {
    if (error instanceof TeamIntakeWriteError) throw error;
    throw writeError(502, null);
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) throw writeError(response.status, payload);
  return payload;
}

function parseOrThrow<T>(schema: z.ZodType<T>, payload: unknown, message: string): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new TeamIntakeWriteError(502, "TEAM_WRITE_RESPONSE_INVALID", message);
  }
  return parsed.data;
}

/** 최종 확정. acknowledge=true 면 확인 필요가 남은 채로 넘어간다(감사 로그에 사유와 함께 남는다). */
export async function confirmTeamIntake(
  intakeId: number,
  input: TeamConfirmInput,
  options: TeamWriteOptions = {},
): Promise<TeamConfirmResult> {
  const body = TeamConfirmInputSchema.parse(input);
  const payload = await postTeam(`/api/intakes/${intakeId}/confirm`, body, options);
  return parseOrThrow(TeamConfirmResultSchema, payload, "확정 응답을 해석하지 못했습니다.");
}

/**
 * 동행을 다녀왔다 — 확정 → 동행 완료. 이력이 자동으로 쌓인다.
 *
 * 확정은 "일정을 정했다" 이고 이것은 "실제로 다녀왔다" 다. 이 호출이 있어야
 * 목록에서 다녀온 건이 구분되고, 보호자 타임라인이 끝까지 가고, 다음 접수의
 * 병원 후보가 이 방문을 근거로 쓴다.
 *
 * 409 는 확정 전이거나 이미 완료라는 뜻이다 — 요청이 틀린 것이 아니다.
 */
export async function completeTeamIntake(
  intakeId: number,
  input: TeamCompleteInput = {},
  options: TeamWriteOptions = {},
): Promise<TeamCompleteResult> {
  const body = TeamCompleteInputSchema.parse(input);
  const payload = await postTeam(`/api/intakes/${intakeId}/complete`, body, options);
  return parseOrThrow(TeamCompleteResultSchema, payload, "동행 완료 응답을 해석하지 못했습니다.");
}


/** 통화로 확인한 값을 반영한다 — 게이트를 푸는 유일한 경로. */
export async function verifyTeamIntakeField(
  intakeId: number,
  input: TeamVerifyInput,
  options: TeamWriteOptions = {},
): Promise<TeamVerifyResult> {
  const body = TeamVerifyInputSchema.parse(input);
  const payload = await postTeam(`/api/intakes/${intakeId}/verify`, body, options);
  return parseOrThrow(TeamVerifyResultSchema, payload, "확인 응답을 해석하지 못했습니다.");
}
