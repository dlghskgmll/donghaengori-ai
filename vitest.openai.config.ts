import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// OpenAI smoke test 전용: Next.js처럼 .env.local을 로드한다.
// 이미 설정된 shell 환경변수가 우선하며, 파일이 없으면 기존 SKIPPED 동작을 유지한다.
const envLocalPath = fileURLToPath(new URL("./.env.local", import.meta.url));
if (existsSync(envLocalPath)) {
  process.loadEnvFile(envLocalPath);
}

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/openai.smoke.test.ts"],
    fileParallelism: false,
    reporters: ["verbose"],
    testTimeout: 360_000,
  },
});
