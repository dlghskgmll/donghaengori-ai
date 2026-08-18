// Team FastAPI 백엔드(backend/donghaenggori)에 실제로 저장하는 provider.
//
// 생성은 POST /api/guardian/intakes(구조화 form 포함)를, 조회는
// POST /api/guardian/lookup 을 그대로 쓴다. 두 엔드포인트 다 무인증이며
// 응답 범위를 백엔드가 스스로 좁힌다 — 여기서는 그 응답을 우리 도메인
// 타입으로 옮겨 담기만 한다.

import {
  normalizePhone,
  type ApplicationStatus,
  type GuardianApplication,
  type NewGuardianApplication,
} from "../domain/application";
import type { ApplicationRepositoryWithInfo } from "./applicationRepository";

const DEFAULT_BASE_URL = "http://localhost:8000";
const DEFAULT_TIMEOUT_MS = 15_000;

function baseUrl(): string {
  return (process.env.TEAM_AI_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function timeoutMs(): number {
  const raw = Number(process.env.TEAM_AI_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

async function callBackend(path: string, body: unknown): Promise<Response> {
  try {
    return await fetch(`${baseUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs()),
    });
  } catch (error) {
    throw new Error("Team backend에 연결하지 못했습니다.", { cause: error });
  }
}

interface TeamCreateResponse {
  ok: boolean;
  intake_id: number | null;
  access_code: string | null;
  urgent: boolean;
}

interface TeamLookupResponse {
  ok: boolean;
  code: string | null;
  form: NewGuardianApplication | null;
  status_code: ApplicationStatus;
  hospital: string | null;
  date: string | null;
  time: string | null;
}

export class TeamBackendApplicationRepository implements ApplicationRepositoryWithInfo {
  readonly provider = "team";
  readonly durable = true;

  async create(input: NewGuardianApplication): Promise<GuardianApplication> {
    const normalized: NewGuardianApplication = {
      ...input,
      guardian: { ...input.guardian, phone: normalizePhone(input.guardian.phone) },
    };

    const response = await callBackend("/api/guardian/intakes", {
      phone: normalized.guardian.phone,
      form: normalized,
    });
    if (!response.ok) {
      throw new Error(`Team backend가 오류를 반환했습니다 (HTTP ${response.status}).`);
    }

    const data = (await response.json()) as TeamCreateResponse;
    if (!data.ok || !data.access_code || !data.intake_id) {
      throw new Error("Team backend가 신청번호를 발급하지 못했습니다.");
    }

    const now = new Date().toISOString();
    return {
      ...normalized,
      id: String(data.intake_id),
      applicationNumber: data.access_code,
      status: data.urgent ? "REVIEWING" : "RECEIVED",
      createdAt: now,
      updatedAt: now,
    };
  }

  async findByApplicationNumberAndPhone(
    applicationNumber: string,
    guardianPhone: string,
  ): Promise<GuardianApplication | null> {
    const response = await callBackend("/api/guardian/lookup", {
      code: applicationNumber,
      phone: guardianPhone,
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Team backend가 오류를 반환했습니다 (HTTP ${response.status}).`);
    }

    const data = (await response.json()) as TeamLookupResponse;
    // form이 없으면(구식 발화 접수 등) 보호자 포털이 그릴 수 있는 신청이 아니다.
    if (!data.ok || !data.form) return null;

    const now = new Date().toISOString();
    return {
      ...data.form,
      id: data.code ?? applicationNumber,
      applicationNumber: data.code ?? applicationNumber,
      guardian: { ...data.form.guardian, phone: normalizePhone(guardianPhone) },
      status: data.status_code ?? "RECEIVED",
      visit: {
        ...data.form.visit,
        hospital: data.hospital ?? data.form.visit.hospital,
        date: data.date ?? data.form.visit.date,
        time: data.time ?? data.form.visit.time,
      },
      createdAt: now,
      updatedAt: now,
    };
  }

  async findById(): Promise<GuardianApplication | null> {
    // 아직 아무도 부르지 않는다 — 담당자 시스템이 상태를 바꾸는 화면이
    // 생기면 그때 백엔드에 내부 조회 엔드포인트를 추가해 연결한다.
    throw new Error("team provider는 findById를 아직 지원하지 않습니다.");
  }

  async updateStatus(): Promise<GuardianApplication | null> {
    throw new Error("team provider는 updateStatus를 아직 지원하지 않습니다.");
  }
}
