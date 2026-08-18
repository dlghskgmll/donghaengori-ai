import { describe, expect, it } from "vitest";
import {
  generateApplicationNumber,
  isApplicationNumberFormat,
} from "@/lib/guardian/domain/applicationNumber";

describe("신청번호 생성", () => {
  it("DH-YYMMDD-XXXX 형식으로 발급된다", () => {
    const number = generateApplicationNumber(new Date("2026-08-18T10:00:00+09:00"));
    expect(number).toMatch(/^DH-260818-[A-HJ-KM-NP-Z2-9]{4}$/);
    expect(isApplicationNumberFormat(number)).toBe(true);
  });

  it("연속 발급해도 서로 다른 번호가 나온다", () => {
    const now = new Date("2026-08-18T10:00:00+09:00");
    const numbers = new Set(Array.from({ length: 200 }, () => generateApplicationNumber(now)));
    // CSPRNG 4자리(32^4 = 1,048,576 조합)에서 200개가 전부 충돌할 확률은 사실상 0이다.
    expect(numbers.size).toBeGreaterThan(190);
  });

  it("혼동하기 쉬운 글자(0/O/1/I/L)를 쓰지 않는다", () => {
    const now = new Date("2026-08-18T10:00:00+09:00");
    for (let i = 0; i < 100; i += 1) {
      const code = generateApplicationNumber(now).split("-")[2];
      expect(code).not.toMatch(/[0O1IL]/);
    }
  });
});
