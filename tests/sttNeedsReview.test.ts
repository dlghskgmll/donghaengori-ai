import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestTranscription } from "../components/VoiceInput";
import type { SavedIntakeSummary } from "../lib/ai/savedIntakeView";
import {
  getSttReviewMessage,
  STT_REVIEW_MESSAGE,
} from "../lib/ui/sttReview";
import {
  initialRequestInboxState,
  requestInboxReducer,
  type PreviewRecord,
} from "../lib/ui/requestInbox";

const composerSource = readFileSync(
  new URL("../components/design/IntakeComposer.tsx", import.meta.url),
  "utf8",
);
const voiceSource = readFileSync(
  new URL("../components/VoiceInput.tsx", import.meta.url),
  "utf8",
);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("U4 STT needs_review UX", () => {
  it("U4-01 needs_review=true만 사람 검토 warning 문구를 만든다", () => {
    expect(getSttReviewMessage(true)).toBe(STT_REVIEW_MESSAGE);
    expect(STT_REVIEW_MESSAGE).toContain("병원명·이름·날짜·시간");
  });

  it("U4-02 needs_review=false에는 성공 UX 외 경고를 추가하지 않는다", () => {
    expect(getSttReviewMessage(false)).toBeNull();
    expect(getSttReviewMessage(null)).toBeNull();
  });

  it("U4-03 transcript textarea는 controlled edit 상태를 유지한다", () => {
    expect(composerSource).toMatch(/<textarea[\s\S]*?value=\{values\.transcript\}/);
    expect(composerSource).toMatch(/onChange=\{\(event\) =>[\s\S]*?event\.target\.value/);
    expect(composerSource).not.toMatch(/<textarea[\s\S]*?readOnly/);
  });

  it("U4-04 STT 완료 handler는 onAnalyze를 호출하지 않는다", () => {
    const handler = composerSource.slice(
      composerSource.indexOf("const handleTranscript"),
      composerSource.indexOf("return ("),
    );
    expect(handler).toContain("setValues");
    expect(handler).not.toContain("onAnalyze(");
  });

  it("U4-05 Team이 반환한 transcript 문구를 자동 보정하지 않는다", async () => {
    const returned = "순천 OO병원인지 잘 모르겠고 모레 10시쯤이요";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          transcript: returned,
          provider_used: "team",
          model: "faster-whisper",
          latency_ms: 31,
          needs_review: true,
        }),
      ),
    );

    const result = await requestTranscription(
      new Blob([new Uint8Array([1])], { type: "audio/webm" }),
      "audio/webm",
    );

    expect(result).toEqual({ transcript: returned, needsReview: true });
  });

  it("U4-06 사용자의 textarea 수정값을 그대로 local draft에 넣는다", () => {
    expect(composerSource).toContain("transcript: event.target.value");
    expect(composerSource).not.toContain("event.target.value.replace");
  });

  it("U4-07 기존 MediaRecorder → STT → callback 흐름을 유지한다", () => {
    expect(voiceSource).toContain("new VoiceRecorderController");
    expect(voiceSource).toContain('fetch("/api/v1/transcriptions"');
    expect(voiceSource).toContain("onTranscriptRef.current(result.transcript)");
  });

  it("U4-08 STT 검토 UX와 무관하게 polling은 preview·selection을 보존한다", () => {
    const preview = { id: "preview-u4" } as PreviewRecord;
    const saved = {
      id: 91,
      target: "대상자 확인 필요",
      hospital: null,
      hospitalStatus: "NEEDS_CONFIRMATION",
      channel: "전화",
      status: "접수 대기",
      createdAt: "2026-08-17 09:00",
      appointmentDate: "2026-08-18",
      confirmed: false,
      urgent: false,
      urgentConfidence: null,
      needsConfirmation: true,
    } satisfies SavedIntakeSummary;
    const state = {
      ...initialRequestInboxState,
      previews: [preview],
      selectedId: preview.id,
    };

    const next = requestInboxReducer(state, {
      type: "poll",
      update: { type: "loaded", saved: [saved], newIds: [saved.id] },
    });

    expect(next.previews).toEqual([preview]);
    expect(next.selectedId).toBe(preview.id);
  });
});
