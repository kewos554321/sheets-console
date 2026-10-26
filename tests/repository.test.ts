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
