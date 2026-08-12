import { after } from "next/server";

// 전화 제어 응답을 먼저 반환한 뒤 AI 처리를 이어가기 위한 공식 primitive.
// Next.js 15.1+ 의 after()는 응답 전송 후에도 현재 invocation의
// maxDuration 안에서 작업 완료를 플랫폼이 보장한다 (Vercel 지원).
// 단순 void 호출은 serverless invocation 종료 시 중단될 수 있어 금지.
export function runAfterResponse(task: () => Promise<void>): void {
  after(task);
}
