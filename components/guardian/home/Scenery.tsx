// 홈 히어로 아래 풍경 일러스트 (집 → 굽은 길 → 병원)와 마감 언덕.
// path/좌표는 아티팩트에서 그대로 옮겼다.

export function HeroScenery() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1440 340"
      preserveAspectRatio="xMidYMax slice"
      style={{ display: "block", width: "100%", height: "clamp(210px,30vw,340px)", marginTop: 26 }}
    >
      <path d="M0,235 Q200,150 420,205 T860,195 T1440,215 L1440,340 0,340 Z" fill="#BCDF9B" />
      <path d="M0,270 Q300,195 640,245 T1440,250 L1440,340 0,340 Z" fill="#9BD07C" />
      <path d="M0,305 Q360,245 760,290 T1440,290 L1440,340 0,340 Z" fill="#7CBF5E" />
      <path d="M-40,345 C260,300 420,330 640,300 S1000,235 1180,255" fill="none" stroke="#FBF0D2" strokeWidth="40" strokeLinecap="round" />
      <path d="M-40,345 C260,300 420,330 640,300 S1000,235 1180,255" fill="none" stroke="#F94704" strokeWidth="3.5" strokeDasharray="14 16" strokeLinecap="round" opacity=".7" />
      <g transform="translate(120,196)">
        <rect x="8" y="26" width="52" height="40" rx="3" fill="#FFF6E3" />
        <path d="M0,30 L34,2 L68,30 Z" fill="#E8663C" />
        <rect x="27" y="42" width="14" height="24" rx="2" fill="#B7793F" />
        <rect x="12" y="34" width="11" height="10" rx="2" fill="#BFE3EC" />
        <rect x="45" y="34" width="11" height="10" rx="2" fill="#BFE3EC" />
      </g>
      <g transform="translate(1180,150)">
        <rect x="0" y="20" width="110" height="86" rx="6" fill="#FFFFFF" />
        <rect x="34" y="0" width="42" height="30" rx="5" fill="#FFFFFF" />
        <rect x="48" y="7" width="14" height="4.5" rx="2" fill="#F94704" />
        <rect x="52.5" y="2.5" width="4.5" height="14" rx="2" fill="#F94704" />
        <rect x="14" y="36" width="16" height="14" rx="2.5" fill="#BFE3EC" />
        <rect x="47" y="36" width="16" height="14" rx="2.5" fill="#BFE3EC" />
        <rect x="80" y="36" width="16" height="14" rx="2.5" fill="#BFE3EC" />
        <rect x="14" y="58" width="16" height="14" rx="2.5" fill="#BFE3EC" />
        <rect x="80" y="58" width="16" height="14" rx="2.5" fill="#BFE3EC" />
        <rect x="44" y="60" width="22" height="46" rx="3" fill="#F2A45B" />
      </g>
      <g transform="translate(330,236)">
        <rect x="10" y="24" width="7" height="16" rx="3" fill="#8A6238" />
        <circle cx="13.5" cy="16" r="16" fill="#5FA84D" />
      </g>
      <g transform="translate(950,225)">
        <rect x="9" y="26" width="6" height="14" rx="3" fill="#8A6238" />
        <circle cx="12" cy="16" r="14" fill="#6CB558" />
      </g>
      <g transform="translate(1060,262)">
        <rect x="8" y="20" width="5" height="12" rx="2.5" fill="#8A6238" />
        <circle cx="10.5" cy="13" r="11" fill="#5FA84D" />
      </g>
      <g transform="translate(600,266)">
        <circle cx="14" cy="10" r="10" fill="#F4C9A4" />
        <rect x="4" y="19" width="20" height="30" rx="9" fill="#F94704" />
        <circle cx="40" cy="16" r="8.5" fill="#F4C9A4" />
        <path d="M33,15 a8.5,8.5 0 0 1 14,-2 l-2,-6 a8.5,8.5 0 0 0 -12,2 Z" fill="#DEDEDE" />
        <rect x="32" y="23" width="17" height="26" rx="8" fill="#4E8FA8" />
        <rect x="50" y="26" width="3" height="24" rx="1.5" fill="#8A6238" />
      </g>
    </svg>
  );
}

export function ClosingHill() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1440 170"
      preserveAspectRatio="xMidYMax slice"
      style={{ display: "block", width: "100%", height: "clamp(120px,14vw,170px)" }}
    >
      <path d="M0,90 Q360,20 720,70 T1440,60 L1440,170 0,170 Z" fill="#9BD07C" />
      <path d="M0,130 Q420,70 900,120 T1440,110 L1440,170 0,170 Z" fill="#7CBF5E" />
      <g transform="translate(200,68)">
        <rect x="9" y="26" width="6" height="14" rx="3" fill="#8A6238" />
        <circle cx="12" cy="16" r="14" fill="#5FA84D" />
      </g>
      <g transform="translate(1220,90)">
        <rect x="8" y="20" width="5" height="12" rx="2.5" fill="#8A6238" />
        <circle cx="10.5" cy="13" r="11" fill="#6CB558" />
      </g>
    </svg>
  );
}

export function CompleteHill() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1440 120"
      preserveAspectRatio="xMidYMax slice"
      style={{ display: "block", width: "100%", height: "clamp(80px,10vw,120px)" }}
    >
      <path d="M0,70 Q360,15 720,55 T1440,45 L1440,120 0,120 Z" fill="#9BD07C" />
      <path d="M0,100 Q480,55 960,92 T1440,85 L1440,120 0,120 Z" fill="#7CBF5E" />
      <g transform="translate(240,44)">
        <rect x="9" y="26" width="6" height="14" rx="3" fill="#8A6238" />
        <circle cx="12" cy="16" r="14" fill="#5FA84D" />
      </g>
      <g transform="translate(1160,62)">
        <rect x="8" y="20" width="5" height="12" rx="2.5" fill="#8A6238" />
        <circle cx="10.5" cy="13" r="11" fill="#6CB558" />
      </g>
    </svg>
  );
}

export function HeroDecor() {
  return (
    <>
      <svg aria-hidden="true" style={{ position: "absolute", top: 34, right: "6%", width: 64, height: 64 }} viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="17" fill="#FFC93C" />
        <circle cx="32" cy="32" r="23" fill="none" stroke="#FFC93C" strokeWidth="2.5" strokeDasharray="2 8" strokeLinecap="round" />
      </svg>
      <svg aria-hidden="true" style={{ position: "absolute", top: 56, left: "4%", width: 110, height: 36, opacity: 0.9 }} viewBox="0 0 110 36">
        <ellipse cx="34" cy="24" rx="30" ry="11" fill="#fff" />
        <ellipse cx="66" cy="18" rx="26" ry="12" fill="#fff" />
      </svg>
      <svg aria-hidden="true" style={{ position: "absolute", top: 130, right: "16%", width: 80, height: 28, opacity: 0.75 }} viewBox="0 0 80 28">
        <ellipse cx="26" cy="18" rx="24" ry="9" fill="#fff" />
        <ellipse cx="52" cy="13" rx="22" ry="10" fill="#fff" />
      </svg>
    </>
  );
}
