"use client";

import type { ReactNode } from "react";

export type ShellTab = "home" | "request" | "schedule" | "elder" | "record" | "settings";

export interface ShellNavItem {
  id: ShellTab;
  label: string;
  badge?: string | null;
}

// 디자인 원본의 좌측 188px 네비게이션. 라벨/순서는 프로토타입을 따른다.
export const SHELL_NAV: ShellNavItem[] = [
  { id: "home", label: "홈" },
  { id: "request", label: "요청" },
  { id: "schedule", label: "일정" },
  { id: "elder", label: "어르신" },
  { id: "record", label: "사후기록" },
];

interface AppShellProps {
  active: ShellTab;
  onSelect: (tab: ShellTab) => void;
  requestBadge?: string | null;
  children: ReactNode;
}

export function AppShell({
  active,
  onSelect,
  requestBadge,
  children,
}: AppShellProps) {
  return (
    <div className="dc-shell">
      <nav className="dc-nav" aria-label="주요 메뉴">
        <div className="dc-brand">
          <span className="dc-brand-mark" aria-hidden="true" />
          <span className="dc-brand-name">동행고리 AI</span>
        </div>

        <div className="dc-nav-group">
          {SHELL_NAV.map((item) => {
            const badge = item.id === "request" ? requestBadge : item.badge;
            return (
              <button
                key={item.id}
                type="button"
                className={`dc-nav-item${active === item.id ? " is-active" : ""}`}
                aria-current={active === item.id ? "page" : undefined}
                onClick={() => onSelect(item.id)}
              >
                <span>{item.label}</span>
                {badge ? <span className="dc-nav-badge">{badge}</span> : null}
              </button>
            );
          })}
        </div>

        <div className="dc-nav-foot">
          <button
            type="button"
            className={`dc-nav-item${active === "settings" ? " is-active" : ""}`}
            aria-current={active === "settings" ? "page" : undefined}
            onClick={() => onSelect("settings")}
          >
            <span>설정</span>
          </button>
          <div className="dc-nav-user">
            김복지 사회복지사
            <br />
            고흥군 종합사회복지관
          </div>
        </div>
      </nav>
      {children}
    </div>
  );
}
