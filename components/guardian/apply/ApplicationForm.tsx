"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BirthDateInput } from "@/components/guardian/ui/BirthDateInput";
import { PhoneInput } from "@/components/guardian/ui/PhoneInput";
import { CheckIcon, ChevronLeftIcon } from "@/components/guardian/ui/Icons";
import { HELP_OPTIONS, RELATION_OPTIONS, TOTAL_STEPS } from "@/lib/guardian/constants";
import { formatDate, formatTime, NOT_PROVIDED } from "@/lib/guardian/domain/format";
import { rememberApplication } from "@/lib/guardian/recentApplication";
import {
  EMPTY_FORM,
  toNewApplication,
  validateAll,
  validateStep,
  type ApplyFormState,
  type FormErrors,
} from "./formState";

function CheckOption({
  checked,
  onToggle,
  children,
  large,
}: {
  checked: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  large?: boolean;
}) {
  return (
    <button type="button" className={`check${large ? " check--lg" : ""}`} aria-pressed={checked} onClick={onToggle}>
      <span className="check__box">{checked ? <CheckIcon /> : null}</span>
      {children}
    </button>
  );
}

export function ApplicationForm() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<ApplyFormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function set<K extends keyof ApplyFormState>(key: K, value: ApplyFormState[K], clearError?: keyof FormErrors) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (clearError) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[clearError];
        return next;
      });
    }
  }

  function goBack() {
    setSubmitError(null);
    if (step > 1) {
      setStep(step - 1);
      setErrors({});
      window.scrollTo(0, 0);
    } else {
      router.push("/");
    }
  }

  async function submit() {
    const invalid = validateAll(form);
    if (invalid) {
      setStep(invalid.step);
      setErrors(invalid.errors);
      window.scrollTo(0, 0);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const response = await fetch("/api/guardian/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toNewApplication(form)),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.application) {
        setSubmitError(payload?.error ?? "잠시 문제가 발생했어요. 조금 뒤 다시 시도해주세요.");
        setSubmitting(false);
        return;
      }
      // 방금 만든 신청은 같은 브라우저에서 번호를 다시 입력하지 않고 열 수 있도록
      // 세션 범위로만 기억한다(영속 저장소가 아니라 편의용 힌트다).
      rememberApplication(payload.application.applicationNumber, form.phone);
      router.push(`/apply/complete?number=${encodeURIComponent(payload.application.applicationNumber)}`);
    } catch {
      setSubmitError("잠시 문제가 발생했어요. 조금 뒤 다시 시도해주세요.");
      setSubmitting(false);
    }
  }

  function next() {
    const stepErrors = validateStep(step, form);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      return;
    }
    setErrors({});
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
      window.scrollTo(0, 0);
      return;
    }
    void submit();
  }

  const reviewRows: Array<{ label: string; value: string; step: number }> = [
    {
      label: "어르신",
      value:
        [form.name || NOT_PROVIDED, form.birth, form.region].filter(Boolean).join(" · ") +
        (form.relation ? ` (보호자: ${form.relation})` : ""),
      step: 1,
    },
    { label: "날짜", value: form.dateUnknown ? "아직 정해지지 않았어요" : formatDate(form.date) ?? NOT_PROVIDED, step: 2 },
    { label: "시간", value: form.timeUnknown ? "시간을 아직 몰라요" : formatTime(form.time) ?? NOT_PROVIDED, step: 2 },
    { label: "병원", value: form.hospital || NOT_PROVIDED, step: 3 },
    { label: "진료과", value: form.deptUnknown ? "잘 모르겠어요" : form.dept || NOT_PROVIDED, step: 3 },
    { label: "필요한 도움", value: form.helps.join(", ") || NOT_PROVIDED, step: 4 },
    { label: "추가 내용", value: form.note || "없음", step: 5 },
    { label: "보호자 연락처", value: form.phone || NOT_PROVIDED, step: 1 },
  ];

  const ctaLabel = step < TOTAL_STEPS ? "다음" : submitting ? "전송 중…" : "신청하기";

  return (
    <div style={{ minHeight: "100vh", background: "var(--cream)" }}>
      <div className="gd-topbar">
        <div className="gd-topbar__inner">
          <button type="button" className="iconbtn" aria-label="이전으로" onClick={goBack}>
            <ChevronLeftIcon />
          </button>
          <span className="gd-topbar__title">신청하기</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-faint)", width: 44, textAlign: "right" }}>
            {step} / {TOTAL_STEPS}
          </span>
        </div>
        <div style={{ height: 4, background: "var(--line)" }}>
          <div style={{ height: 4, width: `${(step / TOTAL_STEPS) * 100}%`, background: "var(--orange)", transition: "width .25s" }} />
        </div>
      </div>

      <div className="form-shell">
        {step === 1 ? (
          <>
            <h2 className="form-title">누구의 병원 방문인가요?</h2>
            <div className="form-stack">
              <div>
                <label htmlFor="f-name" className="field-label">
                  어르신 성함 <span className="field-req">*</span>
                </label>
                <input
                  id="f-name"
                  className={`input${errors.name ? " input--error" : ""}`}
                  value={form.name}
                  onChange={(event) => set("name", event.target.value, "name")}
                  placeholder="어르신 성함을 입력해 주세요"
                />
                {errors.name ? <p role="alert" className="field-error">{errors.name}</p> : null}
              </div>

              <BirthDateInput value={form.birth} onChange={(value) => set("birth", value, "birth")} error={errors.birth} />

              <div>
                <label htmlFor="f-region" className="field-label">거주 지역</label>
                <input
                  id="f-region"
                  className="input"
                  value={form.region}
                  onChange={(event) => set("region", event.target.value)}
                  placeholder="예: 나주시 금천면"
                />
              </div>

              <div>
                <span className="field-label">보호자와의 관계</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {RELATION_OPTIONS.map((label) => (
                    <button
                      key={label}
                      type="button"
                      className="chip"
                      aria-pressed={form.relation === label}
                      onClick={() => set("relation", form.relation === label ? "" : label)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <PhoneInput
                id="f-phone"
                label="보호자 연락처"
                required
                value={form.phone}
                onChange={(value) => set("phone", value, "phone")}
                error={errors.phone}
                hint="신청 확인과 연락을 위해 필요한 정보만 수집합니다."
              />
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <h2 className="form-title form-title--tight">언제 병원에 가시나요?</h2>
            <p className="form-sub">아직 정확하지 않으셔도 괜찮아요. 담당자가 함께 확인합니다.</p>
            <div className="form-stack">
              <div>
                <label htmlFor="f-date" className="field-label">날짜</label>
                <input
                  id="f-date"
                  type="date"
                  className={`input${errors.date ? " input--error" : ""}`}
                  value={form.date}
                  disabled={form.dateUnknown}
                  onChange={(event) => set("date", event.target.value, "date")}
                />
                {errors.date ? <p role="alert" className="field-error">{errors.date}</p> : null}
                <CheckOption
                  checked={form.dateUnknown}
                  onToggle={() => {
                    set("dateUnknown", !form.dateUnknown, "date");
                  }}
                >
                  아직 정해지지 않았어요
                </CheckOption>
              </div>
              <div>
                <label htmlFor="f-time" className="field-label">시간</label>
                <input
                  id="f-time"
                  type="time"
                  className="input"
                  value={form.time}
                  disabled={form.timeUnknown}
                  onChange={(event) => set("time", event.target.value)}
                />
                <CheckOption checked={form.timeUnknown} onToggle={() => set("timeUnknown", !form.timeUnknown)}>
                  시간을 아직 몰라요
                </CheckOption>
              </div>
              <p className="footnote" style={{ margin: 0 }}>입력하신 일정은 담당자 확인 후에 확정됩니다.</p>
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <h2 className="form-title">어느 병원에 가시나요?</h2>
            <div className="form-stack">
              <div>
                <label htmlFor="f-hospital" className="field-label">
                  병원명 <span className="field-req">*</span>
                </label>
                <input
                  id="f-hospital"
                  className={`input${errors.hospital ? " input--error" : ""}`}
                  value={form.hospital}
                  onChange={(event) => set("hospital", event.target.value, "hospital")}
                  placeholder="예: 화순전남대학교병원"
                />
                {errors.hospital ? <p role="alert" className="field-error">{errors.hospital}</p> : null}
              </div>
              <div>
                <label htmlFor="f-dept" className="field-label">진료과</label>
                <input
                  id="f-dept"
                  className="input"
                  value={form.dept}
                  disabled={form.deptUnknown}
                  onChange={(event) => set("dept", event.target.value)}
                  placeholder="예: 정형외과"
                />
                <CheckOption checked={form.deptUnknown} onToggle={() => set("deptUnknown", !form.deptUnknown)}>
                  잘 모르겠어요
                </CheckOption>
              </div>
            </div>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <h2 className="form-title form-title--tight">어떤 도움이 필요하신가요?</h2>
            <p className="form-sub">필요한 도움을 모두 골라 주세요.</p>
            {errors.helps ? <p role="alert" className="field-error" style={{ margin: "0 0 14px" }}>{errors.helps}</p> : null}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {HELP_OPTIONS.map((label) => {
                const selected = form.helps.includes(label);
                return (
                  <CheckOption
                    key={label}
                    large
                    checked={selected}
                    onToggle={() => {
                      set("helps", selected ? form.helps.filter((item) => item !== label) : [...form.helps, label], "helps");
                    }}
                  >
                    {label}
                  </CheckOption>
                );
              })}
            </div>
          </>
        ) : null}

        {step === 5 ? (
          <>
            <h2 className="form-title form-title--tight">추가로 알려주실 내용이 있나요?</h2>
            <p className="form-sub">적어주신 내용은 담당자에게 그대로 전달됩니다.</p>
            <label htmlFor="f-note" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
              추가 내용
            </label>
            <textarea
              id="f-note"
              rows={6}
              value={form.note}
              onChange={(event) => set("note", event.target.value)}
              placeholder={"어머니가 무릎이 좋지 않아 오래 걷기 힘드세요.\n병원에서는 휠체어 이동이 필요할 수도 있습니다."}
              style={{
                width: "100%",
                minHeight: 160,
                padding: 16,
                fontSize: 16,
                lineHeight: 1.6,
                border: "1.5px solid var(--line-strong)",
                borderRadius: 14,
                background: "#fff",
                color: "var(--ink)",
                resize: "vertical",
              }}
            />
            <p className="field-hint">건너뛰셔도 괜찮아요.</p>
          </>
        ) : null}

        {step === 6 ? (
          <>
            <h2 className="form-title form-title--tight">신청 내용을 확인해 주세요.</h2>
            <p className="form-sub">담당 사회복지사가 확인한 뒤 최종 일정을 확정합니다.</p>
            <div className="card">
              {reviewRows.map((row) => (
                <div key={row.label} className="card__row">
                  <span className="card__label">{row.label}</span>
                  <span className="card__value">{row.value}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setStep(row.step);
                      window.scrollTo(0, 0);
                    }}
                    style={{
                      flex: "none",
                      minHeight: 32,
                      padding: "4px 10px",
                      margin: "-4px -6px 0 0",
                      background: "none",
                      border: "none",
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--orange-ink)",
                      cursor: "pointer",
                    }}
                  >
                    수정
                  </button>
                </div>
              ))}
            </div>
            <p className="field-hint" style={{ marginTop: 16, lineHeight: 1.6 }}>
              동행고리AI는 의료적 진단이나 판단을 하지 않으며, 최종 일정과 지원 내용은 담당자가 확인합니다.
            </p>
            {submitError ? (
              <p role="alert" className="field-error" style={{ marginTop: 14, fontSize: 15 }}>
                {submitError}
              </p>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="sticky-cta">
        <div className="sticky-cta__inner">
          <button type="button" className="btn btn--primary btn--md btn--block" disabled={submitting} onClick={next}>
            {ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
