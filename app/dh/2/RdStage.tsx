"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

// Gray-Scott 반응-확산. 화학물질 U와 V가 서로를 먹고 자라며
// 산호·세포·미로 무늬를 만든다. 생명처럼 보이지만 수식 두 줄이다.
type Preset = {
  id: string;
  name: string;
  bg: string;
  ink: string;
  dot: string;
  F: number; // feed rate
  k: number; // kill rate
  stops: [number, string][]; // u-v 값(0=무늬 심지, 1=빈 배경) → 색
};

const PRESETS: Preset[] = [
  {
    id: "coral", name: "산호", bg: "#061114", ink: "#e9f6f3", dot: "#ff8a5c",
    F: 0.0545, k: 0.062,
    stops: [[0, "#30121a"], [0.16, "#a03a3c"], [0.3, "#ff7a4d"], [0.4, "#ffe3c2"], [0.55, "#6b2437"], [1, "#061114"]],
  },
  {
    id: "cells", name: "세포", bg: "#0a0714", ink: "#efe9fb", dot: "#7dffd4",
    F: 0.03, k: 0.062,
    stops: [[0, "#0e2f2f"], [0.16, "#1c7f6c"], [0.3, "#4dffcf"], [0.4, "#eafff6"], [0.55, "#134152"], [1, "#0a0714"]],
  },
  {
    id: "maze", name: "미로", bg: "#0d0b06", ink: "#f7f1e2", dot: "#ffd166",
    F: 0.029, k: 0.057,
    stops: [[0, "#33240d"], [0.16, "#9a6420"], [0.3, "#ffc957"], [0.4, "#fff3d6"], [0.55, "#4a3312"], [1, "#0d0b06"]],
  },
  {
    id: "worms", name: "지렁이", bg: "#040a06", ink: "#eaf7ec", dot: "#a8e05f",
    F: 0.046, k: 0.063,
    stops: [[0, "#122b14"], [0.16, "#3f8a37"], [0.3, "#a5e85e"], [0.4, "#f2ffdd"], [0.55, "#173a22"], [1, "#040a06"]],
  },
  {
    id: "chaos", name: "혼돈", bg: "#0a050d", ink: "#f5ecfa", dot: "#d05fff",
    F: 0.014, k: 0.045,
    stops: [[0, "#26103d"], [0.16, "#7a3bd6"], [0.3, "#d08cff"], [0.4, "#f6eaff"], [0.55, "#2a1458"], [1, "#0a050d"]],
  },
];

const QUOTES = [
  "이것은 생물이 아니라 미분방정식입니다.",
  "무늬가 마음에 안 들면 초기값 탓입니다.",
  "이 세포들은 세금을 내지 않습니다.",
  "자라는 것처럼 보이지만 아무 데도 가지 않습니다.",
  "화학물질 U와 V는 실제로 존재하지 않습니다.",
  "관찰해도 결과는 달라지지 않습니다.",
  "여전히 얻어갈 정보는 없습니다.",
  "1993년부터 쓸데없이 아름다웠던 방정식입니다.",
];

const STEPS_PER_FRAME = 10;
const WARMUP_STEPS = 240; // 씨앗만 있는 첫 화면 대신 어느 정도 자란 상태로 시작

function hexToRgb(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
}

/** stops를 256칸 ABGR(리틀엔디언) 룩업테이블로 굽는다. */
function buildLut(stops: [number, string][]) {
  const cols = stops.map(([p, hex]) => [p, ...hexToRgb(hex)] as const);
  const lut = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let j = 0;
    while (j < cols.length - 2 && t > cols[j + 1][0]) j++;
    const a = cols[j];
    const b = cols[j + 1];
    const f = Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0] || 1)));
    const r = Math.round(a[1] + (b[1] - a[1]) * f);
    const g = Math.round(a[2] + (b[2] - a[2]) * f);
    const bl = Math.round(a[3] + (b[3] - a[3]) * f);
    lut[i] = (255 << 24) | (bl << 16) | (g << 8) | r;
  }
  return lut;
}

const LUTS = new Map(PRESETS.map((p) => [p.id, buildLut(p.stops)]));

export function RdStage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [presetIndex, setPresetIndex] = useState(0);
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hud, setHud] = useState({ fps: 0, cells: 0, gen: 0 });

  // 시뮬레이션 루프는 리렌더 없이 ref만 읽는다.
  const presetRef = useRef(PRESETS[0]);
  const pausedRef = useRef(false);
  const reseedRef = useRef(false);

  const preset = PRESETS[presetIndex];

  const cyclePreset = useCallback(() => {
    setPresetIndex((i) => (i + 1) % PRESETS.length);
  }, []);

  useEffect(() => {
    presetRef.current = preset;
  }, [preset]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setQuoteIndex((i) => (i + 1) % QUOTES.length);
    }, 7000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let simW = 0;
    let simH = 0;
    let cell = 4; // 시뮬레이션 셀 하나가 차지하는 CSS 픽셀
    let u = new Float32Array(0);
    let v = new Float32Array(0);
    let u2 = new Float32Array(0);
    let v2 = new Float32Array(0);
    let gen = 0;

    const simCanvas = document.createElement("canvas");
    const sctx = simCanvas.getContext("2d")!;
    let img: ImageData | null = null;
    let px = new Uint32Array(0);

    /** (cx, cy) 셀 주변 반지름 r에 V를 주입한다 — 먹이 주기. */
    const inject = (cx: number, cy: number, r: number, amount: number) => {
      const x0 = Math.max(1, Math.floor(cx - r));
      const x1 = Math.min(simW - 2, Math.ceil(cx + r));
      const y0 = Math.max(1, Math.floor(cy - r));
      const y1 = Math.min(simH - 2, Math.ceil(cy + r));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x - cx;
          const dy = y - cy;
          if (dx * dx + dy * dy <= r * r) {
            const i = y * simW + x;
            v[i] = Math.min(0.95, v[i] + amount);
          }
        }
      }
    };

    const seed = () => {
      u.fill(1);
      v.fill(0);
      gen = 0;
      const blobs = 10 + Math.floor(Math.random() * 8);
      for (let n = 0; n < blobs; n++) {
        inject(
          2 + Math.random() * (simW - 4),
          2 + Math.random() * (simH - 4),
          2 + Math.random() * 4,
          0.9,
        );
      }
    };

    const step = () => {
      const w = simW;
      const F = presetRef.current.F;
      const k = presetRef.current.k;
      const decay = F + k;
      for (let y = 1; y < simH - 1; y++) {
        let i = y * w + 1;
        for (let x = 1; x < w - 1; x++, i++) {
          const uc = u[i];
          const vc = v[i];
          // 3x3 라플라시안 (인접 0.2, 대각 0.05, 중심 -1) — Karl Sims 가중치
          const lapU =
            0.2 * (u[i - 1] + u[i + 1] + u[i - w] + u[i + w]) +
            0.05 * (u[i - w - 1] + u[i - w + 1] + u[i + w - 1] + u[i + w + 1]) -
            uc;
          const lapV =
            0.2 * (v[i - 1] + v[i + 1] + v[i - w] + v[i + w]) +
            0.05 * (v[i - w - 1] + v[i - w + 1] + v[i + w - 1] + v[i + w + 1]) -
            vc;
          const uvv = uc * vc * vc;
          u2[i] = uc + (lapU - uvv + F * (1 - uc)); // Du = 1
          v2[i] = vc + (0.5 * lapV + uvv - decay * vc); // Dv = 0.5
        }
      }
      [u, u2] = [u2, u];
      [v, v2] = [v2, v];
      gen++;
    };

    const render = () => {
      if (!img) return;
      const lut = LUTS.get(presetRef.current.id)!;
      for (let i = 0; i < px.length; i++) {
        let c = u[i] - v[i];
        if (c < 0) c = 0;
        else if (c > 1) c = 1;
        px[i] = lut[(c * 255) | 0];
      }
      sctx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(simCanvas, 0, 0, width, height);
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = wrap.clientWidth;
      height = wrap.clientHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const oldU = u;
      const oldV = v;
      const oldW = simW;
      const oldH = simH;

      // 셀 수를 ~13만 개로 제한해 한 프레임 10스텝을 60fps 안에 넣는다.
      cell = Math.max(3, Math.ceil(Math.sqrt((width * height) / 130000)));
      simW = Math.max(16, Math.round(width / cell));
      simH = Math.max(16, Math.round(height / cell));
      u = new Float32Array(simW * simH);
      v = new Float32Array(simW * simH);
      u2 = new Float32Array(simW * simH);
      v2 = new Float32Array(simW * simH);
      u2.fill(1); // 테두리는 계산하지 않으므로 양쪽 버퍼 모두 u=1, v=0로 고정된다

      simCanvas.width = simW;
      simCanvas.height = simH;
      img = sctx.createImageData(simW, simH);
      px = new Uint32Array(img.data.buffer);

      if (oldU.length > 0 && oldW > 1 && oldH > 1) {
        // 이전 무늬를 새 격자에 옮겨 심는다 — 리사이즈로 생태계가 멸종하지 않게.
        u.fill(1);
        for (let y = 1; y < simH - 1; y++) {
          const sy = Math.min(oldH - 2, Math.max(1, Math.round((y / simH) * oldH)));
          for (let x = 1; x < simW - 1; x++) {
            const sx = Math.min(oldW - 2, Math.max(1, Math.round((x / simW) * oldW)));
            const si = sy * oldW + sx;
            const di = y * simW + x;
            u[di] = oldU[si];
            v[di] = oldV[si];
          }
        }
      } else {
        seed();
        for (let n = 0; n < WARMUP_STEPS; n++) step();
      }
      render();
      setHud((h) => ({ ...h, cells: simW * simH, gen }));
    };

    resize();

    let raf = 0;
    let last = performance.now();
    let fps = 60;
    let lastHud = 0;

    if (reduceMotion) {
      for (let n = 0; n < 900; n++) step();
      render();
      setHud({ fps: 0, cells: simW * simH, gen });
    } else {
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        const dt = now - last;
        last = now;

        if (reseedRef.current) {
          reseedRef.current = false;
          seed();
          for (let n = 0; n < WARMUP_STEPS; n++) step();
        }
        if (pausedRef.current) return;

        const steps = Math.max(1, Math.min(24, Math.round((dt / 16.7) * STEPS_PER_FRAME)));
        for (let n = 0; n < steps; n++) step();
        render();

        // 전멸 감지: V가 거의 0이면 어떤 종으로 바꿔도 못 살아난다 → 다시 심는다.
        if (gen % 300 < steps) {
          let vSum = 0;
          for (let i = 0; i < v.length; i += 16) vSum += v[i];
          if (vSum < 1) reseedRef.current = true;
        }

        fps += (1000 / Math.max(dt, 1) - fps) * 0.1;
        if (now - lastHud > 420) {
          lastHud = now;
          setHud({ fps: Math.round(fps), cells: simW * simH, gen });
        }
      };
      raf = requestAnimationFrame(loop);
    }

    let down = false;
    const toCell = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return [(e.clientX - rect.left) / cell, (e.clientY - rect.top) / cell] as const;
    };
    const onPointerMove = (e: PointerEvent) => {
      const [cx, cy] = toCell(e);
      inject(cx, cy, down ? 6 : 2.5, down ? 0.5 : 0.25);
    };
    const onPointerDown = (e: PointerEvent) => {
      down = true;
      const [cx, cy] = toCell(e);
      inject(cx, cy, 9, 0.9);
    };
    const onPointerUp = () => {
      down = false;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === " " || key === "spacebar") {
        e.preventDefault();
        cyclePreset();
      } else if (key === "c") {
        reseedRef.current = true;
      } else if (key === "p") {
        setPaused((val) => !val);
      }
    };
    const onVisibility = () => {
      last = performance.now();
    };

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    wrap.addEventListener("pointermove", onPointerMove);
    wrap.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      wrap.removeEventListener("pointermove", onPointerMove);
      wrap.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [cyclePreset]);

  return (
    <div
      ref={wrapRef}
      className="dh"
      data-tone="dark"
      style={{
        background: preset.bg,
        ["--dh-ink" as string]: preset.ink,
        ["--dh-bg" as string]: preset.bg,
      }}
    >
      <canvas ref={canvasRef} className="dh-canvas" aria-hidden />
      <div className="dh-vignette" aria-hidden />

      <div className="dh-overlay">
        <div className="dh-row">
          <p className="dh-tag">
            <b>동행고리 연구소</b>
            쓸모없는 실험 No.02
            <Link href="/dh" className="dh-link">
              ← 실험 No.01
            </Link>
            <Link href="/dh/3" className="dh-link">
              실험 No.03 →
            </Link>
          </p>
          <button type="button" className="dh-swatch" onClick={cyclePreset}>
            <span className="dh-dot" style={{ background: preset.dot }} aria-hidden />
            {preset.name}
          </button>
        </div>

        <div className="dh-center">
          <p className="dh-kicker">no purpose · not alive</p>
          <div className="dh-title-halo">
            <h1 className="dh-title">
              <span>쓸데없이</span>
              <span>살아있는 것</span>
            </h1>
          </div>
          <p className="dh-sub">
            생명처럼 보이지만 수식 두 줄입니다.
            <br />
            마우스로 먹이를 주면 자랍니다.
          </p>
          <p className="dh-quote" key={quoteIndex}>
            {QUOTES[quoteIndex]}
          </p>
        </div>

        <div className="dh-row dh-row--bottom">
          <ul className="dh-keys">
            <li>마우스 — 먹이</li>
            <li>클릭 — 씨앗 심기</li>
            <li>
              <kbd>Space</kbd> 종 바꾸기
            </li>
            <li>
              <kbd>C</kbd> 갈아엎기
            </li>
            <li>
              <kbd>P</kbd> {paused ? "다시 재생" : "멈추기"}
            </li>
          </ul>

          <dl className="dh-hud">
            <dt>fps</dt>
            <dd>{hud.fps || "—"}</dd>
            <dt>세대</dt>
            <dd>{hud.gen.toLocaleString("ko-KR")}</dd>
            <dt>세포</dt>
            <dd>{hud.cells.toLocaleString("ko-KR")}</dd>
            <dt>지능</dt>
            <dd>0.00%</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}
