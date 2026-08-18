// 진행 상태 타임라인.
//
// 기본 경로는 접수 완료 → 담당자 확인 → 일정 확정 → 동행 완료 4단계다.
// "추가 확인 필요"(NEEDS_INFO)는 고정 단계가 아니라 예외 상태로,
// 담당자 확인 단계 아래에 조건부 알림 카드로만 나타난다.

import { CheckIcon } from "@/components/guardian/ui/Icons";
import {
  PROGRESS_STEPS,
  progressIndexFor,
  type ApplicationInfoRequest,
  type ApplicationStatus,
} from "@/lib/guardian/domain/application";

function InfoRequestCard({ infoRequest }: { infoRequest?: ApplicationInfoRequest }) {
  return (
    <div className="alert-info" role="status">
      <p className="alert-info__title">! 추가 정보가 필요해요</p>
      <p className="alert-info__body">
        {infoRequest?.message ?? "담당자가 몇 가지 내용을 여쭤보기 위해 연락드릴 수 있어요."}
      </p>
    </div>
  );
}

export function StatusTimeline({
  status,
  infoRequest,
}: {
  status: ApplicationStatus;
  infoRequest?: ApplicationInfoRequest;
}) {
  const currentIndex = progressIndexFor(status);
  const needsInfo = status === "NEEDS_INFO";

  return (
    <div className="timeline">
      {PROGRESS_STEPS.map((step, index) => {
        const done = index < currentIndex || status === "COMPLETED";
        const current = !done && index === currentIndex;
        const isLast = index === PROGRESS_STEPS.length - 1;
        return (
          <div key={step.status}>
            <div className="timeline__row">
              <div className="timeline__rail">
                <span
                  className={`timeline__dot${done ? " timeline__dot--done" : current ? " timeline__dot--current" : ""}`}
                >
                  {done ? <CheckIcon size={11} strokeWidth={3.6} /> : null}
                </span>
                {!isLast ? <span className={`timeline__line${done ? " timeline__line--done" : ""}`} /> : null}
              </div>
              <div className="timeline__body">
                <div
                  className={`timeline__label${done ? " timeline__label--done" : current ? " timeline__label--current" : ""}`}
                >
                  {step.label}
                </div>
                {current ? <p className="timeline__desc">{step.desc}</p> : null}
                {done && isLast ? <p className="timeline__desc">{step.desc}</p> : null}
              </div>
            </div>
            {/* NEEDS_INFO: 담당자 확인 단계 바로 아래에만 예외 카드를 끼워 넣는다. */}
            {needsInfo && step.status === "REVIEWING" ? <InfoRequestCard infoRequest={infoRequest} /> : null}
          </div>
        );
      })}
    </div>
  );
}
