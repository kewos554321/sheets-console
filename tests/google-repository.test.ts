import { beforeEach, describe, expect, it } from "vitest";
import type { SheetsGateway } from "@/lib/sheets/gateway";
import { GoogleSheetRepository } from "@/lib/sheets/google-repository";
import { SHEET_HEADERS, rowsToMatrix } from "@/lib/sheets/mapping";
import type { CellUpdate, CellValue, SheetMatrix } from "@/lib/sheets/types";
import type { SheetRow } from "@/lib/schema";

const input = {
  project_name: "官網改版",
  client: "Acme",
  status: "active" as const,
  owner: "Ariel",
  amount: 120000,
  notes: "",
};

const seedRow: SheetRow = {
  ...input,
  _row_id: "id-a",
  _version: 1,
  _updated_at: "2026-01-01T00:00:00.000Z",
  _updated_by: "demo@example.com",
  _op_id: "op-seed",
  _deleted: false,
};

class FakeSheetsGateway implements SheetsGateway {
  matrix: SheetMatrix;
  updates: CellUpdate[] = [];

  constructor(rows: SheetRow[] = []) {
    this.matrix = rows.length > 0 ? rowsToMatrix(rows) : [[...SHEET_HEADERS]];
  }

  async readAll(): Promise<SheetMatrix> {
    return this.matrix.map((row) => [...row]);
  }

  async appendRow(values: CellValue[]): Promise<void> {
    this.matrix.push([...values]);
  }

  async updateCells(updates: CellUpdate[]): Promise<void> {
    for (const update of updates) {
      const row = [...(this.matrix[update.rowNumber - 1] ?? [])];
      row[update.columnIndex] = update.value;
      this.matrix[update.rowNumber - 1] = row;
      this.updates.push(update);
    }
  }

  url(): string {
    return "https://example.test/sheet";
  }
}

let gateway: FakeSheetsGateway;
let repo: GoogleSheetRepository;

beforeEach(() => {
  gateway = new FakeSheetsGateway([seedRow]);
  repo = new GoogleSheetRepository(gateway);
});

async function firstRow() {
  const rows = await repo.list();
  return rows[0];
}

function businessHeaderIndex(header: string): number {
  return SHEET_HEADERS.indexOf(header as (typeof SHEET_HEADERS)[number]);
}

describe("GoogleSheetRepository 讀取", () => {
  it("list 回傳映射後的列與 content_hash", async () => {
    const rows = await repo.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]._row_id).toBe("id-a");
    expect(rows[0].content_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(rows[0].stale).toBe(false);
  });

  it("get 以 _row_id 查找", async () => {
    expect((await repo.get("id-a"))?.project_name).toBe("官網改版");
    expect(await repo.get("missing")).toBeUndefined();
  });

  it("lastSyncedAt 取最新 _updated_at", async () => {
    expect(await repo.lastSyncedAt()).toBe(seedRow._updated_at);
  });
});

describe("GoogleSheetRepository 寫入", () => {
  it("create 以實際 header 順序 append，版本為 1", async () => {
    await repo.create(input, "demo@example.com", "op-1");

    expect(gateway.matrix).toHaveLength(3);
    const appended = gateway.matrix[2];
    expect(appended[businessHeaderIndex("_row_id")]).toMatch(/^[0-9a-f-]{36}$/);
    expect(appended[businessHeaderIndex("_version")]).toBe(1);
    expect(appended[businessHeaderIndex("project_name")]).toBe("官網改版");
  });

  it("create 在欄位順序不同的分頁也能對齊", async () => {
    const headers = [...SHEET_HEADERS].reverse();
    gateway.matrix = [headers];

    await repo.create(input, "demo@example.com", "op-1");

    const appended = gateway.matrix[1];
    expect(appended[headers.indexOf("project_name")]).toBe("官網改版");
    expect(appended[headers.indexOf("_row_id")]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("update 只寫變更的業務欄位與五個中繼欄位", async () => {
    const row = await firstRow();
    gateway.updates = [];

    const result = await repo.update(
      row._row_id,
      { ...input, status: "done", version: row._version, baseHash: row.content_hash },
      "demo@example.com",
      "op-2",
    );

    expect(result.row._version).toBe(2);
    const businessUpdates = gateway.updates.filter((update) =>
      (["project_name", "client", "status", "owner", "amount", "notes"] as string[]).includes(
        SHEET_HEADERS[update.columnIndex],
      ),
    );
    expect(businessUpdates).toEqual([
      { rowNumber: 2, columnIndex: businessHeaderIndex("status"), value: "done" },
    ]);
    expect(gateway.updates).toHaveLength(6);
  });

  it("版本過期時丟 VersionConflictError 且不寫入", async () => {
    const row = await firstRow();
    await repo.update(
      row._row_id,
      { ...input, status: "done", version: 1, baseHash: row.content_hash },
      "demo@example.com",
      "op-2",
    );
    gateway.updates = [];

    await expect(
      repo.update(
        row._row_id,
        { ...input, status: "blocked", version: 1, baseHash: row.content_hash },
        "demo@example.com",
        "op-3",
      ),
    ).rejects.toThrowError(/VERSION_CONFLICT/);

    expect(gateway.updates).toHaveLength(0);
    expect((await firstRow()).status).toBe("done");
  });

  it("版本相同但 Sheet 內容被直接改過時丟衝突", async () => {
    const row = await firstRow();
    const notesIndex = businessHeaderIndex("notes");
    gateway.matrix[1][notesIndex] = "Sheet 直接改";

    await expect(
      repo.update(
        row._row_id,
        { ...input, amount: 1, version: 1, baseHash: row.content_hash },
        "demo@example.com",
        "op-2",
      ),
    ).rejects.toThrowError(/VERSION_CONFLICT/);
    expect((await firstRow()).amount).toBe(120000);
  });

  it("無變更時不寫入、不產生稽核", async () => {
    const row = await firstRow();
    const beforeAudits = (await repo.audit(row._row_id)).length;
    gateway.updates = [];

    const result = await repo.update(
      row._row_id,
      { ...input, version: 1, baseHash: row.content_hash },
      "demo@example.com",
      "op-2",
    );

    expect(result.audit).toBeNull();
    expect(gateway.updates).toHaveLength(0);
    expect(await repo.audit(row._row_id)).toHaveLength(beforeAudits);
  });

  it("resolveConflict 會標記稽核 action", async () => {
    const row = await firstRow();
    const result = await repo.update(
      row._row_id,
      { ...input, status: "done", version: 1, baseHash: row.content_hash, resolveConflict: true },
      "demo@example.com",
      "op-2",
    );
    expect(result.audit?.action).toBe("resolve_conflict");
  });

  it("simulateExternal 不遞增版本、標記 stale 並寫入 external 稽核", async () => {
    const row = await firstRow();
    const result = await repo.simulateExternal(row._row_id);

    expect(result.row._version).toBe(1);
    expect(result.row.status).not.toBe("active");
    expect(result.row.stale).toBe(true);
    expect(result.audit?.source).toBe("external");
    expect(result.audit?.actorLabel).toBe("unknown (Sheet)");
  });

  it("audit 回傳新到舊", async () => {
    const row = await firstRow();
    await repo.simulateExternal(row._row_id);
    const events = await repo.audit(row._row_id);
    expect(events).toHaveLength(1);
    expect(events[0].source).toBe("external");
  });
});

describe("GoogleSheetRepository 併發", () => {
  it("兩個相同基準的更新只有一個成功", async () => {
    const row = await firstRow();
    const results = await Promise.allSettled([
      repo.update(
        row._row_id,
        { ...input, status: "done", version: 1, baseHash: row.content_hash },
        "demo@example.com",
        "op-a",
      ),
      repo.update(
        row._row_id,
        { ...input, status: "blocked", version: 1, baseHash: row.content_hash },
        "demo@example.com",
        "op-b",
      ),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(String((rejected as PromiseRejectedResult).reason)).toMatch(/VERSION_CONFLICT/);
    expect((await firstRow())._version).toBe(2);
  });
});
