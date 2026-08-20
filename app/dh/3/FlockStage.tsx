"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

// Boids(Reynolds, 1987). 각 개체는 이웃과 (1) 부딪히지 않고 (2) 방향을 맞추고
// (3) 가운데로 붙는 규칙 셋만 안다. 무리의 모양은 아무도 정하지 않는다.
type Preset = {
  id: string;
  name: string;
  tone: "dark" | "light";
  bg: string;
  ink: string;
  body: string; // 개체 색
  dot: string;
  blend: GlobalCompositeOperation;
  fade: number; // 프레임마다 잔상을 덮는 알파
  maxSpeed: number;
  align: number;
  cohesion: number;
  separation: number;
  jitter: number;
  streak: number; // 속도 대비 꼬리 길이
  width: number;
};

const PRESETS: Preset[] = [
  {
    id: "starling", name: "찌르레기", tone: "light", bg: "#e6d3bc", ink: "#241a10",
    body: "#2a2130", dot: "#2a2130", blend: "source-over", fade: 0.24,
    maxSpeed: 3.6, align: 0.09, cohesion: 0.011, separation: 0.055, jitter: 0.1,
    streak: 2.6, width: 1.7,
  },
  {
    id: "anchovy", name: "멸치", tone: "dark", bg: "#041220", ink: "#e2f1fb",
    body: "#b9e2f5", dot: "#b9e2f5", blend: "lighter", fade: 0.16,
    maxSpeed: 4.0, align: 0.11, cohesion: 0.015, separation: 0.05, jitter: 0.07,
    streak: 2.2, width: 1.5,
  },
  {
    id: "firefly", name: "반딧불이", tone: "dark", bg: "#060a04", ink: "#eef7dd",
    body: "#d7ff6e", dot: "#d7ff6e", blend: "lighter", fade: 0.045,
    maxSpeed: 1.7, align: 0.02, cohesion: 0.0045, separation: 0.05, jitter: 0.3,
    streak: 3.2, width: 1.6,
  },
  {
    id: "crow", name: "까마귀", tone: "light", bg: "#ccd3d8", ink: "#12161b",
    body: "#14181d", dot: "#14181d", blend: "source-over", fade: 0.26,
    maxSpeed: 3.1, align: 0.06, cohesion: 0.006, separation: 0.07, jitter: 0.15,
    streak: 2.8, width: 1.9,
  },
  {
    id: "ghost", name: "유령", tone: "dark", bg: "#0a0712", ink: "#efe9fb",
    body: "#cfc0f2", dot: "#cfc0f2", blend: "lighter", fade: 0.055,
    maxSpeed: 2.1, align: 0.07, cohesion: 0.008, separation: 0.045, jitter: 0.13,
    streak: 4.2, width: 1.5,
  },
];

const QUOTES = [
  "리더는 없습니다. 처음부터 없었습니다.",
  "각자는 규칙 셋만 압니다. 무리는 아무도 모릅니다.",
  "어디로 가는지 아무도 모르지만 다 같이 갑니다.",
  "당신이 다가가면 도망갑니다. 개인적인 감정은 없습니다.",
  "이 새들은 출근하지 않습니다.",
  "군무의 목적을 묻지 마십시오. 없습니다.",
  "혼자 남은 개체는 곧 무리를 찾습니다. 이유는 모릅니다.",
  "여전히 얻어갈 정보는 없습니다.",
];

const R = 64; // 이웃 인지 반경 = 공간 해시 셀 크기
const SEP = 21; // 분리 반경
const SHADE_BUCKETS = 8; // 개체를 밝기 버킷으로 묶어 stroke 호출을 줄인다
const PREDATOR_R = 150;
const FOOD_R = 320;
const EDGE = 70;

export function FlockStage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [presetIndex, setPresetIndex] = useState(0);
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hud, setHud] = useState({ fps: 0, boids: 0, seconds: 0 });

  const presetRef = useRef(PRESETS[0]);
  const pausedRef = useRef(false);
  const scatterRef = useRef(false);

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
    let count = 0;
    let px = new Float32Array(0);
    let py = new Float32Array(0);
    let vx = new Float32Array(0);
    let vy = new Float32Array(0);
    let shade = new Uint8Array(0);

    let gw = 0;
    let gh = 0;
    let head = new Int32Array(0);
    let nxt = new Int32Array(0);

    let time = 0;
    let pointerX = -1e9;
    let pointerY = -1e9;
    let pointerOn = false;
    let foods: { x: number; y: number; t: number }[] = [];

    const paintBackground = () => {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = presetRef.current.bg;
      ctx.fillRect(0, 0, width, height);
    };

    const scatter = () => {
      for (let i = 0; i < count; i++) {
        px[i] = Math.random() * width;
        py[i] = Math.random() * height;
        const a = Math.random() * Math.PI * 2;
        const s = 1 + Math.random() * 2;
        vx[i] = Math.cos(a) * s;
        vy[i] = Math.sin(a) * s;
      }
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const oldCount = count;
      width = wrap.clientWidth;
      height = wrap.clientHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      count = Math.round(Math.min(950, Math.max(240, (width * height) / 1700)));

      const grow = (a: Float32Array) => {
        const b = new Float32Array(count);
        b.set(a.subarray(0, Math.min(oldCount, count)));
        return b;
      };
      px = grow(px);
      py = grow(py);
      vx = grow(vx);
      vy = grow(vy);
      const s2 = new Uint8Array(count);
      s2.set(shade.subarray(0, Math.min(oldCount, count)));
      shade = s2;

      for (let i = oldCount; i < count; i++) {
        px[i] = Math.random() * width;
        py[i] = Math.random() * height;
        const a = Math.random() * Math.PI * 2;
        vx[i] = Math.cos(a) * 2;
        vy[i] = Math.sin(a) * 2;
        shade[i] = Math.floor(Math.random() * SHADE_BUCKETS);
      }
      // 기존 개체는 새 화면 안으로 들여보낸다 (뷰포트 흔들림에 무리가 리셋되지 않게)
      for (let i = 0; i < Math.min(oldCount, count); i++) {
        px[i] = Math.min(width - 2, Math.max(2, px[i]));
        py[i] = Math.min(height - 2, Math.max(2, py[i]));
      }

      gw = Math.max(1, Math.ceil(width / R));
      gh = Math.max(1, Math.ceil(height / R));
      head = new Int32Array(gw * gh);
      nxt = new Int32Array(count);

      paintBackground();
      setHud((h) => ({ ...h, boids: count }));
    };

    const step = (mult: number) => {
      const pal = presetRef.current;
      const maxS = pal.maxSpeed;
      const minS = maxS * 0.45;

      // 공간 해시 재구축
      head.fill(-1);
      for (let i = 0; i < count; i++) {
        const cx = Math.min(gw - 1, Math.max(0, (px[i] / R) | 0));
        const cy = Math.min(gh - 1, Math.max(0, (py[i] / R) | 0));
        const c = cy * gw + cx;
        nxt[i] = head[c];
        head[c] = i;
      }

      foods = foods.filter((f) => time - f.t < 4);

      for (let i = 0; i < count; i++) {
        const x = px[i];
        const y = py[i];
        let ax = 0;
        let ay = 0;

        // 이웃 집계 — 정렬 / 응집 / 분리
        let n = 0;
        let avx = 0;
        let avy = 0;
        let cx = 0;
        let cy = 0;
        let sx = 0;
        let sy = 0;
        const gx = Math.min(gw - 1, Math.max(0, (x / R) | 0));
        const gy = Math.min(gh - 1, Math.max(0, (y / R) | 0));
        for (let oy = Math.max(0, gy - 1); oy <= Math.min(gh - 1, gy + 1); oy++) {
          for (let ox = Math.max(0, gx - 1); ox <= Math.min(gw - 1, gx + 1); ox++) {
            for (let j = head[oy * gw + ox]; j !== -1; j = nxt[j]) {
              if (j === i) continue;
              const dx = px[j] - x;
              const dy = py[j] - y;
              const d2 = dx * dx + dy * dy;
              if (d2 > R * R) continue;
              n++;
              avx += vx[j];
              avy += vy[j];
              cx += px[j];
              cy += py[j];
              if (d2 < SEP * SEP) {
                const inv = 1 / (d2 + 4);
                sx -= dx * inv;
                sy -= dy * inv;
              }
            }
          }
        }
        if (n > 0) {
          ax += (avx / n - vx[i]) * pal.align;
          ay += (avy / n - vy[i]) * pal.align;
          ax += (cx / n - x) * pal.cohesion;
          ay += (cy / n - y) * pal.cohesion;
          ax += sx * pal.separation * 60;
          ay += sy * pal.separation * 60;
        }

        // 포식자(마우스)를 피한다
        if (pointerOn) {
          const dx = x - pointerX;
          const dy = y - pointerY;
          const d2 = dx * dx + dy * dy;
          if (d2 < PREDATOR_R * PREDATOR_R) {
            const d = Math.sqrt(d2) || 1;
            const f = (1 - d / PREDATOR_R) * 0.9;
            ax += (dx / d) * f;
            ay += (dy / d) * f;
          }
        }

        // 먹이(클릭)로 모인다
        for (let k = 0; k < foods.length; k++) {
          const dx = foods[k].x - x;
          const dy = foods[k].y - y;
          const d2 = dx * dx + dy * dy;
          if (d2 < FOOD_R * FOOD_R && d2 > 100) {
            const d = Math.sqrt(d2);
            ax += (dx / d) * 0.07;
            ay += (dy / d) * 0.07;
          }
        }

        // 가장자리에서 부드럽게 돌아선다
        if (x < EDGE) ax += (1 - x / EDGE) * 0.14;
        if (x > width - EDGE) ax -= (1 - (width - x) / EDGE) * 0.14;
        if (y < EDGE) ay += (1 - y / EDGE) * 0.14;
        if (y > height - EDGE) ay -= (1 - (height - y) / EDGE) * 0.14;

        ax += (Math.random() - 0.5) * pal.jitter;
        ay += (Math.random() - 0.5) * pal.jitter;

        vx[i] += ax * mult;
        vy[i] += ay * mult;

        const s = Math.hypot(vx[i], vy[i]) || 1e-4;
        if (s > maxS) {
          vx[i] *= maxS / s;
          vy[i] *= maxS / s;
        } else if (s < minS) {
          vx[i] *= minS / s;
          vy[i] *= minS / s;
        }

        px[i] = Math.min(width - 1, Math.max(1, x + vx[i] * mult));
        py[i] = Math.min(height - 1, Math.max(1, y + vy[i] * mult));
      }
    };

    const hexToRgb = (hex: string) => {
      const v = Number.parseInt(hex.slice(1), 16);
      return [(v >> 16) & 255, (v >> 8) & 255, v & 255] as const;
    };

    const render = () => {
      const pal = presetRef.current;
      const [br, bg, bb] = hexToRgb(pal.bg);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = `rgba(${br},${bg},${bb},${pal.fade})`;
      ctx.fillRect(0, 0, width, height);

      ctx.globalCompositeOperation = pal.blend;
      ctx.lineCap = "round";
      ctx.lineWidth = pal.width;
      const [r, g, b] = hexToRgb(pal.body);
      for (let bucket = 0; bucket < SHADE_BUCKETS; bucket++) {
        const alpha = 0.45 + (bucket / (SHADE_BUCKETS - 1)) * 0.55;
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.beginPath();
        for (let i = bucket; i < count; i += SHADE_BUCKETS) {
          ctx.moveTo(px[i] - vx[i] * pal.streak, py[i] - vy[i] * pal.streak);
          ctx.lineTo(px[i], py[i]);
        }
        ctx.stroke();
      }

      // 던진 먹이는 퍼지는 링으로 보여준다
      ctx.globalCompositeOperation = "source-over";
      for (let k = 0; k < foods.length; k++) {
        const age = (time - foods[k].t) / 4;
        ctx.globalAlpha = (1 - age) * 0.5;
        ctx.lineWidth = 1;
        ctx.strokeStyle = pal.ink;
        ctx.beginPath();
        ctx.arc(foods[k].x, foods[k].y, 6 + age * 46, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    resize();
    scatter();

    let raf = 0;
    let last = performance.now();
    const started = last;
    let fps = 60;
    let lastHud = 0;

    if (reduceMotion) {
      for (let n = 0; n < 260; n++) {
        time += 1 / 60;
        step(1);
      }
      render();
      setHud({ fps: 0, boids: count, seconds: 0 });
    } else {
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        const dt = Math.min(now - last, 50);
        last = now;

        if (scatterRef.current) {
          scatterRef.current = false;
          scatter();
          paintBackground();
        }
        if (pausedRef.current) return;

        time += dt * 0.001;
        step(Math.min(dt / 16.7, 2));
        render();

        fps += (1000 / Math.max(dt, 1) - fps) * 0.1;
        if (now - lastHud > 420) {
          lastHud = now;
          setHud({ fps: Math.round(fps), boids: count, seconds: (now - started) / 1000 });
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
      foods.push({ x: e.clientX - rect.left, y: e.clientY - rect.top, t: time });
      if (foods.length > 4) foods.shift();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === " " || key === "spacebar") {
        e.preventDefault();
        cyclePreset();
      } else if (key === "c") {
        scatterRef.current = true;
      } else if (key === "p") {
        setPaused((v) => !v);
      }
    };
    const onVisibility = () => {
      last = performance.now();
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
  }, [cyclePreset]);

  const elapsed = `${String(Math.floor(hud.seconds / 60)).padStart(2, "0")}:${String(
    Math.floor(hud.seconds % 60),
  ).padStart(2, "0")}`;

  return (
    <div
      ref={wrapRef}
      className="dh"
      data-tone={preset.tone}
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
            쓸모없는 실험 No.03
            <Link href="/dh/2" className="dh-link">
              ← 실험 No.02
            </Link>
          </p>
          <button type="button" className="dh-swatch" onClick={cyclePreset}>
            <span className="dh-dot" style={{ background: preset.dot }} aria-hidden />
            {preset.name}
          </button>
        </div>

        <div className="dh-center">
          <p className="dh-kicker">no purpose · no leader</p>
          <div className="dh-title-halo">
            <h1 className="dh-title">
              <span>쓸데없이</span>
              <span>몰려다니는 것</span>
            </h1>
          </div>
          <p className="dh-sub">
            리더도 목적지도 없습니다.
            <br />
            서로 눈치만 보는데 무리가 됩니다.
          </p>
          <p className="dh-quote" key={quoteIndex}>
            {QUOTES[quoteIndex]}
          </p>
        </div>

        <div className="dh-row dh-row--bottom">
          <ul className="dh-keys">
            <li>마우스 — 포식자</li>
            <li>클릭 — 먹이 던지기</li>
            <li>
              <kbd>Space</kbd> 무리 바꾸기
            </li>
            <li>
              <kbd>C</kbd> 흩뜨리기
            </li>
            <li>
              <kbd>P</kbd> {paused ? "다시 재생" : "멈추기"}
            </li>
          </ul>

          <dl className="dh-hud">
            <dt>fps</dt>
            <dd>{hud.fps || "—"}</dd>
            <dt>개체</dt>
            <dd>{hud.boids.toLocaleString("ko-KR")}</dd>
            <dt>경과</dt>
            <dd>{elapsed}</dd>
            <dt>리더</dt>
            <dd>없음</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}
