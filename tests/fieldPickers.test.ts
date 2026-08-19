import { describe, expect, it } from "vitest";
import {
  addDays,
  buildCalendarMonth,
  buildTimeSlots,
  filterDepartments,
  formatKoreanDate,
  formatKoreanTime,
  isValidTimeValue,
  MAJOR_DEPARTMENTS,
  parseDateValue,
  pickerKindForField,
  shiftMonth,
  toIsoDate,
} from "@/lib/ui/fieldPickers";

describe("pickerKindForField", () => {
  it("저장 접수(dept)와 미리보기(department) 키를 같은 picker로 연결한다", () => {
    expect(pickerKindForField("dept")).toBe("dept");
    expect(pickerKindForField("department")).toBe("dept");
    expect(pickerKindForField("date")).toBe("date");
    expect(pickerKindForField("time")).toBe("time");
  });

  it("structured candidate 계약이 없는 필드에는 picker를 주지 않는다", () => {
    expect(pickerKindForField("hospital")).toBeNull();
    expect(pickerKindForField("target")).toBeNull();
    expect(pickerKindForField("birth")).toBeNull();
  });
});

describe("parseDateValue", () => {
  it("저장 접수의 ISO 값을 읽는다", () => {
    expect(parseDateValue("2026-08-21")).toEqual({
      year: 2026,
      month: 8,
      day: 21,
    });
  });

  it("미리보기 표기(2026. 08. 21.)도 읽는다", () => {
    expect(parseDateValue("2026. 08. 21.")).toEqual({
      year: 2026,
      month: 8,
      day: 21,
    });
  });

  it("날짜가 아닌 문자열·범위 밖 값은 null", () => {
    expect(parseDateValue("모레")).toBeNull();
    expect(parseDateValue("2026-13-01")).toBeNull();
    expect(parseDateValue("2026-02-30")).toBeNull();
    expect(parseDateValue(null)).toBeNull();
  });
});

describe("달력 계산", () => {
  it("toIsoDate는 verify payload와 같은 YYYY-MM-DD를 만든다", () => {
    expect(toIsoDate({ year: 2026, month: 8, day: 5 })).toBe("2026-08-05");
  });

  it("buildCalendarMonth는 7칸 단위로 해당 월 날짜만 채운다", () => {
    const month = buildCalendarMonth(2026, 8); // 2026-08-01은 토요일
    expect(month.weeks[0].slice(0, 6)).toEqual([
      null, null, null, null, null, null,
    ]);
    expect(month.weeks[0][6]).toEqual({ year: 2026, month: 8, day: 1 });
    const days = month.weeks.flat().filter(Boolean);
    expect(days).toHaveLength(31);
    for (const week of month.weeks) expect(week).toHaveLength(7);
  });

  it("addDays·shiftMonth는 월/연 경계를 넘는다", () => {
    expect(addDays({ year: 2026, month: 8, day: 31 }, 1)).toEqual({
      year: 2026,
      month: 9,
      day: 1,
    });
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });

  it("formatKoreanDate는 확인 문구용 표기를 만든다", () => {
    // 2026-08-21은 금요일
    expect(formatKoreanDate({ year: 2026, month: 8, day: 21 })).toBe(
      "8월 21일 금요일",
    );
  });
});

describe("시간 슬롯", () => {
  it("오전·오후 30분 간격이고 값은 HH:MM 그대로다", () => {
    const groups = buildTimeSlots();
    expect(groups.map((group) => group.label)).toEqual(["오전", "오후"]);
    expect(groups[0].slots[0]).toBe("08:00");
    expect(groups[0].slots.at(-1)).toBe("11:30");
    expect(groups[1].slots[0]).toBe("12:00");
    expect(groups[1].slots.at(-1)).toBe("18:00");
    for (const group of groups) {
      for (const slot of group.slots) expect(isValidTimeValue(slot)).toBe(true);
    }
  });

  it("formatKoreanTime은 오전/오후 표기를 붙이고 이상한 값은 그대로 둔다", () => {
    expect(formatKoreanTime("14:00")).toBe("오후 2:00");
    expect(formatKoreanTime("09:30")).toBe("오전 9:30");
    expect(formatKoreanTime("12:00")).toBe("오후 12:00");
    expect(formatKoreanTime("오후 두 시")).toBe("오후 두 시");
  });
});

describe("진료과 목록", () => {
  it("주요 진료과가 요구된 항목을 포함한다", () => {
    for (const name of [
      "내과",
      "정형외과",
      "신경외과",
      "재활의학과",
      "피부과",
      "안과",
      "이비인후과",
      "치과",
    ]) {
      expect(MAJOR_DEPARTMENTS).toContain(name);
    }
  });

  it("검색은 부분 일치로 좁히고, 빈 검색은 전체를 돌려준다", () => {
    expect(filterDepartments("정형")).toEqual(["정형외과"]);
    expect(filterDepartments("외과")).toContain("신경외과");
    expect(filterDepartments("")).toContain("가정의학과");
    expect(filterDepartments("없는과")).toEqual([]);
  });
});
