import { z } from "zod";
import type { EvidenceStatus } from "../domain/intake";
import {
  mapTeamStatus,
  normalizeSavedHospitalStatus,
  type TeamIntakeDetail,
  type TeamIntakeRow,
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
];

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

  const fields: SavedIntakeField[] = FIELD_ORDER.map(({ key, label }) => {
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

    if (key === "target") {
      // 발신번호로 대상자를 확정하지 않는다 — 저장값이 무엇이든 확인 필요다.
      return {
        key,
        label,
        value: card?.target?.trim() || detail.target?.trim() || null,
        status: "NEEDS_CONFIRMATION",
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
  });

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
