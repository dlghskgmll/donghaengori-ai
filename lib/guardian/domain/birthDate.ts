// 생년월일 입력 처리 로직 (UI와 분리된 순수 함수).
//
// 고령자 생년월일 입력을 위해 date picker 대신 숫자 8자리 텍스트 입력을 쓰고,
// 입력 중에는 1943.05.12 형태로 구분점을 자동으로 넣는다. 저장은 항상 ISO다.

export function toIsoBirthDate(display: string): string | null {
  const digits = display.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const currentYear = new Date().getFullYear();
  if (year < 1900 || year > currentYear) return null;
  // 실제 달력에 있는 날짜인지 확인한다 (2월 31일 같은 값 차단).
  const probe = new Date(year, month - 1, day);
  if (probe.getFullYear() !== year || probe.getMonth() !== month - 1 || probe.getDate() !== day) {
    return null;
  }
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

export function formatBirthDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}.${digits.slice(4)}`;
  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}`;
}

export function isoToDisplay(iso: string | undefined): string {
  if (!iso) return "";
  return iso.replace(/-/g, ".");
}
