import type { Metadata } from "next";
import { RdStage } from "./RdStage";
import "../dh.css";

// 루트 layout의 title template("%s | 동행고리AI")이 붙지 않도록 절대 제목을 쓴다.
export const metadata: Metadata = {
  title: { absolute: "쓸데없이 살아있는 것" },
  description: "생명 흉내를 내는 반응-확산 방정식 한 페이지.",
  robots: { index: false, follow: false },
};

export default function Dh2Page() {
  return <RdStage />;
}
