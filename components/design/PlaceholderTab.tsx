"use client";

interface PlaceholderTabProps {
  title: string;
  description: string;
}

// 디자인에는 있으나 아직 backend가 없는 탭. 가짜 데이터로 동작하는 것처럼
// 보이게 만들지 않는다 — 시각적 shell과 안내만 둔다.
export function PlaceholderTab({ title, description }: PlaceholderTabProps) {
  return (
    <main className="dc-detail">
      <div className="dc-detail-head">
        <span className="dc-detail-name">{title}</span>
      </div>
      <div className="dc-placeholder">
        <p>{description}</p>
        <p className="dc-placeholder-note">
          이 화면은 아직 실제 데이터와 연결되지 않았습니다.
        </p>
      </div>
    </main>
  );
}
