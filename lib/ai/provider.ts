import type { CareProfile, Person } from "../domain/person";
import type { Visit } from "../domain/visit";
import type { AnalyzeIntakeInput } from "./schema";
import { analyzeMockIntake } from "./mockProvider";

export interface MatchedPersonContext {
  person: Person;
  careProfile: CareProfile | null;
  visits: Visit[];
  matchedByPhone: boolean;
  matchedByName: boolean;
}

export interface IntakeProviderContext {
  input: Required<Pick<AnalyzeIntakeInput, "caller_phone" | "transcript">> & {
    reference_date: string;
  };
  people: MatchedPersonContext[];
}

export interface IntakeAnalysisProvider {
  readonly name: string;
  analyze(context: IntakeProviderContext): Promise<unknown>;
}

export class MockIntakeAnalysisProvider implements IntakeAnalysisProvider {
  readonly name = "mock";

  async analyze(context: IntakeProviderContext) {
    return analyzeMockIntake(context);
  }
}

export function getIntakeAnalysisProvider(): IntakeAnalysisProvider {
  const providerName = process.env.INTAKE_AI_PROVIDER ?? "mock";

  if (providerName !== "mock") {
    throw new Error(
      `지원하지 않는 INTAKE_AI_PROVIDER입니다: ${providerName}. Phase 1은 mock만 지원합니다.`,
    );
  }

  return new MockIntakeAnalysisProvider();
}
