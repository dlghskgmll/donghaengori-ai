import Image from "next/image";

/**
 * 홈 상단 hero 일러스트.
 *
 * 디자이너가 준 투명 PNG(395x212)를 그대로 쓴다 — 원본 비율을 유지하도록
 * intrinsic size를 그대로 넘기고, 표시 폭은 CSS(.dch-hero)가 정한다.
 * 장식이므로 alt는 비우고 aria-hidden으로 접근성 트리에서 제외한다.
 */
export function HomeIllustration() {
  return (
    <Image
      src="/admin/donghaengori-care-hero.png"
      alt=""
      aria-hidden="true"
      width={395}
      height={212}
      priority
      className="dch-hero"
    />
  );
}
