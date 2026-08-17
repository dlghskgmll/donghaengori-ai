import type {
  TeamAuditEntry,
  TeamPostRecord,
  TeamPostRecordDecision,
} from "@/lib/ai/teamPostRecord";

export type PostRecordReviewState =
  | "pending"
  | "approved"
  | "rejected"
  | "unknown";

export function postRecordAudit(
  recordId: number,
  audit: TeamAuditEntry[],
): TeamAuditEntry[] {
  return audit
    .filter(
      (entry) =>
        entry.target_type === "post_record" &&
        entry.target_id === String(recordId) &&
        (entry.action === "승인" || entry.action === "거절"),
    )
    .sort((a, b) => b.id - a.id);
}

export function postRecordReviewState(
  record: TeamPostRecord,
  audit: TeamAuditEntry[],
  auditLoaded: boolean,
): PostRecordReviewState {
  if (record.approved) return "approved";
  if (!auditLoaded) return "unknown";
  const latest = postRecordAudit(record.id, audit)[0];
  if (latest?.action === "거절") return "rejected";
  if (latest?.action === "승인") return "approved";
  return "pending";
}

export function postRecordStateLabel(state: PostRecordReviewState): string {
  if (state === "approved") return "승인됨";
  if (state === "rejected") return "거절됨";
  if (state === "unknown") return "상태 확인 필요";
  return "검토 필요";
}

export function isRelativeSchedule(value: string | null): boolean {
  if (!value) return false;
  return /(?:\d+\s*(?:일|주|개월|달)\s*(?:뒤|후))/.test(value);
}

export function decisionFeedback(result: TeamPostRecordDecision): string {
  if (!result.approved) {
    return result.changed
      ? "거절 처리되었습니다. Care Profile에는 반영되지 않았습니다."
      : "이미 같은 처리 상태입니다. Care Profile에는 새로 반영되지 않았습니다.";
  }
  if (result.applied) {
    return "승인 완료 · Care Profile에 실제 반영되었습니다.";
  }
  if (!result.changed) {
    return "이미 승인된 상태입니다. 이번 요청에서 Care Profile 추가 반영은 없었습니다.";
  }
  return "승인 완료 · Care Profile에 반영할 제안 항목은 없었습니다.";
}
