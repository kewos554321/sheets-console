import { describe, expect, it } from "vitest";
import { buildAuditEvent } from "@/lib/audit";
import { diffFields } from "@/lib/diff";
import type { ProjectFields } from "@/lib/schema";

const before: ProjectFields = {
  project_name: "官網改版",
  client: "Acme",
  status: "active",
  owner: "Ariel",
  amount: 120000,
  notes: "",
};

describe("diffFields", () => {
  it("只回傳變更欄位的前後值", () => {
    const diff = diffFields(before, { ...before, status: "done", amount: 150000 });
    expect(diff).toEqual([
      { field: "status", before: "active", after: "done" },
      { field: "amount", before: 120000, after: 150000 },
    ]);
  });

  it("before 為 null 時列出全部業務欄位", () => {
    expect(diffFields(null, before)).toHaveLength(6);
    expect(diffFields(null, before)[0]).toEqual({ field: "project_name", before: null, after: "官網改版" });
  });

  it("無變更回傳空陣列", () => {
    expect(diffFields(before, { ...before })).toEqual([]);
  });
});

describe("buildAuditEvent", () => {
  it("帶入來源、actor、diff 與 ISO 時間", () => {
    const event = buildAuditEvent({
      rowId: "row-1",
      actorLabel: "demo@example.com",
      source: "ui",
      action: "update",
      before,
      after: { ...before, status: "done" },
      opId: "op-1",
    });

    expect(event.rowId).toBe("row-1");
    expect(event.diff).toEqual([{ field: "status", before: "active", after: "done" }]);
    expect(new Date(event.createdAt).toISOString()).toBe(event.createdAt);
    expect(event.opId).toBe("op-1");
  });
});
