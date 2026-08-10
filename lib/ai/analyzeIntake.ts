import { personRepository } from "../data/personRepository";
import { visitRepository } from "../data/visitRepository";
import {
  getIntakeAnalysisProvider,
  type IntakeAnalysisProvider,
  type MatchedPersonContext,
} from "./provider";
import {
  AnalyzeIntakeInputSchema,
  IntakeAnalysisSchema,
  type AnalyzeIntakeInput,
} from "./schema";

function todayInKorea() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function buildPersonContext(
  callerPhone: string,
  transcript: string,
): Promise<MatchedPersonContext[]> {
  const [phoneMatches, nameMatches] = await Promise.all([
    personRepository.findByPhone(callerPhone),
    personRepository.findByTranscript(transcript),
  ]);
  const peopleById = new Map(
    [...phoneMatches, ...nameMatches].map((person) => [person.person_id, person]),
  );

  return Promise.all(
    [...peopleById.values()].map(async (person) => ({
      person,
      careProfile: await personRepository.getCareProfile(person.person_id),
      visits: await visitRepository.findByPersonId(person.person_id),
      matchedByPhone: phoneMatches.some(
        (match) => match.person_id === person.person_id,
      ),
      matchedByName: nameMatches.some(
        (match) => match.person_id === person.person_id,
      ),
    })),
  );
}

export async function analyzeIntake(
  rawInput: AnalyzeIntakeInput,
  provider: IntakeAnalysisProvider = getIntakeAnalysisProvider(),
) {
  const input = AnalyzeIntakeInputSchema.parse(rawInput);
  const context = {
    input: {
      caller_phone: input.caller_phone,
      transcript: input.transcript,
      reference_date: input.reference_date ?? todayInKorea(),
    },
    people: await buildPersonContext(input.caller_phone, input.transcript),
  };

  const rawAnalysis = await provider.analyze(context);
  return IntakeAnalysisSchema.parse(rawAnalysis);
}
