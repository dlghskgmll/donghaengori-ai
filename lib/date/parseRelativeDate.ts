export interface ParsedDate {
  value: string | null;
  source: string | null;
  isRelative: boolean;
  selfCorrected: boolean;
}

interface DateCandidate {
  index: number;
  source: string;
  value: string;
  isRelative: boolean;
}

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

const addDays = (baseDate: string, offsetDays: number) => {
  const [year, month, day] = baseDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + offsetDays));
  return toIsoDate(date);
};

const validCalendarDate = (year: number, month: number, day: number) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return toIsoDate(date);
};

const nextWeekday = (
  baseDate: string,
  weekdayIndexFromMonday: number,
) => {
  const [year, month, day] = baseDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday + 7 + weekdayIndexFromMonday);
  return toIsoDate(date);
};

export function parseRelativeDate(
  transcript: string,
  referenceDate: string,
): ParsedDate {
  const candidates: DateCandidate[] = [];

  for (const match of transcript.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) {
    const value = validCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]));
    if (value && match.index !== undefined) {
      candidates.push({
        index: match.index,
        source: match[0],
        value,
        isRelative: false,
      });
    }
  }

  const referenceYear = Number(referenceDate.slice(0, 4));
  for (const match of transcript.matchAll(/(?:(20\d{2})년\s*)?(\d{1,2})월\s*(\d{1,2})일/g)) {
    const value = validCalendarDate(
      Number(match[1] ?? referenceYear),
      Number(match[2]),
      Number(match[3]),
    );
    if (value && match.index !== undefined) {
      candidates.push({
        index: match.index,
        source: match[0],
        value,
        isRelative: false,
      });
    }
  }

  const weekdays: Record<string, number> = {
    월: 0,
    화: 1,
    수: 2,
    목: 3,
    금: 4,
    토: 5,
    일: 6,
  };
  for (const match of transcript.matchAll(/다음\s*주\s*([월화수목금토일])요일/g)) {
    if (match.index !== undefined) {
      candidates.push({
        index: match.index,
        source: match[0],
        value: nextWeekday(referenceDate, weekdays[match[1]]),
        isRelative: true,
      });
    }
  }

  for (const match of transcript.matchAll(/오늘|내일|모레/g)) {
    if (match.index !== undefined) {
      const offset = match[0] === "모레" ? 2 : match[0] === "내일" ? 1 : 0;
      candidates.push({
        index: match.index,
        source: match[0],
        value: addDays(referenceDate, offset),
        isRelative: true,
      });
    }
  }

  candidates.sort((a, b) => a.index - b.index);
  const finalCandidate = candidates.at(-1);
  if (!finalCandidate) {
    return {
      value: null,
      source: null,
      isRelative: false,
      selfCorrected: false,
    };
  }

  const selfCorrected =
    candidates.length > 1 &&
    new Set(candidates.map((candidate) => candidate.value)).size > 1;

  return {
    value: finalCandidate.value,
    source: finalCandidate.source,
    isRelative: finalCandidate.isRelative,
    selfCorrected,
  };
}
