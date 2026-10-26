import { beforeEach, describe, expect, it } from "vitest";
import { FakeSheetRepository } from "@/lib/fake-repository";
import { generateSeedRows, seedRowId } from "@/lib/seed";
import { getStore, resetStore } from "@/lib/store";

const input = {
  project_name: "官網改版",
  client: "Acme",
  status: "active" as const,
  owner: "Ariel",
  amount: 120000,
  notes: "",
};

let repo: FakeSheetRepository;

beforeEach(() => {
  resetStore();
  repo = new FakeSheetRepository(getStore());
});

describe("種子資料", () => {
  it("產生 1000 列且 _row_id 決定性、唯一", () => {
    const rows = generateSeedRows(1000);
    expect(rows).toHaveLength(1000);
    expect(new Set(rows.map((row) => row._row_id)).size).toBe(1000);
    expect(rows[0]._row_id).toBe(seedRowId(1));
    expect(generateSeedRows(3).map((row) => row._row_id)).toEqual(generateSeedRows(3).map((row) => row._row_id));
    expect(rows.every((row) => row._version === 1 && row._deleted === false)).toBe(true);
  });

  it("resetStore 會重建 1000 列", () => {
    expect(getStore().rows.size).toBe(1000);
    getStore().rows.clear();
    resetStore();
    expect(getStore().rows.size).toBe(1000);
  });
});

describe("list / get / create", () => {
  it("list 回傳 1000 列並附 content_hash 與 stale", () => {
    const rows = repo.list();
    expect(rows).toHaveLength(1000);
    expect(rows[0].content_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(rows[0].stale).toBe(false);
  });

  it("get 找不到回傳 undefined", () => {
    expect(repo.get("missing")).toBeUndefined();
  });

  it("create 產生 version 1、稽核與可查到的列", () => {
    const result = repo.create(input, "demo@example.com", "op-1");
    expect(result.row._version).toBe(1);
    expect(result.row._row_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.audit?.action).toBe("create");
    expect(result.audit?.diff).toHaveLength(6);
    expect(repo.list()).toHaveLength(1001);
    expect(repo.get(result.row._row_id)?.project_name).toBe("官網改版");
  });

  it("lastSyncedAt 回傳最新 _updated_at", () => {
    const latest = repo.list().map((row) => row._updated_at).sort().at(-1);
    expect(repo.lastSyncedAt()).toBe(latest);
  });
});

describe("update 樂觀鎖", () => {
  it("版本相符時寫入、版本 +1、產生 update 稽核", () => {
    const created = repo.create(input, "demo@example.com", "op-1").row;
    const result = repo.update(
      created._row_id,
      { ...input, status: "done", version: created._version, baseHash: created.content_hash },
      "demo@example.com",
      "op-2",
    );
    expect(result.row._version).toBe(2);
    expect(result.row.status).toBe("done");
    expect(result.audit?.action).toBe("update");
    expect(result.audit?.diff).toEqual([{ field: "status", before: "active", after: "done" }]);
  });

  it("版本過期時丟 VersionConflictError 且不改資料", () => {
    const created = repo.create(input, "demo@example.com", "op-1").row;
    repo.update(created._row_id, { ...input, status: "done", version: 1, baseHash: created.content_hash }, "demo@example.com", "op-2");
    expect(() =>
      repo.update(created._row_id, { ...input, status: "blocked", version: 1, baseHash: created.content_hash }, "demo@example.com", "op-3"),
    ).toThrowError(/VERSION_CONFLICT/);
    expect(repo.get(created._row_id)?.status).toBe("done");
  });

  it("版本相同但 baseHash 過期時仍衝突（外部改過其他欄位）", () => {
    const created = repo.create(input, "demo@example.com", "op-1").row;
    getStore().rows.set(created._row_id, { ...getStore().rows.get(created._row_id)!, notes: "Sheet 直接改" });
    expect(() =>
      repo.update(created._row_id, { ...input, amount: 1, version: 1, baseHash: created.content_hash }, "demo@example.com", "op-2"),
    ).toThrowError(/VERSION_CONFLICT/);
    expect(repo.get(created._row_id)?.amount).toBe(120000);
  });

  it("無變更回 200 語意：不遞增版本、不寫稽核", () => {
    const created = repo.create(input, "demo@example.com", "op-1").row;
    const beforeAudits = repo.audit(created._row_id).length;
    const result = repo.update(
      created._row_id,
      { ...input, version: 1, baseHash: created.content_hash },
      "demo@example.com",
      "op-2",
    );
    expect(result.row._version).toBe(1);
    expect(result.audit).toBeNull();
    expect(repo.audit(created._row_id)).toHaveLength(beforeAudits);
  });

  it("同一版本連續送出兩次，第二次衝突", () => {
    const created = repo.create(input, "demo@example.com", "op-1").row;
    repo.update(created._row_id, { ...input, status: "done", version: 1, baseHash: created.content_hash }, "demo@example.com", "op-2");
    expect(() =>
      repo.update(created._row_id, { ...input, status: "blocked", version: 1, baseHash: created.content_hash }, "demo@example.com", "op-3"),
    ).toThrowError(/VERSION_CONFLICT/);
  });

  it("找不到列丟 RowNotFoundError", () => {
    expect(() => repo.update("missing", { ...input, version: 1, baseHash: "sha256:x" }, "demo@example.com", "op")).toThrowError(/ROW_NOT_FOUND/);
  });
});
