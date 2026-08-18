// 개발 전용 저장소.
//
// !! 제품 persistence가 아니다 !!
// 프로세스 메모리에만 존재하므로 서버를 재시작하거나 다른 인스턴스로 요청이 가면 사라진다.
// 다른 브라우저·기기에서 조회하는 제품 요건을 만족하지 못한다.
// Phase A에서 UI·라우팅·도메인 로직을 실제로 굴려 보기 위한 것이며,
// durable=false로 스스로를 표시해 화면이 이 사실을 숨기지 않도록 한다.

import { randomUUID } from "node:crypto";
import {
  normalizeApplicationNumber,
  normalizePhone,
  type GuardianApplication,
  type NewGuardianApplication,
} from "../domain/application";
import { generateApplicationNumber } from "../domain/applicationNumber";
import type { ApplicationRepositoryWithInfo } from "./applicationRepository";

// dev 서버의 HMR 사이에서도 같은 저장소를 쓰도록 globalThis에 붙인다.
const globalStore = globalThis as unknown as {
  __guardianApplications?: Map<string, GuardianApplication>;
};
const store: Map<string, GuardianApplication> =
  globalStore.__guardianApplications ?? new Map();
globalStore.__guardianApplications = store;

function uniqueApplicationNumber(now: Date): string {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = generateApplicationNumber(now);
    const taken = [...store.values()].some(
      (row) => row.applicationNumber === candidate,
    );
    if (!taken) return candidate;
  }
  throw new Error("신청번호를 발급하지 못했습니다.");
}

export class InMemoryApplicationRepository implements ApplicationRepositoryWithInfo {
  readonly provider = "memory";
  readonly durable = false;

  async create(input: NewGuardianApplication): Promise<GuardianApplication> {
    const now = new Date();
    const timestamp = now.toISOString();
    const application: GuardianApplication = {
      ...input,
      id: randomUUID(),
      applicationNumber: uniqueApplicationNumber(now),
      guardian: { ...input.guardian, phone: normalizePhone(input.guardian.phone) },
      status: "RECEIVED",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    store.set(application.id, application);
    return application;
  }

  async findByApplicationNumberAndPhone(
    applicationNumber: string,
    guardianPhone: string,
  ): Promise<GuardianApplication | null> {
    const number = normalizeApplicationNumber(applicationNumber);
    const phone = normalizePhone(guardianPhone);
    if (!number || !phone) return null;
    for (const row of store.values()) {
      if (
        normalizeApplicationNumber(row.applicationNumber) === number &&
        normalizePhone(row.guardian.phone) === phone
      ) {
        return row;
      }
    }
    return null;
  }

  async findById(id: string): Promise<GuardianApplication | null> {
    return store.get(id) ?? null;
  }

  async updateStatus(
    id: string,
    status: GuardianApplication["status"],
    infoRequest?: GuardianApplication["infoRequest"],
  ): Promise<GuardianApplication | null> {
    const row = store.get(id);
    if (!row) return null;
    const next: GuardianApplication = {
      ...row,
      status,
      infoRequest: status === "NEEDS_INFO" ? infoRequest : undefined,
      updatedAt: new Date().toISOString(),
    };
    store.set(id, next);
    return next;
  }
}

/** 테스트에서 상태를 초기화할 때 사용한다. */
export function __resetInMemoryStore() {
  store.clear();
}
