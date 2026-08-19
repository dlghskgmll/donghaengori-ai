import { z } from "zod";
import type { EvidenceStatus } from "../domain/intake";
import {
  mapTeamStatus,
  normalizeSavedHospitalStatus,
  type TeamIntakeDetail,
  type TeamIntakeRow,
  type TeamSavedCard,
} from "./teamIntakeRead";

// 저장된 접수를 UI가 그대로 그릴 수 있는 read model로 옮긴다.
// 값을 지어내지 않는다 — 없는 값은 null로 두고 화면에서 "확인 필요"로 표시한다.

export const SavedIntakeSummarySchema = z.object({
  id: z.number(),
  target: z.string().nullable(),
  hospital: z.string().nullable(),
  hospitalStatus: z.enum([
    "CONFIRMED_BY_INPUT",
    "INFERRED",
    "NEEDS_CONFIRMATION",
  ]),
  channel: z.string().nullable(),
  status: z.string().nullable(),
  createdAt: z.string().nullable(),
  appointmentDate: z.string().nullable(),
  confirmed: z.boolean(),
  urgent: z.boolean(),
  urgentConfidence: z.boolean().nullable(),
  needsConfirmation: z.boolean(),
});

export type SavedIntakeSummary = z.infer<typeof SavedIntakeSummarySchema>;

export interface SavedIntakeField {
  key: string;
  label: string;
  value: string | null;
  status: EvidenceStatus;
  evidence: string[];
  spoken?: string | null;
}

export interface SavedIntakeGateBlocker {
  field: string;
  label: string;
  value: string | null;
  spoken: string | null;
  evidence: string[];
  question: string | null;
  heard: Array<{ label: string; value: string }>;
}

export interface SavedIntakeGate {
  allowed: boolean;
  acknowledged: boolean;
  hardBlock: boolean;
  blockers: SavedIntakeGateBlocker[];
}

export interface SavedIntakeDetailView {
  id: number;
  target: string | null;
  channel: string | null;
  status: string | null;
  createdAt: string | null;
  utterance: string;
  summary: string | null;
  intent: string | null;
  urgent: boolean;
  urgentConfidence: boolean | null;
  fields: SavedIntakeField[];
  confirmQuestions: string[];
  notes: string[];
  hospitalDowngraded: boolean;
  /** 서버가 고른 동행 지원 수준. 확정할 때 그대로 되돌려 보낸다 —
   *  화면에서 만든 값을 보내면 직원이 눌러 본 것이 확정 내용이 된다. */
  needLevel?: string | null;
  confirmed: boolean;
  /** Team GET detail이 실제로 준 server gate. 없으면 UI가 추측하지 않는다. */
  gate: SavedIntakeGate | null;
}

const URGENT_STATUSES = new Set(["긴급", "긴급 처리됨"]);

function isUrgent(row: { status?: string | null; intent?: string | null }) {
  return (
    URGENT_STATUSES.has(row.status ?? "") || (row.intent ?? "") === "긴급"
  );
}

export function toSavedIntakeSummary(row: TeamIntakeRow): SavedIntakeSummary {
  const urgent = isUrgent(row);
  const hospitalStatus = normalizeSavedHospitalStatus({
    hospital: row.hospital,
    teamStatus: row.hospital_status,
    // 목록 행에는 evidence가 없다 — 발화에 병원명이 있는지로만 판단한다.
    evidence: [],
    utterance: row.raw_utterance ?? "",
  }).status;

  return {
    id: row.id,
    target: row.target?.trim() || null,
    hospital: row.hospital?.trim() || null,
    hospitalStatus,
    channel: row.channel?.trim() || null,
    status: row.status?.trim() || null,
    createdAt: row.created_at?.trim() || null,
    appointmentDate: row.date_value?.trim() || null,
    confirmed: row.confirmed === 1 || row.status?.trim() === "확정",
    urgent,
    // 값이 저장되지 않은 기존 row를 confident로 추정하지 않는다.
    urgentConfidence: urgent ? (row.urgent_confident ?? null) : null,
    needsConfirmation:
      hospitalStatus !== "CONFIRMED_BY_INPUT" ||
      !row.date_value ||
      urgent,
  };
}

const FIELD_ORDER: Array<{ key: string; label: string }> = [
  { key: "date", label: "방문일" },
  { key: "time", label: "예약 시간" },
  { key: "hospital", label: "병원" },
  { key: "dept", label: "진료과" },
  { key: "target", label: "대상자" },
  // 미등록 번호로 걸려온 통화에서 **따로 물어 받은** 성함·읍면동.
  //
  // 통화 앞에서 "성함과 사시는 읍면동을 말씀해 주세요" 로 20초를 따로 쓰는데,
  // 그 답이 화면에 없었다. 복지사에게는 '신규 대상자(미등록 번호)' 한 줄만
  // 남아서, 물어본 보람 없이 발신번호로 되걸어 "누구세요" 부터 물어야 했다.
  { key: "spoken_name", label: "말한 성함" },
  { key: "spoken_region", label: "말한 주소" },
  { key: "birth", label: "생년월일" },
];

/** 값이 있을 때만 줄을 만드는 항목. */
const OPTIONAL_KEYS = new Set(["spoken_name", "spoken_region"]);

/**
 * 생년월일은 보호자 웹 신청서가 필수로 받는 값이지만(elder.birthDate),
 * 접수카드 read 계약에서 어떤 이름으로 오는지는 백엔드가 정한다. 그래서
 * card.fields.birth 를 우선 보고, 없으면 카드에 실려 올 수 있는 관용적인
 * 키를 순서대로 확인한다 — **실제로 payload에 있는 값만 읽는다.**
 * 어느 쪽도 없으면 null로 두고 화면이 "확인 필요"로 표시한다(값을 만들지 않는다).
 */
const BIRTH_CARD_KEYS = ["birth", "birth_date", "birthDate", "birthday"] as const;

function readBirthValue(
  card: TeamSavedCard | null,
  detail: TeamIntakeDetail,
): string | null {
  const fromField = card?.fields?.birth?.value?.trim();
  if (fromField) return fromField;
  // TeamSavedCardSchema·TeamIntakeDetailSchema는 loose라 계약에 없는 키도 살아 있다.
  for (const source of [card, detail] as Array<Record<string, unknown> | null>) {
    if (!source) continue;
    for (const key of BIRTH_CARD_KEYS) {
      const raw = source[key];
      if (typeof raw === "string" && raw.trim()) return raw.trim();
    }
  }
  return null;
}

export function toSavedIntakeDetail(
  detail: TeamIntakeDetail,
): SavedIntakeDetailView {
  const urgent = isUrgent(detail);
  const card = detail.card ?? null;
  const utterance = (card?.raw_utterance ?? detail.raw_utterance ?? "").trim();

  const hospitalEvidence = card?.fields?.hospital?.evidence ?? [];
  const hospital = normalizeSavedHospitalStatus({
    hospital: card?.hospital ?? detail.hospital,
    teamStatus: card?.hospital_status ?? detail.hospital_status,
    evidence: [...hospitalEvidence, ...(card?.reasons ?? [])],
    utterance,
  });

  // 반환 타입을 콜백에 직접 적는다. .filter() 를 체이닝하면 좌변 주석이
  // 콜백까지 흘러가지 않아 status 가 string 으로 넓어진다.
  const fields: SavedIntakeField[] = FIELD_ORDER.map(
    ({ key, label }): SavedIntakeField => {
      const teamField = card?.fields?.[key];
      const value = teamField?.value?.trim() || null;

      if (key === "hospital") {
        const evidence = [
          ...new Set([...hospitalEvidence, ...(card?.reasons ?? [])]),
        ];
        return {
          key,
          label,
          value: card?.hospital?.trim() || detail.hospital?.trim() || null,
          status: hospital.status,
          evidence: hospital.downgraded
            ? [
                ...evidence,
                "과거 이력 기반 후보 — 어르신 직접 확인 전까지 추정으로 표시",
              ]
            : evidence,
        };
      }

      if (key === "birth") {
        const birth = readBirthValue(card, detail);
        return {
          key,
          label,
          value: birth,
          // 보호자가 신청서에 직접 적은 값이므로 있으면 확정으로 본다.
          status: birth ? "CONFIRMED_BY_INPUT" : "NEEDS_CONFIRMATION",
          evidence: birth
            ? teamField?.evidence ?? ["신청서에 보호자가 입력함"]
            : ["신청 정보에 생년월일이 없음"],
        };
      }

      if (key === "target") {
        // 발신번호로 대상자를 확정하지 않는다 — **AI가 채운 값은** 무엇이든
        // 확인 필요다. 단, 사람이 verify 로 확인한 것까지 덮으면 안 된다 —
        // 확인함을 눌러도 배지가 확인 필요로 남아, 서버 게이트는 풀렸는데
        // 화면만 계속 막힌 것처럼 보였다.
        //
        // verified_by 는 verify_card_field 만 채우는 구조화 키다. 그 이전에
        // 확인된 접수(키가 없던 시절)는 근거 문장의 고정 접두어로 가른다 —
        // 이 접두어도 백엔드가 만든다(화면 라벨과 무관).
        const humanVerified =
          Boolean(teamField?.verified_by) ||
          (teamField?.evidence ?? []).some((item) =>
            item.startsWith("통화로 확인함"),
          );
        return {
          key,
          label,
          value: card?.target?.trim() || detail.target?.trim() || null,
          status: humanVerified ? "CONFIRMED_BY_INPUT" : "NEEDS_CONFIRMATION",
          evidence: teamField?.evidence ?? [],
        };
      }

      return {
        key,
        label,
        value,
        status: value ? mapTeamStatus(teamField?.status) : "NEEDS_CONFIRMATION",
        evidence: teamField?.evidence ?? [],
        spoken: teamField?.spoken ?? null,
      };
    },
  )
    // 등록된 어르신에게는 성함을 되묻지 않으므로 이 칸이 아예 없다. 빈 줄로
    // 그리면 모든 접수에 '말한 성함 — 확인 필요' 가 붙어 잡음이 된다.
    .filter((field) => !(OPTIONAL_KEYS.has(field.key) && field.value === null));

  const notes: string[] = [];
  if (card?.need_level) {
    const basis = card.need_basis ? ` — 근거: ${card.need_basis}` : "";
    const official = card.need_official ? " (공식 판정 기반)" : "";
    notes.push(`동행 지원 수준 후보: ${card.need_level}${basis}${official}`);
  }
  notes.push(...(card?.flags ?? []), ...(card?.manager_notes ?? []));
  if (card?.requester === "대리") {
    notes.push(
      `대리 요청${card.proxy_relation ? ` (${card.proxy_relation})` : ""} — 대상자 확인 필요`,
    );
  }

  return {
    id: detail.id,
    target: card?.target?.trim() || detail.target?.trim() || null,
    channel: detail.channel?.trim() || null,
    status: detail.status?.trim() || null,
    createdAt: detail.created_at?.trim() || null,
    utterance,
    summary: card?.summary?.trim() || null,
    intent: card?.intent ?? detail.intent ?? null,
    urgent,
    urgentConfidence: urgent ? (detail.urgent_confident ?? null) : null,
    fields,
    confirmQuestions: card?.confirm_questions ?? [],
    notes,
    hospitalDowngraded: hospital.downgraded,
    needLevel: card?.need_level ?? null,
    confirmed:
      detail.confirmed === 1 || detail.status?.trim() === "확정",
    gate: detail.gate
      ? {
          allowed: detail.gate.allowed,
          acknowledged: detail.gate.acknowledged,
          hardBlock: detail.gate.hard_block,
          blockers: detail.gate.blockers.map((blocker) => ({
            field: blocker.field,
            label: blocker.label,
            value: blocker.value ?? null,
            spoken: blocker.spoken ?? null,
            evidence: blocker.evidence,
            question: blocker.question ?? null,
            heard: blocker.heard,
          })),
        }
      : null,
  };
}
