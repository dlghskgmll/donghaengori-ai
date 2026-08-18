// provider 해석부. 여기가 유일한 교체 지점이다.
//
// Phase A에는 durable provider가 없다. 그래서 기본값은 개발 전용 메모리 저장소이고,
// production에서 durable provider 없이 기동하면 조용히 넘어가지 않고 명시적으로 막는다.
// (가짜 영속성을 제품처럼 보이게 하지 않는다.)

import { InMemoryApplicationRepository } from "./inMemoryApplicationRepository";
import type { ApplicationRepositoryWithInfo } from "./applicationRepository";

export class PersistenceNotConfiguredError extends Error {
  readonly code = "PERSISTENCE_NOT_CONFIGURED";
  constructor(provider: string) {
    super(
      `영속 저장소가 구성되지 않았습니다 (GUARDIAN_PERSISTENCE=${provider}). ` +
        "production에서는 durable provider가 필요합니다.",
    );
    this.name = "PersistenceNotConfiguredError";
  }
}

let cached: ApplicationRepositoryWithInfo | null = null;

function build(): ApplicationRepositoryWithInfo {
  const provider = process.env.GUARDIAN_PERSISTENCE?.trim() || "memory";

  switch (provider) {
    case "memory": {
      // 개발·테스트 전용. production에서는 거부한다.
      if (process.env.NODE_ENV === "production" && !process.env.GUARDIAN_ALLOW_EPHEMERAL) {
        throw new PersistenceNotConfiguredError(provider);
      }
      return new InMemoryApplicationRepository();
    }
    // Phase B에서 추가할 지점:
    //   case "team":     return new TeamBackendApplicationRepository({ baseUrl: ... });
    //   case "postgres": return new PostgresApplicationRepository({ url: ... });
    default:
      throw new PersistenceNotConfiguredError(provider);
  }
}

export function getApplicationRepository(): ApplicationRepositoryWithInfo {
  if (!cached) cached = build();
  return cached;
}

/** 화면이 "영속성이 아직 연결되지 않음"을 정직하게 표시할 수 있도록 노출한다. */
export function getPersistenceInfo(): { provider: string; durable: boolean } {
  const repository = getApplicationRepository();
  return { provider: repository.provider, durable: repository.durable };
}

/** 테스트에서 provider를 다시 만들 때 사용한다. */
export function __resetRepositoryCache() {
  cached = null;
}

export type { ApplicationRepository, ApplicationRepositoryWithInfo } from "./applicationRepository";
