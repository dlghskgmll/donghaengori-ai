"use client";

// 생년월일 입력 필드. 변환 로직은 lib/domain/birthDate에 있다.

import { useId } from "react";
import { formatBirthDateInput } from "@/lib/guardian/domain/birthDate";

interface Props {
  value: string;
  onChange: (next: string) => void;
  error?: string;
}

export function BirthDateInput({ value, onChange, error }: Props) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div>
      <label htmlFor={id} className="field-label">
        생년월일 <span className="field-req">*</span>
      </label>
      <input
        id={id}
        className={`input${error ? " input--error" : ""}`}
        value={value}
        onChange={(event) => onChange(formatBirthDateInput(event.target.value))}
        placeholder="예: 1943.05.12"
        inputMode="numeric"
        autoComplete="bday"
        aria-describedby={hintId}
        maxLength={10}
      />
      {error ? (
        <p role="alert" className="field-error">
          {error}
        </p>
      ) : null}
      <p id={hintId} className="field-hint">
        숫자 8자리를 그대로 입력하시면 돼요.
      </p>
    </div>
  );
}
