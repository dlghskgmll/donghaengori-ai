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
  alertTone?: "warn" | "danger";
  unread?: boolean;
  /** 서버가 확정했다고 준 값. 배지 유무로 확정을 추측하지 않는다. */
  confirmed?: boolean;
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
  loading?: boolean;
  /** 방금 도착한 저장 접수 안내. 잠깐 떴다 사라진다. */
  newArrivalLabel?: string | null;
  onRefresh?: () => void;
  onFilter: (filter: RequestFilter) => void;
  onSelect: (id: string) => void;
  onNewIntake: () => void;
  isComposing: boolean;
}

/**
 * 필터별로 보여 줄 행.
 *
 * '확정'은 서버의 confirmed 값으로만 고른다. 배지가 없다는 것은 "확인할 항목이
 * 없다"는 뜻이지 확정됐다는 뜻이 아니다 — 그걸 섞으면 아직 사람이 확정하지
 * 않은 접수가 확정 목록에 앉는다.
 */
export function filterRequestRows(
  rows: RequestRow[],
  filter: RequestFilter,
): RequestRow[] {
  if (filter === "todo") {
    return rows.filter(
      (row) => row.badge === "확인 필요" || row.badge === "긴급",
    );
  }
  if (filter === "done") return rows.filter((row) => row.confirmed === true);
  return rows;
}

export function requestListEmptyMessage(
  filter: RequestFilter,
  hasError: boolean,
  loading = false,
): string {
  if (loading) return "요청 목록을 불러오는 중입니다.";
  if (hasError) return "저장된 요청을 표시할 수 없습니다.";
  if (filter === "todo") return "확인이 필요한 요청이 없습니다.";
  if (filter === "done") return "확정된 요청이 없습니다.";
  return "아직 저장된 요청이 없습니다. ‘새 요청 접수’로 시작해 주세요.";
}

export function RequestList({
  rows,
  selectedId,
  filter,
  summary,
  listError,
  loading = false,
  newArrivalLabel,
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
          <span
            className={`dc-list-title-sub${newArrivalLabel ? " is-new" : ""}`}
            role={newArrivalLabel ? "status" : undefined}
          >
            {newArrivalLabel ? (
              <>
                <span className="dc-list-new-dot" aria-hidden="true" />
                <span className="dc-list-new-text">{newArrivalLabel}</span>
              </>
            ) : (
              summary
            )}
          </span>
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
          <p className="dc-list-empty" role={loading ? "status" : undefined}>
            {requestListEmptyMessage(filter, Boolean(listError), loading)}
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
                <span
                  className={`dc-row-alert${
                    row.alertTone ? ` is-${row.alertTone}` : ""
                  }`}
                >
                  {row.alert}
                </span>
              ) : null}
              <span className="dc-row-meta">{row.meta}</span>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
