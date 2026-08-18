"use client";

// 보호자 휴대폰 번호 입력. 모바일에서 숫자 키패드가 뜨도록 type=tel + inputMode를 쓰고,
// 입력하는 동안 하이픈을 자동으로 넣는다. 저장·조회 시에는 숫자만 정규화해 사용한다.

export function formatPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length < 4) return digits;
  if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

interface Props {
  id: string;
  value: string;
  onChange: (next: string) => void;
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  placeholder?: string;
}

export function PhoneInput({ id, value, onChange, label, required, error, hint, placeholder = "예: 010-1234-5678" }: Props) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label} {required ? <span className="field-req">*</span> : null}
      </label>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        className={`input${error ? " input--error" : ""}`}
        value={value}
        onChange={(event) => onChange(formatPhoneInput(event.target.value))}
        placeholder={placeholder}
        aria-describedby={hintId}
        maxLength={13}
      />
      {error ? (
        <p role="alert" className="field-error">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
