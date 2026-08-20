import type { Metadata } from "next";
import { DhStage } from "./DhStage";
import "./dh.css";

// 루트 layout의 title template("%s | 동행고리AI")이 붙지 않도록 절대 제목을 쓴다.
export const metadata: Metadata = {
  title: { absolute: "쓸데없이 아름다운 것" },
  description: "아무 기능도 없는 흐름장 애니메이션 한 페이지.",
  robots: { index: false, follow: false },
};

export default function DhPage() {
  return <DhStage />;
}
