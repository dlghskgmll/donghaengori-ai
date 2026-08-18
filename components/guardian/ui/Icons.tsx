// 아티팩트에서 쓰던 stroke 아이콘들. path 데이터를 그대로 옮겼다.

type IconProps = { size?: number; className?: string };

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function CheckIcon({ size = 12, strokeWidth = 3.4 }: IconProps & { strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} stroke="#fff" strokeWidth={strokeWidth} aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

export function ChevronLeftIcon({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={2.2} aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export function PhoneIcon({ size = 14, strokeWidth = 2.2 }: IconProps & { strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} aria-hidden="true">
      <path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 2 .7 2.9a2 2 0 01-.5 2.1L8 10a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.5c.9.3 1.9.6 2.9.7a2 2 0 011.7 2z" />
    </svg>
  );
}

export function DocumentIcon({ size = 26 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={2} aria-hidden="true">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

export function AlertIcon({ size = 28 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={2.4} aria-hidden="true">
      <path d="M12 8v5" />
      <circle cx="12" cy="16.6" r="0.6" fill="currentColor" />
      <path d="M1.6 16.9L10.3 3.4a2 2 0 013.4 0l8.7 13.5a2 2 0 01-1.7 3.1H3.3a2 2 0 01-1.7-3.1z" />
    </svg>
  );
}

export function ShieldCheckIcon({ size = 44 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} stroke="#F94704" strokeWidth={1.8} aria-hidden="true" style={{ marginBottom: 16 }}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export function PersonCheckIcon({ size = 44 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={1.7} aria-hidden="true">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3.5 20c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M15.5 10.5l2 2 4-4.5" />
    </svg>
  );
}

export function FormIcon({ size = 44 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={1.7} aria-hidden="true">
      <rect x="5" y="2.5" width="14" height="19" rx="3" />
      <path d="M9 7h6M9 11h6M9 15h3" />
    </svg>
  );
}

export function PinCheckIcon({ size = 44 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={1.7} aria-hidden="true">
      <path d="M12 21s-7-4.5-7-10a7 7 0 0114 0c0 5.5-7 10-7 10z" />
      <path d="M9.5 11l1.8 1.8 3.4-3.6" />
    </svg>
  );
}

export function ArrowRightIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} stroke="#B5ABA1" strokeWidth={2.4} aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
