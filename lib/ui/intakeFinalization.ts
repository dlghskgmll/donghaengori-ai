import type { TeamAuditEntry } from "@/lib/ai/teamPostRecord";
import type { SavedIntakeGate } from "@/lib/ai/savedIntakeView";

export type IntakeAuditState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "loaded"; entries: TeamAuditEntry[] }
  | { status: "error"; message: string };

export type IntakeFinalizationMode =
  | "confirmed"
  | "gate-unavailable"
  | "regular"
  | "soft-block"
  | "hard-block";

/**
 * U9 backend integration TODO — write contract가 정리되기 전에는 제거하지 않는다.
 * - auth: Saved Intake read/audit/write에 같은 직원 세션 경계를 적용한다.
 * - gate: 인증된 GET detail의 server gate만 source of truth로 사용한다.
 * - generic human edit / phone verify: local edit와 통화 확인을 별도 endpoint 의미로 분리한다.
 * - final confirm: 일반 확정과 acknowledge 확정을 서로 다른 명시적 요청으로 연결한다.
 * - audit: intake 대상 server audit를 pagination/filter 계약과 함께 연결한다.
 */
export const INTAKE_FINALIZATION_INTEGRATION_PENDING = true;

export function intakeAuditEntries(
  intakeId: number,
  entries: TeamAuditEntry[],
): TeamAuditEntry[] {
  return entries
    .filter(
      (entry) =>
        entry.target_type === "intake" && entry.target_id === String(intakeId),
    )
    .sort((left, right) => {
      const byAt = (right.at ?? "").localeCompare(left.at ?? "");
      return byAt !== 0 ? byAt : right.id - left.id;
    });
}

export function loadedIntakeAuditState(
  intakeId: number,
  entries: TeamAuditEntry[],
): IntakeAuditState {
  const filtered = intakeAuditEntries(intakeId, entries);
  return filtered.length === 0
    ? { status: "empty" }
    : { status: "loaded", entries: filtered };
}

export function intakeAuditTone(action: string): "normal" | "warning" {
  return action === "미확인 확정" ? "warning" : "normal";
}

export function intakeFinalizationMode(
  confirmed: boolean,
  gate: SavedIntakeGate | null,
): IntakeFinalizationMode {
  if (confirmed) return "confirmed";
  if (!gate) return "gate-unavailable";
  // 기관 정책이 켜져 있어도 막을 항목이 없으면 server는 allowed=true와 함께
  // hard_block=true를 내려준다. 확정 가능 여부는 allowed가 정한다.
  if (gate.allowed) return "regular";
  if (gate.hardBlock) return "hard-block";
  return "soft-block";
}

/**
 * 서버가 verify 를 받는 항목.
 *
 * **백엔드의 VerifyIn.field 와 같아야 한다** (donghaenggori/web/api.py). 여기에
 * 없는 blocker 는 화면에서 풀 수 없으므로 입력을 그리지 않는다 — 그려 두면
 * 눌러도 422 만 나고, 복지사는 왜 안 되는지 알 방법이 없다.
 *
 * 반대로 서버가 받는 항목을 여기서 빠뜨리면 **확정이 영영 안 된다.** 화면에
 * 푸는 수단이 없는 blocker 가 남기 때문이다. 실제로 verify 를 아무 화면에서도
 * 부르지 않아 게이트에 걸린 접수를 확정할 수 없던 적이 있다.
 */
export const VERIFIABLE_FIELDS = ["target", "hospital", "dept", "date", "time"] as const;

export type VerifiableField = (typeof VERIFIABLE_FIELDS)[number];

export function isVerifiableField(field: string): field is VerifiableField {
  return (VERIFIABLE_FIELDS as readonly string[]).includes(field);
}
