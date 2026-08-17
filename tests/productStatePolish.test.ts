import { describe, expect, it } from "vitest";
import {
  filterRequestRows,
  requestListEmptyMessage,
  type RequestRow,
} from "../components/design/RequestList";
import { profileListEmptyMessage } from "../components/design/ElderWorkspace";

describe("U10 product state polish", () => {
  it("U10-01 전체 목록이 비었을 때만 신규 접수 안내를 한다", () => {
    expect(requestListEmptyMessage("all", false)).toContain("아직 저장된 요청");
  });

  it("U10-02 확인 필요 필터 0건은 데이터 전체가 없다고 말하지 않는다", () => {
    expect(requestListEmptyMessage("todo", false)).toBe(
      "확인이 필요한 요청이 없습니다.",
    );
  });

  it("U10-03 확정 필터 0건은 필터 결과를 정확히 설명한다", () => {
    expect(requestListEmptyMessage("done", false)).toBe(
      "확정된 요청이 없습니다.",
    );
  });

  it("U10-04 backend 오류는 필터 empty로 위장하지 않는다", () => {
    expect(requestListEmptyMessage("done", true)).toBe(
      "저장된 요청을 표시할 수 없습니다.",
    );
  });

  it("U10-05 loading은 empty로 표현하지 않는다", () => {
    expect(requestListEmptyMessage("all", false, true)).toBe(
      "요청 목록을 불러오는 중입니다.",
    );
  });

  it("U10-06 검색하지 않은 대상자 0명을 검색 결과 없음으로 말하지 않는다", () => {
    expect(profileListEmptyMessage("")).toBe("등록된 대상자가 없습니다.");
    // 공백만 친 것도 검색으로 치지 않는다.
    expect(profileListEmptyMessage("   ")).toBe("등록된 대상자가 없습니다.");
  });

  it("U10-07 검색어가 있을 때만 검색 결과가 없다고 말한다", () => {
    expect(profileListEmptyMessage("박순자")).toBe("검색 결과가 없습니다.");
  });

  it("U10-08 확인할 항목이 없다고 확정으로 분류하지 않는다", () => {
    const rows: RequestRow[] = [
      // 확인 필요가 없을 뿐 사람이 아직 확정하지 않은 접수
      { id: "saved-1", title: "박순자", line2: "", meta: "", badge: null, confirmed: false },
      { id: "saved-2", title: "김말자", line2: "", meta: "", badge: null, confirmed: true },
    ];
    expect(filterRequestRows(rows, "done").map((row) => row.id)).toEqual([
      "saved-2",
    ]);
  });

  it("U10-09 미리보기는 확정 목록에 들어가지 않는다", () => {
    const rows: RequestRow[] = [
      { id: "preview-1", title: "미리보기", line2: "", meta: "", badge: "미리보기" },
    ];
    expect(filterRequestRows(rows, "done")).toEqual([]);
  });

  it("U10-10 확인 필요 필터는 확인 필요·긴급만 고른다", () => {
    const rows: RequestRow[] = [
      { id: "a", title: "", line2: "", meta: "", badge: "확인 필요" },
      { id: "b", title: "", line2: "", meta: "", badge: "긴급" },
      { id: "c", title: "", line2: "", meta: "", badge: null, confirmed: true },
    ];
    expect(filterRequestRows(rows, "todo").map((row) => row.id)).toEqual([
      "a",
      "b",
    ]);
  });
});
