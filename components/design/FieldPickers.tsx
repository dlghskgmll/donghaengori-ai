"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  addDays,
  buildCalendarMonth,
  buildTimeSlots,
  filterDepartments,
  formatKoreanDate,
  formatKoreanTime,
  fromJsDate,
  MAJOR_DEPARTMENTS,
  parseDateValue,
  sameDate,
  shiftMonth,
  toIsoDate,
  type CalendarDate,
} from "@/lib/ui/fieldPickers";

/**
 * Request 상세의 structured picker 3종.
 *
 * 이 컴포넌트들은 값 문자열을 만들어 돌려줄 뿐이다 — 적용/확인(verify)은
 * ResolvableFieldRow가 기존 pipeline(onVerify · resolution reducer)으로
 * 처리한다. backend 계약, gate, finalization은 여기서 다루지 않는다.
 */

/** AI가 이미 뽑아 둔 값. 있으면 picker가 확인 단계를 먼저 보여준다. */
export interface PickerCandidate {
  value: string;
  /** 값 아래 붙는 근거 한 줄 — 예: 어르신 표현: ‘오후 두 시’ */
  note?: string | null;
}

interface PickerBaseProps {
  /** 필드 라벨 — dialog aria-label과 안내 문구에 쓴다. */
  fieldLabel: string;
  candidate: PickerCandidate | null;
  /** 현재 값(있으면). picker의 초기 선택으로 쓴다. */
  initialValue: string | null;
  /** true면 확인이 곧 서버 verify다 — 버튼 문구가 '확인함'이 된다. */
  verifyMode: boolean;
  busy?: boolean;
  onConfirm: (value: string) => void;
  onCancel: () => void;
  /** 자유 text 입력으로 전환한다(기존 편집 UI). */
  onManualEntry: () => void;
}

/** popover 골격 — Escape·바깥 클릭으로 닫히고, 열리면 첫 액션에 focus. */
function PickerShell({
  label,
  onCancel,
  children,
}: {
  label: string;
  onCancel: () => void;
  children: ReactNode;
}) {
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const target =
      shell.querySelector<HTMLElement>("[data-autofocus]") ??
      shell.querySelector<HTMLElement>("button, input");
    target?.focus();

    const onPointerDown = (event: MouseEvent) => {
      if (!shell.contains(event.target as Node)) onCancel();
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
    // 열릴 때 한 번만 — onCancel은 row 렌더마다 새로 만들어진다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="dcw-picker-anchor">
      <div
        ref={shellRef}
        className="dcw-picker"
        role="dialog"
        aria-label={label}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onCancel();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** 후보 확인 단계 — AI 값을 먼저 보여주고, 확인 또는 다른 값 선택으로 나눈다. */
function CandidateStep({
  caption,
  valueText,
  note,
  confirmLabel,
  otherLabel,
  busy,
  onConfirm,
  onOther,
}: {
  caption: string;
  valueText: string;
  note: string | null;
  confirmLabel: string;
  otherLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onOther: () => void;
}) {
  return (
    <div className="dcw-picker-candidate">
      <p className="dcw-picker-caption">{caption}</p>
      <p className="dcw-picker-candidate-value">{valueText}</p>
      {note ? <p className="dcw-picker-candidate-note">{note}</p> : null}
      <div className="dcw-picker-footer">
        <button
          type="button"
          className="dcw-picker-btn is-primary"
          data-autofocus
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? "반영 중…" : confirmLabel}
        </button>
        <button type="button" className="dcw-picker-btn" onClick={onOther}>
          {otherLabel}
        </button>
      </div>
    </div>
  );
}

/** 취소·직접 입력·확인이 모이는 공통 footer. */
function PickerFooter({
  selectedText,
  confirmDisabled,
  busy,
  verifyMode,
  onConfirm,
  onCancel,
  onManualEntry,
}: {
  selectedText: string | null;
  confirmDisabled: boolean;
  busy?: boolean;
  verifyMode: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onManualEntry: () => void;
}) {
  return (
    <>
      {selectedText ? (
        <p className="dcw-picker-selected" aria-live="polite">
          선택 · <strong>{selectedText}</strong>
        </p>
      ) : null}
      <div className="dcw-picker-footer">
        <button
          type="button"
          className="dcw-picker-btn is-quiet"
          onClick={onManualEntry}
        >
          직접 입력
        </button>
        <span className="dcw-picker-footer-gap" />
        <button type="button" className="dcw-picker-btn" onClick={onCancel}>
          취소
        </button>
        <button
          type="button"
          className={`dcw-picker-btn ${verifyMode ? "is-verify" : "is-primary"}`}
          disabled={confirmDisabled || busy}
          onClick={onConfirm}
        >
          {busy ? "반영 중…" : verifyMode ? "확인함" : "저장"}
        </button>
      </div>
    </>
  );
}

// ---------- 방문일 ----------

export function DateFieldPicker({
  fieldLabel,
  candidate,
  initialValue,
  verifyMode,
  busy,
  onConfirm,
  onCancel,
  onManualEntry,
}: PickerBaseProps) {
  const today = useMemo(() => fromJsDate(new Date()), []);
  const initialDate = parseDateValue(initialValue);
  const [step, setStep] = useState<"candidate" | "pick">(
    candidate ? "candidate" : "pick",
  );
  const [selected, setSelected] = useState<CalendarDate | null>(initialDate);
  const [view, setView] = useState(() => ({
    year: (initialDate ?? today).year,
    month: (initialDate ?? today).month,
  }));
  // 방향키로 이동 중인 칸 — roving tabindex의 기준.
  const [focusDay, setFocusDay] = useState<CalendarDate>(initialDate ?? today);
  const gridRef = useRef<HTMLDivElement>(null);
  const monthLabelId = useId();

  const calendar = useMemo(
    () => buildCalendarMonth(view.year, view.month),
    [view.year, view.month],
  );

  // 방향키 이동 후 대상 날짜 버튼으로 focus를 옮긴다.
  useEffect(() => {
    if (step !== "pick") return;
    const iso = toIsoDate(focusDay);
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-date="${iso}"]`)
      ?.focus();
  }, [focusDay, step]);

  const moveFocus = (days: number) => {
    const next = addDays(focusDay, days);
    setFocusDay(next);
    if (next.year !== view.year || next.month !== view.month) {
      setView({ year: next.year, month: next.month });
    }
  };

  const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    const delta = moves[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    moveFocus(delta);
  };

  const candidateDate = candidate ? parseDateValue(candidate.value) : null;

  if (step === "candidate" && candidate) {
    return (
      <PickerShell label={`${fieldLabel} 확인`} onCancel={onCancel}>
        <CandidateStep
          caption="통화에서 파악한 날짜"
          valueText={
            candidateDate ? formatKoreanDate(candidateDate) : candidate.value
          }
          note={candidate.note ?? null}
          confirmLabel="이 날짜가 맞아요"
          otherLabel="다른 날짜"
          busy={busy}
          onConfirm={() => onConfirm(candidate.value)}
          onOther={() => setStep("pick")}
        />
      </PickerShell>
    );
  }

  const quickDates: Array<{ label: string; date: CalendarDate }> = [
    { label: "오늘", date: today },
    { label: "내일", date: addDays(today, 1) },
    { label: "모레", date: addDays(today, 2) },
  ];

  const pick = (date: CalendarDate) => {
    setSelected(date);
    setFocusDay(date);
    if (date.year !== view.year || date.month !== view.month) {
      setView({ year: date.year, month: date.month });
    }
  };

  return (
    <PickerShell label={`${fieldLabel} 선택`} onCancel={onCancel}>
      <div className="dcw-picker-quick" role="group" aria-label="빠른 선택">
        {quickDates.map(({ label, date }) => (
          <button
            type="button"
            key={label}
            className="dcw-picker-chip"
            aria-pressed={sameDate(selected, date)}
            data-autofocus={label === "오늘" ? true : undefined}
            onClick={() => pick(date)}
          >
            {label}
            <span className="dcw-picker-chip-sub">
              {date.month}/{date.day}
            </span>
          </button>
        ))}
      </div>

      <div className="dcw-picker-cal-head">
        <button
          type="button"
          className="dcw-picker-nav"
          aria-label="이전 달"
          onClick={() => setView((v) => shiftMonth(v.year, v.month, -1))}
        >
          ‹
        </button>
        <span className="dcw-picker-cal-title" id={monthLabelId}>
          {view.year}년 {view.month}월
        </span>
        <button
          type="button"
          className="dcw-picker-nav"
          aria-label="다음 달"
          onClick={() => setView((v) => shiftMonth(v.year, v.month, 1))}
        >
          ›
        </button>
      </div>

      <div
        className="dcw-picker-cal"
        role="group"
        aria-labelledby={monthLabelId}
        ref={gridRef}
        onKeyDown={onGridKeyDown}
      >
        <div className="dcw-picker-cal-row is-weekdays" aria-hidden="true">
          {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        {calendar.weeks.map((week, weekIndex) => (
          <div className="dcw-picker-cal-row" key={`w-${weekIndex}`}>
            {week.map((date, dayIndex) =>
              date ? (
                <button
                  type="button"
                  key={toIsoDate(date)}
                  data-date={toIsoDate(date)}
                  className={`dcw-picker-day${
                    sameDate(selected, date) ? " is-selected" : ""
                  }${sameDate(today, date) ? " is-today" : ""}`}
                  aria-pressed={sameDate(selected, date)}
                  aria-label={`${formatKoreanDate(date)}${
                    sameDate(today, date) ? " (오늘)" : ""
                  }`}
                  tabIndex={sameDate(focusDay, date) ? 0 : -1}
                  onClick={() => pick(date)}
                >
                  {date.day}
                </button>
              ) : (
                <span key={`empty-${weekIndex}-${dayIndex}`} />
              ),
            )}
          </div>
        ))}
      </div>

      <PickerFooter
        selectedText={selected ? formatKoreanDate(selected) : null}
        confirmDisabled={!selected}
        busy={busy}
        verifyMode={verifyMode}
        onConfirm={() => selected && onConfirm(toIsoDate(selected))}
        onCancel={onCancel}
        onManualEntry={onManualEntry}
      />
    </PickerShell>
  );
}

// ---------- 예약 시간 ----------

export function TimeFieldPicker({
  fieldLabel,
  candidate,
  initialValue,
  verifyMode,
  busy,
  onConfirm,
  onCancel,
  onManualEntry,
}: PickerBaseProps) {
  const groups = useMemo(() => buildTimeSlots(), []);
  const [step, setStep] = useState<"candidate" | "pick">(
    candidate ? "candidate" : "pick",
  );
  const [selected, setSelected] = useState<string | null>(() => {
    const value = initialValue?.trim() ?? "";
    return groups.some((group) => group.slots.includes(value)) ? value : null;
  });

  if (step === "candidate" && candidate) {
    return (
      <PickerShell label={`${fieldLabel} 확인`} onCancel={onCancel}>
        <CandidateStep
          caption="통화에서 파악한 시간"
          valueText={`${candidate.value} · ${formatKoreanTime(candidate.value)}`}
          note={candidate.note ?? null}
          confirmLabel="이 시간이 맞아요"
          otherLabel="다른 시간"
          busy={busy}
          onConfirm={() => onConfirm(candidate.value)}
          onOther={() => setStep("pick")}
        />
      </PickerShell>
    );
  }

  return (
    <PickerShell label={`${fieldLabel} 선택`} onCancel={onCancel}>
      {groups.map((group, groupIndex) => (
        <div
          className="dcw-picker-slot-group"
          role="group"
          aria-label={group.label}
          key={group.label}
        >
          <span className="dcw-picker-caption">{group.label}</span>
          <div className="dcw-picker-slots">
            {group.slots.map((slot, slotIndex) => (
              <button
                type="button"
                key={slot}
                className={`dcw-picker-chip${selected === slot ? " is-selected" : ""}`}
                aria-pressed={selected === slot}
                aria-label={formatKoreanTime(slot)}
                data-autofocus={
                  groupIndex === 0 && slotIndex === 0 ? true : undefined
                }
                onClick={() => setSelected(slot)}
              >
                {slot}
              </button>
            ))}
          </div>
        </div>
      ))}

      <PickerFooter
        selectedText={selected ? formatKoreanTime(selected) : null}
        confirmDisabled={!selected}
        busy={busy}
        verifyMode={verifyMode}
        onConfirm={() => selected && onConfirm(selected)}
        onCancel={onCancel}
        onManualEntry={onManualEntry}
      />
    </PickerShell>
  );
}

// ---------- 진료과 ----------

export function DepartmentFieldPicker({
  fieldLabel,
  candidate,
  initialValue,
  verifyMode,
  busy,
  onConfirm,
  onCancel,
  onManualEntry,
}: PickerBaseProps) {
  const [step, setStep] = useState<"candidate" | "pick">(
    candidate ? "candidate" : "pick",
  );
  const [selected, setSelected] = useState<string | null>(
    initialValue?.trim() || null,
  );
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const listId = useId();
  const searchId = useId();

  const results = useMemo(() => filterDepartments(query), [query]);
  const showList = query.trim().length > 0;

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!showList) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const active = results[activeIndex] ?? results[0];
      if (active) {
        setSelected(active);
        setQuery("");
        setActiveIndex(-1);
      }
    }
  };

  if (step === "candidate" && candidate) {
    return (
      <PickerShell label={`${fieldLabel} 확인`} onCancel={onCancel}>
        <CandidateStep
          caption="통화에서 파악한 진료과"
          valueText={candidate.value}
          note={candidate.note ?? null}
          confirmLabel="이 진료과가 맞아요"
          otherLabel="다른 진료과"
          busy={busy}
          onConfirm={() => onConfirm(candidate.value)}
          onOther={() => setStep("pick")}
        />
      </PickerShell>
    );
  }

  const majorSet = new Set<string>(MAJOR_DEPARTMENTS);

  return (
    <PickerShell label={`${fieldLabel} 선택`} onCancel={onCancel}>
      <div className="dcw-picker-slot-group" role="group" aria-label="주요 진료과">
        <span className="dcw-picker-caption">주요 진료과</span>
        <div className="dcw-picker-slots">
          {MAJOR_DEPARTMENTS.map((name, index) => (
            <button
              type="button"
              key={name}
              className={`dcw-picker-chip${selected === name ? " is-selected" : ""}`}
              aria-pressed={selected === name}
              data-autofocus={index === 0 ? true : undefined}
              onClick={() => setSelected(name)}
            >
              {name}
            </button>
          ))}
          {/* 검색으로 고른 값도 chip과 같은 자리에서 선택 상태를 보여준다. */}
          {selected && !majorSet.has(selected) ? (
            <button
              type="button"
              className="dcw-picker-chip is-selected"
              aria-pressed="true"
              onClick={() => setSelected(selected)}
            >
              {selected}
            </button>
          ) : null}
        </div>
      </div>

      <div className="dcw-picker-search">
        <label className="dcw-picker-caption" htmlFor={searchId}>
          전체 진료과 검색
        </label>
        <input
          id={searchId}
          className="dcw-picker-search-input"
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={
            activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
          }
          aria-autocomplete="list"
          placeholder="진료과 이름 검색"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={onSearchKeyDown}
        />
        {showList ? (
          <ul className="dcw-picker-options" role="listbox" id={listId}>
            {results.length === 0 ? (
              <li className="dcw-picker-option-empty">
                일치하는 진료과가 없어요 — 직접 입력을 사용하세요.
              </li>
            ) : (
              results.map((name, index) => (
                <li key={name}>
                  <button
                    type="button"
                    role="option"
                    id={`${listId}-${index}`}
                    aria-selected={index === activeIndex}
                    className={`dcw-picker-option${
                      index === activeIndex ? " is-active" : ""
                    }`}
                    onClick={() => {
                      setSelected(name);
                      setQuery("");
                      setActiveIndex(-1);
                    }}
                  >
                    {name}
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>

      <PickerFooter
        selectedText={selected}
        confirmDisabled={!selected}
        busy={busy}
        verifyMode={verifyMode}
        onConfirm={() => selected && onConfirm(selected)}
        onCancel={onCancel}
        onManualEntry={onManualEntry}
      />
    </PickerShell>
  );
}
