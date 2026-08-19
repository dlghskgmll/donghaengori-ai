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

/**
 * 서버가 동행을 다녀온 접수에 붙이는 상태값(core/db.complete_accompaniment).
 *
 * confirmed 플래그는 완료 뒤에도 1로 남는다 — 확정을 되돌리는 것이 아니라
 * 그 다음 단계로 간 것이기 때문이다. 그래서 '다녀왔는지' 는 status 로만
 * 갈린다.
 */
export const ACCOMPANIMENT_COMPLETE = "동행 완료";

export function isAccompanimentComplete(status: string | null): boolean {
  return status?.trim() === ACCOMPANIMENT_COMPLETE;
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

/**
 * 이 줄의 확인 버튼이 **서버에 보낼 항목**. null 이면 버튼을 주지 않는다.
 *
 * 대개 자기 자신이지만 '말한 성함' 은 다르다 — 그 줄 자체는 서버가 받지
 * 않는데, 들은 이름을 대상자로 올리는 것이 복지사가 그 줄을 보고 할 일
 * 그 자체다. 연결하지 않으면 이름을 눈으로 읽고 대상자 칸에 손으로 다시
 * 옮겨 적어야 한다 — 그럴 거면 화면에 띄운 보람이 없다.
 */
export function verifyFieldFor(key: string): VerifiableField | null {
  if (key === "spoken_name") return "target";
  return isVerifiableField(key) ? key : null;
}

/**
 * 확인·수정 버튼을 감출 항목.
 *
 * 서버에 보낼 곳이 없는데 버튼을 남기면 로컬로만 도는 '적용'이 걸린다.
 * 눌러서 확인됨으로 보이는데 서버는 모르는 상태 — 화면만 풀리고 게이트는
 * 그대로다. '말한 주소' 는 카드에 채울 칸이 없어 여기 해당한다.
 */
export function isReadOnlyField(key: string): boolean {
  // '요청 내용' 은 서버 verify 가 받지 않는다. 사회복지사가 직접 통화해
  // 무엇이 필요한지 확인하고, 그 결과를 병원·날짜 칸에 적는 것이 이 유형의
  // 처리다 — 요청 칸 자체를 '확인함' 으로 눌러 없앨 것이 아니다.
  return key === "spoken_region" || key === "request";
}

/**
 * 기존 접수 흐름이 감당하지 못하는 요청인가.
 *
 * '기존재방문' 과 null 은 평소와 같다 — 서버가 그렇게 계약했다
 * (docs/FRONTEND.md). 모르는 값이 오면 새 유형으로 본다: 서버가 유형을
 * 늘렸는데 화면이 조용히 평소처럼 그리면, 병원이 빈 카드를 복지사가
 * "AI가 못 찾았네" 로 읽고 직접 채워 넣는다.
 */
export function isNewRequestType(value: string | null | undefined): boolean {
  const v = (value ?? "").trim();
  return v !== "" && v !== "기존재방문";
}

/** 확인 버튼 문구. 다른 항목을 채우는 줄은 무엇이 되는지 적는다. */
export function acceptLabelFor(key: string): string | undefined {
  return key === "spoken_name" ? "대상자로 확인" : undefined;
}
