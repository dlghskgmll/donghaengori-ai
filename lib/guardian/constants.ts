/** 서비스 대표번호. 화면 여러 곳에서 같은 값을 쓴다. */
export const SUPPORT_PHONE_DISPLAY = "070-5275-3831";
export const SUPPORT_PHONE_HREF = "tel:07052753831";

/** 신청 폼의 도움 항목·관계 선택지 (아티팩트와 동일). */
export const HELP_OPTIONS = [
  "이동 도움",
  "휠체어 이동",
  "접수·수납 도움",
  "진료실 동행",
  "약국 동행",
  "보호자 연락",
  "잘 모르겠어요",
] as const;

export const RELATION_OPTIONS = ["딸", "아들", "배우자", "기타"] as const;

export const TOTAL_STEPS = 6;
