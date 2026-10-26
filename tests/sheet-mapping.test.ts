import { describe, expect, it } from "vitest";
import {
  SheetMappingError,
  columnLetter,
  diffToCellUpdates,
  matrixToRows,
  metaCellUpdates,
  parseHeaders,
  rowToArray,
  rowToArrayInHeaderOrder,
} from "@/lib/sheets/mapping";
import { SHEET_HEADERS } from "@/lib/sheets/mapping";
import type { ProjectFields, SheetRow } from "@/lib/schema";

const row: SheetRow = {
  project_name: "官網改版",
  client: "Acme",
  status: "active",
  owner: "Ariel",
  amount: 120000,
  notes: "",
  _row_id: "id-a",
  _version: 1,
  _updated_at: "2026-01-01T00:00:00.000Z",
  _updated_by: "demo@example.com",
  _op_id: "op-1",
  _deleted: false,
};

const before: ProjectFields = {
  project_name: "官網改版",
  client: "Acme",
  status: "active",
  owner: "Ariel",
  amount: 120000,
  notes: "",
};

function matrix(headers: string[], values: (string | number | boolean)[][]): (string | number | boolean)[][] {
  return [headers, ...values];
}

describe("parseHeaders", () => {
  it("接受欄位順序不同，回傳實際位置", () => {
    const headers = [...SHEET_HEADERS].reverse();
    const parsed = parseHeaders([headers]);
    expect(parsed.indexByHeader.project_name).toBe(headers.indexOf("project_name"));
    expect(parsed.indexByHeader._row_id).toBe(headers.indexOf("_row_id"));
  });

  it("缺少必要欄位時列出缺少的名稱", () => {
    const headers = SHEET_HEADERS.filter((header) => header !== "amount" && header !== "owner");
    expect(() => parseHeaders([headers])).toThrowError(SheetMappingError);
    try {
      parseHeaders([headers]);
    } catch (error) {
      expect((error as SheetMappingError).missing).toEqual(["owner", "amount"]);
    }
  });
});

describe("matrixToRows", () => {
  it("轉換型別並跳過空列", () => {
    const rows = matrixToRows(matrix([...SHEET_HEADERS], [[...rowToArray(row)], []]));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(row);
  });

  it("讀取欄位順序不同也能正確映射", () => {
    const headers = [...SHEET_HEADERS].reverse();
    const values = headers.map(
      (header) => (row as unknown as Record<string, string | number | boolean>)[header],
    );
    const rows = matrixToRows(matrix(headers, [values]));
    expect(rows[0]).toEqual(row);
  });

  it("非空列缺少 _row_id 時報錯", () => {
    const values = rowToArray(row);
    values[0] = "";
    expect(() => matrixToRows(matrix([...SHEET_HEADERS], [values]))).toThrowError(/缺少 _row_id/);
  });

  it("重複 _row_id 時報錯", () => {
    expect(() =>
      matrixToRows(matrix([...SHEET_HEADERS], [rowToArray(row), rowToArray(row)])),
    ).toThrowError(/重複/);
  });

  it("未知狀態或非法金額時報錯", () => {
    const badStatus = rowToArray(row);
    badStatus[SHEET_HEADERS.indexOf("status")] = "archived";
    expect(() => matrixToRows(matrix([...SHEET_HEADERS], [badStatus]))).toThrowError(/狀態/);

    const badAmount = rowToArray(row);
    badAmount[SHEET_HEADERS.indexOf("amount")] = "12,000";
    expect(() => matrixToRows(matrix([...SHEET_HEADERS], [badAmount]))).toThrowError(/金額/);
  });
});

describe("寫入 mapping", () => {
  it("rowToArray 依固定 header 順序輸出", () => {
    expect(rowToArray(row)).toEqual([
      "id-a",
      1,
      "2026-01-01T00:00:00.000Z",
      "demo@example.com",
      "op-1",
      false,
      "官網改版",
      "Acme",
      "active",
      "Ariel",
      120000,
      "",
    ]);
  });

  it("rowToArrayInHeaderOrder 依 Sheet 實際欄位順序輸出", () => {
    const headers = ["notes", "_row_id", "amount", "_version"];
    expect(rowToArrayInHeaderOrder(row, headers)).toEqual(["", "id-a", 120000, 1]);
  });

  it("diffToCellUpdates 只回傳變更欄位，位置取自實際 header", () => {
    const headers = ["notes", "status", "amount", "_row_id"];
    const updates = diffToCellUpdates(5, headers, before, { ...before, status: "done", amount: 1 });
    expect(updates).toEqual([
      { rowNumber: 5, columnIndex: 1, value: "done" },
      { rowNumber: 5, columnIndex: 2, value: 1 },
    ]);
  });

  it("metaCellUpdates 寫入五個中繼欄位", () => {
    const headers: string[] = [...SHEET_HEADERS];
    const updates = metaCellUpdates(2, headers, { ...row, _version: 2 });
    expect(updates.map((update) => update.columnIndex)).toEqual(
      ["_version", "_updated_at", "_updated_by", "_op_id", "_deleted"].map((header) =>
        headers.indexOf(header),
      ),
    );
    expect(updates.find((update) => update.columnIndex === headers.indexOf("_version"))?.value).toBe(2);
  });
});

describe("columnLetter", () => {
  it("轉成 A1 notation 的欄位字母", () => {
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(25)).toBe("Z");
    expect(columnLetter(26)).toBe("AA");
  });
});
