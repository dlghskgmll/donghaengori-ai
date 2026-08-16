import type { IntakeAnalysis, IntakeResponseMeta } from "@/lib/ai/schema";
import type { SavedIntakeSummary } from "@/lib/ai/savedIntakeView";
import type { SavedIntakePollUpdate } from "./savedIntakePolling";

// 요청 목록 화면의 상태를 한곳에서 옮긴다.
//
// 지켜야 하는 경계:
//   미리보기(preview) — save:false 분석 결과. 세션에만 있다.
//   저장 접수(saved)   — Team backend가 가진 것. GET으로만 읽는다.
// 이 둘은 절대 같은 저장 흐름으로 합치지 않는다. poll 결과는 saved만 바꾸고
// previews·selectedId는 건드리지 않는다.

/** 브라우저에서 방금 분석한 결과. save:false라 backend에 저장되지 않는다. */
export interface PreviewRecord {
  kind: "preview";
  id: string;
  analysis: IntakeAnalysis;
  meta: IntakeResponseMeta | null;
  transcript: string;
  callerPhone: string;
  receivedAt: Date;
}

export interface RequestInboxState {
  saved: SavedIntakeSummary[];
  previews: PreviewRecord[];
  selectedId: string | null;
  listLoading: boolean;
  /** 목록을 한 번도 받지 못했을 때만 쓴다 — 화면 전체를 오류로 덮지 않는다. */
  listError: string | null;
  /** 목록은 이미 있는데 backend가 잠깐 응답하지 않는 상태. */
  connectionLost: boolean;
  /** 이번에 새로 도착한 저장 접수. 잠깐 보여 준 뒤 지운다. */
  arrived: SavedIntakeSummary[] | null;
}

export const initialRequestInboxState: RequestInboxState = {
  saved: [],
  previews: [],
  selectedId: null,
  listLoading: true,
  listError: null,
  connectionLost: false,
  arrived: null,
};

export type RequestInboxAction =
  | { type: "poll"; update: SavedIntakePollUpdate }
  | { type: "refreshRequested" }
  | { type: "previewAdded"; record: PreviewRecord }
  | { type: "selected"; id: string | null }
  | { type: "arrivalDismissed" };

export function requestInboxReducer(
  state: RequestInboxState,
  action: RequestInboxAction,
): RequestInboxState {
  switch (action.type) {
    case "poll": {
      const update = action.update;

      if (update.type === "failed") {
        // 이미 받아 둔 목록이 있으면 지우지 않는다. 조용히 다음 poll을 기다린다.
        if (update.hasLoaded) {
          return state.connectionLost && !state.listLoading
            ? state
            : { ...state, listLoading: false, connectionLost: true };
        }
        return { ...state, listLoading: false, listError: update.error };
      }

      if (update.type === "unchanged") {
        // 바뀐 게 없으면 새 state를 만들지 않는다 — 5초마다 화면을 다시 그리지 않는다.
        if (!state.listLoading && !state.connectionLost && state.listError === null) {
          return state;
        }
        return {
          ...state,
          listLoading: false,
          listError: null,
          connectionLost: false,
        };
      }

      return {
        ...state,
        // saved만 갈아 끼운다. previews·selectedId는 그대로 둔다.
        saved: update.saved,
        listLoading: false,
        listError: null,
        connectionLost: false,
        arrived:
          update.newIds.length > 0
            ? update.saved.filter((item) => update.newIds.includes(item.id))
            : state.arrived,
      };
    }

    case "refreshRequested":
      return { ...state, listLoading: true };

    case "previewAdded":
      return {
        ...state,
        previews: [action.record, ...state.previews],
        selectedId: action.record.id,
      };

    case "selected":
      return { ...state, selectedId: action.id };

    case "arrivalDismissed":
      return state.arrived === null ? state : { ...state, arrived: null };

    default:
      return state;
  }
}

/**
 * 새 접수 안내 문구. channel을 실제로 확인할 수 있을 때만 "전화"라고 쓴다.
 */
export function describeNewArrival(arrived: SavedIntakeSummary[]): string | null {
  if (arrived.length === 0) return null;
  const phoneOnly = arrived.every((item) => item.channel === "전화");
  const subject = phoneOnly ? "새 전화 접수" : "새 요청";
  if (arrived.length === 1) {
    return phoneOnly ? `${subject}가 도착했습니다` : `${subject}이 도착했습니다`;
  }
  return `${subject} ${arrived.length}건이 도착했습니다`;
}
