// 신청번호 발급. 서버에서만 호출한다.
//
// 형식: DH-YYMMDD-XXXX (XXXX는 혼동하기 쉬운 글자를 뺀 32진 코드)
// - 클라이언트 timestamp만으로 만들지 않는다.
// - 같은 날 다른 신청끼리 충돌하지 않도록 CSPRNG를 쓰고, 저장소 유일성 검사와 함께 사용한다.

import { randomInt } from "node:crypto";

/** 0/O, 1/I/L 처럼 눈으로 헷갈리는 글자를 제외한 32자. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 4;

export function formatDateSegment(date: Date): string {
  const yy = String(date.getFullYear()).slice(2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

export function generateApplicationNumber(now: Date = new Date()): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `DH-${formatDateSegment(now)}-${code}`;
}

const PATTERN = /^DH-\d{6}-[A-Z0-9]{4}$/;

export function isApplicationNumberFormat(value: string): boolean {
  return PATTERN.test(value.trim().toUpperCase());
}
