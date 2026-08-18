// route handler 수준 테스트 — CASE 4/5/6: 생성→조회 왕복과 not-found 응답 동일성.

import { beforeEach, describe, expect, it } from "vitest";
import { POST as createApplication } from "@/app/api/guardian/applications/route";
import { POST as lookupApplication } from "@/app/api/guardian/applications/lookup/route";
import { __resetInMemoryStore } from "@/lib/guardian/repository/inMemoryApplicationRepository";
import { __resetRepositoryCache } from "@/lib/guardian/repository";

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  elder: { name: "김영자", birthDate: "1950-02-14", region: "나주시" },
  guardian: { relationship: "딸", phone: "010-1234-5678" },
  visit: {
    date: "2026-08-20",
    time: "10:30",
    dateUnknown: false,
    timeUnknown: false,
    hospital: "화순전남대학교병원",
    department: "정형외과",
    departmentUnknown: false,
  },
  assistance: ["휠체어 이동", "진료실 동행"],
};

describe("applications API", () => {
  beforeEach(() => {
    __resetInMemoryStore();
    __resetRepositoryCache();
  });

  it("생성 → 신청번호 발급 → 같은 번호+전화번호로 조회하면 동일 데이터가 돌아온다", async () => {
    const createResponse = await createApplication(
      jsonRequest("http://test/api/applications", validBody),
    );
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    expect(created.application.applicationNumber).toMatch(/^DH-\d{6}-[A-Z0-9]{4}$/);
    // 개발용 메모리 저장소는 durable=false를 정직하게 알린다.
    expect(created.persistence).toEqual({ provider: "memory", durable: false });

    const lookupResponse = await lookupApplication(
      jsonRequest("http://test/api/applications/lookup", {
        applicationNumber: created.application.applicationNumber,
        guardianPhone: "010-1234-5678",
      }),
    );
    expect(lookupResponse.status).toBe(200);
    const found = await lookupResponse.json();
    expect(found.application.elder.name).toBe("김영자");
    expect(found.application.visit.hospital).toBe("화순전남대학교병원");
    expect(found.application.visit.time).toBe("10:30");
  });

  it("CASE 4/5/6 — 틀린 전화번호와 없는 신청번호가 완전히 동일한 응답을 받는다", async () => {
    const createResponse = await createApplication(
      jsonRequest("http://test/api/applications", validBody),
    );
    const created = await createResponse.json();

    const wrongPhone = await lookupApplication(
      jsonRequest("http://test/api/applications/lookup", {
        applicationNumber: created.application.applicationNumber,
        guardianPhone: "010-9999-9999",
      }),
    );
    const missingNumber = await lookupApplication(
      jsonRequest("http://test/api/applications/lookup", {
        applicationNumber: "DH-260818-ZZZZ",
        guardianPhone: "010-1234-5678",
      }),
    );

    expect(wrongPhone.status).toBe(404);
    expect(missingNumber.status).toBe(404);
    const wrongPhoneBody = await wrongPhone.json();
    const missingNumberBody = await missingNumber.json();
    // 존재 여부가 응답 차이로 새어 나가지 않는다: status·본문 완전 동일.
    expect(wrongPhoneBody).toEqual(missingNumberBody);
    // 응답 어디에도 신청 데이터가 없다 (김순자 같은 fixture fallback 금지).
    expect(JSON.stringify(wrongPhoneBody)).not.toContain("김영자");
    expect(JSON.stringify(wrongPhoneBody)).not.toContain("application");
  });

  it("필수 항목이 빠지면 400", async () => {
    const response = await createApplication(
      jsonRequest("http://test/api/applications", { ...validBody, assistance: [] }),
    );
    expect(response.status).toBe(400);
  });
});
