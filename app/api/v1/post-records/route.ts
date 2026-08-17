import {
  createTeamPostRecord,
  fetchTeamPostRecords,
  TeamPostRecordCreateSchema,
  TeamPostRecordError,
} from "@/lib/ai/teamPostRecord";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function errorResponse(status: number, message: string) {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function handleError(error: unknown, fallback: string) {
  if (error instanceof TeamPostRecordError) {
    return errorResponse(error.status, error.message);
  }
  return errorResponse(502, fallback);
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("limit");
  const limit = raw === null ? DEFAULT_LIMIT : Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return errorResponse(400, "limit 값이 올바르지 않습니다.");
  }
  try {
    const records = await fetchTeamPostRecords(limit, {
      authorization: request.headers.get("authorization"),
    });
    return Response.json(
      { records },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleError(error, "사후기록 목록을 불러오지 못했습니다.");
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "사후기록 요청을 확인해 주세요.");
  }
  const parsed = TeamPostRecordCreateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(400, "사후기록 입력값을 확인해 주세요.");

  try {
    const draft = await createTeamPostRecord(parsed.data, {
      authorization: request.headers.get("authorization"),
    });
    return Response.json(draft, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return handleError(error, "사후기록 초안을 만들지 못했습니다.");
  }
}
