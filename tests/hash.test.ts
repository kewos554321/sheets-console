import { describe, expect, it } from "vitest";
import { hashFields } from "@/lib/hash";

const fields = {
  project_name: "官網改版",
  client: "Acme",
  status: "active" as const,
  owner: "Ariel",
  amount: 120000,
  notes: "",
};

describe("hashFields", () => {
  it("相同內容得到相同 hash", () => {
    expect(hashFields(fields)).toBe(hashFields({ ...fields }));
  });

  it("任一欄位改變就改變 hash", () => {
    expect(hashFields(fields)).not.toBe(hashFields({ ...fields, notes: "改" }));
    expect(hashFields(fields)).not.toBe(hashFields({ ...fields, amount: 1 }));
  });

  it("輸出為 sha256: 加 64 位小寫 hex", () => {
    expect(hashFields(fields)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
