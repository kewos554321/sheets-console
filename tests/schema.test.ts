import { describe, expect, it } from "vitest";
import { projectFieldsSchema, updateRowSchema } from "@/lib/schema";

const valid = {
  project_name: "官網改版",
  client: "Acme",
  status: "active" as const,
  owner: "Ariel",
  amount: 120000,
  notes: "",
};

describe("projectFieldsSchema", () => {
  it("接受合法輸入", () => {
    expect(projectFieldsSchema.safeParse(valid).success).toBe(true);
  });

  it("拒絕空白或超長名稱", () => {
    expect(projectFieldsSchema.safeParse({ ...valid, project_name: "   " }).success).toBe(false);
    expect(projectFieldsSchema.safeParse({ ...valid, project_name: "x".repeat(81) }).success).toBe(false);
    expect(projectFieldsSchema.safeParse({ ...valid, client: "" }).success).toBe(false);
    expect(projectFieldsSchema.safeParse({ ...valid, owner: "x".repeat(41) }).success).toBe(false);
    expect(projectFieldsSchema.safeParse({ ...valid, notes: "x".repeat(501) }).success).toBe(false);
  });

  it("拒絕非整數、負數、字串與 NaN 金額", () => {
    expect(projectFieldsSchema.safeParse({ ...valid, amount: -1 }).success).toBe(false);
    expect(projectFieldsSchema.safeParse({ ...valid, amount: 12.5 }).success).toBe(false);
    expect(projectFieldsSchema.safeParse({ ...valid, amount: Number("12,000") }).success).toBe(false);
    expect(projectFieldsSchema.safeParse({ ...valid, amount: "12000" }).success).toBe(false);
    expect(projectFieldsSchema.safeParse({ ...valid, amount: Number.NaN }).success).toBe(false);
  });

  it("拒絕未知狀態", () => {
    expect(projectFieldsSchema.safeParse({ ...valid, status: "archived" }).success).toBe(false);
  });
});

describe("updateRowSchema", () => {
  it("要求 version 與 baseHash", () => {
    expect(updateRowSchema.safeParse(valid).success).toBe(false);
    expect(updateRowSchema.safeParse({ ...valid, version: 1, baseHash: "sha256:abc" }).success).toBe(true);
  });
});
