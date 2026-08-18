// 화면 표시용 포맷터. 값이 없을 때 임의의 정보를 만들어내지 않고
// UX 문구("확인 예정" 등)로만 대체한다.

import type { GuardianApplication } from "./application";

export const NOT_PROVIDED = "아직 입력되지 않았어요";
export const TO_BE_CONFIRMED = "확인 예정";

/** 2026-08-20 → 2026년 8월 20일 */
export function formatDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return null;
  return `${y}년 ${Number(m)}월 ${Number(d)}일`;
}

/** 2026-08-20 → 2026.08.20 (상세 상단 요약용) */
export function formatDateCompact(iso: string | undefined): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return null;
  return `${y}.${m}.${d}`;
}

/** 10:30 → 오전 10:30 */
export function formatTime(value: string | undefined): string | null {
  if (!value) return null;
  const [h, mm] = value.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(mm)) return null;
  const meridiem = h < 12 ? "오전" : "오후";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${meridiem} ${hour12}:${String(mm).padStart(2, "0")}`;
}

/** 병원 · 진료과 한 줄. 진료과가 없거나 모른다고 표시했으면 병원만 남긴다. */
export function formatHospitalLine(visit: GuardianApplication["visit"]): string {
  if (visit.departmentUnknown) return `${visit.hospital} · 진료과 ${TO_BE_CONFIRMED}`;
  if (!visit.department) return visit.hospital;
  return `${visit.hospital} · ${visit.department}`;
}

/** 일정 한 줄. 날짜/시간 미정 상태를 그대로 문구로 드러낸다. */
export function formatScheduleLine(visit: GuardianApplication["visit"]): string {
  const date = visit.dateUnknown ? "날짜 미정" : formatDate(visit.date);
  const time = visit.timeUnknown ? "시간 미정" : formatTime(visit.time);
  if (!date && !time) return TO_BE_CONFIRMED;
  if (!time) return date ?? TO_BE_CONFIRMED;
  if (!date) return time;
  return `${date} ${time}`;
}

/** 생년월일에서 만 나이를 계산한다. 저장하지 않고 화면에서만 쓴다. */
export function ageFromBirthDate(iso: string | undefined, today = new Date()): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  let age = today.getFullYear() - y;
  const beforeBirthday =
    today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d);
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

/** 010-1234-5678 형태로 보기 좋게. 정규화된 숫자열을 받는다. */
export function formatPhone(digits: string): string {
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return digits;
}
