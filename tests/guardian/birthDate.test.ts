import { describe, expect, it } from "vitest";
import { formatBirthDateInput, toIsoBirthDate } from "@/lib/guardian/domain/birthDate";
import { ageFromBirthDate } from "@/lib/guardian/domain/format";

describe("생년월일 입력", () => {
  it("숫자를 치면 1943.05.12 형태로 구분점이 들어간다", () => {
    expect(formatBirthDateInput("1943")).toBe("1943");
    expect(formatBirthDateInput("194305")).toBe("1943.05");
    expect(formatBirthDateInput("19430512")).toBe("1943.05.12");
    expect(formatBirthDateInput("1943.05.12")).toBe("1943.05.12");
  });

  it("ISO로 변환된다", () => {
    expect(toIsoBirthDate("1943.05.12")).toBe("1943-05-12");
    expect(toIsoBirthDate("19430512")).toBe("1943-05-12");
  });

  it("달력에 없는 날짜는 거부한다", () => {
    expect(toIsoBirthDate("1943.02.31")).toBeNull();
    expect(toIsoBirthDate("1943.13.01")).toBeNull();
    expect(toIsoBirthDate("1899.01.01")).toBeNull();
    expect(toIsoBirthDate("1943.05")).toBeNull();
  });

  it("나이는 저장하지 않고 생년월일에서 계산한다", () => {
    expect(ageFromBirthDate("1950-02-14", new Date("2026-08-18"))).toBe(76);
    expect(ageFromBirthDate("1950-12-31", new Date("2026-08-18"))).toBe(75);
    expect(ageFromBirthDate(undefined)).toBeNull();
  });
});
