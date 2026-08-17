export const STT_REVIEW_MESSAGE =
  "음성이 정확하게 인식되지 않았을 수 있습니다. 병원명·이름·날짜·시간과 원문 전체를 확인해 주세요.";

/** needs_review가 명시적으로 true일 때만 경고한다. 없는 값은 추측하지 않는다. */
export function getSttReviewMessage(
  needsReview: boolean | null | undefined,
): string | null {
  return needsReview === true ? STT_REVIEW_MESSAGE : null;
}
