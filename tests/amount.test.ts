import { describe, expect, it } from "vitest";
import { parseAmountInput } from "@/lib/amount";

describe("parseAmountInput", () => {
  it("接受整數字串並去除前後空白", () => {
    expect(parseAmountInput(" 12000 ")).toEqual({ value: 12000 });
  });

  it("拒絕空白", () => {
    expect(parseAmountInput("")).toEqual({ error: "金額必須是數字" });
    expect(parseAmountInput("   ")).toEqual({ error: "金額必須是數字" });
  });

  it("拒絕千分位與非數字字串", () => {
    expect(parseAmountInput("12,000")).toEqual({ error: "金額必須是數字" });
    expect(parseAmountInput("abc")).toEqual({ error: "金額必須是數字" });
  });

  it("小數交由 schema 判斷整數", () => {
    expect(parseAmountInput("12.5")).toEqual({ value: 12.5 });
  });
});
