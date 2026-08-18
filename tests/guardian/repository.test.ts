// 저장소 계약 테스트 — CASE 1~5, 7, 8에 해당하는 도메인 검증.
// InMemory 구현으로 계약을 검증하며, Phase B에서 durable adapter가 생기면
// 같은 테스트를 그 구현에도 돌릴 수 있도록 repository 인터페이스만 사용한다.

import { beforeEach, describe, expect, it } from "vitest";
import type { NewGuardianApplication } from "@/lib/guardian/domain/application";
import {
  InMemoryApplicationRepository,
  __resetInMemoryStore,
} from "@/lib/guardian/repository/inMemoryApplicationRepository";

const input: NewGuardianApplication = {
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
  note: undefined,
};

describe("ApplicationRepository (in-memory 계약)", () => {
  let repository: InMemoryApplicationRepository;

  beforeEach(() => {
    __resetInMemoryStore();
    repository = new InMemoryApplicationRepository();
  });

  it("CASE 1+2 — 입력값 그대로 저장되고 실제 신청번호가 발급된다", async () => {
    const created = await repository.create(input);
    expect(created.applicationNumber).toMatch(/^DH-\d{6}-[A-Z0-9]{4}$/);
    expect(created.elder.name).toBe("김영자");
    expect(created.visit.hospital).toBe("화순전남대학교병원");
    expect(created.visit.department).toBe("정형외과");
    expect(created.visit.date).toBe("2026-08-20");
    expect(created.visit.time).toBe("10:30");
    expect(created.assistance).toEqual(["휠체어 이동", "진료실 동행"]);
    expect(created.status).toBe("RECEIVED");
  });

  it("CASE 2 — 신청마다 unique 번호가 발급된다", async () => {
    const a = await repository.create(input);
    const b = await repository.create(input);
    expect(a.applicationNumber).not.toBe(b.applicationNumber);
    expect(a.id).not.toBe(b.id);
  });

  it("CASE 3 — 신청번호 + 전화번호가 일치하면 해당 신청이 조회된다", async () => {
    const created = await repository.create(input);
    const found = await repository.findByApplicationNumberAndPhone(
      created.applicationNumber,
      "010-1234-5678",
    );
    expect(found?.id).toBe(created.id);
    expect(found?.elder.name).toBe("김영자");
  });

  it("CASE 3 — 표기 차이(하이픈/공백/소문자)는 흡수한다", async () => {
    const created = await repository.create(input);
    const found = await repository.findByApplicationNumberAndPhone(
      created.applicationNumber.toLowerCase(),
      "010 1234 5678",
    );
    expect(found?.id).toBe(created.id);
  });

  it("CASE 4 — 전화번호가 틀리면 null (존재 여부 비노출)", async () => {
    const created = await repository.create(input);
    const found = await repository.findByApplicationNumberAndPhone(
      created.applicationNumber,
      "010-9999-9999",
    );
    expect(found).toBeNull();
  });

  it("CASE 5 — 존재하지 않는 신청번호도 동일하게 null", async () => {
    await repository.create(input);
    const found = await repository.findByApplicationNumberAndPhone("DH-260818-ZZZZ", "010-1234-5678");
    expect(found).toBeNull();
  });

  it("CASE 8 — 같은 store를 공유하는 다른 repository 인스턴스에서도 조회된다", async () => {
    const created = await repository.create(input);
    const another = new InMemoryApplicationRepository();
    const found = await another.findByApplicationNumberAndPhone(
      created.applicationNumber,
      "010-1234-5678",
    );
    // 주의: 이것은 프로세스 내 공유일 뿐이다. durable persistence 검증은 Phase B에서
    // 실제 provider로 수행해야 하며, InMemory는 그 요건을 만족하지 못한다(durable=false).
    expect(found?.id).toBe(created.id);
    expect(another.durable).toBe(false);
  });

  it("updateStatus — NEEDS_INFO가 아닌 상태로 바꾸면 infoRequest가 사라진다", async () => {
    const created = await repository.create(input);
    await repository.updateStatus(created.id, "NEEDS_INFO", {
      message: "예약 시간을 확인해주세요.",
      requestedAt: new Date().toISOString(),
    });
    const confirmed = await repository.updateStatus(created.id, "CONFIRMED");
    expect(confirmed?.status).toBe("CONFIRMED");
    expect(confirmed?.infoRequest).toBeUndefined();
  });
});
