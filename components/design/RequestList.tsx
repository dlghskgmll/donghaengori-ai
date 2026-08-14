"use client";

import { Plus } from "lucide-react";

export interface RequestRow {
  id: string;
  title: string;
  line2: string;
  meta: string;
  badge?: string | null;
  badgeTone?: "warn" | "danger" | "neutral";
  statusText?: string | null;
  alert?: string | null;
  unread?: boolean;
}

export type RequestFilter = "all" | "todo" | "done";

const FILTERS: Array<{ id: RequestFilter; label: string }> = [
  { id: "all", label: "전체" },
  { id: "todo", label: "확인 필요" },
  { id: "done", label: "확정" },
];

interface RequestListProps {
  rows: RequestRow[];
  selectedId: string | null;
  filter: RequestFilter;
  summary: string;
  listError?: string | null;
  onRefresh?: () => void;
  onFilter: (filter: RequestFilter) => void;
  onSelect: (id: string) => void;
  onNewIntake: () => void;
  isComposing: boolean;
}

export function RequestList({
  rows,
  selectedId,
  filter,
  summary,
  listError,
  onRefresh,
  onFilter,
  onSelect,
  onNewIntake,
  isComposing,
}: RequestListProps) {
  return (
    <aside className="dc-list" aria-label="요청 목록">
      <div className="dc-list-head">
        <div className="dc-list-title">
          <span className="dc-list-title-main">요청</span>
          <span className="dc-list-title-sub">{summary}</span>
        </div>

        <button
          type="button"
          className={`dc-new-intake${isComposing ? " is-active" : ""}`}
          onClick={onNewIntake}
          aria-pressed={isComposing}
        >
          <Plus size={15} aria-hidden="true" />
          <span>새 요청 접수</span>
        </button>

        <div className="dc-filters" role="group" aria-label="요청 필터">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`dc-filter${filter === item.id ? " is-active" : ""}`}
              aria-pressed={filter === item.id}
              onClick={() => onFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {listError ? (
        <div className="dc-list-error" role="alert">
          <span>{listError}</span>
          {onRefresh ? (
            <button type="button" className="dc-list-retry" onClick={onRefresh}>
              다시 시도
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="dc-list-rows">
        {rows.length === 0 ? (
          <p className="dc-list-empty">
            {listError
              ? "저장된 요청을 표시할 수 없습니다."
              : "아직 저장된 요청이 없습니다. ‘새 요청 접수’로 시작해 주세요."}
          </p>
        ) : (
          rows.map((row) => (
            <button
              key={row.id}
              type="button"
              className={`dc-row${
                !isComposing && selectedId === row.id ? " is-selected" : ""
              }`}
              onClick={() => onSelect(row.id)}
              aria-current={
                !isComposing && selectedId === row.id ? "true" : undefined
              }
            >
              <span className="dc-row-top">
                <span className="dc-row-name">
                  {row.unread ? (
                    <span className="dc-row-dot" aria-label="확인 전" />
                  ) : null}
                  <span className="dc-row-title">{row.title}</span>
                </span>
                {row.badge ? (
                  <span className={`dc-chip dc-chip-${row.badgeTone ?? "neutral"}`}>
                    {row.badge}
                  </span>
                ) : null}
                {row.statusText ? (
                  <span className="dc-row-status">{row.statusText}</span>
                ) : null}
              </span>
              <span className="dc-row-line2">{row.line2}</span>
              {row.alert ? (
                <span className="dc-row-alert">{row.alert}</span>
              ) : null}
              <span className="dc-row-meta">{row.meta}</span>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
