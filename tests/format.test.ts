import { describe, expect, it } from "vitest";
import { formatAmount, formatDateTime } from "@/lib/format";

describe("format", () => {
  it("金額以 NT$ 千分位顯示", () => {
    expect(formatAmount(120000)).toBe("NT$120,000");
    expect(formatAmount(0)).toBe("NT$0");
  });

  it("時間以台北時區顯示且含年份", () => {
    expect(formatDateTime("2026-01-01T00:00:00.000Z")).toMatch(/2026/);
  });
});
