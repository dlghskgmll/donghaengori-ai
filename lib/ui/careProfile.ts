import type {
  TeamProfileDetail,
  TeamProfileHistory,
} from "@/lib/ai/teamProfileRead";

export function maskProfilePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-••••-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-•••-${digits.slice(6)}`;
  }
  return "연락처 확인 필요";
}

export function sortedProfileHistory(
  history: TeamProfileHistory[],
): TeamProfileHistory[] {
  return [...history].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

export function pastHospitalLabel(entry: TeamProfileHistory): string {
  return entry.hospital ? `${entry.hospital} · 과거 동행` : "과거 병원 미등록";
}

export function profileSupportFacts(profile: TeamProfileDetail) {
  return [
    profile.mobility
      ? { label: "이동 지원", value: profile.mobility }
      : null,
    profile.preferred_time
      ? { label: "선호 시간", value: profile.preferred_time }
      : null,
    profile.caregiver
      ? { label: "생활지원사", value: profile.caregiver }
      : null,
    profile.ltci_grade
      ? { label: "장기요양등급", value: `${profile.ltci_grade}등급` }
      : null,
    profile.care_program
      ? { label: "돌봄 서비스", value: profile.care_program }
      : null,
  ].filter((item): item is { label: string; value: string } => item !== null);
}
