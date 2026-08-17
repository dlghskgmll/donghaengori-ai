import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedIntakeSummary } from "../lib/ai/savedIntakeView";
import {
  SAVED_INTAKE_POLL_INTERVAL_MS,
  SavedIntakePoller,
  type SavedIntakePollUpdate,
} from "../lib/ui/savedIntakePolling";
import {
  describeNewArrival,
  initialRequestInboxState,
  requestInboxReducer,
  type PreviewRecord,
  type RequestInboxState,
} from "../lib/ui/requestInbox";

// U1 — 저장 접수 자동 갱신.
// 실제 5초를 기다리지 않는다. 타이머는 fake timer로 돌리고, fetch는
// 테스트가 직접 resolve/reject 하는 deferred로 대체해 응답 순서를 만든다.

function summary(
  id: number,
  overrides: Partial<SavedIntakeSummary> = {},
): SavedIntakeSummary {
  return {
    id,
    target: `대상자 ${id}`,
    hospital: "○○정형외과의원",
    hospitalStatus: "INFERRED",
    channel: "전화",
    status: "접수 대기",
    createdAt: "2026-08-16 09:00",
    appointmentDate: "2026-08-18",
    confirmed: false,
    urgent: false,
    urgentConfidence: null,
    needsConfirmation: true,
    ...overrides,
  };
}

/** 테스트가 응답 시점을 직접 정하는 fetch 대역. */
function deferredFetcher() {
  const calls: Array<{
    signal: AbortSignal;
    resolve: (rows: SavedIntakeSummary[]) => void;
    reject: (error: unknown) => void;
  }> = [];

  const fetchList = (signal: AbortSignal) =>
    new Promise<SavedIntakeSummary[]>((resolve, reject) => {
      calls.push({ signal, resolve, reject });
    });

  return { calls, fetchList };
}

/** 마이크로태스크(then 체인)까지 흘려보낸다. */
async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SavedIntakePoller", () => {
  it("U1-01 화면을 열면 저장 목록을 한 번 읽는다", async () => {
    const updates: SavedIntakePollUpdate[] = [];
    const { calls, fetchList } = deferredFetcher();
    const poller = new SavedIntakePoller({
      fetchList,
      onUpdate: (update) => updates.push(update),
    });

    poller.start();
    expect(calls).toHaveLength(1);

    calls[0].resolve([summary(75), summary(74), summary(73)]);
    await flush();

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ type: "loaded", newIds: [] });
    expect(
      (updates[0] as { saved: SavedIntakeSummary[] }).saved.map((r) => r.id),
    ).toEqual([75, 74, 73]);

    poller.stop();
  });

  it("U1-10 처음 받은 저장 접수는 신규 요청으로 보지 않는다", async () => {
    const updates: SavedIntakePollUpdate[] = [];
    const { calls, fetchList } = deferredFetcher();
    const poller = new SavedIntakePoller({
      fetchList,
      onUpdate: (update) => updates.push(update),
    });

    poller.start();
    calls[0].resolve([summary(75), summary(74), summary(73)]);
    await flush();

    expect(updates[0]).toMatchObject({ type: "loaded", newIds: [] });

    poller.stop();
  });

  it("U1-02 다음 poll에서 새로 생긴 저장 접수를 신규로 알린다", async () => {
    const updates: SavedIntakePollUpdate[] = [];
    const { calls, fetchList } = deferredFetcher();
    const poller = new SavedIntakePoller({
      fetchList,
      onUpdate: (update) => updates.push(update),
    });

    poller.start();
    calls[0].resolve([summary(75), summary(74), summary(73)]);
    await flush();

    await vi.advanceTimersByTimeAsync(SAVED_INTAKE_POLL_INTERVAL_MS);
    expect(calls).toHaveLength(2);
    calls[1].resolve([summary(76), summary(75), summary(74), summary(73)]);
    await flush();

    expect(updates).toHaveLength(2);
    expect(updates[1]).toMatchObject({ type: "loaded", newIds: [76] });
    expect(
      (updates[1] as { saved: SavedIntakeSummary[] }).saved.map((r) => r.id),
    ).toEqual([76, 75, 74, 73]);

    poller.stop();
  });

  it("U1-03 같은 저장 접수를 두 번 신규로 알리거나 목록에 중복해 넣지 않는다", async () => {
    const updates: SavedIntakePollUpdate[] = [];
    const { calls, fetchList } = deferredFetcher();
    const poller = new SavedIntakePoller({
      fetchList,
      onUpdate: (update) => updates.push(update),
    });

    poller.start();
    calls[0].resolve([summary(75)]);
    await flush();

    // 새 접수가 하나 생긴다.
    await vi.advanceTimersByTimeAsync(SAVED_INTAKE_POLL_INTERVAL_MS);
    calls[1].resolve([summary(76), summary(75)]);
    await flush();
    expect(updates[1]).toMatchObject({ type: "loaded", newIds: [76] });

    // 같은 목록을 다시 받는다 — 새 state를 만들지 않는다.
    await vi.advanceTimersByTimeAsync(SAVED_INTAKE_POLL_INTERVAL_MS);
    calls[2].resolve([summary(76), summary(75)]);
    await flush();
    expect(updates[2]).toEqual({ type: "unchanged" });

    // backend가 같은 행을 중복해 실어 보내도 목록에는 한 번만 남는다.
    await vi.advanceTimersByTimeAsync(SAVED_INTAKE_POLL_INTERVAL_MS);
    calls[3].resolve([summary(77), summary(77), summary(76), summary(75)]);
    await flush();
    expect(updates[3]).toMatchObject({ type: "loaded", newIds: [77] });
    expect(
      (updates[3] as { saved: SavedIntakeSummary[] }).saved.map((r) => r.id),
    ).toEqual([77, 76, 75]);

    poller.stop();
  });

  it("U1-06 조회에 실패해도 이전 목록을 지우라고 하지 않는다", async () => {
    const updates: SavedIntakePollUpdate[] = [];
    const { calls, fetchList } = deferredFetcher();
    const poller = new SavedIntakePoller({
      fetchList,
      onUpdate: (update) => updates.push(update),
    });

    poller.start();
    calls[0].resolve([summary(75)]);
    await flush();

    await vi.advanceTimersByTimeAsync(SAVED_INTAKE_POLL_INTERVAL_MS);
    calls[1].reject(new Error("Team AI backend에 연결하지 못했습니다."));
    await flush();

    expect(updates[1]).toEqual({
      type: "failed",
      error: "Team AI backend에 연결하지 못했습니다.",
      hasLoaded: true,
    });

    poller.stop();
  });

  it("U1-07 backend가 살아나면 다음 poll에서 신규 접수를 반영한다", async () => {
    const updates: SavedIntakePollUpdate[] = [];
    const { calls, fetchList } = deferredFetcher();
    const poller = new SavedIntakePoller({
      fetchList,
      onUpdate: (update) => updates.push(update),
    });

    poller.start();
    calls[0].resolve([summary(75)]);
    await flush();

    await vi.advanceTimersByTimeAsync(SAVED_INTAKE_POLL_INTERVAL_MS);
    calls[1].reject(new Error("연결 실패"));
    await flush();

    await vi.advanceTimersByTimeAsync(SAVED_INTAKE_POLL_INTERVAL_MS);
    calls[2].resolve([summary(76), summary(75)]);
    await flush();

    expect(updates[2]).toMatchObject({ type: "loaded", newIds: [76] });

    poller.stop();
  });

  it("U1-08 요청 탭을 벗어나면(stop) 더 이상 읽지 않는다", async () => {
    const updates: SavedIntakePollUpdate[] = [];
    const { calls, fetchList } = deferredFetcher();
    const poller = new SavedIntakePoller({
      fetchList,
      onUpdate: (update) => updates.push(update),
    });

    poller.start();
    calls[0].resolve([summary(75)]);
    await flush();
    expect(calls).toHaveLength(1);

    poller.stop();
    expect(poller.isRunning).toBe(false);

    await vi.advanceTimersByTimeAsync(SAVED_INTAKE_POLL_INTERVAL_MS * 4);
    expect(calls).toHaveLength(1);
    expect(updates).toHaveLength(1);
  });

  it("U1-09 stop 이후 도착한 응답은 반영하지 않는다", async () => {
    const updates: SavedIntakePollUpdate[] = [];
    const { calls, fetchList } = deferredFetcher();
    const poller = new SavedIntakePoller({
      fetchList,
      onUpdate: (update) => updates.push(update),
    });

    poller.start();
    calls[0].resolve([summary(75)]);
    await flush();

    // 다음 poll이 나간 뒤 화면이 사라진다.
    await vi.advanceTimersByTimeAsync(SAVED_INTAKE_POLL_INTERVAL_MS);
    expect(calls).toHaveLength(2);
    poller.stop();

    calls[1].resolve([summary(76), summary(75)]);
    await flush();

    expect(updates).toHaveLength(1);
    expect(calls[1].signal.aborted).toBe(true);
  });

  it("이전 fetch가 끝나기 전에는 다음 poll을 내보내지 않는다", async () => {
    const { calls, fetchList } = deferredFetcher();
    const poller = new SavedIntakePoller({ fetchList, onUpdate: () => {} });

    poller.start();
    expect(calls).toHaveLength(1);

    // 첫 응답이 오지 않은 채로 세 주기가 지나도 요청은 하나뿐이다.
    await vi.advanceTimersByTimeAsync(SAVED_INTAKE_POLL_INTERVAL_MS * 3);
    expect(calls).toHaveLength(1);

    calls[0].resolve([summary(75)]);
    await flush();

    await vi.advanceTimersByTimeAsync(SAVED_INTAKE_POLL_INTERVAL_MS);
    expect(calls).toHaveLength(2);

    poller.stop();
  });

  it("늦게 도착한 오래된 응답이 최신 목록을 덮어쓰지 않는다", async () => {
    const updates: SavedIntakePollUpdate[] = [];
    const { calls, fetchList } = deferredFetcher();
    const poller = new SavedIntakePoller({
      fetchList,
      onUpdate: (update) => updates.push(update),
    });

    poller.start();
    calls[0].resolve([summary(75)]);
    await flush();

    // 진행 중인 조회를 두고 사용자가 새로고침한다 — 이전 요청은 버린다.
    await vi.advanceTimersByTimeAsync(SAVED_INTAKE_POLL_INTERVAL_MS);
    expect(calls).toHaveLength(2);
    poller.refresh();
    expect(calls).toHaveLength(3);

    // 새 응답이 먼저 도착하고,
    calls[2].resolve([summary(77), summary(76), summary(75)]);
    await flush();
    expect(updates[1]).toMatchObject({ type: "loaded", newIds: [77, 76] });

    // 버려진 예전 요청이 뒤늦게 도착한다.
    calls[1].resolve([summary(75)]);
    await flush();
    expect(updates).toHaveLength(2);

    poller.stop();
  });
});

describe("requestInboxReducer", () => {
  const preview: PreviewRecord = {
    kind: "preview",
    id: "preview-1",
    // 이 테스트는 미리보기가 '남아 있는지'만 본다 — 내용은 보지 않는다.
    analysis: {} as PreviewRecord["analysis"],
    meta: null,
    transcript: "내일 병원 가야 해.",
    callerPhone: "010-1111-1111",
    receivedAt: new Date("2026-08-16T09:00:00Z"),
  };

  function loadedState(): RequestInboxState {
    return requestInboxReducer(
      {
        ...initialRequestInboxState,
        previews: [preview],
        selectedId: "saved-74",
      },
      {
        type: "poll",
        update: {
          type: "loaded",
          saved: [summary(75), summary(74), summary(73)],
          newIds: [],
        },
      },
    );
  }

  it("U1-04 새 접수가 도착해도 보고 있던 접수의 선택을 바꾸지 않는다", () => {
    const before = loadedState();

    const after = requestInboxReducer(before, {
      type: "poll",
      update: {
        type: "loaded",
        saved: [summary(76), summary(75), summary(74), summary(73)],
        newIds: [76],
      },
    });

    expect(after.selectedId).toBe("saved-74");
    expect(after.saved.map((r) => r.id)).toEqual([76, 75, 74, 73]);
    expect(after.arrived?.map((r) => r.id)).toEqual([76]);
  });

  it("U1-05 poll 결과가 미리보기를 지우거나 저장으로 바꾸지 않는다", () => {
    const before = loadedState();

    const after = requestInboxReducer(before, {
      type: "poll",
      update: {
        type: "loaded",
        saved: [summary(76), summary(75), summary(74), summary(73)],
        newIds: [76],
      },
    });

    // 미리보기는 건드리지 않는다 — 배열 자체가 그대로다.
    expect(after.previews).toBe(before.previews);
    expect(after.previews[0].id).toBe("preview-1");
    expect(after.saved.some((row) => String(row.id) === "preview-1")).toBe(false);
  });

  it("U1-06 poll이 실패해도 목록·미리보기·선택을 유지한다", () => {
    const before = loadedState();

    const after = requestInboxReducer(before, {
      type: "poll",
      update: { type: "failed", error: "연결 실패", hasLoaded: true },
    });

    expect(after.saved).toBe(before.saved);
    expect(after.previews).toBe(before.previews);
    expect(after.selectedId).toBe("saved-74");
    // 전체 화면 오류로 바꾸지 않는다 — 조용한 상태 표시만 켠다.
    expect(after.listError).toBeNull();
    expect(after.connectionLost).toBe(true);
  });

  it("U1-07 backend가 살아나면 연결 표시를 끄고 신규 접수를 반영한다", () => {
    const offline = requestInboxReducer(loadedState(), {
      type: "poll",
      update: { type: "failed", error: "연결 실패", hasLoaded: true },
    });

    const recovered = requestInboxReducer(offline, {
      type: "poll",
      update: {
        type: "loaded",
        saved: [summary(76), summary(75), summary(74), summary(73)],
        newIds: [76],
      },
    });

    expect(recovered.connectionLost).toBe(false);
    expect(recovered.saved.map((r) => r.id)).toContain(76);
    expect(recovered.arrived?.map((r) => r.id)).toEqual([76]);
  });

  it("첫 조회부터 실패하면 기존 오류 안내를 그대로 쓴다", () => {
    const after = requestInboxReducer(initialRequestInboxState, {
      type: "poll",
      update: {
        type: "failed",
        error: "요청 목록을 불러오지 못했습니다.",
        hasLoaded: false,
      },
    });

    expect(after.listError).toBe("요청 목록을 불러오지 못했습니다.");
    expect(after.connectionLost).toBe(false);
    expect(after.listLoading).toBe(false);
  });

  it("바뀐 게 없으면 state를 새로 만들지 않는다", () => {
    const before = loadedState();
    const after = requestInboxReducer(before, {
      type: "poll",
      update: { type: "unchanged" },
    });

    expect(after).toBe(before);
  });
});

describe("describeNewArrival", () => {
  it("channel이 모두 전화일 때만 전화 접수라고 쓴다", () => {
    expect(describeNewArrival([summary(76)])).toBe(
      "새 전화 접수가 도착했습니다",
    );
    expect(describeNewArrival([summary(76, { channel: "웹" })])).toBe(
      "새 요청이 도착했습니다",
    );
    expect(describeNewArrival([summary(76), summary(77, { channel: null })])).toBe(
      "새 요청 2건이 도착했습니다",
    );
    expect(describeNewArrival([])).toBeNull();
  });
});
