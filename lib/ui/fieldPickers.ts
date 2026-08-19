/**
 * Request 상세 필드 picker의 계산 로직.
 *
 * 컴포넌트(FieldPickers.tsx)는 이 모듈이 계산한 값을 그리기만 한다 —
 * 달력 구성·날짜 문자열·시간 슬롯·진료과 목록이 여기 있어야
 * DOM 없이 테스트할 수 있다.
 *
 * 값 포맷 계약: picker가 만들어 내는 문자열은 기존 verify/edit pipeline에
 * 그대로 들어간다. 날짜는 저장 접수의 date_value와 같은 "YYYY-MM-DD",
 * 시간은 카드 값과 같은 "HH:MM", 진료과는 한국어 명칭 그대로다.
 */

export type FieldPickerKind = "date" | "time" | "dept";

/** picker를 그릴 수 있는 필드. 미리보기(department)와 저장(dept) 키가 다르다. */
const PICKER_KINDS: Record<string, FieldPickerKind> = {
  date: "date",
  time: "time",
  dept: "dept",
  department: "dept",
};

export function pickerKindForField(fieldKey: string): FieldPickerKind | null {
  return PICKER_KINDS[fieldKey] ?? null;
}

// ---------- 날짜 ----------

export interface CalendarDate {
  year: number;
  month: number; // 1–12
  day: number;
}

/** "2026-08-16"과 미리보기 표기 "2026. 08. 16." 둘 다 읽는다. */
export function parseDateValue(value: string | null | undefined): CalendarDate | null {
  if (!value) return null;
  const match = value
    .trim()
    .match(/^(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})\.?$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function toIsoDate(date: CalendarDate): string {
  const mm = String(date.month).padStart(2, "0");
  const dd = String(date.day).padStart(2, "0");
  return `${date.year}-${mm}-${dd}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

export function weekdayLabel(date: CalendarDate): string {
  return WEEKDAY_LABELS[
    new Date(date.year, date.month - 1, date.day).getDay()
  ];
}

/** 확인 문구용 — "8월 21일 금요일" */
export function formatKoreanDate(date: CalendarDate): string {
  return `${date.month}월 ${date.day}일 ${weekdayLabel(date)}요일`;
}

export function fromJsDate(value: Date): CalendarDate {
  return {
    year: value.getFullYear(),
    month: value.getMonth() + 1,
    day: value.getDate(),
  };
}

export function addDays(base: CalendarDate, days: number): CalendarDate {
  const js = new Date(base.year, base.month - 1, base.day + days);
  return fromJsDate(js);
}

export function sameDate(a: CalendarDate | null, b: CalendarDate | null): boolean {
  return (
    !!a && !!b && a.year === b.year && a.month === b.month && a.day === b.day
  );
}

export interface CalendarMonth {
  year: number;
  month: number;
  /** 일요일 시작 7칸 단위. 이웃 달 자리는 null — 이웃 달 날짜를 그리지 않는다. */
  weeks: Array<Array<CalendarDate | null>>;
}

export function buildCalendarMonth(year: number, month: number): CalendarMonth {
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const total = daysInMonth(year, month);
  const cells: Array<CalendarDate | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: total }, (_, i) => ({ year, month, day: i + 1 })),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: CalendarMonth["weeks"] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return { year, month, weeks };
}

export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const js = new Date(year, month - 1 + delta, 1);
  return { year: js.getFullYear(), month: js.getMonth() + 1 };
}

// ---------- 시간 ----------

export interface TimeSlotGroup {
  label: "오전" | "오후";
  slots: string[]; // "HH:MM"
}

/**
 * 병원 동행 업무 시간대의 30분 간격 슬롯. 오전 8시 시작–오후 6시 끝.
 * 이 밖의 시간은 직접 입력으로 처리한다.
 */
export function buildTimeSlots(): TimeSlotGroup[] {
  const slots = (startMinutes: number, endMinutes: number): string[] => {
    const out: string[] = [];
    for (let m = startMinutes; m <= endMinutes; m += 30) {
      const hh = String(Math.floor(m / 60)).padStart(2, "0");
      const mm = String(m % 60).padStart(2, "0");
      out.push(`${hh}:${mm}`);
    }
    return out;
  };
  return [
    { label: "오전", slots: slots(8 * 60, 11 * 60 + 30) },
    { label: "오후", slots: slots(12 * 60, 18 * 60) },
  ];
}

/** "14:00" → "오후 2:00" — 확인 문구용. 잘못된 값은 그대로 돌려준다. */
export function formatKoreanTime(value: string): string {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return value;
  const hour = Number(match[1]);
  const minute = match[2];
  if (hour > 23 || Number(minute) > 59) return value;
  if (hour === 0) return `오전 12:${minute}`;
  if (hour < 12) return `오전 ${hour}:${minute}`;
  if (hour === 12) return `오후 12:${minute}`;
  return `오후 ${hour - 12}:${minute}`;
}

export function isValidTimeValue(value: string): boolean {
  const match = value.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  return match !== null;
}

// ---------- 진료과 ----------

/** 어르신 동행 요청에서 가장 자주 나오는 진료과 — chip으로 먼저 보여준다. */
export const MAJOR_DEPARTMENTS = [
  "내과",
  "정형외과",
  "신경외과",
  "재활의학과",
  "피부과",
  "안과",
  "이비인후과",
  "치과",
] as const;

/** 검색 combobox가 다루는 전체 목록. backend에는 이 문자열이 그대로 간다. */
export const ALL_DEPARTMENTS = [
  ...MAJOR_DEPARTMENTS,
  "가정의학과",
  "신경과",
  "정신건강의학과",
  "외과",
  "심장혈관흉부외과",
  "성형외과",
  "마취통증의학과",
  "산부인과",
  "소아청소년과",
  "비뇨의학과",
  "영상의학과",
  "응급의학과",
  "한방과",
] as const;

export function filterDepartments(query: string): string[] {
  const needle = query.trim();
  if (!needle) return [...ALL_DEPARTMENTS];
  return ALL_DEPARTMENTS.filter((name) => name.includes(needle));
}
