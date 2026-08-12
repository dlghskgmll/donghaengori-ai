import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeIntakeRequest } from "../lib/ai/analyzeIntake";
import { TranscriptionError } from "../lib/ai/transcribe";
import {
  CLAWOPS_GREETING,
  CLAWOPS_MESSAGES,
  analysisNeedsFollowUp,
  buildClawOpsGreetingVoiceML,
  computeClawOpsSignature,
  escapeXml,
  normalizeCallerPhone,
  resolveCallerLookupPhone,
  verifyClawOpsSignature,
} from "../lib/phone/clawops";

const routeDownloadMock = vi.hoisted(() => vi.fn());
const routeTranscribeMock = vi.hoisted(() => vi.fn());
const routeAnalyzeMock = vi.hoisted(() => vi.fn());
const useRealAnalyze = vi.hoisted(() => ({ current: false }));
// after() 대체 테스트 훅: schedule된 background task를 모아 두고
// flushBackground()로 임의 시점에 실행한다.
const backgroundTasks = vi.hoisted(() => [] as Array<() => Promise<void>>);

vi.mock("@/lib/phone/backgroundTask", () => ({
  runAfterResponse: (task: () => Promise<void>) => {
    backgroundTasks.push(task);
  },
}));

vi.mock("@/lib/phone/recordingIntake", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../lib/phone/recordingIntake")>();
  const store = new actual.InMemoryProcessedCallStore();
  return {
    ...actual,
    defaultPhoneRecordingIntakeDeps: () => ({
      downloadRecording: routeDownloadMock,
      transcribe: routeTranscribeMock,
      analyze: (useRealAnalyze.current
        ? analyzeIntakeRequest
        : routeAnalyzeMock) as typeof analyzeIntakeRequest,
      store,
    }),
  };
});

const { POST: incomingPost } = await import("../app/api/v1/phone/incoming/route");
const { POST: recordingCompletePost } = await import(
  "../app/api/v1/phone/recording-complete/route"
);
const { POST: statusPost } = await import("../app/api/v1/phone/status/route");

const SECRET = "clawops-test-signing-key";
const BASE_URL = "https://donghaeng.example.com";

async function flushBackground() {
  const tasks = backgroundTasks.splice(0, backgroundTasks.length);
  for (const task of tasks) {
    await task();
  }
}

function signedFormRequest(
  path: string,
  fields: Record<string, string>,
  options: { signature?: string | null; contentType?: string } = {},
) {
  const rawBody = new URLSearchParams(fields).toString();
  const signature =
    options.signature === undefined
      ? computeClawOpsSignature(SECRET, `${BASE_URL}${path}`, fields)
      : options.signature;
  const headers: Record<string, string> = {
    "Content-Type":
      options.contentType ?? "application/x-www-form-urlencoded",
  };
  if (signature !== null) headers["X-Signature"] = signature;
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers,
    body: rawBody,
  });
}

let callCounter = 0;
function uniqueCallId() {
  callCounter += 1;
  return `CA-clawops-${callCounter}`;
}

function incomingFields(overrides: Record<string, string> = {}) {
  return {
    CallId: uniqueCallId(),
    AccountId: "AC-TEST",
    From: "+821011111111",
    To: "07012345678",
    CallStatus: "ringing",
    Direction: "inbound",
    ...overrides,
  };
}

function recordingFields(overrides: Record<string, string> = {}) {
  return {
    CallId: uniqueCallId(),
    AccountId: "AC-TEST",
    From: "+821011111111",
    To: "07012345678",
    RecordingUrl: "https://recordings.clawops.example.com/rec-1.mp3",
    RecordingDuration: "8",
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv("PHONE_PROVIDER", "clawops");
  vi.stubEnv("PHONE_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("APP_BASE_URL", BASE_URL);
  vi.stubEnv("AI_PROVIDER", "mock");
  useRealAnalyze.current = false;
  routeDownloadMock.mockResolvedValue({
    data: new Blob([new Uint8Array(2048).fill(7)], { type: "audio/mpeg" }),
    mimeType: "audio/mpeg",
  });
  routeTranscribeMock.mockResolvedValue({
    transcript: "안녕하세요 김영자인데 내일 오전 10시에 순천가상병원 정형외과에 가려고요.",
    provider_used: "openai",
    model: "test",
  });
  routeAnalyzeMock.mockResolvedValue({
    intake_id: "PHONE-TEST",
    status: "DRAFT_AI",
    analysis: { human_review_required: true },
    meta: { provider_used: "mock" },
  });
});

afterEach(() => {
  backgroundTasks.length = 0;
  vi.unstubAllEnvs();
  routeDownloadMock.mockReset();
  routeTranscribeMock.mockReset();
  routeAnalyzeMock.mockReset();
});

describe("ClawOps incoming call", () => {
  it("CASE 45: 유효한 form-urlencoded inbound는 Say+Record VoiceML을 반환한다", async () => {
    const response = await incomingPost(
      signedFormRequest("/api/v1/phone/incoming", incomingFields()),
    );
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/xml; charset=utf-8",
    );
    expect(xml).toContain("<Response>");
    expect(xml).toContain('<Say language="ko-KR">');
    expect(xml).toContain(CLAWOPS_GREETING);
    expect(xml).toContain(
      `<Record action="${BASE_URL}/api/v1/phone/recording-complete"`,
    );
    expect(xml).toContain('maxLength="30"');
    expect(xml).toContain('finishOnKey="#"');
    expect(xml).toContain('playBeep="false"');
  });

  it("CASE 46: 공식 서명 알고리즘 vector로 verification이 통과한다", async () => {
    // 알고리즘을 독립적으로 손으로 재구성한 vector:
    // data = url + (key 알파벳순으로 key+value 연결) → HMAC-SHA256 → Base64
    const url = "https://mycompany.com/myendpoint";
    const params = { CallStatus: "completed", CallId: "CA123" };
    const data = `${url}CallIdCA123CallStatuscompleted`;
    const expected = createHmac("sha256", "my-signing-key")
      .update(data)
      .digest("base64");

    expect(
      verifyClawOpsSignature({
        signingSecret: "my-signing-key",
        url,
        params,
        signature: expected,
      }),
    ).toBe(true);
    expect(
      verifyClawOpsSignature({
        signingSecret: "my-signing-key",
        url,
        params: { ...params, CallStatus: "failed" },
        signature: expected,
      }),
    ).toBe(false);
    expect(computeClawOpsSignature("my-signing-key", url, params)).toBe(expected);
  });

  it("CASE 47: 잘못된 X-Signature는 401이며 VoiceML/AI/background를 만들지 않는다", async () => {
    const response = await incomingPost(
      signedFormRequest("/api/v1/phone/incoming", incomingFields(), {
        signature: "invalid-signature==",
      }),
    );
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(401);
    expect(JSON.stringify(payload)).not.toContain("<Response>");
    expect(routeDownloadMock).not.toHaveBeenCalled();
    expect(routeAnalyzeMock).not.toHaveBeenCalled();
    expect(backgroundTasks).toHaveLength(0);
  });

  it("CASE 48: APP_BASE_URL 미설정이면 Record XML 없이 안전한 설정 오류를 반환한다", async () => {
    vi.stubEnv("APP_BASE_URL", "");
    const response = await incomingPost(
      signedFormRequest("/api/v1/phone/incoming", incomingFields()),
    );
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).not.toContain("<Record");
    expect(body).not.toContain("undefined");
  });

  it("CASE 49: 동적 값은 XML escape되어 injection이 불가능하다", () => {
    expect(escapeXml(`<Hangup/>&"'`)).toBe(
      "&lt;Hangup/&gt;&amp;&quot;&apos;",
    );
    const xml = buildClawOpsGreetingVoiceML({
      actionUrl: "https://x.example.com/cb?a=1&b=2",
      greeting: '위험한 <Say> 태그 & "인용"',
    });
    expect(xml).toContain("&lt;Say&gt;");
    expect(xml).toContain("&amp;");
    expect(xml).toContain("a=1&amp;b=2");
    expect(xml).not.toContain('<Say language="ko-KR">위험한 <Say>');
  });

  it("CASE 47-보강: AccountId가 설정과 다르면 403으로 거절한다", async () => {
    vi.stubEnv("CLAWOPS_ACCOUNT_ID", "AC-REAL");
    const response = await incomingPost(
      signedFormRequest(
        "/api/v1/phone/incoming",
        incomingFields({ AccountId: "AC-ATTACKER" }),
      ),
    );
    expect(response.status).toBe(403);
  });

  it("보안: form이 아닌 content-type과 malformed body는 400이며 background가 없다", async () => {
    const wrongType = await incomingPost(
      signedFormRequest("/api/v1/phone/incoming", incomingFields(), {
        contentType: "application/json",
      }),
    );
    expect(wrongType.status).toBe(400);

    const missingCallId = await incomingPost(
      signedFormRequest("/api/v1/phone/incoming", {
        From: "+821011111111",
      }),
    );
    expect(missingCallId.status).toBe(400);
    expect(backgroundTasks).toHaveLength(0);
  });

  it("보안: 과대 webhook body는 413으로 거절한다", async () => {
    const fields = incomingFields({ Padding: "x".repeat(70 * 1024) });
    const response = await incomingPost(
      signedFormRequest("/api/v1/phone/incoming", fields),
    );
    expect(response.status).toBe(413);
  });
});

describe("ClawOps caller identity policy", () => {
  it("CASE 50: From을 국내 표기로 정규화해 candidate lookup key로 만든다", () => {
    expect(normalizeCallerPhone("+821011111111")).toBe("010-1111-1111");
    expect(normalizeCallerPhone("821011111111")).toBe("010-1111-1111");
    expect(normalizeCallerPhone("01011111111")).toBe("010-1111-1111");
    expect(normalizeCallerPhone("010-1111-1111")).toBe("010-1111-1111");
    expect(normalizeCallerPhone("0611234567")).toBe("061-123-4567");
    expect(normalizeCallerPhone("")).toBe("");
    expect(normalizeCallerPhone("anonymous")).toBe("");
  });

  it("CASE 50-보강: From이 정규화되어 background 분석 입력으로 전달된다", async () => {
    const response = await recordingCompletePost(
      signedFormRequest(
        "/api/v1/phone/recording-complete",
        recordingFields({ From: "+821011111111" }),
      ),
    );
    expect(response.status).toBe(200);
    await flushBackground();

    expect(routeAnalyzeMock).toHaveBeenCalledTimes(1);
    const [input] = routeAnalyzeMock.mock.calls[0] as [
      { caller_phone: string },
    ];
    expect(input.caller_phone).toBe("010-1111-1111");
  });

  it("CASE 51: 알려진 발신번호도 candidate일 뿐 확정 신원이 아니다", async () => {
    const result = await analyzeIntakeRequest(
      { caller_phone: "010-1111-1111", transcript: "나 모레 저번에 무릎 봐준 데 가야겄어." },
      { intakeId: "TEST-CASE-51" },
    );
    expect(result.analysis.caller.person_candidates.length).toBeGreaterThan(0);
    expect(result.analysis.caller.identity_status).toBe("CANDIDATE");
    expect(result.analysis.human_review_required).toBe(true);
  });

  it("CASE 52: 모르는 발신번호는 환자를 만들어내지 않고 generic flow를 유지한다", async () => {
    const result = await analyzeIntakeRequest(
      { caller_phone: "010-0000-0000", transcript: "내일 병원 좀 같이 가줘." },
      { intakeId: "TEST-CASE-52" },
    );
    expect(result.analysis.caller.person_candidates).toEqual([]);
    expect(result.analysis.caller.identity_status).toBe("UNKNOWN");
    expect(result.analysis.hospital.candidates).toEqual([]);
  });

  it("DEMO 매핑: env 설정 시에만 발신번호를 fixture 조회번호로 치환한다", async () => {
    expect(await resolveCallerLookupPhone("010-9999-8888")).toBe(
      "010-9999-8888",
    );

    vi.stubEnv("DEMO_CALLER_PHONE", "+821099998888");
    vi.stubEnv("DEMO_CALLER_PATIENT_ID", "P001");
    expect(await resolveCallerLookupPhone("010-9999-8888")).toBe(
      "010-1111-1111",
    );
    expect(await resolveCallerLookupPhone("010-7777-6666")).toBe(
      "010-7777-6666",
    );
  });
});

describe("ClawOps recording callback — fast phone path (Phase 4C-1)", () => {
  it("CASE 58: AI promise가 미해결이어도 즉시 Say+Hangup XML을 반환한다", async () => {
    // 절대 resolve되지 않는 STT promise — 응답이 AI와 분리되어 있음을 증명.
    routeTranscribeMock.mockImplementation(
      () => new Promise(() => {}),
    );

    const response = await recordingCompletePost(
      signedFormRequest("/api/v1/phone/recording-complete", recordingFields()),
    );
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/xml; charset=utf-8",
    );
    expect(xml).toContain(CLAWOPS_MESSAGES.accepted);
    expect(xml).toContain("<Hangup/>");
    // AI는 아직 시작조차 하지 않았고 background에 1건만 예약되어 있다.
    expect(routeDownloadMock).not.toHaveBeenCalled();
    expect(routeTranscribeMock).not.toHaveBeenCalled();
    expect(backgroundTasks).toHaveLength(1);
  });

  it("CASE 59: 응답 이후 background에서 기존 downloader→STT→Analyze가 실행된다", async () => {
    const order: string[] = [];
    routeDownloadMock.mockImplementation(async () => {
      order.push("download");
      return {
        data: new Blob([new Uint8Array(2048).fill(7)], { type: "audio/mpeg" }),
        mimeType: "audio/mpeg",
      };
    });
    routeTranscribeMock.mockImplementation(async () => {
      order.push("transcribe");
      return { transcript: "내일 병원 가려고요", provider_used: "openai", model: "t" };
    });
    routeAnalyzeMock.mockImplementation(async () => {
      order.push("analyze");
      return {
        intake_id: "X",
        status: "DRAFT_AI",
        analysis: { human_review_required: true },
        meta: {},
      };
    });

    const response = await recordingCompletePost(
      signedFormRequest("/api/v1/phone/recording-complete", recordingFields()),
    );
    expect(response.status).toBe(200);
    expect(order).toEqual([]);

    await flushBackground();
    expect(order).toEqual(["download", "transcribe", "analyze"]);
  });

  it("CASE 60: background AI 실패는 통화 응답에 영향이 없고 안전하게만 로그된다", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const secretUrl = "https://recordings.clawops.example.com/secret-rec.mp3";
    routeTranscribeMock.mockRejectedValueOnce(
      new TranscriptionError("STT_PROVIDER_FAILED", "음성 변환 호출에 실패했습니다.", {
        cause: new Error("OpenAI raw error sk-FAKE123 stack trace"),
      }),
    );

    const response = await recordingCompletePost(
      signedFormRequest(
        "/api/v1/phone/recording-complete",
        recordingFields({ From: "+821055554444", RecordingUrl: secretUrl }),
      ),
    );
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(xml).toContain(CLAWOPS_MESSAGES.accepted);
    expect(xml).not.toMatch(/sk-|stack|OpenAI/);

    await flushBackground();

    const logged = errorSpy.mock.calls
      .map((args) => JSON.stringify(args))
      .join(" ");
    expect(logged).toContain("STT_PROVIDER_FAILED");
    expect(logged).not.toContain("5555");
    expect(logged).not.toContain("secret-rec");
    expect(logged).not.toContain("sk-FAKE123");
    expect(logged).not.toContain(SECRET);
    errorSpy.mockRestore();
  });

  it("CASE 61: RecordingDuration 0은 background 없이 무발화 안내로 종료한다", async () => {
    const response = await recordingCompletePost(
      signedFormRequest(
        "/api/v1/phone/recording-complete",
        recordingFields({ RecordingDuration: "0" }),
      ),
    );
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(xml).toContain(CLAWOPS_MESSAGES.noSpeech);
    expect(xml).toContain("<Hangup/>");
    expect(backgroundTasks).toHaveLength(0);
    expect(routeDownloadMock).not.toHaveBeenCalled();
    expect(routeTranscribeMock).not.toHaveBeenCalled();
    expect(routeAnalyzeMock).not.toHaveBeenCalled();
  });

  it("CASE 62: 중복 callback은 background가 여러 번 예약돼도 분석은 1회만 실행한다", async () => {
    const fields = recordingFields();
    const first = await recordingCompletePost(
      signedFormRequest("/api/v1/phone/recording-complete", fields),
    );
    const second = await recordingCompletePost(
      signedFormRequest("/api/v1/phone/recording-complete", fields),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(backgroundTasks).toHaveLength(2);

    await flushBackground();
    expect(routeAnalyzeMock).toHaveBeenCalledTimes(1);
    expect(routeDownloadMock).toHaveBeenCalledTimes(1);
  });

  it("CASE 65: 모호한 발화도 background 분석에서 기존 safety semantics를 유지한다", async () => {
    useRealAnalyze.current = true;
    routeTranscribeMock.mockResolvedValue({
      transcript: "나 모레 저번에 무릎 봐준 데 가야겄어.",
      provider_used: "openai",
      model: "test",
    });

    const response = await recordingCompletePost(
      signedFormRequest(
        "/api/v1/phone/recording-complete",
        recordingFields({ From: "+821011111111" }),
      ),
    );
    expect(response.status).toBe(200);
    await flushBackground();

    // 동일 입력에 대한 파이프라인 결과로 safety invariant를 검증한다.
    const result = await analyzeIntakeRequest(
      { caller_phone: "010-1111-1111", transcript: "나 모레 저번에 무릎 봐준 데 가야겄어." },
      { intakeId: "TEST-CASE-65" },
    );
    expect(result.analysis.hospital.candidates[0]).toMatchObject({
      status: "INFERRED",
    });
    expect(result.analysis.human_review_required).toBe(true);
    expect(result.analysis.safety.medical_judgement).toBe(false);
    expect(analysisNeedsFollowUp(result.analysis)).toBe(true);
  });

  it("Phase 3C 정책 유지: 복수 시간 발화는 시간을 확정하지 않는다", async () => {
    const result = await analyzeIntakeRequest(
      { caller_phone: "", transcript: "10시에 진료 보고 9시에 출발해요" },
      { intakeId: "TEST-CASE-57-REGRESSION" },
    );
    expect(result.analysis.appointment.time).toMatchObject({
      value: null,
      status: "NEEDS_CONFIRMATION",
    });
  });

  it("보안: 즉시 응답 TTS에 확정 표현이 없다", async () => {
    const response = await recordingCompletePost(
      signedFormRequest("/api/v1/phone/recording-complete", recordingFields()),
    );
    const xml = await response.text();

    expect(response.status).toBe(200);
    for (const banned of ["완료되었습니다", "확정"]) {
      expect(xml).not.toContain(banned);
    }
  });

  it("보안: 잘못된 서명의 recording callback은 background를 예약하지 않는다", async () => {
    const response = await recordingCompletePost(
      signedFormRequest(
        "/api/v1/phone/recording-complete",
        recordingFields(),
        { signature: "bad==" },
      ),
    );
    expect(response.status).toBe(401);
    expect(backgroundTasks).toHaveLength(0);
    expect(routeDownloadMock).not.toHaveBeenCalled();
  });

  it("보안: 안전하지 않은 RecordingUrl은 background 없이 안내로 종료한다", async () => {
    for (const recordingUrl of [
      "http://recordings.example.com/a.mp3",
      "https://127.0.0.1/a.mp3",
      "https://[::ffff:127.0.0.1]/a.mp3",
    ]) {
      const response = await recordingCompletePost(
        signedFormRequest(
          "/api/v1/phone/recording-complete",
          recordingFields({ RecordingUrl: recordingUrl }),
        ),
      );
      const xml = await response.text();
      expect(response.status, recordingUrl).toBe(200);
      expect(xml, recordingUrl).toContain(CLAWOPS_MESSAGES.failure);
    }
    expect(backgroundTasks).toHaveLength(0);
    expect(routeDownloadMock).not.toHaveBeenCalled();
  });

  it("보안: 로그에 발신번호·RecordingUrl·transcript·secret을 남기지 않는다", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    routeTranscribeMock.mockResolvedValueOnce({
      transcript: "민감한 통화 원문",
      provider_used: "openai",
      model: "test",
    });
    routeAnalyzeMock.mockRejectedValueOnce(new Error("boom"));

    await recordingCompletePost(
      signedFormRequest(
        "/api/v1/phone/recording-complete",
        recordingFields({
          From: "+821055554444",
          RecordingUrl: "https://recordings.clawops.example.com/secret-rec.mp3",
        }),
      ),
    );
    await flushBackground();
    await statusPost(
      signedFormRequest("/api/v1/phone/status", {
        CallId: uniqueCallId(),
        CallStatus: "failed",
        From: "+821055554444",
      }),
    );

    const logged = [
      ...errorSpy.mock.calls,
      ...infoSpy.mock.calls,
      ...warnSpy.mock.calls,
    ]
      .map((args) => JSON.stringify(args))
      .join(" ");
    expect(logged).not.toContain("5555");
    expect(logged).not.toContain("secret-rec");
    expect(logged).not.toContain("민감한 통화 원문");
    expect(logged).not.toContain(SECRET);

    errorSpy.mockRestore();
    infoSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

describe("ClawOps status callback", () => {
  it("CASE 63: 실통화에서 확인된 in-progress 상태를 answered로 수용한다", async () => {
    const response = await statusPost(
      signedFormRequest("/api/v1/phone/status", {
        CallId: uniqueCallId(),
        CallStatus: "in-progress",
      }),
    );
    const payload = (await response.json()) as { status?: string };

    expect(response.status).toBe(200);
    expect(payload.status).toBe("answered");
  });

  it("CASE 64: 기존 문서 상태들의 매핑 regression PASS", async () => {
    const cases: Array<[string, string]> = [
      ["initiated", "ringing"],
      ["ringing", "ringing"],
      ["answered", "answered"],
      ["completed", "completed"],
      ["busy", "busy"],
      ["failed", "failed"],
      ["rejected", "failed"],
    ];
    for (const [raw, mapped] of cases) {
      const response = await statusPost(
        signedFormRequest("/api/v1/phone/status", {
          CallId: uniqueCallId(),
          CallStatus: raw,
        }),
      );
      const payload = (await response.json()) as { status?: string };
      expect(response.status, raw).toBe(200);
      expect(payload.status, raw).toBe(mapped);
    }

    const unknown = await statusPost(
      signedFormRequest("/api/v1/phone/status", {
        CallId: uniqueCallId(),
        CallStatus: "teleported",
      }),
    );
    expect(unknown.status).toBe(400);
  });
});
