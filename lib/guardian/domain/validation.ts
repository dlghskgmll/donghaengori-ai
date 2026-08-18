// 신청 생성·조회 입력 검증. route handler와 클라이언트 폼이 같은 규칙을 쓴다.

import { z } from "zod";

const phone = z
  .string()
  .trim()
  .min(1, "보호자 연락처를 입력해 주세요.")
  .regex(/^[0-9+\-\s]{9,}$/, "연락처를 다시 확인해 주세요.");

export const NewApplicationSchema = z.object({
  elder: z.object({
    name: z.string().trim().min(1, "어르신 성함을 입력해 주세요."),
    birthDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "생년월일을 다시 확인해 주세요.")
      .optional(),
    region: z.string().trim().optional(),
  }),
  guardian: z.object({
    relationship: z.string().trim().optional(),
    phone,
  }),
  visit: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    dateUnknown: z.boolean(),
    timeUnknown: z.boolean(),
    hospital: z.string().trim().min(1, "병원명을 입력해 주세요."),
    department: z.string().trim().optional(),
    departmentUnknown: z.boolean(),
  }),
  assistance: z.array(z.string()).min(1, "필요한 도움을 하나 이상 선택해 주세요."),
  note: z.string().trim().optional(),
});

export const LookupSchema = z.object({
  applicationNumber: z.string().trim().min(1),
  guardianPhone: z.string().trim().min(1),
});

export type NewApplicationInput = z.infer<typeof NewApplicationSchema>;
export type LookupInput = z.infer<typeof LookupSchema>;
