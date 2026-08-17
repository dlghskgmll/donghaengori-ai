"use client";

import { FormEvent, useState } from "react";

// 직원 로그인 카드. 어르신·사후기록·공통 진입점이 같은 form을 쓴다.
// 마크업(.dc-profile-login)은 기존 Claude Design 그대로다 — 새 화면을 만들지 않는다.

interface TeamLoginPanelProps {
  heading: string;
  description: string;
  error: string | null;
  notice?: string | null;
  busy: boolean;
  onSubmit: (userId: string, password: string) => void | Promise<void>;
  /** 공통 진입점에서만 쓴다. 원래 보던 화면으로 돌아가는 길. */
  onCancel?: () => void;
}

export function TeamLoginPanel({
  heading,
  description,
  error,
  notice,
  busy,
  onSubmit,
  onCancel,
}: TeamLoginPanelProps) {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onSubmit(userId, password);
  };

  return (
    <div className="dc-profile-login-wrap">
      <form className="dc-profile-login" onSubmit={submit}>
        <div>
          <h1>{heading}</h1>
          <p>{description}</p>
        </div>
        <label>
          <span>직원 아이디</span>
          <input
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            autoComplete="username"
            placeholder="예: U001"
            disabled={busy}
          />
        </label>
        <label>
          <span>비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            disabled={busy}
          />
        </label>
        {error ? (
          <p className="dc-profile-login-error" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="dc-profile-login-success" role="status">
            {notice}
          </p>
        ) : null}
        <button
          type="submit"
          className="dc-btn-primary"
          disabled={busy || !userId.trim() || !password}
          aria-busy={busy || undefined}
        >
          {busy ? "확인 중" : "로그인"}
        </button>
        {onCancel ? (
          <button
            type="button"
            className="dc-btn-ghost"
            onClick={onCancel}
            disabled={busy}
          >
            취소
          </button>
        ) : null}
        <p className="dc-profile-login-note">
          로그인 정보는 이 브라우저 탭을 닫으면 사라집니다.
        </p>
      </form>
    </div>
  );
}
