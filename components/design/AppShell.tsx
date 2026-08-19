"use client";

import type { ComponentType, ReactNode } from "react";
import {
  CalendarDays,
  ClipboardCheck,
  Home,
  Inbox,
  LogOut,
  Settings,
  UsersRound,
} from "lucide-react";

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

// 아이콘은 한 가족(lucide outline)만, 같은 크기·굵기로 쓴다.
// 텍스트보다 강해지지 않도록 stroke를 한 단계 얇게 둔다.
const NAV_ICONS: Record<ShellTab, ComponentType<{ size?: number | string; strokeWidth?: number | string }>> = {
  home: Home,
  request: Inbox,
  schedule: CalendarDays,
  elder: UsersRound,
  record: ClipboardCheck,
  settings: Settings,
};

function NavIcon({ tab }: { tab: ShellTab }) {
  const Icon = NAV_ICONS[tab];
  return (
    <span className="dc-nav-icon" aria-hidden="true">
      <Icon size={18} strokeWidth={1.8} />
    </span>
  );
}

export interface ShellSessionUser {
  name: string;
  role: string;
}

interface AppShellProps {
  active: ShellTab;
  onSelect: (tab: ShellTab) => void;
  requestBadge?: string | null;
  /** 로그인된 직원. 없으면 로그인 진입점을 보여 준다. */
  sessionUser?: ShellSessionUser | null;
  onLogin?: () => void;
  onLogout?: () => void;
  logoutBusy?: boolean;
  children: ReactNode;
}

export function AppShell({
  active,
  onSelect,
  requestBadge,
  sessionUser,
  onLogin,
  onLogout,
  logoutBusy = false,
  children,
}: AppShellProps) {
  return (
    <div className="dc-shell">
      <nav className="dc-nav" aria-label="주요 메뉴">
        <div className="dc-brand">
          {/* 로고는 장식이다. 접근성 이름은 옆의 "동행고리AI" 텍스트가 맡는다. */}
          <span className="dc-brand-mark" aria-hidden="true" />
          <span className="dc-brand-name">
            동행고리<span className="dc-brand-ai">AI</span>
          </span>
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
                <NavIcon tab={item.id} />
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
            <NavIcon tab="settings" />
            <span>설정</span>
          </button>
          {/* 로그인 진입점은 여기 한 곳이다. 탭을 옮겨 다니게 하지 않는다. */}
          {sessionUser ? (
            <div className="dc-nav-user is-signed-in">
              {/* 실제 직원 데이터에 있는 이름·역할만 보여준다. */}
              <span className="dc-nav-user-avatar" aria-hidden="true">
                {sessionUser.name.trim().charAt(0)}
              </span>
              <span className="dc-nav-user-id">
                <span className="dc-nav-user-name">{sessionUser.name}</span>
                <span className="dc-nav-user-role">{sessionUser.role}</span>
              </span>
              {onLogout ? (
                <button
                  type="button"
                  className="dc-nav-user-logout"
                  onClick={onLogout}
                  disabled={logoutBusy}
                  aria-busy={logoutBusy || undefined}
                  aria-label={logoutBusy ? "로그아웃 중" : "로그아웃"}
                  title="로그아웃"
                >
                  <LogOut size={16} strokeWidth={1.8} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          ) : (
            <div className="dc-nav-user">
              <span className="dc-nav-user-role">로그인하지 않음</span>
              {onLogin ? (
                <button
                  type="button"
                  className="dc-nav-user-action is-login"
                  onClick={onLogin}
                >
                  직원 로그인
                </button>
              ) : null}
            </div>
          )}
        </div>
      </nav>
      {children}
    </div>
  );
}
