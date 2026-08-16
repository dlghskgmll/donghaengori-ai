import type { SavedIntakeSummary } from "@/lib/ai/savedIntakeView";

// 요청 탭이 열려 있는 동안 Team 저장 접수를 다시 읽는다.
// 화면(React)과 분리해 둔다 — 타이머·중복 fetch·늦게 도착한 응답 처리는
// 렌더링과 무관한 규칙이고, 그래야 fake timer로 그대로 검증할 수 있다.
//
// 읽기 전용이다. 여기서 저장·수정·재분석을 하지 않는다.

/** 저장 접수 재조회 주기. */
export const SAVED_INTAKE_POLL_INTERVAL_MS = 5000;

const FAILURE_MESSAGE = "요청 목록을 불러오지 못했습니다.";

export type SavedIntakePollUpdate =
  /** 목록이 바뀌었다. newIds는 이번에 처음 본 저장 접수 id다. */
  | { type: "loaded"; saved: SavedIntakeSummary[]; newIds: number[] }
  /** 응답은 정상이지만 내용이 이전과 같다 — 화면 상태를 새로 만들지 않는다. */
  | { type: "unchanged" }
  /** 이번 조회가 실패했다. hasLoaded면 이미 보여 줄 목록이 있다는 뜻이다. */
  | { type: "failed"; error: string; hasLoaded: boolean };

export type SavedIntakeFetcher = (
  signal: AbortSignal,
) => Promise<SavedIntakeSummary[]>;

export interface SavedIntakePollerOptions {
  fetchList: SavedIntakeFetcher;
  onUpdate: (update: SavedIntakePollUpdate) => void;
  intervalMs?: number;
}

/** 같은 저장 접수가 두 번 들어와도 목록에는 한 번만 남긴다. 순서는 backend 그대로 둔다. */
export function dedupeSavedById(
  list: SavedIntakeSummary[],
): SavedIntakeSummary[] {
  const seen = new Set<number>();
  return list.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return FAILURE_MESSAGE;
}

export class SavedIntakePoller {
  private readonly fetchList: SavedIntakeFetcher;
  private readonly onUpdate: (update: SavedIntakePollUpdate) => void;
  private readonly intervalMs: number;

  private timer: ReturnType<typeof setInterval> | null = null;
  /** 진행 중인 요청. null이 아니면 다음 tick은 건너뛴다(중복 fetch 방지). */
  private controller: AbortController | null = null;
  private stopped = true;
  private seq = 0;
  private appliedSeq = 0;
  /** 성공한 적이 없으면 null. 첫 성공 응답은 신규 접수로 보지 않는다. */
  private known: Set<number> | null = null;
  private signature: string | null = null;

  constructor(options: SavedIntakePollerOptions) {
    this.fetchList = options.fetchList;
    this.onUpdate = options.onUpdate;
    this.intervalMs = options.intervalMs ?? SAVED_INTAKE_POLL_INTERVAL_MS;
  }

  get isRunning(): boolean {
    return !this.stopped;
  }

  /** 즉시 한 번 읽고, 이후 interval마다 다시 읽는다. */
  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    void this.run();
    this.timer = setInterval(() => {
      void this.run();
    }, this.intervalMs);
  }

  /** 탭을 벗어나거나 화면이 사라질 때 호출한다. 이후 도착하는 응답은 버린다. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.abortInFlight();
  }

  /** 사용자가 직접 새로고침했다. 진행 중인 요청은 버리고 바로 다시 읽는다. */
  refresh(): void {
    if (this.stopped) return;
    this.abortInFlight();
    void this.run();
  }

  private abortInFlight() {
    if (this.controller === null) return;
    this.controller.abort();
    this.controller = null;
  }

  private async run(): Promise<void> {
    // 이전 fetch가 끝나지 않았으면 겹쳐 부르지 않는다.
    if (this.stopped || this.controller !== null) return;

    const controller = new AbortController();
    this.controller = controller;
    const seq = ++this.seq;

    try {
      const list = await this.fetchList(controller.signal);
      this.settle(seq, controller, list, null);
    } catch (error) {
      this.settle(seq, controller, null, messageOf(error));
    } finally {
      if (this.controller === controller) this.controller = null;
    }
  }

  private settle(
    seq: number,
    controller: AbortController,
    list: SavedIntakeSummary[] | null,
    error: string | null,
  ) {
    // 버린 요청(stop/refresh)과 이미 지나간 응답은 반영하지 않는다.
    if (controller.signal.aborted || this.stopped) return;
    if (seq <= this.appliedSeq) return;
    this.appliedSeq = seq;

    if (list === null) {
      this.onUpdate({
        type: "failed",
        error: error ?? FAILURE_MESSAGE,
        hasLoaded: this.known !== null,
      });
      return;
    }

    const saved = dedupeSavedById(list);

    let newIds: number[] = [];
    if (this.known === null) {
      // 화면을 처음 열었을 때 이미 저장돼 있던 접수는 새 요청이 아니다.
      this.known = new Set(saved.map((item) => item.id));
    } else {
      const known = this.known;
      newIds = saved.map((item) => item.id).filter((id) => !known.has(id));
      for (const id of newIds) known.add(id);
    }

    const signature = JSON.stringify(saved);
    if (signature === this.signature) {
      this.onUpdate({ type: "unchanged" });
      return;
    }
    this.signature = signature;
    this.onUpdate({ type: "loaded", saved, newIds });
  }
}
