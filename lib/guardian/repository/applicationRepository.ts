// 신청 저장소 경계.
//
// UI·route handler는 이 인터페이스만 알고, 구체 provider(팀 FastAPI / DB)는 모른다.
// 향후 provider를 붙일 때 이 파일은 바뀌지 않는다 — adapter만 추가한다.

import type { GuardianApplication, NewGuardianApplication } from "../domain/application";

export interface ApplicationRepository {
  /** 신청을 저장하고 발급된 신청번호가 포함된 결과를 돌려준다. */
  create(input: NewGuardianApplication): Promise<GuardianApplication>;

  /**
   * 신청번호 + 보호자 전화번호가 모두 일치할 때만 반환한다.
   * 둘 중 하나만 맞는 경우와 둘 다 틀린 경우를 구분하지 않는다(존재 여부 비노출).
   */
  findByApplicationNumberAndPhone(
    applicationNumber: string,
    guardianPhone: string,
  ): Promise<GuardianApplication | null>;

  /** 내부 식별자 조회. 서버 내부에서만 사용한다. */
  findById(id: string): Promise<GuardianApplication | null>;

  /** 담당자 시스템이 상태를 바꿀 때 사용한다. */
  updateStatus(
    id: string,
    status: GuardianApplication["status"],
    infoRequest?: GuardianApplication["infoRequest"],
  ): Promise<GuardianApplication | null>;
}

/** provider가 스스로 영속성을 보장하는지 알린다. 화면에서 정직하게 표시하기 위한 값. */
export interface ApplicationRepositoryInfo {
  /** provider 식별자 (memory | team | ...). */
  readonly provider: string;
  /**
   * 프로세스·기기를 넘어 데이터가 남는지 여부.
   * false면 데모/개발 전용이며 제품 요건(다른 브라우저 조회)을 만족하지 못한다.
   */
  readonly durable: boolean;
}

export type ApplicationRepositoryWithInfo = ApplicationRepository & ApplicationRepositoryInfo;
