import Image from "next/image";
import Link from "next/link";
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_HREF } from "@/lib/guardian/constants";
import { ArrowRightIcon, PersonCheckIcon, PhoneIcon } from "@/components/guardian/ui/Icons";

const WAVE_HEIGHTS = [10, 16, 22, 14, 24, 18, 10, 20, 24, 14, 18, 10];

const UNDERSTAND_ROWS = [
  { quote: "“모레”", result: "8월 19일" },
  { quote: "“저번에 무릎 봐준 데”", result: "지난 동행 기록 · 정형외과" },
  { quote: "“가야겄어”", result: "병원동행 요청" },
];

const CARD_ROWS = [
  ["어르신", "김영자"],
  ["방문일", "8월 19일"],
  ["병원", "성가롤로병원"],
  ["진료과", "정형외과"],
  ["요청", "병원동행"],
];

const cardBox: React.CSSProperties = {
  flex: 1,
  background: "var(--cream)",
  border: "1.5px solid var(--line)",
  borderRadius: 24,
  padding: 20,
  display: "flex",
  flexDirection: "column",
};

const stepLabel: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  color: "var(--orange-ink)",
  letterSpacing: ".05em",
};

export function AiPhoneSection() {
  return (
    <section style={{ background: "#fff", borderTop: "1px solid var(--line)", padding: "76px 0 80px" }}>
      <div className="wrap">
        <div style={{ maxWidth: 640 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "var(--peach)",
              borderRadius: 999,
              padding: "7px 16px",
              fontSize: 13,
              fontWeight: 700,
              color: "var(--orange-ink)",
            }}
          >
            <PhoneIcon />
            AI 전화 신청
          </div>
          <h2 style={{ margin: "18px 0 0", fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.28 }}>
            전화 한 통이면,
            <br />
            동행 신청이 시작돼요.
          </h2>
          <p style={{ margin: "14px 0 0", fontSize: 16, lineHeight: 1.65, color: "var(--text-muted)", textWrap: "pretty" }}>
            익숙한 말 그대로 이야기하세요.
            <br />
            동행고리AI가 필요한 내용을 듣고 정리해드려요.
          </p>
        </div>

        <div className="ai-grid" style={{ marginTop: 44 }}>
          {/* STEP 01 */}
          <div style={{ animation: "fadeUp .6s ease .05s both", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={stepLabel}>STEP 01 · 평소처럼 말해요</div>
            <div style={cardBox}>
              <div
                style={{
                  background: "#fff",
                  border: "1.5px solid var(--line-strong)",
                  borderRadius: 26,
                  padding: "24px 18px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  textAlign: "center",
                  gap: 14,
                }}
              >
                <Image src="/guardian/logo.png" alt="" width={34} height={38} style={{ objectFit: "contain" }} />
                <div>
                  <div style={{ fontSize: 16, fontWeight: 750 }}>동행고리AI</div>
                  <div style={{ fontSize: 13, color: "var(--text-faint)", marginTop: 2 }}>통화 중 · 00:12</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 3, height: 26 }} aria-hidden="true">
                  {WAVE_HEIGHTS.map((height, index) => (
                    <span
                      key={index}
                      style={{
                        width: 4,
                        height,
                        borderRadius: 2,
                        background: "var(--orange)",
                        animation: `wv 1.1s ease-in-out ${index * 0.08}s infinite`,
                      }}
                    />
                  ))}
                </div>
                <div style={{ background: "#FFF3E9", borderRadius: 16, padding: "14px 16px", fontSize: 16, fontWeight: 600, lineHeight: 1.5 }}>
                  “나 모레 저번에
                  <br />
                  무릎 봐준 데 가야겄어.”
                </div>
              </div>
              <p style={{ margin: "16px 0 0", fontSize: 14, lineHeight: 1.6, color: "var(--text-muted)", textWrap: "pretty" }}>
                익숙한 전화로, 평소 말하듯 이야기하면 돼요. 앱 설치나 복잡한 입력은 필요하지 않아요.
              </p>
            </div>
          </div>

          {/* STEP 02 + 03 */}
          <div style={{ animation: "fadeUp .6s ease .2s both", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={stepLabel}>STEP 02 · 말의 맥락을 이해해요</div>
            <div style={{ ...cardBox, gap: 10 }}>
              {UNDERSTAND_ROWS.map((row) => (
                <div
                  key={row.quote}
                  style={{
                    background: "#fff",
                    border: "1.5px solid var(--line-strong)",
                    borderRadius: 14,
                    padding: "12px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ background: "#FFF3E9", borderRadius: 8, padding: "4px 10px", fontSize: 14, fontWeight: 700, color: "var(--orange-ink)" }}>
                    {row.quote}
                  </span>
                  <ArrowRightIcon />
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{row.result}</span>
                </div>
              ))}
              <p style={{ margin: "2px 0 0", fontSize: 13.5, lineHeight: 1.6, color: "var(--text-muted)" }}>
                단어만 받아 적지 않아요. 지난 동행 정보와 대화의 맥락을 함께 살펴봐요.
              </p>
              <div style={{ borderTop: "1.5px dashed var(--line-dash)", paddingTop: 14, marginTop: 4 }}>
                <div style={stepLabel}>STEP 03 · 모르는 내용만 다시 확인해요</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                  <div style={{ alignSelf: "flex-start", maxWidth: "88%", background: "#fff", border: "1.5px solid var(--line-strong)", borderRadius: "14px 14px 14px 4px", padding: "10px 14px", fontSize: 14, lineHeight: 1.5 }}>
                    지난번에 방문하셨던 정형외과 말씀하시는 게 맞을까요?
                  </div>
                  <div style={{ alignSelf: "flex-end", background: "var(--orange)", color: "#fff", borderRadius: "14px 14px 4px 14px", padding: "10px 14px", fontSize: 14, fontWeight: 600 }}>
                    응, 거기.
                  </div>
                  <div style={{ alignSelf: "flex-start", maxWidth: "88%", background: "#fff", border: "1.5px solid var(--line-strong)", borderRadius: "14px 14px 14px 4px", padding: "10px 14px", fontSize: 14, lineHeight: 1.5 }}>
                    알겠습니다. 몇 시까지 병원에 가셔야 하나요?
                  </div>
                </div>
                <p style={{ margin: "12px 0 0", fontSize: 13.5, lineHeight: 1.6, color: "var(--text-muted)" }}>
                  확실하지 않은 정보는 임의로 결정하지 않고, 필요한 내용만 다시 확인해요.
                </p>
              </div>
            </div>
          </div>

          {/* STEP 04 */}
          <div style={{ animation: "fadeUp .6s ease .35s both", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={stepLabel}>STEP 04 · 접수 정보로 정리돼요</div>
            <div style={cardBox}>
              <div style={{ background: "#fff", border: "1.5px solid var(--line-strong)", borderRadius: 18, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: "1.5px solid var(--row-line)" }}>
                  <span style={{ fontSize: 16, fontWeight: 750 }}>병원동행 요청</span>
                  <span style={{ background: "var(--peach)", color: "var(--orange-ink)", borderRadius: 999, padding: "4px 12px", fontSize: 12, fontWeight: 800 }}>
                    새 요청
                  </span>
                </div>
                <div style={{ padding: "6px 18px 14px", display: "flex", flexDirection: "column" }}>
                  {CARD_ROWS.map(([label, value]) => (
                    <div key={label} style={{ display: "flex", gap: 12, padding: "9px 0", borderBottom: "1px solid #F8F2E8" }}>
                      <span style={{ flex: "0 0 76px", fontSize: 13, color: "var(--text-faint)" }}>{label}</span>
                      <span style={{ fontSize: 14.5, fontWeight: 650 }}>{value}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 12, padding: "10px 0", alignItems: "center" }}>
                    <span style={{ flex: "0 0 76px", fontSize: 13, color: "var(--text-faint)" }}>확인 필요</span>
                    <span style={{ background: "#FFF3D6", color: "#8A6400", borderRadius: 999, padding: "4px 12px", fontSize: 12.5, fontWeight: 750 }}>
                      예약시간
                    </span>
                  </div>
                </div>
              </div>
              <p style={{ margin: "16px 0 0", fontSize: 14, lineHeight: 1.6, color: "var(--text-muted)" }}>
                통화가 끝나면 필요한 정보가 자동으로 정리됩니다.
              </p>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 36, background: "var(--butter)", borderRadius: 22, padding: "26px 24px", display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--orange)", flex: "none" }}>
            <PersonCheckIcon size={24} />
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <h3 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>마지막 확인은 담당자가 해요.</h3>
            <p style={{ margin: "8px 0 0", fontSize: 15, lineHeight: 1.6, color: "var(--text-muted)", textWrap: "pretty" }}>
              AI가 정리한 내용을 담당 사회복지사가 확인한 뒤 병원동행 일정이 확정됩니다.
            </p>
          </div>
        </div>

        <div style={{ marginTop: 30, display: "flex", flexWrap: "wrap", gap: 16 }}>
          <div style={{ flex: 1, minWidth: 200, borderTop: "2px solid var(--ink)", paddingTop: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 750 }}>어르신</div>
            <p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.55, color: "var(--text-muted)" }}>
              익숙한 전화로 이야기해요
              <br />
              <a href={SUPPORT_PHONE_HREF} style={{ color: "var(--orange-ink)", fontWeight: 700 }}>
                {SUPPORT_PHONE_DISPLAY}
              </a>
            </p>
          </div>
          <div style={{ flex: 1, minWidth: 200, borderTop: "2px solid var(--ink)", paddingTop: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 750 }}>보호자</div>
            <p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.55, color: "var(--text-muted)" }}>
              웹에서 신청하고
              <br />
              진행 상황을 확인해요
            </p>
          </div>
          <div style={{ flex: 1, minWidth: 200, borderTop: "2px solid var(--ink)", paddingTop: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 750 }}>담당자</div>
            <p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.55, color: "var(--text-muted)" }}>
              내용을 확인하고
              <br />
              일정을 확정해요
            </p>
          </div>
        </div>

        <div style={{ marginTop: 34, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <span style={{ fontSize: 15, color: "var(--text-muted)" }}>직접 입력이 편하신가요?</span>
          <Link
            href="/guardian/apply"
            className="btn"
            style={{ minHeight: 48, background: "#fff", color: "var(--ink)", border: "1.5px solid #D5C8B2", padding: "0 22px", fontSize: 15, fontWeight: 700 }}
          >
            웹으로 신청하기
          </Link>
        </div>
      </div>
    </section>
  );
}
