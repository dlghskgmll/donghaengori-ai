"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Palette = {
  id: string;
  name: string;
  tone: "dark" | "light";
  bg: string;
  ink: string;
  fade: number; // 프레임마다 잔상을 덮는 알파. 클수록 꼬리가 짧다.
  hue: number;
  spread: number; // 버킷 사이에 퍼뜨릴 색상각 폭
  sat: number;
  light: number;
  alpha: number;
  blend: GlobalCompositeOperation;
};

const PALETTES: Palette[] = [
  { id: "midnight", name: "심야", tone: "dark", bg: "#05070d", ink: "#eef2f8", fade: 0.024, hue: 196, spread: 86, sat: 92, light: 64, alpha: 0.82, blend: "lighter" },
  { id: "ember", name: "노을", tone: "dark", bg: "#0c0604", ink: "#fdeee6", fade: 0.025, hue: 6, spread: 62, sat: 95, light: 60, alpha: 0.82, blend: "lighter" },
  { id: "moss", name: "이끼", tone: "dark", bg: "#03090a", ink: "#e8f5ee", fade: 0.023, hue: 126, spread: 74, sat: 78, light: 58, alpha: 0.78, blend: "lighter" },
  { id: "amethyst", name: "자수정", tone: "dark", bg: "#08040f", ink: "#f2ebfb", fade: 0.024, hue: 268, spread: 92, sat: 88, light: 65, alpha: 0.82, blend: "lighter" },
  { id: "whitenight", name: "백야", tone: "light", bg: "#f1efe9", ink: "#161a20", fade: 0.026, hue: 214, spread: 128, sat: 44, light: 34, alpha: 0.34, blend: "source-over" },
];

const QUOTES = [
  "여기서 얻어갈 정보는 하나도 없습니다.",
  "모든 입자에는 각자의 사정이 있습니다.",
  "이 선들은 어떤 데이터도 나타내지 않습니다.",
  "새로고침하면 다시는 같은 그림이 나오지 않습니다.",
  "지금 보고 있는 프레임은 1초 뒤에 사라집니다.",
  "요구사항 0건이 성실히 구현되었습니다.",
  "이 페이지의 유일한 기능은 예쁨입니다.",
  "잠깐은 아무것도 안 해도 괜찮습니다.",
];

const TAU = Math.PI * 2;
const BUCKETS = 14; // 색상 버킷 = 프레임당 stroke 호출 수
const FIELD_SCALE = 0.0019;
const POINTER_RADIUS = 240;

/** 정수 격자 해시. 32비트 곱셈이 필요해 Math.imul을 쓴다. */
function hash2(x: number, y: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** smoothstep 보간을 쓴 2D value noise. */
function noise2(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/** 옥타브 2개면 흐름장으로 쓰기에 충분하다. */
function fbm(x: number, y: number) {
  return noise2(x, y) * 0.65 + noise2(x * 2.13 + 5.2, y * 2.13 - 3.1) * 0.35;
}

function hexToRgb(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
}

export function DhStage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [paletteIndex, setPaletteIndex] = useState(0);
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hud, setHud] = useState({ fps: 0, particles: 0, seconds: 0 });

  // 애니메이션 루프는 상태를 읽지 않고 ref만 본다(리렌더로 루프를 다시 만들지 않기 위해).
  const paletteRef = useRef(PALETTES[0]);
  const pausedRef = useRef(false);
  const clearRef = useRef(false);

  const palette = PALETTES[paletteIndex];

  const cyclePalette = useCallback(() => {
    setPaletteIndex((i) => (i + 1) % PALETTES.length);
  }, []);

  // 렌더 중에는 ref를 건드리지 않는다. 아래 effect들은 캔버스 effect보다 먼저
  // 선언돼 있어서 마운트 시점에도 루프가 올바른 값을 본다.
  useEffect(() => {
    paletteRef.current = palette;
  }, [palette]);

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
    let count = 0;
    let xs = new Float32Array(0);
    let ys = new Float32Array(0);
    let lives = new Float32Array(0);
    let speeds = new Float32Array(0);
    let fresh = new Uint8Array(0);

    let time = 0;
    let pointerX = 0;
    let pointerY = 0;
    let pointerOn = false;
    let pulses: { x: number; y: number; t: number }[] = [];

    const seed = (i: number) => {
      xs[i] = Math.random() * width;
      ys[i] = Math.random() * height;
      lives[i] = 120 + Math.random() * 380;
      speeds[i] = 0.7 + Math.random() * 1.4;
      fresh[i] = 1;
    };

    const paintBackground = () => {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = paletteRef.current.bg;
      ctx.fillRect(0, 0, width, height);
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = wrap.clientWidth;
      height = wrap.clientHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // 이후 좌표는 전부 CSS 픽셀

      // 화면이 넓을수록 입자를 늘리되 상한을 둔다.
      count = Math.round(Math.min(3600, Math.max(700, (width * height) / 760)));
      xs = new Float32Array(count);
      ys = new Float32Array(count);
      lives = new Float32Array(count);
      speeds = new Float32Array(count);
      fresh = new Uint8Array(count);
      for (let i = 0; i < count; i++) seed(i);

      pointerX = width / 2;
      pointerY = height / 2;
      paintBackground();
      setHud((h) => ({ ...h, particles: count }));
    };

    const step = (dtMs: number) => {
      const pal = paletteRef.current;
      const dt = Math.min(dtMs, 34);
      time += dt * 0.001;

      const [br, bg, bb] = hexToRgb(pal.bg);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = `rgba(${br},${bg},${bb},${pal.fade})`;
      ctx.fillRect(0, 0, width, height);

      pulses = pulses.filter((p) => time - p.t < 1.15);

      ctx.globalCompositeOperation = pal.blend;
      ctx.lineCap = "round";

      const tx = time * 0.05;
      const ty = time * 0.032;
      const stepScale = dt * 0.19;

      for (let b = 0; b < BUCKETS; b++) {
        const hue = (pal.hue + (b / BUCKETS) * pal.spread + Math.sin(time * 0.11) * 14 + 360) % 360;
        ctx.beginPath();

        for (let i = b; i < count; i += BUCKETS) {
          const ox = xs[i];
          const oy = ys[i];

          const angle = fbm(ox * FIELD_SCALE + tx, oy * FIELD_SCALE + ty) * TAU * 2.2 + time * 0.06;
          let vx = Math.cos(angle);
          let vy = Math.sin(angle);

          // 포인터 주변은 소용돌이 + 약한 반발
          if (pointerOn) {
            const dx = ox - pointerX;
            const dy = oy - pointerY;
            const d2 = dx * dx + dy * dy;
            if (d2 < POINTER_RADIUS * POINTER_RADIUS) {
              const d = Math.sqrt(d2) || 1;
              const f = 1 - d / POINTER_RADIUS;
              vx += (-dy / d) * f * 2.1 + (dx / d) * f * 1.25;
              vy += (dx / d) * f * 2.1 + (dy / d) * f * 1.25;
            }
          }

          // 클릭 파동의 링 부근만 바깥으로 밀어낸다
          for (let k = 0; k < pulses.length; k++) {
            const p = pulses[k];
            const dx = ox - p.x;
            const dy = oy - p.y;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            const ring = (time - p.t) * 780;
            const off = Math.abs(d - ring);
            if (off < 70) {
              const f = (1 - off / 70) * 5;
              vx += (dx / d) * f;
              vy += (dy / d) * f;
            }
          }

          const len = Math.hypot(vx, vy) || 1;
          const sp = speeds[i] * stepScale;
          const nx = ox + (vx / len) * sp;
          const ny = oy + (vy / len) * sp;

          if (fresh[i]) {
            fresh[i] = 0; // 리셋 직후 프레임은 화면을 가로지르는 선을 만들지 않는다
          } else {
            ctx.moveTo(ox, oy);
            ctx.lineTo(nx, ny);
          }

          xs[i] = nx;
          ys[i] = ny;
          lives[i] -= 1;

          if (lives[i] <= 0 || nx < -20 || nx > width + 20 || ny < -20 || ny > height + 20) {
            seed(i);
          }
        }

        // 같은 path를 두 번 그린다: 넓고 흐린 글로우 → 얇고 진한 심지.
        const w = 0.85 + (b % 3) * 0.4;
        ctx.lineWidth = w * 2.9;
        ctx.strokeStyle = `hsla(${hue}, ${pal.sat}%, ${pal.light + 6}%, ${pal.alpha * 0.12})`;
        ctx.stroke();
        ctx.lineWidth = w;
        ctx.strokeStyle = `hsla(${hue}, ${pal.sat}%, ${pal.light}%, ${pal.alpha})`;
        ctx.stroke();
      }

      // 파동의 링 자체도 그려준다
      for (let k = 0; k < pulses.length; k++) {
        const p = pulses[k];
        const age = (time - p.t) / 1.15;
        ctx.globalAlpha = (1 - age) * 0.32;
        ctx.lineWidth = 0.5 + (1 - age) * 2;
        ctx.strokeStyle = `hsla(${(pal.hue + 30) % 360}, ${pal.sat}%, ${pal.light + 8}%, 1)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, age * 900, 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    resize();

    let raf = 0;
    let last = performance.now();
    const started = last;
    let fps = 60;
    let lastHud = 0;

    if (reduceMotion) {
      // 모션을 줄이는 환경에서는 한 장면만 만들어 두고 멈춘다.
      for (let i = 0; i < 420; i++) step(16);
      setHud({ fps: 0, particles: count, seconds: 0 });
    } else {
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        const dt = now - last;
        last = now;

        if (clearRef.current) {
          clearRef.current = false;
          paintBackground();
        }
        if (pausedRef.current) return;

        step(dt);

        fps += (1000 / Math.max(dt, 1) - fps) * 0.1;
        if (now - lastHud > 420) {
          lastHud = now;
          setHud({ fps: Math.round(fps), particles: count, seconds: (now - started) / 1000 });
        }
      };
      raf = requestAnimationFrame(loop);
    }

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointerX = e.clientX - rect.left;
      pointerY = e.clientY - rect.top;
      pointerOn = true;
    };
    const onPointerLeave = () => {
      pointerOn = false;
    };
    const onPointerDown = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pulses.push({ x: e.clientX - rect.left, y: e.clientY - rect.top, t: time });
      if (pulses.length > 6) pulses.shift();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === " " || key === "spacebar") {
        e.preventDefault();
        cyclePalette();
      } else if (key === "c") {
        clearRef.current = true;
      } else if (key === "p") {
        setPaused((v) => !v);
      }
    };
    const onVisibility = () => {
      last = performance.now(); // 탭 복귀 시 dt가 튀지 않도록
    };

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    wrap.addEventListener("pointermove", onPointerMove);
    wrap.addEventListener("pointerleave", onPointerLeave);
    wrap.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      wrap.removeEventListener("pointermove", onPointerMove);
      wrap.removeEventListener("pointerleave", onPointerLeave);
      wrap.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [cyclePalette]);

  const elapsed = `${String(Math.floor(hud.seconds / 60)).padStart(2, "0")}:${String(
    Math.floor(hud.seconds % 60),
  ).padStart(2, "0")}`;

  return (
    <div
      ref={wrapRef}
      className="dh"
      data-tone={palette.tone}
      style={{
        background: palette.bg,
        ["--dh-ink" as string]: palette.ink,
        ["--dh-bg" as string]: palette.bg,
      }}
    >
      <canvas ref={canvasRef} className="dh-canvas" aria-hidden />
      <div className="dh-vignette" aria-hidden />

      <div className="dh-overlay">
        <div className="dh-row">
          <p className="dh-tag">
            <b>동행고리 연구소</b>
            쓸모없는 실험 No.01
            <Link href="/dh/2" className="dh-link">
              실험 No.02 →
            </Link>
          </p>
          <button type="button" className="dh-swatch" onClick={cyclePalette}>
            <span
              className="dh-dot"
              style={{ background: `hsl(${palette.hue}, ${palette.sat}%, ${palette.light}%)` }}
              aria-hidden
            />
            {palette.name}
          </button>
        </div>

        <div className="dh-center">
          <p className="dh-kicker">no purpose · no product</p>
          <div className="dh-title-halo">
            <h1 className="dh-title">
              <span>쓸데없이</span>
              <span>아름다운 것</span>
            </h1>
          </div>
          <p className="dh-sub">
            이 페이지는 아무 일도 하지 않습니다.
            <br />
            움직이는 걸 잠깐 보고 가시면 됩니다.
          </p>
          <p className="dh-quote" key={quoteIndex}>
            {QUOTES[quoteIndex]}
          </p>
        </div>

        <div className="dh-row dh-row--bottom">
          <ul className="dh-keys">
            <li>마우스 — 소용돌이</li>
            <li>클릭 — 흩뜨리기</li>
            <li>
              <kbd>Space</kbd> 색 바꾸기
            </li>
            <li>
              <kbd>C</kbd> 지우기
            </li>
            <li>
              <kbd>P</kbd> {paused ? "다시 재생" : "멈추기"}
            </li>
          </ul>

          <dl className="dh-hud">
            <dt>fps</dt>
            <dd>{hud.fps || "—"}</dd>
            <dt>입자</dt>
            <dd>{hud.particles.toLocaleString("ko-KR")}</dd>
            <dt>경과</dt>
            <dd>{elapsed}</dd>
            <dt>유용성</dt>
            <dd>0.00%</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}
