import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 컨테이너로 띄우기 위한 설정.
  //
  // standalone 은 실행에 실제로 필요한 것만 추린 서버를 .next/standalone 에
  // 만든다. 이게 없으면 이미지에 node_modules 를 통째로(수백 MB) 넣어야 하고,
  // 데스크탑에서 재빌드할 때마다 그만큼을 다시 굽는다.
  //
  // npm run dev / npm start 동작은 그대로다 — 산출물이 하나 더 생길 뿐이다.
  output: "standalone",
};

export default nextConfig;
