import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "동행고리AI | CareBridge Copilot",
    template: "%s | 동행고리AI",
  },
  description:
    "전남 군 단위 고령자 병원동행 요청을 사회복지사가 검토할 수 있도록 구조화하는 운영 Copilot",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
