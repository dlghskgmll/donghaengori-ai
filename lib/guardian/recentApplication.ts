// 같은 브라우저에서 방금 신청한 사람이 신청번호·전화번호를 다시 입력하지 않도록 하는 편의 힌트.
//
// !! 저장소가 아니다 !!
// 신청 데이터 자체는 항상 서버(ApplicationRepository)에서 가져온다.
// 여기에는 조회 요청에 쓸 입력값만 세션 범위로 잠깐 들고 있으며,
// 지워지더라도 신청번호 + 전화번호를 입력하면 동일하게 조회된다.
// sessionStorage를 쓰는 이유는 탭을 닫으면 흔적이 남지 않게 하기 위해서다.

const KEY = "guardian.recentApplication";

export interface RecentApplicationHint {
  applicationNumber: string;
  phone: string;
}

export function rememberApplication(applicationNumber: string, phone: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ applicationNumber, phone }));
  } catch {
    // 시크릿 모드 등에서 실패할 수 있다 — 실패해도 조회 화면에서 직접 입력하면 된다.
  }
}

export function readApplicationHint(): RecentApplicationHint | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RecentApplicationHint>;
    if (!parsed.applicationNumber || !parsed.phone) return null;
    return { applicationNumber: parsed.applicationNumber, phone: parsed.phone };
  } catch {
    return null;
  }
}

export function clearApplicationHint() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* 무시 */
  }
}
