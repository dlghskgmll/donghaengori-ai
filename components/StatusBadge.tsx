import type { EvidenceStatus, IntakeStatus } from "@/lib/domain/intake";

const STATUS_LABELS: Record<EvidenceStatus | IntakeStatus, string> = {
  CONFIRMED_BY_INPUT: "발화 확인",
  INFERRED: "이력 추론",
  NEEDS_CONFIRMATION: "확인 필요",
  DRAFT_AI: "AI 초안",
  CONFIRMED: "접수 확정",
};

interface StatusBadgeProps {
  status: EvidenceStatus | IntakeStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`status-badge status-${status.toLowerCase()}`}>
      <span className="status-dot" aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}
