import { parseRelativeDate } from "../date/parseRelativeDate";

export type SafetySignalType =
  | "BREATHING_DIFFICULTY"
  | "CHEST_PAIN"
  | "FALL"
  | "BLEEDING"
  | "LOSS_OF_CONSCIOUSNESS"
  | "SELF_HARM"
  | "ABUSE_SUSPECTED";

export interface DeterministicDateFact {
  value: string | null;
  sourceText: string | null;
  evidenceRef: string | null;
  selfCorrected: boolean;
  uncertain: boolean;
}

export interface DeterministicTimeFact {
  value: string | null;
  sourceText: string | null;
  evidenceRef: string | null;
  selfCorrected: boolean;
  uncertain: boolean;
}

export interface DeterministicFacts {
  explicitDate: DeterministicDateFact;
  explicitTime: DeterministicTimeFact;
  safetySignals: SafetySignalType[];
}

const KOREAN_HOURS: Record<string, number> = {
  한: 1,
  두: 2,
  세: 3,
  네: 4,
  다섯: 5,
  여섯: 6,
  일곱: 7,
  여덟: 8,
  아홉: 9,
  열: 10,
  열한: 11,
  열두: 12,
};

const DATE_UNCERTAINTY_WORD_PATTERN =
  /(?:모르|헷갈|확실하지|정해지지)/;
const GENERIC_DATE_UNCERTAINTY_PATTERN =
  /(?:언제|며칠|[월화수목금토일]요일인지)[\s\S]{0,35}(?:모르|헷갈|확실하지|정해지지)/;
const UNCERTAIN_DATE_CHOICE_PATTERN =
  /(?:(?:20\d{2}년\s*)?\d{1,2}월\s*\d{1,2}일|다음\s*주\s*[월화수목금토일]요일|[월화수목금토일]요일|오늘|내일|모레)(?:인지|일지)/g;

function hasAmbiguousDateChoice(transcript: string) {
  if (!DATE_UNCERTAINTY_WORD_PATTERN.test(transcript)) return false;
  return [...transcript.matchAll(UNCERTAIN_DATE_CHOICE_PATTERN)].length >= 2;
}

const EXPLICIT_TIME_PATTERN =
  /(오전|오후)?\s*(열두|열한|다섯|여섯|일곱|여덟|아홉|한|두|세|네|열|\d{1,2})\s*시(?:\s*(?:(\d{1,2})\s*분|(반)))?/g;

// 명시적 정정 연결 표현("아니", "아니고", "아니라", "말고")이 있을 때만
// 뒤의 시간을 최종 의도로 인정한다.
const TIME_CORRECTION_PATTERN = /아니|말고/;
// 마지막 시간 발화 바로 뒤의 부정("열 시는 아니에요")은 확정 근거로 쓸 수 없다.
const TRAILING_TIME_NEGATION_PATTERN = /^\s*(?:는|은|이|가)?\s*아니/;

const NO_TIME_FACT: DeterministicTimeFact = {
  value: null,
  sourceText: null,
  evidenceRef: null,
  selfCorrected: false,
  uncertain: false,
};

const UNCERTAIN_TIME_FACT: DeterministicTimeFact = {
  value: null,
  sourceText: null,
  evidenceRef: null,
  selfCorrected: false,
  uncertain: true,
};

export function parseExplicitTime(transcript: string): DeterministicTimeFact {
  const candidates: Array<{
    value: string;
    sourceText: string;
    index: number;
    endIndex: number;
  }> = [];

  for (const match of transcript.matchAll(EXPLICIT_TIME_PATTERN)) {
    const meridiem = match[1];
    const hourToken = match[2];
    let hour = KOREAN_HOURS[hourToken] ?? Number(hourToken);
    const minute = match[4] === "반" ? 30 : Number(match[3] ?? 0);

    if (hour > 23 || minute > 59) continue;
    if (meridiem === "오후" && hour < 12) hour += 12;
    if (meridiem === "오전" && hour === 12) hour = 0;
    if (match.index === undefined) continue;

    candidates.push({
      value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      sourceText: match[0].trim(),
      index: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  const finalCandidate = candidates.at(-1);
  if (!finalCandidate) return NO_TIME_FACT;

  // "열 시는 아니에요"처럼 마지막 시간이 부정되면 시간을 확정하지 않는다.
  const negated = TRAILING_TIME_NEGATION_PATTERN.test(
    transcript.slice(finalCandidate.endIndex),
  );

  const distinctValues = new Set(candidates.map((candidate) => candidate.value));
  if (distinctValues.size > 1) {
    // 시간은 예약·출발·도착 등 서로 다른 의미가 공존할 수 있으므로,
    // 명시적 정정 표현으로 연결된 경우에만 마지막 발화를 최종 의도로 사용한다.
    // 그 외 복수 시간(병렬 언급, 선택지 "10시나 11시", 범위 "10시부터 11시")은
    // 확정하지 않고 담당자 확인으로 넘긴다.
    const previousCandidate = candidates.at(-2)!;
    const connective = transcript.slice(
      previousCandidate.endIndex,
      finalCandidate.index,
    );
    if (TIME_CORRECTION_PATTERN.test(connective) && !negated) {
      return {
        value: finalCandidate.value,
        sourceText: finalCandidate.sourceText,
        evidenceRef: "time-parser:explicit-time",
        selfCorrected: true,
        uncertain: false,
      };
    }
    return UNCERTAIN_TIME_FACT;
  }

  if (negated) return UNCERTAIN_TIME_FACT;

  return {
    value: finalCandidate.value,
    sourceText: finalCandidate.sourceText,
    evidenceRef: "time-parser:explicit-time",
    selfCorrected: false,
    uncertain: false,
  };
}

function detectSafetySignals(transcript: string): SafetySignalType[] {
  const rules: Array<{ type: SafetySignalType; pattern: RegExp }> = [
    {
      type: "BREATHING_DIFFICULTY",
      pattern: /숨(?:쉬기|\s*쉬기|이|을)?[^.!?\n]{0,14}(?:힘들|차|가쁘|어렵|답답)/,
    },
    {
      type: "CHEST_PAIN",
      pattern: /가슴[^.!?\n]{0,10}(?:아프|아파|통증|조이|답답)/,
    },
    {
      type: "LOSS_OF_CONSCIOUSNESS",
      pattern: /(?:의식이?\s*없|정신을\s*잃|의식\s*불명)/,
    },
    { type: "FALL", pattern: /(?:넘어졌|낙상|쓰러졌|쓰러졌다)/ },
    {
      type: "BLEEDING",
      pattern: /(?:피가|출혈)[^.!?\n]{0,10}(?:많|멈추지|심해)/,
    },
    {
      type: "SELF_HARM",
      pattern: /(?:죽고\s*싶|자해|내가\s*사라졌으면|목숨을\s*끊)/,
    },
    {
      type: "ABUSE_SUSPECTED",
      pattern: /(?:맞고\s*살|때렸|폭행|학대)/,
    },
  ];

  return rules
    .filter((rule) => rule.pattern.test(transcript))
    .map((rule) => rule.type);
}

export function parseDeterministicFacts(
  transcript: string,
  referenceDate: string,
): DeterministicFacts {
  const parsedDate = parseRelativeDate(transcript, referenceDate);
  const dateUncertain =
    hasAmbiguousDateChoice(transcript) ||
    (!parsedDate.value && GENERIC_DATE_UNCERTAINTY_PATTERN.test(transcript));
  const explicitDate: DeterministicDateFact =
    parsedDate.value && parsedDate.source && !dateUncertain
      ? {
          value: parsedDate.value,
          sourceText: parsedDate.source,
          evidenceRef: parsedDate.isRelative
            ? "date-parser:explicit-relative-date"
            : "date-parser:explicit-date",
          selfCorrected: parsedDate.selfCorrected,
          uncertain: false,
        }
      : {
          value: null,
          sourceText: null,
          evidenceRef: null,
          selfCorrected: false,
          uncertain: dateUncertain,
        };

  return {
    explicitDate,
    explicitTime: parseExplicitTime(transcript),
    safetySignals: detectSafetySignals(transcript),
  };
}
