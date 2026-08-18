import type { Metadata } from "next";
import "./guardian.css";

// 보호자 포털 세그먼트 layout.
// - guardian.css는 전부 .gd 하위로 스코프되어 있어 이 layout 밖(관리자 콘솔)에는 영향이 없다.
// - 루트 layout의 title template("%s | 동행고리AI")을 보호자용 template로 덮는다.
export const metadata: Metadata = {
  title: {
    default: "동행고리AI 보호자 포털",
    template: "%s · 동행고리AI",
  },
  description: "전남 어르신 병원동행 서비스 — 보호자용 신청·조회",
};

export default function GuardianLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="gd">
      {/* 아티팩트가 쓰던 것과 같은 Pretendard Variable dynamic subset.
          family 이름이 'Pretendard Variable'이라 관리자('Pretendard' 참조)에는 영향이 없다.
          React 19가 이 link들을 <head>로 hoist한다. */}
      <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
      />
      {children}
    </div>
  );
}
