"use client";

import { useCallback, useRef, useState } from "react";

/**
 * 주소 입력 — 우편번호 서비스로 실제 주소를 고르고, 상세주소를 덧붙인다.
 *
 * 예전에는 "예: 나주시 금천면" 자유 입력이었다. 보호자가 무엇을 어디까지
 * 적어야 하는지 알 수 없고, 표기가 제각각이라 뒤에서 지역을 맞추기도 어려웠다.
 *
 * **스크립트를 못 받아도 접수는 끝까지 간다.** 우편번호 서비스는 외부
 * CDN 에서 온다 — 시연장 네트워크가 막히면 그대로 멈춘다. 그래서 로드에
 * 실패하면 조용히 직접 입력으로 바꾸고, 사용자가 이유를 알 수 있게 한 줄
 * 적는다. 접수 자체가 막히는 것이 훨씬 나쁘다.
 *
 * 상위에는 "도로명주소 + 상세주소" 한 문자열로 올려보낸다. 백엔드는 이 값을
 * 어절로 쪼개 시군구를 찾으므로(core/geo.py) 뒤에 무엇이 붙어도 된다.
 */

const SCRIPT_SRC =
  "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
const SCRIPT_ID = "daum-postcode-script";
const LOAD_TIMEOUT_MS = 4000;

interface PostcodeResult {
  roadAddress: string;
  jibunAddress: string;
  autoRoadAddress?: string;
  autoJibunAddress?: string;
}

type Postcode = {
  new (options: {
    oncomplete: (data: PostcodeResult) => void;
    onclose?: () => void;
    width?: string;
    height?: string;
  }): { open: () => void };
};

declare global {
  interface Window {
    daum?: { Postcode?: Postcode };
  }
}

/** 한 번만 받아서 재사용한다. 두 번째 클릭에서 다시 기다리게 하지 않는다. */
let loader: Promise<boolean> | null = null;

function loadPostcode(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.daum?.Postcode) return Promise.resolve(true);
  if (loader) return loader;

  loader = new Promise<boolean>((resolve) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok && Boolean(window.daum?.Postcode));
    };

    // 스크립트가 응답 없이 매달리는 경우가 실제로 있다(막힌 네트워크에서
    // error 이벤트가 안 뜨고 그대로 멈춘다). 기다림에 상한을 둔다.
    const timer = window.setTimeout(() => finish(false), LOAD_TIMEOUT_MS);
    script.addEventListener("load", () => {
      window.clearTimeout(timer);
      finish(true);
    });
    script.addEventListener("error", () => {
      window.clearTimeout(timer);
      finish(false);
    });

    if (!existing) {
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  });
  return loader;
}

/** 검색 결과에서 쓸 주소 한 줄. 도로명이 없으면 지번으로 내려간다. */
function pickAddress(data: PostcodeResult): string {
  return (
    data.roadAddress ||
    data.autoRoadAddress ||
    data.jibunAddress ||
    data.autoJibunAddress ||
    ""
  );
}

export function AddressInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  // 검색으로 고른 주소와 상세주소를 따로 들고, 합쳐서 올려보낸다.
  //
  // 첫 렌더에서 넘어온 값을 초기값으로 삼는다 — 마법사에서 뒤로 갔다 돌아와도
  // 적어 둔 주소가 남아 있어야 한다. effect 로 되채우지 않는 이유는 그게
  // 렌더를 한 번 더 돌리기 때문이고, 이후로는 이 컴포넌트가 값의 주인이다.
  const [base, setBase] = useState(value);
  const [detail, setDetail] = useState("");
  const [manual, setManual] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const detailRef = useRef<HTMLInputElement>(null);

  const push = useCallback(
    (nextBase: string, nextDetail: string) => {
      onChange([nextBase, nextDetail].filter(Boolean).join(" ").trim());
    },
    [onChange],
  );

  const search = useCallback(async () => {
    setPending(true);
    setNotice(null);
    const ok = await loadPostcode();
    setPending(false);
    if (!ok || !window.daum?.Postcode) {
      setManual(true);
      setNotice("주소 검색을 열지 못했어요. 아래에 직접 적어주셔도 됩니다.");
      return;
    }
    new window.daum.Postcode({
      oncomplete: (data) => {
        const picked = pickAddress(data);
        setBase(picked);
        push(picked, detail);
        // 고른 직후 상세주소로 넘겨준다 — 다음에 할 일이 그것뿐이다.
        window.setTimeout(() => detailRef.current?.focus(), 0);
      },
    }).open();
  }, [detail, push]);

  return (
    <div>
      <span className="field-label" id="addr-label">
        거주지 주소
      </span>

      {manual ? (
        <input
          className="input"
          value={base}
          aria-labelledby="addr-label"
          placeholder="예: 전라남도 화순군 화순읍 ○○로 12"
          onChange={(event) => {
            setBase(event.target.value);
            push(event.target.value, detail);
          }}
        />
      ) : (
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="input"
            value={base}
            readOnly
            aria-labelledby="addr-label"
            placeholder="주소 검색을 눌러주세요"
            onClick={search}
            style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
          />
          <button
            type="button"
            className="btn btn--outline"
            onClick={search}
            disabled={pending}
            style={{ flex: "none", height: 54, padding: "0 18px", fontSize: 15 }}
          >
            {pending ? "여는 중…" : "주소 검색"}
          </button>
        </div>
      )}

      {base || manual ? (
        <input
          ref={detailRef}
          className="input"
          value={detail}
          aria-label="상세주소"
          placeholder="상세주소 (동·호수 등, 선택)"
          style={{ marginTop: 8 }}
          onChange={(event) => {
            setDetail(event.target.value);
            push(base, event.target.value);
          }}
        />
      ) : null}

      {notice ? <p className="field-hint">{notice}</p> : null}

      {!manual && !notice ? (
        <p className="field-hint">
          동·읍·면 이름으로도 찾을 수 있어요. 직접 적으시려면{" "}
          <button
            type="button"
            onClick={() => setManual(true)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              font: "inherit",
              color: "var(--orange-ink)",
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            여기를 눌러주세요
          </button>
          .
        </p>
      ) : null}
    </div>
  );
}
