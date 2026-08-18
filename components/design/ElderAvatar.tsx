// 어르신 식별용 공통 아바타.
//
// 목적은 장식이 아니라 목록에서 사람을 빠르게 구분하는 것이다.
// 실제 프로필 사진 데이터가 아직 없으므로 성씨 한 글자를 쓰고,
// 이름조차 확인되지 않은 대상자는 중립 인물 아이콘으로 둔다.
// SNS처럼 보이게 하는 요소(랜덤 컬러·상태 점·장식 테두리)는 쓰지 않는다.

import { UserRound } from "lucide-react";

export type ElderAvatarSize = "sm" | "md" | "lg";

const ICON_SIZE: Record<ElderAvatarSize, number> = { sm: 14, md: 16, lg: 22 };

export function ElderAvatar({
  name,
  size = "md",
}: {
  name: string | null | undefined;
  size?: ElderAvatarSize;
}) {
  const initial = name?.trim().charAt(0) ?? "";
  return (
    <span className={`av av--${size}`} aria-hidden="true">
      {initial ? (
        <span className="av__initial">{initial}</span>
      ) : (
        <UserRound size={ICON_SIZE[size]} strokeWidth={1.8} />
      )}
    </span>
  );
}
