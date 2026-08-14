// Claude Design 프로토타입(design-reference/donghaengori-prototype.html)에서 추출한
// 시각 토큰. 값은 원본 HTML의 inline style에서 그대로 가져왔다.
// 새 UI 프레임워크를 들이지 않고 기존 CSS 체계 위에서 같은 화면을 만들기 위한 단일 출처다.

export const T = {
  // 색
  ink: "#1F1D1A",
  inkSoft: "#44403C",
  body: "#57534E",
  muted: "#78716C",
  line: "rgba(0,0,0,.06)",
  lineStrong: "#E7E5E4",
  border: "#D6D3D1",
  canvas: "#FCFBF9",
  surface: "#FFFFFF",
  surfaceSoft: "#FAF9F7",
  accent: "#F97316",
  accentDark: "#EA580C",
  accentText: "#C2410C",
  warnBg: "#FFFBEB",
  warnBorder: "#FDE68A",
  warnText: "#B45309",
  dangerBg: "#FEF2F2",
  dangerBorder: "#FECACA",
  dangerBorderSoft: "#FCA5A5",
  dangerText: "#B91C1C",

  // 치수
  navWidth: 188,
  listWidth: 272,
  detailLeftWidth: 300,
  minWidth: 1240,
  minHeight: 640,
} as const;
